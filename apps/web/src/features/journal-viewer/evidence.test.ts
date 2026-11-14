import example from "@skill-references/journal-example.json"
import { describe, expect, test } from "vitest"
import type { ValioAimoJournal } from "./journal.types"
import {
  approvalRequired,
  purchaseFacts,
  readableText,
  redactSecrets,
  verifyPurchase,
} from "./evidence"
import { parseJournal } from "./parse-journal"

const fixture = () => structuredClone(example) as ValioAimoJournal
const check = (j: unknown, id: string) =>
  verifyPurchase(j).find((r) => r.id.endsWith(id))

describe("purchasing evidence", () => {
  test("loads the actual example; derives 350 savings and sales-unit quantities", () => {
    const j = fixture()
    expect(parseJournal(JSON.stringify(j)).ok).toBe(true)
    expect(purchaseFacts(j)).toMatchObject({
      savings: 350,
      total: 1540,
      considered: 3,
      coverage: true,
      duration: 277,
    })
    expect(check(j, "total")?.status).toBe("Passed")
    expect(check(j, "approval")?.status).toBe("Passed")
    expect(check(j, "expiry")?.status).toBe("Cannot verify")
    expect(check(j, "timing")?.status).toBe("Passed")
  })
  test.each(["pending_approval", "rejected"] as const)(
    "supports %s without claiming completed approval",
    (status) => {
      const j = fixture()
      j.orders[0].status = status
      j.outcome = status
      if (status === "pending_approval") {
        j.orders[0].decision = null
        j.timeline = j.timeline.filter((e) => e.type !== "approval")
      } else j.orders[0].decision!.decision = "rejected"
      expect(approvalRequired(j, j.orders[0])).toBe(true)
      expect(check(j, "approval")?.status).toBe(
        status === "pending_approval" ? "Cannot verify" : "Passed"
      )
    }
  )
  test("fails over-limit approved orders without approval evidence", () => {
    const j = fixture()
    j.orders[0].decision = null
    expect(check(j, "approval")?.status).toBe("Failed")
  })
  test("a bare approved field or tool name is not sufficient proof", () => {
    const j = fixture()
    j.orders[0].decision!.confirmed_via = null
    expect(check(j, "approval")?.status).toBe("Cannot verify")
    j.orders[0].decision!.confirmed_via = "mcp_elicitation"
    j.timeline = j.timeline.filter((e) => e.type !== "approval")
    expect(check(j, "approval")?.status).toBe("Cannot verify")
  })
  test("fails contradictory decisions and order statuses", () => {
    const j = fixture()
    j.orders[0].decision!.decision = "rejected"
    expect(check(j, "approval")?.status).toBe("Failed")
  })
  test("fails altered order totals and inconsistent quoted item arithmetic", () => {
    const j = fixture()
    j.orders[0].total = 1541
    expect(check(j, "total")?.status).toBe("Failed")
    expect(purchaseFacts(j).savings).toBeNull()
    j.orders[0].total = 1540
    j.quotes[0].options[0].line_total = 1500
    expect(check(j, "total")?.status).toBe("Failed")
  })
  test("uses decision quantity and does not multiply 10L package contents into the price", () => {
    const j = fixture()
    j.decision!.chosen[0].quantity = 50
    j.orders[0].total = 770
    expect(check(j, "total")?.status).toBe("Passed")
    expect(purchaseFacts(j).savings).toBeNull()
    expect(purchaseFacts(j).coverage).toBeNull()
  })
  test("does not invent savings for ineligible or incomparable alternatives", () => {
    for (const change of [
      (j: ValioAimoJournal) => {
        j.quotes[0].options[1].meets_requirements = false
      },
      (j: ValioAimoJournal) => {
        j.quotes[0].options[1].covers_request = false
      },
      (j: ValioAimoJournal) => {
        j.quotes[0].options[1].breaks_mandate = true
      },
      (j: ValioAimoJournal) => {
        j.quotes[0].options[1].requested = "500 L"
      },
      (j: ValioAimoJournal) => {
        j.quotes[0].options[1].line_total = null
      },
    ]) {
      const j = fixture()
      change(j)
      expect(purchaseFacts(j).savings).toBeNull()
    }
  })
  test("does not convert currencies or allocate a task decision to multiple orders", () => {
    const j = fixture()
    j.orders.push({
      ...j.orders[0],
      order_id: "ord_second",
      currency: "USD",
      approval_reasons: [],
    })
    expect(purchaseFacts(j).total).toBeNull()
    expect(purchaseFacts(j).savings).toBeNull()
    expect(approvalRequired(j, j.orders[1])).toBeNull()
    expect(check(j, "total")?.status).toBe("Cannot verify")
  })
  test("handles absent order, quote, price and policy evidence", () => {
    const j = fixture()
    j.quotes[0].options[0].unit_price = null
    expect(check(j, "total")?.status).toBe("Cannot verify")
    j.orders[0].quote_id = "q_missing"
    expect(check(j, "quote")?.status).toBe("Failed")
    j.authority.spend_limit_eur = null
    j.orders[0].approval_reasons = []
    expect(check(j, "policy")?.status).toBe("Cannot verify")
    j.orders = []
    j.quotes = []
    j.candidates = []
    j.decision = null
    expect(purchaseFacts(j)).toMatchObject({
      total: null,
      savings: null,
      considered: null,
    })
    expect(check(j, "orders")?.status).toBe("Cannot verify")
  })
  test("checks quote time at local creation; detects expired and pre-creation quotes", () => {
    const j = fixture()
    const placement = j.timeline.find((e) => e.tool === "place_order")!
    placement.at = "2026-11-13T09:14:00+02:00"
    expect(check(j, "expiry")?.status).toBe("Passed")
    placement.at = j.quotes[0].expires_at
    expect(check(j, "expiry")?.status).toBe("Failed")
    placement.at = j.started_at
    expect(check(j, "expiry")?.status).toBe("Failed")
  })
  test("flags approval timestamps after completion", () => {
    const j = fixture()
    j.timeline.find((e) => e.type === "approval")!.at =
      "2026-11-13T10:00:00+02:00"
    expect(check(j, "timing")?.status).toBe("Failed")
  })
  test("checks nonempty IDs and rejects malformed structure", () => {
    expect(check({}, "structure")?.status).toBe("Failed")
    const j = fixture()
    j.agent.agent_id = " "
    expect(check(j, "identifiers")?.status).toBe("Failed")
    expect(check({ ...j, orders: null }, "structure")?.status).toBe("Failed")
  })
  test("replaces product IDs in business explanations, preserving the source", () => {
    const j = fixture()
    expect(readableText(j.narrative.why, j)).toContain(j.candidates[0].name)
    expect(j.narrative.why).toContain("464119")
  })
  test("redacts structured keys and common credentials embedded in audit strings", () => {
    const input = {
      api_key: "hidden",
      message:
        'Authorization: Bearer abc.def.ghi API_VALIO_API_KEY=challenge-key password="open sesame" sk-1234567890abc',
      nested: [{ access_token: "abc" }],
    }
    const safe = JSON.stringify(redactSecrets(input))
    for (const secret of [
      "hidden",
      "abc.def.ghi",
      "challenge-key",
      "open sesame",
      "sk-1234567890abc",
    ])
      expect(safe).not.toContain(secret)
    expect(input.api_key).toBe("hidden")
  })
})
