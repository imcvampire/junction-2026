from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(UTC)


class OrderStatus(StrEnum):
    DRAFT = "draft"
    AGREED = "agreed"
    PLACED = "placed"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"


Actor = Literal["agent", "buyer", "approver", "system"]


class OrderLineRequest(BaseModel):
    product_id: str = Field(min_length=1, max_length=32)
    quantity: float = Field(gt=0, le=100_000, description="Quantity in the product's sales unit")
    substitute_for: str | None = Field(
        default=None, max_length=32, description="Product id the buyer originally asked for, if this is a substitute"
    )


class Candidate(BaseModel):
    product_id: str = Field(max_length=32)
    note: str = Field(default="", max_length=300)


class DraftRequest(BaseModel):
    delivery_date: date
    lines: list[OrderLineRequest] = Field(min_length=1, max_length=50)
    preferences: list[str] = Field(
        default_factory=list[str],
        max_length=20,
        description="Buyer-stated requirements as catalog tags, e.g. LACTOSE_FREE, VEGAN, FREE_FROM:AM, brand:Valio",
    )
    request_text: str = Field(default="", max_length=2000)
    candidates: list[Candidate] = Field(default_factory=list[Candidate], max_length=50)
    reason: str = Field(default="", max_length=1000)
    session_id: str | None = None


class OrderLine(BaseModel):
    product_id: str
    name: str
    quantity: float
    sales_unit: str
    unit_price: float
    line_total: float
    available_amount: float | None
    available_date: date | None
    covers_request: bool
    substitute_for: str | None = None
    within_preferences: bool = True


class Order(BaseModel):
    id: str
    session_id: str | None
    status: OrderStatus
    customer: str
    delivery_date: date
    currency: str
    lines: list[OrderLine]
    total: float
    preferences: list[str]
    quoted_at: datetime
    created_at: datetime
    updated_at: datetime
    approval_reasons: list[str] = Field(default_factory=list[str])
    created_turn: int | None = None
    agreed_turn: int | None = None


class AuditEntry(BaseModel):
    order_id: str
    at: datetime
    actor: Actor
    action: str
    summary: str
    details: dict[str, Any] = Field(default_factory=dict[str, Any])


class Decision(BaseModel):
    reason: str = Field(default="", max_length=1000)
