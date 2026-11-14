---
phase: 4
title: Skill, docs and live check
status: completed
depends_on: [1, 2, 3]
---

# Phase 4: Skill, docs and live check

## Requirements

- `skills/valio-aimo-purchasing/SKILL.md`:
  - New section "Cancelling or replacing an order", after "Deciding an order over the spend limit":
    - Cancel only when the buyer asks, and always pass their reason.
    - `placed` and `pending_approval`: call `cancel_order`.
    - `approved`: `cancel_order` shows the human a form. Do not ask again in chat.
    - Replace: only when the buyer explicitly says to replace the order. Run the normal procedure for
      the new order first. Once it is `placed` or `approved`, call `cancel_order(old_id, reason,
      replaced_by=new_id)`. If the new order is `pending_approval`, keep the old one, tell the buyer
      both exist, and cancel the old one after the new one is approved. Never use `replaced_by` on
      your own initiative.
    - `already_shipped`: tell the buyer it is too late to cancel through the agent and that they must
      contact Valio Aimo customer service. Do not retry.
  - Errors table: `already_shipped`, `cancel_declined`, `replacement_pending` and
    `invalid_replacement`, each with its meaning and action.
  - `references/worked-example.md`: a short replace example, only if it fits the existing narrative.
- `docs/backend-api.md`: cancel and ship routes under Operations, the new error codes under Errors,
  the new statuses and `cancellation`, and two items in "Known demo limitations": the ops ship route
  stands in for fulfilment, and the server cannot prove that the human asked for a replacement.
- `docs/flow.md`: add the post-placement branch "cancel until shipped" to the diagram and the text,
  consistent with the tool behaviour.
- `docs/project-goals.md`: update only if a goal or acceptance criterion now covers cancellation.
  Read it first.
- Run `mise run skill:sandbox` if it validates the skill.

## Live check

With `mise run dev` running (port 8000; reuse the running server rather than starting another):

1. Place an under-limit order through MCP and cancel it. Check the audit text.
2. Place another one, `curl -X POST localhost:8000/api/orders/<id>/ship`, and try `cancel_order`.
   Expect `already_shipped`.
3. If the host supports elicitation, approve an over-limit order and cancel it to see the form.
   Then place a replacement and cancel with `replaced_by` to confirm no form is shown.

Record the results in `plans/reports/` and stop the dev server only if this phase started it.

## Validation

`mise run check`. Verify that every doc claim matches the code paths from phases 1 to 3.
