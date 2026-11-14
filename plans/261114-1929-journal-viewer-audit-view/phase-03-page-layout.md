---
phase: 3
title: "Page layout: summary, input, output, sources"
status: completed
effort: 1.5h
---

# Phase 3: Page layout

## Files

- `components/journal-view.tsx`: new order — `JournalHeader`, `RequestInput`, `JournalTimeline`,
  `JournalOutput`, `SourcesList`.
- `components/journal-header.tsx`: title, outcome sentence as a badge, date and duration,
  summary, `narrative.what_happened`. Remove the agent/customer/host/model grid, the `Kind` badge
  and the metrics card. Keep at most three plain figures when present: total excl. VAT, CO₂-eq,
  saving versus the next option.
- Replace `request-authority.tsx` with `request-input.tsx`: the verbatim request, delivery date,
  amount, requirement labels, and the mandate as sentences ("The agent may place orders up to
  €500 without sign-off. It must never buy products containing milk."). Drop the
  searches/candidates collapsible.
- Replace `orders-list.tsx` and `quote-table.tsx` with `journal-output.tsx`:
  - One receipt card per order: status sentence, product lines (name, quantity label, line total
    from the chosen quote option), total, delivery date, why sign-off was needed, the decision or
    cancellation with who and how, and a small "Order reference" line.
  - "Why this option": `decision.reason` and `narrative.why` (deduplicated when identical).
  - "Options compared": per quote, a simple list or table of product name, total, "covers the
    amount", "meets requirements" (with missing requirements as labels), and delivery reliability
    and CO₂ only when any option has them. The chosen option is marked with a label, not just a
    tint. No rank, unit price, conversion or tooltips.
  - `narrative.watch_out` as an alert, then next steps.
- Merge `research-list.tsx` and `recipe-list.tsx` into `sources-list.tsx`: one list of sources
  (site name, what it informed, outcome in words); keep the existing http-only link rule. Hidden
  when there is no research.
- `src/routes/journal-viewer.tsx`: rename the page heading to "Purchase audit" and rewrite the
  subtitle for a buyer ("Open a journal file to see what the purchasing agent was asked, what it
  did, and what it ordered."). The picker and load-error flow stay.

## Validation

- Update `journal-view.test.tsx` to the new headings and labels; keep the hostile-string,
  http-only-link and unknown-value tests, moved to where those strings now render.
- Add the "no technical strings" assertion from plan.md acceptance criteria.
- `pnpm test src/features/journal-viewer`, then `pnpm lint && pnpm typecheck`.

## Risk

Checked on 2026-11-14: no component in `journal-viewer/components` is imported outside the
feature except by `routes/journal-viewer.tsx`, so deleting them is safe. `format.tsx` is shared
with `features/orders`; after this phase run `pnpm test src/features/orders` as well.
