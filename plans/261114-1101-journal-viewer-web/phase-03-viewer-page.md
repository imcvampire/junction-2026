---
phase: 3
title: "Journal viewer page"
status: completed
effort: 2h
depends_on: [2]
---

# Phase 3: Journal viewer page

## Context

- `parseJournal` / `readJournalFile` and `ValioAimoJournal` from phase 2.
- shadcn components added in phase 1. Use them as shipped and compose; use `cn()` for conditional
  classes (shadcn skill rules).
- Field meanings: `journal.md` "Where each field comes from"; schema `description`s are the
  tooltip text for table headers.

## Files

Modify: `apps/web/src/routes/journal-viewer.tsx`.

Create in `apps/web/src/features/journal-viewer/components/`:

| Component | Shows |
|---|---|
| `journal-picker.tsx` | File input (`accept=".json,application/json"`) and a drop zone; on load calls `readJournalFile`. Keyboard-usable; drop zone has a visible focus ring. |
| `load-error.tsx` | One `Alert` per error kind with a plain sentence (`This file is not a Valio Aimo journal.`); for `invalid`, a list of `path: message`. |
| `journal-header.tsx` | `title`, `summary`, `kind` and `outcome` badges, started and finished times in Europe/Helsinki, agent and host, and the `metrics` row (tool calls, quotes, buyer questions, total, CO₂, savings). |
| `journal-narrative.tsx` | `narrative.what_happened`, `why`, `watch_out` (highlighted when set), and `next_steps[]`. |
| `journal-timeline.tsx` | Ordered list by `seq` with type icon, title, tool, time; refs shown as ids. |
| `request-authority.tsx` | `request` (verbatim text, date, amount, requirements, purpose) beside `authority`. |
| `quote-table.tsx` | One table per quote: rank, product, quantity and conversion, unit price, line total, covers, requirements, reliability, CO₂; chosen row marked with a badge and an accessible label, cheapest covering marked. Wrapped in `ScrollArea` for phone width. |
| `questions-list.tsx` | Each question with its options; the picked one and `free_text` marked. |
| `orders-list.tsx` | One `Card` per order: status badge, total, delivery date, approval reasons, decision (approved or rejected, reason, decided by, confirmed via) or cancellation (reason, by, via, replaced by). |
| `errors-list.tsx` | Refused calls: tool, code, message, handling. Hidden when empty. |
| `journal-view.tsx` | Composes the sections in the order listed in `plan.md` Outcome; empty sections are hidden or say "None". |

Create: `journal-view.test.tsx` and `journal-picker.test.tsx` next to the components.

## Rules

- Money: `Intl.NumberFormat("en-FI", { style: "currency", currency })` using the document's
  currency; fall back to the raw number when `currency` is not a valid code. Never recompute totals;
  show `metrics` as given.
- Times: `Intl.DateTimeFormat` in `Europe/Helsinki`, and show the raw ISO string in `title` on hover.
- `null` renders as an em dash with `aria-label="unknown"`.
- Every journal string goes through React text nodes. No `dangerouslySetInnerHTML`, no Markdown,
  no `href` built from journal values.
- The page state is `idle | loaded(journal, fileName) | failed(error, fileName)`. Loading another
  file replaces it. The file name is shown but never stored.

## Steps

1. Build the components and compose them in `journal-view.tsx`; the route renders the picker plus
   the view or the error.
2. `journal-view.test.tsx` with the skill's example: the title is shown; the `464119` row is marked
   chosen; `ord_example` shows `approved` and `For the gala dinner`; the timeline has 6 entries in
   `seq` order; the errors section is absent.
3. Same test file: an example whose `narrative.what_happened` is `<img src=x onerror=alert(1)>`
   renders that literal text and the container holds no `img` element.
4. `journal-picker.test.tsx`: uploading the example via `user-event` renders the view; uploading
   `"{"` renders the not-JSON alert; uploading a second file replaces the first.

## Validation

- `cd apps/web && pnpm test`, `pnpm lint`, `pnpm typecheck`.
- `mise run check`.

## Risks

- The quote table is wide (up to 9 options × 10 columns). Mitigation: horizontal scroll inside the
  table only; the most important columns (product, total, covers, chosen) come first.
- Optional fields may be absent rather than `null` in real journals. Mitigation: treat
  `undefined` and `null` the same in every renderer.

## Rollback

Revert `journal-viewer.tsx` to the placeholder and delete `components/`.
