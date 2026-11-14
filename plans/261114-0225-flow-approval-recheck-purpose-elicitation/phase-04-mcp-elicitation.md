---
phase: 4
title: MCP elicitation for approve and reject
status: pending
depends_on: [2]
---

# Phase 4: MCP elicitation for approve and reject

## Context

Only orders over the spend limit reach `pending_approval` (phase 1), so these tools only ever ask
the buyer about spend.


`approve_order` and `reject_order` in `apps/api/src/api/mcp/server.py` call
`svc.decide(agent, order_id, approve=..., reason=...)` with the agent's arguments. The installed SDK
(`mcp` 1.30) offers `Context.elicit(message, schema)` on the server and `elicitation_callback` on
`ClientSession`. Elicitation makes the host show the human a form, so the decision comes from the
human rather than from the model.

## Requirements

- Capability check: if the client did not advertise `elicitation` at initialize
  (`ctx.session.client_params.capabilities.elicitation` is unset), raise `ToolFailure` with
  `{"code": "elicitation_required", "message": "This MCP client cannot show an approval form; decide
  in the order console or over REST", "details": {}}`. Nothing is decided.
- Flow for both tools:
  1. Load the order with `svc.get_order` (visibility and 404 as today). If it is not
     `pending_approval`, call `svc.decide` directly so the existing idempotent repeat or
     `invalid_state` answer is returned without a form.
  2. For approve, run the phase 2 re-check without deciding: expose
     `ProcurementService.recheck_for_approval(agent, order_id) -> RecheckResult` (unchanged,
     `price_changed` with new total, or closes the order and raises `stock_changed`). `decide`
     uses the same method internally, so there is one implementation.
  3. Elicit with a Pydantic schema `DecisionForm(decision: Literal["approve", "reject"], reason:
     str)` (min length 1). The message names the order, placing agent, total, approval reasons, and
     for a price change the old and new totals per line. The default `decision` is the tool's verb
     and the default `reason` is the tool's optional `reason` argument.
  4. `accept`: call `svc.decide(agent, order_id, approve=form.decision == "approve",
     reason=form.reason, expected_total=<new total if repriced, else order.total>)`. The human may
     switch approve to reject in the form; record what the human chose.
  5. `decline` or `cancel`: raise `ToolFailure` with code `decision_cancelled`; nothing decided.
- Tool signatures: `reason` becomes optional (`str | None`, max 1000) and is described as a
  suggestion shown to the human. Update `_DECIDE_RULE` and `INSTRUCTIONS` to say the server asks the
  human through the host.
- Audit: the decision entry's details gain `"confirmed_via": "mcp_elicitation"`; REST decisions record
  `"confirmed_via": "rest"`. Pass it through `ProcurementService.decide` as a keyword.
- Logging: `decision_elicited order_id action=accept|decline|cancel`.

## Files

- Modify: `apps/api/src/api/mcp/server.py`, `apps/api/src/api/procurement/service.py`,
  `apps/api/src/api/orders/service.py`, `apps/api/src/api/routes/_idempotency.py`.
- Tests: `apps/api/tests/test_mcp.py` (extend `mcp_session` with an optional
  `elicitation_callback`).

## Steps

1. Factor phase 2's re-check out of `decide` into `recheck_for_approval`.
2. Add the capability check, form schema and elicitation flow to both tools.
3. Thread `confirmed_via` into the audit.
4. Tests: client without elicitation → `elicitation_required`, order still pending; accept approve →
   approved with the form's reason and `confirmed_via`; form switches to reject → rejected; decline
   and cancel → `decision_cancelled`, still pending; price changed → the message contains the new
   total and accepting approves at the new prices; stock changed → no form, `stock_changed`, order
   closed; already approved → idempotent answer without a form; foreign customer → 404 without a
   form.

## Validation

`cd apps/api && uv run pytest tests/test_mcp.py`, then `mise run check`.

## Risks and rollback

If the demo host lacks elicitation, every MCP decision is refused (accepted by the user's choice of
"required on MCP"). Rollback: revert this phase; phases 1-3's REST and service behaviour stay intact.
