# Backend API

FastAPI app in `apps/api`, served under `/api`. Interactive docs: `/api/docs` (disabled when
`API_ENVIRONMENT=production`). Clients talk only to these endpoints; no LLM, voice, or Valio Aimo
credential leaves the backend.

## Configuration

All settings are environment variables loaded from `.env` by mise. `.env.example` lists them.

| Variable | Default | Purpose |
|---|---|---|
| `API_VALIO_BASE_URL` | — | Valio Aimo challenge API, `https://junction26.valioaimo.fi` |
| `API_VALIO_API_KEY` | — | `X-API-Key` for the challenge API |
| `API_APPROVAL_SPEND_THRESHOLD_EUR` | `500` | Orders above this total (excl. VAT) go to a human approver |
| `OPENAI_COMPATIBLE_URL` / `_API_KEY` / `_MODEL` | — / — / `kimi-k3-1-pro` | LLM endpoint (without `/v1`) |
| `API_VOICE_BASE_URL` / `API_VOICE_API_KEY` | — | Any OpenAI-compatible `/v1/audio/*` provider; unset disables the voice endpoints |
| `API_DB_PATH` | `apps/api/data/app.sqlite3` | Orders, audit trail, sessions, idempotency keys |
| `API_TURNS_PER_MINUTE` | `20` | Per-session rate limit on conversation turns |
| `API_AR_MAX_STACK_HEIGHT_M` | `1.6` | Pallet stack height used for the AR footprint |

Missing Valio or LLM settings do not stop startup. The affected endpoints answer `503`, and the
conversation replies with a spoken apology.

## Endpoints

| Method and path | Purpose |
|---|---|
| `GET /products?q=&tag=&category=&lang=&limit=` | Static catalog search (no price calls) |
| `POST /products/quote` `{codes, date}` | Live price and availability for a short list (cached ~3 min) |
| `POST /conversations` `{language}` | Start a session (`en`, `fi`, `sv`) |
| `POST /conversations/{id}/turns` `{text}` | One agent turn as server-sent events |
| `POST /orders` | Create a draft at quoted prices (`Idempotency-Key` header supported) |
| `POST /orders/{id}/agree`, `/place`, `/approve`, `/reject` | Lifecycle transitions (idempotent) |
| `GET /orders?session_id=`, `GET /orders/{id}` | Order lookup |
| `GET /orders/{id}/audit`, `/audit.txt` | Audit trail as JSON or plain text |
| `GET /orders/{id}/footprint`, `/ar-model.glb` | Physical footprint and true-scale glTF for AR |
| `GET /voice`, `POST /voice/transcribe`, `POST /voice/speak` | Voice provider status, STT (multipart, ≤5 MB), TTS (MP3 stream) |

### Turn stream

`POST /conversations/{id}/turns` streams `text/event-stream` events:

- `delta` `{text}`: reply text as the model produces it. The app speaks it sentence by sentence.
- `tool` `{name}`: a tool started (used for "Checking prices…" hints).
- `error` `{code, message}`: the LLM was unreachable; a spoken apology follows.
- `turn`: the final payload, `{session_id, turn, reply_text, flow_state, offers[], order?, actions[]}`.

`flow_state` is one of `gathering → proposing → confirming → ar_offered → placed | escalated`.
`actions` contains `show_order` when a draft is created and `offer_ar` once the buyer agrees and the
order has sizeable products.

## Order rules enforced on the server

- Order lifecycle: `draft → agreed → placed | pending_approval → approved | rejected`.
- A draft is refused if any line has no price, cannot be delivered in time, or has a past delivery date.
- The agent cannot agree to a draft in the same turn that created it, so the buyer always hears the
  read-back first. It cannot place an order in the same turn it was agreed, which leaves room for the
  AR preview.
- Placing an order re-quotes it. If the price or availability changed, the order is re-drafted at the
  new quote and the buyer must confirm again. Lines that can no longer be delivered block agreement.
- Approval is required when the total exceeds the threshold, or when any line fails the buyer's
  requirements. Requirements are the draft's preference tags plus every `required_tags` and
  `exclude_allergens` filter used in `search_products` during the current request (for example
  `LACTOSE_FREE`, `brand:Valio`, `no:AM`), so the model cannot drop them silently.
- Every transition writes an audit entry with the actor, the request, the options considered, the
  choice, and the reason.

## AR footprint

Each line's quantity is converted into physical boxes. Case dimensions come from
`synkkaData.unitConversions[]`, with base-unit dimensions used when the product is sold per piece.
Boxes are stacked on EUR pallets (1200 × 800 mm, at most 1.6 m high) and laid out four pallets to a
row. Sizes estimated from content or weight are flagged. Products with no size data are listed but
left out of the model. Orders above 48 pallets get a spoken summary instead of a model.

## Known demo limitations

These are accepted product decisions for the hackathon demo, not oversights.

- `POST /orders/{id}/approve` and `/reject` are unauthenticated. Anyone with an order id can approve
  it, and the audit records the actor as `approver`.
- The spend threshold applies to each order on its own. Splitting a purchase into several orders
  under the limit avoids escalation.
