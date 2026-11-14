---
phase: 4
title: Verify
status: completed
effort: 0.5h
depends_on: [1, 2, 3]
---

# Phase 4: Verify

## Steps

1. In `apps/web`: `pnpm lint`, `pnpm typecheck`, then the three focused test files. Finish with
   `mise run check`.
2. Start `mise run dev` (reuse a running instance on 5173 rather than starting another). On `/`,
   type `tothemoon`: a new tab opens on the game. Repeat on `/orders`. Type it into a text field:
   nothing happens.
3. Play: Space starts, stops sections, never scrolls the page; holding Space places only one
   section; tap works in device emulation. Confirm partial cut, perfect snap, game over, restart.
4. Play one full run to the moon, without changing the goal in code, and check the win screen, the
   sky-to-space shift and the moon growth. If the run is too hard for a stage, tune speed or
   tolerance in `GAME`, not the goal.
5. With sound on, confirm each event is audible and distinct (place, perfect, cut, game over,
   win), the knock rises in pitch through a perfect streak, `M` and the speaker icon mute and
   unmute, and the mute setting survives a reload. Check it on the demo laptop's speakers or the
   venue output, not only headphones, and turn the master gain down if it is harsh.
6. Check a retina display and a window resize mid-game; check a background-tab switch does not
   teleport the section.
7. Confirm the header nav is unchanged. Stop the dev server if this phase started it.

## Docs

No docs change: the game is intentionally undocumented in user-facing docs. Tell the presenter the
trigger in the demo script, not in the README.
