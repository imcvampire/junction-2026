"""Agent procurement: search -> quote (stored, expiring) -> place_order at the quoted price.

Every rule that matters is enforced here, whatever the transport: quote ownership and expiry, fixed
prices (re-quoted and refused on any change), lot sizes, the agent's spend limit and the
requirements frozen on the quote. So is authorization: members see their own orders; admins also see
and decide their customer's orders, never ones they placed themselves.
"""

import asyncio
import logging
import math
import time
import uuid
from collections import defaultdict, deque
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from api.agents.models import AgentPrincipal
from api.catalog.index import Catalog, Product
from api.orders.models import AuditEntry, DecidedBy, Order, OrderLine, OrderStatus, utcnow
from api.orders.policy import ApprovalPolicy
from api.orders.service import OrderError, OrderService, quote_changes, render_audit_text
from api.orders.store import QuoteAlreadyUsedError, ReferenceTakenError, Store
from api.procurement.schemas import (
    MAX_LINE_QUANTITY,
    AuditView,
    OrderList,
    OrderScope,
    OrderView,
    PlaceOrderRequest,
    Principal,
    ProductView,
    QuoteItem,
    QuoteOption,
    QuoteRequest,
    QuoteView,
    SearchRequest,
    SearchResult,
)
from api.procurement.units import (
    ConversionError,
    is_valid_quantity,
    order_step,
    round_up_to_step,
    to_sales_units,
)
from api.valio.client import ProductQuote, ValioClient

log = logging.getLogger(__name__)

HELSINKI = ZoneInfo("Europe/Helsinki")
_RATE_WINDOW_S = 60.0


class ProcurementService:
    def __init__(
        self,
        store: Store,
        catalog: Catalog,
        valio: ValioClient,
        policy: ApprovalPolicy,
        *,
        orders: OrderService,
        quote_ttl_s: float,
        quotes_per_minute: int,
        now: Callable[[], datetime] = utcnow,
    ) -> None:
        self._store = store
        self._catalog = catalog
        self._valio = valio
        self._policy = policy
        self._orders = orders
        self._quote_ttl = timedelta(seconds=quote_ttl_s)
        self._quotes_per_minute = quotes_per_minute
        self._now = now
        self._quote_times: defaultdict[str, deque[float]] = defaultdict(deque)
        self._agent_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    def whoami(self, agent: AgentPrincipal) -> Principal:
        limit = self._policy.limit_for(agent.mandate.spend_limit_eur)
        return Principal(
            agent_id=agent.agent_id,
            name=agent.name,
            customer=agent.customer,
            role=agent.role,
            can_approve=agent.is_admin,
            spend_limit_eur=limit.amount,
            spend_limit_source=limit.source,
            required_tags=agent.mandate.required_tags,
            banned_allergens=agent.mandate.banned_allergens,
            quote_ttl_s=self._quote_ttl.total_seconds(),
        )

    def search(self, req: SearchRequest) -> SearchResult:
        hits = self._catalog.search(
            req.query,
            category=req.category,
            required_tags=req.required_tags,
            exclude_allergens=req.exclude_allergens,
            limit=req.limit,
        )
        return SearchResult(products=[ProductView.of(p, req.language) for p in hits], count=len(hits))

    def get_product(self, product_id: str, language: str = "en") -> ProductView:
        return ProductView.of(self._product(product_id), language)

    async def quote(self, agent: AgentPrincipal, req: QuoteRequest) -> QuoteView:
        now = self._now()
        self._require_future(req.delivery_date)
        ids = [i.product_id for i in req.items]
        if len(set(ids)) != len(ids):
            raise OrderError("duplicate_product", "Each product may appear only once per quote", status=422)
        known = [(i, p) for i in req.items if (p := self._catalog.get(i.product_id))]
        unknown = [i.product_id for i in req.items if self._catalog.get(i.product_id) is None]
        if not known:
            raise OrderError("unknown_product", "None of the products exist", status=422, details={"unknown": unknown})
        self._spend_quote_budget(agent.agent_id)

        # Mandate tags are never dropped: one the catalog cannot check counts as unmet, so orders escalate.
        mandate = agent.mandate.requirement_tags()
        requested = list(dict.fromkeys([*req.requirements, *mandate]))
        requirements = [t for t in requested if t in mandate or self._catalog.is_known_tag(t)]
        ignored = [t for t in requested if t not in requirements]

        quotes = await self._valio.quote([p.id for _, p in known], req.delivery_date, customer=agent.customer)
        options = [self._option(item, p, quotes[p.id], req, requirements) for item, p in known]
        options.sort(key=_rank_key)
        for rank, o in enumerate(options, 1):
            o.rank = rank
        best = next(
            (o for o in options if o.covers_request and o.meets_requirements and o.line_total is not None), None
        )
        if best:
            best.cheapest_covering_option = True

        view = QuoteView(
            quote_id=f"q_{uuid.uuid4().hex[:16]}",
            agent_id=agent.agent_id,
            created_at=now,
            expires_at=now + self._quote_ttl,
            delivery_date=req.delivery_date,
            currency=next(iter(quotes.values())).currency,
            request_text=req.request_text,
            requirements=requirements,
            ignored_requirements=ignored,
            options=options,
            unknown_products=unknown,
        )
        self._store.save_quote(view.quote_id, agent.agent_id, view.model_dump_json(), view.expires_at)
        log.info(
            "quote_created agent_id=%s quote_id=%s products=%d covering=%d",
            agent.agent_id,
            view.quote_id,
            len(options),
            sum(1 for o in options if o.covers_request),
        )
        return view

    def get_quote(self, agent: AgentPrincipal, quote_id: str) -> QuoteView:
        row = self._store.get_quote(quote_id)
        if row is None or row[0] != agent.agent_id:
            raise OrderError("quote_not_found", f"Quote {quote_id} not found", status=404)
        view = QuoteView.model_validate_json(row[1])
        view.order_id = row[2]
        return view

    async def place_order(self, agent: AgentPrincipal, req: PlaceOrderRequest) -> OrderView:
        async with self._agent_locks[agent.agent_id]:
            existing = self._store.order_for_reference(agent.agent_id, req.client_reference)
            if existing is not None:
                order = self._agent_order(agent, existing)
                if order.quote_id != req.quote_id:
                    raise OrderError(
                        "client_reference_reused",
                        f"client_reference {req.client_reference} was already used for order {order.id}",
                        details={"order_id": order.id},
                    )
                return OrderView.of(order)

            quote = self.get_quote(agent, req.quote_id)
            if quote.order_id is not None:
                raise OrderError(
                    "quote_already_used",
                    f"Quote {quote.quote_id} was already used for order {quote.order_id}; request a new quote",
                    details={"order_id": quote.order_id},
                )
            self._require_live(quote)
            self._require_future(quote.delivery_date)
            order = self._order_from_quote(agent, quote, req)

            codes = [li.product_id for li in order.lines]
            self._valio.invalidate(codes, quote.delivery_date, customer=agent.customer)
            fresh = await self._valio.quote(codes, quote.delivery_date, customer=agent.customer)
            changes = quote_changes(order, fresh)
            if changes:
                log.info("order_refused_quote_changed agent_id=%s quote_id=%s", agent.agent_id, quote.quote_id)
                raise OrderError(
                    "quote_changed",
                    "Price or availability changed since the quote; no order was created. Request a new quote.",
                    details={"changes": changes},
                )
            self._require_live(quote)  # the re-quote can take seconds; never store an order past expiry

            limit = self._policy.limit_for(agent.mandate.spend_limit_eur)
            order.approval_reasons = self._policy.evaluate(order, limit)
            order.status = OrderStatus.PENDING_APPROVAL if order.approval_reasons else OrderStatus.PLACED
            summary = (
                "Needs human approval: " + "; ".join(order.approval_reasons)
                if order.approval_reasons
                else f"Placed within the agent's authority at {order.total:.2f} {order.currency}"
            )
            entry = AuditEntry(
                order_id=order.id,
                at=order.created_at,
                actor="agent",
                action="escalated" if order.approval_reasons else "placed",
                summary=summary,
                agent_id=agent.agent_id,
                details={
                    "agent_name": agent.name,
                    "request": quote.request_text,
                    "requirements": quote.requirements,
                    "quote_id": quote.quote_id,
                    "options_considered": [_option_summary(o) for o in quote.options],
                    "choice": [li.model_dump(mode="json") for li in order.lines],
                    "reason": req.reason,
                    "reasons": order.approval_reasons,
                    "spend_limit": {"amount": limit.amount, "source": limit.source},
                },
            )
            try:
                self._store.place_from_quote(order, [entry], quote.quote_id, req.client_reference)
            except (QuoteAlreadyUsedError, ReferenceTakenError) as e:
                # Another process won the race. A retry of the same order gets that order back.
                existing = self._store.order_for_reference(agent.agent_id, req.client_reference)
                if existing is not None:
                    winner = self._agent_order(agent, existing)
                    if winner.quote_id == req.quote_id:
                        return OrderView.of(winner)
                    raise OrderError(
                        "client_reference_reused",
                        f"client_reference {req.client_reference} was already used for order {winner.id}",
                        details={"order_id": winner.id},
                    ) from e
                used_by = e.order_id if isinstance(e, QuoteAlreadyUsedError) else None
                raise OrderError(
                    "quote_already_used", f"Quote {quote.quote_id} was already used", details={"order_id": used_by}
                ) from e
            log.info(
                "order_created agent_id=%s order_id=%s status=%s total=%.2f",
                agent.agent_id,
                order.id,
                order.status.value,
                order.total,
            )
            return OrderView.of(order)

    def get_order(self, agent: AgentPrincipal, order_id: str) -> OrderView:
        return OrderView.of(self._visible_order(agent, order_id))

    def list_orders(
        self,
        agent: AgentPrincipal,
        status: OrderStatus | None = None,
        limit: int = 20,
        scope: OrderScope = "mine",
    ) -> OrderList:
        limit = max(1, min(limit, 100))
        if scope == "company":
            self.require_admin(agent, "list_company_orders")
            orders = self._store.list_customer_orders(agent.customer, status, limit)
        else:
            orders = self._store.list_agent_orders(agent.agent_id, status, limit)
        return OrderList(orders=[OrderView.of(o) for o in orders])

    def list_pending_approvals(self, agent: AgentPrincipal, limit: int = 20) -> OrderList:
        """The customer's approval queue, oldest first."""
        self.require_admin(agent, "list_pending_approvals")
        orders = self._store.list_customer_orders(
            agent.customer, OrderStatus.PENDING_APPROVAL, max(1, min(limit, 100)), oldest_first=True
        )
        return OrderList(orders=[OrderView.of(o) for o in orders])

    async def decide(self, agent: AgentPrincipal, order_id: str, *, approve: bool, reason: str) -> OrderView:
        self.require_admin(agent, "approve" if approve else "reject")
        order = self._visible_order(agent, order_id)
        if order.agent_id == agent.agent_id:
            log.info("authz_denied agent_id=%s op=self_approval order_id=%s", agent.agent_id, order.id)
            raise OrderError(
                "self_approval_forbidden",
                "An order cannot be approved or rejected with the key that placed it; ask another admin",
                status=403,
            )
        reason = reason.strip()
        if not reason:
            raise OrderError("reason_required", "Give the reason for the decision", status=422)
        decided = await self._orders.decide(
            order.id,
            approve=approve,
            reason=reason,
            decided_by=DecidedBy(agent_id=agent.agent_id, name=agent.name, role=agent.role),
        )
        return OrderView.of(decided)

    def audit(self, agent: AgentPrincipal, order_id: str) -> AuditView:
        order = self._visible_order(agent, order_id)
        entries = self._store.audit(order.id)
        return AuditView(order_id=order.id, entries=entries, text=render_audit_text(order, entries))

    def _require_future(self, delivery_date: date) -> None:
        if delivery_date < self._now().astimezone(HELSINKI).date():
            raise OrderError("invalid_date", f"Delivery date {delivery_date} is in the past", status=422)

    def _require_live(self, quote: QuoteView) -> None:
        if self._now() >= quote.expires_at:
            raise OrderError(
                "quote_expired",
                f"Quote {quote.quote_id} expired at {quote.expires_at.isoformat()}; request a new quote",
                details={"expires_at": quote.expires_at.isoformat()},
            )

    def _product(self, product_id: str) -> Product:
        p = self._catalog.get(product_id)
        if p is None:
            raise OrderError("product_not_found", f"Product {product_id} not found", status=404)
        return p

    @staticmethod
    def require_admin(agent: AgentPrincipal, op: str) -> None:
        """403 `forbidden` unless the key is an admin."""
        if not agent.is_admin:
            log.info("authz_denied agent_id=%s op=%s", agent.agent_id, op)
            raise OrderError(
                "forbidden",
                "This key is not allowed to approve or view company orders; ask an admin",
                status=403,
            )

    def _visible_order(self, agent: AgentPrincipal, order_id: str) -> Order:
        """The agent's own order, or for an admin any order of its customer. Anything else is 404."""
        order = self._store.get_order(order_id)
        if order is not None and agent.is_admin and order.customer == agent.customer:
            return order
        return self._own(order, agent, order_id)

    def _agent_order(self, agent: AgentPrincipal, order_id: str) -> Order:
        return self._own(self._store.get_order(order_id), agent, order_id)

    @staticmethod
    def _own(order: Order | None, agent: AgentPrincipal, order_id: str) -> Order:
        # Another agent's order is reported as missing so ids cannot be probed.
        if order is None or order.agent_id != agent.agent_id:
            raise OrderError("order_not_found", f"Order {order_id} not found", status=404)
        return order

    def _spend_quote_budget(self, agent_id: str) -> None:
        now = time.monotonic()
        times = self._quote_times[agent_id]
        while times and now - times[0] >= _RATE_WINDOW_S:
            times.popleft()
        if len(times) >= self._quotes_per_minute:
            retry = math.ceil(_RATE_WINDOW_S - (now - times[0]))
            raise OrderError(
                "rate_limited",
                f"Quote budget of {self._quotes_per_minute} per minute used; retry in {retry} s",
                status=429,
                details={"retry_after_s": retry},
            )
        times.append(now)

    def _option(
        self, item: QuoteItem, p: Product, q: ProductQuote, req: QuoteRequest, requirements: list[str]
    ) -> QuoteOption:
        quantity, requested, conversion, conversion_error = item.quantity, None, None, None
        if item.amount is not None:
            requested = f"{item.amount.value:g} {item.amount.unit}"
            try:
                converted = to_sales_units(p, item.amount.value, item.amount.unit)
                quantity, conversion = converted.quantity, converted.derivation
            except ConversionError as e:
                conversion_error = str(e)
        elif quantity is not None:
            requested = f"{quantity:g} {p.sales_unit}"
            rounded = round_up_to_step(p, quantity)
            if rounded != quantity:
                step = order_step(p)
                conversion = f"{requested} -> {rounded:g} {p.sales_unit} (rounded up to a multiple of {step:g})"
                quantity = rounded
        if quantity is not None and quantity > MAX_LINE_QUANTITY:
            conversion_error = f"{quantity:g} {p.sales_unit} exceeds the {MAX_LINE_QUANTITY} per-line maximum"
            quantity = None
        missing = [t for t in requirements if not p.has_tags([t])]
        line_total = round(q.unit_price * quantity, 2) if q.unit_price is not None and quantity else None
        co2 = p.co2_kg_per_sales_unit
        c = p.content_per_sales_unit
        return QuoteOption(
            rank=0,
            product_id=p.id,
            name=p.name,
            brand=p.brand,
            sales_unit=p.sales_unit,
            content_per_sales_unit=f"{c.amount:g} {c.unit}" if c else None,
            allowed_lot_size=p.allowed_lot_size,
            requested=requested,
            quantity=quantity,
            conversion=conversion,
            conversion_error=conversion_error,
            unit_price=q.unit_price,
            unit_price_with_tax=q.unit_price_with_tax,
            currency=q.currency,
            line_total=line_total,
            available_amount=None if q.unlimited_stock else q.available_amount,
            unlimited_stock=q.unlimited_stock,
            earliest_available_date=q.available_date,
            order_cutoff=q.closing_time,
            orderable=q.orderable,
            covers_request=q.covers(quantity, req.delivery_date) if quantity else None,
            meets_requirements=not missing,
            missing_requirements=missing,
            delivery_reliability=p.delivery_reliability,
            co2_kg_per_sales_unit=co2,
            co2_kg_total=round(co2 * quantity, 2) if co2 is not None and quantity else None,
        )

    def _order_from_quote(self, agent: AgentPrincipal, quote: QuoteView, req: PlaceOrderRequest) -> Order:
        ids = [li.product_id for li in req.lines]
        if len(set(ids)) != len(ids):
            raise OrderError("duplicate_product", "Each product may appear only once per order", status=422)
        options = {o.product_id: o for o in quote.options}
        lines: list[OrderLine] = []
        for li in req.lines:
            o = options.get(li.product_id)
            if o is None:
                raise OrderError(
                    "line_not_in_quote",
                    f"Product {li.product_id} is not in quote {quote.quote_id}; quote it first",
                    status=422,
                )
            p = self._product(li.product_id)
            if not is_valid_quantity(p, li.quantity):
                raise OrderError(
                    "invalid_quantity",
                    f"{p.name}: quantity must be a multiple of {order_step(p):g} {p.sales_unit}",
                    status=422,
                )
            if o.unit_price is None or not o.orderable or not _quoted_cover(o, li.quantity, quote):
                raise OrderError(
                    "not_deliverable",
                    f"{p.name}: the quote does not cover {li.quantity:g} {p.sales_unit} by {quote.delivery_date}",
                    details={
                        "product_id": p.id,
                        "available_amount": o.available_amount,
                        "earliest_available_date": o.earliest_available_date,
                        "orderable": o.orderable,
                    },
                )
            missing = [t for t in quote.requirements if not p.has_tags([t])]
            lines.append(
                OrderLine(
                    product_id=p.id,
                    name=p.name,
                    quantity=li.quantity,
                    sales_unit=p.sales_unit,
                    unit_price=o.unit_price,
                    line_total=round(o.unit_price * li.quantity, 2),
                    available_amount=o.available_amount,
                    available_date=o.earliest_available_date,
                    covers_request=True,
                    substitute_for=li.substitute_for,
                    within_preferences=not missing,
                    missing_requirements=missing,
                )
            )
        now = self._now()
        return Order(
            id=f"ord_{uuid.uuid4().hex[:12]}",
            agent_id=agent.agent_id,
            quote_id=quote.quote_id,
            client_reference=req.client_reference,
            status=OrderStatus.PLACED,
            customer=agent.customer,
            delivery_date=quote.delivery_date,
            currency=quote.currency,
            lines=lines,
            total=round(sum(li.line_total for li in lines), 2),
            preferences=quote.requirements,
            quoted_at=quote.created_at,
            created_at=now,
            updated_at=now,
        )


def _quoted_cover(o: QuoteOption, quantity: float, quote: QuoteView) -> bool:
    if o.earliest_available_date is None or o.earliest_available_date > quote.delivery_date:
        return False
    return o.unlimited_stock or (o.available_amount or 0) >= quantity


def _rank_key(o: QuoteOption) -> tuple[int, int, float, float]:
    if o.covers_request:
        availability = 0
    elif o.covers_request is None and o.orderable and o.conversion_error is None:
        availability = 1  # priced and orderable, but no quantity was given to check
    else:
        availability = 2
    total = o.line_total if o.line_total is not None else math.inf
    return (availability, 0 if o.meets_requirements else 1, total, -(o.delivery_reliability or 0))


def _option_summary(o: QuoteOption) -> dict[str, Any]:
    return o.model_dump(
        mode="json",
        include={
            "rank",
            "product_id",
            "name",
            "sales_unit",
            "quantity",
            "unit_price",
            "line_total",
            "earliest_available_date",
            "covers_request",
            "meets_requirements",
            "missing_requirements",
        },
    )
