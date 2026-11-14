import example from "@skill-references/journal-example.json"
import { expect, test } from "vitest"
import type { ValioAimoJournal } from "./journal.types"
import { purchaseSafetyChecks } from "./safety-checks"
import { businessText, quantityLabel } from "./evidence"

const fixture = () => structuredClone(example) as ValioAimoJournal
const result = (j: ValioAimoJournal, id: string) =>
  purchaseSafetyChecks(j).find((r) => r.id === id)

test("example checks pass only for evidenced stages; wholesaler remains unverified", () => {
  const j = fixture()
  for (const id of [
    "requirements",
    "price",
    "quantity",
    "delivery",
    "limits",
    "approval",
  ])
    expect(result(j, id)?.status).toBe("Passed")
  expect(result(j, "confirmation")?.status).toBe("Cannot verify")
  expect(JSON.stringify(purchaseSafetyChecks(j))).not.toMatch(
    /agt_mcp|q_example|ord_example|mcp_elicitation/
  )
})

test("pending and rejected approvals are never presented as passed", () => {
  const j = fixture()
  j.orders[0].status = "pending_approval"
  j.orders[0].decision = null
  expect(result(j, "approval")?.status).toBe("Needs attention")
  expect(result(j, "limits")?.status).toBe("Needs attention")
  j.orders[0].status = "rejected"
  j.orders[0].decision = { decision: "rejected", reason: "Declined" }
  expect(result(j, "approval")?.status).toBe("Needs attention")
  expect(result(j, "confirmation")?.status).toBe("Cannot verify")
})

test("flags invalid prices, late delivery, unavailable quantity and missing mandatory approval", () => {
  const j = fixture()
  j.orders[0].total = 1550
  expect(result(j, "price")?.status).toBe("Failed")
  j.quotes[0].delivery_date = "2026-11-18"
  expect(result(j, "delivery")?.status).toBe("Failed")
  j.quotes[0].options[0].covers_request = false
  expect(result(j, "quantity")?.status).toBe("Failed")
  j.orders[0].decision = null
  expect(result(j, "limits")?.status).toBe("Failed")
})

test("missing data remains unverified, including a bare approved status", () => {
  const j = fixture()
  j.orders[0].decision!.confirmed_via = null
  expect(result(j, "approval")?.status).toBe("Cannot verify")
  j.orders = []
  j.quotes = []
  j.decision = null
  for (const id of [
    "price",
    "quantity",
    "delivery",
    "limits",
    "approval",
    "confirmation",
  ])
    expect(result(j, id)?.status).toBe("Cannot verify")
})

test("a within-limit order requires no approval; mixed currencies are not converted", () => {
  const j = fixture()
  j.authority.spend_limit_eur = 2000
  j.orders[0].approval_reasons = []
  j.orders[0].decision = null
  j.orders[0].status = "placed"
  expect(result(j, "approval")).toBeUndefined()
  expect(result(j, "limits")?.status).toBe("Passed")
  j.orders[0].currency = "USD"
  expect(result(j, "limits")?.status).toBe("Cannot verify")
})

test("package display uses explicit contents and selected package quantity", () => {
  const j = fixture()
  expect(quantityLabel(j.quotes[0].options[0])).toMatch(/1[\s,]000 L/)
  expect(quantityLabel(j.quotes[0].options[0], 50)).toBe("500 L")
  j.quotes[0].options[0].content_per_sales_unit = "unstructured package"
  expect(quantityLabel(j.quotes[0].options[0])).toBe("100 cases")
  expect(quantityLabel(undefined)).toBe("Not available")
})

test("business explanations replace known identifiers without modifying original data", () => {
  const j = fixture()
  const text =
    "agt_mcp selected 464119 from q_example for ord_example via mcp_elicitation"
  expect(businessText(text, j)).not.toMatch(
    /agt_mcp|464119|q_example|ord_example|mcp_elicitation/
  )
  expect(j.agent.agent_id).toBe("agt_mcp")
})

test("disclosed delivery risk stays visible even when the offered date meets the request", () => {
  const j = fixture()
  j.narrative.watch_out =
    "Delivery is at risk because the date is not guaranteed."
  expect(result(j, "delivery")?.status).toBe("Needs attention")
  expect(result(j, "delivery")?.detail).toContain(j.narrative.watch_out)
  expect(result(j, "timing")?.detail).toBe(
    "Order timing could not be fully verified."
  )
})
