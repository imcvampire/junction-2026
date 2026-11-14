from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(UTC)


class OrderStatus(StrEnum):
    # DRAFT and AGREED belong to the retired buyer flow; kept so older rows still load.
    DRAFT = "draft"
    AGREED = "agreed"
    PLACED = "placed"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"


Actor = Literal["agent", "buyer", "approver", "system"]
ConfirmedVia = Literal["rest", "mcp_elicitation"]


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
    missing_requirements: list[str] = Field(default_factory=list[str])


class DecidedBy(BaseModel):
    agent_id: str
    name: str


class OrderDecision(BaseModel):
    approved: bool
    reason: str
    at: datetime
    decided_by: DecidedBy | None = Field(
        default=None,
        description="The agent the human decided through; unset on older orders and on orders the system "
        "closed because they could no longer be delivered",
    )


class Order(BaseModel):
    id: str
    session_id: str | None = None
    agent_id: str | None = None
    quote_id: str | None = None
    client_reference: str | None = None
    status: OrderStatus
    customer: str
    delivery_date: date
    currency: str
    lines: list[OrderLine]
    total: float
    preferences: list[str]
    purpose: str | None = None
    quoted_at: datetime
    created_at: datetime
    updated_at: datetime
    approval_reasons: list[str] = Field(default_factory=list[str])
    decision: OrderDecision | None = None


class AuditEntry(BaseModel):
    order_id: str
    at: datetime
    actor: Actor
    action: str
    summary: str
    agent_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict[str, Any])


class Decision(BaseModel):
    reason: str = Field(
        default="", max_length=1000, description="Why the order is approved or rejected; required to reject"
    )
    expected_total: float | None = Field(
        default=None,
        gt=0,
        description="Approve only: the total the human saw. Required after a price_changed refusal; "
        "a mismatch with the current total is refused again",
    )
