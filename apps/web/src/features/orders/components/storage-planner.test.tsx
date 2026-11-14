import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { OrderLine, ProductView } from "@/features/orders/types"

import { StoragePlanner } from "./storage-planner"

// The 3D view loads three.js from a CDN; keep tests offline.
vi.mock("@/features/orders/storage/ar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/orders/storage/ar")>()),
  loadThree: () => new Promise(() => {}),
  loadOrbitControls: () => new Promise(() => {}),
}))

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

function product(id: string, pack: ProductView["pack"]): ProductView {
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
  it("draws a stack per column and explains where AR works", async () => {
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
    // jsdom supports neither Quick Look nor WebXR AR, so it explains where AR works.
    expect(await screen.findByText(/ar opens on a phone/i)).toBeInTheDocument()
    expect(screen.getByText("Milk")).toBeInTheDocument()
    expect(screen.getByText("Flour")).toBeInTheDocument()
  })

  it("switches to a 3D view of the stacks", async () => {
    const lines = [line("A", 3, "Milk"), line("B", 2, "Flour")]
    const packs = new Map<string, ProductView | null>([
      ["A", product("A", sizedPack)],
      ["B", product("B", { ...sizedPack, height_mm: 1000 })],
    ])
    render(<StoragePlanner lines={lines} packByProduct={packs} />)
    expect(screen.queryByText(/loading 3d view/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("tab", { name: /3d stacks/i }))

    expect(
      screen.getByRole("img", { name: /3d storage plan: 3 stacks/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/loading 3d view/i)).toBeInTheDocument()
  })

  it("shows room sizes without float noise", () => {
    const lines = [line("A", 3, "Milk")]
    const packs = new Map<string, ProductView | null>([
      ["A", product("A", sizedPack)],
    ])
    render(<StoragePlanner lines={lines} packByProduct={packs} />)
    expect(screen.getByLabelText("Room width (m)")).toHaveValue(2.4)
  })

  it("labels small stacks with their pack count and lists heights per product", () => {
    // 1 L cartons, 7 cm square and 25 cm tall: 7 per 1.8 m stack.
    const carton = {
      ...sizedPack,
      width_mm: 70,
      length_mm: 70,
      height_mm: 250,
    }
    const lines = [line("A", 18, "Milk")]
    const packs = new Map<string, ProductView | null>([
      ["A", product("A", carton)],
    ])
    const { container } = render(
      <StoragePlanner lines={lines} packByProduct={packs} />
    )
    const labels = [...container.querySelectorAll("g[role=button] text")].map(
      (t) => t.textContent
    )
    expect(labels).toEqual(["7", "7", "4"])
    const legend = screen.getByRole("list", { name: /stack heights for milk/i })
    expect(legend).toHaveTextContent("7 high × 2 stacks")
    expect(legend).toHaveTextContent("4 high × 1 stack")
  })

  it("explains when no product carries dimensions", () => {
    const lines = [line("A", 3, "Milk")]
    const packs = new Map<string, ProductView | null>([
      ["A", product("A", null)],
    ])
    render(<StoragePlanner lines={lines} packByProduct={packs} />)
    expect(screen.getByText(/cannot be drawn/i)).toBeInTheDocument()
  })
})
