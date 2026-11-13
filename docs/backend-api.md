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
| `API_VALIO_CUSTOMER` | `junction-demo` | Default upstream customer for new agents |
| `API_APPROVAL_SPEND_THRESHOLD_EUR` | `500` | Global per-order limit (excl. VAT); an agent mandate can override it |
| `API_QUOTE_TTL_S` | `900` | Quote lifetime |
| `API_AGENT_QUOTES_PER_MINUTE` | `30` | Per-agent quote budget, protecting the upstream rate limit |
| `API_QUOTE_CACHE_TTL_S` | `180` | Upstream price/availability cache per (customer, product, date) |
| `API_MCP_ALLOWED_HOSTS` / `API_MCP_ALLOWED_ORIGINS` | localhost only | DNS-rebinding protection on `/mcp`; add the public host when deployed |
| `API_DB_PATH` | `apps/api/data/app.sqlite3` | Agents, quotes, orders, audit trail, idempotency keys |

Missing Valio settings do not stop startup. Quote and order calls then fail with
`upstream_not_configured` (503).

## Agents and authentication

```sh
mise run agent:create -- --name hotel-demo --customer <customer-id> \
  [--role admin] [--spend-limit 300] [--require LACTOSE_FREE] [--ban AM]
mise run agent:list
mise run agent:set-role -- <agent_id> admin|member
```

`agent:create` prints the key (`vaa_…`) once; only its SHA-256 hash is stored. Disable a key with
`uv run python -m api.agents.cli disable <agent_id>` in `apps/api`.

Every MCP, `/api/agent/v1` and `/api/orders` request needs `Authorization: Bearer <key>`. A missing,
unknown or disabled key gets `401` with `WWW-Authenticate: Bearer`.

Each key has a **role**, stored server-side and read on every request (never from the token):

| Role | Can do |
|---|---|
| `member` (default) | Search, quote, place orders, read its own quotes, orders and audit trails. |
| `admin` | Everything a member can, plus read any order of its customer, list the customer's pending approvals, and approve or reject them. Never an order it placed itself. |

Another agent's quotes and orders answer `404`, as does any order of another customer, so ids cannot
be probed. A member calling an admin operation gets `403 forbidden`. Existing keys became members
when the `role` column was added. A role change takes effect on the key's next request.

The **mandate** sets what an agent may do alone: `spend_limit_eur` (default: the global threshold),
`required_tags` and `banned_allergens`. Mandate tags are added to every quote's requirements.

Connect Claude Code:

```sh
claude mcp add --transport http valio-aimo http://127.0.0.1:8000/mcp \
  --header "Authorization: Bearer $VALIO_AIMO_AGENT_KEY"
```

## Operations

| MCP tool | REST | Purpose |
|---|---|---|
| `whoami` | `GET /api/agent/v1/me` | Identity, customer, `role`, `can_approve`, spend limit and mandate |
| `search_products` | `GET /api/agent/v1/products?q=&tag=&exclude_allergen=&category=&lang=&limit=` | Static catalog search, no prices, at most 20 results |
| `get_product` | `GET /api/agent/v1/products/{id}` | Full product view |
| `quote` | `POST /api/agent/v1/quotes` | Live price and availability for at most 12 products; stored, expiring |
| — | `GET /api/agent/v1/quotes/{id}` | Re-read a stored quote |
| `place_order` | `POST /api/agent/v1/orders` | Order from a quote at its prices |
| `get_order` | `GET /api/agent/v1/orders/{id}` | Status, lines, approval reasons, decision with `decided_by` |
| `list_orders` | `GET /api/agent/v1/orders?status=&limit=&scope=mine\|company` | The agent's own orders; `company` (admin) lists the customer's |
| `get_order_audit` | `GET /api/agent/v1/orders/{id}/audit`, `/audit.txt` | Audit trail as JSON and text |
| `list_pending_approvals` | `GET /api/agent/v1/approvals?limit=` | Admin: the customer's `pending_approval` orders, oldest first |
| `approve_order` | `POST /api/agent/v1/orders/{id}/approve` `{reason}` | Admin: approve (idempotent with `Idempotency-Key`) |
| `reject_order` | `POST /api/agent/v1/orders/{id}/reject` `{reason}` | Admin: reject (idempotent with `Idempotency-Key`) |

MCP tools return `structuredContent` that matches their `outputSchema`, plus a text block holding a
one-line summary followed by the same JSON. Read tools are annotated `readOnlyHint`; `place_order`
is `idempotentHint` because of `client_reference`. `approve_order` and `reject_order` are
`destructiveHint`, so hosts such as Claude Code ask before calling them. The three admin tools are
left out of a member key's `tools/list`; the service refuses them anyway.

### Quote

Each item gives either `quantity` (sales units) or `amount` (`{"value": 1000, "unit": "L"}`; units
`L`, `dl`, `cl`, `ml`, `kg`, `g`). The server converts amounts into sales units, rounding up to whole
counted units and to `allowed_lot_size`, and returns the working in `conversion`. A `quantity` that is
not a valid order step is rounded up the same way. `place_order` accepts only quantities on that
step (whole units for counted sales units such as `KI` and `ST`).

The quote freezes `requirements`, which are the agent's tags plus its mandate tags. Agent tags the
catalog cannot check are returned in `ignored_requirements` and not enforced. Mandate tags are always
kept; one the catalog cannot check counts as unmet, so orders escalate. Options are ranked: deliverable
first, then meeting requirements, then line total, then delivery reliability. The best is flagged
`cheapest_covering_option`.

### Place order

`place_order` takes `quote_id`, `lines` (`product_id`, `quantity`, optional `substitute_for`),
`reason` and `client_reference`. The server:

1. returns the existing order if this agent already used `client_reference` for the same quote;
2. refuses an unknown, foreign, expired or already-used quote, a product not in the quote, a quantity
   that is not a lot-size multiple, or a quantity the quote does not cover;
3. re-quotes upstream and refuses with `quote_changed` if any price or availability moved, creating
   nothing;
4. applies the approval policy and stores the order as `placed` or `pending_approval`, consuming the
   quote, with one audit entry in the same transaction.

Over REST, an `Idempotency-Key` header is accepted if it equals `client_reference`.

## Errors

Both transports use one body: `{"code", "message", "details"}`. Over MCP it is the whole text of a
tool result with `isError: true`, including argument-schema errors (`invalid_arguments`).

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing, unknown or disabled agent key |
| `invalid_arguments` | 422 | Schema validation failed (MCP); REST returns FastAPI's own 422 body |
| `invalid_date`, `unknown_product`, `duplicate_product`, `line_not_in_quote`, `invalid_quantity`, `idempotency_key_mismatch` | 422 | Bad request content |
| `reason_required` | 422 | A decision with an empty reason |
| `forbidden` | 403 | Member key calling an admin operation |
| `self_approval_forbidden` | 403 | Admin deciding an order its own key placed |
| `product_not_found`, `quote_not_found`, `order_not_found` | 404 | Missing, or not visible to this key (another agent's or another customer's) |
| `quote_expired`, `quote_already_used`, `quote_changed`, `not_deliverable`, `client_reference_reused`, `invalid_state` | 409 | Refused by the rules; nothing was created |
| `rate_limited` | 429 | Agent quote budget used; `details.retry_after_s` |
| `upstream_not_configured` | 503 | Valio settings missing |
| `upstream_rate_limited` | 429 | Valio Aimo throttled us |
| `upstream_rejected` | 422 | Valio Aimo rejected the request |
| `upstream_unavailable`, `upstream_error` | 502 | Valio Aimo failed or rejected our credentials |
| `internal_error` | 500 | Unexpected server error (MCP only) |

## Approval

Approval is required when an order's total exceeds the agent's spend limit, or when any line misses
one of the quote's requirements (for example a substitute that is not lactose-free). The reason names
the limit and its source (`agent mandate` or `global threshold`) or the missing tags.

Only an admin key of the order's customer can decide, never on an order its own key placed, and
always with a non-empty reason (`{}` or `"reason": ""` gives 422; before roles, the console accepted an
empty reason). A replayed `Idempotency-Key` is refused once the key is no longer an admin. Approval flow: a member places an order that escalates, an admin
calls `list_pending_approvals` and then `approve_order` or `reject_order`, and the member reads the
decision and `decision.decided_by` back through `get_order`.

Order console endpoints, outside `/agent/v1`. They take the same bearer key and the same service
rules as the admin tools:

| Method and path | Purpose |
|---|---|
| `POST /api/orders/{id}/approve`, `/reject` `{reason}` | Admin: decide a `pending_approval` order (idempotent with `Idempotency-Key`) |
| `GET /api/orders/{id}`, `/audit`, `/audit.txt` | Read an order visible to the key, and its trail |
| `GET /api/products?q=&tag=` | Public static catalog search |
| `GET /api/health` | Liveness |

## Audit trail

Each order's first entry records the agent id and name, the request text, the frozen requirements,
every option the server quoted (with price, coverage and requirement checks), the chosen lines, the
agent's reason, approval reasons and the spend limit applied. Decisions add an entry with actor
`approver`, the deciding key's `agent_id`, `details.decided_by` (`agent_id`, `name`, `role`) and the
reason. `audit.txt` renders this as plain text.

## Known demo limitations

These are accepted product decisions for the hackathon demo, not oversights.

- A decision is made by an admin **key**. The skill tells the admin's agent to decide only on the
  human's explicit instruction, and the tools are annotated `destructiveHint` so hosts ask first,
  but the server cannot prove a human said yes. The audit shows which key decided.
- A company with a single admin key cannot decide that admin's own escalated orders; it needs a
  second admin key.
- The spend limit applies to each order on its own. An agent can split a purchase across several
  quotes and orders under the limit.
- Agent keys are static bearer tokens rather than OAuth 2.1.
- The per-agent quote budget is held in memory, so it resets on restart and is per process.
