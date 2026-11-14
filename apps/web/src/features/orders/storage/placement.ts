// Geometry for placing the storage plan in AR, free of three.js and WebXR so it
// can be unit-tested. Coordinates are the layout's local frame from buildLayout:
// metres, room centred on the origin, floor at y = 0, +z is the plan's front
// edge (the bottom of the top-down plan).

import type { Block, Room } from "@/features/orders/storage/plan"

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type PlacementStatus =
  | "searching" // no floor under the reticle yet
  | "partial" // the camera cannot see enough of the footprint to judge it
  | "blocked" // something already stands where the stacks would go
  | "no-floor" // the floor does not continue under the whole footprint
  | "free" // the whole footprint is visible, flat and empty
  | "unchecked" // floor found, but this device cannot measure depth

// Depth from phone sensors is noisy by a few centimetres at storeroom range,
// so anything lower than this is treated as floor, not an obstacle.
export const OBSTACLE_MIN_HEIGHT_M = 0.08
export const FLOOR_DROP_M = 0.12
// A phone held by someone standing is well over this above the floor, while a
// table or shelf top is closer; this keeps the plan off furniture.
export const MIN_FLOOR_BELOW_VIEWER_M = 0.9
const BLOCK_MARGIN_M = 0.02
const SAMPLE_SPACING_M = 0.15
const MAX_SAMPLES = 360
// Fraction of footprint samples that must be seen as bare floor.
const MIN_COVERAGE = 0.7
// Samples that must agree before reporting an obstacle or a drop, to ride out
// single-pixel depth noise.
const MIN_HITS = 3

/** Yaw (about +y) that turns the plan's front edge (+z) towards the viewer. */
export function facingYaw(target: Vec3, viewer: Vec3): number {
  return Math.atan2(viewer.x - target.x, viewer.z - target.z)
}

/**
 * A hit counts as floor when it is a horizontal surface, close to the lowest
 * horizontal surface seen so far, and well below the phone (not a table top).
 */
export function isFloorHit(
  hit: Vec3,
  upY: number,
  lowestY: number,
  viewerY: number
): boolean {
  return (
    upY > 0.9 &&
    hit.y <= lowestY + 0.1 &&
    viewerY - hit.y > MIN_FLOOR_BELOW_VIEWER_M
  )
}

interface FootprintBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  h: number
}

export function footprintBoxes(blocks: Block[], room: Room): FootprintBox[] {
  const ox = -room.width / 2
  const oz = -room.depth / 2
  return blocks.map((b) => ({
    minX: ox + b.x,
    maxX: ox + b.x + b.w,
    minZ: oz + b.z,
    maxZ: oz + b.z + b.d,
    h: b.h,
  }))
}

/** Floor points (y = 0) spread over every stack's footprint. */
export function footprintSamples(blocks: Block[], room: Room): Vec3[] {
  const boxes = footprintBoxes(blocks, room)
  const area = boxes.reduce(
    (a, b) => a + (b.maxX - b.minX) * (b.maxZ - b.minZ),
    0
  )
  const spacing = Math.max(SAMPLE_SPACING_M, Math.sqrt(area / MAX_SAMPLES))
  const points: Vec3[] = []
  for (const b of boxes) {
    const nx = Math.max(1, Math.round((b.maxX - b.minX) / spacing))
    const nz = Math.max(1, Math.round((b.maxZ - b.minZ) / spacing))
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        points.push({
          x: b.minX + ((i + 0.5) * (b.maxX - b.minX)) / nx,
          y: 0,
          z: b.minZ + ((k + 0.5) * (b.maxZ - b.minZ)) / nz,
        })
      }
    }
  }
  return points
}

function insideFootprint(p: Vec3, b: FootprintBox, margin: number): boolean {
  return (
    p.x >= b.minX - margin &&
    p.x <= b.maxX + margin &&
    p.z >= b.minZ - margin &&
    p.z <= b.maxZ + margin
  )
}

/**
 * Judge the footprint from depth measurements. `measured[i]` is where the
 * camera's ray towards sample i actually met the world, in layout-local
 * coordinates, or null when sample i was off-screen or had no depth.
 *
 * A measured point inside a stack's volume means an obstacle; one below the
 * floor inside a footprint means the floor ends; one at floor level inside a
 * footprint confirms that spot. A point outside every footprint is something
 * between the camera and the spot: it neither blocks nor confirms.
 */
export function classifyDepth(
  measured: (Vec3 | null)[],
  boxes: FootprintBox[]
): PlacementStatus {
  let blocked = 0
  let drops = 0
  let confirmed = 0
  for (const p of measured) {
    if (!p) continue
    const over = boxes.filter((b) => insideFootprint(p, b, BLOCK_MARGIN_M))
    if (over.length === 0) continue
    if (
      p.y > OBSTACLE_MIN_HEIGHT_M &&
      over.some((b) => p.y < b.h + BLOCK_MARGIN_M)
    ) {
      blocked++
    } else if (p.y < -FLOOR_DROP_M) {
      drops++
    } else if (Math.abs(p.y) <= OBSTACLE_MIN_HEIGHT_M) {
      confirmed++
    }
  }
  if (blocked >= MIN_HITS) return "blocked"
  if (drops >= MIN_HITS) return "no-floor"
  if (measured.length > 0 && confirmed >= measured.length * MIN_COVERAGE) {
    return "free"
  }
  return "partial"
}

export function canPlace(status: PlacementStatus): boolean {
  return status === "free" || status === "unchecked"
}
