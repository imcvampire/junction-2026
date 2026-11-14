---
title: Journal viewer as a buyer-facing audit view
description: Rework /journal-viewer so a non-technical buyer or manager can audit one purchasing session, centred on a plain-language timeline that highlights human decisions, framed by what was asked (input) and what came out (output), with every technical detail removed.
status: completed
priority: P2
effort: 5h
branch: master
tags: [web, frontend, audit]
blockedBy: []
blocks: []
created: 2026-11-14
goals: docs/project-goals.md
builds_on: plans/261114-1101-journal-viewer-web
---

# Journal viewer as a buyer-facing audit view

## Outcome

A person who never saw the agent's tools opens a journal file and can answer, top to bottom and
without scrolling past ids or codes:

1. **What was asked?** The buyer's request verbatim, the delivery date, the amount, the
   requirements in plain words, and the agent's spending limit as a sentence.
2. **What happened, step by step?** A timeline that is the visual centre of the page. Each step says
   who acted (the agent, the buyer, or a problem), what happened in a sentence, when (or "time not
   recorded"), and which products it concerned by name. Human decisions (answers, approvals,
   cancellations) stand out visually, carry their detail inline (the question with the picked
   answer, the approval reason and who gave it), and can be shown on their own with one toggle.
3. **What came out?** Each order as a plain receipt: products by name, quantity in real-world
   amounts, total excluding VAT, delivery date, status in words, why sign-off was needed and who
   gave it. Then why this option won, a simplified comparison of the options, any warning, and the
   next steps.

## Decisions (planner defaults, confirm or override)

| Decision | Chosen | Rejected and why |
|---|---|---|
| Technical details | Removed from the page, not hidden behind a toggle | The request says "remove all"; a toggle keeps the clutter in the code and tests. The raw JSON stays the source for engineers. |
| Page order | Summary → Input → Timeline → Output → Sources | Matches how an auditor reads: ask, process, result. The current order puts metrics and authority before the result. |
| Timeline detail | Inline, expandable per step; human steps open by default | Separate "Buyer questions" and "Refused calls" sections duplicate the timeline and split the story. |
| Linking steps to detail | Match the nth `question`/`answer` step to `questions[n]`, the nth `error` step to `errors[n]`, and `order`/`approval`/`cancel` steps by `refs.order_id` | The schema has no question or error id in `refs`. When counts do not match, steps render without inline detail and the unmatched records show in a short list under the timeline, so nothing is lost. |
| Product names | Resolve `refs.product_ids` through quote options, then candidates, then research; unknown ids show "an unnamed product" | Names exist in the journal; ids mean nothing to a buyer. |
| Step titles | Rendered verbatim | They are agent-written prose. Rewriting ids inside free text is guesswork; the resolved product names sit next to the title instead. |
| Quantities | "1,000 L (100 × 10 L)" from `requested`, `quantity` and `content_per_sales_unit`; fall back to "100 sales units" | `tags-and-units.md` forbids guessing what `KI` means. |
| Tags | A label map for known tags and allergen codes (`LACTOSE_FREE` → "Lactose-free", `FREE_FROM:AM` → "Declared free from milk", `no:AM` → "No milk listed", `brand:Valio` → "Brand: Valio"); unknown tags are title-cased | Source vocabulary is `skills/valio-aimo-purchasing/references/tags-and-units.md`. |
| Research and recipe sections | Folded into one compact "Sources the agent consulted" list (site, what it was used for, outcome) | Web sources are audit-relevant; research ids, raw candidate ids and failure codes are not. |

## Removed from the page

Agent id, customer id, host, model, `kind` badge, tool-call count, tool names, `seq` refs line,
quote ids, order ids as headings (one low-emphasis "Order reference" stays for looking an order up
in the console), client reference, research ids, error codes, rank and `conversion` strings,
schema-description tooltips, the raw searches/candidates collapsible.

## Constraints

- No schema or API change. `journal.schema.json` stays the contract; `parseJournal` and
  `load-error.tsx` keep their behaviour (a file that cannot be loaded still says exactly why).
- Strings still render as text only; the existing hostile-string and link-safety tests keep
  passing in their new locations.
- Phone width without horizontal page scroll; light and dark themes; the timeline's human/agent
  distinction must not rely on colour alone (icon + label too).
- `mise run check` stays green.

## Non-goals

- Editing, exporting or printing journals; comparing several journals.
- A "technical details" mode.
- Cross-checking a journal against the live server.
- Changing what the agent writes into the journal.

## Phases

| # | Phase | Depends on | File |
|---|---|---|---|
| 1 | Plain-language layer (labels, names, quantities, step linking) | — | [phase-01-plain-language-layer.md](phase-01-plain-language-layer.md) |
| 2 | Audit timeline | 1 | [phase-02-audit-timeline.md](phase-02-audit-timeline.md) |
| 3 | Page layout: summary, input, output, sources | 1, 2 | [phase-03-page-layout.md](phase-03-page-layout.md) |
| 4 | Verify in the browser | 3 | [phase-04-verify.md](phase-04-verify.md) |

## Acceptance criteria

- With `journal-example.json` loaded, the page shows none of: `whoami`, `place_order`, `q_example`,
  `cheapest_covering`, `agent_id` value, `KI` as a bare unit, `Kind:`, `Tool calls`. A component
  test asserts this on the rendered text.
- The timeline lists all six example steps in order; the approval step reads as a buyer action,
  shows "For the gala dinner" and who decided, and is the only step left when "Only human
  decisions" is on.
- The order receipt shows "Valio skimmed milk 1 l lactose free UHT", "1,000 L (100 × 10 L)",
  €1,540.00, Mon 16 Nov 2026, and that sign-off was needed because the total exceeds €500.
- A journal whose questions outnumber its question steps still shows every question.
- `mise run check` passes; a browser check at 375 px and in dark mode shows no horizontal scroll.

## Extension trace

Next credible variant: the order console (`/orders`) showing the same session timeline for a
live order. Stable contract: `toAuditSteps(journal)` returns plain view models (actor, label,
time, product names, linked detail) with no React in them. What changes: a second producer
building the same view models from the server's audit trail. Phase 1 proves the seam by testing
`toAuditSteps` without rendering anything; no adapter is built now.
