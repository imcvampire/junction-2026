# 2026-11-14: Cancel until shipped, implemented

Implemented `plans/261114-0323-cancel-unshipped-orders/`. Orders now have `shipped` and `cancelled`
statuses, a console ship route, and cancel over REST and the MCP `cancel_order` tool. 111 tests
pass, and the live check is in `plans/reports/live-check-261114-0340-cancel-unshipped-orders.md`.

What the review caught after the first green run:

- A whitespace-only `replaced_by` counted as a replacement in the MCP needs-human check. The service
  then stripped it to nothing, so an approved order was cancelled with no form. The tool now
  normalises `replaced_by` once, before deciding.
- The MCP tool decides whether to ask the human from a status it read outside the order lock. An
  approval that landed in between could be cancelled as `confirmed_via: agent`. `OrderService.cancel`
  now takes `expected_status` and refuses a moved order with `status_changed`.
- `ToolFailure` raised inside `_run` was being wrapped as `internal_error`. `_run` re-raises it now.

Left open: a single placed order can be named as `replaced_by` for several approved orders.
