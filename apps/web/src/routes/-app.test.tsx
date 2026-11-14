import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { render, screen, within } from "@testing-library/react"
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

function renderAt(path: string) {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] })
  )
  render(
    <ThemeProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </ThemeProvider>
  )
  return router
}

test("the moon game route shows its start screen", async () => {
  renderAt("/to-the-moon")

  expect(
    await screen.findByRole("heading", { level: 1, name: "ToTheMoon" })
  ).toBeInTheDocument()
  expect(
    screen.getByText("Press Space to build a ladder to the moon")
  ).toBeInTheDocument()
  expect(document.title).toBe("ToTheMoon")
})

test("the header nav links only to Orders and the journal viewer", async () => {
  renderAt("/")

  const nav = await screen.findByRole("navigation", { name: "Features" })
  const links = within(nav).getAllByRole("link")
  expect(links.map((link) => link.textContent)).toEqual([
    "Orders",
    "Journal viewer",
  ])
  expect(
    document.querySelector('a[href*="to-the-moon"]')
  ).not.toBeInTheDocument()
})
