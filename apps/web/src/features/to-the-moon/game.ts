export const GAME = {
  worldWidth: 400,
  sectionHeight: 28,
  startWidth: 200,
  goal: 25,
  perfectTolerance: 4,
  baseSpeed: 140,
  speedGrowth: 1.06,
  maxSpeed: 420,
  gravity: 900,
  offcutFadePerSecond: 1,
  maxStepMs: 50,
  cameraEase: 6,
  perfectFlashMs: 700,
  moonDistanceKm: 384_400,
} as const

export type Section = { x: number; width: number }
export type MovingSection = Section & { dir: 1 | -1; speed: number }
export type Offcut = {
  x: number
  width: number
  level: number
  y: number
  vy: number
  alpha: number
}
export type Phase = "ready" | "playing" | "over" | "won"

export type GameState = {
  phase: Phase
  stack: Section[]
  moving: MovingSection
  offcuts: Offcut[]
  perfectStreak: number
  perfectFlashMs: number
  cameraLevel: number
}

function speedFor(level: number) {
  return Math.min(GAME.baseSpeed * GAME.speedGrowth ** level, GAME.maxSpeed)
}

function spawn(width: number, level: number, dir: 1 | -1): MovingSection {
  return {
    x: dir === 1 ? 0 : GAME.worldWidth - width,
    width,
    dir,
    speed: speedFor(level),
  }
}

export function createGame(): GameState {
  const base = {
    x: (GAME.worldWidth - GAME.startWidth) / 2,
    width: GAME.startWidth,
  }
  return {
    phase: "ready",
    stack: [base],
    moving: spawn(base.width, 1, 1),
    offcuts: [],
    perfectStreak: 0,
    perfectFlashMs: 0,
    cameraLevel: 1,
  }
}

export function score(state: GameState) {
  return state.stack.length - 1
}

export function kmForSections(sections: number) {
  return Math.round((sections / GAME.goal) * GAME.moonDistanceKm)
}

export function altitudeKm(state: GameState) {
  return kmForSections(score(state))
}

function offcut(section: Section, level: number): Offcut {
  return { ...section, level, y: 0, vy: 0, alpha: 1 }
}

export function drop(state: GameState): GameState {
  if (state.phase === "ready") return { ...state, phase: "playing" }
  if (state.phase !== "playing") return { ...createGame(), phase: "playing" }

  const { moving, stack } = state
  const top = stack[stack.length - 1]
  const level = stack.length
  const left = Math.max(moving.x, top.x)
  const right = Math.min(moving.x + moving.width, top.x + top.width)

  if (right - left <= 0) {
    return {
      ...state,
      phase: "over",
      offcuts: [...state.offcuts, offcut(moving, level)],
      perfectStreak: 0,
    }
  }

  let placed: Section
  let offcuts = state.offcuts
  let perfectStreak: number
  if (Math.abs(moving.x - top.x) <= GAME.perfectTolerance) {
    placed = { x: top.x, width: top.width }
    perfectStreak = state.perfectStreak + 1
  } else {
    placed = { x: left, width: right - left }
    const overhang =
      moving.x < top.x
        ? { x: moving.x, width: left - moving.x }
        : { x: right, width: moving.x + moving.width - right }
    offcuts = [...offcuts, offcut(overhang, level)]
    perfectStreak = 0
  }

  const nextStack = [...stack, placed]
  const won = nextStack.length - 1 === GAME.goal
  return {
    ...state,
    phase: won ? "won" : "playing",
    stack: nextStack,
    moving: won
      ? { ...moving, ...placed }
      : spawn(placed.width, nextStack.length, moving.dir === 1 ? -1 : 1),
    offcuts,
    perfectStreak,
    perfectFlashMs:
      perfectStreak > state.perfectStreak ? GAME.perfectFlashMs : 0,
  }
}

function advanceMoving(moving: MovingSection, dt: number): MovingSection {
  const max = GAME.worldWidth - moving.width
  const x = moving.x + moving.dir * moving.speed * dt
  if (x <= 0) return { ...moving, x: 0, dir: 1 }
  if (x >= max) return { ...moving, x: max, dir: -1 }
  return { ...moving, x }
}

export function step(state: GameState, dtMs: number): GameState {
  const dt = Math.min(Math.max(dtMs, 0), GAME.maxStepMs) / 1000
  const offcuts = state.offcuts
    .map((o) => {
      const vy = o.vy + GAME.gravity * dt
      return {
        ...o,
        vy,
        y: o.y + vy * dt,
        alpha: o.alpha - GAME.offcutFadePerSecond * dt,
      }
    })
    .filter((o) => o.alpha > 0)
  const target = state.stack.length
  return {
    ...state,
    moving:
      state.phase === "playing"
        ? advanceMoving(state.moving, dt)
        : state.moving,
    offcuts,
    perfectFlashMs: Math.max(0, state.perfectFlashMs - dt * 1000),
    cameraLevel:
      state.cameraLevel +
      (target - state.cameraLevel) * (1 - Math.exp(-GAME.cameraEase * dt)),
  }
}
