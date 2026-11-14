import example from "@skill-references/journal-example.json"
import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import type { ValioAimoJournal } from "../journal.types"
import { parseJournal } from "../parse-journal"
import { PurchaseOutcome } from "./dashboard"
import { selectedProductDates } from "../evidence"

const fixture = () => structuredClone(example) as ValioAimoJournal
function fact(label: string) {
  return screen.getByText(label, { selector: "dt" }).parentElement!
}

describe("purchase at a glance", () => {
  test("shows five business facts, prominent status and actual example totals", () => {
    render(<PurchaseOutcome journal={fixture()} />)
    expect(
      screen.getByRole("heading", { name: example.title })
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("Key purchase facts").querySelectorAll("dt")
    ).toHaveLength(5)
    expect(fact("Product selected")).toHaveTextContent(
      example.candidates[0].name
    )
    expect(fact("Quantity")).toHaveTextContent(/1[\s,]000 L/)
    expect(fact("Expected delivery date")).toHaveTextContent("16 Nov 2026")
    expect(fact("Total cost excluding VAT")).toHaveTextContent("€1,540.00")
    expect(fact("Human approval needed")).toHaveTextContent("Yes")
    expect(
      screen
        .getAllByText("Purchase Approved")
        .find((node) => node.classList.contains("status-success"))
    ).toBeDefined()
    expect(
      screen.getByRole("heading", { name: "What happens next?" })
    ).toBeInTheDocument()
    expect(
      screen.getByText("Requested / quoted date; delivery not confirmed")
    ).toBeInTheDocument()
  })

  test("does not display a best-before or expiry card in the summary", () => {
    render(<PurchaseOutcome journal={fixture()} />)
    expect(
      screen.queryByText(/Best before|Expiry date/)
    ).not.toBeInTheDocument()
  })

  test("preserves optional product dates without displaying them in the summary", () => {
    const j = fixture()
    j.quotes[0].options[0].best_before_date = "2026-11-30"
    j.quotes[0].options[1].best_before_date = "2026-12-15"
    expect(parseJournal(JSON.stringify(j)).ok).toBe(true)
    render(<PurchaseOutcome journal={j} />)
    expect(
      screen.queryByText(/Best before|Expiry date|30 Nov|15 Dec/)
    ).not.toBeInTheDocument()
    expect(selectedProductDates(j)[0].bestBefore).toBe("2026-11-30")
    expect(j.quotes[0].options[1].best_before_date).toBe("2026-12-15")
  })

  test("distinguishes expiry/use-by dates from best-before dates", () => {
    const j = fixture()
    j.quotes[0].options[0].expiry_date = "2026-11-28"
    render(<PurchaseOutcome journal={j} />)
    expect(selectedProductDates(j)[0].expiry).toBe("2026-11-28")
    expect(
      screen.queryByText("Best before date", { selector: "dt" })
    ).not.toBeInTheDocument()
  })

  test("prioritizes allocated batch dates, retaining each selected batch", () => {
    const j = fixture()
    j.quotes[0].options[0].best_before_date = "2026-12-01"
    j.orders[0].product_dates = [
      { product_id: "464119", batch_id: "A", best_before_date: "2026-11-28" },
      { product_id: "464119", batch_id: "B", best_before_date: "2026-11-30" },
      {
        product_id: "464073",
        batch_id: "Unselected",
        best_before_date: "2026-12-15",
      },
    ]
    expect(parseJournal(JSON.stringify(j)).ok).toBe(true)
    render(<PurchaseOutcome journal={j} />)
    expect(selectedProductDates(j)).toMatchObject([
      { batch: "A", bestBefore: "2026-11-28" },
      { batch: "B", bestBefore: "2026-11-30" },
    ])
    expect(
      screen.queryByText(/Best before|Expiry date|Batch A|Batch B/)
    ).not.toBeInTheDocument()
  })

  test("does not fill a missing batch date using an unallocated product date", () => {
    const j = fixture()
    j.quotes[0].options[0].best_before_date = "2026-12-01"
    j.orders[0].product_dates = [
      { product_id: "464119", batch_id: "A", best_before_date: null },
    ]
    render(<PurchaseOutcome journal={j} />)
    expect(selectedProductDates(j)[0].bestBefore).toBeNull()
  })

  test("retains distinct dates for multiple selected products", () => {
    const j = fixture()
    j.decision!.chosen.push({ product_id: "464073", quantity: 1000 })
    j.orders[0].product_dates = [
      { product_id: "464119", best_before_date: "2026-11-28" },
      { product_id: "464073", expiry_date: "2026-11-30" },
    ]
    render(<PurchaseOutcome journal={j} />)
    expect(selectedProductDates(j)).toMatchObject([
      { productId: "464119", bestBefore: "2026-11-28" },
      { productId: "464073", expiry: "2026-11-30" },
    ])
    expect(
      screen.queryByText(/Best before|Expiry date/)
    ).not.toBeInTheDocument()
  })

  test.each(["2026-02-30", "tomorrow", "2026-11-30T09:00:00Z"])(
    "rejects malformed product dates: %s",
    (date) => {
      const j = fixture()
      j.quotes[0].options[0].best_before_date = date
      expect(parseJournal(JSON.stringify(j)).ok).toBe(false)
    }
  )
})
