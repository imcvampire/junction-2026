import example from "@skill-references/journal-example.json"
import { expect, test } from "vitest"
import { buyerDecisions, productSearchSummary } from "./customer-record"
import type { ValioAimoJournal } from "./journal.types"

const fixture = () => structuredClone(example) as ValioAimoJournal
test("search summary distinguishes results, candidates, suitable offers and exclusions", () => {
  const j = fixture()
  expect(productSearchSummary(j)).toMatchObject({
    found: 10,
    considered: 3,
    suitable: 2,
    excluded: 0,
  })
  j.candidates[2].kept = false
  j.candidates[2].drop_reason = "Not suitable for drinking"
  expect(productSearchSummary(j).reasons[0]).toContain(
    "Not suitable for drinking"
  )
  j.searches.push(j.searches[0])
  expect(productSearchSummary(j).found).toBeNull()
})
test("preserves quantity-change responses and uses product descriptions instead of option letters", () => {
  const j = fixture()
  j.request.amount = { value: 500, unit: "L" }
  j.questions = [
    {
      header: "Quantity Changed",
      question: "Keep 500 L?",
      options: [],
      answer: "Change the order to 250 L",
    },
    {
      header: "Product Selected",
      question: "Which product?",
      options: [
        {
          label: "A",
          description:
            "Lactose-free skimmed milk UHT; 250 L; €333 excluding VAT; delivery risk disclosed",
          recommended: true,
        },
      ],
      answer: "A",
      free_text: "I accept the disclosed delivery risk.",
    },
  ]
  const before = JSON.stringify(j),
    decisions = buyerDecisions(j)
  expect(decisions[0].answer).toBe("Change the order to 250 L")
  expect(decisions[1].options[0].title).toContain("Lactose-free skimmed milk")
  expect(decisions[1].options[0].reference).toBe("Option A")
  expect(decisions[1].riskAcceptance).toBe(
    "I accept the disclosed delivery risk."
  )
  expect(JSON.stringify(j)).toBe(before)
})
test("choosing a risky option does not alone establish explicit risk acceptance", () => {
  const j = fixture()
  j.questions = [
    {
      header: "Product",
      question: "Choose a product",
      options: [
        {
          label: "B",
          description: "Milk with delivery risk",
          recommended: false,
        },
      ],
      answer: "B",
    },
  ]
  expect(buyerDecisions(j)[0].riskAcceptance).toBe(
    "Risk acceptance is not explicitly recorded."
  )
  j.questions[0].free_text = "I do not accept this delivery risk"
  expect(buyerDecisions(j)[0].riskAcceptance).toBe(
    "Risk acceptance is not explicitly recorded."
  )
  j.questions[0].question = "Do you accept the disclosed delivery risk?"
  j.questions[0].answer = "Yes"
  j.questions[0].free_text = null
  expect(buyerDecisions(j)[0].riskAcceptance).toBe("Yes")
})

test("records a 500 L request changed to a 250 L purchase without inferring acceptance", () => {
  const j = fixture()
  j.request.amount = { value: 500, unit: "L" }
  j.quotes[0].options[0].quantity = 25
  j.quotes[0].options[0].unit_price = 13.32
  j.quotes[0].options[0].line_total = 333
  j.quotes[0].options[0].requested = "250 L"
  j.decision!.chosen[0].quantity = 25
  j.orders[0].total = 333
  j.questions = [
    {
      header: "Quantity Changed",
      question: "Keep the original 500 L request?",
      options: [],
      answer: "Change the order to 250 L",
    },
  ]
  const decision = buyerDecisions(j)[0]
  expect(decision.answer).toBe("Change the order to 250 L")
  expect(decision.effect).toContain("250 L")
  expect(decision.riskAcceptance).toBe(
    "Risk acceptance is not explicitly recorded."
  )
  expect(j.request.amount.value).toBe(500)
})
