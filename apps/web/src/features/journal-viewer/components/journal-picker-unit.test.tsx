import example from "@skill-references/journal-example.json"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, test, vi } from "vitest"

import type { JournalLoadResult } from "../parse-journal"
import { JournalPicker } from "./journal-picker"

const exampleFile = (name: string) =>
  new File([JSON.stringify(example)], name, { type: "application/json" })

function renderPicker() {
  const onLoad = vi.fn<(result: JournalLoadResult, fileName: string) => void>()
  render(<JournalPicker onLoad={onLoad} />)
  return { onLoad, input: screen.getByLabelText("Journal file") }
}

test("a dropped file is read and reported", async () => {
  const { onLoad, input } = renderPicker()

  fireEvent.drop(input.closest("label")!, {
    dataTransfer: { files: [exampleFile("dropped.json")] },
  })

  await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1))
  expect(onLoad).toHaveBeenCalledWith(
    expect.objectContaining({ ok: true }),
    "dropped.json"
  )
})

test("a file that cannot be read reports an unreadable error", async () => {
  const { onLoad, input } = renderPicker()
  const file = exampleFile("gone.json")
  vi.spyOn(file, "text").mockRejectedValue(new Error("NotReadableError"))

  fireEvent.change(input, { target: { files: [file] } })

  await waitFor(() =>
    expect(onLoad).toHaveBeenCalledWith(
      { ok: false, error: { kind: "unreadable", message: "NotReadableError" } },
      "gone.json"
    )
  )
})

test("a slow earlier read never replaces a later file", async () => {
  const { onLoad, input } = renderPicker()
  const slow = exampleFile("slow.json")
  let finishSlow: (text: string) => void = () => {}
  vi.spyOn(slow, "text").mockReturnValue(
    new Promise((resolve) => {
      finishSlow = resolve
    })
  )

  fireEvent.change(input, { target: { files: [slow] } })
  fireEvent.change(input, { target: { files: [exampleFile("fast.json")] } })
  await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1))
  finishSlow(JSON.stringify(example))
  await new Promise((resolve) => setTimeout(resolve, 20))

  expect(onLoad).toHaveBeenCalledTimes(1)
  expect(onLoad.mock.calls[0][1]).toBe("fast.json")
})
