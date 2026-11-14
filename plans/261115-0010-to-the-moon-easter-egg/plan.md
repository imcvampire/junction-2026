---
title: ToTheMoon ladder-stacking easter egg
description: A hidden minigame at /to-the-moon, opened in a new tab by typing "tothemoon" anywhere in the web app. Press Space (or tap) to stop a sliding ladder section; the overlap stacks and the overhang is cut off, until the ladder reaches the moon.
status: completed
priority: P3
effort: 4.5h
branch: master
tags: [web, frontend, demo, easter-egg]
blockedBy: []
blocks: []
created: 2026-11-15
---

# ToTheMoon ladder-stacking easter egg

## Outcome

During the demo, the presenter types `tothemoon` on any page of the web app (no input focused). A
new browser tab opens on a full-screen game. A ladder section slides left and right above the
ladder; Space stops it. The part that overlaps the section below stays, the overhang breaks off and
falls. The ladder climbs, the sky darkens into space, the moon grows closer, and stacking 25
sections lands on the moon with a "ToTheMoon" win screen. Missing completely ends the run. The game
is not linked from the menu or anywhere else.

## Constraints

- Web app only (`apps/web`): React 19, TanStack file routes, Tailwind v4, Vitest. No new
  dependencies; Canvas 2D is enough.
- No backend change, no API calls, no impact on existing routes or tests.
- `NAV_ITEMS` in `apps/web/src/components/layout/app-shell.tsx` stays unchanged.
- Game state lives in a ref driven by `requestAnimationFrame`, not React state, so the page does
  not re-render 60 times a second. React state holds only the phase and score for the overlay.

## Non-goals

Leaderboards shared between viewers, analytics, power-ups, and touching the backend. The
best score is a per-browser convenience in `localStorage`, wrapped in try/catch.

## Decisions (planner defaults, confirm or override)

| Decision | Chosen | Rejected and why |
|---|---|---|
| Secret trigger | Type `tothemoon` anywhere (ignored while an input, textarea, select or contenteditable has focus, or with Ctrl/Meta/Alt held) | Konami code is generic and off-brand; clicking the logo N times also navigates home and is easy to hit by accident in the demo. The team name as a typed spell is on-brand and impossible to trigger by accident. |
| How it opens | `window.open("/to-the-moon", "_blank")`, then `tab.opener = null`; if it returns `null` (blocked), navigate in the same tab | Keydown is a user activation, so browsers allow the popup. The fallback keeps the demo working with strict popup settings. |
| Discoverability | Direct URL `/to-the-moon` also works; no link, no nav item, no mention on the home page | Hiding the route itself (e.g. a hashed path) adds nothing for a demo. |
| Layout | The route renders a `fixed inset-0 z-50` full-viewport canvas over the app shell | Restructuring `__root.tsx` into layout routes to drop the header touches every route for one page. |
| Engine split | Pure `game.ts` (state + `step` + `drop`) separated from `render.ts` (canvas) and the React component | Lets the slicing, perfect-drop and win/lose rules be unit-tested without a canvas. |
| Sound | Synthesised with the Web Audio API in `sound.ts`: no audio files, no dependency. `M` toggles mute, remembered in `localStorage` | Audio files need sourcing and licensing and add load time; a library such as Howler is overkill for five short blips. |
| Goal | 25 sections to reach the moon; altitude HUD shows `height / 25 × 384,400 km` | About 30 to 60 seconds per run, which fits a live demo. |
| Fairness | A drop within 4 world units of perfect snaps to perfect and keeps the width | Without it the ladder only shrinks and the moon is effectively unreachable on a laptop trackpad stage. |

## Phases

| # | Phase | Effort | Status |
|---|---|---|---|
| 1 | [Game engine](phase-01-game-engine.md) | 1.5h | completed |
| 2 | [Game route, canvas and sound](phase-02-game-route.md) | 2h | completed |
| 3 | [Secret trigger](phase-03-secret-trigger.md) | 0.5h | completed |
| 4 | [Verify](phase-04-verify.md) | 0.5h | completed |

Phase 2 depends on phase 1. Phase 3 is independent of 1 and 2 (it only needs the route path) but
is verified together in phase 4.

## Acceptance criteria

1. Typing `tothemoon` on `/`, `/orders` or `/journal-viewer` opens `/to-the-moon` in a new tab.
   Typing it inside any text field does nothing.
2. The header nav still shows only Orders and Journal viewer; no link to the game exists in the
   rendered app.
3. On `/to-the-moon`, Space (not auto-repeating while held), a click or a tap stops the moving
   section. The page does not scroll on Space.
4. A partial overlap leaves a narrower section and a falling offcut; a near-perfect drop keeps the
   width; no overlap ends the game with the score and a "Press Space to try again" prompt.
5. The 25th section shows the win screen with "ToTheMoon". The background visibly shifts from sky
   to space and the moon grows as the ladder rises.
6. The canvas is sharp on a retina display, fills the viewport, and resizes with the window.
7. Each event has its own sound: a wooden knock on every placement (pitch rising with the perfect
   streak), a bright chime on a perfect stop, a crack when an offcut breaks off, a falling tone on
   game over, and a short fanfare on the moon. `M` mutes and unmutes, with a visible speaker
   indicator. The page never errors when audio is unavailable.
8. `mise run check` passes with new tests for the engine, the sound module, the trigger and the route.

## Files

| Action | Path |
|---|---|
| Create | `apps/web/src/features/to-the-moon/game.ts`, `game.test.ts` |
| Create | `apps/web/src/features/to-the-moon/render.ts`, `sound.ts`, `sound.test.ts` |
| Create | `apps/web/src/features/to-the-moon/components/moon-game.tsx` |
| Create | `apps/web/src/features/to-the-moon/use-secret-code.ts`, `use-secret-code.test.tsx` |
| Create | `apps/web/src/routes/to-the-moon.tsx` |
| Modify | `apps/web/src/components/layout/app-shell.tsx` (mount the hook only) |
| Modify | `apps/web/src/routes/-app.test.tsx` (route renders, nav has no game link) |
| Regenerated | `apps/web/src/routeTree.gen.ts` (by the router plugin) |
