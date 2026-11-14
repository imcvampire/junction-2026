import example from "@skill-references/journal-example.json"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { expect, test } from "vitest"
import { purchasingJourney, journeyEventTime } from "./journey"
import { purchaseDisplayStatus } from "./evidence"
import type { ValioAimoJournal } from "./journal.types"
import { JournalTimeline } from "./components/journal-timeline"
import { PurchaseOutcome } from "./components/dashboard"

const fixture = () => structuredClone(example) as ValioAimoJournal
function pending() {
  const j = fixture()
  j.orders[0].status = "pending_approval"
  j.orders[0].decision = null
  j.outcome = "pending_approval"
  return j
}

test("recorded order activity with missing time inherits a previous actual time", () => {
  const j = fixture()
  j.orders[0].status = "placed"
  j.orders[0].approval_reasons = []
  j.orders[0].decision = null
  const order = purchasingJourney(j).find(
    (s) => s.title === "Purchase Recorded"
  )!
  expect(order.time).toMatchObject({
    value: j.timeline[2].at,
    source: "previous",
  })
})

test("completed approval with missing time is estimated, but a pending decision is not", () => {
  const j = fixture()
  j.timeline[4].at = null
  expect(
    purchasingJourney(j).find((s) => s.title === "Purchase Approved")?.time
  ).toMatchObject({ value: j.timeline[2].at, source: "previous" })
  j.orders[0].status = "pending_approval"
  j.orders[0].decision = null
  expect(
    purchasingJourney(j).find((s) => s.title === "Awaiting Approval")?.time
  ).toEqual({ source: "pending", note: "Pending" })
})

test("approval request can have an estimated time while its decision is still pending", () => {
  const j = pending(),
    before = JSON.stringify(j)
  const steps = purchasingJourney(j)
  expect(
    steps.find((s) => s.title === "Approval Requested")?.time
  ).toMatchObject({ value: j.timeline[2].at, source: "previous" })
  expect(steps.find((s) => s.title === "Awaiting Approval")).toMatchObject({
    status: "attention",
    time: { source: "pending", note: "Pending" },
  })
  expect(steps.some((s) => s.title === "Purchase Approved")).toBe(false)
  expect(JSON.stringify(j)).toBe(before)
})

test("pending order still shows an outstanding decision without an approval activity event", () => {
  const j = pending()
  j.timeline = j.timeline.filter((e) => e.type !== "approval")
  expect(
    purchasingJourney(j).filter((s) => s.title === "Awaiting Approval")
  ).toHaveLength(1)
  expect(
    purchasingJourney(j).find((s) => s.title === "Awaiting Approval")?.time
      .value
  ).toBeUndefined()
})

test("unknown decision outcome has no completion time, even if the interaction was timestamped", () => {
  const j = fixture()
  j.orders[0].decision = null
  const step = purchasingJourney(j).find(
    (s) => s.title === "Approval Decision Not Recorded"
  )!
  expect(step.time).toEqual({
    source: "unknown",
    note: "Pending / Outcome Unknown",
  })
  expect(step.status).toBe("attention")
  expect(journeyEventTime(j.timeline[4], j).value).toBeUndefined()
  expect(j.timeline[4].at).toBe(example.timeline[4].at)
  expect(purchaseDisplayStatus(j)).toBe("approval_unknown")
})

test("rejection preserves its actual decision time and completion does not resolve pending approval", () => {
  const j = fixture()
  j.orders[0].status = "rejected"
  j.orders[0].decision!.decision = "rejected"
  expect(
    purchasingJourney(j).find((s) => s.title === "Purchase Rejected")?.time
  ).toMatchObject({ value: j.timeline[4].at, source: "recorded" })
  expect(purchaseDisplayStatus(j)).toBe("approval_rejected")
  const outstanding = pending()
  expect(
    purchasingJourney(outstanding).find(
      (s) => s.title === "Purchase Record Completed"
    )?.time
  ).toBeUndefined()
  expect(purchaseDisplayStatus(outstanding)).toBe("pending_approval")
})

test("a recorded approval decision takes precedence over a stale order status", () => {
  const j = fixture()
  j.orders[0].status = "pending_approval"
  expect(purchaseDisplayStatus(j)).toBe("approved")
  expect(purchasingJourney(j).find((s) => s.type === "order")?.title).toBe(
    "Purchase Recorded"
  )
})

test("does not claim task completion when finished_at is absent", () => {
  const j = fixture()
  j.finished_at = ""
  expect(
    purchasingJourney(j).some((s) => s.title === "Purchase Record Completed")
  ).toBe(false)
})

test("consecutive completed events keep a consistent fallback across unresolved activities", () => {
  const j = fixture()
  j.timeline[3].at = null
  j.timeline[4].at = null
  j.timeline[5].at = null
  for (const e of j.timeline.slice(3))
    expect(journeyEventTime(e, j)).toMatchObject({
      value: j.timeline[2].at,
      source: "previous",
    })
})

test("expanded and collapsed pending steps use amber clocks and no estimated completion time", () => {
  render(<JournalTimeline journal={pending()} />)
  const step = screen.getByRole("listitem", { name: "Awaiting Approval" })
  fireEvent.click(within(step).getByText("View Details"))
  expect(within(step).getAllByText("Pending")).toHaveLength(2)
  expect(step.querySelector("time")).toBeNull()
  expect(within(step).queryByText("Estimated time")).not.toBeInTheDocument()
  expect(
    step.querySelector(".journey-attention .lucide-clock")
  ).toBeInTheDocument()
  expect(step.querySelector(".journey-complete")).toBeNull()
})

test("main badge cannot imply approval without a recorded decision", () => {
  const j = fixture()
  j.orders[0].decision = null
  render(<PurchaseOutcome journal={j} />)
  expect(screen.getAllByText("Approval Outcome Unknown")[0]).toHaveClass(
    "status-warning"
  )
  expect(screen.queryByText("Purchase Approved")).not.toBeInTheDocument()
})
