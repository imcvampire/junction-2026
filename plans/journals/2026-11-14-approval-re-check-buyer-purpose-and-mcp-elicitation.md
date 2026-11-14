---
title: "Approval re-check, buyer purpose and MCP elicitation"
date: 2026-11-14
summary: "Spend-only approval, price/stock re-check at approval, purpose field, MCP decisions confirmed via elicitation"
---

# Approval re-check, buyer purpose and MCP elicitation

## What happened
Implemented plans/261114-0225-flow-approval-recheck-purpose-elicitation, phases 1-4 plus the phase 5 docs and skill work.

- Approval now fires only for the spend limit (`ApprovalPolicy.evaluate`). A line that misses only the buyer's own preferences is placed, and the miss is recorded in the line and in the audit summary. A line that breaks the agent's current mandate is refused at placement with `422 mandate_violation`. Quote options gain `breaks_mandate`.
- Approving re-quotes the order (`ProcurementService.recheck_for_approval`):
  - If only the price changed, it returns `409 price_changed` until `expected_total` matches the new total. Then the lines are repriced and the audit gets a `repriced` entry.
  - If stock or a sales block no longer covers the order, it returns `409 stock_changed`. The order is closed (rejected, actor `system`, no `decided_by`), and `details.rerun` carries the request text, requirements, purpose, date and lines so the agent can re-run the flow.
  - Rejecting never calls upstream.
- `purpose` (optional, max 200 characters, blank means unset) is frozen on the quote and copied to the order, the first audit entry and `audit.txt`.
- On MCP, `approve_order` and `reject_order` ask the human through elicitation. The form's decision and reason are recorded with `confirmed_via: mcp_elicitation`; REST records `rest`.

## Surprises
- Elicitation cannot work with `stateless_http=True` + `json_response=True`. In stateless mode `client_params` is None, so the server cannot see the client's capabilities, and a JSON response cannot carry a server request in the middle of a call. The MCP transport is now stateful with SSE, and sessions are lost on restart.
- `httpx.ASGITransport` buffers whole responses, so the elicitation tests deadlocked. `tests/test_mcp.py` now serves the app with an in-process uvicorn server on an ephemeral port, with a 30 s timeout.
- The SDK's elicitation schema check rejects `Literal`, so `decision` is a `str` with a JSON-schema `enum` and a validator.
- MCP approval re-checks twice, once before the form and once after accepting it. This is deliberate: a price that moves while the form is open is refused rather than approved unseen.

## Next steps
- Live check in Claude Code: confirm the host renders the elicitation form, then write plans/reports/demo-261114-0225-approval-elicitation.md. This was not run because this session cannot drive the human-facing form.
- A concurrent session is removing agent keys and per-agent mandates. The mandate check and `breaks_mandate` must follow the new company-wide settings.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
