# Phase 2: Agent REST API

Goals: A5, B3. Same operations as MCP, same service and schemas, same auth.

## Requirements

- Every agent route requires `Authorization: Bearer <agent key>`. A missing or unknown key returns
  401 with `WWW-Authenticate: Bearer`.
- Responses use `procurement/schemas.py` models, so the REST OpenAPI and the MCP tool schemas
  describe identical shapes.
- `OrderError` codes pass through unchanged (`quote_changed`, `quote_expired`, …).

## Files

| Action | Path | Change |
|---|---|---|
| create | `apps/api/src/api/agents/auth.py` | `require_agent` FastAPI dependency → `AgentPrincipal`; also used by phase 3's middleware. |
| create | `apps/api/src/api/routes/agent.py` | Router `/agent/v1`. |
| modify | `apps/api/src/api/main.py` | Include router (if phase 1 did not already stub it). |
| create | `apps/api/tests/test_agent_api.py` | Route-level tests. |

## Endpoints

| Method and path | Service call |
|---|---|
| `GET /api/agent/v1/me` | principal and mandate (lets an agent discover its authority) |
| `GET /api/agent/v1/products?q=&tag=&exclude_allergen=&category=&lang=&limit=` | `search` |
| `GET /api/agent/v1/products/{id}` | `get_product` |
| `POST /api/agent/v1/quotes` | `quote` |
| `GET /api/agent/v1/quotes/{id}` | stored quote (agent-scoped) |
| `POST /api/agent/v1/orders` | `place_order` (`client_reference` in body; `Idempotency-Key` header accepted as an alias) |
| `GET /api/agent/v1/orders`, `/orders/{id}`, `/orders/{id}/audit`, `/orders/{id}/audit.txt` | scoped reads |

The human approval endpoints stay at `POST /api/orders/{id}/approve|reject`, outside `/agent/v1`.

## Steps

1. `require_agent`: parse the bearer key, resolve it through the registry, and attach `agent_id`
   to the request log context. Never log the key.
2. Thin route handlers; no logic beyond mapping query params to schemas.
3. Tests use `TestClient` with fake Valio transport from `conftest.py` and a seeded agent.

## Validation

- `uv run pytest tests/test_agent_api.py`: 401 without a key; disabled key gives 401; quote →
  order happy path; `quote_changed` maps to 409; another agent's order gives 404; audit.txt
  includes the agent name.
- `/api/openapi.json` lists `/agent/v1` routes with the bearer security scheme.
