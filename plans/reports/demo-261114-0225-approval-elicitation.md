# Live check: approval through MCP elicitation

Date: 2026-11-14, against the running dev server (`fastapi dev`, 127.0.0.1:8000, reloaded on the final
tree after the agent-key removal) and the live Valio Aimo mock API.

## Result

**Server side: passed.** A scripted MCP client (real streamable HTTP, `elicitation_callback` standing
in for the human) ran the reference request end to end:

1. `whoami`: `agt_mcp` for `junction-demo`, spend limit 500.00 EUR.
2. `search_products` "milk 1 l" with `LACTOSE_FREE`: shortlist 464073, 464237, 460885, 464119, 463335.
3. `quote` 1,000 L each for Monday 2026-11-16, `purpose: "coffee"`. The cheapest covering option was 464237
   Valio coffee milk 1 l lactose free UHT, 1000 ST at 1.30, 1,300.00 EUR.
4. `place_order`: `ord_fe2adf213e19`, `pending_approval`, reason "Total 1300.00 EUR exceeds the
   500.00 EUR per-order spend limit". This was the only reason; no requirement miss escalated.
5. `approve_order` with the suggested reason "For the gala dinner". The server re-checked live price
   and stock, then sent one elicitation:

   ```text
   Approve order ord_fe2adf213e19 placed by agent agt_mcp?
   Total 1300.00 EUR, delivery 2026-11-16.
   - 1000 ST 464237 Valio coffee milk 1 l lactose free UHT @ 1.30 = 1300.00
   Needs approval because: Total 1300.00 EUR exceeds the 500.00 EUR per-order spend limit
   Purpose: coffee
   ```

   Schema: `decision` (enum `approve`/`reject`, default `approve`) and `reason` (required, default the
   suggestion).
6. The form answered "For the gala dinner (live check)". The order was `approved` with the **form's**
   reason, not the tool argument. The audit shows `purpose: coffee` and the decision entry
   `confirmed via: mcp_elicitation`.

**Claude Code host: not yet checked.** Whether Claude Code 2.1.295 renders the form to a person
cannot be verified from an agent session. Steps for the user:

```sh
claude mcp add --transport http valio-aimo http://127.0.0.1:8000/mcp
```

Then, in an interactive Claude Code session: "I need 1,000 litres of lactose-free milk by Monday", and
when the order is pending, "approve it, it is for the gala dinner". Expected: Claude Code shows the
form above. If the order comes back `approved` and `get_order_audit` shows `confirmed via:
mcp_elicitation`, the host works. If the tool returns `elicitation_required`, this host does not
support forms and approvals must go through REST or the console.

## Side effects

The check left one approved order, `ord_fe2adf213e19`, in the local runtime database
(`apps/api/data/app.sqlite3`). No server was started or stopped; the existing dev server was reused.
