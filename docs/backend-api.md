# Backend API

FastAPI app in `apps/api`. It serves the agent interface twice, over the same service and schemas:

- **MCP** at `/mcp` (streamable HTTP, stateless, JSON responses) for MCP-capable agents.
- **REST** under `/api/agent/v1` for everything else.

Interactive REST docs are at `/api/docs` (disabled when `API_ENVIRONMENT=production`). The Valio
Aimo upstream key never leaves the backend; agents hold only their own key.

The customer-side procedure lives in the skill at
[`skills/valio-aimo-purchasing/`](../skills/valio-aimo-purchasing/SKILL.md).

## Configuration

All settings are environment variables loaded from `.env` by mise. `.env.example` lists them.

| Variable | Default | Purpose |
|---|---|---|
| `API_VALIO_BASE_URL` | — | Valio Aimo challenge API, `https://junction26.valioaimo.fi` |
| `API_VALIO_API_KEY` | — | `X-API-Key` for the challenge API |
| `API_VALIO_CUSTOMER` | `junction-demo` | The one company every agent buys for |
| `API_APPROVAL_SPEND_THRESHOLD_EUR` | `500` | Per-order spend limit (excl. VAT); an order above it waits for a human |
| `API_REQUIRED_TAGS` | `[]` | Company mandate: JSON list of tags every order line must have, e.g. `["LACTOSE_FREE"]` |
| `API_BANNED_ALLERGENS` | `[]` | Company mandate: JSON list of GS1 allergen codes no line may contain, e.g. `["AM"]` |
| `API_QUOTE_TTL_S` | `900` | Quote lifetime |
| `API_AGENT_QUOTES_PER_MINUTE` | `30` | Per-agent quote budget, protecting the upstream rate limit |
| `API_QUOTE_CACHE_TTL_S` | `180` | Upstream price/availability cache per (customer, product, date) |
| `API_MCP_ALLOWED_HOSTS` / `API_MCP_ALLOWED_ORIGINS` | localhost only | DNS-rebinding protection on `/mcp`; add the public host when deployed |
| `API_DB_PATH` | `apps/api/data/app.sqlite3` | Quotes, orders, audit trail, idempotency keys |

Missing Valio settings do not stop startup. Quote and order calls then fail with
`upstream_not_configured` (503).

## Agents (no authentication)

The API has no authentication or authorization. As a proof of concept every agent works for the
same company, so every MCP and REST client acts as one shared agent, `agt_mcp` (`company-agent`), of
`API_VALIO_CUSTOMER`. The agent is built from settings at startup and is not stored. Clients
therefore share quotes, `client_reference` values and "my" orders. Only the DNS-rebinding host and
origin allowlist (`API_MCP_ALLOWED_HOSTS`, `API_MCP_ALLOWED_ORIGINS`) guards `/mcp`; the REST routes
have no guard at all.

The shared agent can search, quote and place orders, read and audit any order of the company, list
pending approvals, and approve or reject them, including orders it placed itself. That last right is
how the buyer's decision reaches the server. On MCP the server asks the buyer itself through an
elicitation form (see [Approval](#approval)); over REST the client passes on the buyer's answer.

The **company mandate** comes from `API_REQUIRED_TAGS` and `API_BANNED_ALLERGENS`. Mandate tags are
added to every quote's requirements, and a line that misses one is refused at placement with
`mandate_violation`. The check uses the mandate in force when the order is placed, so a mandate
tightened by a restart applies to quotes already issued. The spend limit is not part of the mandate:
it is the single `API_APPROVAL_SPEND_THRESHOLD_EUR`, applied to each order on its own.

Databases created while agent keys existed keep their `agents` table; the server no longer reads it.

Connect Claude Code:

```sh
claude mcp add --transport http valio-aimo http://127.0.0.1:8000/mcp
```

## Operations

| MCP tool | REST | Purpose |
|---|---|---|
| `whoami` | `GET /api/agent/v1/me` | Identity, customer, per-order spend limit and company mandate |
| `search_products` | `GET /api/agent/v1/products?q=&tag=&exclude_allergen=&category=&lang=&limit=` | Static catalog search, no prices, at most 20 results |
| `get_product` | `GET /api/agent/v1/products/{id}` | Full product view |
| `quote` | `POST /api/agent/v1/quotes` | Live price and availability for at most 12 products; stored, expiring |
| — | `GET /api/agent/v1/quotes/{id}` | Re-read a stored quote |
| `place_order` | `POST /api/agent/v1/orders` | Order from a quote at its prices |
| `get_order` | `GET /api/agent/v1/orders/{id}` | Status, lines, approval reasons, decision with `decided_by` |
| `list_orders` | `GET /api/agent/v1/orders?status=&limit=&scope=mine\|company` | The agent's own orders; `company` lists the customer's |
| `get_order_audit` | `GET /api/agent/v1/orders/{id}/audit`, `/audit.txt` | Audit trail as JSON and text |
| `list_pending_approvals` | `GET /api/agent/v1/approvals?limit=` | The customer's `pending_approval` orders, oldest first |
| `approve_order` | `POST /api/agent/v1/orders/{id}/approve` `{reason, expected_total?}` | Re-check price and stock, then approve. MCP asks the human through elicitation; REST is idempotent with `Idempotency-Key` |
| `reject_order` | `POST /api/agent/v1/orders/{id}/reject` `{reason}` | Reject; no upstream call. MCP asks the human through elicitation |

MCP tools return `structuredContent` that matches their `outputSchema`, plus a text block holding a
one-line summary followed by the same JSON. Read tools are annotated `readOnlyHint`; `place_order`
is `idempotentHint` because of `client_reference`. `approve_order` and `reject_order` are
`destructiveHint`, so hosts such as Claude Code ask before calling them. Every caller sees all tools.

The MCP endpoint is stateful (`Mcp-Session-Id`) and answers tool calls as SSE streams, because the
decision tools send an elicitation request in the middle of the call. Sessions live in the server
process: after a restart a client gets `404` for its old session id and must initialize again.

### Quote

Each item gives either `quantity` (sales units) or `amount` (`{"value": 1000, "unit": "L"}`; units
`L`, `dl`, `cl`, `ml`, `kg`, `g`). The server converts amounts into sales units, rounding up to whole
counted units and to `allowed_lot_size`, and returns the working in `conversion`. A `quantity` that is
not a valid order step is rounded up the same way. `place_order` accepts only quantities on that
step (whole units for counted sales units such as `KI` and `ST`).

The quote freezes `requirements`, which are the agent's tags plus its mandate tags. Agent tags the
catalog cannot check are returned in `ignored_requirements` and not enforced. Mandate tags are always
kept; one the catalog cannot check counts as unmet, so placing that line is refused. Each option
reports `missing_requirements`, and `breaks_mandate` is true when one of them is a mandate tag.
Options are ranked: deliverable first, then meeting requirements, then line total, then delivery
reliability. The best is flagged `cheapest_covering_option`.

An optional `purpose` (at most 200 characters, such as `coffee` or `baking`) records what the buyer
will use the product for. It is frozen on the quote, copied to the order (`OrderView.purpose`) and
written to the first audit entry, so a substitution carries its reason. Blank means unset.

### Place order

`place_order` takes `quote_id`, `lines` (`product_id`, `quantity`, optional `substitute_for`),
`reason` and `client_reference`. The server:

1. returns the existing order if this agent already used `client_reference` for the same quote;
2. refuses an unknown, foreign, expired or already-used quote, a product not in the quote, a quantity
   that is not a lot-size multiple, or a quantity the quote does not cover, and refuses a line that
   breaks the company mandate with `mandate_violation` (`details.lines[].violations`);
3. re-quotes upstream and refuses with `quote_changed` if any price or availability moved, creating
   nothing;
4. applies the approval policy (spend limit only) and stores the order as `placed` or
   `pending_approval`, consuming the quote, with one audit entry in the same transaction. A line that
   misses only the buyer's own requirements is placed with `within_preferences: false` and its
   `missing_requirements`, and the audit summary records that the buyer accepted the miss.

Over REST, an `Idempotency-Key` header is accepted if it equals `client_reference`.

## Errors

Both transports use one body: `{"code", "message", "details"}`. Over MCP it is the whole text of a
tool result with `isError: true`, including argument-schema errors (`invalid_arguments`).

| Code | HTTP | Meaning |
|---|---|---|
| `invalid_arguments` | 422 | Schema validation failed (MCP); REST returns FastAPI's own 422 body |
| `invalid_date`, `unknown_product`, `duplicate_product`, `line_not_in_quote`, `invalid_quantity`, `idempotency_key_mismatch` | 422 | Bad request content |
| `mandate_violation` | 422 | A line breaks the company mandate; nothing was created |
| `reason_required` | 422 | A rejection with an empty reason |
| `product_not_found`, `quote_not_found`, `order_not_found` | 404 | Missing, or not visible to this key (another agent's or another customer's) |
| `quote_expired`, `quote_already_used`, `quote_changed`, `not_deliverable`, `client_reference_reused`, `invalid_state` | 409 | Refused by the rules; nothing was created |
| `price_changed` | 409 | Approval: the price moved since placement, or `expected_total` does not match the current total; the order stays pending. `details`: `changes`, `old_total`, `new_total` |
| `stock_changed` | 409 | Approval: stock, a sales block or a missing price means the order cannot be filled; the order was closed. `details`: `changes`, `order`, `rerun` |
| `decision_cancelled` | — | MCP only: the human declined or cancelled the approval form; nothing was decided |
| `elicitation_required` | — | MCP only: the client did not advertise form elicitation; nothing was decided |
| `rate_limited` | 429 | Agent quote budget used; `details.retry_after_s` |
| `upstream_not_configured` | 503 | Valio settings missing |
| `upstream_rate_limited` | 429 | Valio Aimo throttled us |
| `upstream_rejected` | 422 | Valio Aimo rejected the request |
| `upstream_unavailable`, `upstream_error` | 502 | Valio Aimo failed or rejected our credentials |
| `internal_error` | 500 | Unexpected server error (MCP only) |

## Approval

Approval is required only when an order's total exceeds the per-order spend limit
(`API_APPROVAL_SPEND_THRESHOLD_EUR`). The reason names the limit. A line that misses the buyer's own
requirements is the buyer's choice and is placed; a line that breaks the mandate never becomes an
order (`mandate_violation`). Orders stored as pending for a requirements miss before this rule stay
pending and can still be decided.

Any key of the order's customer can decide. Approval flow, as in [`flow.md`](flow.md):

1. **Re-check.** Approving re-quotes the order's lines for its customer and delivery date (one
   upstream price and availability call). Rejecting never calls upstream. If upstream fails, the
   error is returned and the order stays pending.
2. **Stock short.** If any line is no longer covered, is sales-blocked or has no price, the order is
   closed: status `rejected`, `decision.decided_by` null, audit actor `system`, and a reason naming the
   lines. The call returns `stock_changed` with `details.rerun` (`request_text`, `requirements`,
   `purpose`, `delivery_date`, `lines`) so the agent can quote again without re-asking the buyer.
   A stock and price change together counts as stock.
3. **Price changed.** The order stays pending and the call returns `price_changed` with per-line
   `was`/`now`, `old_total` and `new_total`. Approving with `expected_total` equal to the new total
   (to the cent) reprices the lines and approves; the audit gets a `repriced` entry before `approved`.
   An `expected_total` that does not match the current total is refused the same way, so a stale
   confirmation never approves. The spend limit is not re-applied: the human approves the new total.
4. **Unchanged.** The order is approved as before.

The re-check runs outside the per-order lock; the decision then re-reads the order under the lock and
answers `invalid_state` if someone else decided it meanwhile. Deciding an order that is already
decided the same way returns it unchanged, without a re-check or a form.

**MCP.** `approve_order` and `reject_order` take `order_id` and an optional suggested `reason`. The
server refuses with `elicitation_required` if the client did not advertise form elicitation. For an
approval it runs the re-check first, then sends an elicitation whose message names the order, the
placing agent, the total, the lines, the approval reasons, the purpose and any price change. The form
has `decision` (`approve` or `reject`, defaulting to the tool called) and `reason` (optional, default
the suggestion; a rejection without one is refused with `reason_required`). The server records the form's decision and reason, which may differ from the tool
called. Decline or cancel returns `decision_cancelled`. The decision's audit entry has
`confirmed_via: mcp_elicitation`. Accepting the form re-checks once more before approving, so a price
that moves while the form is open is refused with `price_changed` rather than approved unseen.

**REST.** Both route families take `{reason, expected_total?}`. A reason is optional to approve and
required to reject (`{}` or `"reason": ""` on reject gives 422). Decisions record `confirmed_via: rest`.

Order console endpoints, outside `/agent/v1`. They act as the same shared agent and follow the same
service rules as the decision tools:

| Method and path | Purpose |
|---|---|
| `POST /api/orders/{id}/approve`, `/reject` `{reason, expected_total?}` | Decide a `pending_approval` order (idempotent with `Idempotency-Key`) |
| `GET /api/orders/{id}`, `/audit`, `/audit.txt` | Read an order of the company, and its trail |
| `GET /api/products?q=&tag=` | Public static catalog search |
| `GET /api/health` | Liveness |

## Audit trail

Each order's first entry records the agent id and name, the request text, the purpose, the frozen requirements,
every option the server quoted (with price, coverage and requirement checks), the chosen lines, the
agent's reason, approval reasons and the spend limit applied. Decisions add an entry with actor
`approver`, the deciding agent's `agent_id`, `details.decided_by` (`agent_id`, `name`),
`details.confirmed_via` and the reason. A repriced approval adds a `repriced` entry with per-line old
and new prices and totals. A system closure has actor `system` and the `changes` that closed it.
`audit.txt` renders this as plain text.

## Known demo limitations

These are accepted product decisions for the hackathon demo, not oversights.

- Over **REST** a decision is made by whoever calls the route, which can be the agent that placed the
  order. The server cannot prove a human said yes there: an agent that ignores the skill can approve
  its own order. The audit shows `confirmed_via: rest`. On MCP the decision
  comes from the host's elicitation form, which a host shows to its user; the server trusts that the
  host does not answer the form on the model's behalf.
- The spend limit applies to each order on its own. An agent can split a purchase across several
  quotes and orders under the limit.
- There is no authentication on `/mcp` or the REST routes: anyone who can reach the server can
  quote, order and decide escalations as the shared agent. Keep it on localhost or a trusted
  network. OAuth 2.1 is the production path.
- The per-agent quote budget is held in memory, so it resets on restart and is per process.
