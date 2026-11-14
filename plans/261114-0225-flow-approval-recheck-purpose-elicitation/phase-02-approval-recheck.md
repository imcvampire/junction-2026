---
phase: 2
title: Re-check price and stock on approval
status: completed
depends_on: [1]
---

# Phase 2: Re-check price and stock on approval

## Context

`ProcurementService.decide` (`apps/api/src/api/procurement/service.py`) authorizes and calls
`OrderService.decide` (`apps/api/src/api/orders/service.py:57`), which changes status under a
per-order lock. `place_order` already re-quotes with `self._valio.invalidate(...)` +
`self._valio.quote(...)` and compares with `quote_changes(order, fresh)`. Approval reuses both.

## Requirements

- `ProcurementService.decide(agent, order_id, *, approve, reason, expected_total: float | None = None)`.
  - Reject path: unchanged, no upstream call.
  - Approve path:
    1. Load the visible order; if not `pending_approval`, let `OrderService` raise as today (same
       idempotent repeat for an already-approved order).
    2. Re-quote the order's lines for `order.delivery_date` and `order.customer` (invalidate the cache
       first, as `place_order` does). Upstream errors propagate unchanged; nothing is decided.
    3. `changes = quote_changes(order, fresh)`.
    4. Any change with a problem other than `price_changed` (stock, sales block, no price): close
       the order through `OrderService.close_stale(order_id, changes)` and raise
       `OrderError("stock_changed", ..., status=409, details={"changes": changes, "rerun": {...}})`.
       `rerun` holds what the agent needs to re-run the flow without re-asking the buyer:
       `request_text`, `requirements`, `purpose` (phase 3; `None` until then), `delivery_date`, and
       the closed order's lines (`product_id`, `quantity`, `substitute_for`). The message says the
       order was closed and to quote again from the availability check.
    5. Only `price_changed`: compute the repriced lines and `new_total`. If `expected_total` is
       `None` or differs from `new_total` when both are rounded to cents, raise `OrderError("price_changed", ..., status=409, details={"changes":
       changes, "old_total": order.total, "new_total": new_total})`. Otherwise approve with the
       repriced lines.
    6. No change: approve as today. A supplied `expected_total` that differs from `order.total` is
       refused with `price_changed` too, so a stale confirmation never approves.
- `OrderService.decide(..., reprice: dict[str, float] | None = None)`: inside the lock, re-read the
  order, require `pending_approval`, apply new unit prices, recompute line totals and `order.total`,
  and write one audit entry `repriced` (actor `approver`, details old/new per line and totals) before
  the `approved` entry.
- `OrderService.close_stale(order_id, changes)`: inside the lock, require `pending_approval`, set
  `rejected`, `decision = OrderDecision(approved=False, reason=..., at=now, decided_by=None)`, audit
  actor `system`, action `rejected`, details `{"changes": changes}`. Log `order_closed_stale`.
- REST: `Decision` body (`orders/models.py`) gains `expected_total: float | None = Field(default=None, gt=0)`.
  `/api/agent/v1/orders/{id}/approve` and `/api/orders/{id}/approve` pass it through
  `idempotent_decision`. Idempotency scope unchanged; a replayed key returns the first response.
- `render_audit_text`: the `repriced` entry prints old and new totals; system closures print actor
  `system`.
- New error codes in `procurement/errors.py` if codes are registered there: `price_changed`,
  `stock_changed` (both 409).

## Files

- Modify: `apps/api/src/api/procurement/service.py`, `apps/api/src/api/orders/service.py`,
  `apps/api/src/api/orders/models.py`, `apps/api/src/api/routes/_idempotency.py`,
  `apps/api/src/api/routes/agent.py`, `apps/api/src/api/routes/orders.py`.
- Tests: `apps/api/tests/test_procurement.py`, `apps/api/tests/test_agent_api.py`.

## Steps

1. Add `close_stale` and the `reprice` input to `OrderService`.
2. Add the re-check to `ProcurementService.decide`; thread `expected_total`.
3. Extend `Decision` and the two REST routes.
4. Update `render_audit_text`.
5. Tests (service level, using `FakeValio` to move price or stock between placement and approval):
   unchanged approve; price up → 409 with totals, still pending; approve with matching
   `expected_total` → approved, repriced, audit `repriced` + `approved`; wrong `expected_total` → 409;
   stock short → 409 `stock_changed` with `rerun` matching the original quote, order rejected, actor `system`, `decided_by` null; reject makes
   no upstream call; upstream failure leaves the order pending; concurrent decision after re-check →
   `invalid_state`.
6. REST tests for `expected_total` on both route families.

## Validation

`cd apps/api && uv run pytest tests/test_procurement.py tests/test_agent_api.py`, then
`mise run typecheck:api`.

## Risks and rollback

Changing `OrderService.decide`'s signature touches every caller; pyright finds them. Rollback is a
revert of this phase: no stored-data migration, and repriced orders stay valid JSON.
