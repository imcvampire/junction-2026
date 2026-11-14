import { useEffect, useRef, useState } from "react"
import { BoxesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ensureModelViewer,
  layoutToGlb,
} from "@/features/orders/storage/ar"
import { colorHex } from "@/features/orders/storage/colors"
import type { Block, Room } from "@/features/orders/storage/plan"

// A 3D view of the current layout with an in-page AR button. On Android Chrome
// model-viewer launches WebXR AR; on desktop it shows the 3D model and hides
// the AR button.
export function Model3dAr({
  blocks,
  room,
}: {
  blocks: Block[]
  room: Room
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [viewerReady, setViewerReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    []
  )

  async function build(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await ensureModelViewer()
      setViewerReady(true)
      const blob = await layoutToGlb(blocks, room, colorHex)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const next = URL.createObjectURL(blob)
      urlRef.current = next
      setUrl(next)
    } catch (err) {
      setError(`Could not build the 3D model (${String(err)}).`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={() => void build()} disabled={busy}>
        <BoxesIcon aria-hidden />
        {busy
          ? "Building 3D…"
          : url
            ? "Rebuild 3D model"
            : "Build 3D / AR view"}
      </Button>
      {error ? (
        <p role="status" className="text-xs text-amber-600">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Build the model, then tap “View in AR” on Android Chrome to place it
          in your real storeroom.
        </p>
      )}
      {viewerReady && url ? (
        <model-viewer
          src={url}
          alt="3D view of the storage plan"
          ar
          ar-modes="webxr scene-viewer"
          ar-scale="fixed"
          camera-controls
          shadow-intensity="1"
          style={{
            width: "100%",
            height: "360px",
            borderRadius: "0.5rem",
            background: "var(--muted)",
          }}
        />
      ) : null}
    </div>
  )
}
