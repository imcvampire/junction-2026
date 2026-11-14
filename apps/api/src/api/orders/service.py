"""Order reads and approval decisions: pending_approval -> approved | rejected.

Orders are created by `ProcurementService.place_order`, which also decides who may approve; this service
owns the state transition itself.
"""

import asyncio
import logging
from collections import defaultdict
from typing import Any

from api.orders.models import AuditEntry, ConfirmedVia, DecidedBy, Order, OrderDecision, OrderStatus, utcnow
from api.orders.store import Store
from api.valio.client import ProductQuote

log = logging.getLogger(__name__)

_PRICE_EPSILON = 1e-6


class OrderError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status: int = 409,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}
        self.headers = headers

    def body(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "details": self.details}


class OrderService:
    def __init__(self, store: Store) -> None:
        self._store = store
        self._locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    def get(self, order_id: str) -> Order:
        order = self._store.get_order(order_id)
        if order is None:
            raise OrderError("order_not_found", f"Order {order_id} not found", status=404)
        return order

    def audit(self, order_id: str) -> list[AuditEntry]:
        self.get(order_id)
        return self._store.audit(order_id)

    async def decide(
        self,
        order_id: str,
        *,
        approve: bool,
        reason: str,
        decided_by: DecidedBy,
        reprice: dict[str, float] | None = None,
        confirmed_via: ConfirmedVia = "rest",
    ) -> Order:
        """Approve or reject a pending order; `reprice` sets new unit prices the human confirmed first."""
        async with self._locks[order_id]:
            order = self.get(order_id)
            target = OrderStatus.APPROVED if approve else OrderStatus.REJECTED
            if order.status == target:
                return order
            self._require_pending(order)
            verb = "Approved" if approve else "Rejected"
            summary = f"{verb} by {decided_by.name} ({decided_by.agent_id})" + (f": {reason}" if reason else "")
            previous = order.status
            order.updated_at = utcnow()
            entries: list[AuditEntry] = []
            if approve and reprice:
                entries.append(self._reprice(order, reprice, decided_by))
            order.status = target
            order.decision = OrderDecision(approved=approve, reason=reason, at=order.updated_at, decided_by=decided_by)
            entries.append(
                AuditEntry(
                    order_id=order.id,
                    at=order.updated_at,
                    actor="approver",
                    action=target.value,
                    summary=summary,
                    agent_id=decided_by.agent_id,
                    details={
                        "from": previous.value,
                        "to": target.value,
                        "decided_by": decided_by.model_dump(),
                        "confirmed_via": confirmed_via,
                    },
                )
            )
            self._store.save_order(order, entries)
            log.info(
                "order_decided order_id=%s agent_id=%s %s->%s via=%s repriced=%s",
                order.id,
                decided_by.agent_id,
                previous.value,
                target.value,
                confirmed_via,
                bool(entries[:-1]),
            )
            return order

    async def close_stale(self, order_id: str, changes: list[dict[str, Any]]) -> Order:
        """Reject a pending order the wholesaler can no longer fill; the system decides, not a human."""
        async with self._locks[order_id]:
            order = self.get(order_id)
            self._require_pending(order)
            short = sorted({c["product_id"] for c in changes if c["problem"] != "price_changed"})
            reason = f"Closed: no longer deliverable as ordered ({', '.join(short)}); quote again"
            order.status = OrderStatus.REJECTED
            order.updated_at = utcnow()
            order.decision = OrderDecision(approved=False, reason=reason, at=order.updated_at, decided_by=None)
            self._store.save_order(
                order,
                [
                    AuditEntry(
                        order_id=order.id,
                        at=order.updated_at,
                        actor="system",
                        action=OrderStatus.REJECTED.value,
                        summary=reason,
                        details={
                            "from": OrderStatus.PENDING_APPROVAL.value,
                            "to": OrderStatus.REJECTED.value,
                            "changes": changes,
                        },
                    )
                ],
            )
            log.info("order_closed_stale order_id=%s products=%s", order.id, ",".join(short))
            return order

    @staticmethod
    def _require_pending(order: Order) -> None:
        if order.status != OrderStatus.PENDING_APPROVAL:
            raise OrderError(
                "invalid_state",
                f"Order {order.id} is {order.status.value}; only pending_approval orders can be decided",
            )

    @staticmethod
    def _reprice(order: Order, prices: dict[str, float], decided_by: DecidedBy) -> AuditEntry:
        old_total = order.total
        changed: list[dict[str, Any]] = []
        for line in order.lines:
            now = prices.get(line.product_id)
            if now is None:
                continue
            changed.append({"product_id": line.product_id, "was": line.unit_price, "now": now})
            line.unit_price = now
            line.line_total = round(now * line.quantity, 2)
        order.total = round(sum(li.line_total for li in order.lines), 2)
        return AuditEntry(
            order_id=order.id,
            at=order.updated_at,
            actor="approver",
            action="repriced",
            summary=(
                f"Price changed before approval; {decided_by.name} confirmed the new total "
                f"{order.total:.2f} {order.currency} (was {old_total:.2f})"
            ),
            agent_id=decided_by.agent_id,
            details={"lines": changed, "old_total": old_total, "new_total": order.total},
        )


def repriced_total(order: Order, prices: dict[str, float]) -> float:
    return round(sum(round(prices.get(li.product_id, li.unit_price) * li.quantity, 2) for li in order.lines), 2)


def availability_problem(product_id: str, name: str, quantity: float, q: ProductQuote) -> dict[str, Any]:
    return {
        "product_id": product_id,
        "name": name,
        "problem": "sales_block" if q.sales_block else "not_available_in_time",
        "requested_quantity": quantity,
        "available_amount": None if q.unlimited_stock else q.available_amount,
        "earliest_date": q.available_date.isoformat() if q.available_date else None,
    }


def quote_changes(order: Order, quotes: dict[str, ProductQuote]) -> list[dict[str, Any]]:
    """Per-line differences between the order's fixed prices and a fresh upstream quote."""
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
            changes.append(availability_problem(line.product_id, line.name, line.quantity, q))
    return changes


def render_audit_text(order: Order, entries: list[AuditEntry]) -> str:
    out = [f"Order {order.id} - {order.status.value.replace('_', ' ')}"]
    first = entries[0].details if entries else {}
    if order.agent_id:
        out.append(f"Agent {first.get('agent_name', '?')} ({order.agent_id}) for customer {order.customer}")
    out += [f"Delivery {order.delivery_date.isoformat()} · total {order.total:.2f} {order.currency}", ""]
    for e in entries:
        out.append(f"{e.at:%Y-%m-%d %H:%M:%S} UTC · {e.actor} · {e.action}: {e.summary}")
        d = e.details
        if d.get("request"):
            out.append(f"    request: {d['request']}")
        if d.get("purpose"):
            out.append(f"    purpose: {d['purpose']}")
        if d.get("requirements"):
            out.append(f"    requirements: {', '.join(d['requirements'])}")
        if d.get("options_considered"):
            out.append(f"    options considered (quote {d.get('quote_id')}):")
            for o in d["options_considered"]:
                price = f"{o['unit_price']:.2f}" if o.get("unit_price") is not None else "no price"
                qty = f"{o['quantity']:g} {o['sales_unit']}" if o.get("quantity") is not None else o["sales_unit"]
                flags = [
                    "covers" if o.get("covers_request") else "does not cover",
                    "meets requirements" if o.get("meets_requirements") else "misses requirements",
                ]
                out.append(f"      - {o['product_id']} {o['name']}: {qty} @ {price} ({', '.join(flags)})")
        if d.get("choice"):
            chosen = "; ".join(f"{c['quantity']:g} {c['sales_unit']} {c['product_id']}" for c in d["choice"])
            out.append(f"    choice: {chosen}")
        if d.get("reason"):
            out.append(f"    reason: {d['reason']}")
        if d.get("reasons"):
            out.append(f"    approval needed because: {'; '.join(d['reasons'])}")
        if d.get("changes"):
            out.append(f"    changes: {d['changes']}")
        if e.action == "repriced":
            prices = "; ".join(f"{li['product_id']} {li['was']:.2f} -> {li['now']:.2f}" for li in d.get("lines", []))
            out.append(f"    total {d['old_total']:.2f} -> {d['new_total']:.2f} {order.currency} ({prices})")
        if d.get("confirmed_via"):
            out.append(f"    confirmed via: {d['confirmed_via']}")
    return "\n".join(out)
