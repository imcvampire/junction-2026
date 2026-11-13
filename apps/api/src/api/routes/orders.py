"""Approval endpoints for the order console. They take an agent key: approving needs an admin key of the
order's customer, and reads show the caller's own orders or, for an admin, the customer's orders."""

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from api.agents.auth import Agent
from api.orders.models import AuditEntry, Decision
from api.procurement.schemas import OrderView
from api.routes._idempotency import IdempotencyKey, idempotent_decision
from api.services import Deps

router = APIRouter(prefix="/orders", tags=["approval"])


@router.get("/{order_id}")
def get_order(svc: Deps, agent: Agent, order_id: str) -> OrderView:
    return svc.procurement.get_order(agent, order_id)


@router.post("/{order_id}/approve")
async def approve(svc: Deps, agent: Agent, order_id: str, body: Decision, key: IdempotencyKey = None) -> OrderView:
    return await idempotent_decision(svc, agent, order_id, approve=True, reason=body.reason, key=key)


@router.post("/{order_id}/reject")
async def reject(svc: Deps, agent: Agent, order_id: str, body: Decision, key: IdempotencyKey = None) -> OrderView:
    return await idempotent_decision(svc, agent, order_id, approve=False, reason=body.reason, key=key)


@router.get("/{order_id}/audit")
def audit(svc: Deps, agent: Agent, order_id: str) -> list[AuditEntry]:
    return svc.procurement.audit(agent, order_id).entries


@router.get("/{order_id}/audit.txt", response_class=PlainTextResponse)
def audit_text(svc: Deps, agent: Agent, order_id: str) -> str:
    return svc.procurement.audit(agent, order_id).text
