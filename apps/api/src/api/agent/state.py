"""Conversation session state and the turn response contract shared with the mobile app."""

import uuid
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field

from api.orders.models import Order, utcnow
from api.orders.store import Store

# Mirrors the conversation diagram. Until the product owner's diagram lands this is the working flow;
# new states only need a prompt section and the tool effects that enter them.
FlowState = Literal["gathering", "proposing", "confirming", "ar_offered", "placed", "escalated"]
Language = Literal["en", "fi", "sv"]

MAX_STORED_MESSAGES = 60


class Offer(BaseModel):
    product_id: str
    name: str
    brand: str | None
    sales_unit: str
    content_per_sales_unit: str | None
    quantity: float | None = None
    unit_price: float | None
    line_total: float | None = None
    currency: str
    available_amount: float | None
    available_date: date | None
    covers_request: bool | None = None
    delivery_reliability: float | None
    co2_kg_per_sales_unit: float | None


class Action(BaseModel):
    type: Literal["offer_ar", "show_order"]
    order_id: str


class TurnResult(BaseModel):
    session_id: str
    turn: int
    reply_text: str
    flow_state: FlowState
    offers: list[Offer] = Field(default_factory=list[Offer])
    order: Order | None = None
    actions: list[Action] = Field(default_factory=list[Action])


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0


class Session(BaseModel):
    id: str
    language: Language = "en"
    flow_state: FlowState = "gathering"
    turn: int = 0
    order_id: str | None = None
    # Buyer requirements seen in this request (search filters), enforced on every drafted line.
    requirements: list[str] = Field(default_factory=list[str])
    messages: list[dict[str, Any]] = Field(default_factory=list[dict[str, Any]])
    usage: Usage = Field(default_factory=Usage)

    def last_user_texts(self, n: int = 3) -> str:
        texts = [str(m.get("content", "")) for m in self.messages if m.get("role") == "user"]
        return " / ".join(texts[-n:])

    def trim(self) -> None:
        """Drop the oldest exchanges, cutting only at a user message so tool-call pairs stay intact."""
        if len(self.messages) <= MAX_STORED_MESSAGES:
            return
        start = len(self.messages) - MAX_STORED_MESSAGES
        while start < len(self.messages) and self.messages[start].get("role") != "user":
            start += 1
        self.messages = self.messages[start:]


class SessionStore:
    def __init__(self, store: Store) -> None:
        self._store = store

    def create(self, language: Language) -> Session:
        session = Session(id=f"ses_{uuid.uuid4().hex[:16]}", language=language)
        self.save(session)
        return session

    def get(self, session_id: str) -> Session | None:
        data = self._store.get_session(session_id)
        return Session.model_validate(data) if data else None

    def save(self, session: Session) -> None:
        session.trim()
        self._store.put_session(session.id, session.model_dump(mode="json"), utcnow().isoformat())
