# Purchase Overview

The existing `/journal-viewer` route displays a browser-local purchasing dashboard.
The redesign is scoped to this route. The shared application shell, landing page,
Orders navigation, global styles and theme controls retain their master behavior.
Dashboard colors and interaction styles live in `journal-viewer.css` under the
`.journal-viewer-theme` wrapper. Recipe and web research remain visible when recorded.
Records are parsed against the purchasing journal schema; no journal data is uploaded
and the dashboard does not place, approve or submit orders.

Run the project with `mise run dev`, or run `pnpm dev` inside `apps/web`.
Open `http://localhost:5173/journal-viewer` and choose **Explore Example Purchase**
or **Open Purchase Record**. No new dependencies are required.

The overview uses Valio Heritage Blue (`#0052A5`), a light background, a plain-language
journey, product comparison, buyer decisions, order details and deterministic safety
checks. Developer records are separated from the customer workflow. The main
purchase card highlights five facts and the next recorded action. It sits beside a
compact **Here's What Happened** explanation at a 65% / 35% desktop split, with
natural heights and top alignment. Below the desktop breakpoint they stack with
purchase facts first. Product selected spans the left card's full width; quantity
and delivery, then total cost and approval, use paired columns where space permits.
The full **Purchasing Journey** remains a separate section below. Product dates remain in product comparison, reports and
underlying records, and are intentionally omitted from the top summary.

The product comparison includes every recorded quote option and search candidate,
including candidates without a recorded price. Full-request price bars are grouped
by quote, currency, requested amount and delivery conditions. Partial offers use
normalized physical unit prices where explicit package contents support them.
Alternatives use an internally scrolling, single-row viewport: two cards on desktop
and one on mobile. Its height is measured from closed cards; expanded details grow
inside the fixed viewport. All alternatives remain mounted in their ranked order.

**Download Complete Purchase Report (PDF)** generates one local, paginated A4 PDF
named `Valio_Aimo_Complete_Purchase_Report.pdf` from the currently loaded record.
Part 1 is **Valio Aimo — Purchase Statement**: an invoice-style purchase record with
customer/purchase references, actual ordered quantities, reconciled unit prices,
recorded totals, approval and delivery notes. It explicitly states that it is not a
tax invoice or proof of supplier confirmation/delivery. Order dates use only actual
recorded order-creation times, never timeline display estimates. Optional recorded
`orders[].vat_amount` and `orders[].total_incl_vat` are printed only when present;
no VAT rates, tax amounts or inclusive totals are inferred. Item prices that cannot
be reconciled to the recorded total are marked unavailable.

Part 2 is **Valio Aimo — Detailed Purchase Report**, starting on a fresh page, with
all alternatives, price scales, the business journey, buyer decisions,
approval/delivery notes and customer safety results. If Part 2's actual paginated
content exceeds five pages, its beginning includes a small contents table with
absolute PDF page numbers. The shared layout planner measures browser font widths,
wraps cells, repeats product-table headers across pages and numbers the whole PDF.
Internal agent/quote IDs, API operations, raw JSON and debugging evidence are
excluded from the detailed report. No PDF dependency or server upload is used.
Pages are rendered to images inside a PDF container to preserve browser fonts and
Unicode; text is not searchable/selectable, and the PDF is not tagged for screen
readers. A future vector/text PDF implementation could improve PDF accessibility.

## Journey times and technical records

The customer-facing journey contains plain-language facts only. Raw event titles,
tool names, corresponding API reference operations, identifiers and JSON remain in
the **Developer Purchase Audit** at `/developer/journal-viewer`, not in the customer
dashboard. This route has **no authentication or access control** and is **not a
security boundary**. It is intentionally omitted from customer navigation. Open
the same local record there to inspect full validation results, event payloads,
identifiers, errors and redacted JSON exports. Files are not shared between routes
or uploaded. Restrict access separately if deploying this route to untrusted users.

**Your Purchasing Decisions** follows the recorded question-array order because
the schema does not timestamp or uniquely link each question to order changes.
Option descriptions are primary; option letters are secondary. Only explicit buyer
statements (including yes to an explicit risk-acceptance question) establish risk
acceptance. Selection of an option with a disclosed risk does not alone establish
explicit acceptance. Final quantities come from the recorded decision and quote;
the viewer does not silently overwrite the original request with free-text answers.

Customer safety checks use **Passed** (green), **Needs attention** (amber),
**Cannot verify** (grey), and **Failed** (red). Approval checks are omitted when
approval was not required under a known spending limit. Missing order timing stays
unverified even when an estimated timeline time is displayed. Full schema and
identifier diagnostics remain available on the developer route only.

Completed activities use their own valid recorded timestamp, falling back to the
most recent preceding valid timestamp in sequence order, starting with the purchase
request display time derived from `started_at`. Consecutive missing completed times
carry forward that recorded value. A sent approval request is a completed activity;
an outstanding decision is not. A pending order with no decision shows **Awaiting
Approval — Pending**, with an amber clock and no estimated completion time. An
approval activity with no recorded outcome and no known pending state shows
**Approval Decision Not Recorded — Pending / Outcome Unknown**, also without a
decision timestamp. Actual interaction timestamps remain in the original record.
While approval is pending, the customer journey hides purchase-update and record-
completion steps and ends with **Awaiting Approval — Pending**. After a recorded
decision, only updates supported by journal events and completion supported by
`finished_at` appear. The summary's **What happens next?** uses the same display
status, with amber for pending, green for approved, red for rejected and Heritage
Blue for informational states. Pending amounts and EUR spending limits come from
the record; an exceeded limit is stated only when those values are comparable.
Generic `next_steps` text cannot override approval status. Buyer approval never
establishes wholesaler confirmation; the current schema has no explicit supplier
confirmation field, so the viewer keeps that confirmation unverified.

Record completion uses `finished_at` and never resolves a pending order. A status
of `approved` without a recorded approving decision is presented as **Approval
Outcome Unknown**, rather than a green approved badge, throughout customer status
displays and the report.

Later events are never used; if no earlier time exists for a completed activity,
the display says “Time not available”. Collapsed and expanded details share the
same model. Fallbacks are labelled “Estimated time”, with the tooltip
“Time estimated from the previous recorded event”.
No timestamps in the journal, exports or validation evidence are overwritten;
verification continues to use only original timestamps.

## Optional product dates

The original v1 journal and catalog schemas had no product expiry/best-before dates.
The example still has none; product comparison shows unavailable dates.
A quote's `expires_at` is the price offer expiration, never a product expiry date.

The journal schema now accepts these additive optional fields without changing
existing required fields or backend contracts:

- `quotes[].options[].best_before_date`: ISO calendar date or null.
- `quotes[].options[].expiry_date`: ISO calendar date or null; remains labelled as
  an expiry date, not best-before.
- `orders[].product_dates[]`: product/batch records actually allocated to that order,
  with required `product_id`, optional `batch_id`, `best_before_date` and `expiry_date`.

Example extension (illustrative data only):

```json
{
  "product_dates": [
    {
      "product_id": "selected-product-id",
      "batch_id": "allocated-batch-reference",
      "best_before_date": "2026-11-30"
    }
  ]
}
```

The product-date helper used by reports/debugging matches dates to selected product IDs, prefers actual allocated batch
records over quote-level dates, and shows separate dates for separate products or
batches. Unknown batch dates stay unavailable. No date is derived from delivery,
quote expiration or shelf-life duration. Dates are checked by the existing JSON
schema validator. Producers must supply these fields; the viewer does not fetch
batch data or manufacture it.

## Validation and remaining evidence gaps

Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` in `apps/web`.
Where Windows sandbox restrictions prevent Vitest fork workers, the same suite can
run with `pnpm test --pool=threads`.
For browser smoke checks after building, run:

```sh
node scripts/check-purchase-preview.mjs "path/to/chrome-or-edge"
```

The browser check uses built-in Node APIs and Chrome DevTools, writes screenshots
to a temporary directory, and tests desktop/tablet/mobile layouts, example loading,
approval states, malformed records and absence of purchasing API calls.

Safety checks validate structure, identifiers, selected products, item arithmetic,
quote association, approval policy/evidence and recorded timing. Missing evidence
stays **Cannot verify** in customer safety results. Quote coverage means availability at quote time, not delivery.
The journal does not record explicit wholesaler submission/confirmation, independent
human identity, signed integrity evidence, full tool payloads or numeric stock counts.
Multi-order line allocation and mixed-currency comparison remain deliberately
unverified when the record cannot support them. Common credential patterns are
redacted; arbitrary secrets in unstructured prose cannot be reliably identified.

Future improvements could add explicit offer acceptance and wholesaler events,
server audit references, authenticated human identities and complete order-line
allocation. Those would require coordinated producer/schema work.

## Customer simplification implementation

The customer composition is in `components/journal-view.tsx`. New
`customer-record.ts` and `components/customer-details.tsx` provide discovery,
buyer-decision and order summaries. `safety-checks.ts` provides business checks;
the original `verifyPurchase` implementation stays available to developers.
`customer-report.ts` supplies customer-only PDF content; `purchase-report.ts`
retains the existing PDF renderer. `components/developer-journal.tsx` and
`routes/developer.journal-viewer.tsx` provide the separate local audit workflow.
Related dashboard/comparison/import/download components, route generation, tests,
the local browser-check script and README were updated. No dependencies, backend
contracts or journal fields were added in this simplification.

Free-text risk classification is conservative and recognizes explicit English
acceptance statements; full original buyer responses remain visible even when
acceptance cannot be established. Exact question timestamps, per-question causal
links, per-order line allocations and independently identified human approvers
are not available in the current journal. Customer views state those limits rather
than inferring them.
