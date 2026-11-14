---
phase: 3
title: MCP cancel_order with elicitation
status: completed
depends_on: [2]
---

# Phase 3: MCP `cancel_order` with elicitation

## Context

`apps/api/src/api/mcp/server.py` has `decide()` (line 457), which checks
`_supports_form_elicitation(ctx)`, calls `ctx.elicit(message, schema)` and maps decline or cancel to
an `OrderError`. `_run` turns `OrderError` into a tool failure. `_DECIDE` holds the destructive tool
annotations. Tests use the in-memory client with `elicitation_callback` in `apps/api/tests/test_mcp.py`.

## Requirements

- Tool `cancel_order(order_id, reason, replaced_by: str | None = None)`, annotations `_DECIDE`.
  Description: "Cancel an order that has not shipped (placed, pending_approval or approved).
  Refused with already_shipped once it ships. Cancelling an approved order asks the human through a
  form, unless replaced_by names the new order the human asked for in its place (placed or
  approved). Place the replacement first."
- Flow inside `_run`:
  1. `order = svc.get_order(agent, order_id)`.
  2. If `order.status` is not `approved`, or `replaced_by` is set, call `svc.cancel(...)` directly
     with `confirmed_via="replacement"` when `replaced_by` is set and the order is approved, and
     `"agent"` otherwise. Phase 2's checks apply.
  3. If the order is `approved` and has no `replaced_by`, the human must confirm:
     - No form elicitation support: `elicitation_required`, nothing cancelled. Reuse the check from
       `decide()` by extracting a small `_require_elicitation(ctx, tool)` helper so both use it.
     - Message: order id, placing agent, total, delivery date, the approval it undoes
       (`decision.decided_by.name` and its reason) and the agent's reason.
     - Schema `CancelForm`: `confirm: bool` (default true) and `reason: str` (required, default the
       agent's reason).
     - `action != "accept"` or `confirm is False`: `OrderError("cancel_declined", ...)`, nothing
       cancelled.
     - Otherwise call `svc.cancel(..., reason=form.reason, confirmed_via="mcp_elicitation")`.
       Shipping during the form is caught by the lock in `OrderService.cancel` and surfaces as
       `already_shipped`.
- `_order_summary`: say "cancelled (replaced by X)" or "shipped" when applicable.
- `list_orders` status literal gains `"shipped"` and `"cancelled"`.
- Server instructions text (line ~70): add one sentence on cancel and the replace rule.

## Files

- Modify: `apps/api/src/api/mcp/server.py`.
- Tests: `apps/api/tests/test_mcp.py`.

## Tests

- A placed order cancels with no elicitation callback invoked.
- An approved order with no `replaced_by`: the callback is invoked, accept records the form's reason
  and `confirmed_via: mcp_elicitation`, decline gives `cancel_declined` and the status stays
  `approved`, and a client without elicitation gives `elicitation_required`.
- An approved order with a valid `replaced_by` cancels with no callback and records `replacement`.
  A `replaced_by` that is still pending gives `replacement_pending`, and the old order stays `approved`.
- A shipped order gives `already_shipped`.
- `list_orders(status="cancelled")` works.

## Validation

`cd apps/api && uv run pytest tests/test_mcp.py`, then `mise run check`.
