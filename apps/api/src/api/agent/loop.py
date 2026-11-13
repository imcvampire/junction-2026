"""Agent turn loop: stream LLM output, run tools, persist state, emit the turn contract."""

import asyncio
import json
import logging
import time
from collections import defaultdict, deque
from collections.abc import AsyncGenerator, AsyncIterator, Callable
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Protocol, cast
from zoneinfo import ZoneInfo

from openai import APIError, AsyncOpenAI, AsyncStream
from openai.types.chat import ChatCompletionChunk

from api.agent import tools
from api.agent.prompts import system_prompt
from api.agent.state import Language, Session, SessionStore, TurnResult
from api.catalog.index import Catalog
from api.orders.service import OrderService
from api.valio.client import ValioClient

log = logging.getLogger(__name__)

HELSINKI = ZoneInfo("Europe/Helsinki")


@dataclass(frozen=True, slots=True)
class TextDelta:
    text: str


@dataclass(frozen=True, slots=True)
class ReasoningDelta:
    text: str


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    arguments: str


@dataclass(frozen=True, slots=True)
class UsageReport:
    prompt_tokens: int
    completion_tokens: int


ChatEvent = TextDelta | ReasoningDelta | ToolCall | UsageReport


class ChatModel(Protocol):
    def stream(
        self, messages: list[dict[str, Any]], tool_schemas: list[dict[str, Any]] | None
    ) -> AsyncIterator[ChatEvent]: ...


class LLMUnavailableError(Exception):
    pass


class OpenAIChatModel:
    """OpenAI-compatible chat completions (Verda inference). Reply text may arrive in `reasoning_content`."""

    def __init__(self, client: AsyncOpenAI | None, model: str) -> None:
        self._client = client
        self._model = model

    async def stream(
        self, messages: list[dict[str, Any]], tool_schemas: list[dict[str, Any]] | None
    ) -> AsyncIterator[ChatEvent]:
        if self._client is None:
            raise LLMUnavailableError("LLM endpoint not configured (OPENAI_COMPATIBLE_URL / _API_KEY)")
        kwargs: dict[str, Any] = {"model": self._model, "messages": messages, "stream": True}
        kwargs["stream_options"] = {"include_usage": True}
        if tool_schemas:
            kwargs["tools"] = tool_schemas
            kwargs["tool_choice"] = "auto"
        try:
            stream = cast(AsyncStream[ChatCompletionChunk], await self._client.chat.completions.create(**kwargs))
            pending: dict[int, dict[str, str]] = {}
            async for chunk in stream:
                if chunk.usage:
                    yield UsageReport(chunk.usage.prompt_tokens, chunk.usage.completion_tokens)
                for choice in chunk.choices:
                    delta = choice.delta
                    if delta.content:
                        yield TextDelta(delta.content)
                    reasoning = (delta.model_extra or {}).get("reasoning_content")
                    if isinstance(reasoning, str) and reasoning:
                        yield ReasoningDelta(reasoning)
                    for tc in delta.tool_calls or []:
                        slot = pending.setdefault(tc.index, {"id": "", "name": "", "arguments": ""})
                        if tc.id:
                            slot["id"] = tc.id
                        if tc.function and tc.function.name:
                            slot["name"] += tc.function.name
                        if tc.function and tc.function.arguments:
                            slot["arguments"] += tc.function.arguments
            for i in sorted(pending):
                slot = pending[i]
                yield ToolCall(slot["id"] or f"call_{i}", slot["name"], slot["arguments"])
        except APIError as e:
            log.warning("llm_error status=%s message=%s", getattr(e, "status_code", None), str(e)[:200])
            raise LLMUnavailableError("LLM request failed") from e


@dataclass(frozen=True, slots=True)
class TurnEvent:
    event: str  # "delta" | "tool" | "turn" | "error"
    data: dict[str, Any]


class SessionBusyError(Exception):
    pass


class RateLimitedError(Exception):
    pass


class Agent:
    def __init__(
        self,
        *,
        sessions: SessionStore,
        model: ChatModel,
        catalog: Catalog,
        valio: ValioClient,
        orders: OrderService,
        max_tool_rounds: int,
        turns_per_minute: int,
        ar_max_stack_m: float,
        today: Callable[[], date] | None = None,
    ) -> None:
        self.sessions = sessions
        self._model = model
        self._catalog = catalog
        self._valio = valio
        self._orders = orders
        self._max_rounds = max_tool_rounds
        self._turns_per_minute = turns_per_minute
        self._ar_max_stack_m = ar_max_stack_m
        self._today = today or (lambda: datetime.now(HELSINKI).date())
        self._locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._recent: defaultdict[str, deque[float]] = defaultdict(deque)

    def start(self, language: Language) -> Session:
        return self.sessions.create(language)

    def _admit(self, session_id: str) -> asyncio.Lock:
        now = time.monotonic()
        window = self._recent[session_id]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= self._turns_per_minute:
            raise RateLimitedError("too many turns; slow down")
        lock = self._locks[session_id]
        if lock.locked():
            raise SessionBusyError("a turn is already running for this session")
        window.append(now)
        return lock

    async def run_turn(self, session: Session, text: str) -> AsyncGenerator[TurnEvent]:
        lock = self._admit(session.id)
        async with lock:
            async for ev in self._run(session, text):
                yield ev

    def _commit(self, session: Session, effects: tools.TurnEffects, prompt_tokens: int, completion_tokens: int) -> None:
        if effects.flow_state:
            session.flow_state = effects.flow_state
        session.usage.prompt_tokens += prompt_tokens
        session.usage.completion_tokens += completion_tokens
        self.sessions.save(session)

    async def _run(self, session: Session, text: str) -> AsyncIterator[TurnEvent]:
        started = time.monotonic()
        session.turn += 1
        session.messages.append({"role": "user", "content": text})
        log.info("turn_start session=%s turn=%d transcript=%r", session.id, session.turn, text[:500])

        ctx = tools.ToolContext(
            session=session,
            catalog=self._catalog,
            valio=self._valio,
            orders=self._orders,
            ar_max_stack_m=self._ar_max_stack_m,
        )
        schemas = [t.schema() for t in tools.TOOLS.values()]
        spoken: list[str] = []
        prompt_tokens = completion_tokens = 0
        failed = False

        try:
            for round_no in range(self._max_rounds + 1):
                messages = [
                    {
                        "role": "system",
                        "content": system_prompt(session, self._today(), self._orders.policy.spend_threshold),
                    },
                    *session.messages,
                ]
                content: list[str] = []
                reasoning: list[str] = []
                calls: list[ToolCall] = []
                offer_tools = round_no < self._max_rounds
                async for ev in self._model.stream(messages, schemas if offer_tools else None):
                    match ev:
                        case TextDelta(text=t):
                            content.append(t)
                            yield TurnEvent("delta", {"text": t})
                        case ReasoningDelta(text=t):
                            reasoning.append(t)
                        case ToolCall():
                            calls.append(ev)
                        case UsageReport(prompt_tokens=p, completion_tokens=c):
                            prompt_tokens += p
                            completion_tokens += c

                reply = "".join(content).strip()
                if not reply and not calls and reasoning:
                    reply = "".join(reasoning).strip()
                    yield TurnEvent("delta", {"text": reply})
                if reply:
                    spoken.append(reply)

                assistant: dict[str, Any] = {"role": "assistant", "content": reply or None}
                if calls:
                    assistant["tool_calls"] = [
                        {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": c.arguments}}
                        for c in calls
                    ]
                session.messages.append(assistant)
                if not calls:
                    break

                for call in calls:
                    yield TurnEvent("tool", {"name": call.name})
                    result = await tools.execute(ctx, call.name, call.arguments)
                    log.info(
                        "tool_call session=%s turn=%d tool=%s error=%s",
                        session.id,
                        session.turn,
                        call.name,
                        result.get("error"),
                    )
                    session.messages.append(
                        {"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, default=str)}
                    )
        except LLMUnavailableError as e:
            failed = True
            log.warning("turn_failed session=%s turn=%d error=%s", session.id, session.turn, e)
            apology = _APOLOGY[session.language]
            spoken.append(apology)
            session.messages.append({"role": "assistant", "content": apology})
            yield TurnEvent("error", {"code": "llm_unavailable", "message": str(e)})
        except BaseException:
            # Client disconnects cancel the generator mid-turn; orders created so far are committed,
            # so the session must still remember them.
            self._commit(session, ctx.effects, prompt_tokens, completion_tokens)
            raise

        effects = ctx.effects
        self._commit(session, effects, prompt_tokens, completion_tokens)

        order = effects.order
        if order is None and session.order_id:
            order = self._orders.get(session.order_id)
        result = TurnResult(
            session_id=session.id,
            turn=session.turn,
            reply_text=" ".join(spoken),
            flow_state=session.flow_state,
            offers=effects.offers,
            order=order,
            actions=effects.actions,
        )
        log.info(
            "turn_done session=%s turn=%d flow=%s failed=%s prompt_tokens=%d completion_tokens=%d ms=%d",
            session.id,
            session.turn,
            session.flow_state,
            failed,
            prompt_tokens,
            completion_tokens,
            round((time.monotonic() - started) * 1000),
        )
        yield TurnEvent("turn", result.model_dump(mode="json"))


_APOLOGY: dict[str, str] = {
    "en": "Sorry, I can't reach the ordering assistant right now. Please try again in a moment.",
    "fi": "Pahoittelut, tilausavustaja ei ole juuri nyt tavoitettavissa. Yritä hetken päästä uudelleen.",
    "sv": "Tyvärr når jag inte beställningsassistenten just nu. Försök igen om en stund.",
}
