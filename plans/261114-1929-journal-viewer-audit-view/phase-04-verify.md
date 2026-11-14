---
phase: 4
title: Verify in the browser
status: completed
effort: 0.5h
---

# Phase 4: Verify in the browser

## Steps

1. `mise run check`.
2. Start `mise run dev` (reuse a running instance on 5173 rather than starting another), open
   `/journal-viewer`, load `skills/valio-aimo-purchasing/references/journal-example.json`.
3. Check at 375 px and at desktop width, in light and dark themes: no horizontal page scroll, the
   timeline rail stays aligned, buyer steps are distinguishable in greyscale.
4. Read the page as a buyer would and confirm each acceptance criterion in `plan.md`; screenshot
   the timeline for the handoff.
5. Stop the dev server if this phase started it.

## Docs

Update `docs/flow.md` only if it describes the journal viewer's sections; otherwise no docs
change.
