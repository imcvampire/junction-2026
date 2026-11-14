// @vitest-environment node
import example from "@skill-references/journal-example.json"
import { expect, test } from "vitest"
import type { ValioAimoJournal } from "./journal.types"
import { pdfFromJpegPages, purchaseReportSections } from "./purchase-report"

const fixture = () => structuredClone(example) as ValioAimoJournal

test("report uses the current record, all candidates and actual prices", () => {
  const j = fixture()
  const sections = purchaseReportSections(j, new Date("2026-11-14T10:00:00Z"))
  expect(sections.map((s) => s.title)).toEqual([
    "Purchase Summary",
    "Product Comparison",
    "Your Purchasing Decisions",
    "Purchasing Journey",
    "Purchase Safety Checks",
    "Your Order Details",
  ])
  const text = JSON.stringify(sections)
  expect(text).toContain("€1,540.00")
  expect(text).toContain("€350.00")
  expect(sections[1].blocks.filter((b) => b.type === "product")).toHaveLength(3)
  expect(text).toContain("Buyer’s identity: Not recorded")
  expect(text).not.toMatch(
    /agt_mcp|q_example|ord_example|mcp_elicitation|\/api\/|schema_version|client_reference|product_id/
  )
  expect(text).toContain("Wholesaler confirmation: Not verified")
  j.title = "A newly loaded purchase"
  j.orders[0].total = 99
  const replacement = JSON.stringify(purchaseReportSections(j))
  expect(replacement).toContain("A newly loaded purchase")
  expect(replacement).toContain("Total excluding VAT: €99.00")
})

test("redacts credentials in report fields and handles incomplete records", () => {
  const j = fixture()
  j.request.text =
    "API_VALIO_API_KEY=private-key Authorization: Bearer private-token"
  j.orders = []
  j.quotes = []
  j.decision = null
  const content = JSON.stringify(purchaseReportSections(j))
  expect(content).not.toContain("private-key")
  expect(content).not.toContain("private-token")
  expect(content).toContain("Not available")
})

test("PDF container has correct binary stream lengths, page references and xref offsets", async () => {
  const image = new Uint8Array([255, 216, 0, 128, 255, 217])
  const blob = pdfFromJpegPages([image, image, image, image], 1240, 1754)
  expect(blob.type).toBe("application/pdf")
  const bytes = Buffer.from(await blob.arrayBuffer())
  const source = bytes.toString("latin1")
  expect(source.startsWith("%PDF-1.4")).toBe(true)
  expect(source).toContain("/Type /Pages /Count 4")
  expect(source.match(/\/Type \/Page /g)).toHaveLength(4)
  const xrefOffset = Number(source.match(/startxref\n(\d+)/)![1])
  expect(source.slice(xrefOffset, xrefOffset + 4)).toBe("xref")
  const offsets = source.slice(xrefOffset).split("\n").slice(3, 17)
  offsets.forEach((entry, index) =>
    expect(source.slice(Number(entry.slice(0, 10)))).toMatch(
      new RegExp(`^${index + 1} 0 obj`)
    )
  )
  expect(source.endsWith("%%EOF\n")).toBe(true)
  expect(() => pdfFromJpegPages([], 0, 0)).toThrow(
    "A PDF needs at least one page with positive dimensions"
  )
})
