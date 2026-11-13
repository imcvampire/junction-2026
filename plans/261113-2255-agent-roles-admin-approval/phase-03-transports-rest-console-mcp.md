---
phase: 3
title: "Transports: REST, console routes and MCP tools"
status: completed
depends_on: [2]
---

# Phase 3: Transports — REST, console routes and MCP tools

## Context

The agent REST routes (`routes/agent.py`) and the MCP tools (`mcp/server.py`) are thin twins over
`ProcurementService`. The console routes (`routes/orders.py`) are unauthenticated today. All
authorization is already in the service (phase 2), so this phase only exposes it.

## Requirements

### Agent REST (`routes/agent.py`)

- `GET /api/agent/v1/orders?scope=mine|company` passes `scope` through.
- `GET /api/agent/v1/approvals?limit=` calls `list_pending_approvals`.
- `POST /api/agent/v1/orders/{order_id}/approve` and `/reject`, with body `Decision{reason}` (make
  `reason` required with `min_length=1` for these routes, or validate it in the service) and an
  optional `Idempotency-Key` handled like the console's `_idempotent`.
  Scope the idempotency key per agent: `approve:{agent_id}:{order_id}`.

### Console routes (`routes/orders.py`)

- Every route takes the `Agent` dependency. `approve`/`reject` call `svc.procurement.decide(agent,
  ...)`. `get_order`/`audit`/`audit.txt` go through `_visible_order` (admin required for orders that
  are not the caller's). Remove the "unauthenticated by decision" docstring.
- Move `_idempotent` somewhere both routers share (for example `routes/_idempotency.py`) instead of
  copying it.

### MCP (`mcp/server.py`)

- New tools: `list_pending_approvals(limit)` (`_READ`), `approve_order(order_id, reason)` and
  `reject_order(order_id, reason)` with
  `ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False)`.
  The descriptions say "admin keys only; call only on the human's explicit instruction, after
  showing them the order's approval_reasons".
- `list_orders` gains `scope: Literal["mine","company"] = "mine"`.
- Add `ADMIN_TOOLS = frozenset({...})` and override `_ValioAimoMCP.list_tools` to drop them when the
  scope principal is not admin. First, check in SDK 1.30 that the request is reachable inside
  `list_tools` (`self.get_context().request_context.request`). If it is not, keep listing every tool
  and record that in the phase report. The service's 403 still protects the call.
- Update the server `instructions` string and the tool-name tuple at the top of the module.
- Summaries: `_order_summary` prints `decided_by` when present.

## Files

Modify: `routes/agent.py`, `routes/orders.py`, `mcp/server.py`; new `routes/_idempotency.py`.
Tests: `tests/test_agent_api.py`, `tests/test_mcp.py`. The deleted `tests/test_orders.py` stays
deleted, and console route cases go in `test_agent_api.py`.

## Test matrix

| Transport | Case | Expect |
|---|---|---|
| REST | `POST /api/orders/{id}/approve` without a key | 401 with `WWW-Authenticate` |
| REST | same, member key | 403 `forbidden` |
| REST | same, admin key | 200, `decision.decided_by` set |
| REST | `/api/agent/v1/approvals` member / admin | 403 / list |
| REST | approve with the same `Idempotency-Key` twice | same body, one audit entry |
| MCP | member `tools/list` | no `approve_order`, `reject_order`, `list_pending_approvals` |
| MCP | admin `tools/list` | includes them, `destructiveHint` true on approve/reject |
| MCP | member calls `approve_order` directly | `isError`, code `forbidden` |
| MCP | end to end: member places over limit, admin approves, member `get_order` | `approved` |

## Validation

```bash
cd apps/api && uv run pytest tests/test_agent_api.py tests/test_mcp.py && mise run check
```

## Risk and rollback

This is a breaking change for any caller of the unauthenticated `/api/orders/*` routes. Nothing in
the repo calls them now (no web app), and docs are updated in phase 4. To roll back, revert this
phase's commit.
