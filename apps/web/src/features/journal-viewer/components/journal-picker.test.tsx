import example from "@skill-references/journal-example.json"
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test } from "vitest"

import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createAppRouter } from "@/router"

async function renderViewer() {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ["/journal-viewer"] })
  )
  render(
    <ThemeProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </ThemeProvider>
  )
  return screen.findByLabelText("Journal file")
}

const jsonFile = (text: string, name: string) =>
  new File([text], name, { type: "application/json" })

test("uploading the example journal renders it", async () => {
  const user = userEvent.setup()
  const input = await renderViewer()

  await user.upload(input, jsonFile(JSON.stringify(example), "example.json"))

  expect(
    await screen.findByRole("heading", { name: example.title })
  ).toBeInTheDocument()
  expect(screen.getByText("example.json")).toBeInTheDocument()
})

test("uploading text that is not JSON shows the not-JSON alert", async () => {
  const user = userEvent.setup()
  const input = await renderViewer()

  await user.upload(input, jsonFile("{", "broken.json"))

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This file is not valid JSON."
  )
})

test("uploading a second file replaces the first", async () => {
  const user = userEvent.setup()
  const input = await renderViewer()

  await user.upload(input, jsonFile(JSON.stringify(example), "example.json"))
  await screen.findByRole("heading", { name: example.title })

  await user.upload(input, jsonFile('{"schema": "other"}', "other.json"))

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This file is not a Valio Aimo journal."
  )
  expect(
    screen.queryByRole("heading", { name: example.title })
  ).not.toBeInTheDocument()
})
