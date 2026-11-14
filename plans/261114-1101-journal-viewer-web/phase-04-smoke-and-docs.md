---
phase: 4
title: "Browser smoke and docs"
status: completed
effort: 1h
depends_on: [3]
---

# Phase 4: Browser smoke and docs

## Context

- The page from phase 3, served by `mise run dev` on 5173. Reuse a running dev server; check
  `lsof -i :5173` before starting one, and stop only what this phase started.
- Real journals from the 261114 live check, in `~/.cache/junction-2026/agent-sandbox/valio-aimo-journal/`,
  if they are still there: run 3 (valid at the time) and run 1 (invalid: `errors[0].next`). After the
  rename of `orders[].total`, both now also fail on that field; that is expected and shows the
  error list working on real files.
- Browser automation: the installed browser-testing skill (`ak-agent-browser`).

## Files

Create: `plans/reports/smoke-261114-HHMM-journal-viewer.md` (with screenshots saved next to it
only if the report links them).

Modify:

- `skills/valio-aimo-purchasing/references/journal.md`: one line in "For viewers" naming the
  reference viewer (`apps/web`, route `/journal-viewer`).
- `README.md`: a short "Web app" section with the dev URL and the journal viewer.
- `docs/project-goals.md` only if the order console row needs a note that its shell now exists;
  otherwise leave it.

## Steps

1. Open `http://localhost:5173/`; confirm the redirect to `/journal-viewer`.
2. Load `journal-example.json`; check every section from `plan.md` Outcome is shown, the chosen
   option is marked, and the order shows `approved` with the buyer's reason.
3. Load a copy of the example with `errors[0].next` in place of `handling`; confirm the
   `invalid` alert lists `/errors/0`.
4. Load a non-journal JSON file (`apps/api/data/openapi.json`) and confirm `not_a_journal`.
5. If the sandbox journals exist, load them and note what the viewer reports.
6. At 390 px width, confirm no horizontal page scroll and that the quote table scrolls on its own.
   Repeat step 2 in dark theme.
7. Confirm the browser made no network request when loading a file (devtools network log or the
   automation tool's request log).
8. Write the report: URL, steps, result per step, screenshots if taken, and any fix applied.
   Fix defects in the web code, never by changing the shipped schema.

## Validation

Acceptance criteria 2, 5 and 7 in `plan.md`; `mise run check` after any fix.

## Risks

- The browser tool may not support file upload into a hidden input. Mitigation: target the visible
  `input[type=file]` from phase 3, or set the file through the tool's upload command.

## Rollback

Revert the two doc edits; the report is a record and stays.
