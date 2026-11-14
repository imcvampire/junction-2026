import { GAME, type GameState, type Section } from "@/features/to-the-moon/game"

export type Viewport = { width: number; height: number }

type Rgb = [number, number, number]

const SKY: { at: number; top: Rgb; bottom: Rgb }[] = [
  { at: 0, top: hex("#7dd3fc"), bottom: hex("#e0f2fe") },
  { at: 0.5, top: hex("#4c1d95"), bottom: hex("#fb923c") },
  { at: 1, top: hex("#020617"), bottom: hex("#0f172a") },
]

const RAIL = "#92400e"
const RUNG = "#d97706"
const TOP_RAIL = "#f59e0b"
const TOP_RUNG = "#fde68a"
const MOVING_RAIL = "#fbbf24"
const MOVING_RUNG = "#fef3c7"

const MIN_VISIBLE_SECTIONS = 14
const CAMERA_ANCHOR = 0.35

function hex(value: string): Rgb {
  const n = Number.parseInt(value.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: Rgb, b: Rgb, t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

function skyAt(p: number): { top: string; bottom: string } {
  const i = p >= SKY[1].at ? 1 : 0
  const from = SKY[i]
  const to = SKY[i + 1]
  const t = (p - from.at) / (to.at - from.at)
  return {
    top: mix(from.top, to.top, t),
    bottom: mix(from.bottom, to.bottom, t),
  }
}

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STARS = (() => {
  const rand = seeded(2026)
  return Array.from({ length: 140 }, () => ({
    x: rand(),
    y: rand(),
    r: 0.4 + rand() * 1.2,
    a: 0.4 + rand() * 0.6,
  }))
})()

const CRATERS = [
  { x: -0.3, y: -0.2, r: 0.18 },
  { x: 0.25, y: 0.1, r: 0.12 },
  { x: -0.05, y: 0.35, r: 0.09 },
  { x: 0.35, y: -0.35, r: 0.07 },
]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function progress(state: GameState) {
  return clamp01((state.cameraLevel - 1) / GAME.goal)
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  { width, height }: Viewport
) {
  const p = progress(state)
  const scale = Math.min(
    (width * 0.9) / GAME.worldWidth,
    height / (GAME.sectionHeight * MIN_VISIBLE_SECTIONS)
  )
  const sh = GAME.sectionHeight * scale
  const originX = (width - GAME.worldWidth * scale) / 2
  const movingBottom = height * CAMERA_ANCHOR + sh
  const levelBottom = (level: number) =>
    movingBottom + (state.cameraLevel - level) * sh
  const toX = (x: number) => originX + x * scale

  const sky = skyAt(p)
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, sky.top)
  gradient.addColorStop(1, sky.bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  const starAlpha = clamp01((p - 0.4) / 0.3)
  if (starAlpha > 0) {
    ctx.fillStyle = "#ffffff"
    for (const star of STARS) {
      ctx.globalAlpha = star.a * starAlpha
      ctx.beginPath()
      ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  drawMoon(ctx, p, width, height)

  const groundTop = levelBottom(0)
  if (groundTop < height) {
    ctx.fillStyle = "#15803d"
    ctx.fillRect(0, groundTop, width, height - groundTop)
    ctx.fillStyle = "#166534"
    ctx.fillRect(0, groundTop, width, Math.max(2, sh * 0.15))
  }

  const topIndex = state.stack.length - 1
  state.stack.forEach((section, level) => {
    const y = levelBottom(level) - sh
    if (y > height || y + sh < 0) return
    const isTop = level === topIndex
    drawSection(
      ctx,
      toX(section.x),
      y,
      section.width * scale,
      sh,
      isTop ? TOP_RAIL : RAIL,
      isTop ? TOP_RUNG : RUNG
    )
  })

  for (const offcut of state.offcuts) {
    ctx.globalAlpha = clamp01(offcut.alpha)
    drawSection(
      ctx,
      toX(offcut.x),
      levelBottom(offcut.level) - sh + offcut.y * scale,
      offcut.width * scale,
      sh,
      RAIL,
      RUNG
    )
  }
  ctx.globalAlpha = 1

  if (state.phase === "ready" || state.phase === "playing") {
    const moving: Section = state.moving
    drawSection(
      ctx,
      toX(moving.x),
      levelBottom(state.stack.length) - sh,
      moving.width * scale,
      sh,
      MOVING_RAIL,
      MOVING_RUNG
    )
  }

  if (state.perfectFlashMs > 0) {
    const t = state.perfectFlashMs / GAME.perfectFlashMs
    ctx.globalAlpha = clamp01(t * 1.5)
    ctx.fillStyle = "#fef08a"
    ctx.font = `700 ${Math.round(18 + sh * 0.5)}px system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    const label =
      state.perfectStreak > 1 ? `Perfect! ×${state.perfectStreak}` : "Perfect!"
    ctx.fillText(label, width / 2, movingBottom - sh * 1.6 - (1 - t) * sh)
    ctx.globalAlpha = 1
  }
}

function drawMoon(
  ctx: CanvasRenderingContext2D,
  p: number,
  width: number,
  height: number
) {
  const eased = p * p
  const radius = 6 + eased * Math.max(width, height) * 0.6
  const cx = width * (0.75 - 0.25 * eased)
  const cy = height * 0.14 - eased * radius * 0.55

  ctx.save()
  ctx.shadowColor = "rgba(254, 249, 195, 0.6)"
  ctx.shadowBlur = 12 + radius * 0.2
  ctx.fillStyle = "#f1f5f9"
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  if (radius < 10) return
  ctx.fillStyle = "#cbd5e1"
  for (const crater of CRATERS) {
    ctx.beginPath()
    ctx.arc(
      cx + crater.x * radius,
      cy + crater.y * radius,
      crater.r * radius,
      0,
      Math.PI * 2
    )
    ctx.fill()
  }
}

function drawSection(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  railColor: string,
  rungColor: string
) {
  if (w <= 0) return
  const rail = Math.min(Math.max(h * 0.18, 3), w / 2)
  const rung = Math.max(h * 0.12, 2)
  ctx.fillStyle = rungColor
  for (const at of [0.2, 0.5, 0.8]) {
    ctx.fillRect(x + rail, y + h * at - rung / 2, w - rail * 2, rung)
  }
  ctx.fillStyle = railColor
  ctx.fillRect(x, y, rail, h)
  ctx.fillRect(x + w - rail, y, rail, h)
}
