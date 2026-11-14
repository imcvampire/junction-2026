---
title: Follow the flow on approval - spend-only approval, re-check, buyer purpose and MCP elicitation
description: Ask for approval only over the spend limit and refuse mandate violations, re-check price and stock when an order is approved, carry the buyer's purpose through quote, order and audit, and make MCP approve/reject ask the human through elicitation.
status: pending
priority: P1
effort: 7h
branch: master
tags: [api, mcp, skill, docs]
blockedBy: []
blocks: []
created: 2026-11-14
goals: docs/project-goals.md
builds_on: plans/261113-2255-agent-roles-admin-approval
---

# Follow the flow on approval: spend-only approval, re-check, buyer purpose and MCP elicitation

## Outcome

The backend and the customer skill behave as [`docs/flow.md`](../../docs/flow.md) draws them:

- **The buyer is asked to approve or reject only when the order total is over the purchase limit.**
  A line that misses only the buyer's own preferences is the buyer's pick in the offer prompt and is
  placed, with the miss recorded. A line that breaks the agent's mandate (required tags, banned
  allergens) is refused with `422 mandate_violation`.
- **Approval re-checks price and stock** (flow `H -- Yes --> R`). If only the price changed, the human
  sees the new price and total and must confirm again. If stock no longer covers the order, the order
  is closed, the agent tells the buyer what ran out, and the flow re-runs from the availability check
  (`RA -- stock short --> ST --> B`) with the request, requirements, purpose and date it already has.
- **The buyer's purpose** (flow `U`/`Q2`) is an optional structured field, frozen on the quote,
  copied to the order, and shown in `OrderView` and the audit trail, so substitutions carry their
  reason (goal B5).
- **On MCP, `approve_order` and `reject_order` ask the human themselves** through MCP elicitation. The
  decision and reason come from the host's form, not from the agent's arguments. An MCP client
  without elicitation support is refused.

## Constraints

- Prices stay fixed (goal A3). An order is never approved at a price the human has not seen.
- The server enforces, the skill guides (goal S2).
- Stored orders without the new fields still load. No destructive schema change; the order body is
  JSON, so new fields are additive.
- REST (`/api/agent/v1`, console `/api/orders`) cannot elicit. It keeps working with an explicit
  price confirmation (`expected_total`) and keeps the documented "server cannot prove a human said
  yes" limitation.
- Same idempotency and locking as today: one decision per order, under `OrderService`'s per-order lock.

## Non-goals

- Pending-approval expiry or reminders.
- Re-running the spend-limit check on a repriced order: the human is already approving it.
- A human login for the console (open question 3 in `docs/project-goals.md`).
- Elicitation on REST, or elicitation for steps other than approve and reject (the skill's
  "Asking the buyer" section covers those).
- Making `purpose` required.

## Where the code stands

| Concern | Today | Gap |
|---|---|---|
| Escalation | `ApprovalPolicy.evaluate` (`orders/policy.py`) escalates for the spend limit and for any line with `within_preferences == False`. | Requirement misses must stop escalating; mandate misses must be refused. |
| Approve | `ProcurementService.decide` → `OrderService.decide` (`orders/service.py:57`) only changes status. | No re-check; an approval hours later keeps the old price. |
| Re-check helper | `quote_changes(order, fresh)` (`orders/service.py:113`) returns per-line `price_changed`, `no_price`, `sales_block`, `not_available_in_time`. Used only at placement (`procurement/service.py:196`). | Reusable as is for approval. |
| Purpose | Not in `QuoteRequest`, `QuoteView`, `Order` or the audit. | New optional field end to end. |
| MCP decisions | `approve_order` / `reject_order` take `reason` from the agent; `destructiveHint` only. | No proof the human answered. SDK `mcp` 1.30 has `Context.elicit(message, schema)` and the test client has `elicitation_callback`. |

## Key decisions

| Decision | Chosen | Why |
|---|---|---|
| What needs approval | **Only an order total over the spend limit** (user, 2026-11-14). Buyer-preference misses are placed and recorded; mandate misses are refused at placement. | The buyer already chose the offer; the owner's mandate (for example banned allergens) must hold whatever the buyer picks. |
| Price changed at approval | **Refuse with `409 price_changed`**, order stays `pending_approval`, details give per-line was/now and the new total. Approving again with the new total confirmed reprices the lines and approves. On MCP the confirmation is part of the elicitation; on REST it is `expected_total` in the body. | The user's rule: present the new price and ask the human to confirm again. The order is never approved at an unseen price. |
| Stock no longer covers at approval | **Close the order**: status `rejected`, `decision.decided_by = None`, audit actor `system`, reason naming the short lines. Return `409 stock_changed` with the availability details and everything needed to re-run the flow (request text, requirements, purpose, delivery date, the closed order's lines). | User, 2026-11-14: inform the buyer and re-run the flow from the most suitable step, which is the availability check. No new status: the outcome is carried by the error and the agent's re-run. The old order cannot be fulfilled, so leaving it pending only clutters the queue. A system-closed order is distinguishable from a human rejection by actor and `decided_by`. |
| Price and stock both changed | Treat as **stock changed** (close). | The order cannot proceed whatever the price. |
| Upstream down during the re-check | `502 upstream_unavailable`, order unchanged and still pending. | Retryable; nothing was decided. |
| Where the re-check lives | `ProcurementService.decide`, which already owns the Valio client and the authorization. `OrderService.decide` gains a `reprice` input and a `close_as_stale` path, both under the existing per-order lock. | One place for both transports. |
| Race between re-check and decision | Re-check outside the lock (network call), then `OrderService` re-reads the order inside the lock and refuses with `invalid_state` if it is no longer pending. | No lock held across an upstream call; a second decider loses cleanly. |
| Purpose shape | `purpose: str \| None`, max 200 chars, free text (for example "coffee", "baking"). | Buyers' uses are open-ended; a fixed enum would not fit recipes. |
| Elicitation on MCP | Required for `approve_order` and `reject_order`. A client that did not advertise the `elicitation` capability gets `elicitation_required` (error, nothing decided). Decline or cancel gets `decision_cancelled` (nothing decided). | The user chose the strongest guarantee on MCP. |
| Elicitation form | Message: order id, placing agent, total, approval reasons, and the new price and total when it changed. Schema: `decision` (`approve` / `reject`, default from the tool called), `reason` (string, required). The decision and reason recorded are the human's, not the tool arguments. | One prompt covers both confirmations, so a price change does not need a second round trip. |
| Tool arguments | `approve_order(order_id, reason?)` and `reject_order(order_id, reason?)`: `reason` becomes an optional suggestion used as the form's default. | The human writes the final reason. |

### Extension trace

The next likely variant is a second decision surface that can prove a human answered, such as the
order console with a human login, or a REST callback. The stable contract is
`ProcurementService.decide(agent, order_id, *, approve, reason, confirmed_total)` plus the three
outcomes `approved`, `price_changed`, `stock_changed`. MCP elicitation is one adapter that fills
`approve`, `reason` and `confirmed_total` from a human form; a console login would be another. Phase 2
tests the outcomes at the service level, and phase 4 tests only the MCP adapter, which proves the
split. No confirmation-provider abstraction is introduced.

## Phases

| # | Phase | Depends on | Status |
|---|---|---|---|
| 1 | [Approval only for the spend limit; mandate violations refused](phase-01-spend-only-approval.md) | none | pending |
| 2 | [Re-check price and stock on approval](phase-02-approval-recheck.md) | 1 | pending |
| 3 | [Buyer purpose on quote, order and audit](phase-03-buyer-purpose.md) | 1 | pending |
| 4 | [MCP elicitation for approve and reject](phase-04-mcp-elicitation.md) | 2 | pending |
| 5 | [Skill, docs, flow and live check](phase-05-skill-docs-live-check.md) | 1, 2, 3, 4 | pending |

Run in order. Phases 1 to 3 all touch `procurement/service.py` and `procurement/schemas.py`, and
phases 2 and 3 both touch `orders/models.py` and `render_audit_text`, so they are not parallel.

## Acceptance criteria

1. Only an order whose total is over the agent's spend limit becomes `pending_approval`. An
   under-limit order with a line that misses a buyer requirement is `placed`, and its record and
   audit show the missed requirement. A line that misses a mandate tag (required tag or banned
   allergen) is refused with `422 mandate_violation`, and no order is created.
2. Approving an order whose prices and stock are unchanged behaves as today.
3. Approving after a price change returns `409 price_changed` with per-line `was`/`now` and the new
   total; the order stays `pending_approval`. Approving again with `expected_total` equal to the new
   total approves it with repriced lines and total, and the audit records the price change and the
   approval.
4. Approving after stock no longer covers a line returns `409 stock_changed`; the order becomes
   `rejected` with actor `system`, no `decided_by`, and a reason naming the short lines.
5. Rejecting never calls upstream.
6. A quote with `purpose` shows it in `QuoteView`, the placed order's `OrderView`, the first audit
   entry and `audit.txt`. Orders stored without `purpose` still load.
7. Over MCP, `approve_order` and `reject_order` send an elicitation and record the human's decision
   and reason. Decline or cancel decides nothing. A client without elicitation gets
   `elicitation_required` and nothing is decided. A price change is shown in the same elicitation.
8. REST decisions work without elicitation, with `expected_total` for price changes.
9. The skill, `docs/backend-api.md`, `docs/project-goals.md` and `docs/flow.md` describe the new
   behaviour, and the flow's `R -- No` path is consistent with it.
10. `mise run check` passes.

## Risks

| Risk | Mitigation |
|---|---|
| The demo host (Claude Code) may not support MCP elicitation, so MCP approvals would be refused. | Phase 4 live-checks the host first. If it lacks support, stop and ask the user before demoing; approvals still work over REST or the console. |
| Repricing changes `order.total` after the spend-limit check. | Accepted (non-goal): the human approves the new total explicitly. The audit records old and new totals. |
| A system-closed order looks like a human rejection in lists. | `decided_by` is null and the audit actor is `system`; `OrderView` summary says "closed: stock changed". |
| Orders already pending for a requirements miss (stored before phase 1). | They stay pending and can still be decided; no migration. |
| The agent re-asks the buyer questions already answered when re-running. | `stock_changed.details` carries the original request, requirements and purpose; the skill says to reuse them and ask only for new choices. |
| Upstream rate limits during approval re-checks. | One quote call per approval, for the order's lines only (data rule in `CLAUDE.md`). |

## Resolved questions

1. Stock runs out at approval: keep `rejected` (actor `system`, no `decided_by`). The agent informs
   the buyer and re-runs the flow from the availability check with the original answers (user,
   2026-11-14).
2. The mandate check uses the agent's mandate at placement time, not the one frozen on the quote
   (user, 2026-11-14).
