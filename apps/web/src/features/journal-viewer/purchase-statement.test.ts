import example from "@skill-references/journal-example.json"
import { expect, test } from "vitest"
import type { ValioAimoJournal } from "./journal.types"
import { purchaseStatement } from "./purchase-statement"

const fixture = () => structuredClone(example) as ValioAimoJournal
test("statement uses actual selected quantities, matching unit prices and recorded totals", () => {
  const j = fixture(),
    before = JSON.stringify(j)
  const statement = purchaseStatement(j, new Date("2026-11-14T10:00:00Z"))
  expect(statement.references).toBe("ord_example")
  expect(statement.customer).toBe("example-customer")
  expect(statement.orders[0].rows).toEqual([
    [
      j.candidates[0].name,
      expect.stringMatching(/100 cases.*1[\s,]000 L/),
      "€15.40 / case",
      "€1,540.00",
    ],
  ])
  expect(statement.orders[0].totals).toEqual([
    ["Total excluding VAT", "€1,540.00"],
  ])
  expect(statement.orders[0].orderDate).toBe("Not available")
  expect(statement.notes.join(" ")).toContain(
    "Wholesaler confirmation: Not verified"
  )
  expect(JSON.stringify(j)).toBe(before)
})

test("tax values are printed only when explicitly recorded, including zero", () => {
  const j = fixture()
  Object.assign(j.orders[0], { vat_amount: 0, total_incl_vat: 1540 })
  expect(purchaseStatement(j).orders[0].totals).toContainEqual([
    "VAT amount (recorded)",
    "€0.00",
  ])
  expect(purchaseStatement(j).orders[0].totals).toContainEqual([
    "Total including VAT (recorded)",
    "€1,540.00",
  ])
})

test("multiple chosen products in one order retain their individual prices", () => {
  const j = fixture()
  j.decision!.chosen.push({ product_id: "464073", quantity: 1000 })
  j.orders[0].total = 3430
  const rows = purchaseStatement(j).orders[0].rows
  expect(rows).toHaveLength(2)
  expect(rows.map((row) => row[3])).toEqual(["€1,540.00", "€1,890.00"])
})

test("multiple orders do not receive invented line allocations or mixed-currency totals", () => {
  const j = fixture()
  j.orders.push({ ...j.orders[0], order_id: "second-order", currency: "USD" })
  const orders = purchaseStatement(j).orders
  expect(orders).toHaveLength(2)
  expect(orders[0].rows[0][0]).toContain(
    "allocation for this order is not recorded"
  )
  expect(orders[1].totals[0][1]).toContain("1,540.00")
})

test.each(["approved", "pending_approval", "rejected"] as const)(
  "preserves %s without asserting supplier confirmation",
  (status) => {
    const j = fixture()
    j.orders[0].status = status
    const statement = purchaseStatement(j)
    expect(statement.status).not.toMatch(/Confirmed|Delivered/)
    expect(statement.notes.join(" ")).toContain("Not verified")
  }
)

test("does not use estimated timeline dates or unreconciled quote prices", () => {
  const j = fixture()
  j.orders[0].total = 99
  const statement = purchaseStatement(j)
  expect(statement.orders[0].rows[0].slice(2)).toEqual([
    "Not available",
    "Not available",
  ])
  expect(statement.orders[0].totals[0][1]).toBe("€99.00")
  const placement = j.timeline.find((event) => event.tool === "place_order")!
  placement.at = "2026-11-13T09:14:00+02:00"
  expect(purchaseStatement(j).orders[0].orderDate).toMatch(/\b0?9[.:]14\b/)
})

test("missing orders and acceptance are explicitly unavailable, never inferred", () => {
  const j = fixture()
  j.orders = []
  j.decision = null
  const statement = purchaseStatement(j)
  expect(statement.references).toBe("Not available")
  expect(statement.orders).toHaveLength(0)
  expect(statement.summary).toContainEqual([
    "Accepted delivery risks",
    "Not explicitly recorded",
  ])
})
