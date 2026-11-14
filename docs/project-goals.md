# Project Goals

Single source of truth for *what* we are building and *why*. Implementation detail lives in
`plans/`; the challenge brief lives in [`project.md`](../project.md). Update this file when a goal,
non-goal, or acceptance criterion changes — not for progress tracking.

## Outcome

A customer's own purchasing agent — for example a hotel chain's AI agent — connects to Valio Aimo
through an **MCP server** and, guided by a **Valio Aimo skill**, finds products, gets prices and
availability in structured form, and places an order within the authority its human owners gave
it, or sends the order to a human for approval.

This is not a chatbot or a replacement for the webshop UI. It is the interface and operating model
that makes a food-service wholesaler safely and openly readable by any autonomous agent, built on
open standards rather than one platform's black box.

Humans stay in control through an **order console**: a web frontend where people monitor the orders
agents place, approve or reject the ones that hit a limit, discuss an order in a chat attached to
it, and preview in AR how the order would be picked in the warehouse.

## Product goals

### Agent interface (MCP server)

| # | Goal |
|---|------|
| A1 | Expose Valio Aimo to external agents as an MCP server with typed tools: product search, price and availability quote, order placement, and order status. |
| A2 | Return structured, self-describing data: product id, name, sales unit and what it contains (for example 10 L per case), price, availability and earliest date, delivery reliability, CO₂ estimate, allergens and labels. |
| A3 | Make the inquiry-to-order step explicit: the agent quotes a short list, then places an order at the quoted fixed price; changed prices or availability are refused, never silently applied. |
| A4 | Authenticate each agent and tie it to a customer, so every action is attributable. |
| A5 | Keep the same operations available over the existing REST API, so the interface is not tied to MCP alone. |

### Customer skill

| # | Goal |
|---|------|
| S1 | Ship a skill the customer installs in their own agent that teaches the procedure: narrow the catalog first, quote only the short list, convert the buyer's amounts into sales units, rank options by price and availability, and explain escalations. |
| S2 | The skill guides; it never enforces. Every rule that matters is enforced by the server. |

### Backend

| # | Goal |
|---|------|
| B1 | Wrap the Valio Aimo challenge APIs (product data, price, availability, delivery reliability, carbon footprint); never call price or availability for the whole catalog. |
| B2 | Enforce permission and human-approval rules server-side: an order above the spend limit becomes *pending approval* instead of being placed, and a line that breaks the company mandate (required tags, banned allergens) is refused. A line that misses only the buyer's own stated preferences is the buyer's choice and is placed, with the miss recorded. |
| B3 | Let a human approve or reject a pending order, and let the agent see the outcome. |
| B4 | Keep a human-readable audit trail for every order: which agent, the request, options considered, the choice, the reason, and every status change. |
| B5 | Store a complete order record: the original request as the agent sent it, the requirements it declared, the quote (prices and availability it was placed against), the ordered lines in sales units, every substitution (original product, substitute, reason, and whether it stays within the stated requirements), the approval decision with who decided and why, and the order's chat messages. |

### Order console (frontend)

| # | Goal |
|---|------|
| F1 | Monitor orders placed by agents: a list filterable by status, agent and customer, and an order detail view that shows the B5 record and the B4 audit trail. |
| F2 | Approve or reject orders over the spend limit from the console, showing why the order escalated and recording the decision and its reason. |
| F3 | Show in AR how the order would be picked in the warehouse: where each line sits (for example by temperature zone), the pick sequence, and the volume of the cases, built from catalog data. |
| F4 | Give each order a chat thread to discuss it — for example why a substitute was chosen or what to change before approval — stored with the order and visible in its history. |

## Challenge alignment

| Challenge requirement (`project.md`) | Covered by |
|---|---|
| Product, price & availability lookup | A1, A2, B1 |
| Inquiry → order at fixed price | A3 |
| Permission & human-approval management | B2, B3, A4, F2 |
| Optional: delivery reliability & sustainability | A2 |
| Optional: substitution and exception handling | S1, B2 (substitutes that break the mandate are refused; others are the buyer's choice), B5 |
| Optional: traceability / explainability | B4, B5, F1, F4 |

## Decisions

- **Spend threshold:** one configured amount (default 500 EUR excl. VAT), applied to each order on
  its own. Splitting a purchase into smaller orders avoids escalation; accepted for the demo. A
  quote can be used for one order only.
- **Company mandate:** required tags and banned allergens set once for the company
  (`API_REQUIRED_TAGS`, `API_BANNED_ALLERGENS`) apply to every quote and order. The spend limit is
  not part of it.
- **Fixed-price quotes:** a quote is a server-side record owned by one agent, with an expiry
  (default 15 minutes). It is not signed; a signature only matters to a third-party verifier and
  can be added later without changing the tool contract.
- **No authentication:** for the PoC all agents work for the same company (`API_VALIO_CUSTOMER`),
  so every MCP and REST client acts as one shared agent and there are no credentials. OAuth 2.1 is
  the production path.
- **Approval access:** there are no roles. The buyer approves or rejects an order over the spend
  limit through the agent interface: the shared agent, over MCP,
  `/api/agent/v1` or the console's `/api/orders` routes, the placing agent included. Approving
  re-checks price and stock first: a price change must be confirmed at the new total, and an order
  whose stock ran out is closed so the agent re-runs the flow. On MCP the server asks the human
  itself through an elicitation form and records the form's decision and reason
  (`confirmed_via: mcp_elicitation`); a client without elicitation cannot decide. Over REST the
  server cannot prove a human said yes (`confirmed_via: rest`); that is accepted for the demo. The
  deciding agent is recorded on the order and in the audit.
- **Interaction model:** the customer brings the agent. Our in-house LLM agent and voice work is
  not part of the product (the mobile frontend has been removed). The only frontend is the order
  console (F1–F4), which is for oversight and approval; no order is created from it.
- **AR warehouse view:** in scope as part of the order console. The dataset has no warehouse
  locations, so the layout is a mock derived from catalog data (temperature condition, case
  dimensions); it illustrates picking and is not a real warehouse model.

## Non-goals

- A chat, voice or mobile UI for buyers to place orders, or any replacement for the webshop. The
  order console's chat is for discussing an existing order, not for ordering.
- Integration with a real warehouse management system or real warehouse layouts.
- Building the customer's agent itself; we provide the interface and the skill it uses.
- Building the B2B marketplace, or a multi-supplier catalog.
- Price negotiation or quotes — prices are fixed per the brief.
- Real payments, invoicing, or real order submission to Valio Aimo production systems.

## Acceptance criteria (demo-level)

1. An MCP-capable agent with the skill installed, given *"I need 1,000 litres of lactose-free
   milk by Monday. Find an option that meets our requirements based on price and availability."*,
   returns at least one concrete product with price, availability for the requested date, and
   the quantity converted into sales units.
2. An order within the agent's authority is placed without human involvement.
3. An order above the spend threshold is not placed autonomously; it is marked *pending
   approval*, the agent reports why, and a human approval or rejection is reflected in the
   order status the agent reads back.
4. The server refuses actions outside the rules even when the agent tries them, for example
   placing at a stale price.
5. No secret (LLM key, Valio Aimo API key, agent credential) is present in git; the agent holds
   only its own credential, never Valio Aimo's upstream key.
6. Every placed or escalated order has an audit entry listing the agent, the request, the
   options considered, the choice, and the reason.
7. Every order record holds the original request, the declared requirements, the quoted prices,
   and every substitution with its reason, and the order console shows all of it.
8. An order over the spend limit appears in the order console as pending approval with the reason;
   approving or rejecting it there changes the status the agent reads back.
9. The order console shows an AR view of how an order's lines would be picked in the warehouse.
10. A message posted in an order's chat is stored with that order and shown in its history.

## Interaction flow

`agent receives request → search catalog → quote short list → choose option → place order →
placed | pending approval → (human approves or rejects in the order console) → agent reads status
and audit`

In the order console, a human can open any order at any point to see its record and audit trail,
discuss it in the order's chat, and view the AR picking preview.

The product owner may still provide a flow diagram that refines these steps.

## Data on hand

- `apps/api/data/` — challenge OpenAPI spec, product catalog (~17.5k items; ~82% carry
  case dimensions in `synkkaData.unitConversions[]`), delivery reliability, carbon footprint.
- Upstream auth: `X-API-Key` header.

## Open questions

1. Which agent host do we demo with, and does it connect to a hosted URL or a local server?
2. Voice and conversation endpoints are gone. Can the removed AR code (`orders/gltf.py`,
   `orders/footprint.py`) be reused for F3, or should the AR view be rebuilt on the frontend?
3. Who uses the order console: the customer's own approvers, Valio Aimo staff, or both? This
   decides which orders each user sees. Until it is answered, the console has no login and sees
   the company's orders.
4. Who takes part in an order's chat: only humans, or can the purchasing agent read and reply
   through MCP (for example to explain a substitution)?
5. Which device does the AR view target: phone or tablet AR (WebXR), with a 3D browser view as
   the fallback on desktop?
