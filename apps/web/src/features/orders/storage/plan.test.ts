import { describe, expect, it } from "vitest"

import type { OrderLine, PackView } from "@/features/orders/types"

import {
  buildBlocks,
  fitReport,
  packRow,
  planSummary,
  recommendedRoom,
  recommendLayout,
  storageItems,
} from "./plan"

function line(partial: Partial<OrderLine> & { product_id: string }): OrderLine {
  return {
    name: partial.product_id,
    quantity: 1,
    sales_unit: "KI",
    unit_price: 1,
    line_total: 1,
    available_amount: null,
    available_date: null,
    covers_request: true,
    substitute_for: null,
    within_preferences: true,
    missing_requirements: [],
    ...partial,
  }
}

function pack(partial: Partial<PackView> = {}): PackView {
  return {
    width_mm: 400,
    length_mm: 300,
    height_mm: 200,
    gross_kg: 5,
    sales_units_per_pack: 1,
    estimated: false,
    ...partial,
  }
}

describe("storageItems", () => {
  it("derives pack count from quantity and sales units per pack", () => {
    const items = storageItems(
      [line({ product_id: "A", quantity: 10 })],
      new Map([["A", pack({ sales_units_per_pack: 4 })]])
    )
    expect(items[0].packs).toBe(3) // ceil(10 / 4)
    expect(items[0].box).toEqual({ w: 0.4, d: 0.3, h: 0.2 })
  })

  it("marks a line with no pack as unsized", () => {
    const items = storageItems(
      [line({ product_id: "B" })],
      new Map([["B", null]])
    )
    expect(items[0].box).toBeNull()
    expect(items[0].packs).toBe(0)
  })
})

describe("buildBlocks", () => {
  it("splits packs into columns that respect the stack height", () => {
    const items = storageItems(
      [line({ product_id: "A", quantity: 10 })],
      // 0.2 m tall packs, 0.5 m stack -> 2 packs per column -> 5 columns
      new Map([["A", pack({ height_mm: 200 })]])
    )
    const blocks = buildBlocks(items, 0.5)
    expect(blocks).toHaveLength(5)
    expect(blocks[0].h).toBeCloseTo(0.4) // 2 packs * 0.2
    expect(blocks.at(-1)?.packsInColumn).toBe(10 - 4 * 2)
  })

  it("skips unsized items", () => {
    const items = storageItems(
      [line({ product_id: "B" })],
      new Map([["B", null]])
    )
    expect(buildBlocks(items)).toHaveLength(0)
  })
})

describe("packRow", () => {
  it("wraps to a new row when the width is exceeded", () => {
    const items = storageItems(
      [line({ product_id: "A", quantity: 3 })],
      new Map([
        [
          "A",
          pack({ width_mm: 1000, length_mm: 1000, sales_units_per_pack: 1 }),
        ],
      ])
    )
    const blocks = buildBlocks(items, 0.2) // 3 columns, each 1 m wide
    const placed = packRow(blocks, 2.4, 0) // two fit per 2.4 m row
    const rows = new Set(placed.map((b) => b.z))
    expect(rows.size).toBe(2)
  })

  it("places stacks flush against each other by default", () => {
    const items = storageItems(
      [line({ product_id: "A", quantity: 3 })],
      new Map([
        [
          "A",
          pack({ width_mm: 1000, length_mm: 1000, sales_units_per_pack: 1 }),
        ],
      ])
    )
    const placed = packRow(buildBlocks(items, 0.2), 2.4)
    expect(placed.map((b) => [b.x, b.z])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
    ])
  })
})

describe("fitReport", () => {
  const items = storageItems(
    [line({ product_id: "A" })],
    new Map([["A", pack({ width_mm: 1000, length_mm: 1000, height_mm: 1000 })]])
  )
  const blocks = buildBlocks(items, 1)

  it("flags a block that pokes outside the room", () => {
    const report = fitReport(blocks, { width: 0.5, depth: 2, height: 2 })
    expect(report.fits).toBe(false)
    expect(report.overflow.has(blocks[0].id)).toBe(true)
  })

  it("passes when everything is inside", () => {
    const report = fitReport(blocks, { width: 2, depth: 2, height: 2 })
    expect(report.fits).toBe(true)
  })

  it("detects overlapping blocks", () => {
    const two = [
      { ...blocks[0], id: "x", x: 0, z: 0 },
      { ...blocks[0], id: "y", x: 0.2, z: 0.2 },
    ]
    const report = fitReport(two, { width: 5, depth: 5, height: 5 })
    expect(report.overlapping.has("x")).toBe(true)
    expect(report.overlapping.has("y")).toBe(true)
  })
})

describe("recommendedRoom and recommendLayout", () => {
  const items = storageItems(
    [line({ product_id: "A", quantity: 6 })],
    new Map([["A", pack()]])
  )

  it("recommends a room that the recommended layout fits inside", () => {
    const room = recommendedRoom(items)
    const layout = recommendLayout(items, room)
    expect(fitReport(layout, room).fits).toBe(true)
  })
})

describe("planSummary", () => {
  it("totals packs, volume and weight across sized lines", () => {
    const items = storageItems(
      [
        line({ product_id: "A", quantity: 2 }),
        line({ product_id: "B" }), // unsized
      ],
      new Map([
        ["A", pack({ gross_kg: 5 })],
        ["B", null],
      ])
    )
    const summary = planSummary(items, buildBlocks(items))
    expect(summary.totalPacks).toBe(2)
    expect(summary.sizedLines).toBe(1)
    expect(summary.unsizedLines).toBe(1)
    expect(summary.totalGrossKg).toBeCloseTo(10)
  })

  it("reports unknown weight when a sized line lacks gross weight", () => {
    const items = storageItems(
      [line({ product_id: "A" })],
      new Map([["A", pack({ gross_kg: null })]])
    )
    expect(planSummary(items, buildBlocks(items)).totalGrossKg).toBeNull()
  })
})
