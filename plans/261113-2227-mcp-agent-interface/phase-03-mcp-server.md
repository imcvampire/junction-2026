# Phase 3: MCP server

Goals: A1, A4. Exposes `ProcurementService` as MCP tools over streamable HTTP at `/mcp`.

## Requirements

- Tools (names are the public contract and are mirrored in the skill):

| Tool | Input | Output |
|---|---|---|
| `whoami` | — | agent, customer, spend limit, mandate requirements |
| `search_products` | query, required_tags, exclude_allergens, category, language, limit ≤ 20 | product views, no prices |
| `get_product` | product_id | full product view including pack and substitutes |
| `quote` | items (product_id + quantity in sales units **or** amount in L/kg), delivery_date, requirements, request_text | `quote_id`, `expires_at`, ranked options with conversion, price, availability, `meets_requirements` |
| `place_order` | quote_id, lines, reason, client_reference | order view: `placed` or `pending_approval` + reasons |
| `get_order` | order_id | status, lines, approval reasons, decision if any |
| `list_orders` | status filter, limit | the agent's own orders |
| `get_order_audit` | order_id | audit entries + text rendering |

- Tool descriptions say what the server enforces (fixed price, expiry, escalation). They do not
  instruct procedure; that lives in the skill (S2).
- Every tool returns structured output (`outputSchema` from the Pydantic models) plus a short text
  summary, so hosts without structured-output support still get something readable.
- Errors return an MCP tool error (`isError: true`) whose body is `{code, message, details}`, the
  same as REST. Protocol errors are reserved for malformed calls.
- Annotations: read tools `readOnlyHint: true`; `place_order` `destructiveHint: false`,
  `idempotentHint: true` (because of `client_reference`).

## Files

| Action | Path | Change |
|---|---|---|
| modify | `apps/api/pyproject.toml`, `uv.lock` | Add `mcp` (pin the current minor). |
| create | `apps/api/src/api/mcp/server.py` | `FastMCP` instance, tool registrations delegating to `ProcurementService`. |
| create | `apps/api/src/api/mcp/auth.py` | ASGI middleware on the mounted app: bearer → `AgentPrincipal` in a contextvar; 401 + `WWW-Authenticate` otherwise. |
| modify | `apps/api/src/api/main.py` | Mount `mcp.streamable_http_app()` at `/mcp`; run its session manager inside the FastAPI lifespan. |
| create | `apps/api/tests/test_mcp.py` | In-process MCP client over the ASGI app. |

## Steps

1. Read the pinned SDK's docs for three things: mounting streamable HTTP inside an existing
   Starlette/FastAPI app, lifespan or session-manager handling, and per-request access to HTTP
   headers or auth context. Use the SDK's `TokenVerifier` hook if it fits bearer keys cleanly;
   otherwise use middleware plus a contextvar.
2. Stateless HTTP mode (`stateless_http=True`, JSON responses). No server-side MCP session state is
   needed, and it scales and restarts cleanly.
3. Register the tools; each one resolves the principal and calls the service. No business logic
   lives here.
4. Origin check on `/mcp` (reject unexpected browser `Origin`) per MCP transport security guidance.
   Bind to 127.0.0.1 in dev.
5. Test with the SDK client: `initialize`, `tools/list` (8 tools, schemas present), the
   quote → place happy path, above-limit escalation, `quote_changed` as `isError`, and an
   unauthenticated request getting 401.

## Validation

- `uv run pytest tests/test_mcp.py`
- Manual: `npx @modelcontextprotocol/inspector` against `http://127.0.0.1:8000/mcp` with the
  bearer header; all tools list and `whoami` answers.

## Risks

- SDK mounting and lifespan details change between versions. Step 1 settles them before code.
- Some hosts drop `structuredContent`. The text summary carries the key numbers (product, quantity,
  unit price, total, status).
