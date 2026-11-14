import example from "@skill-references/journal-example.json"
import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import type { ValioAimoJournal } from "./journal.types"
import { purchaseNextAction } from "./next-action"
import { purchasingJourney } from "./journey"
import { PurchaseOutcome } from "./components/dashboard"

function fixture(
  state: "pending" | "approved" | "recorded" | "rejected" | "unknown"
) {
  const journal = structuredClone(example) as ValioAimoJournal
  const order = journal.orders[0]
  order.decision = null
  if (state === "pending") order.status = "pending_approval"
  if (state === "approved") {
    order.status = "approved"
    order.decision = { decision: "approved", reason: "Buyer approved" }
  }
  if (state === "recorded") order.status = "placed"
  if (state === "rejected") {
    order.status = "rejected"
    order.decision = { decision: "rejected", reason: "Buyer declined" }
  }
  if (state === "unknown") order.status = "approved"
  journal.next_steps = ["The order is confirmed and complete"]
  return journal
}

test.each([
  ["pending", "Waiting for Buyer Approval", "status-warning"],
  ["approved", "Purchase Approved", "status-success"],
  ["recorded", "Order Recorded", "text-primary"],
  ["rejected", "Purchase Rejected", "status-error"],
  ["unknown", "Approval Outcome Unknown", "text-primary"],
] as const)(
  "%s uses recorded status and preserves the source",
  (state, title, style) => {
    const journal = fixture(state)
    const before = JSON.stringify(journal)
    render(<PurchaseOutcome journal={journal} />)
    const action = screen.getByLabelText("Next purchasing action")
    expect(action).toHaveTextContent(title)
    expect(action).toHaveClass(style)
    expect(action).not.toHaveTextContent("The order is confirmed and complete")
    purchasingJourney(journal)
    expect(JSON.stringify(journal)).toBe(before)
  }
)

test.each(["approved", "recorded", "unknown"] as const)(
  "%s does not imply wholesaler confirmation",
  (state) => {
    expect(purchaseNextAction(fixture(state)).message).toContain(
      "Confirmation from the wholesaler has not yet been verified."
    )
  }
)

test("rejection does not imply cancellation", () => {
  const action = purchaseNextAction(fixture("rejected"))
  expect(action.message).toContain("No further purchasing action is authorized")
  expect(action.message).not.toMatch(/cancelled/i)
})

test("pending action uses an amber clock", () => {
  render(<PurchaseOutcome journal={fixture("pending")} />)
  expect(
    screen
      .getByLabelText("Next purchasing action")
      .querySelector(".lucide-clock")
  ).toBeInTheDocument()
})

test("pending amount and limit come from the loaded journal", () => {
  const journal = fixture("pending")
  journal.orders[0].total = 2750
  journal.authority.spend_limit_eur = 625
  expect(purchaseNextAction(journal).message).toContain("€2,750.00")
  expect(purchaseNextAction(journal).message).toContain("€625.00")
  journal.authority.spend_limit_eur = 3000
  expect(purchaseNextAction(journal).message).not.toContain("exceeds")
  journal.authority.spend_limit_eur = null
  expect(purchaseNextAction(journal).message).not.toContain("exceeds")
  journal.orders[0].currency = "USD"
  expect(purchaseNextAction(journal).message).not.toContain("exceeds")
})

test.each([true, false])(
  "pending journey ends at awaiting approval with approval event=%s",
  (hasEvent) => {
    const journal = fixture("pending")
    if (!hasEvent)
      journal.timeline = journal.timeline.filter(
        (event) => event.type !== "approval"
      )
    const steps = purchasingJourney(journal)
    expect(steps.at(-1)).toMatchObject({
      title: "Awaiting Approval",
      time: { source: "pending", note: "Pending" },
    })
    expect(
      steps.filter((step) => step.title === "Awaiting Approval")
    ).toHaveLength(1)
    expect(
      steps.some((step) =>
        [
          "Purchase Update Shared",
          "Purchase Record Completed",
          "Purchase Approved",
        ].includes(step.title)
      )
    ).toBe(false)
  }
)

test("completed approval only shows updates and completion that are actually recorded", () => {
  const journal = fixture("approved")
  expect(
    purchasingJourney(journal).some(
      (step) => step.title === "Purchase Update Shared"
    )
  ).toBe(true)
  journal.timeline = journal.timeline.filter((event) => event.type !== "report")
  journal.finished_at = ""
  expect(
    purchasingJourney(journal).some((step) => step.type === "report")
  ).toBe(false)
})
