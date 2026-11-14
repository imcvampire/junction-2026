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
    await screen.findByRole("heading", {
      level: 1,
      name: "Valio Aimo | Purchase Overview",
    })
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe("/journal-viewer")
})

test("developer audit route is separate and declares its lack of access control", async () => {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ["/developer/journal-viewer"] })
  )
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  )
  expect(
    await screen.findByRole("heading", { name: "Developer Purchase Audit" })
  ).toBeInTheDocument()
  expect(screen.getByText(/not a security boundary/)).toBeInTheDocument()
  expect(router.state.location.pathname).toBe("/developer/journal-viewer")
})
