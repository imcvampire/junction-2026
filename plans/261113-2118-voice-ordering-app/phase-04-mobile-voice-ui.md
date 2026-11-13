---
phase: 4
title: Mobile voice UI
status: removed
depends_on: [3]
---

# Phase 4 — Mobile voice UI

## Context

`apps/web` is React 19 + Vite + Tailwind + shadcn (drawer, card, sonner). Default runtime is a
mobile-first PWA (see plan decision table). If the team picks Expo instead, this phase moves to a new
`apps/mobile`; the BE contract from Phase 3 does not change.

## Requirements

- Single conversation screen: big push-to-talk button, live transcript, offer cards
  (product, price, availability, delivery reliability, CO₂ range), confirm / decline buttons as
  a tap fallback to voice.
- Capture audio with `MediaRecorder`, send to `/api/voice/transcribe`, post text turn, play
  `/api/voice/speak` audio. Interrupt playback when the user presses talk again.
- Render `flow_state` and `actions`; on `offer_ar` show an "See it in your storage room" CTA (Phase 5).
- Order status view including `pending_approval` and the human-readable audit.
- PWA manifest + HTTPS dev setup (mic and camera require a secure context on phones).

## Files

- Modify: `apps/web/src/App.tsx`, `apps/web/src/lib/api.ts`, `apps/web/vite.config.ts`, `apps/web/index.html`
- Create: `apps/web/src/features/voice/{use-recorder,use-playback}.ts`,
  `apps/web/src/features/conversation/{conversation-screen,offer-card,order-status}.tsx`

## Validation

- `mise run lint:web typecheck:web`
- Manual on a real iPhone and Android phone over HTTPS: acceptance criteria 1–3.
- Verify the built bundle contains no API keys (`rg -i 'key|secret' apps/web/dist`).
