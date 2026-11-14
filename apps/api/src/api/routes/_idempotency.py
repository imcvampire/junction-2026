"""Replay of state-changing responses under a client-supplied `Idempotency-Key`."""

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Header
from pydantic import BaseModel

from api.agents.models import AgentPrincipal
from api.orders.store import Store
from api.procurement.schemas import OrderView
from api.services import Services

IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key", max_length=128)]


async def idempotent[M: BaseModel](
    store: Store, scope: str, key: str | None, model: type[M], run: Callable[[], Awaitable[M]]
) -> M:
    if key:
        cached = store.idempotent_response(scope, key)
        if cached is not None:
            return model.model_validate_json(cached)
    result = await run()
    if key:
        store.remember_response(scope, key, result.model_dump_json())
    return result


async def idempotent_decision(
    svc: Services, agent: AgentPrincipal, order_id: str, *, approve: bool, reason: str, key: str | None
) -> OrderView:
    """Approve or reject; a repeated key from the same agent replays the first response."""
    return await idempotent(
        svc.store,
        f"{'approve' if approve else 'reject'}:{agent.agent_id}:{order_id}",
        key,
        OrderView,
        lambda: svc.procurement.decide(agent, order_id, approve=approve, reason=reason),
    )
