---
title: Member and admin agent keys with admin-only approval
date: 2026-11-13
summary: "Agent keys gained member/admin roles; only an admin key of the same customer can decide escalated orders, never its own"
---

# Member and admin agent keys with admin-only approval

## What happened

Implemented `plans/261113-2255-agent-roles-admin-approval` in four phases:

- `agents.role` (`member` default, `admin`) with an additive migration; `agent:create --role`, new `agent:set-role`.
- `ProcurementService.require_admin` and `_visible_order` hold all authorization. Admins see their customer's
  orders and decide `pending_approval` ones; cross-customer access is 404, member calls to admin operations are
  403 `forbidden`, deciding your own order is 403 `self_approval_forbidden`, and an empty reason is 422 `reason_required`.
- `OrderDecision.decided_by` and an audit entry with actor `approver` plus the deciding key's `agent_id`.
- MCP tools `list_pending_approvals`, `approve_order` and `reject_order` (destructiveHint). They are hidden from
  member `tools/list`, since SDK 1.30 exposes the request inside `list_tools`. REST twins live under
  `/api/agent/v1`, and the console `/api/orders/*` routes now need a key.
- The live run against the real mock API passed: the member escalated, the admin approved over MCP, and the
  member read `decided_by`.

## Review fixes

- An idempotent replay on approve/reject returned the cached response before any role check, so a demoted key
  still got 200. The admin check now runs first.
- The `orders.customer` ALTER and its backfill were separate autocommit statements. Migrations now run in
  `BEGIN IMMEDIATE`, and the backfill re-runs `WHERE customer IS NULL` on every open.

## Decisions

- Self-approval is refused, as recommended. This still awaits the user's confirmation.
- The decision reason is now required on the console routes too (422). This is a deliberate contract change.

## Gotchas

- `mise run agent:create` masks parts of stdout (`[]` printed as `[redacted]`), which breaks JSON parsing. Scripts
  should call `uv run python -m api.agents.cli` directly.
- The low-level MCP server keeps one shared `_tool_cache`, so a member's list refresh evicts the admin tools.
  Calls still work, but each one logs a "Tool not listed" warning.

## Next steps

- Confirm the self-approval policy and decide who uses the order console (open question 3).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
