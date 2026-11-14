---
title: Codex auto-cancelled MCP approval forms
date: 2026-11-14
summary: A top-level title in the elicitation requestedSchema made Codex 0.162 cancel approval and cancel forms without showing them
---

# Codex auto-cancelled MCP approval forms

## What happened
In Codex, `approve_order`, `reject_order` and `cancel_order` always failed with `decision_cancelled` or `cancel_declined`. Server logs showed `decision_elicited ... action=cancel` about 47 ms after the form was sent, so no human could have answered it. The same forms worked in Claude Code.

## Root cause
Pydantic's `model_json_schema()` emits a top-level `"title": "DecisionForm"` / `"CancelForm"`. MCP's `requestedSchema` defines only `type`, `properties` and `required` at the top level, and Codex 0.162 parses it strictly ("failed to parse typed MCP elicitation schema"). When parsing fails, Codex answers `cancel` and never shows the form. Per-field `title` keys are accepted.

Ruled out: `approvals_reviewer = "auto_review"` (the same cancel happens with `user`), and the `tool_call_mcp_elicitation` feature flag (it is enabled). `approval_policy = never` gives `decline` instead.

Evidence: a stub FastMCP server driven through `codex app-server` (`turn/start`), using a throwaway CODEX_HOME:
- a schema with the top-level title gave `cancel`, and the client never saw the form;
- the same schema without the top-level title was forwarded to the client and came back `accept`;
- the real fixed `_decision_form` and `_cancel_form` came back `accept` under both `user` and `auto_review`.

## Change
- `apps/api/src/api/mcp/server.py`: a new `_Form` base with `json_schema_extra` drops the top-level title, and `DecisionForm` and `CancelForm` inherit from it.
- `apps/api/tests/test_mcp.py`: asserts that `title` is not in `requestedSchema` for both forms.

## Next steps
- Any future elicitation form should subclass `_Form`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
