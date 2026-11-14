# Live check: cancel until shipped

Date: 2026-11-14. Ran against the already-running dev server on `127.0.0.1:8000` (reused, not
started or stopped by this check), through the MCP endpoint `/mcp` and the console ship route. The
upstream was the Valio Aimo mock API. The human's form answers came from a scripted elicitation
callback, not a real host UI.

| Step | Result |
|---|---|
| 1. Place a 10 L order (13.32 EUR, `placed`) and `cancel_order` it | `cancelled`, `confirmed_via: agent`, no form shown. Audit text: `agent · cancelled: Cancelled by company-agent (agt_mcp): buyer changed the menu` and `confirmed via: agent`. |
| 2. Place another, `POST /api/orders/<id>/ship`, then `cancel_order` | Ship returned `shipped` with `shipped_at`; the cancel was refused with `already_shipped`. |
| 3a. Approve a 1,332 EUR order through the form, then `cancel_order` | One form shown: "Cancel approved order … Total 1332.00 EUR, delivery 2026-11-18 … This undoes the approval by company-agent (live check approve). The agent's reason: event cancelled". Accepting with a new reason recorded `confirmed_via: mcp_elicitation` and the human's reason. |
| 3b. Approve another 1,332 EUR order, place a 10 L replacement, `cancel_order` with `replaced_by` | `cancelled`, `confirmed_via: replacement`, `replaced_by` set to the new order, and no form shown. |

The check script is session scratch, not part of the repo.
