# 2026-11-14: Plan for cancelling orders until they ship

Planned `plans/261114-0323-cancel-unshipped-orders/`.

- The mock Valio API has no fulfilment signal, so "shipped" cannot be observed. The user chose an
  explicit `shipped` status set by a console/ops route (`POST /api/orders/{id}/ship`) rather than a
  dispatch-time cutoff.
- Permission: the agent cancels `placed` and `pending_approval` orders alone. An `approved` order
  needs the human's confirmation through MCP elicitation, unless the human asked for a replacement.
  In that case the agent places the new order first and cancels with `replaced_by`.
- The server checks the replacement: same customer, newer, and `placed` or `approved`. A replacement
  still `pending_approval` is refused (`replacement_pending`), so a rejected replacement cannot leave
  the kitchen with nothing. The server cannot prove the human asked for the replacement. This is
  recorded as a demo limitation.
- Ship and cancel share `OrderService`'s per-order lock. The state re-read inside the lock decides
  races.
