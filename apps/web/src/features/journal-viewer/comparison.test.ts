import example from "@skill-references/journal-example.json"
import { expect, test } from "vitest"
import type { ValioAimoJournal } from "./journal.types"
import {
  comparablePriceGroups,
  comparisonProducts,
  normalizedUnitPrice,
} from "./comparison"
import { purchaseFacts } from "./evidence"

const fixture = () => structuredClone(example) as ValioAimoJournal

test("includes all priced options and search-only candidates, selected first", () => {
  const rows = comparisonProducts(fixture())
  expect(rows.map((p) => p.productId)).toEqual(["464119", "464073", "464201"])
  expect(rows[0].selected).toBe(true)
  expect(rows[2].option).toBeUndefined()
  expect(rows[2].suitable).toBeNull()
})

test.each([1, 2, 25])(
  "supports %s quoted products without truncating alternatives",
  (count) => {
    const j = fixture()
    j.candidates = []
    j.quotes[0].options = Array.from({ length: count }, (_, i) => ({
      ...j.quotes[0].options[0],
      product_id: String(100 + i),
      name: `Product ${i}`,
      rank: count - i,
      chosen: i === count - 1,
      line_total: 1500 + i * 100,
      unit_price: 15 + i,
    }))
    const rows = comparisonProducts(j)
    expect(rows).toHaveLength(count)
    expect(rows[0].selected).toBe(true)
    expect(comparablePriceGroups(rows)[0].products).toHaveLength(count)
  }
)

test("ranks suitable products by price before unknown or unsuitable ones", () => {
  const j = fixture()
  const base = j.quotes[0].options[0]
  j.quotes[0].options.push(
    {
      ...base,
      product_id: "cheap",
      chosen: false,
      unit_price: 16,
      line_total: 1600,
    },
    {
      ...base,
      product_id: "unsuitable",
      chosen: false,
      meets_requirements: false,
      unit_price: 1,
      line_total: 100,
    }
  )
  const rows = comparisonProducts(j)
  expect(rows.slice(0, 3).map((p) => p.productId)).toEqual([
    "464119",
    "cheap",
    "464073",
  ])
  expect(rows.at(-1)?.productId).toBe("unsuitable")
  expect(comparablePriceGroups(rows)[0].products.at(-1)?.suitable).toBe(false)
})

test("partial availability stays off the total scale; per-litre price remains available", () => {
  const j = fixture()
  j.quotes[0].options[1].covers_request = false
  const rows = comparisonProducts(j)
  expect(comparablePriceGroups(rows)[0].products).toHaveLength(1)
  expect(
    normalizedUnitPrice(
      rows.find((p) => p.productId === "464073")?.option,
      "EUR"
    )
  ).toEqual({ value: 1.89, unit: "L", currency: "EUR" })
  expect(purchaseFacts(j).savings).toBeNull()
})

test("normalizes package prices and equivalent physical request amounts", () => {
  const j = fixture()
  expect(normalizedUnitPrice(j.quotes[0].options[0], "EUR")?.value).toBe(1.54)
  j.quotes[0].options[1].requested = "1000000 ml"
  expect(comparablePriceGroups(comparisonProducts(j))).toHaveLength(1)
  expect(purchaseFacts(j).savings).toBe(350)
  j.quotes[0].options[1].content_per_sales_unit = "500 g"
  expect(normalizedUnitPrice(j.quotes[0].options[1], "EUR")).toEqual({
    value: 3.78,
    unit: "kg",
    currency: "EUR",
  })
})

test("does not mix different quotes, requested amounts or currencies", () => {
  const j = fixture()
  j.quotes.push({
    ...structuredClone(j.quotes[0]),
    quote_id: "other",
    currency: "USD",
  })
  expect(comparablePriceGroups(comparisonProducts(j))).toHaveLength(2)
  j.quotes[0].options[1].requested = "500 L"
  expect(comparablePriceGroups(comparisonProducts(j))).toHaveLength(3)
})

test("late delivery and inconsistent prices are not promoted to suitable options", () => {
  const j = fixture()
  j.quotes[0].delivery_date = "2026-11-20"
  expect(
    comparisonProducts(j)
      .filter((p) => p.option)
      .every((p) => p.suitable === false)
  ).toBe(true)
  expect(purchaseFacts(j).savings).toBeNull()
  j.quotes[0].options[0].line_total = 1
  expect(comparablePriceGroups(comparisonProducts(j))[0].products).toHaveLength(
    1
  )
})

test("unpriced and missing-quantity records explain why comparison is unavailable", () => {
  const j = fixture()
  j.quotes[0].options.forEach((p) => {
    p.requested = null
  })
  expect(comparablePriceGroups(comparisonProducts(j))).toHaveLength(0)
  expect(comparisonProducts(j)).toHaveLength(3)
})
