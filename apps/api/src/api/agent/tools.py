"""LLM tools: thin, validated wrappers over catalog, quote and order services.

Tool arguments come from the model, so every call is validated by Pydantic before it touches
upstream APIs or storage, and order guards are enforced here rather than trusted to the prompt.
"""

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from api.agent.state import Action, FlowState, Offer, Session
from api.catalog.index import ALLERGEN_NAMES, Catalog, Product
from api.orders.footprint import compute_layout
from api.orders.models import Candidate, DraftRequest, Order, OrderLineRequest, OrderStatus
from api.orders.service import OrderError, OrderService
from api.valio.client import ValioClient, ValioError

log = logging.getLogger(__name__)


@dataclass
class TurnEffects:
    flow_state: FlowState | None = None
    offers: list[Offer] = field(default_factory=list[Offer])
    order: Order | None = None
    actions: list[Action] = field(default_factory=list[Action])


@dataclass
class ToolContext:
    session: Session
    catalog: Catalog
    valio: ValioClient
    orders: OrderService
    ar_max_stack_m: float
    effects: TurnEffects = field(default_factory=TurnEffects)


class SearchArgs(BaseModel):
    query: str = Field(max_length=200, description="Product words in any of en/fi/sv, e.g. 'milk 1 l'")
    required_tags: list[str] = Field(
        default_factory=list[str],
        max_length=10,
        description="Tags every result must have, e.g. LACTOSE_FREE, VEGAN, GLUTEN_FREE (FREE_FROM_GLUTEN), "
        "FREE_FROM:AM (milk-allergen free), brand:Valio",
    )
    exclude_allergens: list[str] = Field(
        default_factory=list[str],
        max_length=10,
        description="GS1 allergen codes to exclude, e.g. AM (milk), AW (gluten)",
    )
    limit: int = Field(default=6, ge=1, le=12)


class QuoteItem(BaseModel):
    product_id: str = Field(max_length=32)
    quantity: float | None = Field(default=None, gt=0, description="Quantity in sales units, if known")


class QuoteArgs(BaseModel):
    items: list[QuoteItem] = Field(min_length=1, max_length=12)
    delivery_date: date


class DraftArgs(BaseModel):
    delivery_date: date
    lines: list[OrderLineRequest] = Field(min_length=1, max_length=20)
    preferences: list[str] = Field(default_factory=list[str], max_length=10)
    candidates_considered: list[Candidate] = Field(default_factory=list[Candidate], max_length=20)
    reason: str = Field(max_length=600, description="Why these products/quantities were chosen")


class OrderRef(BaseModel):
    order_id: str = Field(max_length=32)


def _product_summary(p: Product) -> dict[str, Any]:
    c = p.content_per_sales_unit
    return {
        "product_id": p.id,
        "name": p.name,
        "brand": p.brand,
        "sales_unit": p.sales_unit,
        "content_per_sales_unit": f"{c.amount:g} {c.unit}" if c else None,
        "allowed_lot_size": p.allowed_lot_size,
        "allergens": sorted(ALLERGEN_NAMES.get(a, a) for a in p.allergens),
        "claims": sorted(t for t in p.tags if not t.startswith("FREE_FROM:") and t.isupper())[:12],
        "delivery_reliability": p.delivery_reliability,
        "co2_kg_per_sales_unit": p.co2_kg_per_sales_unit,
        "substitutes": list(p.substitutes),
        "has_size_data": p.pack is not None,
    }


def _order_summary(order: Order) -> dict[str, Any]:
    return {
        "order_id": order.id,
        "status": order.status.value,
        "delivery_date": order.delivery_date.isoformat(),
        "total": order.total,
        "currency": order.currency,
        "lines": [
            {
                "product_id": li.product_id,
                "name": li.name,
                "quantity": li.quantity,
                "sales_unit": li.sales_unit,
                "unit_price": li.unit_price,
                "line_total": li.line_total,
                "substitute_for": li.substitute_for,
            }
            for li in order.lines
        ],
        "needs_approval": order.approval_reasons,
    }


async def search_products(ctx: ToolContext, args: SearchArgs) -> dict[str, Any]:
    hits = ctx.catalog.search(
        args.query, required_tags=args.required_tags, exclude_allergens=args.exclude_allergens, limit=args.limit
    )
    if ctx.effects.flow_state is None and ctx.session.flow_state in ("gathering", "placed", "escalated"):
        ctx.effects.flow_state = "gathering"
    if ctx.session.flow_state in ("placed", "escalated"):
        ctx.session.requirements = []
    seen = set(ctx.session.requirements)
    for tag in [*args.required_tags, *(f"no:{a.upper()}" for a in args.exclude_allergens)]:
        if tag not in seen and ctx.catalog.is_known_tag(tag):
            seen.add(tag)
            ctx.session.requirements.append(tag)
    return {"results": [_product_summary(p) for p in hits], "count": len(hits)}


async def quote(ctx: ToolContext, args: QuoteArgs) -> dict[str, Any]:
    known = [(i, p) for i in args.items if (p := ctx.catalog.get(i.product_id))]
    unknown = [i.product_id for i in args.items if not ctx.catalog.get(i.product_id)]
    quotes = await ctx.valio.quote([p.id for _, p in known], args.delivery_date)
    out: list[dict[str, Any]] = []
    offers: list[Offer] = []
    for item, p in known:
        q = quotes[p.id]
        covers = q.covers(item.quantity, args.delivery_date) if item.quantity else None
        line_total = round(q.unit_price * item.quantity, 2) if q.unit_price is not None and item.quantity else None
        c = p.content_per_sales_unit
        offers.append(
            Offer(
                product_id=p.id,
                name=p.name_in(ctx.session.language),
                brand=p.brand,
                sales_unit=p.sales_unit,
                content_per_sales_unit=f"{c.amount:g} {c.unit}" if c else None,
                quantity=item.quantity,
                unit_price=q.unit_price,
                line_total=line_total,
                currency=q.currency,
                available_amount=None if q.unlimited_stock else q.available_amount,
                available_date=q.available_date,
                covers_request=covers,
                delivery_reliability=p.delivery_reliability,
                co2_kg_per_sales_unit=p.co2_kg_per_sales_unit,
            )
        )
        out.append(
            {
                "product_id": p.id,
                "name": p.name,
                "unit_price": q.unit_price,
                "currency": q.currency,
                "sales_unit": p.sales_unit,
                "content_per_sales_unit": f"{c.amount:g} {c.unit}" if c else None,
                "available_amount": "unlimited (supplier stock)" if q.unlimited_stock else q.available_amount,
                "earliest_available_date": q.available_date.isoformat() if q.available_date else None,
                "orderable": q.orderable,
                "covers_requested_quantity_by_date": covers,
                "line_total": line_total,
                "order_cutoff": q.closing_time,
            }
        )

    # Rank so the model sees price order directly instead of comparing totals across units itself.
    def rank(q: dict[str, Any]) -> tuple[int, float]:
        total = q["line_total"] if q["line_total"] is not None else float("inf")
        return (0 if q["covers_requested_quantity_by_date"] is not False and q["orderable"] else 1, total)

    out.sort(key=rank)
    cheapest = next(
        (q for q in out if q["covers_requested_quantity_by_date"] and q["orderable"] and q["line_total"] is not None),
        None,
    )
    if cheapest:
        cheapest["cheapest_covering_option"] = True
    offers.sort(key=lambda o: [q["product_id"] for q in out].index(o.product_id))
    ctx.effects.offers = offers
    ctx.effects.flow_state = "proposing"
    return {"quotes": out, "unknown_products": unknown}


async def create_order_draft(ctx: ToolContext, args: DraftArgs) -> dict[str, Any]:
    requested = list(dict.fromkeys([*ctx.session.requirements, *args.preferences]))
    preferences = [t for t in requested if ctx.catalog.is_known_tag(t)]
    ignored = [t for t in requested if t not in preferences]
    order = await ctx.orders.create_draft(
        DraftRequest(
            delivery_date=args.delivery_date,
            lines=args.lines,
            preferences=preferences,
            request_text=ctx.session.last_user_texts(),
            candidates=args.candidates_considered,
            reason=args.reason,
            session_id=ctx.session.id,
        ),
        actor="agent",
        turn=ctx.session.turn,
    )
    ctx.session.order_id = order.id
    ctx.effects.order = order
    ctx.effects.flow_state = "confirming"
    ctx.effects.actions.append(Action(type="show_order", order_id=order.id))
    result: dict[str, Any] = {
        **_order_summary(order),
        "next": "Read the order back and ask the buyer to confirm. Do not call agree_order in this turn.",
    }
    if ignored:
        result["ignored_preferences"] = ignored
        result["preferences_note"] = "Preferences must be catalog tags (e.g. LACTOSE_FREE, brand:Valio, no:AM)."
    return result


def _session_order(ctx: ToolContext, order_id: str) -> Order:
    order = ctx.orders.get(order_id)
    if order.session_id != ctx.session.id:
        raise OrderError("order_not_found", f"Order {order_id} not found", status=404)
    return order


async def agree_order(ctx: ToolContext, args: OrderRef) -> dict[str, Any]:
    order = _session_order(ctx, args.order_id)
    if order.status == OrderStatus.DRAFT and order.created_turn is not None and order.created_turn >= ctx.session.turn:
        return {
            "error": "confirmation_required",
            "message": "The buyer has not heard this draft yet. Read it back and ask them to confirm first.",
        }
    order = await ctx.orders.agree(
        order.id, actor="buyer", note=f"Buyer said: {ctx.session.last_user_texts(1)}", turn=ctx.session.turn
    )
    layout = compute_layout(order, ctx.catalog, ctx.ar_max_stack_m)
    ctx.effects.order = order
    if layout.footprint.renderable:
        ctx.effects.flow_state = "ar_offered"
        ctx.effects.actions.append(Action(type="offer_ar", order_id=order.id))
    else:
        ctx.effects.flow_state = "confirming"
    return {
        **_order_summary(order),
        "space_needed": layout.footprint.spoken_summary,
        "ar_available": layout.footprint.renderable,
        "next": "Tell the buyer how much space it needs and offer the AR preview; place the order when they say so."
        if layout.footprint.renderable
        else "Ask the buyer whether to place the order now.",
    }


async def place_order(ctx: ToolContext, args: OrderRef) -> dict[str, Any]:
    order = _session_order(ctx, args.order_id)
    if order.status == OrderStatus.AGREED and order.agreed_turn is not None and order.agreed_turn >= ctx.session.turn:
        return {
            "error": "too_early",
            "message": "The buyer agreed in this turn. Tell them the space needed, offer the AR preview, and place "
            "the order only when they ask in a later turn.",
        }
    try:
        order = await ctx.orders.place(order.id, actor="agent", turn=ctx.session.turn)
    except OrderError as e:
        if e.code == "quote_changed":
            refreshed = ctx.orders.get(order.id)
            ctx.effects.order = refreshed
            ctx.effects.flow_state = "confirming"
            ctx.effects.actions.append(Action(type="show_order", order_id=refreshed.id))
        raise
    ctx.effects.order = order
    ctx.effects.flow_state = "escalated" if order.status == OrderStatus.PENDING_APPROVAL else "placed"
    return _order_summary(order)


async def get_order_status(ctx: ToolContext, args: OrderRef) -> dict[str, Any]:
    order = _session_order(ctx, args.order_id)
    ctx.effects.order = order
    return _order_summary(order)


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    run: Callable[[ToolContext, Any], Awaitable[dict[str, Any]]]

    def schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": _inline_refs(self.args.model_json_schema()),
            },
        }


TOOLS: dict[str, Tool] = {
    t.name: t
    for t in [
        Tool(
            "search_products",
            "Search the static Valio Aimo catalog. Returns candidates with sales unit, content per sales unit, "
            "allergens, delivery reliability and CO2. No prices - use quote for those.",
            SearchArgs,
            search_products,
        ),
        Tool(
            "quote",
            "Live price and availability for up to 12 shortlisted products on a delivery date. Pass quantities "
            "in sales units to check coverage. Results are shown to the buyer as offer cards.",
            QuoteArgs,
            quote,
        ),
        Tool(
            "create_order_draft",
            "Create a draft order at the quoted fixed prices. Only after the buyer has chosen products and "
            "quantities. Mark substitutes with substitute_for and pass the buyer's stated requirements as "
            "preferences tags.",
            DraftArgs,
            create_order_draft,
        ),
        Tool(
            "agree_order",
            "Record that the buyer explicitly agreed to the draft they heard read back. Never in the same turn "
            "the draft was created.",
            OrderRef,
            agree_order,
        ),
        Tool(
            "place_order",
            "Place an agreed order. The backend applies the approval policy and may return pending_approval; "
            "it refuses if the price or availability changed since the quote.",
            OrderRef,
            place_order,
        ),
        Tool("get_order_status", "Current status of an order in this conversation.", OrderRef, get_order_status),
    ]
}


async def execute(ctx: ToolContext, name: str, raw_args: str) -> dict[str, Any]:
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": "unknown_tool", "message": f"No tool named {name}"}
    try:
        args = tool.args.model_validate(json.loads(raw_args or "{}"))
    except (json.JSONDecodeError, ValidationError) as e:
        return {"error": "invalid_arguments", "message": str(e)[:800]}
    try:
        return await tool.run(ctx, args)
    except OrderError as e:
        return {"error": e.code, "message": e.message, "details": e.details}
    except ValioError as e:
        log.warning("tool_upstream_error tool=%s error=%s", name, e)
        return {
            "error": "upstream_unavailable" if e.retryable else "upstream_error",
            "message": "Price/availability service problem; tell the buyer and offer to retry.",
        }
    except Exception:
        log.exception("tool_crashed tool=%s", name)
        return {"error": "internal_error", "message": "That step failed; apologise and offer to try again."}


def _inline_refs(schema: dict[str, Any]) -> dict[str, Any]:
    defs: dict[str, Any] = schema.pop("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                ref = str(node["$ref"]).rsplit("/", 1)[-1]  # pyright: ignore[reportUnknownArgumentType]
                return resolve(defs[ref])
            return {k: resolve(v) for k, v in node.items()}  # pyright: ignore[reportUnknownVariableType]
        if isinstance(node, list):
            return [resolve(v) for v in node]  # pyright: ignore[reportUnknownVariableType]
        return node

    return resolve(schema)
