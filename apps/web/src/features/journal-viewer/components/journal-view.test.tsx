import example from "@skill-references/journal-example.json"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ValioAimoJournal } from "../journal.types"
import { JournalView } from "./journal-view"
import { DeveloperJournal } from "./developer-journal"

const fixture = () => structuredClone(example) as ValioAimoJournal
function renderJournal(journal = fixture()) {
  return render(
    <TooltipProvider>
      <JournalView journal={journal} />
    </TooltipProvider>
  )
}

describe("customer purchase overview", () => {
  test("shows the customer workflow and actual purchase information", () => {
    renderJournal()
    expect(
      screen.getByRole("heading", { name: example.title })
    ).toBeInTheDocument()
    for (const heading of [
      "Why This Product Was Chosen",
      "Product Comparison",
      "Your Purchasing Decisions",
      "Here's What Happened",
      "Purchase Safety Checks",
      "Your Order Details",
      "Download Purchase Report",
    ])
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument()
    expect(screen.getByLabelText("Key purchase facts")).toHaveTextContent(
      "€1,540.00"
    )
    expect(screen.getByText(/You save/)).toHaveTextContent("€350.00")
    expect(
      screen.getByRole("button", {
        name: "Download Complete Purchase Report (PDF)",
      })
    ).toBeInTheDocument()
  })
  test("customer view contains no audit, identifiers or JSON even when details are opened", () => {
    const { container } = renderJournal()
    for (const summary of container.querySelectorAll("summary"))
      fireEvent.click(summary)
    fireEvent.click(
      screen.getByRole("button", { name: "Check Purchase Record" })
    )
    expect(container.querySelector("pre, code")).toBeNull()
    expect(container.textContent).not.toMatch(
      /agt_mcp|q_example|ord_example|mcp_elicitation|schema_version|client_reference|product_id|GET \/api|POST \/api|Journal structure|Required identifiers|Quote association/
    )
    expect(
      screen.queryByText("Open Advanced Technical Details")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Export purchase record" })
    ).not.toBeInTheDocument()
  })
  test("product details show human-readable packages and all actual candidates", () => {
    renderJournal()
    const selected = screen.getByRole("group", {
      name: /skimmed milk.*selected$/,
    })
    expect(within(selected).getByText("100 cases")).toBeInTheDocument()
    expect(within(selected).getByText("10 L")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: /How We Found Your Products/ })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/10 search results were recorded/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("group", { name: /semi skimmed.*alternative$/ })
    ).toBeInTheDocument()
  })
  test("safety checks remain factual and use neutral styling for missing evidence", () => {
    renderJournal()
    fireEvent.click(
      screen.getByRole("button", { name: "Check Purchase Record" })
    )
    const results = screen.getByLabelText("Purchase safety results")
    expect(results).toHaveTextContent("Product requirements checked")
    expect(results).toHaveTextContent(
      "Order timing could not be fully verified."
    )
    expect(results).toHaveTextContent("Cannot verify")
    for (const badge of within(results).getAllByText("Cannot verify"))
      expect(badge).toHaveClass("text-muted-foreground")
    expect(results).not.toHaveTextContent("Failed")
    expect(screen.getByText("Buyer’s name not recorded")).toBeInTheDocument()
  })
  test.each(["pending_approval", "rejected", "failed"] as const)(
    "handles %s without inventing confirmation",
    (status) => {
      const j = fixture()
      j.outcome = status
      j.orders[0].status = status === "failed" ? "rejected" : status
      j.orders[0].decision =
        status === "pending_approval"
          ? null
          : { decision: "rejected", reason: "Declined" }
      if (status === "pending_approval")
        j.timeline = j.timeline.filter((e) => e.type !== "approval")
      renderJournal(j)
      expect(
        screen.queryByRole("heading", { name: "Purchase Approved" })
      ).not.toBeInTheDocument()
      expect(screen.queryByText("Order Confirmed")).not.toBeInTheDocument()
    }
  )
  test("keeps buyer questions and next actions in the customer workflow", () => {
    const j = fixture()
    j.next_steps = ["Contact the buyer"]
    j.questions = [
      {
        header: "Quantity Changed",
        question: "How much milk do you need?",
        options: [],
        answer: "Change the order to 250 L",
      },
    ]
    renderJournal(j)
    expect(screen.getByText("Change the order to 250 L")).toBeInTheDocument()
    expect(screen.getByText("How much milk do you need?")).toBeInTheDocument()
    expect(screen.getByText("Contact the buyer")).toBeInTheDocument()
    expect(
      screen.getByText("Risk acceptance is not explicitly recorded.")
    ).toBeInTheDocument()
  })
  test("missing records and hostile strings remain safe", () => {
    const j = fixture()
    j.orders = []
    j.quotes = []
    j.candidates = []
    j.decision = null
    j.summary = "<img src=x onerror=alert(1)>"
    j.timeline[0].title = "API_VALIO_API_KEY=hidden-value"
    const { container } = renderJournal(j)
    expect(screen.getByText("No order is recorded.")).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).not.toContain("hidden-value")
  })
})

test("developer view retains original audit data and explicitly disclaims access control", () => {
  render(
    <TooltipProvider>
      <DeveloperJournal initialJournal={fixture()} />
    </TooltipProvider>
  )
  expect(screen.getByText(/not a security boundary/)).toBeInTheDocument()
  expect(
    screen.getByRole("heading", { name: "Technical Validation Results" })
  ).toBeInTheDocument()
  fireEvent.click(screen.getByText("Open Advanced Technical Details"))
  const events = within(
    screen.getByRole("list", { name: "Raw event sequence" })
  ).getAllByRole("listitem")
  expect(events).toHaveLength(6)
  expect(events[0]).toHaveTextContent("whoami")
  expect(events[0]).toHaveTextContent("GET /api/agent/v1/me")
})

test("developer view preserves local JSON export", () => {
  const create = vi.fn<(blob: Blob) => string>(() => "blob:record")
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = vi.fn<(url: string) => void>()
    }
  )
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {})
  try {
    render(
      <TooltipProvider>
        <DeveloperJournal initialJournal={fixture()} />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByText("Open Advanced Technical Details"))
    fireEvent.click(
      screen.getByRole("button", { name: "Export purchase record" })
    )
    expect(create).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
  } finally {
    click.mockRestore()
    vi.unstubAllGlobals()
  }
})
