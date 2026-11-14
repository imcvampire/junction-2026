import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createAppRouter } from "@/router"

test("the start page shows how to install the MCP server and skill", async () => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }))
  render(
    <ThemeProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </ThemeProvider>
  )

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: /buy from Valio Aimo/,
    })
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe("/")
  expect(
    screen.getByText(/^Set up the Valio Aimo purchasing tools for me/)
  ).toHaveTextContent("Do not place any orders yet.")
  expect(
    screen.getByText(
      "claude mcp add --transport http --scope user valio-aimo https://95.133.252.52.sslip.io/mcp"
    )
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      /^mkdir -p ~\/\.claude\/skills\s+curl .*valio-aimo-purchasing\.tar\.gz/
    )
  ).toBeInTheDocument()
})

test("journal redesign keeps the shared navigation and theme controls", async () => {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ["/journal-viewer"] })
  )
  const { container } = render(
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </ThemeProvider>
  )
  const heading = await screen.findByRole("heading", {
    name: "Valio Aimo | Purchase Overview",
  })
  expect(heading.closest(".journal-viewer-theme")).toBeInTheDocument()
  const orders = screen.getByRole("link", { name: "Orders" })
  expect(orders).toHaveAttribute("href", "/orders")
  expect(orders.closest(".journal-viewer-theme")).toBeNull()
  expect(
    screen.getByRole("button", { name: /Switch to .* theme/ })
  ).toBeInTheDocument()
  expect(container.querySelector("header .journal-viewer-theme")).toBeNull()
})
