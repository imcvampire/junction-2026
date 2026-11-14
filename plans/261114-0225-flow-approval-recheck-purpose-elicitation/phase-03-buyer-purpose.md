---
phase: 3
title: Buyer purpose on quote, order and audit
status: pending
depends_on: [1]
---

# Phase 3: Buyer purpose on quote, order and audit

## Context

The flow asks the buyer what the product is used for before ranking substitutes (`U`, `Q2`). Goal B5
needs every substitution's reason on the order record. Today the purpose only reaches the server as
free text inside `request_text` or the order `reason`.

## Requirements

- `QuoteRequest.purpose: str | None = Field(default=None, max_length=200, description="What the
  buyer will use the product for, e.g. 'coffee', 'baking'; guides substitute choice")`. Strip it;
  empty becomes `None`.
- `QuoteView.purpose: str | None` and the stored quote JSON carry it unchanged (frozen like
  `requirements`).
- `Order.purpose: str | None = None`, copied from the quote in `_order_from_quote`. Old rows load
  with `None`.
- `OrderView.purpose`.
- First audit entry `details["purpose"]` when set; `render_audit_text` prints `purpose: <text>` after
  the request line.
- MCP `quote` tool: add the `purpose` argument and pass it into `QuoteRequest`. REST picks it up from
  the schema.

## Files

- Modify: `apps/api/src/api/procurement/schemas.py`, `apps/api/src/api/procurement/service.py`,
  `apps/api/src/api/orders/models.py`, `apps/api/src/api/orders/service.py` (`render_audit_text`),
  `apps/api/src/api/mcp/server.py`.
- Tests: `apps/api/tests/test_procurement.py`, `apps/api/tests/test_mcp.py`.

## Steps

1. Schema fields and the strip validator.
2. Copy into the order and the first audit entry; render it.
3. MCP `quote` argument.
4. Tests: purpose on quote, order, audit details and text; whitespace-only purpose becomes `None`;
   an order JSON without `purpose` loads; MCP `quote` accepts and returns it.

## Validation

`cd apps/api && uv run pytest tests/test_procurement.py tests/test_mcp.py`, then
`mise run typecheck:api`.

## Risks and rollback

Purely additive. Revert the phase to roll back; stored orders with `purpose` load fine without the
field because Pydantic ignores extra keys by default.
