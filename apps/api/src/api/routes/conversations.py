import json
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.agent.loop import RateLimitedError, SessionBusyError, TurnEvent
from api.agent.state import FlowState, Language, Session
from api.services import Deps

log = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["conversations"])


class StartRequest(BaseModel):
    language: Language = "en"


class SessionOut(BaseModel):
    session_id: str
    language: Language
    flow_state: FlowState
    turn: int
    order_id: str | None


def _out(s: Session) -> SessionOut:
    return SessionOut(session_id=s.id, language=s.language, flow_state=s.flow_state, turn=s.turn, order_id=s.order_id)


class TurnRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("", status_code=201)
def start(svc: Deps, body: StartRequest | None = None) -> SessionOut:
    return _out(svc.agent.start((body or StartRequest()).language))


@router.get("/{session_id}")
def get_session(svc: Deps, session_id: str) -> SessionOut:
    session = svc.agent.sessions.get(session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    return _out(session)


def _sse(ev: TurnEvent) -> bytes:
    return f"event: {ev.event}\ndata: {json.dumps(ev.data, ensure_ascii=False)}\n\n".encode()


@router.post("/{session_id}/turns", response_class=StreamingResponse)
async def turn(svc: Deps, session_id: str, body: TurnRequest) -> StreamingResponse:
    """Server-sent events: `delta` (reply text chunks), `tool` (tool started), `turn` (final payload), `error`."""
    session = svc.agent.sessions.get(session_id)
    if session is None:
        raise HTTPException(404, "session not found")

    events = svc.agent.run_turn(session, body.text.strip())
    try:
        first = await anext(events)
    except RateLimitedError as e:
        raise HTTPException(429, str(e)) from e
    except SessionBusyError as e:
        raise HTTPException(409, str(e)) from e

    async def stream() -> AsyncIterator[bytes]:
        yield _sse(first)
        try:
            async for ev in events:
                yield _sse(ev)
        except Exception:
            log.exception("turn_stream_crashed session=%s", session_id)
            yield _sse(TurnEvent("error", {"code": "internal", "message": "turn failed"}))
        finally:
            await events.aclose()

    return StreamingResponse(
        stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
