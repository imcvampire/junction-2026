# Code review: voice ordering app (uncommitted changes)

Plan: `plans/261113-2118-voice-ordering-app/`. Scope: everything in the uncommitted diff, covering the API (agent, catalog, orders, valio, voice, routes) and the web app (lib/api.ts, App.tsx, features/*). I verified every finding against the code. `uv run pytest -q` reports 59 passed, and `pnpm typecheck` is clean.

## Outcome

The server-side order guards hold up well on the happy path. The policy is evaluated at placement, prices are fixed and re-quoted, and every transition is audited under a per-order lock. No secret reaches the client or the logs. However, the approval guarantee can still be bypassed in three ways:

- The approve endpoint has no authentication.
- The policy only looks at one order at a time, so splitting an order gets under the threshold.
- The substitution check depends on flags the LLM chooses to send.

Separately, any price change leaves the order permanently unplaceable. The other findings below are robustness issues in the turn lifecycle and the voice hooks.

## High

### H1. Any client can approve its own escalated order
`apps/api/src/api/routes/orders.py:54-65`

`POST /api/orders/{id}/approve` has no authentication, role check or approver identity. The buyer's phone, or anyone who knows an order id (ids are `ord_` plus 12 hex characters and are returned in every turn payload), can call it.

- **Scenario:** The buyer orders goods worth 900 EUR. The order goes to `pending_approval`. Then `curl -X POST /api/orders/ord_x/approve -d '{"reason":""}'` sets it to `approved`, and the audit trail records `actor=approver`.
- **Why it matters:** This defeats acceptance criterion 3 in `docs/project-goals.md` ("not placed autonomously").
- **Fix:** Gate approve and reject behind a separate approver credential, for example an `API_APPROVER_TOKEN` checked by a dependency, and never ship it in the web bundle. Record the approver identity in the audit entry. If the demo needs a button, put it on a separate approver page that asks for the token.

### H2. The spend threshold can be bypassed by splitting the order
`apps/api/src/api/orders/policy.py:12-19` and `apps/api/src/api/agent/tools.py:182-203`

`ApprovalPolicy.evaluate` only looks at `order.total` for a single order. The agent can create any number of drafts per session, and each one is agreed and placed on its own.

- **Scenario:** The buyer says "split it into two orders so it doesn't need approval". The agent drafts 2 × 400 EUR against a 500 EUR threshold, and both are placed autonomously.
- **Fix:** Sum the totals of the session's (or the customer's, per delivery date) `placed`, `pending_approval` and `approved` orders and include them in `evaluate`. At minimum, refuse a second open draft per session in `create_order_draft`.

### H3. The substitution rule depends on fields the LLM chooses to send
`apps/api/src/api/orders/service.py:108-109`, `apps/api/src/api/orders/models.py:27` and `apps/api/src/api/agent/tools.py:70-75`

`substitute_for` and `preferences` both come from the tool arguments. `has_tags([])` is `True`. If the model leaves out `substitute_for`, or passes no preferences, an off-preference substitute is never escalated. The code says the policy is "enforced in BE tool, never in the prompt alone", but this part actually depends on the prompt.

- **Scenario:** The buyer asks for lactose-free milk. It is out of stock, and the model drafts regular milk with no `substitute_for` and empty `preferences`. The order is placed autonomously.
- **Fix:** Persist the buyer's hard requirements on the session when `search_products` is called with `required_tags` or `exclude_allergens`, and have the server use them as the floor for `preferences`, ignoring anything narrower from the model. Also flag a line as off-preference whenever the product fails the session's required tags, whether or not `substitute_for` is set.

### H4. A price or availability change leaves the order permanently unplaceable
`apps/api/src/api/orders/service.py:182-203` and `apps/api/src/api/orders/service.py:284-297`

On a mismatch, `place` sets the order back to `DRAFT` but leaves `lines`, `unit_price`, `total` and `quoted_at` at the old quote. The next `agree` then `place` invalidates the cache, re-quotes, and compares against the same stale `line.unit_price`, so it fails again every time. The tool error ("re-confirm with the buyer") and the `ar_offered` quick reply "Place order", which is still shown because `flow_state` is not changed on error, push the agent into this loop.

There is a related problem. Because `created_turn` keeps its original value, the guard in `agree_order` (`tools.py:215`) passes in the same turn as the mismatch, so the model can re-agree without the buyer hearing anything.

- **Fix:** On a mismatch, rewrite the lines with the new `unit_price`, `line_total` and availability, recompute `total` and `approval_reasons`, set `quoted_at`, and set `created_turn` to the current turn (pass `turn` into `place`). That way the buyer must hear the new price in a later turn before `agree`. Return the new totals in the error details, set `ctx.effects.flow_state = "confirming"` in `place_order` when the error is `quote_changed`, and add a test for draft → agree → price change → re-agree → place.

### H5. Buyer confirmation and "AR before placing" are only enforced by a turn counter, and the UI quick reply skips AR
`apps/api/src/api/agent/tools.py:213-243` and `apps/web/src/features/conversation/conversation-screen.tsx:59-63`

The only server guard is that `agree` is refused in the same turn the draft was created. On any later turn, whatever the buyer said, for example "how much was that again?", the model can call `agree_order` and then `place_order` in one turn. The confirming quick reply sends "Yes, that is right. **Go ahead.**", and the prompt (`prompts.py:38-39`) says to place "when the buyer says to go ahead". Pressing "Yes, confirm" therefore invites agree plus place in a single turn, which skips the AR step the plan places before submission (plan.md key decisions; project-goals M5).

- **Fix:** Refuse `place_order` while the order was agreed in the current turn (store `agreed_turn` on the order). For a stronger guarantee, record agreement from an explicit client action (`POST /orders/{id}/agree` from the "Yes, confirm" button), and have `agree_order` only check that the agreement exists. Change the quick reply text to "Yes, that is right."

## Medium

### M1. A turn interrupted mid-way loses session state while order side effects persist
`apps/api/src/api/agent/loop.py:191-260`, `apps/api/src/api/agent/tools.py:322-331` and `apps/api/src/api/routes/conversations.py:70-79`

`self.sessions.save(session)` only runs if `_run` finishes normally or raises `LLMUnavailableError`. Anything else skips the save and the `turn` event. That includes:

- a client disconnect, which raises `CancelledError`. This is common when an iOS PWA goes to the background mid-turn.
- a pydantic `ValidationError` from `PriceResponse.model_validate` when the upstream schema drifts (`valio/client.py:192-193`). This is not a `ValioError`.
- a `JSONDecodeError` from `res.json()` (`client.py:233`).

Orders created or placed earlier in the turn are already committed, but `session.order_id`, the tool messages and the `turn` increment are lost. On the next turn the prompt says "No active order yet", and the model may draft a duplicate.

- **Fix:** Wrap the body of `_run` in `try/finally` and save the session there, on a best-effort basis that also runs on cancellation. Convert pydantic and JSON decode errors in `ValioClient._request` and `quote` into `ValioError`. Add a catch-all `except Exception` in `tools.execute` that logs and returns `{"error": "internal"}`.

### M2. The client leaves the reply pending forever when the stream ends without a `turn` event
`apps/web/src/features/conversation/conversation-screen.tsx:117-149` and `apps/api/src/api/routes/conversations.py:75-77`

When the server crashes, it sends `error` and closes the stream without sending `turn`. The client only logs `error` and never clears `pending`. If no delta arrived, the bubble keeps its spinner forever, and `flow` and `order` are never refreshed.

- **Fix:** Track whether a `turn` event was received. After the loop, if it was not, patch the message with `pending: false` and a fallback text, and show a toast.

### M3. A second tap while the microphone is opening leaks a live stream
`apps/web/src/features/conversation/conversation-screen.tsx:190-202` and `apps/web/src/features/voice/use-recorder.ts:75-116`

`phase` stays `idle`, and the hook's `listening` stays `false`, until `getUserMedia` resolves. That can take seconds while the iOS permission prompt is open. A second tap starts a second `getUserMedia`. `recorder.current` is overwritten, and the first stream's tracks are never stopped, so the mic indicator stays on until the page is closed.

- **Fix:** Use a synchronous `startingRef` guard in `start`, or set `phase` to a `'starting'` value before the `await`. Also stop the stream if `start` resolves after the component has unmounted.

### M4. Web Speech fallback loses the transcript when recognition ends on its own
`apps/web/src/features/voice/use-recorder.ts:104-108` and `apps/web/src/features/voice/use-recorder.ts:118-126`

Chrome and Safari end recognition after silence or a `no-speech` or `network` error, even with `continuous = true`. `onend` then calls `finished.current`, which is still `null`, and `release()` runs. When the user taps stop, `recognition.current` is `null` and `recorder.current` is `null`, so `stop()` returns `''` and the user gets "Didn't catch that". In addition, `phase` stays `listening` even though nothing is listening.

- **Fix:** In `onend`, if `finished.current` is not set, keep the transcript in a ref and call the `onMax` path, which is the same as finishing. Alternatively, have `stop()` return the stored transcript when recognition has already ended.

### M5. Large quantities can produce a huge GLB synchronously, and oversize packs overlap
`apps/api/src/api/orders/footprint.py:104-125`, `apps/api/src/api/orders/models.py:26` and `apps/api/src/api/routes/orders.py:85-94`

Quantity can be up to 100 000 per line, with up to 50 lines. For oversize packs, `per_pallet = 1`, so one line can produce 100 000 boxes, which is about 2.4 M vertices. That means tens of MB built in Python on every unauthenticated `GET /ar-model.glb`. The `Cache-Control: private, max-age=60` header does not help across clients. Oversize packs wider than 1.35 m are also drawn at pallet-slot spacing, so they overlap the neighbouring slot, and the floor size is understated.

- **Fix:** Cap the boxes or pallets that are rendered (for example 200), and report the remainder in `spoken_summary` and `Footprint`. Space slots by `max(PALLET_W_MM, pack.width_mm)`. Memoize the GLB per `order.id` and `updated_at`.

## Low

- **L1.** The TTS stream does not close the upstream response on client disconnect (`apps/api/src/api/routes/voice.py:72-78`). Add `finally: await chunks.aclose()`, as the turns route does.
- **L2.** The draft idempotency scope is global (`routes/orders.py:31`). Two clients that send the same key get each other's order. Scope the key by session id. Also, two concurrent requests with the same key can create two drafts, because the check and the insert are not atomic.
- **L3.** `ValioError` messages include `res.text[:300]` from upstream (`valio/client.py:226,232`), and the exception handler returns them to the client (`main.py:138`). Log the upstream body on the server and return a generic message.
- **L4.** The reasoning fallback (`loop.py:218-220`) speaks `reasoning_content` aloud when `content` is empty. With a reasoning model, this can read chain-of-thought to the buyer. Consider capping its length, or only using it when it has no tool-like structure.
- **L5.** `Agent._locks`, `Agent._recent` and `OrderService._locks` grow by one entry per session or order and are never pruned. This is fine for a demo but unbounded in a long-running process.
- **L6.** `DraftRequest.delivery_date` accepts past dates, and the threshold ignores `order.currency` (it assumes EUR). Validate `delivery_date >= today (Helsinki)` before quoting.
- **L7.** The SSE parser (`lib/api.ts:157`) only splits on `\n\n`. A proxy that rewrites to `\r\n` breaks it. Normalize with `buffer.replace(/\r\n/g, '\n')`.

## Verified non-issues

- **Session lock:** The admit check and the lock acquire happen without an `await` between them, so they are atomic. Two overlapping turns get a 409.
- **Order transitions:** They are serialized per order. `place`, `agree` and `decide` short-circuit on repeated calls, so retries are safe even without an idempotency key.
- **Session scoping:** Tool access checks `session_id` on every order lookup.
- **Secrets:** Keys are `SecretStr`, are sent only in the `X-API-Key` header to upstream, and are never logged. The web code only reads `VITE_API_URL`.
- **GLB:** Header and chunk magic values, padding, and face winding and normals are correct on all six faces (checked by cross product). Accessor min and max values are present.
- **Footprint layer and partial-row math:** It is correct, because `partial < cols * rows` guarantees `full_rows < rows`.
- **Playback:** The generation counter correctly drops stale queue items after `stop()`. The iOS unlock reuses one `<audio>` element primed from a user gesture.

## Recommended order of fixes

1. H4 (orders get stuck in the demo path) and H5 (remove "Go ahead", and block placing in the same turn as agreeing).
2. H1 and H2. Approver auth and the aggregate threshold are needed for acceptance criterion 3.
3. M1 and M2. Turn persistence on failure or disconnect, and client handling when no `turn` event arrives.
4. M3, M4 and H3. Then the Low items as time allows.

## Unresolved questions

1. Who is the approver in the demo, and how do they authenticate? The plan leaves this open (plan.md Q4).
2. Should the spend threshold apply per order, per session or per delivery day?
3. Should the buyer's "yes" be captured as an explicit UI action, or is a spoken yes interpreted by the LLM enough for the judges?

Status: DONE_WITH_CONCERNS
Summary: Tests pass and typecheck is clean, but the approval policy can be bypassed: approve has no auth, splitting an order avoids the threshold, and the substitution check relies on LLM-supplied flags. A price change also leaves an order permanently unplaceable.
