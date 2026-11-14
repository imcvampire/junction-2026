import example from "@skill-references/journal-example.json"
import { afterEach, expect, test, vi } from "vitest"
import type { ValioAimoJournal } from "./journal.types"
import {
  downloadPurchaseReport,
  generatePurchaseReport,
} from "./purchase-report"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function canvasRenderer() {
  const drawn: string[] = []
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const context = {
      font: "22px Arial",
      fillStyle: "",
      textAlign: "left",
      strokeStyle: "",
      fillText: (text: string) => {
        drawn.push(text)
      },
      measureText(text: string) {
        return {
          width:
            text.length * Number(this.font.match(/(\d+)px/)?.[1] ?? 22) * 0.52,
        }
      },
      fillRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
    }
    return context as unknown as CanvasRenderingContext2D
  })
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,/9j/2Q=="
  )
  return drawn
}

test("full export pipeline renders statement before detailed pages and preserves the source", async () => {
  const drawn = canvasRenderer()
  const journal = structuredClone(example) as ValioAimoJournal
  const before = JSON.stringify(journal)
  const pdf = await generatePurchaseReport(journal)
  expect(pdf.type).toBe("application/pdf")
  const first = drawn.indexOf("Valio Aimo — Purchase Statement")
  const second = drawn.indexOf("Valio Aimo — Detailed Purchase Report")
  expect(first).toBe(0)
  expect(second).toBeGreaterThan(first)
  expect(drawn).toContain("€1,540.00")
  expect(drawn.some((line) => line.includes("not a tax invoice"))).toBe(true)
  expect(JSON.stringify(journal)).toBe(before)
})

test("download creates exactly one combined PDF with the requested filename", async () => {
  canvasRenderer()
  const create = vi.fn<(blob: Blob) => string>(() => "blob:complete-report")
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = vi.fn<(url: string) => void>()
    }
  )
  let downloadedName = ""
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      downloadedName = this.download
    })
  await downloadPurchaseReport(structuredClone(example) as ValioAimoJournal)
  expect(click).toHaveBeenCalledOnce()
  expect(create).toHaveBeenCalledOnce()
  expect(create.mock.calls[0][0].type).toBe("application/pdf")
  expect(downloadedName).toBe("Valio_Aimo_Complete_Purchase_Report.pdf")
})
