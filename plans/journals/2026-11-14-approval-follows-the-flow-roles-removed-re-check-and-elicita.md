---
title: "Approval follows the flow: roles removed, re-check and elicitation planned"
date: 2026-11-14
summary: "Removed the admin role, aligned flow.md and the skill, and planned approval re-check, buyer purpose and MCP elicitation"
---

# Approval follows the flow: roles removed, re-check and elicitation planned

## What happened

- Reviewed `docs/flow.md` against the code. Main gap: the flow re-checks price and stock after a human
  approves (`H -- Yes --> R`), but `OrderService.decide` only changes status.
- Removed the `member`/`admin` role. Any key of a customer can now see that customer's orders and
  approve or reject them, including orders it placed, on the buyer's instruction. `mise run check`
  passed (82 tests). Existing databases keep the unused `role` column.
- Updated `docs/flow.md` and the customer skill: ask the buyer's purpose before ranking substitutes,
  hold orders over the purchase limit as pending approval, and ask the buyer through the host's
  interactive question tool rather than plain text.

## Decision

Plan `plans/261114-0225-flow-approval-recheck-purpose-elicitation/`:
- On approval, re-check price and stock. A price change returns `409 price_changed` and needs the
  human to confirm the new total. A stock shortfall closes the order (`409 stock_changed`).
- Add an optional `purpose` field to quote, order and audit.
- Over MCP, `approve_order` and `reject_order` ask the human through elicitation, and refuse clients
  that cannot show the form.

## Next steps

- Run `/ak-cook` on the plan.
- Phase 4 must first check that Claude Code shows MCP elicitation forms.
- Still open: should a system-closed order get its own status instead of `rejected`?

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
