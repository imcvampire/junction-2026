# Live demo: MCP agent interface (2026-11-13)

A scripted MCP client (the `mcp` Python SDK, standing in for an LLM host) ran the reference request
against the local dev server at `http://127.0.0.1:8000/mcp`, which called the real Valio Aimo
challenge API with customer `junction-demo`. The demo agent `agt_505942d205d6` was disabled
afterwards.

Not covered here: a run driven by an LLM host (Claude Code with the skill installed). That needs a
key added with `claude mcp add` and a human-driven session.

| AC | Result | Evidence |
|---|---|---|
| 1 | Pass (scripted) | `quote` with 1000 L returned 464119 at 13.32 EUR per KI, available 2026-11-16, `1000 L / 10 L per KI = 100 -> 100 KI`, flagged cheapest covering option. |
| 2 | Pass | 100 L (10 KI, 133.20 EUR) went straight to `placed`. |
| 3 | Pass | 1000 L (1,332.00 EUR) went to `pending_approval` with the reason "exceeds the 500.00 EUR spend limit (global threshold)". `POST /api/orders/{id}/approve` returned 200, and `get_order` then read `approved` with the approver's reason. |
| 4 | Pass | The stored quote price was lowered by 0.50 EUR; `place_order` was refused with `quote_changed` (`was 12.82, now 13.32`) and no order was created. |
| 5 | Pass | `git grep -nE 'vaa_[A-Za-z0-9_-]{20,}\|X-API-Key: [A-Za-z0-9]'` is empty. Keys are stored as SHA-256 only. |
| 6 | Pass | Audit texts below. |

## Audit: escalated, then approved

```text
Order ord_d8df2ca14837 - approved
Agent live-smoke-demo (agt_505942d205d6) for customer junction-demo
Delivery 2026-11-16 · total 1332.00 EUR

2026-11-13 20:46:20 UTC · agent · escalated: Needs human approval: Total 1332.00 EUR exceeds the 500.00 EUR spend limit (global threshold)
    request: I need 1,000 litres of lactose-free milk by Monday. Find an option that meets our requirements based on price and availability.
    requirements: LACTOSE_FREE
    options considered (quote q_e63c22e4a9e44771):
      - 464119 Valio skimmed milk 1 l lactose free UHT: 100 KI @ 13.32 (covers, meets requirements)
      - 464201 Valio semi skimmed milk 1 l lactose free UHT: 1000 ST @ 1.56 (covers, meets requirements)
      - 464073 Valio whole milk 1 l lactose free UHT: 1000 ST @ 1.64 (covers, meets requirements)
    choice: 100 KI 464119
    reason: Cheapest lactose-free milk covering 1,000 L by Monday
    approval needed because: Total 1332.00 EUR exceeds the 500.00 EUR spend limit (global threshold)
2026-11-13 20:46:20 UTC · approver · approved: Approved by approver: Approved for the gala week
```

## Audit: placed autonomously

```text
Order ord_45bbf998baf8 - placed
Agent live-smoke-demo (agt_505942d205d6) for customer junction-demo
Delivery 2026-11-16 · total 133.20 EUR

2026-11-13 20:46:20 UTC · agent · placed: Placed within the agent's authority at 133.20 EUR
    request: 100 L of lactose-free milk for Monday
    requirements: LACTOSE_FREE
    options considered (quote q_5974d05c927d40f2):
      - 464119 Valio skimmed milk 1 l lactose free UHT: 10 KI @ 13.32 (covers, meets requirements)
    choice: 10 KI 464119
    reason: Small top-up within authority
```
