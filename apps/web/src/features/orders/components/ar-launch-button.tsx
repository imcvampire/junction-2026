import { useEffect, useRef, useState } from "react"
import {
  LockIcon,
  MapPinIcon,
  RotateCcwIcon,
  ViewIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  loadThree,
  layoutToUsdz,
  openInQuickLook,
  supportsQuickLook,
} from "@/features/orders/storage/ar"
import {
  startPlacement,
  type PlacementController,
  type PlacementPhase,
} from "@/features/orders/storage/ar-session"
import {
  canPlace,
  type PlacementStatus,
} from "@/features/orders/storage/placement"
import type { Block, Room } from "@/features/orders/storage/plan"
import { cn } from "@/lib/utils"

type ArMode = "checking" | "quicklook" | "webxr" | "none"

interface PreparedModel {
  url: string
  blocks: Block[]
  room: Room
}

// Rebuild the Quick Look model this long after the last layout change, so
// dragging stacks does not export a model per pointer move.
const PREPARE_DEBOUNCE_MS = 400

const STATUS_TEXT: Record<PlacementStatus, string> = {
  searching: "Point the camera at the floor where the stacks should go.",
  partial: "Step back so the camera sees the whole area.",
  blocked: "Something is already there. Aim at an empty patch of floor.",
  "no-floor": "The floor does not continue under the whole area.",
  free: "The space is clear. Tap Place.",
  unchecked:
    "This phone cannot measure depth, so obstacles are not checked. Make sure the area is empty, then tap Place.",
}

async function detectArMode(): Promise<ArMode> {
  if (supportsQuickLook()) return "quicklook"
  const xr = (
    navigator as Navigator & {
      xr?: { isSessionSupported: (mode: string) => Promise<boolean> }
    }
  ).xr
  try {
    return (await xr?.isSessionSupported("immersive-ar")) ? "webxr" : "none"
  } catch {
    return "none"
  }
}

// One tap straight into AR. Everything AR needs is prepared in the background,
// so the tap can launch synchronously: iOS Quick Look and WebXR both require
// the launch to happen inside the user gesture.
//
// Android (WebXR) runs our own session: pinned to the floor at true scale,
// facing the viewer then locked, and placeable only on clear floor. iOS Quick
// Look anchors to the floor at true scale but always allows twisting and has
// no free-space check; the note under the button says so.
export function ArLaunchButton({
  blocks,
  room,
}: {
  blocks: Block[]
  room: Room
}) {
  const [mode, setMode] = useState<ArMode>("checking")
  const [model, setModel] = useState<PreparedModel | null>(null)
  const [three, setThree] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<{
    phase: PlacementPhase
    status: PlacementStatus
  } | null>(null)
  const lastUrlRef = useRef<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<PlacementController | null>(null)

  useEffect(() => {
    let cancelled = false
    void detectArMode().then((m) => {
      if (!cancelled) setMode(m)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (mode !== "webxr") return
    let cancelled = false
    loadThree()
      .then((t) => {
        if (!cancelled) setThree(() => t)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(`Could not load AR (${String(err)}).`)
      })
    return () => {
      cancelled = true
    }
  }, [mode])

  useEffect(() => {
    if (mode !== "quicklook") return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const blob = await layoutToUsdz(blocks, room)
          if (cancelled) return
          const url = URL.createObjectURL(blob)
          setError(null)
          // The previous URL is revoked only now, so a tap while this model
          // was building never sees a dead URL (the button is disabled then).
          const prev = lastUrlRef.current
          lastUrlRef.current = url
          setModel({ url, blocks, room })
          if (prev) URL.revokeObjectURL(prev)
        } catch (err) {
          if (!cancelled)
            setError(`Could not build the AR model (${String(err)}).`)
        }
      })()
    }, PREPARE_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [mode, blocks, room])

  useEffect(
    () => () => {
      controllerRef.current?.end()
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current)
    },
    []
  )

  if (mode === "checking") return null

  if (mode === "none") {
    return (
      <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
        AR opens on a phone: Safari on iPhone or iPad, or Chrome on an Android
        phone with AR support. Open this order there to place the plan in your
        storeroom. Here, use the 3D stacks tab.
      </p>
    )
  }

  // Quick Look is ready only when its model was built from the layout on
  // screen now; WebXR builds the scene at launch, so it only needs three.js.
  const ready =
    mode === "quicklook"
      ? model !== null && model.blocks === blocks && model.room === room
      : three !== null && session === null

  // No await before the launch call: it must run inside the click gesture.
  function launch(): void {
    if (!ready) return
    setError(null)
    if (mode === "quicklook") {
      if (model) openInQuickLook(model.url)
      return
    }
    const overlay = overlayRef.current
    if (!overlay) return
    setSession({ phase: "aiming", status: "searching" })
    controllerRef.current = startPlacement(three, blocks, room, overlay, {
      onStatus: (status) => setSession((s) => (s ? { ...s, status } : s)),
      onPhase: (phase) => setSession((s) => (s ? { ...s, phase } : s)),
      onError: setError,
      onEnd: () => {
        controllerRef.current = null
        setSession(null)
      },
    })
  }

  const warn = session?.status === "blocked" || session?.status === "no-floor"

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" onClick={launch} disabled={!ready}>
        <ViewIcon aria-hidden />
        {ready || session ? "View in your space (AR)" : "Preparing AR…"}
      </Button>
      {error ? (
        <p role="status" className="text-xs text-amber-600">
          {error}
        </p>
      ) : mode === "quicklook" ? (
        <p className="text-xs text-muted-foreground">
          On iPhone and iPad the plan sits on the floor at true size and cannot
          be resized, but Quick Look still lets it be turned and cannot check
          that the floor is clear. For those checks, use an Android phone.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          The plan stays on the floor at true size, faces you, and can only be
          placed on clear floor. Once placed it is locked.
        </p>
      )}

      {mode === "webxr" ? (
        // The WebXR DOM overlay: shown fullscreen over the camera during the
        // session, hidden on the page otherwise.
        <div
          ref={overlayRef}
          data-testid="ar-overlay"
          className={cn(
            "fixed inset-0 z-50 flex-col justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-white",
            session ? "flex" : "hidden"
          )}
        >
          {session ? (
            <>
              <p
                role="status"
                aria-live="polite"
                className={cn(
                  "mx-auto max-w-sm rounded-lg px-3 py-2 text-center text-sm font-medium shadow-lg",
                  session.phase === "aiming" && warn
                    ? "bg-red-700/90"
                    : session.phase === "aiming" && session.status === "free"
                      ? "bg-emerald-700/90"
                      : "bg-black/70"
                )}
              >
                {session.phase === "placed" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <LockIcon className="size-4" aria-hidden />
                    Placed and locked: it cannot be moved, turned or resized.
                  </span>
                ) : (
                  STATUS_TEXT[session.status]
                )}
              </p>
              <div className="mx-auto flex w-full max-w-sm gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="h-12 flex-1"
                  onClick={() => controllerRef.current?.end()}
                >
                  <XIcon aria-hidden /> Exit
                </Button>
                {session.phase === "placed" ? (
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 flex-1"
                    onClick={() => controllerRef.current?.replace()}
                  >
                    <RotateCcwIcon aria-hidden /> Re-place
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 flex-1"
                    disabled={!canPlace(session.status)}
                    onClick={() => controllerRef.current?.place()}
                  >
                    <MapPinIcon aria-hidden /> Place
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
