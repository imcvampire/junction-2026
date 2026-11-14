import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { OrderLine, ProductView } from "@/features/orders/types"

import { StoragePlanner } from "./storage-planner"

function line(product_id: string, quantity: number, name: string): OrderLine {
  return {
    product_id,
    name,
    quantity,
    sales_unit: "KI",
    unit_price: 1,
    line_total: quantity,
    available_amount: null,
    available_date: null,
    covers_request: true,
    substitute_for: null,
    within_preferences: true,
    missing_requirements: [],
  }
}

function product(
  id: string,
  pack: ProductView["pack"]
): ProductView {
  return {
    id,
    name: id,
    brand: null,
    vendor: null,
    category: "x",
    sales_unit: "KI",
    allowed_lot_size: 1,
    content_per_sales_unit: null,
    pack,
    allergens: {},
    tags: [],
    country_of_origin: null,
    delivery_reliability: null,
    co2_kg_per_sales_unit: null,
    substitutes: [],
  }
}

const sizedPack = {
  width_mm: 400,
  length_mm: 300,
  height_mm: 200,
  gross_kg: 5,
  sales_units_per_pack: 1,
  estimated: false,
}

describe("StoragePlanner", () => {
  it("draws a stack per column and offers the AR view", () => {
    const lines = [line("A", 3, "Milk"), line("B", 2, "Flour")]
    const packs = new Map<string, ProductView | null>([
      ["A", product("A", sizedPack)],
      // 1 m tall packs -> one pack per column at the 1.8 m default -> 2 columns
      ["B", product("B", { ...sizedPack, height_mm: 1000 })],
    ])
    const { container } = render(
      <StoragePlanner lines={lines} packByProduct={packs} />
    )
    // 1 column for A + 2 columns for B = 3 draggable stacks.
    expect(container.querySelectorAll('g[role="button"]')).toHaveLength(3)
    // jsdom has no AR Quick Look, so the model-viewer (Android/desktop) path shows.
    expect(
      screen.getByRole("button", { name: /build 3d \/ ar view/i })
    ).toBeInTheDocument()
    expect(screen.getByText("Milk")).toBeInTheDocument()
    expect(screen.getByText("Flour")).toBeInTheDocument()
  })

  it("explains when no product carries dimensions", () => {
    const lines = [line("A", 3, "Milk")]
    const packs = new Map<string, ProductView | null>([["A", product("A", null)]])
    render(<StoragePlanner lines={lines} packByProduct={packs} />)
    expect(
      screen.getByText(/cannot be drawn/i)
    ).toBeInTheDocument()
  })
})
