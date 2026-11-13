# Phase 1: Agent identity and procurement core

Goals: A2, A3, A4, B1, B2, B4. Transport-agnostic; phases 2 and 3 only adapt this.

## Requirements

- An agent authenticates with a bearer key and resolves to an `AgentPrincipal`
  (`agent_id`, `name`, `customer`, mandate).
- `quote` converts buyer amounts into sales units, fetches live price and availability for at
  most 12 products, ranks them, and persists the quote with its requirements and expiry.
- `place_order` creates an order only from a live, unexpired quote owned by the calling agent, at
  the quoted prices. Any price or availability change refuses the order and creates nothing.
- The approval policy uses the agent's spend limit and the quote's frozen requirements.
- Every order's audit records the agent id, request text, quoted options, choice and reason.
- Upstream calls use the agent's `customer`.

## Files

| Action | Path | Change |
|---|---|---|
| create | `apps/api/src/api/agents/models.py` | `Mandate`, `AgentPrincipal`, `AgentRecord`. |
| create | `apps/api/src/api/agents/registry.py` | Create agent (returns plaintext key once), resolve by key hash, disable. |
| create | `apps/api/src/api/agents/cli.py` | `python -m api.agents.cli create --name --customer [--spend-limit] [--require TAG] [--ban ALLERGEN]`. |
| create | `apps/api/src/api/procurement/schemas.py` | Shared request and response models for both transports: `SearchRequest`, `ProductView`, `QuoteRequest` (`items[{product_id, quantity? \| amount{value, unit}}]`, `delivery_date`, `requirements`, `request_text`), `QuoteView`, `PlaceOrderRequest` (`quote_id`, `lines[{product_id, quantity, substitute_for?}]`, `reason`, `client_reference`), `OrderView`. |
| create | `apps/api/src/api/procurement/service.py` | `ProcurementService`: `search`, `get_product`, `quote`, `place_order`, `get_order`, `list_orders`, `audit`. |
| create | `apps/api/src/api/procurement/units.py` | `to_sales_units(product, amount)`: litres/kg → sales units, rounded up to `allowed_lot_size`; returns quantity and a one-line derivation. Refuses unit mismatch (kg asked, L sold) unless the content unit allows it. |
| modify | `apps/api/src/api/valio/client.py` | `quote(codes, requested, *, customer)`; cache key `(customer, code, date)`. |
| modify | `apps/api/src/api/orders/models.py` | Add `agent_id: str \| None`, `quote_id: str \| None`, `client_reference: str \| None` to `Order`; `agent_id` to `AuditEntry`. All default `None`, so existing JSON rows still load. |
| modify | `apps/api/src/api/orders/policy.py` | `evaluate(order, spend_limit)`; message names which limit applied. |
| modify | `apps/api/src/api/orders/store.py` | Additive tables `agents(id, name, customer, key_hash UNIQUE, mandate JSON, created_at, disabled)` and `quotes(id, agent_id, data JSON, expires_at)`; `orders.agent_id` index via `CREATE INDEX IF NOT EXISTS` on a new column added with a guarded `ALTER TABLE`. |
| modify | `apps/api/src/api/orders/service.py` | Extract the price/availability comparison (`_quote_changes`) and audit helpers for reuse; keep the buyer flow working until phase 5. |
| modify | `apps/api/src/api/config.py` | `quote_ttl_s` (900), `agent_quotes_per_minute` (30). |
| modify | `apps/api/src/api/main.py`, `services.py` | Construct `AgentRegistry` and `ProcurementService`; mount points for phases 2 and 3. |
| modify | `mise.toml` | `agent:create` task wrapping the CLI. |
| create | `apps/api/tests/test_procurement.py`, `test_agent_registry.py`, `test_units.py` | See validation. |

## Steps

1. Back up `apps/api/data/app.sqlite3` if present (`cp app.sqlite3 app.sqlite3.bak-<date>`), then
   add the tables. No existing column changes.
2. Registry and key format: `vaa_` + `secrets.token_urlsafe(32)`; store `sha256(key)`; lookup by
   hash, so there is no timing-sensitive string compare; refuse disabled agents.
3. Thread `customer` through `ValioClient.quote` and update its two callers.
4. `units.to_sales_units`, using `Product.content_per_sales_unit` and `allowed_lot_size`. The
   result is ceil(amount / content) rounded up to the lot size. Return `None` with a reason when
   content is unknown.
5. `ProcurementService.quote`:
   - validate products exist and are not deleted; validate the date is not in the past
     (Europe/Helsinki);
   - enforce the per-agent quote budget (sliding window, in memory) and `≤ 12` items;
   - convert amounts; call upstream once; rank (covers request and orderable first, then line
     total) and flag `cheapest_covering_option`, reusing the logic now in `agent/tools.py::quote`;
   - mark each option's `meets_requirements` against requirements ∪ mandate tags, and let unknown
     tags be returned as `ignored_requirements` rather than silently dropped;
   - persist the quote with `expires_at` and return it with `quote_id`.
6. `ProcurementService.place_order`:
   - idempotency on `(agent_id, client_reference)`: return the stored order;
   - load the quote and refuse `quote_not_found` (also when another agent owns it), `quote_expired`,
     or `line_not_in_quote`; check lot-size multiples;
   - invalidate the cache and re-quote; on any change, refuse `quote_changed` (409) with per-line
     diffs, and create no order (AC4);
   - build `Order` at the quoted prices; `within_preferences` uses the frozen requirements;
     `policy.evaluate(order, mandate.spend_limit)`; save as `placed` or `pending_approval` with one
     audit entry holding the agent id, request text, the quote's full option list (server-observed),
     chosen lines, reason and approval reasons;
   - per-order lock as in `OrderService`.
7. `get_order`, `list_orders` and `audit` are scoped to the calling agent. Another agent's order
   returns 404 rather than 403, so ids cannot be enumerated.
8. `decide` (approve/reject) stays in `OrderService`, unauthenticated by decision. Its audit entry
   keeps `actor="approver"`.

## Validation

- `uv run pytest tests/test_units.py tests/test_agent_registry.py tests/test_procurement.py`
- Cases: within limit → `placed`; above limit → `pending_approval` with reason; mandate limit
  overrides global; line missing a frozen requirement → `pending_approval`; price moved →
  `quote_changed`, no order row; expired quote; other agent's quote → 404; line not in quote;
  bad lot size; duplicate `client_reference` returns the same order; audit has `agent_id` and
  all quoted options; 1000 L with 1 L cartons and lot size 6 → 1002 sales units.
- `uv run pyright` and `uv run ruff check .`

## Risks and rollback

- The `ValioClient.quote` signature change touches the legacy agent tools. Update the callers in
  the same commit; phase 5 deletes them anyway.
- Rollback: the schema changes are additive, so revert the code and leave the tables in place.
