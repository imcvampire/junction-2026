---
phase: 2
title: Game route, canvas and sound
status: completed
effort: 2h
depends_on: [1]
---

# Phase 2: Game route, canvas and sound

## Route

`apps/web/src/routes/to-the-moon.tsx`: `createFileRoute("/to-the-moon")` rendering `MoonGame`.
Set `document.title = "ToTheMoon"` while mounted and restore it on unmount. Let the router plugin
regenerate `routeTree.gen.ts` (run `pnpm build` or the dev server once); do not hand-edit it.

## Component (`components/moon-game.tsx`)

- Root: `fixed inset-0 z-50 overflow-hidden bg-black select-none touch-none`, with a `<canvas>`
  filling it and an absolutely positioned overlay for text (`aria-live="polite"`).
- Game state in `useRef<GameState>`; one `requestAnimationFrame` loop in a `useEffect` that calls
  `step` then `render`, cancelled in cleanup (StrictMode mounts twice). Mirror only `phase` and
  score into React state, and only when they change.
- Input: `keydown` on `window` for `Space` (and `Enter` on over/won), ignoring `event.repeat`, with
  `preventDefault` so the page never scrolls; `pointerdown` on the root for click and tap.
- Resize: a `ResizeObserver` on the root sets canvas size to CSS size × `devicePixelRatio` and
  scales the context. World-to-screen scale fits world width 400 into the viewport width, capped
  so sections stay readable on wide screens.
- Overlay text by phase: `ready` "ToTheMoon / Press Space to build a ladder to the moon";
  `playing` score and altitude; `over` "Ladder broke at N km / Press Space to try again" plus
  best; `won` "ToTheMoon! / You reached the moon in N sections". Best score in `localStorage`
  key `to-the-moon:best`, read and written in try/catch.

## Renderer (`render.ts`)

`render(ctx, state, viewport)`, pure drawing:

- Background: vertical gradient interpolated by `cameraLevel / goal` from day sky
  (`#7dd3fc` → `#e0f2fe`) through dusk to space (`#020617`); stars fade in after 40%, drawn from a
  fixed seeded list so they do not flicker.
- Moon: a pale disc with a few craters at the goal altitude; its radius grows as the camera
  approaches, so it is a small dot at the start and fills the top of the screen near the end.
- Ladder sections: two rails at the section's edges and three rungs, a warm wood or metal colour,
  with the top section highlighted. Offcuts drawn with their alpha.
- Camera: keeps the moving section at about 35% from the top of the viewport.
- A brief "Perfect!" flash when `perfectStreak` increments (driven by state, not timers).

## Sound (`sound.ts`)

Synthesised with the Web Audio API; no audio files, no dependency.

- `createSound()` returns `{ play(event), setMuted(bool), muted, dispose() }`. It creates one
  `AudioContext` lazily on the first `play`, which always follows a user gesture (Space, click or
  tap), so autoplay policies allow it; call `ctx.resume()` if it is `suspended`. If
  `AudioContext` is missing or throws, every method is a no-op.
- One master `GainNode` (about 0.25) so nothing is harsh on venue speakers; mute sets it to 0.
- Events and voices, each a short oscillator with a gain envelope (attack ~5 ms, exponential
  decay) so there are no clicks:
  - `place`: wooden knock, triangle wave ~220 Hz dropping over 80 ms, pitch raised one semitone
    per `perfectStreak` step (capped at an octave).
  - `perfect`: chime, two sine notes a fifth apart, ~880 Hz, 250 ms tail.
  - `cut`: crack, a 60 ms burst of white noise through a band-pass filter (one noise buffer
    generated once and reused).
  - `over`: sawtooth glide from ~440 Hz down to ~110 Hz over 600 ms.
  - `win`: four-note rising arpeggio (C5, E5, G5, C6), 120 ms apart, then a held chord.
- The component maps engine transitions to events by comparing the state before and after
  `drop`: a new section is `place` (plus `perfect` if the streak grew, plus `cut` if an offcut
  was added), phase `over` is `over`, phase `won` is `win`. The engine stays free of audio.
- `M` toggles mute; persist it under `to-the-moon:muted` in try/catch. Show a small speaker icon
  (`Volume2Icon` / `VolumeXIcon` from `lucide-react`) in a top corner of the overlay that is also
  clickable, with an `aria-label`, and stop its `pointerdown` from triggering a drop.
- `dispose()` closes the context on unmount.

## Tests

In `apps/web/src/routes/-app.test.tsx`, add one case: the router at `/to-the-moon` renders the
"ToTheMoon" start text. jsdom has no canvas context, so `MoonGame` must tolerate
`getContext("2d")` returning `null` (skip drawing, keep the overlay). No canvas snapshot tests.

`sound.test.ts`: with `AudioContext` undefined (the jsdom default), `createSound().play("win")`
does not throw; with a minimal fake `AudioContext` stubbed on `globalThis`, the context is created
only on the first `play`, mute sets the master gain to 0, and `dispose` closes it.

Run: `pnpm test src/routes/-app.test.tsx src/features/to-the-moon/sound.test.ts`.
