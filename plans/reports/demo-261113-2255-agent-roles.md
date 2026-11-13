# Live check: member and admin agent keys (2026-11-13)

A scripted MCP client (the `mcp` Python SDK, standing in for an LLM host) ran the approval flow
against the local dev server at `http://127.0.0.1:8000/mcp`, which called the real Valio Aimo
challenge API for customer `junction-demo`. Two keys were issued with the CLI for this run:
`agt_8353cf6e01ba` (member, `live-roles-member`) and `agt_cc8ac4a76f02` (admin, `live-roles-admin`).
Both were disabled afterwards. Keys are not reproduced here.

Not covered: a run driven by an LLM host. `destructiveHint` confirmation prompts are host behaviour
and need a human-driven Claude Code session to observe.

| Step | Result | Evidence |
|---|---|---|
| Member `tools/list` | Pass | 8 tools; `list_pending_approvals`, `approve_order` and `reject_order` are absent. |
| Member places the reference order | Pass | `quote` ranked 464119 first (100 KI @ 13.32 EUR = 1,332.00 EUR). `place_order` returned `ord_03cc02b1486a` as `pending_approval`: "Total 1332.00 EUR exceeds the 500.00 EUR spend limit (global threshold)". |
| Member calls `approve_order` directly | Pass | Tool error `{"code": "forbidden", "message": "This key is not allowed to approve or view company orders; ask an admin"}`. |
| Admin `tools/list` and `whoami` | Pass | 11 tools. `whoami`: "Agent live-roles-admin (admin) for customer junction-demo; can approve the customer's escalated orders except its own". |
| Admin `list_pending_approvals` | Pass | Oldest first: a legacy order from the retired buyer flow (`ord_80066f046205`, no agent id), then `ord_03cc02b1486a` by `agt_8353cf6e01ba`, each with its approval reasons. |
| Admin `approve_order` with a reason | Pass | `approved`, "Decision: approved by live-roles-admin (agt_cc8ac4a76f02) (Approved for the gala week)". |
| Member `get_order` and `get_order_audit` | Pass | `approved` with `decided_by`; audit below. |

Self-approval, cross-customer 404 and the console routes (401 without a key, 403 with a member key)
are covered by `tests/test_procurement.py` and `tests/test_agent_api.py`, not by this live run.

## Audit: escalated by the member, approved by the admin

```text
Order ord_03cc02b1486a - approved
Agent live-roles-member (agt_8353cf6e01ba) for customer junction-demo
Delivery 2026-11-16 · total 1332.00 EUR

2026-11-13 21:12:11 UTC · agent · escalated: Needs human approval: Total 1332.00 EUR exceeds the 500.00 EUR spend limit (global threshold)
    request: I need 1,000 litres of lactose-free milk by Monday. Find an option that meets our requirements based on price and availability.
    requirements: LACTOSE_FREE
    options considered (quote q_d6254810893346c6):
      - 464119 Valio skimmed milk 1 l lactose free UHT: 100 KI @ 13.32 (covers, meets requirements)
      - 464201 Valio semi skimmed milk 1 l lactose free UHT: 1000 ST @ 1.56 (covers, meets requirements)
      - 464073 Valio whole milk 1 l lactose free UHT: 1000 ST @ 1.64 (covers, meets requirements)
    choice: 100 KI 464119
    reason: Cheapest lactose-free milk covering 1,000 L by Monday
    approval needed because: Total 1332.00 EUR exceeds the 500.00 EUR spend limit (global threshold)
2026-11-13 21:12:11 UTC · approver · approved: Approved by live-roles-admin (agt_cc8ac4a76f02): Approved for the gala week
```

## Notes

- The local database was backed up to `apps/api/data/app-bak-1794603946.sqlite3` before the first
  migration. The `agents.role` and `orders.customer` columns were added in place, and existing
  orders were backfilled from their JSON.
- Legacy orders without an `agent_id` are visible to, and decidable by, an admin of the same
  customer. Self-approval cannot apply to them.
- `mise run agent:create` masks parts of the task's stdout (`[]` printed as `[redacted]`), so its
  JSON cannot be piped into a parser. Scripts should call `uv run python -m api.agents.cli create`
  in `apps/api` instead. Three keys created during that mis-step (`agt_2c77cfc32446`,
  `agt_8374ad8cb6e8`, `agt_012e5b64775f`) were disabled.
