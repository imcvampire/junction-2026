---
phase: 1
title: Game engine
status: completed
effort: 1.5h
---

# Phase 1: Game engine

Pure, deterministic game rules in `apps/web/src/features/to-the-moon/game.ts`. No DOM, no canvas,
no timers; time enters only through `step(state, dtMs)`.

## Model

World units, independent of screen size: world width `400`, section height `28`, start width
`200`, goal `25`, perfect tolerance `4`.

```ts
type Section = { x: number; width: number }          // x = left edge
type Offcut = { x: number; width: number; level: number; y: number; vy: number; alpha: number }
type Phase = "ready" | "playing" | "over" | "won"

type GameState = {
  phase: Phase
  stack: Section[]          // stack[0] is the base, centred
  moving: Section & { dir: 1 | -1; speed: number }
  offcuts: Offcut[]
  perfectStreak: number
  cameraLevel: number       // eased towards stack.length for smooth scrolling
}
```

Exports: `createGame()`, `step(state, dtMs)`, `drop(state)`, `altitudeKm(state)`, and the
constants above as `GAME`.

## Rules

1. `drop` on `ready` switches to `playing` without placing anything. On `over` or `won` it returns
   a fresh `createGame()` in `playing`. Otherwise it places the moving section.
2. Overlap with the top section: `left = max(a.x, b.x)`, `right = min(a.x+a.w, b.x+b.w)`.
   - `right - left <= 0`: phase `over`; the whole moving section becomes an offcut.
   - `|moving.x - top.x| <= tolerance`: snap to `top.x`, keep `top.width`, `perfectStreak += 1`.
   - Otherwise push `{x: left, width: right - left}` and one offcut for the overhang side;
     `perfectStreak = 0`.
3. After a placement, if `stack.length - 1 === goal` the phase is `won`. Otherwise spawn the next
   moving section with the new top width at the opposite edge from the last one, speed
   `min(140 * 1.06^level, 420)` units per second.
4. `step` moves the section while `playing`, bouncing at `0` and `400 - width`; advances offcuts
   under gravity (`vy += 900 * dt`, fade over ~1s, drop them when invisible); eases
   `cameraLevel`. Clamp `dtMs` to 50 so a background tab does not teleport the section.
5. Functions return new state objects; `step` may reuse arrays only if tests stay deterministic.

## Tests (`game.test.ts`)

- First `drop` from `ready` starts the game and places nothing.
- Partial overlap: placed width equals the overlap; one offcut with the overhang width.
- Within tolerance: snaps, width unchanged, streak increments; outside tolerance resets it.
- No overlap: phase `over`, stack unchanged.
- Placing the 25th section sets `won`; `drop` after `over`/`won` restarts.
- `step` bounces at both edges and clamps a 5000 ms delta.

Run: `pnpm test src/features/to-the-moon/game.test.ts` in `apps/web`.
