---
title: Cancel an order until it ships
description: Add shipped and cancelled order statuses, an ops route that marks an order shipped, and a cancel operation on REST and MCP. The agent cancels alone, except that an approved order needs the human's confirmation unless the cancel replaces it with an order the human asked for.
status: completed
priority: P2
effort: 5h
branch: master
tags: [api, mcp, skill, docs]
blockedBy: []
blocks: []
created: 2026-11-14
goals: docs/project-goals.md
builds_on: plans/261114-0225-flow-approval-recheck-purpose-elicitation
---

# Cancel an order until it ships

## Outcome

- An order can be cancelled while it is `placed`, `pending_approval` or `approved`. Once it is
  `shipped`, cancel is refused with `409 already_shipped`. A `rejected` order cannot be cancelled
  (`409 invalid_state`).
- Shipping is a wholesaler-side event. The mock Valio API has no fulfilment signal, so a console/ops
  route `POST /api/orders/{id}/ship` stands in for the warehouse and moves a `placed` or `approved`
  order to `shipped` (user, 2026-11-14).
- **Who decides** (user, 2026-11-14):
  - The agent cancels a `placed` or `pending_approval` order on its own, with a reason.
  - Cancelling an `approved` order undoes a human decision, so on MCP `cancel_order` asks the human
    through elicitation, as `approve_order` and `reject_order` do.
  - **Replace rule:** when the human told the agent to replace the order, the agent places the new
    order first and then cancels the old one with `replaced_by=<new order id>`. No separate
    confirmation is asked. The server checks the replacement before skipping the elicitation.
- The cancel is recorded in `OrderView.cancellation` and the audit trail, with who cancelled it, the
  reason, how it was confirmed, and the replacement order when there is one.
- The skill teaches when and how to cancel, including the replace rule.

## Constraints

- Server enforces, skill guides (goal S2). The agent cannot cancel a shipped order or skip the human
  on an approved order without a valid replacement.
- Ship and cancel take `OrderService`'s per-order lock, so they cannot both win.
- Stored orders without the new fields still load. The status column is free TEXT and the order body
  is JSON, so the change is additive and needs no migration.
- REST cannot elicit. REST cancel of an approved order is accepted and recorded as
  `confirmed_via: rest`, the same documented limitation REST approvals have.
- Idempotency as today: a repeated `Idempotency-Key` replays the first response, and cancelling an
  already cancelled order returns it unchanged.

## Non-goals

- Partial cancellation of single lines, or changing quantities on a placed order.
- Any call to the Valio mock API on cancel or ship. The mock API has no order endpoints.
- A cancellation deadline based on a dispatch cutoff time. Only the `shipped` status blocks cancel.
- Delivered, returned or refunded statuses.
- An MCP tool for shipping. Shipping is the wholesaler's action, not the buyer agent's.
- A human login for the console (open question 3 in `docs/project-goals.md`).

## Where the code stands

| Concern | Today | Gap |
|---|---|---|
| Statuses | `OrderStatus` (`orders/models.py:12`): draft, agreed (retired), placed, pending_approval, approved, rejected. | No `shipped` or `cancelled`. |
| Transitions | `OrderService.decide` and `close_stale` (`orders/service.py:57`, `:111`) change status under `self._locks[order_id]` and write audit entries. | No ship or cancel transition. |
| Authorization | `ProcurementService.decide` uses `_visible_order` (any order of the agent's customer). | Cancel and ship reuse it. |
| REST | Agent surface `routes/agent.py` (`/api/agent/v1`), console `routes/orders.py` (`/api/orders`), `idempotent_decision` in `routes/_idempotency.py`. | No cancel or ship routes. |
| MCP | `approve_order` / `reject_order` elicit through `decide()` in `mcp/server.py:457`; `list_orders` has a status `Literal`. | No `cancel_order`; the literal lacks the new statuses. |
| Upstream | `openapi.json` has ping, price, availability and downloads only. | Nothing to notify on cancel; the cancel is local. |

## Key decisions

| Decision | Chosen | Why |
|---|---|---|
| What "shipped" means | New status `shipped`, set only by `POST /api/orders/{id}/ship` from `placed` or `approved`. Shipping a `pending_approval` order is `409 invalid_state`. | The user chose an explicit status over a time cutoff. Only an order the company has committed to can leave the warehouse. |
| Cancellable states | `placed`, `pending_approval`, `approved`. | Everything not yet shipped and not already closed. |
| Error codes | `409 already_shipped` (shipped), `409 invalid_state` (rejected), `422 reason_required` (blank reason), `404 order_not_found`. | `already_shipped` tells the agent the one fact that matters: it is too late, so contact the wholesaler. |
| Elicitation scope | Only for `approved` orders without a valid `replaced_by`. `placed` and `pending_approval` cancel alone. | User's rule. Cancelling a pending order spends nothing and only withdraws the request. |
| Valid replacement | `replaced_by` is an order of the same customer, not the cancelled order itself, created after it, and in status `placed` or `approved`. Otherwise `422 invalid_replacement` or `409 replacement_pending`. | The server can verify that a replacement exists. If the replacement is still `pending_approval`, cancelling the old order could leave the kitchen with nothing if the replacement is rejected, so the agent must wait until it is approved. |
| `replaced_by` on a placed or pending order | Accepted and recorded; it changes nothing about who decides. | The audit trail shows why the order went away. |
| Cancel record | `Order.cancellation: Cancellation \| None` with `reason`, `at`, `cancelled_by: DecidedBy`, `confirmed_via: "agent" \| "rest" \| "mcp_elicitation" \| "replacement"`, `replaced_by: str \| None`. `Order.decision` is left as it was, so an approved-then-cancelled order keeps its approval. | The approval stays visible in history, and the cancel has its own facts. |
| Audit | Action `cancelled`, actor `agent`, or `approver` when a human confirmed through elicitation. Action `shipped`, actor `system`. `render_audit_text` prints both. | Same audit shape as the decision entries. |
| Declined elicitation | `cancel_declined`: nothing changes. Client without elicitation: `elicitation_required`, as for approvals. | Mirrors the approve/reject contract the skill already handles. |
| Who may cancel | Any agent of the customer (`_visible_order`), as with decisions. | Today every client is one shared agent, so ownership adds nothing. |

### Extension trace

The next likely variant is a real fulfilment feed: a Valio order API or webhook that reports
shipment, replacing the ops route. The stable contract is `OrderService.ship(order_id, *, source)`
plus the rule that cancel is refused once the status is `shipped`. A webhook would call the same
method, and only the route changes. Phase 1 tests ship and cancel at the service level, without the
route, which proves the split. No fulfilment-provider abstraction is introduced.

## Phases

| # | Phase | Depends on | Status |
|---|---|---|---|
| 1 | [Shipped and cancelled statuses in the order service](phase-01-order-service-ship-cancel.md) | none | completed |
| 2 | [Cancel rules, replacement check and REST routes](phase-02-procurement-rest-cancel.md) | 1 | completed |
| 3 | [MCP `cancel_order` with elicitation](phase-03-mcp-cancel-order.md) | 2 | completed |
| 4 | [Skill, docs and live check](phase-04-skill-docs-live-check.md) | 1, 2, 3 | completed |

Run in order. Phases 1 and 2 both touch `orders/models.py` and `procurement/schemas.py`, and
phases 2 and 3 both depend on `ProcurementService.cancel`.

## Acceptance criteria

1. `POST /api/orders/{id}/ship` moves a `placed` or `approved` order to `shipped` and writes a
   `shipped` audit entry. Shipping a `pending_approval`, `rejected` or `cancelled` order is
   `409 invalid_state`. Shipping a shipped order returns it unchanged.
2. Cancelling a `placed` or `pending_approval` order with a reason over REST or MCP sets
   `cancelled`, fills `cancellation`, and writes a `cancelled` audit entry, with no elicitation.
3. Cancelling a `shipped` order is `409 already_shipped`. Cancelling a `rejected` order is
   `409 invalid_state`. A blank reason is `422 reason_required`. Nothing changes in any of these cases.
4. Over MCP, cancelling an `approved` order without `replaced_by` sends an elicitation and records
   the human's reason with `confirmed_via: mcp_elicitation`. Decline or cancel of the form is
   `cancel_declined`, and a client without elicitation gets `elicitation_required`. Nothing
   changes in either case.
5. Over MCP, cancelling an `approved` order with `replaced_by` naming a `placed` or `approved` newer
   order of the same customer cancels it without elicitation, with `confirmed_via: replacement`
   and `replaced_by` recorded. A replacement that is missing, older, the same order or of another
   customer is `422 invalid_replacement`. A replacement still `pending_approval` is
   `409 replacement_pending`.
6. A cancel and a ship racing on the same order produce exactly one outcome. The loser gets
   `already_shipped` or `invalid_state`.
7. A repeated cancel with the same `Idempotency-Key` replays the first response. Cancelling an
   already cancelled order returns it unchanged.
8. Orders stored before this change still load, and `list_orders` accepts `shipped` and `cancelled`.
9. The skill, `docs/backend-api.md` and `docs/flow.md` describe cancel, shipping and the replace rule.
10. `mise run check` passes.

## Risks

| Risk | Mitigation |
|---|---|
| The agent claims a replacement that the human never asked for. | The server can only check that a replacement order exists, not that the human asked for it. The skill limits `replaced_by` to an explicit human instruction, and the audit records `confirmed_via: replacement` with both order ids for review. This is listed in "Known demo limitations". |
| The replacement is rejected after the old order was cancelled. | `replacement_pending` refuses the cancel until the replacement is `placed` or `approved`. |
| The demo has no warehouse, so `shipped` never happens on its own. | The ops route is documented with a curl line, and the phase 4 live check uses it. |
| Clients or tests that enumerate `OrderStatus` break. | Phase 1 lists every `OrderStatus` literal and match site (`rg "OrderStatus\." apps/api/src`) and updates them. |

## Unresolved questions

None.
