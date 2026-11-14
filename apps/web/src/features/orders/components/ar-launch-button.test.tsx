import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  PlacementCallbacks,
  PlacementController,
} from "@/features/orders/storage/ar-session"
import type { Block, Room } from "@/features/orders/storage/plan"

import { ArLaunchButton } from "./ar-launch-button"

const ar = vi.hoisted(() => ({
  supportsQuickLook: vi.fn<() => boolean>(() => false),
  loadThree: vi.fn<() => Promise<unknown>>(() => Promise.resolve({})),
  layoutToUsdz: vi.fn<() => Promise<Blob>>(() =>
    Promise.resolve(new Blob(["usdz"]))
  ),
  openInQuickLook: vi.fn<(url: string) => void>(),
}))
vi.mock("@/features/orders/storage/ar", () => ar)

const session = vi.hoisted(() => ({
  controller: {
    place: vi.fn<() => void>(),
    replace: vi.fn<() => void>(),
    end: vi.fn<() => void>(),
  },
  callbacks: null as PlacementCallbacks | null,
}))
vi.mock("@/features/orders/storage/ar-session", () => ({
  startPlacement: vi.fn<
    (
      three: unknown,
      blocks: Block[],
      room: Room,
      overlay: HTMLElement,
      cb: PlacementCallbacks
    ) => PlacementController
  >((_three, _blocks, _room, _overlay, cb) => {
    session.callbacks = cb
    return session.controller
  }),
}))

const blocks: Block[] = [
  {
    id: "0-0",
    lineIndex: 0,
    productId: "A",
    name: "Milk",
    packsInColumn: 2,
    x: 0,
    z: 0,
    w: 0.4,
    d: 0.3,
    h: 0.4,
  },
]
const room: Room = { width: 2, depth: 1, height: 2 }

let urls = 0
beforeEach(() => {
  vi.useFakeTimers()
  ar.supportsQuickLook.mockReturnValue(false)
  urls = 0
  session.callbacks = null
  URL.createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(
    () => `blob:model-${++urls}`
  )
  URL.revokeObjectURL = vi.fn<(url: string) => void>()
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  Reflect.deleteProperty(navigator, "xr")
})

// Two steps: React commits the detected AR mode, which starts the background
// preparation; the second advance lets it finish.
async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
}

function supportWebXr(): void {
  Object.defineProperty(navigator, "xr", {
    configurable: true,
    value: { isSessionSupported: () => Promise.resolve(true) },
  })
}

describe("ArLaunchButton", () => {
  it("opens Quick Look on the first tap with the prepared model", async () => {
    ar.supportsQuickLook.mockReturnValue(true)
    render(<ArLaunchButton blocks={blocks} room={room} />)
    await settle()

    fireEvent.click(screen.getByRole("button", { name: /view in your space/i }))

    expect(ar.openInQuickLook).toHaveBeenCalledWith("blob:model-1")
    expect(screen.getByText(/still lets it be turned/i)).toBeInTheDocument()
  })

  it("disables Quick Look while a changed layout is being rebuilt", async () => {
    ar.supportsQuickLook.mockReturnValue(true)
    const { rerender } = render(<ArLaunchButton blocks={blocks} room={room} />)
    await settle()

    rerender(<ArLaunchButton blocks={[{ ...blocks[0], x: 0.5 }]} room={room} />)
    expect(screen.getByRole("button", { name: /preparing ar/i })).toBeDisabled()

    await settle()
    fireEvent.click(screen.getByRole("button", { name: /view in your space/i }))
    expect(ar.openInQuickLook).toHaveBeenCalledWith("blob:model-2")
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:model-1")
  })

  it("starts the WebXR session on the first tap and only places on clear floor", async () => {
    supportWebXr()
    render(<ArLaunchButton blocks={blocks} room={room} />)
    await settle()

    fireEvent.click(screen.getByRole("button", { name: /view in your space/i }))
    expect(session.callbacks).not.toBeNull()
    expect(screen.getByTestId("ar-overlay")).toHaveClass("flex")

    const place = screen.getByRole("button", { name: /place/i })
    expect(place).toBeDisabled()

    act(() => session.callbacks?.onStatus("blocked"))
    expect(screen.getByText(/something is already there/i)).toBeInTheDocument()
    expect(place).toBeDisabled()

    act(() => session.callbacks?.onStatus("free"))
    expect(place).toBeEnabled()
    fireEvent.click(place)
    expect(session.controller.place).toHaveBeenCalledTimes(1)

    act(() => session.callbacks?.onPhase("placed"))
    expect(screen.getByText(/placed and locked/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /re-place/i }))
    expect(session.controller.replace).toHaveBeenCalledTimes(1)

    act(() => session.callbacks?.onEnd())
    expect(screen.getByTestId("ar-overlay")).toHaveClass("hidden")
  })

  it("lets a phone without depth sensing place after warning", async () => {
    supportWebXr()
    render(<ArLaunchButton blocks={blocks} room={room} />)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: /view in your space/i }))

    act(() => session.callbacks?.onStatus("unchecked"))
    expect(screen.getByText(/obstacles are not checked/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /place/i })).toBeEnabled()
  })

  it("points to a phone when this device has no AR", async () => {
    render(<ArLaunchButton blocks={blocks} room={room} />)
    await settle()
    expect(screen.getByText(/ar opens on a phone/i)).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
