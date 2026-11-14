"""Approval endpoints for the order console. They act as the shared company agent on any order of the company."""

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from api.orders.models import AuditEntry, Decision
from api.procurement.schemas import OrderView
from api.routes._idempotency import IdempotencyKey, idempotent_decision
from api.services import Agent, Deps

router = APIRouter(prefix="/orders", tags=["approval"])


@router.get("/{order_id}")
def get_order(svc: Deps, agent: Agent, order_id: str) -> OrderView:
    return svc.procurement.get_order(agent, order_id)


@router.post("/{order_id}/approve")
async def approve(svc: Deps, agent: Agent, order_id: str, body: Decision, key: IdempotencyKey = None) -> OrderView:
    return await idempotent_decision(svc, agent, order_id, body, approve=True, key=key)


@router.post("/{order_id}/reject")
async def reject(svc: Deps, agent: Agent, order_id: str, body: Decision, key: IdempotencyKey = None) -> OrderView:
    return await idempotent_decision(svc, agent, order_id, body, approve=False, key=key)


@router.get("/{order_id}/audit")
def audit(svc: Deps, agent: Agent, order_id: str) -> list[AuditEntry]:
    return svc.procurement.audit(agent, order_id).entries


@router.get("/{order_id}/audit.txt", response_class=PlainTextResponse)
def audit_text(svc: Deps, agent: Agent, order_id: str) -> str:
    return svc.procurement.audit(agent, order_id).text
