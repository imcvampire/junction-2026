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
| B2 | Enforce permission and human-approval rules server-side: an order above the spend threshold, or with a line that breaks the buyer's stated requirements, becomes *pending approval* instead of being placed. |
| B3 | Let a human approve or reject a pending order, and let the agent see the outcome. |
| B4 | Keep a human-readable audit trail for every order: which agent, the request, options considered, the choice, the reason, and every status change. |

## Challenge alignment

| Challenge requirement (`project.md`) | Covered by |
|---|---|
| Product, price & availability lookup | A1, A2, B1 |
| Inquiry → order at fixed price | A3 |
| Permission & human-approval management | B2, B3, A4 |
| Optional: delivery reliability & sustainability | A2 |
| Optional: substitution and exception handling | S1, B2 (substitutes outside stated requirements escalate) |
| Optional: traceability / explainability | B4 |

## Decisions

- **Spend threshold:** one configured amount (default 500 EUR excl. VAT), applied to each order on
  its own. Splitting a purchase into smaller orders avoids escalation; accepted for the demo.
- **Approval access:** the approve and reject endpoints are unauthenticated for the demo.
- **Interaction model:** the customer brings the agent. Our in-house LLM agent, voice and AR work
  is not part of the product (the mobile frontend has been removed).

## Non-goals

- A chat, voice or mobile UI for buyers, or any replacement for the webshop.
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

## Interaction flow

`agent receives request → search catalog → quote short list → choose option → place order →
placed | pending approval → (human approves or rejects) → agent reads status and audit`

The product owner may still provide a flow diagram that refines these steps.

## Data on hand

- `apps/api/data/` — challenge OpenAPI spec, product catalog (~17.5k items; ~82% carry
  case dimensions in `synkkaData.unitConversions[]`), delivery reliability, carbon footprint.
- Upstream auth: `X-API-Key` header.

## Open questions

1. Should spending authority be defined per customer or per agent (a "mandate" holding the spend
   limit, required labels, banned allergens and substitution policy), instead of one global
   threshold?
2. Should quotes be signed and carry an expiry so an agent can verify price and availability
   claims without a manual check (the brief's "trust protocol")?
3. Which agent host do we demo with, and does it connect to a hosted URL or a local server?
4. Do the voice, conversation and AR endpoints still in `apps/api` stay or go?
