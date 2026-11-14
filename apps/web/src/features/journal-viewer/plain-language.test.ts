import example from "@skill-references/journal-example.json"
import journalSchema from "@skill-references/journal.schema.json"
import { describe, expect, test } from "vitest"

import { formatNumber } from "./format"
import type { ValioAimoJournal } from "./journal.types"
import { parseJournal } from "./parse-journal"
import {
  ORDER_STATUS_LABEL,
  OUTCOME_LABEL,
  STEP_LABEL,
  productNames,
  quantityLabel,
  tagLabel,
  toAuditSteps,
  withPlainQuantities,
} from "./plain-language"

function loadExample(change?: (journal: ValioAimoJournal) => void) {
  const result = parseJournal(JSON.stringify(example))
  if (!result.ok) throw new Error("the skill's example journal must parse")
  change?.(result.journal)
  return result.journal
}

// The app formats numbers for en-FI, which groups thousands with a space.
const THOUSAND = formatNumber(1000)

const question = (header: string): ValioAimoJournal["questions"][number] => ({
  header,
  question: `${header}?`,
  options: [{ label: "Yes", description: "", recommended: true }],
  answer: "Yes",
})

describe("labels", () => {
  test.each([
    ["outcome", journalSchema.properties.outcome.enum, OUTCOME_LABEL],
    [
      "order status",
      journalSchema.$defs.order.properties.status.enum,
      ORDER_STATUS_LABEL,
    ],
    [
      "timeline type",
      journalSchema.$defs.timeline_entry.properties.type.enum,
      STEP_LABEL,
    ],
  ])("every %s in the schema has a label", (_, values, labels) => {
    for (const value of values) {
      expect(Object.keys(labels)).toContain(value)
    }
  })

  test.each([
    ["LACTOSE_FREE", "Lactose-free"],
    ["lactose_free", "Lactose-free"],
    ["FREE_FROM:AM", "Declared free from milk"],
    ["no:AM", "No milk listed"],
    ["no:XX", "No XX listed"],
    ["brand:Valio", "Brand: Valio"],
    ["LOW_SALT_PRODUCT", "Low Salt Product"],
  ])("tag %s reads as %s", (tag, label) => {
    expect(tagLabel(tag)).toBe(label)
  })
})

describe("productNames", () => {
  test("prefers quote option names, then candidates", () => {
    const names = productNames(
      loadExample((journal) => {
        journal.candidates[0].name = "Candidate name"
      })
    )

    expect(names.get("464119")).toBe("Valio skimmed milk 1 l lactose free UHT")
    expect(names.get("464201")).toBe(
      "Valio semi skimmed milk 1 l lactose free UHT"
    )
    expect(names.get("999999")).toBeUndefined()
  })

  test("an unknown product id reads as an unnamed product", () => {
    const { steps } = toAuditSteps(
      loadExample((journal) => {
        journal.timeline[1].refs = { product_ids: ["999999", "888888"] }
      })
    )

    expect(steps[1].products).toEqual(["an unnamed product"])
  })
})

describe("quantityLabel", () => {
  test.each([
    [
      { quantity: 100, requested: "1000 L", content_per_sales_unit: "10 L" },
      `${THOUSAND} L (100 × 10 L)`,
    ],
    [
      { quantity: 100, requested: null, content_per_sales_unit: "10 L" },
      "100 × 10 L",
    ],
    [
      { quantity: 100, requested: "1000 L", content_per_sales_unit: null },
      "100 sales units",
    ],
    [{ quantity: 1, content_per_sales_unit: null }, "1 sales unit"],
    [
      { quantity: null, requested: "1000 L", content_per_sales_unit: "10 L" },
      null,
    ],
  ])("%o reads as %s", (option, label) => {
    expect(quantityLabel(option)).toBe(label)
  })

  test("rewrites only exact quantity and unit pairs from the quotes", () => {
    const journal = loadExample()

    expect(withPlainQuantities("Placed 100 KI of milk", journal)).toBe(
      `Placed ${THOUSAND} L (100 × 10 L) of milk`
    )
    expect(withPlainQuantities("Placed 1100 KI, 99 KI", journal)).toBe(
      "Placed 1100 KI, 99 KI"
    )
  })
})

describe("toAuditSteps", () => {
  test("orders steps by seq and maps actors", () => {
    const { steps } = toAuditSteps(
      loadExample((journal) => {
        journal.timeline.reverse()
      })
    )

    expect(steps.map((step) => step.seq)).toEqual([1, 2, 3, 4, 5, 6])
    expect(steps.map((step) => step.actor)).toEqual([
      "agent",
      "agent",
      "agent",
      "agent",
      "buyer",
      "agent",
    ])
    expect(
      steps.filter((step) => step.involvesHuman).map((s) => s.seq)
    ).toEqual([5])
  })

  test("links the approval step to the order decision", () => {
    const { steps } = toAuditSteps(loadExample())

    const approval = steps[4]
    expect(approval.label).toBe("Buyer approved")
    expect(approval.detail).toMatchObject({
      kind: "decision",
      decision: { reason: "For the gala dinner" },
    })
    expect(steps[3].detail).toMatchObject({ kind: "order" })
    expect(steps[3].title).not.toMatch(/\bKI\b/)
  })

  test("labels a rejection as such", () => {
    const { steps } = toAuditSteps(
      loadExample((journal) => {
        journal.orders[0].decision!.decision = "rejected"
      })
    )

    expect(steps[4].label).toBe("Buyer rejected")
  })

  test("measures the time since the previous step with a known time", () => {
    const { steps } = toAuditSteps(loadExample())

    expect(steps[2].minutesSincePrevious).toBeNull()
    expect(steps[4].minutesSincePrevious).toBe(3)
  })

  test("links questions and errors by position and keeps the rest unlinked", () => {
    const { steps, unlinked } = toAuditSteps(
      loadExample((journal) => {
        journal.questions = [question("First"), question("Second")]
        journal.errors = [
          { tool: "quote", code: "a", message: "One", handling: "Retried" },
          { tool: "quote", code: "b", message: "Two", handling: "Gave up" },
        ]
        journal.timeline.push(
          { seq: 7, type: "question", title: "Asked" },
          { seq: 8, type: "answer", title: "Answered" },
          { seq: 9, type: "error", title: "Failed" }
        )
      })
    )

    const [asked, answered, failed] = steps.slice(6)
    expect(asked).toMatchObject({
      actor: "agent",
      involvesHuman: true,
      detail: { kind: "question", asked: true, question: { header: "First" } },
    })
    expect(answered).toMatchObject({
      actor: "buyer",
      detail: { kind: "question", asked: false, question: { header: "First" } },
    })
    expect(failed).toMatchObject({
      actor: "problem",
      detail: { kind: "problem", error: { message: "One" } },
    })
    expect(unlinked.questions.map((q) => q.header)).toEqual(["Second"])
    expect(unlinked.errors.map((e) => e.message)).toEqual(["Two"])
  })
})
