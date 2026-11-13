"""REST twin of the MCP tools: same service, same schemas, same bearer auth."""

from typing import Annotated

from fastapi import APIRouter, Header, Query
from fastapi.responses import PlainTextResponse

from api.agents.auth import Agent
from api.orders.models import Decision, OrderStatus
from api.orders.service import OrderError
from api.procurement.schemas import (
    MAX_SEARCH_RESULTS,
    AuditView,
    Language,
    OrderList,
    OrderScope,
    OrderView,
    PlaceOrderRequest,
    Principal,
    ProductView,
    QuoteRequest,
    QuoteView,
    SearchRequest,
    SearchResult,
)
from api.routes._idempotency import IdempotencyKey, idempotent_decision
from api.services import Deps

router = APIRouter(prefix="/agent/v1", tags=["agent"])


@router.get("/me")
def me(svc: Deps, agent: Agent) -> Principal:
    return svc.procurement.whoami(agent)


@router.get("/products")
def search_products(
    svc: Deps,
    _: Agent,
    q: Annotated[str, Query(max_length=200)] = "",
    tag: Annotated[list[str] | None, Query(max_length=10)] = None,
    exclude_allergen: Annotated[list[str] | None, Query(max_length=10)] = None,
    category: Annotated[str | None, Query(max_length=16)] = None,
    lang: Language = "en",
    limit: Annotated[int, Query(ge=1, le=MAX_SEARCH_RESULTS)] = 10,
) -> SearchResult:
    req = SearchRequest(
        query=q,
        required_tags=tag or [],
        exclude_allergens=exclude_allergen or [],
        category=category,
        language=lang,
        limit=limit,
    )
    return svc.procurement.search(req)


@router.get("/products/{product_id}")
def get_product(svc: Deps, _: Agent, product_id: str, lang: Language = "en") -> ProductView:
    return svc.procurement.get_product(product_id, lang)


@router.post("/quotes", status_code=201)
async def create_quote(svc: Deps, agent: Agent, body: QuoteRequest) -> QuoteView:
    return await svc.procurement.quote(agent, body)


@router.get("/quotes/{quote_id}")
def get_quote(svc: Deps, agent: Agent, quote_id: str) -> QuoteView:
    return svc.procurement.get_quote(agent, quote_id)


@router.post("/orders", status_code=201)
async def place_order(
    svc: Deps,
    agent: Agent,
    body: PlaceOrderRequest,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", max_length=128)] = None,
) -> OrderView:
    if idempotency_key is not None and idempotency_key != body.client_reference:
        raise OrderError("idempotency_key_mismatch", "Idempotency-Key must equal client_reference", status=422)
    return await svc.procurement.place_order(agent, body)


@router.get("/orders")
def list_orders(
    svc: Deps,
    agent: Agent,
    status: OrderStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    scope: OrderScope = "mine",
) -> OrderList:
    return svc.procurement.list_orders(agent, status, limit, scope)


@router.get("/approvals")
def list_pending_approvals(svc: Deps, agent: Agent, limit: Annotated[int, Query(ge=1, le=100)] = 20) -> OrderList:
    return svc.procurement.list_pending_approvals(agent, limit)


@router.post("/orders/{order_id}/approve")
async def approve_order(
    svc: Deps, agent: Agent, order_id: str, body: Decision, key: IdempotencyKey = None
) -> OrderView:
    return await idempotent_decision(svc, agent, order_id, approve=True, reason=body.reason, key=key)


@router.post("/orders/{order_id}/reject")
async def reject_order(svc: Deps, agent: Agent, order_id: str, body: Decision, key: IdempotencyKey = None) -> OrderView:
    return await idempotent_decision(svc, agent, order_id, approve=False, reason=body.reason, key=key)


@router.get("/orders/{order_id}")
def get_order(svc: Deps, agent: Agent, order_id: str) -> OrderView:
    return svc.procurement.get_order(agent, order_id)


@router.get("/orders/{order_id}/audit")
def get_audit(svc: Deps, agent: Agent, order_id: str) -> AuditView:
    return svc.procurement.audit(agent, order_id)


@router.get("/orders/{order_id}/audit.txt", response_class=PlainTextResponse)
def get_audit_text(svc: Deps, agent: Agent, order_id: str) -> str:
    return svc.procurement.audit(agent, order_id).text
