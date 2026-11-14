import example from "@skill-references/journal-example.json"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import type { ValioAimoJournal } from "../journal.types"
import { QuoteTables } from "./quote-table"

afterEach(() => vi.restoreAllMocks())

test("keeps all eleven ranked alternatives within a single-row responsive viewport", () => {
  let width = 1200
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => width
  )
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return {
        width,
        height:
          this.getAttribute("role") === "group"
            ? width < 1024
              ? 700
              : 500
            : 0,
      } as DOMRect
    }
  )
  const j = structuredClone(example) as ValioAimoJournal
  j.candidates = []
  const option = j.quotes[0].options[0]
  j.quotes[0].options = [
    option,
    ...Array.from({ length: 11 }, (_, i) => ({
      ...option,
      product_id: `alt-${i}`,
      name: `Alternative ${i + 1}`,
      chosen: false,
      rank: i + 2,
      unit_price: 16 + i,
      line_total: 1600 + i * 100,
    })),
  ]
  const before = JSON.stringify(j)
  render(<QuoteTables journal={j} />)
  const viewport = screen.getByRole("region", {
    name: "Scrollable alternative products",
  })
  expect(
    within(viewport).getAllByRole("group", { name: /, alternative$/ })
  ).toHaveLength(11)
  expect(viewport).toHaveStyle({ height: "500px" })
  const grid = viewport.firstElementChild as HTMLElement
  expect(grid).toHaveClass("lg:grid-cols-2")
  expect(grid.style.gridAutoRows).toBe("minmax(500px, auto)")
  expect(
    within(viewport)
      .getAllByRole("heading")
      .map((h) => h.textContent)
  ).toEqual(Array.from({ length: 11 }, (_, i) => `Alternative ${i + 1}`))
  expect(viewport).toHaveClass("overflow-y-auto", "overflow-x-hidden")
  expect(viewport).not.toHaveTextContent("Other Products Considered")
  const details = within(viewport)
    .getAllByText("View Product Details")[0]
    .closest("details")!
  fireEvent.click(details.querySelector("summary")!)
  fireEvent(details, new Event("toggle"))
  expect(details).toHaveAttribute("open")
  expect(viewport).toHaveStyle({ height: "500px" })
  expect(grid.style.gridAutoRows).toBe("minmax(500px, auto)")
  fireEvent.click(details.querySelector("summary")!)
  width = 390
  fireEvent(window, new Event("resize"))
  expect(viewport).toHaveStyle({ height: "700px" })
  expect(grid.style.gridAutoRows).toBe("minmax(700px, auto)")
  expect(JSON.stringify(j)).toBe(before)
})
