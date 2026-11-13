---
title: "Voice ordering app: five phases built, review hardened the approval path"
date: 2026-11-13
summary: "Backend, voice UI and AR preview shipped behind tests; review found policy bypasses, most fixed, approver auth and threshold scope pending decisions"
---

# Voice ordering app: five phases built, review hardened the approval path

## What happened
Implemented plans/261113-2118-voice-ordering-app end to end: Valio client and catalog index (83 MB JSON projected to slim records, ~1 s load, ~750 MB transient peak), SQLite orders with approval policy and audit trail, LLM agent loop over SSE with six tools, OpenAI-compatible voice proxy, footprint + pure-Python GLB writer, and a PWA with push-to-talk, offer cards and model-viewer AR.

Verified live against https://junction26.valioaimo.fi: a 1,332 EUR lactose-free milk order escalated correctly; footprint 2 pallets, 2.55 x 0.80 m, 1.43 m high; GLB loads in trimesh at true scale. Browser run (scripted LLM, real prices) caught a fixed overlay swallowing taps on the AR CTA. Real data surprise: brand values carry trailing spaces ("Arla ").

## Review findings
An independent review found the approval path weaker than it looked: requote left an unplaceable draft with stale prices; agree and place could happen in consecutive turns with the quick reply skipping AR; substitution escalation depended on the LLM passing substitute_for/preferences; failed or cancelled turns lost session state. Fixed: requote re-drafts at the new price, place refused in the agree turn, requirements tracked per session from search filters and enforced on every line, session committed on any exit, AR render capped at 48 pallets, upstream error bodies kept out of responses. 65 tests pass; ruff, pyright strict, oxlint, tsc clean.

## Decision
Order guards live in the backend tools and service, never only in the prompt. Any line failing stated requirements now escalates, not only flagged substitutes.

## Next steps
- Product decisions: approver authentication on /approve and /reject; whether the spend threshold applies per order, session or delivery day (order splitting currently bypasses it).
- Set OPENAI_COMPATIBLE_URL and run the live acceptance-criterion-1 smoke; verify kimi-k3-1-pro tool calling.
- Choose a STT/TTS provider; test on real iPhone and Android over WEB_HTTPS=1.
- Rotate the Valio key (still in git history at a022028).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
