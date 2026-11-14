---
phase: 1
title: Shipped and cancelled statuses in the order service
status: completed
depends_on: []
---

# Phase 1: Shipped and cancelled statuses in the order service

## Context

`OrderService` (`apps/api/src/api/orders/service.py`) owns every status transition under
`self._locks[order_id]` and writes audit entries through `Store.save_order`. `decide` and
`close_stale` are the patterns to follow. `OrderStatus` is in `apps/api/src/api/orders/models.py:12`.

## Requirements

- `OrderStatus` gains `SHIPPED = "shipped"` and `CANCELLED = "cancelled"`.
- `orders/models.py`:
  - `CancelVia = Literal["agent", "rest", "mcp_elicitation", "replacement"]`.
  - `class Cancellation(BaseModel)`: `reason: str`, `at: datetime`, `cancelled_by: DecidedBy`,
    `confirmed_via: CancelVia`, `replaced_by: str | None = None`.
  - `Order.cancellation: Cancellation | None = None` and `Order.shipped_at: datetime | None = None`.
- `OrderService.ship(order_id) -> Order`: inside the lock, re-read the order. If it is already
  `shipped`, return it unchanged. If it is not `placed` or `approved`, raise
  `OrderError("invalid_state", ...)`. Otherwise set `shipped`, `shipped_at` and `updated_at`, and
  write the audit entry `shipped` (actor `system`, details `from`/`to`). Log `order_shipped`.
- `OrderService.cancel(order_id, *, reason, cancelled_by, confirmed_via, replaced_by=None) -> Order`:
  inside the lock, re-read the order:
  - `cancelled`: return it unchanged.
  - `shipped`: raise `OrderError("already_shipped", ..., details={"shipped_at": ...})`.
  - not `placed`, `pending_approval` or `approved`: raise `invalid_state`.
  - Otherwise set `cancelled` and `cancellation`, and write the audit entry `cancelled`. The actor is
    `approver` when `confirmed_via == "mcp_elicitation"` and `agent` otherwise. Details hold
    `from`, `to`, `cancelled_by`, `confirmed_via` and `replaced_by`. Log `order_cancelled`.
  - The re-read inside the lock is what decides the ship/cancel race. The caller's earlier checks are
    advisory.
- `render_audit_text`: print a `Cancelled by <name>` line (with "replaced by <id>" when set) and a
  `Shipped` line. The order header already prints the status.
- `OrderView` (`procurement/schemas.py`) gains `cancellation` and `shipped_at`, mapped in `OrderView.of`.
- Run `rg -n "OrderStatus\.|Literal\[\"placed\"" apps/api/src apps/api/tests` and update every
  enumeration that must know the new statuses. The MCP `list_orders` literal is phase 3.

## Files

- Modify: `apps/api/src/api/orders/models.py`, `apps/api/src/api/orders/service.py`,
  `apps/api/src/api/procurement/schemas.py`.
- Tests: `apps/api/tests/test_procurement.py`, or a new `apps/api/tests/test_orders.py` if the
  service-level tests do not fit there. Check how `test_procurement.py` builds an `OrderService` first.

## Tests

- Ship from `placed` and from `approved` gives `shipped` and an audit entry. Ship from
  `pending_approval`, `rejected` or `cancelled` is `invalid_state`. A second ship is a no-op.
- Cancel from each of `placed`, `pending_approval` and `approved` sets `cancellation` and the audit
  actor (`agent` and `approver`). Cancel of a shipped order is `already_shipped`, of a rejected
  order is `invalid_state`, and of a cancelled order is a no-op.
- Race: `asyncio.gather(svc.ship(id), svc.cancel(id, ...), return_exceptions=True)` gives one
  success and one `OrderError`, and the stored status matches the winner.
- An order JSON without `cancellation` or `shipped_at` loads.

## Validation

`cd apps/api && uv run pytest tests/test_procurement.py` (plus `tests/test_orders.py` if added),
then `uv run ruff check src tests` and the project typecheck from `mise.toml`.

## Rollback

Revert the commit. Rows written as `shipped` or `cancelled` would then fail to load. On a demo
database, delete `apps/api/data/app.sqlite3*`, which is local runtime state.
