// @vitest-environment node
import example from "@skill-references/journal-example.json"
import { expect, test } from "vitest"
import {
  addDetailedContents,
  planCompletePurchaseReport,
  PDF_WIDTH,
  PDF_HEIGHT,
  type MeasureText,
  type ReportPage,
} from "./pdf-layout"
import { STATEMENT_DISCLAIMER } from "./purchase-statement"
import type { ValioAimoJournal } from "./journal.types"

// Deterministic font metrics for pagination tests; production uses actual browser font metrics.
const measure: MeasureText = (value, size) => [...value].length * size * 0.52
const fixture = () => structuredClone(example) as ValioAimoJournal
const words = (page: ReportPage) =>
  page.commands
    .filter((c) => c.kind === "text")
    .map((c) => c.text)
    .join(" ")

test("statement is first, detailed part starts on its own page, with global page numbering", () => {
  const pages = planCompletePurchaseReport(
    fixture(),
    measure,
    new Date("2026-11-14T10:00:00Z")
  )
  expect(pages[0].part).toBe("statement")
  expect(words(pages[0])).toContain("Valio Aimo — Purchase Statement")
  expect(words(pages[0])).toContain(STATEMENT_DISCLAIMER)
  expect(
    pages.filter((p) => p.part === "statement").length
  ).toBeLessThanOrEqual(2)
  const detailed = pages.findIndex((p) => p.part !== "statement")
  expect(words(pages[detailed])).toContain(
    "Valio Aimo — Detailed Purchase Report"
  )
  pages.forEach((page, i) =>
    expect(words(page)).toContain(`Page ${i + 1} of ${pages.length}`)
  )
  expect(
    pages.some(
      (page) =>
        page.part === "statement" &&
        words(page).includes("Your Purchasing Decisions")
    )
  ).toBe(false)
})

test.each([5, 6])(
  "contents threshold is based on %s detailed pages",
  (count) => {
    const statement: ReportPage[] = [
      {
        part: "statement",
        section: "Statement",
        sections: ["Statement"],
        commands: [],
      },
    ]
    const detailed: ReportPage[] = Array.from({ length: count }, (_, i) => ({
      part: "detailed",
      section: `Section ${i + 1}`,
      sections: [`Section ${i + 1}`],
      commands: [],
    }))
    const pages = addDetailedContents(statement, detailed, measure)
    expect(pages.filter((page) => page.part === "contents")).toHaveLength(
      count > 5 ? 1 : 0
    )
  }
)

test("contents page links account for both the statement and contents page", () => {
  const statement: ReportPage[] = [
    {
      part: "statement",
      section: "Statement",
      sections: ["Statement"],
      commands: [],
    },
  ]
  const detailed: ReportPage[] = Array.from({ length: 6 }, (_, i) => ({
    part: "detailed",
    section: `Section ${i + 1}`,
    sections: [`Section ${i + 1}`],
    commands: [],
  }))
  const pages = addDetailedContents(statement, detailed, measure)
  expect(pages[1].part).toBe("contents")
  expect(words(pages[1])).toContain(
    "Section 1 ................................ 3"
  )
  expect(words(pages[1])).toContain(
    "Section 6 ................................ 8"
  )
})

test("long product tables repeat headers on new statement pages, without overflow", () => {
  const j = fixture()
  j.quotes[0].options = Array.from({ length: 35 }, (_, i) => ({
    ...j.quotes[0].options[0],
    product_id: `product-${i}`,
    name: `Purchased product ${i + 1} with a descriptive name`,
    chosen: true,
  }))
  j.decision!.chosen = j.quotes[0].options.map((option) => ({
    product_id: option.product_id,
    quantity: 100,
  }))
  j.orders[0].total = 1540 * 35
  const pages = planCompletePurchaseReport(j, measure)
  const tablePages = pages.filter(
    (page) =>
      page.part === "statement" &&
      page.commands.some(
        (c) =>
          c.kind === "text" &&
          c.x === 88 &&
          c.size === 20 &&
          c.text.includes("Purchased product ")
      )
  )
  expect(tablePages.length).toBeGreaterThan(1)
  tablePages.forEach((page) => {
    for (const label of ["Product", "Quantity", "Unit Price", "Total"])
      expect(
        page.commands.some((c) => c.kind === "text" && c.text === label)
      ).toBe(true)
  })
  for (const page of pages)
    for (const command of page.commands) {
      expect(command.y).toBeGreaterThanOrEqual(0)
      expect(command.y).toBeLessThan(PDF_HEIGHT - 30)
    }
  for (const command of pages
    .flatMap((page) => page.commands)
    .filter((command) => command.kind === "text")) {
    const width = measure(command.text, command.size, command.bold)
    const left = command.align === "right" ? command.x - width : command.x
    expect(left).toBeGreaterThanOrEqual(60)
    expect(left + width).toBeLessThanOrEqual(PDF_WIDTH - 60)
  }
})
