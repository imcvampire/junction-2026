import type { ValioAimoJournal } from "./journal.types"
import { planCompletePurchaseReport, PDF_WIDTH, PDF_HEIGHT } from "./pdf-layout"

export { purchaseReportSections } from "./customer-report"
/** Minimal standards-based PDF container for browser-rendered A4 pages.
 * Images preserve Unicode via browser fonts; no uploaded data or third-party services.
 */
export function pdfFromJpegPages(
  images: Uint8Array[],
  width: number,
  height: number
): Blob {
  if (!images.length || width <= 0 || height <= 0)
    throw new Error("A PDF needs at least one page with positive dimensions")
  const encoder = new TextEncoder()
  const parts: BlobPart[] = []
  let length = 0
  const offsets: number[] = [0]
  const append = (value: string | Uint8Array) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value
    parts.push(bytes as BlobPart)
    length += bytes.byteLength
  }
  const object = (id: number, body: string | (() => void)) => {
    offsets[id] = length
    append(`${id} 0 obj\n`)
    if (typeof body === "string") append(body)
    else body()
    append("\nendobj\n")
  }
  append("%PDF-1.4\n%Rendered purchase report\n")
  object(1, "<< /Type /Catalog /Pages 2 0 R >>")
  object(
    2,
    `<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`
  )
  images.forEach((bytes, i) => {
    const pageId = 3 + i * 3
    object(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /PageImage ${pageId + 1} 0 R >> >> /Contents ${pageId + 2} 0 R >>`
    )
    object(pageId + 1, () => {
      append(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`
      )
      append(bytes)
      append("\nendstream")
    })
    const content = "q\n595.28 0 0 841.89 0 0 cm\n/PageImage Do\nQ\n"
    object(
      pageId + 2,
      `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`
    )
  })
  const start = length
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`)
  for (const offset of offsets.slice(1))
    append(`${String(offset).padStart(10, "0")} 00000 n \n`)
  append(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  )
  return new Blob(parts, { type: "application/pdf" })
}

export async function generatePurchaseReport(
  journal: ValioAimoJournal
): Promise<Blob> {
  await document.fonts?.ready
  const measurement = document.createElement("canvas").getContext("2d")
  if (!measurement) throw new Error("This browser cannot render PDF pages")
  const pages = planCompletePurchaseReport(journal, (text, size, bold) => {
    measurement.font = `${bold ? 600 : 400} ${size}px "Geist Variable", Arial, sans-serif`
    return measurement.measureText(text).width
  })
  const images: Uint8Array[] = []
  for (const page of pages) {
    const canvas = document.createElement("canvas")
    canvas.width = PDF_WIDTH
    canvas.height = PDF_HEIGHT
    const context = canvas.getContext("2d")
    if (!context) throw new Error("This browser cannot render PDF pages")
    context.fillStyle = "#FFFFFF"
    context.fillRect(0, 0, PDF_WIDTH, PDF_HEIGHT)
    for (const command of page.commands) {
      if (command.kind === "text") {
        context.font = `${command.bold ? 600 : 400} ${command.size}px "Geist Variable", Arial, sans-serif`
        context.fillStyle = command.color
        context.textAlign = command.align ?? "left"
        context.fillText(command.text, command.x, command.y)
      } else if (command.kind === "rect") {
        context.fillStyle = command.color
        context.fillRect(command.x, command.y, command.width, command.height)
      } else {
        context.strokeStyle = command.color
        context.beginPath()
        context.moveTo(command.x, command.y)
        context.lineTo(command.x + command.width, command.y)
        context.stroke()
      }
    }
    const encoded = canvas.toDataURL("image/jpeg", 0.94).split(",")[1]
    images.push(
      Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
    )
    canvas.width = 0
    canvas.height = 0
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  return pdfFromJpegPages(images, PDF_WIDTH, PDF_HEIGHT)
}
export async function downloadPurchaseReport(journal: ValioAimoJournal) {
  const pdf = await generatePurchaseReport(journal)
  const url = URL.createObjectURL(pdf)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = "Valio_Aimo_Complete_Purchase_Report.pdf"
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
