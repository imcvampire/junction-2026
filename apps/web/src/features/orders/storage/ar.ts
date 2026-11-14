// Turns the current storage layout into a USDZ model and launches iOS AR Quick
// Look so the plan can be placed, at true scale, in the real storeroom.
//
// three.js and its USDZ exporter load from a CDN at runtime (see the importmap
// in index.html), so the app takes no npm dependency on them and the frozen
// install is unaffected. The modules are untyped here; usage is isolated and
// narrow.

import type { Block, Room } from "@/features/orders/storage/plan"

/* eslint-disable @typescript-eslint/no-explicit-any */
type Three = any
type Scene = any

// Non-literal types so TypeScript does not try to resolve the module specifier.
const THREE_URL: string =
  "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
const USDZ_URL: string =
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/USDZExporter.js"
const GLTF_URL: string =
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/GLTFExporter.js"
const MODEL_VIEWER_URL =
  "https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js"

let threePromise: Promise<Three> | null = null
function loadThree(): Promise<Three> {
  threePromise ??= import(/* @vite-ignore */ THREE_URL)
  return threePromise
}

/** Does this browser support AR Quick Look (iPhone/iPad Safari)? */
export function supportsQuickLook(): boolean {
  try {
    const a = document.createElement("a")
    // Some engines (and jsdom) throw instead of returning false here.
    return a.relList?.supports?.("ar") ?? false
  } catch {
    return false
  }
}

function buildScene(
  THREE: Three,
  blocks: Block[],
  room: Room,
  colorFor: (lineIndex: number) => number
): Scene {
  const scene = new THREE.Scene()
  // Centre the room on the origin so Quick Look drops it neatly on the surface.
  const ox = -room.width / 2
  const oz = -room.depth / 2

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(room.width, 0.02, room.depth),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c7, roughness: 1 })
  )
  floor.position.set(0, -0.01, 0)
  scene.add(floor)

  for (const b of blocks) {
    const mat = new THREE.MeshStandardMaterial({
      color: colorFor(b.lineIndex),
      roughness: 0.85,
    })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat)
    mesh.position.set(ox + b.x + b.w / 2, b.h / 2, oz + b.z + b.d / 2)
    scene.add(mesh)

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x1f2a44 })
    )
    edges.position.copy(mesh.position)
    scene.add(edges)
  }
  return scene
}

/** Build a USDZ blob of the layout at true scale (metres), for iOS Quick Look. */
export async function layoutToUsdz(
  blocks: Block[],
  room: Room,
  colorFor: (lineIndex: number) => number
): Promise<Blob> {
  const THREE = await loadThree()
  const { USDZExporter } = await import(/* @vite-ignore */ USDZ_URL)
  const scene = buildScene(THREE, blocks, room, colorFor)
  const exporter = new USDZExporter()
  const data = await (exporter.parseAsync
    ? exporter.parseAsync(scene)
    : exporter.parse(scene))
  return new Blob([data], { type: "model/vnd.usdz+zip" })
}

/** Build a binary glTF (GLB) of the layout at true scale, for <model-viewer>. */
export async function layoutToGlb(
  blocks: Block[],
  room: Room,
  colorFor: (lineIndex: number) => number
): Promise<Blob> {
  const THREE = await loadThree()
  const { GLTFExporter } = await import(/* @vite-ignore */ GLTF_URL)
  const scene = buildScene(THREE, blocks, room, colorFor)
  const exporter = new GLTFExporter()
  const glb = (await exporter.parseAsync(scene, {
    binary: true,
  })) as ArrayBuffer
  return new Blob([glb], { type: "model/gltf-binary" })
}

// Lazily register the <model-viewer> custom element from the CDN (Android AR
// runs in-page over WebXR, so a blob GLB works without hosting the file).
let modelViewerPromise: Promise<void> | null = null
export function ensureModelViewer(): Promise<void> {
  if (typeof customElements !== "undefined" && customElements.get("model-viewer")) {
    return Promise.resolve()
  }
  modelViewerPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.type = "module"
    script.src = MODEL_VIEWER_URL
    script.addEventListener("error", () =>
      reject(new Error("Could not load the 3D viewer"))
    )
    document.head.appendChild(script)
    customElements.whenDefined("model-viewer").then(() => resolve(), reject)
  })
  return modelViewerPromise
}

/**
 * Open the layout in AR Quick Look. Must be called synchronously inside a user
 * gesture; returns the object URL so the caller can revoke it later.
 */
export function openInQuickLook(blob: Blob): string {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  // Lock real-world scale so pinch-zoom cannot resize the plan.
  anchor.setAttribute("rel", "ar")
  anchor.href = `${url}#allowsContentScaling=0`
  const img = document.createElement("img")
  img.alt = ""
  anchor.appendChild(img)
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  return url
}
