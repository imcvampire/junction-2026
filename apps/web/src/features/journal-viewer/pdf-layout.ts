import { purchaseReportSections, type ReportSection } from "./customer-report"
import { formatMoney } from "./format"
import type { ValioAimoJournal } from "./journal.types"
import { purchaseStatement, STATEMENT_DISCLAIMER } from "./purchase-statement"

export const PDF_WIDTH = 1240
export const PDF_HEIGHT = 1754
const MARGIN = 76,
  WIDTH = PDF_WIDTH - MARGIN * 2,
  TOP = 194,
  BOTTOM = 1570
const BLUE = "#0052A5",
  TEXT = "#182B42",
  LIGHT = "#EAF3FC",
  BORDER = "#D8E5F2"
export type MeasureText = (text: string, size: number, bold: boolean) => number
export type DrawCommand =
  | {
      kind: "text"
      text: string
      x: number
      y: number
      size: number
      bold: boolean
      color: string
      align?: "left" | "right"
    }
  | {
      kind: "rect"
      x: number
      y: number
      width: number
      height: number
      color: string
    }
  | { kind: "line"; x: number; y: number; width: number; color: string }
export type ReportPage = {
  part: "statement" | "detailed" | "contents"
  section: string
  sections: string[]
  commands: DrawCommand[]
}

function wrap(
  value: string,
  width: number,
  size: number,
  bold: boolean,
  measure: MeasureText
) {
  const result: string[] = []
  for (const paragraph of value.split("\n")) {
    let line = ""
    for (const word of paragraph.split(/\s+/)) {
      const proposal = line ? `${line} ${word}` : word
      if (measure(proposal, size, bold) <= width) {
        line = proposal
        continue
      }
      if (line) result.push(line)
      line = ""
      for (const character of word) {
        if (line && measure(line + character, size, bold) > width) {
          result.push(line)
          line = ""
        }
        line += character
      }
    }
    if (line || !paragraph) result.push(line)
  }
  return result
}

class Layout {
  part: ReportPage["part"]
  private measure: MeasureText
  pages: ReportPage[] = []
  y = TOP
  section = "Purchase Statement"
  constructor(part: ReportPage["part"], measure: MeasureText) {
    this.part = part
    this.measure = measure
  }
  get page() {
    return this.pages[this.pages.length - 1]
  }
  add(command: DrawCommand) {
    this.page.commands.push(command)
  }
  newPage() {
    const title =
      this.part === "statement"
        ? "Valio Aimo — Purchase Statement"
        : "Valio Aimo — Detailed Purchase Report"
    this.pages.push({
      part: this.part,
      section: this.section,
      sections: [this.section],
      commands: [
        {
          kind: "text",
          text: title,
          x: MARGIN,
          y: 78,
          size: 32,
          bold: true,
          color: BLUE,
        },
        {
          kind: "text",
          text:
            this.part === "statement"
              ? "PART 1 · PURCHASE STATEMENT"
              : `PART 2 · ${this.section}`,
          x: MARGIN,
          y: 123,
          size: 22,
          bold: false,
          color: BLUE,
        },
        { kind: "line", x: MARGIN, y: 149, width: WIDTH, color: BORDER },
      ],
    })
    this.y = TOP
  }
  ensure(height: number) {
    if (!this.page || this.y + height > BOTTOM) this.newPage()
  }
  lines(value: string, width = WIDTH, size = 22, bold = false) {
    return wrap(value, width, size, bold, this.measure)
  }
  text(value: string, bold = false, size = 22, gap = 16) {
    const lines = this.lines(value, WIDTH, size, bold)
    const height = lines.length * 30 + gap
    if (height <= BOTTOM - TOP) this.ensure(height)
    for (const line of lines) {
      this.ensure(30)
      this.add({
        kind: "text",
        text: line,
        x: MARGIN,
        y: this.y,
        size,
        bold,
        color: bold ? BLUE : TEXT,
      })
      this.y += 30
    }
    this.y += gap
  }
  heading(title: string) {
    this.section = title
    this.ensure(110)
    if (!this.page.sections.includes(title)) this.page.sections.push(title)
    this.y += 14
    this.text(title, true, 25, 18)
  }
  fields(fields: [string, string][]) {
    const column = (WIDTH - 32) / 2
    for (let i = 0; i < fields.length; i += 2) {
      const row = fields.slice(i, i + 2).map(([label, value]) => ({
        label,
        lines: this.lines(value, column - 24, 21),
      }))
      const height = 42 + Math.max(...row.map((item) => item.lines.length)) * 28
      if (height > BOTTOM - TOP) {
        for (const [label, value] of fields.slice(i, i + 2))
          this.text(`${label}: ${value}`)
        continue
      }
      this.ensure(height + 16)
      row.forEach((item, index) => {
        const x = MARGIN + index * (column + 32)
        this.add({
          kind: "text",
          text: item.label,
          x,
          y: this.y,
          size: 18,
          bold: false,
          color: "#50647B",
        })
        item.lines.forEach((line, li) =>
          this.add({
            kind: "text",
            text: line,
            x,
            y: this.y + 30 + li * 28,
            size: 21,
            bold: true,
            color: TEXT,
          })
        )
      })
      this.y += height + 12
    }
  }
  table(rows: string[][]) {
    const widths = [480, 230, 190, 188]
    const headers = ["Product", "Quantity", "Unit Price", "Total"]
    const header = () => {
      this.ensure(62)
      this.add({
        kind: "rect",
        x: MARGIN,
        y: this.y - 22,
        width: WIDTH,
        height: 48,
        color: LIGHT,
      })
      let x = MARGIN
      headers.forEach((value, index) => {
        this.add({
          kind: "text",
          text: value,
          x: x + 12,
          y: this.y + 8,
          size: 20,
          bold: true,
          color: BLUE,
        })
        x += widths[index]
      })
      this.y += 52
    }
    header()
    for (const row of rows) {
      const cells = row.map((value, index) =>
        this.lines(value, widths[index] - 24, 20)
      )
      const count = Math.max(...cells.map((cell) => cell.length))
      if (
        count * 28 + 22 < BOTTOM - TOP - 62 &&
        this.y + count * 28 + 22 > BOTTOM
      ) {
        this.newPage()
        header()
      }
      let offset = 0
      while (offset < count) {
        let capacity = Math.floor((BOTTOM - this.y - 24) / 28)
        if (capacity < 1) {
          this.newPage()
          header()
          capacity = Math.floor((BOTTOM - this.y - 24) / 28)
        }
        const lineCount = Math.min(count - offset, capacity)
        let x = MARGIN
        cells.forEach((cell, index) => {
          cell.slice(offset, offset + lineCount).forEach((value, li) =>
            this.add({
              kind: "text",
              text: value,
              x: index >= 2 ? x + widths[index] - 12 : x + 12,
              y: this.y + li * 28,
              size: 20,
              bold: false,
              color: TEXT,
              align: index >= 2 ? "right" : "left",
            })
          )
          x += widths[index]
        })
        this.y += lineCount * 28 + 22
        this.add({
          kind: "line",
          x: MARGIN,
          y: this.y - 9,
          width: WIDTH,
          color: BORDER,
        })
        offset += lineCount
      }
    }
    this.y += 12
  }
  totals(rows: [string, string][]) {
    for (const [label, value] of rows) {
      const labels = this.lines(label, 570, 23, true),
        values = this.lines(value, 440, 26, true)
      const height = Math.max(labels.length, values.length) * 32 + 12
      this.ensure(height)
      labels.forEach((line, index) =>
        this.add({
          kind: "text",
          text: line,
          x: MARGIN,
          y: this.y + index * 32,
          size: 23,
          bold: true,
          color: BLUE,
        })
      )
      values.forEach((line, index) =>
        this.add({
          kind: "text",
          text: line,
          x: PDF_WIDTH - MARGIN,
          y: this.y + index * 32,
          size: 26,
          bold: true,
          color: BLUE,
          align: "right",
        })
      )
      this.y += height
    }
  }
  product(
    block: Extract<ReportSection["blocks"][number], { type: "product" }>
  ) {
    const title = this.lines(block.product.name, WIDTH - 24, 23, true)
    const lines = block.fields.flatMap((field) =>
      this.lines(field, WIDTH - 24, 21)
    )
    const height = (title.length + lines.length) * 30 + 24
    if (height <= BOTTOM - TOP) this.ensure(height)
    for (const [value, bold] of [
      ...title.map((t) => [t, true] as const),
      ...lines.map((t) => [t, false] as const),
    ]) {
      this.ensure(30)
      if (block.product.selected)
        this.add({
          kind: "rect",
          x: MARGIN - 10,
          y: this.y - 23,
          width: WIDTH + 20,
          height: 31,
          color: LIGHT,
        })
      this.add({
        kind: "text",
        text: value,
        x: MARGIN,
        y: this.y,
        size: bold ? 23 : 21,
        bold,
        color: bold ? BLUE : TEXT,
      })
      this.y += 30
    }
    this.y += 24
  }
  chart(block: Extract<ReportSection["blocks"][number], { type: "chart" }>) {
    this.text(block.title, true)
    const max = Math.max(
      ...block.products.map((product) => product.total ?? 0),
      1
    )
    for (const product of block.products) {
      const names = this.lines(product.name, 760, 20)
      const values = this.lines(
        formatMoney(product.total!, block.currency),
        260,
        20,
        true
      )
      const height = names.length * 28 + Math.max(36, values.length * 28) + 24
      if (height <= BOTTOM - TOP && this.y + height > BOTTOM) {
        this.newPage()
        this.text("Price comparison (continued)", true)
      }
      for (const name of names) this.text(name, false, 20, 0)
      this.ensure(Math.max(36, values.length * 28) + 24)
      this.add({
        kind: "rect",
        x: MARGIN,
        y: this.y - 12,
        width: (760 * Math.max(0, product.total!)) / max,
        height: 24,
        color: product.selected
          ? BLUE
          : product.suitable === true
            ? "#99BEE5"
            : "#AAB3BF",
      })
      values.forEach((value, i) =>
        this.add({
          kind: "text",
          text: value,
          x: PDF_WIDTH - MARGIN,
          y: this.y + 6 + i * 28,
          size: 20,
          bold: true,
          color: TEXT,
          align: "right",
        })
      )
      this.y += Math.max(36, values.length * 28) + 24
    }
    this.text(
      `0 — ${formatMoney(max, block.currency)} | Total price (${block.currency}), excluding VAT`,
      false,
      18
    )
  }
}

export function addDetailedContents(
  statement: ReportPage[],
  detailed: ReportPage[],
  measure: MeasureText
): ReportPage[] {
  if (detailed.length <= 5) return [...statement, ...detailed]
  const entries = new Map<string, number>()
  detailed.forEach((page, index) =>
    page.sections.forEach((section) => {
      if (!entries.has(section)) entries.set(section, index)
    })
  )
  let count = 1
  for (let pass = 0; pass < entries.size + 2; pass++) {
    const contents = new Layout("contents", measure)
    contents.section = "Contents"
    contents.newPage()
    contents.text("Contents — Detailed Purchase Report", true, 26)
    contents.text(
      "The purchase statement precedes this section. The following pages explain the products, decisions and checks."
    )
    for (const [title, index] of entries)
      contents.text(
        `${title} ................................ ${statement.length + count + index + 1}`,
        false,
        22,
        18
      )
    if (contents.pages.length === count)
      return [...statement, ...contents.pages, ...detailed]
    count = contents.pages.length
  }
  throw new Error("The report contents could not be paginated")
}
export function planCompletePurchaseReport(
  journal: ValioAimoJournal,
  measure: MeasureText,
  generatedAt = new Date()
): ReportPage[] {
  const statement = purchaseStatement(journal, generatedAt)
  const first = new Layout("statement", measure)
  first.newPage()
  first.fields([
    ["Generated", statement.generatedAt],
    ["Purchase status", statement.status],
    ["Purchase reference", statement.references],
    ["Customer", statement.customer],
    ["Requested delivery", statement.requestedDelivery],
    ["Wholesaler confirmation", "Not verified"],
  ])
  first.text(`Purchase request: ${statement.request}`)
  for (const [index, order] of statement.orders.entries()) {
    first.heading(
      statement.orders.length > 1
        ? `Purchased products — Order ${index + 1}`
        : "Purchased Products"
    )
    first.text(
      `Order reference: ${order.reference} · ${order.status}`,
      false,
      20,
      8
    )
    first.text(
      `Order date: ${order.orderDate} · Requested delivery: ${order.deliveryDate}`,
      false,
      20,
      10
    )
    first.table(order.rows)
    first.totals(order.totals)
    for (const note of order.notes) first.text(note, false, 20, 8)
  }
  if (!statement.orders.length)
    first.text("Purchased products: Not available. No order is recorded.", true)
  first.heading("Purchase Summary")
  first.fields(statement.summary)
  first.heading("Important Notes")
  for (const note of statement.notes) first.text(note, false, 20, 8)
  const detailed = new Layout("detailed", measure)
  const sections = purchaseReportSections(journal, generatedAt)
  for (const [index, section] of sections.entries()) {
    if (index === 0) {
      detailed.section = section.title
      detailed.newPage()
    } else detailed.heading(section.title)
    for (const block of section.blocks) {
      if (block.type === "text") detailed.text(block.text, block.bold)
      else if (block.type === "product") detailed.product(block)
      else detailed.chart(block)
    }
  }
  const pages = addDetailedContents(first.pages, detailed.pages, measure)
  pages.forEach((page, index) => {
    if (page.part === "statement")
      wrap(STATEMENT_DISCLAIMER, WIDTH, 16, false, measure).forEach(
        (value, i) =>
          page.commands.push({
            kind: "text",
            text: value,
            x: MARGIN,
            y: 1610 + i * 21,
            size: 16,
            bold: false,
            color: TEXT,
          })
      )
    page.commands.push(
      { kind: "line", x: MARGIN, y: 1660, width: WIDTH, color: BORDER },
      {
        kind: "text",
        text: "Valio Aimo — Complete Purchase Report",
        x: MARGIN,
        y: 1695,
        size: 18,
        bold: false,
        color: "#50647B",
      },
      {
        kind: "text",
        text: `Page ${index + 1} of ${pages.length}`,
        x: PDF_WIDTH - MARGIN,
        y: 1695,
        size: 18,
        bold: false,
        color: "#50647B",
        align: "right",
      }
    )
  })
  return pages
}
