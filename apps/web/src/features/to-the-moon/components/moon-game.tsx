import { useCallback, useEffect, useRef, useState } from "react"
import { Volume2Icon, VolumeXIcon } from "lucide-react"

import {
  createGame,
  drop,
  GAME,
  type GameState,
  kmForSections,
  type Phase,
  score,
  step,
} from "@/features/to-the-moon/game"
import { render } from "@/features/to-the-moon/render"
import { createSound, type Sound } from "@/features/to-the-moon/sound"

const BEST_KEY = "to-the-moon:best"
const MUTED_KEY = "to-the-moon:muted"

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Best score and mute are conveniences; private mode may block storage.
  }
}

function playTransition(sound: Sound, before: GameState, after: GameState) {
  if (before.phase !== "playing") return
  if (after.phase === "over") {
    sound.play({ type: "over" })
    return
  }
  if (after.stack.length > before.stack.length) {
    sound.play({ type: "place", streak: after.perfectStreak })
    if (after.perfectStreak > before.perfectStreak) {
      sound.play({ type: "perfect" })
    }
    if (after.offcuts.length > before.offcuts.length) {
      sound.play({ type: "cut" })
    }
  }
  if (after.phase === "won") sound.play({ type: "win" })
}

const formatKm = (km: number) => km.toLocaleString("en-US")

export function MoonGame() {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<GameState>(createGame())
  const soundRef = useRef<Sound | null>(null)
  const [phase, setPhase] = useState<Phase>("ready")
  const [sections, setSections] = useState(0)
  const [best, setBest] = useState(() => Number(readStorage(BEST_KEY)) || 0)
  const [muted, setMuted] = useState(() => readStorage(MUTED_KEY) === "true")

  useEffect(() => {
    const sound = createSound(readStorage(MUTED_KEY) === "true")
    soundRef.current = sound
    return () => {
      sound.dispose()
      soundRef.current = null
    }
  }, [])

  useEffect(() => {
    const previous = document.title
    document.title = "ToTheMoon"
    return () => {
      document.title = previous
    }
  }, [])

  const act = useCallback(() => {
    const before = gameRef.current
    const after = drop(before)
    gameRef.current = after
    if (soundRef.current) playTransition(soundRef.current, before, after)
    const placed = score(after)
    setPhase(after.phase)
    setSections(placed)
    if (after.phase === "over" || after.phase === "won") {
      setBest((current) => {
        if (placed <= current) return current
        writeStorage(BEST_KEY, String(placed))
        return placed
      })
    }
  }, [])

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current
      soundRef.current?.setMuted(next)
      writeStorage(MUTED_KEY, String(next))
      return next
    })
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const finished =
        gameRef.current.phase === "over" || gameRef.current.phase === "won"
      if (event.code === "Space" || (event.key === "Enter" && finished)) {
        event.preventDefault()
        if (!event.repeat) act()
      } else if (event.key === "m" || event.key === "M") {
        if (!event.repeat) toggleMute()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [act, toggleMute])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const ctx = canvas.getContext("2d")
    const viewport = { width: 0, height: 0 }

    function resize() {
      if (!root || !canvas) return
      const dpr = window.devicePixelRatio || 1
      viewport.width = root.clientWidth
      viewport.height = root.clientHeight
      canvas.width = Math.round(viewport.width * dpr)
      canvas.height = Math.round(viewport.height * dpr)
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(resize)
      observer.observe(root)
    } else {
      window.addEventListener("resize", resize)
    }

    let frame = 0
    let last = performance.now()
    function tick(now: number) {
      gameRef.current = step(gameRef.current, now - last)
      last = now
      if (ctx && viewport.width > 0 && viewport.height > 0) {
        render(ctx, gameRef.current, viewport)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener("resize", resize)
    }
  }, [])

  const altitude = kmForSections(sections)

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 touch-none overflow-hidden bg-black select-none"
      onPointerDown={(event) => {
        if (event.button === 0) act()
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      <div
        aria-live="polite"
        className="pointer-events-none absolute inset-0 flex flex-col items-center px-4 pt-6 text-center text-white [text-shadow:0_1px_4px_rgb(0_0_0/0.6)]"
      >
        {phase === "ready" ? (
          <div className="mt-[20vh] flex flex-col gap-3">
            <h1 className="font-heading text-5xl font-bold tracking-tight sm:text-6xl">
              ToTheMoon
            </h1>
            <p className="text-lg">Press Space to build a ladder to the moon</p>
            {best > 0 ? (
              <p className="text-sm opacity-80">
                Best: {best} of {GAME.goal} sections
              </p>
            ) : null}
          </div>
        ) : null}
        {phase === "playing" ? (
          <div className="flex flex-col gap-1">
            <p className="font-heading text-4xl font-bold tabular-nums">
              {sections}
              <span className="text-xl opacity-70"> / {GAME.goal}</span>
            </p>
            <p className="text-sm tabular-nums opacity-80">
              {formatKm(altitude)} km
            </p>
          </div>
        ) : null}
        {phase === "over" ? (
          <div className="mt-[20vh] flex flex-col gap-3">
            <h1 className="font-heading text-4xl font-bold">
              Ladder broke at {formatKm(altitude)} km
            </h1>
            <p className="text-lg">Press Space to try again</p>
            <p className="text-sm opacity-80">
              {sections} sections · best {best}
            </p>
          </div>
        ) : null}
        {phase === "won" ? (
          <div className="mt-[20vh] flex flex-col gap-3">
            <h1 className="font-heading text-6xl font-bold tracking-tight">
              ToTheMoon!
            </h1>
            <p className="text-lg">
              You reached the moon in {sections} sections
            </p>
            <p className="text-sm opacity-80">Press Space to play again</p>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={muted ? "Unmute sound (M)" : "Mute sound (M)"}
        aria-pressed={muted}
        className="absolute top-4 right-4 rounded-full bg-black/30 p-2 text-white hover:bg-black/50"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.currentTarget.blur()
          toggleMute()
        }}
      >
        {muted ? (
          <VolumeXIcon className="size-5" />
        ) : (
          <Volume2Icon className="size-5" />
        )}
      </button>
    </div>
  )
}
