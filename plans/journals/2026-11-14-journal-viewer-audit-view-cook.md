# Journal viewer audit view: implemented

Carried out `plans/261114-1929-journal-viewer-audit-view/`. `/journal-viewer` (titled "Purchase
audit") now reads in this order: header, what was asked, the step-by-step timeline, what came out,
and sources. View models come from `plain-language.ts` (`toAuditSteps`), which has no React in it.

Where the build differs from the plan:

- Step titles are verbatim except for one rewrite. An exact "<quantity> <sales unit>" pair taken
  from the journal's own quote options becomes the real-world amount, for example "100 KI" becomes
  "1 000 L (100 × 10 L)". Without it, the acceptance rule "no bare `KI`" fails on the example's
  step 4. Product ids inside titles and `narrative.why` stay as written, as the plan decided.
- Numbers use the app's en-FI format, so "1,000 L" renders as "1 000 L", while money still renders
  as "€1,540.00". `formatNumber` is shared with the orders pages, so it was left as it is.
- `decided_by` and `cancelled_by` hold agent ids. They are shown as "the buyer" when they match
  the journal's own agent, "another user" otherwise, and "the system" when null.

Prettier formatting was then applied to five `features/orders` files that were already failing the check,
and `mise run check` now passes.
