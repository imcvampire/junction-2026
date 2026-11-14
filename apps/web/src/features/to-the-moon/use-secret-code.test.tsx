import { render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { useSecretCode } from "@/features/to-the-moon/use-secret-code"

afterEach(() => {
  vi.useRealTimers()
})

test("typing the code on the page calls onMatch once", async () => {
  const user = userEvent.setup()
  const onMatch = vi.fn<() => void>()
  renderHook(() => useSecretCode("tothemoon", onMatch))

  await user.keyboard("tothemoon")

  expect(onMatch).toHaveBeenCalledOnce()
})

test("the code typed into a text field does nothing", async () => {
  const user = userEvent.setup()
  const onMatch = vi.fn<() => void>()
  function Harness() {
    useSecretCode("tothemoon", onMatch)
    return <input aria-label="Search" />
  }
  render(<Harness />)

  await user.click(screen.getByLabelText("Search"))
  await user.keyboard("tothemoon")

  expect(onMatch).not.toHaveBeenCalled()
  expect(screen.getByLabelText("Search")).toHaveValue("tothemoon")
})

test("a wrong character in the middle does not match", async () => {
  const user = userEvent.setup()
  const onMatch = vi.fn<() => void>()
  renderHook(() => useSecretCode("tothemoon", onMatch))

  await user.keyboard("tothXemoon")

  expect(onMatch).not.toHaveBeenCalled()
})

test("a pause longer than two seconds resets the code", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const onMatch = vi.fn<() => void>()
  renderHook(() => useSecretCode("tothemoon", onMatch))

  await user.keyboard("tothe")
  vi.advanceTimersByTime(2100)
  await user.keyboard("moon")

  expect(onMatch).not.toHaveBeenCalled()
})

test("holding Meta does not match", async () => {
  const user = userEvent.setup()
  const onMatch = vi.fn<() => void>()
  renderHook(() => useSecretCode("tothemoon", onMatch))

  await user.keyboard("{Meta>}tothemoon{/Meta}")

  expect(onMatch).not.toHaveBeenCalled()
})
