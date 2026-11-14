import { describe, expect, it } from "vitest"

import {
  altitudeKm,
  createGame,
  drop,
  GAME,
  type GameState,
  step,
} from "@/features/to-the-moon/game"

function playing(): GameState {
  return drop(createGame())
}

function withMovingAt(state: GameState, x: number): GameState {
  return { ...state, moving: { ...state.moving, x } }
}

const baseX = (GAME.worldWidth - GAME.startWidth) / 2

describe("drop", () => {
  it("starts the game from ready without placing anything", () => {
    const state = drop(createGame())
    expect(state.phase).toBe("playing")
    expect(state.stack).toHaveLength(1)
    expect(state.offcuts).toHaveLength(0)
  })

  it("keeps only the overlap and cuts the overhang off", () => {
    const state = drop(withMovingAt(playing(), baseX + 50))
    expect(state.stack).toHaveLength(2)
    expect(state.stack[1]).toEqual({ x: baseX + 50, width: 150 })
    expect(state.offcuts).toHaveLength(1)
    expect(state.offcuts[0]).toMatchObject({ x: baseX + 200, width: 50 })
    expect(state.moving.width).toBe(150)
  })

  it("cuts the left overhang when the section stops short", () => {
    const state = drop(withMovingAt(playing(), baseX - 30))
    expect(state.stack[1]).toEqual({ x: baseX, width: 170 })
    expect(state.offcuts[0]).toMatchObject({ x: baseX - 30, width: 30 })
  })

  it("snaps a near-perfect drop and counts the streak", () => {
    const first = drop(withMovingAt(playing(), baseX + GAME.perfectTolerance))
    expect(first.stack[1]).toEqual({ x: baseX, width: GAME.startWidth })
    expect(first.offcuts).toHaveLength(0)
    expect(first.perfectStreak).toBe(1)
    expect(first.perfectFlashMs).toBeGreaterThan(0)

    const second = drop(withMovingAt(first, baseX - 1))
    expect(second.perfectStreak).toBe(2)

    const miss = drop(withMovingAt(second, baseX + GAME.perfectTolerance + 1))
    expect(miss.perfectStreak).toBe(0)
    expect(miss.stack[3].width).toBe(
      GAME.startWidth - GAME.perfectTolerance - 1
    )
  })

  it("ends the game when nothing overlaps", () => {
    const before = playing()
    const state = drop(withMovingAt(before, baseX + GAME.startWidth))
    expect(state.phase).toBe("over")
    expect(state.stack).toEqual(before.stack)
    expect(state.offcuts).toHaveLength(1)
  })

  it("spawns the next section at the opposite edge with its new width", () => {
    const state = drop(withMovingAt(playing(), baseX + 50))
    expect(state.moving.dir).toBe(-1)
    expect(state.moving.x).toBe(GAME.worldWidth - 150)
    expect(state.moving.speed).toBeGreaterThan(playing().moving.speed)
  })

  it("wins on the last section and restarts after winning or losing", () => {
    let state = playing()
    for (let i = 0; i < GAME.goal; i++) {
      expect(state.phase).toBe("playing")
      state = drop(withMovingAt(state, baseX))
    }
    expect(state.phase).toBe("won")
    expect(altitudeKm(state)).toBe(GAME.moonDistanceKm)

    const restarted = drop(state)
    expect(restarted.phase).toBe("playing")
    expect(restarted.stack).toHaveLength(1)

    const over = drop(withMovingAt(playing(), baseX - GAME.startWidth))
    expect(over.phase).toBe("over")
    expect(drop(over).phase).toBe("playing")
    expect(drop(over).stack).toHaveLength(1)
  })
})

describe("step", () => {
  it("does not move the section before the game starts", () => {
    const state = createGame()
    expect(step(state, 16).moving.x).toBe(state.moving.x)
  })

  it("bounces at both edges", () => {
    const state = playing()
    const right = step(
      withMovingAt(state, GAME.worldWidth - state.moving.width - 0.1),
      16
    )
    expect(right.moving.x).toBe(GAME.worldWidth - state.moving.width)
    expect(right.moving.dir).toBe(-1)

    const left = step(
      { ...state, moving: { ...state.moving, x: 0.1, dir: -1 } },
      16
    )
    expect(left.moving.x).toBe(0)
    expect(left.moving.dir).toBe(1)
  })

  it("clamps a long frame so a background tab does not teleport the section", () => {
    const state = playing()
    const next = step(state, 5000)
    expect(next.moving.x).toBeCloseTo(
      state.moving.speed * (GAME.maxStepMs / 1000)
    )
  })

  it("lets offcuts fall, fade and disappear", () => {
    let state = drop(withMovingAt(playing(), baseX + 50))
    state = step(state, 16)
    expect(state.offcuts[0].y).toBeGreaterThan(0)
    expect(state.offcuts[0].alpha).toBeLessThan(1)
    for (let i = 0; i < 30; i++) state = step(state, 50)
    expect(state.offcuts).toHaveLength(0)
  })
})
