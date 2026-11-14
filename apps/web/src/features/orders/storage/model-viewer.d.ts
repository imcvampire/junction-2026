// Minimal JSX typing for the <model-viewer> custom element (loaded from a CDN
// at runtime; see ensureModelViewer in ar.ts).
import type React from "react"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          alt?: string
          ar?: boolean
          "ar-modes"?: string
          "ar-scale"?: string
          "camera-controls"?: boolean
          "shadow-intensity"?: string
          exposure?: string
          poster?: string
        },
        HTMLElement
      >
    }
  }
}
