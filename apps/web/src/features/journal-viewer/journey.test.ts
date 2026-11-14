import example from "@skill-references/journal-example.json"
import { expect, test } from "vitest"
import { journeyEventTime, purchasingJourney } from "./journey"
import type { ValioAimoJournal } from "./journal.types"

const fixture = () => structuredClone(example) as ValioAimoJournal

test("research events remain readable in the customer journey", () => {
  const journal = fixture()
  journal.timeline.push({
    seq: 100,
    type: "research",
    title: "research_recipe",
  })
  expect(
    purchasingJourney(journal).find((step) => step.type === "research")
  ).toMatchObject({
    title: "Product Research Recorded",
    explanation: "The assistant recorded research to inform the purchase.",
  })
})

test("each missing example time inherits the latest preceding recorded time", () => {
  const j = fixture()
  const before = JSON.stringify(j)
  expect(j.timeline.map((event) => journeyEventTime(event, j).value)).toEqual([
    j.started_at,
    j.started_at,
    j.timeline[2].at,
    j.timeline[2].at,
    j.timeline[4].at,
    j.timeline[4].at,
  ])
  expect(journeyEventTime(j.timeline[3], j)).toMatchObject({
    source: "previous",
    note: "Time estimated from the previous recorded event",
  })
  expect(JSON.stringify(j)).toBe(before)
})

test("uses chronological sequence rather than array position, role or order reference", () => {
  const j = fixture()
  j.timeline.forEach((e) => {
    e.seq += 100
  })
  j.timeline.reverse()
  const report = j.timeline.find((e) => e.type === "report")!
  report.refs = { order_id: "unrelated" }
  expect(journeyEventTime(report, j)).toMatchObject({
    value: j.timeline.find((e) => e.type === "approval")!.at,
    source: "previous",
  })
  expect(purchasingJourney(j).find((e) => e.type === "authority")?.title).toBe(
    "Purchasing Permissions Checked"
  )
})

test("preserves any valid recorded time and skips invalid preceding values", () => {
  const j = fixture()
  j.timeline[5].at = "2026-11-13T09:16:30+02:00"
  expect(journeyEventTime(j.timeline[5], j)).toMatchObject({
    value: j.timeline[5].at,
    source: "recorded",
  })
  j.timeline[4].at = "not-a-date"
  j.timeline[5].at = null
  expect(journeyEventTime(j.timeline[5], j).value).toBe(j.timeline[2].at)
})

test("applies fallback to every event type and consecutive missing events", () => {
  const j = fixture()
  j.timeline.push(
    { seq: 7, type: "question", title: "Question" },
    { seq: 8, type: "answer", title: "Answer" },
    { seq: 9, type: "error", title: "Error" },
    { seq: 10, type: "cancel", title: "Cancel" }
  )
  for (const e of j.timeline.slice(5))
    expect(journeyEventTime(e, j)).toMatchObject({
      value: j.timeline[4].at,
      source: "previous",
    })
  const selection = purchasingJourney(j).find(
    (s) => s.key === "product-decision"
  )!
  expect(selection.time).toMatchObject({
    value: j.timeline[2].at,
    source: "previous",
  })
})

test("no earlier timestamp remains unavailable and later timestamps are never borrowed", () => {
  const j = fixture()
  j.started_at = "invalid"
  expect(journeyEventTime(j.timeline[0], j)).toEqual({
    source: "missing",
    note: "Time not available",
  })
  j.timeline[2].at = null
  expect(journeyEventTime(j.timeline[3], j).source).toBe("missing")
  expect(journeyEventTime(j.timeline[5], j).value).toBe(j.timeline[4].at)
})

test("business facts reflect actual totals, limits and prices; raw payloads are excluded", () => {
  const steps = purchasingJourney(fixture())
  expect(steps.find((s) => s.type === "authority")?.facts).toContainEqual([
    "Automatic purchasing limit",
    "€500.00",
  ])
  expect(
    steps.find((s) => s.title === "Purchase Recorded")?.facts
  ).toContainEqual([
    "Reason",
    "Order exceeds the automatic limit by €1,040.00.",
  ])
  expect(
    steps.find((s) => s.title === "Price and Availability Checked")?.facts
  ).toContainEqual(["Lowest suitable price", "€1,540.00"])
  expect(JSON.stringify(steps)).not.toMatch(
    /whoami|search_products|place_order|\/api\/|q_example|ord_example|agt_mcp/
  )
})

test("pending and rejected decisions do not create an approved step", () => {
  const j = fixture()
  j.orders[0].decision = null
  expect(
    purchasingJourney(j).some((s) => s.title === "Purchase Approved")
  ).toBe(false)
  j.orders[0].decision = { decision: "rejected", reason: "Not needed" }
  expect(
    purchasingJourney(j).find((s) => s.title === "Purchase Rejected")?.status
  ).toBe("failed")
})
