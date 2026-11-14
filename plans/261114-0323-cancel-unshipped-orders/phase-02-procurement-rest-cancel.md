---
phase: 2
title: Cancel rules, replacement check and REST routes
status: completed
depends_on: [1]
---

# Phase 2: Cancel rules, replacement check and REST routes

## Context

`ProcurementService` (`apps/api/src/api/procurement/service.py`) authorizes every order operation
(`_visible_order`) before calling `OrderService`. REST decisions go through `idempotent_decision`
(`apps/api/src/api/routes/_idempotency.py:31`). The agent surface is `routes/agent.py`
(`/api/agent/v1`) and the console is `routes/orders.py` (`/api/orders`).

## Requirements

- `ProcurementService.cancel(agent, order_id, *, reason, replaced_by=None, confirmed_via) -> OrderView`:
  1. `order = self._visible_order(agent, order_id)`; `reason = reason.strip()`.
  2. If the order is already `cancelled`, return it (idempotent repeat, before any other check).
  3. Blank reason: `OrderError("reason_required", ..., status=422)`.
  4. If `replaced_by` is set, call `self._check_replacement(agent, order, replaced_by)`:
     - The replacement order is found with `_visible_order` (404 is turned into
       `422 invalid_replacement`). It must not be the same id and must have
       `created_at > order.created_at`. Otherwise raise `422 invalid_replacement`.
     - Status `pending_approval`: `409 replacement_pending` with the replacement's id and status in
       details. Status not `placed` or `approved`: `422 invalid_replacement`.
  5. Call `self._orders.cancel(...)`, which applies the shipped and state rules under the lock.
- `ProcurementService.ship(agent, order_id) -> OrderView`: `_visible_order`, then `self._orders.ship`.
- `ProcurementService.cancel_needs_human(order, replaced_by) -> bool`: true when the status is
  `approved` and `replaced_by` is unset. Phase 3 uses it. REST ignores it (see Constraints in plan.md).
- `confirmed_via` passed by each caller: REST agent and console routes pass `"rest"`. MCP passes
  `"agent"`, `"replacement"` or `"mcp_elicitation"` (phase 3).
- Request body `CancelRequest` (`orders/models.py`, next to `Decision`): `reason: str`
  (max 1000 chars, required) and `replaced_by: str | None`.
- Routes:
  - `POST /api/agent/v1/orders/{order_id}/cancel` and `POST /api/orders/{order_id}/cancel`
    with body `CancelRequest` and `Idempotency-Key`. Add `idempotent_cancel` next to
    `idempotent_decision`, with scope `cancel:{agent_id}:{order_id}`.
  - `POST /api/orders/{order_id}/ship` (console only, tag `ops`), with no body. Ship is naturally
    idempotent, so it needs no key.
- Errors flow through the existing `OrderError` handler. No new handler is needed.

## Files

- Modify: `apps/api/src/api/procurement/service.py`, `apps/api/src/api/orders/models.py`,
  `apps/api/src/api/routes/_idempotency.py`, `apps/api/src/api/routes/agent.py`,
  `apps/api/src/api/routes/orders.py`.
- Tests: `apps/api/tests/test_procurement.py`, `apps/api/tests/test_agent_api.py`.

## Tests

- Service: each replacement rule (missing, same id, older, other customer, pending, rejected, placed,
  approved). A cancel with an invalid replacement leaves the old order unchanged.
- REST agent route: cancel a placed order gives 200 and `cancelled`. A shipped order gives 409
  `already_shipped`. A blank reason gives 422. A replayed `Idempotency-Key` gives the same body.
- Console: `POST /api/orders/{id}/ship` then cancel gives `already_shipped`. Ship of a pending
  order gives 409 `invalid_state`.
- An approved order cancelled over REST is accepted with `confirmed_via: rest`.

## Validation

`cd apps/api && uv run pytest tests/test_procurement.py tests/test_agent_api.py`, then lint and typecheck.

## Risk

The REST approved-order cancel trusts the caller, as REST approvals already do. It is documented in
phase 4 under "Known demo limitations".
