# Project Goals

Single source of truth for *what* we are building and *why*. Implementation detail lives in
`plans/`; the challenge brief lives in [`project.md`](../project.md). Update this file when a goal,
non-goal, or acceptance criterion changes — not for progress tracking.

## Outcome

A buyer at a professional kitchen talks to a mobile app to order stock from Valio Aimo. The app
listens, understands the request through an LLM that runs **behind our backend**, talks back,
asks follow-up questions, and — once the buyer agrees to an order — offers an AR preview of how
much physical space the delivery will take in their real storage room before the order is placed.

## Product goals

### Mobile app (buyer)

| # | Goal |
|---|------|
| M1 | The buyer orders stock by speaking to the app (push-to-talk). |
| M2 | The app turns speech into text and replies with synthesized speech, plus an on-screen transcript. |
| M3 | Every LLM call goes through our backend; the device holds no LLM or Valio Aimo credentials. |
| M4 | The conversation is interactive: the app asks clarifying questions, proposes options (price, availability, delivery date, substitutes) and asks for confirmation. The exact dialogue flow is defined by a diagram the product owner will supply — see [Conversation flow](#conversation-flow). |
| M5 | After the buyer agrees to an order, the app offers an optional AR view through the phone camera that places the ordered volume (cases / pallets at true scale) in the real warehouse or cold room. |

### Backend

| # | Goal |
|---|------|
| B1 | Provide the API the mobile app needs: conversation turns, speech in/out, order drafts, order confirmation, AR geometry. |
| B2 | Wrap the Valio Aimo challenge APIs (product data, price, availability, delivery reliability, carbon footprint) behind our own typed endpoints; never call price/availability for the whole catalog. |
| B3 | Implement the challenge **Core** (see `project.md`): product/price/availability lookup, inquiry → fixed-price order, and permission & human-approval rules (spend threshold, substitutions outside stated preferences). |
| B4 | Keep a human-readable audit trail of what the agent did and why for every order. |

## Challenge alignment

| Challenge requirement (`project.md`) | Covered by |
|---|---|
| Product, price & availability lookup | B2, M4 |
| Inquiry → order at fixed price | B3, M4 |
| Permission & human-approval management | B3 (the buyer's spoken "yes" is the human approval inside their authority; above-threshold orders escalate) |
| Optional: delivery reliability & sustainability | B2 (data already provided) |
| Optional: substitution handling | M4, B3 |
| Optional: traceability / explainability | B4 |

## Non-goals

- Building the B2B marketplace itself, or a multi-supplier catalog.
- Price negotiation or quotes — prices are fixed per the brief.
- Real payments, invoicing, or real order submission to Valio Aimo production systems.
- Full warehouse modelling or room scanning beyond placing a scaled volume in the camera view.
- Multi-language voice beyond what the chosen STT/TTS provider offers out of the box.

## Acceptance criteria (demo-level)

1. Saying *"I need 1,000 litres of lactose-free milk by Monday"* yields a spoken answer with at
   least one concrete product, price, and availability for the requested date.
2. The app asks at least one clarifying or confirming question before any order is created.
3. An order above the configured spend threshold is not placed autonomously; it is marked
   *pending approval* and the app says so.
4. After the buyer agrees, the app offers AR; accepting shows a true-scale volume in the camera
   view derived from product dimensions and ordered quantity.
5. No secret (LLM key, Valio Aimo API key) is present in the mobile bundle or in git.
6. Every confirmed or escalated order has an audit entry listing the request, options considered,
   the choice, and the reason.

## Conversation flow

Pending — the product owner will provide a diagram. Until then the working assumption is:

`listen → understand intent → look up products → propose options → clarify / confirm → (approval check) → offer AR → place or escalate order → read back summary`

## Data on hand

- `apps/api/data/` — challenge OpenAPI spec, product catalog (~17.5k items; ~82% carry
  case dimensions in `synkkaData.unitConversions[]`), delivery reliability, carbon footprint.
- Upstream auth: `X-API-Key` header.
