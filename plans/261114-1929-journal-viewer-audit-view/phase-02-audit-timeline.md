---
phase: 2
title: Audit timeline
status: completed
effort: 1.5h
---

# Phase 2: Audit timeline

## Files

- Rewrite `apps/web/src/features/journal-viewer/components/journal-timeline.tsx` to take
  `toAuditSteps(journal)` output.
- Delete `questions-list.tsx` and `errors-list.tsx` once their content renders inside steps (move
  the question-card markup into the timeline step detail).

## Design

- A vertical rail with one node per step. Agent steps: small muted icon. Buyer steps: larger
  filled node, a "Buyer decision" label and a tinted card. Problem steps: warning icon and label.
  Colour is never the only signal.
- Each step: step number, kind label ("Checked spending limit", "Searched the catalogue", "Got
  prices", "Asked the buyer", "Buyer answered", "Placed order", "Buyer approved", "Order
  cancelled", "Problem", "Looked up sources", "Reported back"), the title verbatim, the time in
  Helsinki time or "time not recorded", product names as quiet chips.
- Detail opens inline via the existing `Collapsible`; steps that involve a human start open,
  agent steps start closed and only show a toggle when they have detail.
- Between steps with known times more than 30 minutes apart, show the gap ("2 h later"), so an
  auditor sees where the session waited for a person.
- A toggle above the rail, "Only human decisions", filters to buyer steps and the questions that
  led to them. Plain `useState`; no URL state.
- Below the rail, when `unlinked` is non-empty: "Also recorded" with the unlinked questions and
  problems in the same card style.

## Validation

- Component tests in `journal-view.test.tsx` (or a new `journal-timeline.test.tsx`): step order;
  buyer step shows the approval reason and decider; the toggle leaves only human steps; a journal
  with an error shows message and handling but not the error code or tool; a hostile string in a
  step title renders as text.
- `pnpm test src/features/journal-viewer`.
