---
phase: 1
title: Approval only for the spend limit; mandate violations refused
status: completed
depends_on: []
---

# Phase 1: Approval only for the spend limit; mandate violations refused

## Context

`ApprovalPolicy.evaluate` (`apps/api/src/api/orders/policy.py`) returns a reason for an order over
the spend limit and for every line with `within_preferences == False`. Lines get
`missing_requirements` in `ProcurementService._order_from_quote` (`procurement/service.py`), checked
against `quote.requirements`, which holds the buyer's requirements plus the agent's mandate tags
(`Mandate.requirement_tags()`: `required_tags` and `no:<allergen>` for `banned_allergens`).

Decision (user, 2026-11-14): ask the buyer to approve or reject only when the order total is over the
limit. A line that misses only the buyer's own preferences is the buyer's pick in the offer prompt
and is placed. A line that breaks the owner's mandate is refused.

## Requirements

- `ApprovalPolicy.evaluate` returns only the spend-limit reason. Remove the per-line loop.
- `_order_from_quote`: for each line compute
  `violations = [t for t in missing if t in agent.mandate.requirement_tags()]`. If any line has
  violations, raise `OrderError("mandate_violation", "<name> breaks this agent's mandate (<tags>);
  choose another product", status=422, details={"lines": [{"product_id", "violations"}]})`. Nothing
  is created. Use the agent's mandate at placement time (the current, stricter source).
- Lines that miss only buyer requirements keep `within_preferences=False` and
  `missing_requirements`, so the order record and audit show the miss (goal B5).
- The first audit entry's summary for a placed order with missed preferences says so, for example
  "Placed within the agent's authority; buyer accepted missing LACTOSE_FREE on 469330".
- Quote tool: `QuoteOption` gains `breaks_mandate: bool` (true when any missing tag is a mandate tag),
  so the agent can drop those options before offering them. `meets_requirements` is unchanged.
- MCP `INSTRUCTIONS` and tool descriptions: approval is only for the spend limit, and mandate
  violations are refused.

## Files

- Modify: `apps/api/src/api/orders/policy.py`, `apps/api/src/api/procurement/service.py`,
  `apps/api/src/api/procurement/schemas.py`, `apps/api/src/api/mcp/server.py`,
  `apps/api/src/api/procurement/errors.py` (register `mandate_violation` if codes are listed there).
- Tests: `apps/api/tests/test_policy.py`, `apps/api/tests/test_procurement.py`,
  `apps/api/tests/test_agent_api.py`, `apps/api/tests/test_mcp.py`.

## Steps

1. Simplify `evaluate`; update `test_policy.py`.
2. Add the mandate check to `_order_from_quote` and `breaks_mandate` to quote options.
3. Update tests that expect a requirements miss to escalate: they now expect `placed` (buyer
   requirement) or `422 mandate_violation` (mandate tag, for example an agent with
   `banned_allergens=["AM"]` ordering a milk product).
4. Add: under-limit order with a missed buyer requirement is `placed` with `missing_requirements` in
   the record and audit; over-limit order with a missed buyer requirement is pending with only the
   spend reason; mandate violation creates no order and leaves the quote unused.

## Validation

`cd apps/api && uv run pytest tests/test_policy.py tests/test_procurement.py tests/test_agent_api.py tests/test_mcp.py`,
then `mise run typecheck:api`.

## Risks and rollback

Orders already stored as `pending_approval` for a requirements miss stay pending and can still be
decided. Rollback: revert the phase.
