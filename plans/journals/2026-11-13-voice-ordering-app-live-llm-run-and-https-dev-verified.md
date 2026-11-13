---
title: "Voice ordering app: live LLM run and HTTPS dev verified"
date: 2026-11-13
summary: "Reference milk request ran end to end on Verda kimi-k3-1-pro; live run exposed two agent bugs, fixed; phone HTTPS dev mode verified"
---

# Voice ordering app: live LLM run and HTTPS dev verified

## What happened
With OPENAI_COMPATIBLE_URL set to https://inference.verda.com, kimi-k3-1-pro handled streaming tool calls (first token ~1 s). The reference request ran through our API: search, quote of 6 products, draft, agree with AR offer, place, escalation at 1,332 EUR over the 500 EUR limit. Audit trail listed request, options, choice and reason.

The live run exposed two bugs the scripted tests could not: the model recommended a 1,400 EUR option while a 1,332 EUR covering option existed, and it passed free text ("1000 litres") as preference tags, which produced a false preference escalation.

## Decision
Quote results are now ranked by line total with the cheapest covering option marked; preference tags the catalog cannot check are dropped and reported back to the model. The LLM base URL accepts root, /v1 or the full /v1/chat/completions form. Voice stays on-device Web Speech. Approve/reject stay unauthenticated and the threshold stays per order (user decisions, documented).

WEB_HTTPS=1 serves the PWA over TLS on the LAN with the /api proxy working. Gotcha: mise's [env] WEB_PORT overrides an inline WEB_PORT because pnpm is a mise shim; use --port for a second instance.

## Next steps
Real-device check on iPhone and Android (mic, Web Speech, AR true scale); PWA vs native decision; conversation-flow diagram from the product owner; rotate the Valio key.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
