from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import APIRouter, Header, Query, Response
from fastapi.responses import PlainTextResponse

from api.orders.footprint import Footprint, compute_layout
from api.orders.gltf import build_glb
from api.orders.models import AuditEntry, Decision, DraftRequest, Order
from api.orders.service import render_audit_text
from api.services import Deps, Services

router = APIRouter(prefix="/orders", tags=["orders"])

IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key", max_length=128)]


async def _idempotent(svc: Services, scope: str, key: str | None, run: Callable[[], Awaitable[Order]]) -> Order:
    if key:
        cached = svc.store.idempotent_response(scope, key)
        if cached is not None:
            return Order.model_validate_json(cached)
    order = await run()
    if key:
        svc.store.remember_response(scope, key, order.model_dump_json())
    return order


@router.post("", status_code=201)
async def create_draft(svc: Deps, body: DraftRequest, key: IdempotencyKey = None) -> Order:
    return await _idempotent(svc, f"draft:{body.session_id}", key, lambda: svc.orders.create_draft(body, actor="buyer"))


@router.get("")
def list_orders(svc: Deps, session_id: Annotated[str, Query(max_length=64)]) -> list[Order]:
    return svc.orders.list_for_session(session_id)


@router.get("/{order_id}")
def get_order(svc: Deps, order_id: str) -> Order:
    return svc.orders.get(order_id)


@router.post("/{order_id}/agree")
async def agree(svc: Deps, order_id: str, key: IdempotencyKey = None) -> Order:
    return await _idempotent(svc, f"agree:{order_id}", key, lambda: svc.orders.agree(order_id, actor="buyer"))


@router.post("/{order_id}/place")
async def place(svc: Deps, order_id: str, key: IdempotencyKey = None) -> Order:
    return await _idempotent(svc, f"place:{order_id}", key, lambda: svc.orders.place(order_id, actor="buyer"))


@router.post("/{order_id}/approve")
async def approve(svc: Deps, order_id: str, body: Decision, key: IdempotencyKey = None) -> Order:
    return await _idempotent(
        svc, f"approve:{order_id}", key, lambda: svc.orders.decide(order_id, approve=True, reason=body.reason)
    )


@router.post("/{order_id}/reject")
async def reject(svc: Deps, order_id: str, body: Decision, key: IdempotencyKey = None) -> Order:
    return await _idempotent(
        svc, f"reject:{order_id}", key, lambda: svc.orders.decide(order_id, approve=False, reason=body.reason)
    )


@router.get("/{order_id}/audit")
def audit(svc: Deps, order_id: str) -> list[AuditEntry]:
    return svc.orders.audit(order_id)


@router.get("/{order_id}/audit.txt", response_class=PlainTextResponse)
def audit_text(svc: Deps, order_id: str) -> str:
    order = svc.orders.get(order_id)
    return render_audit_text(order, svc.orders.audit(order_id))


@router.get("/{order_id}/footprint")
def footprint(svc: Deps, order_id: str) -> Footprint:
    order = svc.orders.get(order_id)
    return compute_layout(order, svc.catalog, svc.settings.ar_max_stack_height_m).footprint


@router.get("/{order_id}/ar-model.glb")
def ar_model(svc: Deps, order_id: str) -> Response:
    order = svc.orders.get(order_id)
    layout = compute_layout(order, svc.catalog, svc.settings.ar_max_stack_height_m)
    glb = build_glb(layout.boxes, [li.name for li in order.lines])
    return Response(
        glb,
        media_type="model/gltf-binary",
        headers={"Cache-Control": "private, max-age=60", "Content-Disposition": f'inline; filename="{order_id}.glb"'},
    )
