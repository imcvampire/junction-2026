import example from "@skill-references/journal-example.json"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import type { ValioAimoJournal } from "../journal.types"
import { ReportDownload } from "./report-download"

const download = vi.hoisted(() =>
  vi.fn<(journal: ValioAimoJournal) => Promise<void>>()
)
vi.mock("../purchase-report", () => ({ downloadPurchaseReport: download }))
afterEach(() => vi.clearAllMocks())

test("PDF download uses the currently loaded purchase after replacing a record", async () => {
  download.mockResolvedValue(undefined)
  const first = structuredClone(example) as ValioAimoJournal
  const second = { ...first, title: "A replacement purchase" }
  const { rerender } = render(<ReportDownload journal={first} />)
  fireEvent.click(
    screen.getByRole("button", {
      name: "Download Complete Purchase Report (PDF)",
    })
  )
  await waitFor(() => expect(download).toHaveBeenCalledWith(first))
  await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled())
  rerender(<ReportDownload journal={second} />)
  fireEvent.click(
    screen.getByRole("button", {
      name: "Download Complete Purchase Report (PDF)",
    })
  )
  await waitFor(() => expect(download).toHaveBeenLastCalledWith(second))
})

test("PDF errors show a friendly message without exposing implementation details", async () => {
  download.mockRejectedValue(new Error("internal implementation failure"))
  render(
    <ReportDownload journal={structuredClone(example) as ValioAimoJournal} />
  )
  fireEvent.click(
    screen.getByRole("button", {
      name: "Download Complete Purchase Report (PDF)",
    })
  )
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The PDF could not be created."
  )
  expect(screen.getByRole("alert")).not.toHaveTextContent(
    "internal implementation failure"
  )
})
