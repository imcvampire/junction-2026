// Builds the storage layout as a three.js scene, at true scale, for the 3D view,
// the Android WebXR session (ar-session.ts) and iOS AR Quick Look (USDZ).
//
// three.js and its USDZ exporter load from a CDN at runtime (see the importmap
// in index.html), so the app takes no npm dependency on them and the frozen
// install is unaffected. The modules are untyped here; usage is isolated and
// narrow.

import { stackColors } from "@/features/orders/storage/colors"
import type { Block, Room } from "@/features/orders/storage/plan"

/* eslint-disable @typescript-eslint/no-explicit-any */
type Three = any
type Scene = any

// Non-literal types so TypeScript does not try to resolve the module specifier.
const THREE_URL: string =
  "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
const USDZ_URL: string =
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/USDZExporter.js"
const ORBIT_URL: string =
  "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js"

let threePromise: Promise<Three> | null = null
export function loadThree(): Promise<Three> {
  threePromise ??= import(/* @vite-ignore */ THREE_URL)
  return threePromise
}

export async function loadOrbitControls(): Promise<Three> {
  const { OrbitControls } = await import(/* @vite-ignore */ ORBIT_URL)
  return OrbitControls
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

// Packs shrink by this much per side so neighbouring faces and their edge
// lines do not z-fight. A few millimetres is invisible at storeroom scale.
const PACK_INSET_M = 0.002

export interface PackMeta {
  blockId: string
  name: string
  packIndex: number // 1-based, counted from the floor
  packsInColumn: number
  packHeight: number
}

/**
 * The layout as a group centred on the origin (floor at y = 0): one mesh per
 * pack, stacked in its column, each tagged with PackMeta in userData. Stacks
 * are coloured by product and shaded by height (see stackColors).
 */
export function buildLayout(THREE: Three, blocks: Block[], room: Room): Scene {
  const group = new THREE.Group()
  const ox = -room.width / 2
  const oz = -room.depth / 2

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(room.width, 0.02, room.depth),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c7, roughness: 1 })
  )
  floor.position.set(0, -0.01, 0)
  floor.userData.floor = true
  group.add(floor)

  const colors = stackColors(blocks)
  const materials = new Map<number, Three>()
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1f2a44 })

  for (const b of blocks) {
    const count = Math.max(1, b.packsInColumn)
    const packH = b.h / count
    const hex = colors.get(b.id)?.hex ?? 0x888888
    let mat = materials.get(hex)
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85 })
      materials.set(hex, mat)
    }
    const geometry = new THREE.BoxGeometry(
      Math.max(b.w - 2 * PACK_INSET_M, PACK_INSET_M),
      Math.max(packH - 2 * PACK_INSET_M, PACK_INSET_M),
      Math.max(b.d - 2 * PACK_INSET_M, PACK_INSET_M)
    )
    const edgesGeometry = new THREE.EdgesGeometry(geometry)
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, mat)
      mesh.position.set(
        ox + b.x + b.w / 2,
        packH * i + packH / 2,
        oz + b.z + b.d / 2
      )
      const meta: PackMeta = {
        blockId: b.id,
        name: b.name,
        packIndex: i + 1,
        packsInColumn: count,
        packHeight: packH,
      }
      mesh.userData.pack = meta
      group.add(mesh)

      const edges = new THREE.LineSegments(edgesGeometry, edgeMaterial)
      edges.position.copy(mesh.position)
      edges.userData.blockId = b.id
      group.add(edges)
    }
  }
  return group
}

/** Dispose every geometry and material under an object (shared ones once). */
export function disposeObject(root: Three): void {
  const seen = new Set<unknown>()
  root.traverse((o: Three) => {
    for (const r of [o.geometry, ...[o.material].flat()]) {
      if (r && !seen.has(r)) {
        seen.add(r)
        r.dispose()
      }
    }
  })
}

function buildScene(THREE: Three, blocks: Block[], room: Room): Scene {
  const scene = new THREE.Scene()
  // Centred on the origin so Quick Look drops it neatly on the surface.
  scene.add(buildLayout(THREE, blocks, room))
  return scene
}

/** Build a USDZ blob of the layout at true scale (metres), for iOS Quick Look. */
export async function layoutToUsdz(blocks: Block[], room: Room): Promise<Blob> {
  const THREE = await loadThree()
  const { USDZExporter } = await import(/* @vite-ignore */ USDZ_URL)
  const scene = buildScene(THREE, blocks, room)
  // Anchor to a horizontal plane so Quick Look sets the plan on the floor
  // (r160: parse is async and takes the AR options directly).
  const data = await new USDZExporter().parse(scene, {
    ar: {
      anchoring: { type: "plane" },
      planeAnchoring: { alignment: "horizontal" },
    },
  })
  return new Blob([data], { type: "model/vnd.usdz+zip" })
}

/**
 * Open a prepared USDZ object URL in AR Quick Look. Must be called
 * synchronously inside a user gesture; the caller owns the URL's lifetime.
 */
export function openInQuickLook(usdzUrl: string): void {
  const anchor = document.createElement("a")
  // Lock real-world scale so pinch-zoom cannot resize the plan.
  anchor.setAttribute("rel", "ar")
  anchor.href = `${usdzUrl}#allowsContentScaling=0`
  const img = document.createElement("img")
  img.alt = ""
  anchor.appendChild(img)
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
