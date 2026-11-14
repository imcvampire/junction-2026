import example from "@skill-references/journal-example.json"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { expect, test } from "vitest"
import type { ValioAimoJournal } from "../journal.types"
import { JournalTimeline } from "./journal-timeline"

test("all expanded journey details stay business-facing with visible inferred times", () => {
  const j = structuredClone(example) as ValioAimoJournal
  const { container } = render(<JournalTimeline journal={j} />)
  for (const toggle of screen.getAllByText("View Details"))
    fireEvent.click(toggle)
  const journey = screen.getByRole("list", { name: "Purchase journey" })
  expect(journey).not.toHaveTextContent(
    /whoami|search_products|place_order|GET \/api|POST \/api|Event \d|Tool:|payload|q_example|ord_example/
  )
  expect(container.querySelector("pre, code")).toBeNull()
  const authority = within(journey).getByRole("listitem", {
    name: "Purchasing Permissions Checked",
  })
  expect(authority.querySelector("time")).toHaveAttribute(
    "datetime",
    j.started_at
  )
  expect(within(authority).getAllByText("Estimated time")).toHaveLength(2)
  expect(authority).toHaveTextContent("Automatic purchasing limit€500.00")
  const quote = within(journey).getByRole("listitem", {
    name: "Price and Availability Checked",
  })
  expect(quote.querySelector("time")).toHaveAttribute(
    "datetime",
    j.timeline[2].at
  )
  expect(
    within(quote).queryByText("Based on purchase request")
  ).not.toBeInTheDocument()
  const approval = within(journey).getByRole("listitem", {
    name: "Purchase Approved",
  })
  expect(approval.querySelector("time")).toHaveAttribute(
    "datetime",
    j.timeline[4].at
  )
  expect(approval).toHaveTextContent("For the gala dinner")
  const update = within(journey).getByRole("listitem", {
    name: "Purchase Update Shared",
  })
  expect(update.querySelector("time")).toHaveAttribute(
    "datetime",
    j.timeline[4].at
  )
  expect(within(update).getAllByText("Estimated time")).toHaveLength(2)
  const order = within(journey).getByRole("listitem", {
    name: "Purchase Recorded",
  })
  for (const time of order.querySelectorAll("time"))
    expect(time).toHaveAttribute("datetime", j.timeline[2].at)
  expect(
    within(order).getAllByTitle(
      "Time estimated from the previous recorded event"
    )
  ).toHaveLength(2)
  expect(update).toHaveTextContent("Order confirmationNot verified")
})
