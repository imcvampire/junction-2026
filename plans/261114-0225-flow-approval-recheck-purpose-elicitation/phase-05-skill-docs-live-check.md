---
phase: 5
title: Skill, docs, flow and live check
status: pending
depends_on: [1, 2, 3, 4]
---

# Phase 5: Skill, docs, flow and live check

## Requirements

- `skills/valio-aimo-purchasing/SKILL.md`:
  - Approval only for the spend limit: drop every mention of a substitute or requirements miss
    escalating. A substitute that misses a buyer preference is flagged in the offer prompt and the
    buyer's pick is final. Drop options with `breaks_mandate`; add `mandate_violation` to the errors
    table.
  - Step 3 (quote): pass the buyer's `purpose` when known, and always before quoting substitutes.
  - "Deciding an escalated order": on MCP the server shows the human a form; the agent calls the tool
    after the buyer says to decide and passes their words as the suggested `reason`. Explain
    `decision_cancelled` (the human declined; report it, do not retry) and `elicitation_required`
    (this host cannot show the form; tell the buyer to decide in the order console).
  - Errors table: add `price_changed` (show old and new totals; on REST approve again with
    `expected_total` only after the buyer confirms), `stock_changed` (the order was closed: tell the buyer
    what ran out, then re-run from step 3 with `details.rerun`, so the request, requirements, purpose
    and date are reused and the buyer is only asked to choose among the new options), `decision_cancelled`, `elicitation_required`.
- `skills/valio-aimo-purchasing/references/worked-example.md`: the approval section shows the form,
  and the price-moved section covers approval-time changes.
- `docs/backend-api.md`: approval only for the spend limit, `mandate_violation`, approval re-check rules, `expected_total`, `purpose`, elicitation on MCP,
  new error codes, and the known-limitations entry narrowed to REST.
- `docs/project-goals.md`: update the approval-access decision (MCP decisions are confirmed by the
  human through elicitation; REST is not).
- `docs/flow.md` (spend-only approval is already drawn): `H -- Yes --> R` stays; relabel `R` to "price and stock unchanged at placement or
  approval"; split `R -- No` into "price changed → prompt the buyer to confirm the new total"
  (back to `H`) and "stock short → order closed" (back to `B`). Already drawn as `RA` and `ST`;
  only check consistency with the code.
- Live check: start the API (`mise run dev`, reusing a running server on port 8000 if present),
  connect Claude Code with an agent key, run the reference request to an escalated order, approve
  through the elicitation form, and record the result in
  `plans/reports/demo-261114-0225-approval-elicitation.md`. **If the host does not show the form,
  stop and report to the user before changing anything.** Stop the server afterwards.

## Files

- Modify: `skills/valio-aimo-purchasing/SKILL.md`,
  `skills/valio-aimo-purchasing/references/worked-example.md`, `docs/backend-api.md`,
  `docs/project-goals.md`, `docs/flow.md`.
- Create: `plans/reports/demo-261114-0225-approval-elicitation.md`.

## Validation

`mise run check`; every error code named in the skill exists in the code (`rg` the codes in
`apps/api/src`); the live check report shows an approved order whose audit has
`confirmed_via: mcp_elicitation`.

## Risks and rollback

Docs-only apart from the live check. Revert the files to roll back.
