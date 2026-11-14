import example from "@skill-references/journal-example.json"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"

import { formatNumber } from "../format"
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
  return render(<JournalView journal={journal} />)
}

function section(name: string) {
  const element = screen.getByRole("heading", { name }).closest("section")
  if (!element) throw new Error(`section ${name} missing`)
  return within(element)
}

function steps() {
  const list = screen.getByRole("list", { name: "Steps" })
  return [...list.children] as HTMLElement[]
}

function step(seq: number) {
  const element = steps().find((item) => item.dataset.seq === String(seq))
  if (!element) throw new Error(`step ${seq} missing`)
  return within(element)
}

// Testing Library collapses the en-FI thousands separator into a plain space.
const THOUSAND = formatNumber(1000).replace(/\s/g, " ")

const question = (header: string): ValioAimoJournal["questions"][number] => ({
  header,
  question: `${header} question?`,
  options: [
    { label: "Yes", description: "Use 464073", recommended: true },
    { label: "No", description: "Wait", recommended: false },
  ],
  answer: "Yes",
})

describe("JournalView", () => {
  test("reads as what was asked, what happened, what came out", () => {
    renderJournal(loadExample())

    expect(
      screen.getByRole("heading", { name: example.title })
    ).toBeInTheDocument()
    expect(screen.getByText(example.summary)).toBeInTheDocument()
    expect(screen.getByText("Order approved")).toBeInTheDocument()
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual([
      "What was asked",
      "What happened, step by step",
      "What came out",
    ])
    expect(
      section("What was asked").getByText(example.request.text)
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Key figures")).toHaveTextContent("€350.00")
  })

  test("shows no tool names, ids or unit codes", () => {
    const { container } = renderJournal(loadExample())

    const text = container.textContent ?? ""
    for (const technical of [
      "whoami",
      "search_products",
      "place_order",
      "approve_order",
      "q_example",
      "cheapest_covering",
      example.agent.agent_id,
      example.agent.customer,
      "mcp_elicitation",
      "Kind:",
      "Tool calls",
    ]) {
      expect(text).not.toContain(technical)
    }
    expect(text).not.toMatch(/\bKI\b/)
    expect(text).not.toMatch(/\bST\b/)
  })

  test("states the request and the agent's limits in words", () => {
    renderJournal(
      loadExample((journal) => {
        journal.authority.required_tags = ["FREE_FROM:AM"]
        journal.authority.banned_allergens = ["AM", "AE"]
      })
    )

    const input = section("What was asked")
    expect(input.getByText("Lactose-free")).toBeInTheDocument()
    expect(input.getByText(`${THOUSAND} L`)).toBeInTheDocument()
    expect(
      input.getByText(
        "The agent may place orders up to €500.00 without sign-off. Anything above that needs a person's approval."
      )
    ).toBeInTheDocument()
    expect(
      input.getByText(
        "Every product it orders must be: Declared free from milk."
      )
    ).toBeInTheDocument()
    expect(
      input.getByText("It must never buy products containing milk or eggs.")
    ).toBeInTheDocument()
  })

  test("lists every step in seq order", () => {
    renderJournal(
      loadExample((journal) => {
        journal.timeline.reverse()
      })
    )

    expect(steps().map((item) => item.dataset.seq)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ])
    expect(step(1).queryByRole("time")).not.toBeInTheDocument()
    expect(step(3).getByRole("time")).toBeInTheDocument()
    expect(
      step(2).getByText("Valio semi skimmed milk 1 l lactose free UHT")
    ).toBeInTheDocument()
  })

  test("shows the approval as a buyer decision with reason and decider", () => {
    renderJournal(loadExample())

    const approval = step(5)
    expect(approval.getByText("Buyer decision")).toBeInTheDocument()
    expect(approval.getByText("Buyer approved")).toBeInTheDocument()
    expect(approval.getByText("For the gala dinner")).toBeInTheDocument()
    expect(
      approval.getByText(
        "Approved by the buyer in the approval form the agent showed."
      )
    ).toBeInTheDocument()
    expect(step(4).queryByText("Buyer decision")).not.toBeInTheDocument()
  })

  test("can show only the human decisions", async () => {
    renderJournal(loadExample())

    await userEvent.click(
      screen.getByRole("button", { name: "Only human decisions" })
    )

    expect(steps().map((item) => item.dataset.seq)).toEqual(["5"])
    expect(
      screen.getByRole("button", { name: "Only human decisions" })
    ).toHaveAttribute("aria-pressed", "true")
  })

  test("shows the order as a plain receipt", () => {
    renderJournal(loadExample())

    const receipt = within(screen.getByRole("group", { name: "Order 1" }))
    expect(
      receipt.getByText("Valio skimmed milk 1 l lactose free UHT")
    ).toBeInTheDocument()
    expect(receipt.getByText(`${THOUSAND} L (100 × 10 L)`)).toBeInTheDocument()
    expect(receipt.getAllByText("€1,540.00").length).toBeGreaterThan(0)
    expect(receipt.getByText(/16 Nov 2026/)).toBeInTheDocument()
    expect(receipt.getByText("Why sign-off was needed")).toBeInTheDocument()
    expect(
      receipt.getByText(
        "Total 1540.00 EUR exceeds the 500.00 EUR per-order spend limit"
      )
    ).toBeInTheDocument()
    expect(receipt.getByText("Approved")).toBeInTheDocument()
  })

  test("lists the chosen option first among those compared", () => {
    renderJournal(
      loadExample((journal) => {
        const [first, second] = journal.quotes[0].options
        first.chosen = false
        second.chosen = true
      })
    )

    const options = within(
      screen.getByRole("list", { name: "Options compared" })
    ).getAllByRole("listitem")
    expect(options).toHaveLength(2)
    expect(
      within(options[0]).getByText("Valio whole milk 1 l lactose free UHT")
    ).toBeInTheDocument()
    expect(within(options[0]).getByText("Chosen")).toBeInTheDocument()
    expect(within(options[1]).queryByText("Chosen")).not.toBeInTheDocument()
  })

  test("lists next steps when there are some", () => {
    renderJournal(
      loadExample((journal) => {
        journal.next_steps = ["Approve the order in the order console"]
      })
    )

    expect(
      screen.getByText("Approve the order in the order console")
    ).toBeInTheDocument()
  })

  test("shows every question even when steps do not cover them", () => {
    renderJournal(
      loadExample((journal) => {
        journal.questions = [question("First"), question("Second")]
        journal.timeline.push({ seq: 7, type: "question", title: "Asked" })
      })
    )

    expect(step(7).getByText("First question?")).toBeInTheDocument()
    const extra = within(screen.getByRole("list", { name: "Also recorded" }))
    expect(extra.getByText("Second question?")).toBeInTheDocument()
  })

  test("shows a buyer answer that matches no offered option", () => {
    renderJournal(
      loadExample((journal) => {
        journal.questions = [
          { ...question("Substitute"), answer: "Only for half the amount" },
        ]
        journal.timeline.push({ seq: 7, type: "answer", title: "Answered" })
      })
    )

    expect(step(7).getByText("Only for half the amount")).toBeInTheDocument()
    expect(screen.queryByText("Picked")).not.toBeInTheDocument()
  })

  test("shows a problem's message and handling, not its code or tool", () => {
    const { container } = renderJournal(
      loadExample((journal) => {
        journal.errors = [
          {
            tool: "place_order",
            code: "quote_changed",
            message: "The prices changed before the order went in",
            handling: "Got new prices and placed the order again",
          },
        ]
        journal.timeline.push({
          seq: 7,
          type: "error",
          title: "The order was refused",
        })
      })
    )

    const problem = step(7)
    expect(problem.getAllByText("Problem").length).toBeGreaterThan(0)
    expect(
      problem.getByText("The prices changed before the order went in")
    ).toBeInTheDocument()
    expect(
      problem.getByText("Got new prices and placed the order again")
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain("quote_changed")
    expect(container.textContent).not.toContain("place_order")
  })

  test("renders journal strings as text, never as HTML", () => {
    const hostile = "<img src=x onerror=alert(1)>"
    const { container } = renderJournal(
      loadExample((journal) => {
        journal.title = hostile
        journal.timeline[0].title = hostile
      })
    )

    expect(step(1).getByText(hostile)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: hostile })).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
  })

  test("hides sources when the agent consulted none", () => {
    renderJournal(loadExample())

    expect(
      screen.queryByRole("heading", { name: "Sources the agent consulted" })
    ).not.toBeInTheDocument()
  })

  test("lists consulted sources with only http links as links", () => {
    renderJournal(
      loadExample((journal) => {
        journal.research = [
          {
            research_id: "r1",
            product_id: "464073",
            candidate_ids: ["469363"],
            purpose: "coffee",
            outcome: "ok",
            summary: "<b>469363</b> foams like the original.",
            sources: [
              { title: "arla.fi", url: "https://www.arla.fi/" },
              { title: "evil", url: "javascript:alert(1)" },
            ],
            used_for: null,
          },
        ]
        journal.recipes = [
          {
            research_id: "rc1",
            dish: "lohikeitto",
            outcome: "rate_limited",
            servings: 40,
            sources: [],
            ingredients: [
              {
                name: "Cooking cream",
                amount: { value: 4, unit: "L" },
                source: "kotikokki.net",
              },
              { name: "Dill", amount: null, source: null },
            ],
          },
        ]
      })
    )

    const sources = section("Sources the agent consulted")
    expect(
      sources.getByText(
        "Alternatives to Valio whole milk 1 l lactose free UHT, for coffee"
      )
    ).toBeInTheDocument()
    expect(
      sources.getByText("<b>469363</b> foams like the original.")
    ).toBeInTheDocument()
    const link = sources.getByRole("link", { name: "arla.fi" })
    expect(link).toHaveAttribute("href", "https://www.arla.fi/")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(
      sources.queryByRole("link", { name: "evil" })
    ).not.toBeInTheDocument()
    expect(sources.getByText("evil")).toBeInTheDocument()
    expect(
      sources.getByText("Recipe for lohikeitto, 40 servings")
    ).toBeInTheDocument()
    expect(sources.getByText("Skipped: too many lookups")).toBeInTheDocument()
    expect(sources.getByText("Cooking cream: 4 L")).toBeInTheDocument()
    expect(sources.getByText("Dill")).toBeInTheDocument()
  })

  test("renders missing values as unknown", () => {
    renderJournal(
      loadExample((journal) => {
        journal.request.delivery_date = null
      })
    )

    expect(section("What was asked").getByText("unknown")).toBeInTheDocument()
  })
})
