// Storage planning, in metres. Pure functions: turn an order's lines plus their
// pack dimensions into true-scale stacks ("blocks") arranged on a storeroom
// floor, recommend a room and a layout, and report whether it all fits.
//
// A line becomes one or more columns: packs stacked to a maximum height. Each
// column is a Block placed on the floor at (x, z), the min corner, y is up.

import type { OrderLine, PackView } from "@/features/orders/types"

const EPS = 1e-6

export interface Box {
  w: number // width  (m, along x)
  d: number // depth  (m, along z) — the pack's "length"
  h: number // height (m, along y)
}

export interface Room {
  width: number
  depth: number
  height: number
}

export interface StorageItem {
  lineIndex: number
  productId: string
  name: string
  packs: number
  box: Box | null // null when the product carries no dimensions
  estimated: boolean // dimensions are a backend estimate, not measured
  grossKg: number | null // per pack
}

export interface Block {
  id: string
  lineIndex: number
  productId: string
  name: string
  packsInColumn: number
  x: number
  z: number
  w: number
  d: number
  h: number
}

export interface FitReport {
  fits: boolean
  overflow: Set<string> // ids outside the room
  overlapping: Set<string> // ids overlapping another block on the floor
  usedFloorArea: number // bounding-box footprint of placed blocks (m²)
  roomFloorArea: number
  utilisation: number // 0..1, used floor over room floor
}

export interface PlanSummary {
  totalPacks: number
  totalColumns: number
  totalVolumeM3: number
  totalGrossKg: number | null
  sizedLines: number
  unsizedLines: number
}

export const DEFAULT_MAX_STACK_M = 1.8
// Stacks stand flush against each other, as packs are stored in practice.
const DEFAULT_GAP_M = 0
const RECOMMENDED_WIDTH_M = 2.4

function packs(line: OrderLine, pack: PackView): number {
  const per = pack.sales_units_per_pack > 0 ? pack.sales_units_per_pack : 1
  return Math.max(1, Math.ceil(line.quantity / per - EPS))
}

function boxOf(pack: PackView): Box {
  return {
    w: pack.width_mm / 1000,
    d: pack.length_mm / 1000,
    h: pack.height_mm / 1000,
  }
}

/** Derive a StorageItem per order line from its pack (or null when unsized). */
export function storageItems(
  lines: OrderLine[],
  packByProduct: Map<string, PackView | null>
): StorageItem[] {
  return lines.map((line, lineIndex) => {
    const pack = packByProduct.get(line.product_id) ?? null
    return {
      lineIndex,
      productId: line.product_id,
      name: line.name,
      packs: pack ? packs(line, pack) : 0,
      box: pack ? boxOf(pack) : null,
      estimated: pack?.estimated ?? false,
      grossKg: pack?.gross_kg ?? null,
    }
  })
}

/** How many packs stack in one column at the given height limit. */
function perColumn(box: Box, maxStackM: number): number {
  return Math.max(1, Math.floor((maxStackM + EPS) / box.h) || 1)
}

/** Expand sized items into unpositioned column blocks. */
export function buildBlocks(
  items: StorageItem[],
  maxStackM: number = DEFAULT_MAX_STACK_M
): Block[] {
  const blocks: Block[] = []
  for (const item of items) {
    if (!item.box || item.packs <= 0) continue
    const cap = perColumn(item.box, maxStackM)
    const columns = Math.ceil(item.packs / cap)
    for (let c = 0; c < columns; c++) {
      const inColumn = Math.min(cap, item.packs - c * cap)
      blocks.push({
        id: `${item.lineIndex}-${c}`,
        lineIndex: item.lineIndex,
        productId: item.productId,
        name: item.name,
        packsInColumn: inColumn,
        x: 0,
        z: 0,
        w: item.box.w,
        d: item.box.d,
        h: inColumn * item.box.h,
      })
    }
  }
  return blocks
}

/** Row-pack blocks left-to-right across the width, wrapping along the depth. */
export function packRow(
  blocks: Block[],
  roomWidth: number,
  gap: number = DEFAULT_GAP_M
): Block[] {
  const sorted = [...blocks].sort((a, b) => b.w * b.d - a.w * a.d)
  const placed: Block[] = []
  let x = 0
  let z = 0
  let rowDepth = 0
  for (const b of sorted) {
    if (x > 0 && x + b.w > roomWidth + EPS) {
      z += rowDepth + gap
      x = 0
      rowDepth = 0
    }
    placed.push({ ...b, x, z })
    x += b.w + gap
    rowDepth = Math.max(rowDepth, b.d)
  }
  return placed
}

function ceilTo(value: number, step: number): number {
  return Math.ceil((value - EPS) / step) * step
}

/** Suggest a storeroom that comfortably holds the recommended layout. */
export function recommendedRoom(
  items: StorageItem[],
  maxStackM: number = DEFAULT_MAX_STACK_M
): Room {
  const blocks = buildBlocks(items, maxStackM)
  if (blocks.length === 0) return { width: RECOMMENDED_WIDTH_M, depth: 1.2, height: 2.2 }
  const widest = Math.max(...blocks.map((b) => b.w))
  const width = Math.max(RECOMMENDED_WIDTH_M, ceilTo(widest, 0.1))
  const laid = packRow(blocks, width)
  const depth = Math.max(...laid.map((b) => b.z + b.d))
  const tallest = Math.max(...blocks.map((b) => b.h))
  return {
    width,
    depth: ceilTo(depth + 0.1, 0.1),
    height: Math.max(2.2, ceilTo(tallest + 0.1, 0.1)),
  }
}

/** The recommended starting layout for a room. */
export function recommendLayout(
  items: StorageItem[],
  room: Room,
  maxStackM: number = DEFAULT_MAX_STACK_M
): Block[] {
  return packRow(buildBlocks(items, maxStackM), room.width)
}

function overlaps(a: Block, b: Block): boolean {
  return (
    a.x < b.x + b.w - EPS &&
    b.x < a.x + a.w - EPS &&
    a.z < b.z + b.d - EPS &&
    b.z < a.z + a.d - EPS
  )
}

export function fitReport(blocks: Block[], room: Room): FitReport {
  const overflow = new Set<string>()
  const overlapping = new Set<string>()
  for (const b of blocks) {
    if (
      b.x < -EPS ||
      b.z < -EPS ||
      b.x + b.w > room.width + EPS ||
      b.z + b.d > room.depth + EPS ||
      b.h > room.height + EPS
    ) {
      overflow.add(b.id)
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (overlaps(blocks[i], blocks[j])) {
        overlapping.add(blocks[i].id)
        overlapping.add(blocks[j].id)
      }
    }
  }
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const b of blocks) {
    minX = Math.min(minX, b.x)
    minZ = Math.min(minZ, b.z)
    maxX = Math.max(maxX, b.x + b.w)
    maxZ = Math.max(maxZ, b.z + b.d)
  }
  const usedFloorArea =
    blocks.length === 0 ? 0 : (maxX - minX) * (maxZ - minZ)
  const roomFloorArea = room.width * room.depth
  return {
    fits: overflow.size === 0 && overlapping.size === 0,
    overflow,
    overlapping,
    usedFloorArea,
    roomFloorArea,
    utilisation: roomFloorArea > 0 ? usedFloorArea / roomFloorArea : 0,
  }
}

export function planSummary(items: StorageItem[], blocks: Block[]): PlanSummary {
  let totalPacks = 0
  let totalVolumeM3 = 0
  let totalGrossKg = 0
  let grossKnown = true
  let sized = 0
  let unsized = 0
  for (const item of items) {
    if (item.box && item.packs > 0) {
      sized++
      totalPacks += item.packs
      totalVolumeM3 += item.packs * item.box.w * item.box.d * item.box.h
      if (item.grossKg === null) grossKnown = false
      else totalGrossKg += item.packs * item.grossKg
    } else {
      unsized++
    }
  }
  return {
    totalPacks,
    totalColumns: blocks.length,
    totalVolumeM3,
    totalGrossKg: grossKnown && sized > 0 ? totalGrossKg : null,
    sizedLines: sized,
    unsizedLines: unsized,
  }
}
