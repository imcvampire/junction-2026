---
phase: 2
title: Authorization and approval in the procurement service
status: completed
depends_on: [1]
---

# Phase 2: Authorization and approval in the procurement service

## Context

`ProcurementService` (`apps/api/src/api/procurement/service.py`) is the single place both
transports call, so every authorization rule lives here. `OrderService.decide`
(`orders/service.py:56`) already does the locked state transition and idempotent repeat. This phase
wraps it with "who may decide" and records who did.

## Requirements

- `OrderDecision` gains `decided_by: DecidedBy | None = None`, where
  `DecidedBy(agent_id, name, role)`. It is optional, so stored orders still load.
- `OrderService.decide(order_id, *, approve, reason, decided_by: DecidedBy)` sets
  `decision.decided_by`. The audit entry gets `actor="approver"`, `agent_id=decided_by.agent_id`,
  and `details={"decided_by": ...}`. The summary becomes `"Approved by <name> (<agent_id>): <reason>"`.
  Update `render_audit_text` if it prints the approver.
- `ProcurementService` additions:
  - `_require_admin(agent)`: raise `OrderError("forbidden", "This key is not allowed to approve or
    view company orders; ask an admin", status=403)` and log `authz_denied agent_id=%s op=%s`.
  - `_visible_order(agent, order_id)`: replaces `_agent_order` for reads. An order is visible to its
    own agent, or to an admin when `order.customer == agent.customer`. Otherwise it returns 404 as
    before.
  - `get_order` and `audit` use `_visible_order`.
  - `list_orders(agent, status, limit, scope: Literal["mine","company"]="mine")`. `company` requires
    admin and calls a new `Store.list_customer_orders(customer, status, limit)`.
  - `list_pending_approvals(agent, limit)` is admin-only, equivalent to
    `list_orders(scope="company", status=PENDING_APPROVAL)`, oldest first so the queue is FIFO.
  - `decide(agent, order_id, *, approve, reason)`: `_require_admin`, then `_visible_order` (404 across
    customers), then refuse when `order.agent_id == agent.agent_id` with
    `OrderError("self_approval_forbidden", ..., status=403)`. Reason must be non-empty after strip
    (`422 reason_required`). Then call `OrderService.decide`. Log `order_decided order_id agent_id
    approve`.
- `whoami` / `Principal` gains `role: Role` and `can_approve: bool`.
- `OrderView` exposes `decision.decided_by` and the placing `agent_id`, so an admin can see who
  ordered.
- `Store.list_customer_orders`: the customer is inside the `data` JSON today. Add a `customer TEXT`
  column on `orders` (additive migration, backfilled with `json_extract(data,'$.customer')`), write
  it in `_write_order`, and index `(customer, status, updated_at)`. Do not scan the JSON at query time.
- The `ProcurementService` constructor needs `OrderService`. Check `services.py` wiring.

## Files

Modify: `orders/models.py`, `orders/service.py`, `orders/store.py`, `procurement/service.py`,
`procurement/schemas.py`, `services.py`. Tests: `apps/api/tests/test_procurement.py`.

## Test matrix (`test_procurement.py`)

| Case | Expect |
|---|---|
| member `decide` | 403 `forbidden`, order unchanged |
| member `list_orders(scope="company")`, `list_pending_approvals` | 403 |
| admin same customer approves a member's pending order | `approved`, `decided_by.agent_id` = admin; member `get_order` reads it |
| admin rejects with reason | `rejected`, reason stored, audit entry actor `approver`, agent_id = admin |
| admin, other customer's order | 404 `order_not_found` |
| admin decides its own escalated order | 403 `self_approval_forbidden` |
| decide a `placed` order | 409 (existing `OrderService` behaviour, unchanged) |
| repeat approve | idempotent, single audit entry (existing behaviour, still true with `decided_by`) |
| empty reason | 422 `reason_required` |
| admin `get_order` / `audit` on a member's order, same customer | visible |
| member `get_order` on another member's order, same customer | 404 (unchanged) |
| `list_pending_approvals` | only same-customer `pending_approval` orders, oldest first |
| old stored order JSON without `decided_by` | loads |

## Validation

```bash
cd apps/api && uv run pytest tests/test_procurement.py tests/test_agent_registry.py && uv run pyright
```

## Risk and rollback

The `orders.customer` backfill is the only data change; back up the DB first (phase 1 backup covers it
if both run together). All model fields are optional, so revert is code-only.
