# Journal viewer audit view: plan

Planned a rework of `/journal-viewer` for non-technical auditors
(`plans/261114-1929-journal-viewer-audit-view/`). The current page mirrors the journal schema
section by section and shows agent ids, tool names, quote ids and unit codes. The plan reorders it
as input → timeline → output and removes those details.

Findings that shaped it:

- Timeline entries carry `refs.order_id` but no question or error id, so inline detail for those
  steps has to be linked by position. The plan keeps a visible "Also recorded" list for anything
  the heuristic leaves unmatched, so no record goes missing.
- Most example timeline entries have `at: null`, so the timeline must read well without times.
- `format.tsx` is imported by `features/orders`, so its helpers' default output must not change.
- Unit codes such as `KI` must not be translated by guessing. Quantities are built from
  `requested` and `content_per_sales_unit` instead.
