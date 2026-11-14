import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createAppRouter } from "@/router"

test("the start page redirects to the journal viewer", async () => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }))
  render(
    <ThemeProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </ThemeProvider>
  )

  expect(
    await screen.findByRole("heading", { level: 1, name: "Journal viewer" })
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe("/journal-viewer")
})
