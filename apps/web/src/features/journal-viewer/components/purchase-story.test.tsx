import example from "@skill-references/journal-example.json"
import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"
import type { ValioAimoJournal } from "../journal.types"
import { PurchaseStory } from "./purchase-story"

const fixture = () => structuredClone(example) as ValioAimoJournal

test("short explanation uses actual request, discovery, choice and buyer approval", () => {
  const journal = fixture(),
    before = JSON.stringify(journal)
  const { container } = render(<PurchaseStory journal={journal} />)
  expect(
    screen.getByRole("complementary", { name: "Here's What Happened" })
  ).toBeInTheDocument()
  expect(container).toHaveTextContent(journal.request.text)
  expect(container).toHaveTextContent("3 products considered")
  expect(container).toHaveTextContent("2 suitable offers recorded")
  expect(container).toHaveTextContent(journal.candidates[0].name)
  expect(container).toHaveTextContent(
    "Buyer approval required. Buyer decision: approved. Purchase Approved."
  )
  expect(container).not.toHaveTextContent(
    /agt_mcp|q_example|ord_example|mcp_elicitation/
  )
  expect(JSON.stringify(journal)).toBe(before)
})

test("buyer quantity-change responses stay factual and do not rewrite the request", () => {
  const journal = fixture()
  journal.request.text = "Please buy 500 L of milk."
  journal.questions = [
    {
      header: "Quantity Changed",
      question: "Keep the original amount?",
      options: [],
      answer: "Change the order to 250 L",
    },
  ]
  const { container } = render(<PurchaseStory journal={journal} />)
  expect(container).toHaveTextContent("Please buy 500 L of milk.")
  expect(container).toHaveTextContent(
    "Decision 1 — Quantity Changed: Change the order to 250 L"
  )
  expect(journal.request.text).toBe("Please buy 500 L of milk.")
})

test("pending or absent evidence never turns into a completed approval or order", () => {
  const journal = fixture()
  journal.orders[0].status = "pending_approval"
  journal.orders[0].decision = null
  const { container, rerender } = render(<PurchaseStory journal={journal} />)
  expect(container).toHaveTextContent(
    "No buyer approval decision recorded. Awaiting Approval."
  )
  expect(container).not.toHaveTextContent("Purchase Approved")
  journal.orders = []
  journal.decision = null
  journal.outcome = "no_order"
  rerender(<PurchaseStory journal={journal} />)
  expect(container).toHaveTextContent("No product selection recorded.")
  expect(container).toHaveTextContent("No order is recorded.")
})
