---
phase: 1
title: Plain-language layer
status: completed
effort: 1.5h
---

# Phase 1: Plain-language layer

## Context

Read `apps/web/src/features/journal-viewer/journal.types.ts` (types only, not the whole file),
`format.tsx`, `skills/valio-aimo-purchasing/references/tags-and-units.md` and
`journal-example.json`.

## Files

- Create `apps/web/src/features/journal-viewer/plain-language.ts` and `plain-language.test.ts`.
- Edit `format.tsx`: add a `Duration` helper (started → finished, "12 min"). Leave the existing
  helpers' output unchanged: `orders-table.tsx`, `order-summary.tsx`, `storage-3d-view.tsx` and
  `storage-planner.tsx` import them. If the ISO `title` tooltip should go from the journal page,
  add an opt-out prop instead of changing the default.

## Steps

1. `outcomeLabel(outcome)` → sentence and tone, e.g. `pending_approval` → "Waiting for sign-off",
   `no_order` → "No order placed".
2. `orderStatusLabel(status)` the same way.
3. `tagLabel(tag)` for catalog tags, `FREE_FROM:<code>`, `no:<code>`, `brand:<x>`, with the allergen
   code table from `tags-and-units.md`; unknown tags title-cased with underscores as spaces.
4. `productNames(journal)` → `Map<productId, name>` from quote options, candidates, research
   candidates, in that priority.
5. `quantityLabel(option)` → "1,000 L (100 × 10 L)", "100 × 10 L", or "100 sales units".
6. `toAuditSteps(journal)` → ordered by `seq`, each `{ seq, actor: "agent" | "buyer" | "problem",
   kind label, title, at, products: string[], detail }` where `detail` is a discriminated union:
   `question` (question, options, picked answer, free text), `decision` (approved/rejected, reason,
   decided by, confirmed via), `cancellation`, `order` (status, total), `problem` (message,
   handling), or `none`. Linking rules are in plan.md. Also return `unlinked: { questions, errors }`
   for records no step claimed.
   - Actor mapping: `answer`, `approval`, `cancel` → buyer; `error` → problem; everything else →
     agent. A `question` step is the agent asking, but it is flagged `involvesHuman` so the human
     filter keeps it together with its answer.

## Validation

- `pnpm test src/features/journal-viewer/plain-language.test.ts` covers: every enum value of
  outcome, status and timeline type has a label (iterate the schema enums so a new value fails the
  test); tag forms; unknown product id; quantity fallbacks; question/error count mismatch puts the
  extras in `unlinked`; the example journal's step 5 links to the order decision.
- `pnpm typecheck` and `pnpm lint` in `apps/web`.

## Risk

The nth-question linking is a heuristic. The unlinked list is the safety net; the test above pins
it.
