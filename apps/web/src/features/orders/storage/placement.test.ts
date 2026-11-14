import { describe, expect, it } from "vitest"

import {
  canPlace,
  classifyDepth,
  facingYaw,
  footprintBoxes,
  footprintSamples,
  isFloorHit,
  type Vec3,
} from "@/features/orders/storage/placement"
import type { Block, Room } from "@/features/orders/storage/plan"

const room: Room = { width: 2, depth: 1, height: 2 }
// One 1 m x 0.5 m stack, 1.2 m tall, in the room's back-left corner.
const blocks: Block[] = [
  {
    id: "0-0",
    lineIndex: 0,
    productId: "A",
    name: "Milk",
    packsInColumn: 4,
    x: 0,
    z: 0,
    w: 1,
    d: 0.5,
    h: 1.2,
  },
]
const boxes = footprintBoxes(blocks, room)
const samples = footprintSamples(blocks, room)

describe("facingYaw", () => {
  it("turns the front edge (+z) towards the viewer", () => {
    const target = { x: 0, y: 0, z: 0 }
    expect(facingYaw(target, { x: 0, y: 1.5, z: 2 })).toBeCloseTo(0)
    expect(facingYaw(target, { x: 2, y: 1.5, z: 0 })).toBeCloseTo(Math.PI / 2)
    expect(Math.abs(facingYaw(target, { x: 0, y: 1.5, z: -2 }))).toBeCloseTo(
      Math.PI
    )
  })
})

describe("isFloorHit", () => {
  it("accepts the lowest horizontal surface well below the phone", () => {
    expect(isFloorHit({ x: 0, y: 0, z: 0 }, 1, 0, 1.4)).toBe(true)
  })
  it("rejects a table top, a wall, and anything above the known floor", () => {
    expect(isFloorHit({ x: 0, y: 0.75, z: 0 }, 1, 0.75, 1.4)).toBe(false)
    expect(isFloorHit({ x: 0, y: 0, z: 0 }, 0.1, 0, 1.4)).toBe(false)
    expect(isFloorHit({ x: 0, y: 0.3, z: 0 }, 1, 0, 1.4)).toBe(false)
  })
})

describe("footprintSamples", () => {
  it("covers each stack's footprint on the floor, in layout coordinates", () => {
    expect(samples.length).toBeGreaterThan(10)
    for (const s of samples) {
      expect(s.y).toBe(0)
      expect(s.x).toBeGreaterThanOrEqual(-1)
      expect(s.x).toBeLessThanOrEqual(0)
      expect(s.z).toBeGreaterThanOrEqual(-0.5)
      expect(s.z).toBeLessThanOrEqual(0)
    }
  })
})

describe("classifyDepth", () => {
  const atFloor = (dy = 0): Vec3[] => samples.map((s) => ({ ...s, y: dy }))

  it("is free when the whole footprint is seen as bare floor", () => {
    expect(classifyDepth(atFloor(0.02), boxes)).toBe("free")
    expect(canPlace("free")).toBe(true)
  })

  it("is blocked when something stands inside the stacks' volume", () => {
    const measured = atFloor()
    for (let i = 0; i < 4; i++) measured[i] = { ...measured[i], y: 0.5 }
    expect(classifyDepth(measured, boxes)).toBe("blocked")
    expect(canPlace("blocked")).toBe(false)
  })

  it("ignores depth noise of a centimetre or two and a single stray pixel", () => {
    const measured = atFloor(0.03)
    measured[0] = { ...measured[0], y: 0.6 }
    expect(classifyDepth(measured, boxes)).toBe("free")
  })

  it("ignores things above the stacks, like a shelf overhead", () => {
    const measured = atFloor()
    for (let i = 0; i < 4; i++) measured[i] = { ...measured[i], y: 1.6 }
    expect(classifyDepth(measured, boxes)).not.toBe("blocked")
  })

  it("reports a floor that drops away under the footprint", () => {
    const measured = atFloor()
    for (let i = 0; i < 4; i++) measured[i] = { ...measured[i], y: -0.4 }
    expect(classifyDepth(measured, boxes)).toBe("no-floor")
  })

  it("asks for a wider view when too little of the footprint is visible", () => {
    const measured = atFloor().map((p, i) => (i % 2 ? null : p))
    expect(classifyDepth(measured, boxes)).toBe("partial")
  })

  it("does not blame the spot for an object between it and the camera", () => {
    // Rays hit something in front of the footprint (outside it, at z = 1).
    const measured = samples.map((s) => ({ x: s.x, y: 0.4, z: 1 }))
    expect(classifyDepth(measured, boxes)).toBe("partial")
  })
})
