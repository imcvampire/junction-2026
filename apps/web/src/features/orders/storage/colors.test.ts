import { describe, expect, it } from "vitest"

import { colorHex, stackColors } from "@/features/orders/storage/colors"

const stack = (id: string, lineIndex: number, packsInColumn: number) => ({
  id,
  lineIndex,
  packsInColumn,
})

describe("stackColors", () => {
  it("gives the tallest stacks the product colour and shorter ones lighter tints", () => {
    const colors = stackColors([
      stack("a", 0, 8),
      stack("b", 0, 8),
      stack("c", 0, 7),
      stack("d", 0, 4),
    ])
    expect(colors.get("a")?.hex).toBe(colorHex(0))
    expect(colors.get("b")?.hex).toBe(colorHex(0))
    const shades = ["a", "c", "d"].map((id) => colors.get(id)?.hex)
    expect(new Set(shades).size).toBe(3)
    // Lighter as stacks get shorter: the green channel rises towards white.
    const green = (hex = 0) => (hex >> 8) & 0xff
    expect(green(shades[1])).toBeGreaterThan(green(shades[0]))
    expect(green(shades[2])).toBeGreaterThan(green(shades[1]))
  })

  it("keeps products apart: each product shades its own hue", () => {
    const colors = stackColors([stack("a", 0, 5), stack("b", 1, 5)])
    expect(colors.get("a")?.hex).toBe(colorHex(0))
    expect(colors.get("b")?.hex).toBe(colorHex(1))
  })

  it("picks a label colour that stays readable on light tints", () => {
    const colors = stackColors([stack("a", 0, 8), stack("b", 0, 1)])
    expect(colors.get("a")?.text).toBe("#ffffff")
    expect(colors.get("b")?.text).toBe("#0f172a")
  })
})
