---
phase: 3
title: "Live check in the skill sandbox"
status: completed
effort: 0.5h
depends_on: [1, 2]
---

# Phase 3: Live check in the skill sandbox

## Context

- `scripts/skill-sandbox.sh` (`mise run skill:sandbox`) links the skill into a directory outside
  the repo, so the agent sees only what an external buyer's agent would.
- The API runs with `mise run dev` on port 8000. Reuse a running server; do not start a second one.

## Files

Create: `plans/reports/live-check-261114-HHMM-purchasing-journal.md`.

## Steps

1. Confirm the API answers on `http://127.0.0.1:8000/api/health`; start `mise run dev` only if it does not.
2. `mise run skill:sandbox`, then in the sandbox run `claude` with the reference request:
   *"I need 1,000 litres of lactose-free milk by Monday. Find an option that meets our requirements
   based on price and availability."* Approve the order in the form when it opens.
3. Confirm exactly one new file in `<sandbox>/valio-aimo-journal/`, then validate it:
   `cd apps/api && uv run python -c "import json,sys,jsonschema; jsonschema.validate(json.load(open(sys.argv[1])), json.load(open('../../skills/valio-aimo-purchasing/references/journal.schema.json')))" <file>`
4. Compare against the server: `orders[0].order_id`, `status`, `total` and
   `decision.decided_by` match `GET /api/orders/{id}` and its audit.
5. Run a second short task (cancel that order) and confirm a second file with `kind: cancel` and no
   overwrite of the first.
6. Write the report: commands, file names, validation result, any field the agent left `null` or got
   wrong, and the fix applied (to `journal.md` or SKILL.md wording, never by loosening the schema to
   hide an agent error).

## Validation

Acceptance criteria 4 and 5 in `plan.md`.

## Risks

- Live prices or stock differ from the worked example, so the flow may hit a buyer dialog. That is
  fine; the journal must then show the question and answer.
- The run creates real mock orders in `app.sqlite3`. They are local runtime state.

## Rollback

None needed; the check changes no tracked files besides the report.
