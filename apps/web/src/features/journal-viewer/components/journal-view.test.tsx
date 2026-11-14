import example from "@skill-references/journal-example.json"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, test } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

import type { ValioAimoJournal } from "../journal.types"
import { parseJournal } from "../parse-journal"
import { JournalView } from "./journal-view"

function loadExample(change?: (journal: ValioAimoJournal) => void) {
  const result = parseJournal(JSON.stringify(example))
  if (!result.ok) throw new Error("the skill's example journal must parse")
  change?.(result.journal)
  return result.journal
}

function renderJournal(journal: ValioAimoJournal) {
  return render(
    <TooltipProvider>
      <JournalView journal={journal} />
    </TooltipProvider>
  )
}

describe("JournalView", () => {
  test("renders every section of the example journal", () => {
    renderJournal(loadExample())

    expect(
      screen.getByRole("heading", { name: example.title })
    ).toBeInTheDocument()
    for (const section of [
      "What happened",
      "Timeline",
      "Request and authority",
      "Quotes and decision",
      "Buyer questions",
      "Orders",
    ]) {
      expect(screen.getByRole("heading", { name: section })).toBeInTheDocument()
    }
    expect(screen.getByText(example.request.text)).toBeInTheDocument()
    expect(screen.getByText(example.summary)).toBeInTheDocument()
    expect(screen.getByText(`Outcome: ${example.outcome}`)).toBeInTheDocument()
    expect(screen.getByLabelText("Metrics")).toHaveTextContent("Tool calls5")
    expect(screen.getByLabelText("Metrics")).toHaveTextContent("€350.00")
  })

  test("lists next steps when there are some", () => {
    renderJournal(
      loadExample((journal) => {
        journal.next_steps = ["Approve ord_example in the order console"]
      })
    )

    expect(
      screen.getByText("Approve ord_example in the order console")
    ).toBeInTheDocument()
  })

  test("marks the chosen quote option", () => {
    renderJournal(loadExample())

    const chosen = screen.getByRole("row", { name: /\(464119\), chosen$/ })
    expect(within(chosen).getByText("Chosen")).toBeInTheDocument()
    expect(within(chosen).getByText("Cheapest covering")).toBeInTheDocument()
    const other = screen.getByRole("row", { name: /\(464073\)$/ })
    expect(within(other).queryByText("Chosen")).not.toBeInTheDocument()
  })

  test("shows the order's approval and the buyer's reason", () => {
    renderJournal(loadExample())

    const order = screen.getByRole("group", { name: "Order ord_example" })
    const decision = within(order).getByText("Decision").closest("div")
    expect(decision).toHaveTextContent("Decisionapproved")
    const reason = within(order).getByText("Reason").closest("div")
    expect(reason).toHaveTextContent("ReasonFor the gala dinner")
  })

  test("lists the timeline in seq order", () => {
    renderJournal(
      loadExample((journal) => {
        journal.timeline.reverse()
      })
    )

    const items = within(
      screen.getByRole("list", { name: "Timeline" })
    ).getAllByRole("listitem")
    expect(items).toHaveLength(6)
    expect(
      items.map((item) => item.textContent?.match(/^(\d+)\./)?.[1])
    ).toEqual(["1", "2", "3", "4", "5", "6"])
  })

  test("hides the refused calls section when there are none", () => {
    renderJournal(loadExample())

    expect(
      screen.queryByRole("heading", { name: "Refused calls" })
    ).not.toBeInTheDocument()
  })

  test("shows refused calls when the journal has them", () => {
    renderJournal(
      loadExample((journal) => {
        journal.errors = [
          {
            tool: "place_order",
            code: "quote_changed",
            message: "The quote changed",
            handling: "Requoted and placed again",
          },
        ]
      })
    )

    expect(
      screen.getByRole("heading", { name: "Refused calls" })
    ).toBeInTheDocument()
    expect(screen.getByText("quote_changed")).toBeInTheDocument()
  })

  test("renders journal strings as text, never as HTML", () => {
    const hostile = "<img src=x onerror=alert(1)>"
    const { container } = renderJournal(
      loadExample((journal) => {
        journal.narrative.what_happened = hostile
        journal.title = hostile
      })
    )

    expect(screen.getByText(hostile, { selector: "p" })).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
  })

  test("renders missing values as unknown", () => {
    renderJournal(loadExample())

    expect(screen.getAllByText("unknown").length).toBeGreaterThan(0)
  })

  test("shows a buyer answer that matches no offered option", () => {
    renderJournal(
      loadExample((journal) => {
        journal.questions = [
          {
            header: "Substitute",
            question: "Accept a substitute?",
            options: [
              { label: "Yes", description: "Use 464073", recommended: true },
              { label: "No", description: "Wait", recommended: false },
            ],
            answer: "Only for half the amount",
          },
        ]
      })
    )

    expect(screen.getByText("Only for half the amount")).toBeInTheDocument()
    expect(screen.queryByText("Picked")).not.toBeInTheDocument()
  })
})
