"""Order lifecycle: draft -> agreed -> placed | pending_approval -> approved | rejected.

Prices are fixed at quote time. Placement re-quotes and refuses if anything moved, so the buyer
always confirms the exact price they pay.
"""

import asyncio
import logging
import math
import uuid
from collections import defaultdict
from collections.abc import Callable
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from api.catalog.index import Catalog, Product
from api.orders.models import (
    Actor,
    AuditEntry,
    DraftRequest,
    Order,
    OrderLine,
    OrderStatus,
    utcnow,
)
from api.orders.policy import ApprovalPolicy
from api.orders.store import Store
from api.valio.client import ProductQuote, ValioClient

log = logging.getLogger(__name__)

_PRICE_EPSILON = 1e-6
_HELSINKI = ZoneInfo("Europe/Helsinki")


class OrderError(Exception):
    def __init__(self, code: str, message: str, *, status: int = 409, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}


class OrderService:
    def __init__(
        self,
        store: Store,
        catalog: Catalog,
        valio: ValioClient,
        policy: ApprovalPolicy,
        customer: str,
        today: Callable[[], date] | None = None,
    ) -> None:
        self._today = today or (lambda: datetime.now(_HELSINKI).date())
        self._store = store
        self._catalog = catalog
        self._valio = valio
        self._policy = policy
        self._customer = customer
        self._locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    @property
    def policy(self) -> ApprovalPolicy:
        return self._policy

    def get(self, order_id: str) -> Order:
        order = self._store.get_order(order_id)
        if order is None:
            raise OrderError("order_not_found", f"Order {order_id} not found", status=404)
        return order

    def list_for_session(self, session_id: str) -> list[Order]:
        return self._store.list_orders(session_id)

    def audit(self, order_id: str) -> list[AuditEntry]:
        self.get(order_id)
        return self._store.audit(order_id)

    async def create_draft(self, req: DraftRequest, *, actor: Actor = "agent", turn: int | None = None) -> Order:
        if req.delivery_date < self._today():
            raise OrderError("invalid_date", f"Delivery date {req.delivery_date} is in the past", status=422)
        products: dict[str, Product] = {}
        for line in req.lines:
            p = self._catalog.get(line.product_id)
            if p is None:
                raise OrderError("unknown_product", f"Unknown product {line.product_id}", status=422)
            steps = line.quantity / p.allowed_lot_size
            if not math.isclose(steps, round(steps), abs_tol=1e-6):
                raise OrderError(
                    "invalid_quantity",
                    f"{p.name}: quantity must be a multiple of {p.allowed_lot_size} {p.sales_unit}",
                    status=422,
                )
            products[p.id] = p

        quotes = await self._valio.quote(list(products), req.delivery_date)
        lines: list[OrderLine] = []
        problems: list[dict[str, Any]] = []
        for line in req.lines:
            p = products[line.product_id]
            q = quotes[p.id]
            if q.unit_price is None:
                problems.append({"product_id": p.id, "name": p.name, "problem": "no_price"})
                continue
            covers = q.covers(line.quantity, req.delivery_date)
            if not covers:
                problems.append(_availability_problem(p.id, p.name, line.quantity, q))
            lines.append(
                OrderLine(
                    product_id=p.id,
                    name=p.name,
                    quantity=line.quantity,
                    sales_unit=p.sales_unit,
                    unit_price=q.unit_price,
                    line_total=round(q.unit_price * line.quantity, 2),
                    available_amount=None if q.unlimited_stock else q.available_amount,
                    available_date=q.available_date,
                    covers_request=covers,
                    substitute_for=line.substitute_for,
                    within_preferences=p.has_tags(req.preferences),
                )
            )
        if problems:
            raise OrderError(
                "not_deliverable",
                "Some lines cannot be delivered as requested; propose alternatives",
                status=409,
                details={"lines": problems},
            )

        now = utcnow()
        currency = next(iter(quotes.values())).currency
        order = Order(
            id=f"ord_{uuid.uuid4().hex[:12]}",
            session_id=req.session_id,
            status=OrderStatus.DRAFT,
            customer=self._customer,
            delivery_date=req.delivery_date,
            currency=currency,
            lines=lines,
            total=round(sum(line.line_total for line in lines), 2),
            preferences=req.preferences,
            quoted_at=now,
            created_at=now,
            updated_at=now,
            created_turn=turn,
        )
        order.approval_reasons = self._policy.evaluate(order)
        summary = "; ".join(f"{li.quantity:g} {li.sales_unit} {li.name} @ {li.unit_price:.2f}" for li in lines)
        self._store.save_order(
            order,
            [
                AuditEntry(
                    order_id=order.id,
                    at=now,
                    actor=actor,
                    action="draft_created",
                    summary=f"Drafted {summary}; total {order.total:.2f} {currency}",
                    details={
                        "request": req.request_text,
                        "preferences": req.preferences,
                        "candidates_considered": [c.model_dump() for c in req.candidates],
                        "choice": [li.model_dump(mode="json") for li in lines],
                        "reason": req.reason,
                        "needs_approval_if_placed": order.approval_reasons,
                    },
                )
            ],
        )
        log.info("order_draft_created order_id=%s total=%.2f lines=%d", order.id, order.total, len(lines))
        return order

    async def agree(self, order_id: str, *, actor: Actor = "buyer", note: str = "", turn: int | None = None) -> Order:
        async with self._locks[order_id]:
            order = self.get(order_id)
            if order.status == OrderStatus.AGREED:
                return order
            _require(order, OrderStatus.DRAFT)
            short = [li.name for li in order.lines if not li.covers_request]
            if short:
                raise OrderError(
                    "not_deliverable",
                    f"Cannot agree: {', '.join(short)} can no longer be delivered as requested",
                    details={"lines": short},
                )
            order.agreed_turn = turn
            return self._transition(
                order, OrderStatus.AGREED, actor, "buyer_agreed", note or "Buyer agreed to the draft"
            )

    async def place(self, order_id: str, *, actor: Actor = "agent", turn: int | None = None) -> Order:
        async with self._locks[order_id]:
            order = self.get(order_id)
            if order.status in (OrderStatus.PLACED, OrderStatus.PENDING_APPROVAL):
                return order
            _require(order, OrderStatus.AGREED)

            codes = [li.product_id for li in order.lines]
            self._valio.invalidate(codes, order.delivery_date)
            quotes = await self._valio.quote(codes, order.delivery_date)
            changes = _quote_changes(order, quotes)
            if changes:
                # Re-draft at the new quote so the buyer hears and confirms the current price.
                _apply_quotes(order, quotes)
                order.status = OrderStatus.DRAFT
                order.created_turn = turn
                order.agreed_turn = None
                order.approval_reasons = self._policy.evaluate(order)
                order.updated_at = order.quoted_at = utcnow()
                self._store.save_order(
                    order,
                    [
                        AuditEntry(
                            order_id=order.id,
                            at=order.updated_at,
                            actor="system",
                            action="requote_mismatch",
                            summary="Price or availability changed since the quote; buyer must re-confirm",
                            details={"changes": changes},
                        )
                    ],
                )
                raise OrderError(
                    "quote_changed",
                    "Price or availability changed since the buyer agreed; read the updated draft back and "
                    "re-confirm with the buyer",
                    details={"changes": changes, "order": order.model_dump(mode="json")},
                )

            reasons = self._policy.evaluate(order)
            order.approval_reasons = reasons
            if reasons:
                return self._transition(
                    order,
                    OrderStatus.PENDING_APPROVAL,
                    actor,
                    "escalated",
                    "Needs human approval: " + "; ".join(reasons),
                    {"reasons": reasons},
                )
            return self._transition(
                order,
                OrderStatus.PLACED,
                actor,
                "placed",
                f"Placed within the buyer's authority at {order.total:.2f} {order.currency}",
                {"threshold": self._policy.spend_threshold},
            )

    async def decide(self, order_id: str, *, approve: bool, reason: str, actor: Actor = "approver") -> Order:
        async with self._locks[order_id]:
            order = self.get(order_id)
            target = OrderStatus.APPROVED if approve else OrderStatus.REJECTED
            if order.status == target:
                return order
            _require(order, OrderStatus.PENDING_APPROVAL)
            verb = "Approved" if approve else "Rejected"
            return self._transition(
                order, target, actor, target.value, f"{verb} by approver" + (f": {reason}" if reason else "")
            )

    def _transition(
        self,
        order: Order,
        status: OrderStatus,
        actor: Actor,
        action: str,
        summary: str,
        details: dict[str, Any] | None = None,
    ) -> Order:
        previous = order.status
        order.status = status
        order.updated_at = utcnow()
        self._store.save_order(
            order,
            [
                AuditEntry(
                    order_id=order.id,
                    at=order.updated_at,
                    actor=actor,
                    action=action,
                    summary=summary,
                    details={"from": previous.value, "to": status.value, **(details or {})},
                )
            ],
        )
        log.info("order_transition order_id=%s %s->%s actor=%s", order.id, previous.value, status.value, actor)
        return order


def _require(order: Order, status: OrderStatus) -> None:
    if order.status != status:
        raise OrderError(
            "invalid_state", f"Order {order.id} is {order.status.value}; expected {status.value}", status=409
        )


def _availability_problem(product_id: str, name: str, quantity: float, q: ProductQuote) -> dict[str, Any]:
    return {
        "product_id": product_id,
        "name": name,
        "problem": "sales_block" if q.sales_block else "not_available_in_time",
        "requested_quantity": quantity,
        "available_amount": None if q.unlimited_stock else q.available_amount,
        "earliest_date": q.available_date.isoformat() if q.available_date else None,
    }


def _apply_quotes(order: Order, quotes: dict[str, ProductQuote]) -> None:
    for line in order.lines:
        q = quotes.get(line.product_id)
        if q is None or q.unit_price is None:
            line.covers_request = False
            continue
        line.unit_price = q.unit_price
        line.line_total = round(q.unit_price * line.quantity, 2)
        line.available_amount = None if q.unlimited_stock else q.available_amount
        line.available_date = q.available_date
        line.covers_request = q.covers(line.quantity, order.delivery_date)
    order.total = round(sum(li.line_total for li in order.lines), 2)


def _quote_changes(order: Order, quotes: dict[str, ProductQuote]) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    for line in order.lines:
        q = quotes.get(line.product_id)
        if q is None or q.unit_price is None:
            changes.append({"product_id": line.product_id, "problem": "no_price"})
            continue
        if abs(q.unit_price - line.unit_price) > _PRICE_EPSILON:
            changes.append(
                {"product_id": line.product_id, "problem": "price_changed", "was": line.unit_price, "now": q.unit_price}
            )
        if not q.covers(line.quantity, order.delivery_date):
            changes.append(_availability_problem(line.product_id, line.name, line.quantity, q))
    return changes


def render_audit_text(order: Order, entries: list[AuditEntry]) -> str:
    out = [
        f"Order {order.id} — {order.status.value.replace('_', ' ')}",
        f"Delivery {order.delivery_date.isoformat()} · total {order.total:.2f} {order.currency}",
        "",
    ]
    for e in entries:
        out.append(f"{e.at:%Y-%m-%d %H:%M:%S} UTC · {e.actor} · {e.action}: {e.summary}")
        d = e.details
        if d.get("request"):
            out.append(f"    request: {d['request']}")
        if d.get("candidates_considered"):
            cands = ", ".join(
                c["product_id"] + (f" ({c['note']})" if c.get("note") else "") for c in d["candidates_considered"]
            )
            out.append(f"    options considered: {cands}")
        if d.get("reason"):
            out.append(f"    reason: {d['reason']}")
        if d.get("reasons"):
            out.append(f"    approval needed because: {'; '.join(d['reasons'])}")
        if d.get("changes"):
            out.append(f"    changes: {d['changes']}")
    return "\n".join(out)
