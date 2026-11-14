---
title: ToTheMoon easter egg
date: 2026-11-14
summary: "Hidden ladder-stacking game at /to-the-moon, opened by typing tothemoon anywhere in the web app"
---

# ToTheMoon easter egg

## What happened
Implemented plans/261115-0010-to-the-moon-easter-egg in apps/web/src/features/to-the-moon:
pure engine (game.ts: drop/step, perfect snap within 4 units, 25 sections to win), canvas renderer
(sky to space gradient, seeded stars, growing moon), Web Audio synth sound (place, perfect, cut,
over, win; M or speaker icon mutes), the /to-the-moon route, and a useSecretCode hook mounted in
AppShell. NAV_ITEMS is unchanged.

## Verification
mise run check passes (web 117 tests, api 167). In a real Chromium, typing the code on /orders
opened a new tab on /to-the-moon; play, cut, game over, best score and restart worked without
scrolling. Late-game and won frames were rendered from the real modules through Vite.

## Gotchas
- agent-browser `keyboard type` sent no keydown events, and `press` delivered them repeated and
  out of order, which wedged the session. Dispatching synthetic KeyboardEvents via `eval` worked.
- The first engine test placed a section that still overlapped the base; an edge-touching x is
  needed to test a miss.
- oxlint's react(refs) rule rejects reading gameRef during render; altitude comes from React state.

## Next steps
Listen to every sound on the demo laptop or venue speakers and adjust the master gain if needed.
Play one full run by hand and tune speed or tolerance in GAME if it is too hard on stage.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
