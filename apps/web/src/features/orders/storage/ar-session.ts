// A WebXR immersive-ar session (Android Chrome) that places the storage plan on
// the real floor under strict rules: true scale with no pinch-zoom, front edge
// turned towards the viewer then locked (no twist or drag), and placement only
// where the floor is flat and empty, judged from the phone's depth sensing.
//
// WebXR and three.js are untyped here (three loads from a CDN); usage is
// isolated to this module.

import { buildLayout, disposeObject } from "@/features/orders/storage/ar"
import {
  canPlace,
  classifyDepth,
  facingYaw,
  footprintBoxes,
  footprintSamples,
  isFloorHit,
  MIN_FLOOR_BELOW_VIEWER_M,
  type PlacementStatus,
  type Vec3,
} from "@/features/orders/storage/placement"
import type { Block, Room } from "@/features/orders/storage/plan"

/* eslint-disable @typescript-eslint/no-explicit-any */
type Three = any
type XR = any

export type PlacementPhase = "aiming" | "placed"

export interface PlacementCallbacks {
  onStatus: (status: PlacementStatus) => void
  onPhase: (phase: PlacementPhase) => void
  onEnd: () => void
  onError: (message: string) => void
}

export interface PlacementController {
  place: () => void
  replace: () => void
  end: () => void
}

// Depth checks are the expensive part; a few times a second is plenty while
// someone is aiming.
const DEPTH_EVERY_N_FRAMES = 6
const BLOCKED_TINT = 0xb91c1c

interface XrNavigator {
  xr?: { requestSession: (mode: string, init: object) => Promise<XR> }
}

/**
 * Start the session. Call synchronously inside a click handler: requestSession
 * is the first thing this does, so the user gesture is still live.
 */
export function startPlacement(
  THREE: Three,
  blocks: Block[],
  room: Room,
  overlay: HTMLElement,
  cb: PlacementCallbacks
): PlacementController {
  const xr = (navigator as Navigator & XrNavigator).xr
  let session: XR | null = null
  let ended = false

  const controller: PlacementController = {
    place: () => {},
    replace: () => {},
    end: () => {
      ended = true
      void session?.end().catch(() => {})
    },
  }

  if (!xr) {
    cb.onError("This browser does not support AR.")
    return controller
  }

  xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay", "depth-sensing", "anchors"],
    domOverlay: { root: overlay },
    depthSensing: {
      usagePreference: ["cpu-optimized"],
      dataFormatPreference: ["luminance-alpha", "float32"],
    },
  })
    .then((s: XR) => {
      session = s
      if (ended) {
        void s.end()
        return
      }
      return run(THREE, s, blocks, room, overlay, cb, controller)
    })
    .catch((err: unknown) => {
      cb.onError(`AR could not start (${String(err)}).`)
      // Once a session exists its "end" listener reports the end; before
      // that, report it here.
      if (session) void session.end().catch(() => cb.onEnd())
      else cb.onEnd()
    })

  return controller
}

async function run(
  THREE: Three,
  session: XR,
  blocks: Block[],
  room: Room,
  overlay: HTMLElement,
  cb: PlacementCallbacks,
  controller: PlacementController
): Promise<void> {
  // Registered first, so a session that ends during setup (back button, or a
  // setup error below) still tears down and reports the end.
  const cleanups: (() => void)[] = []
  session.addEventListener("end", () => {
    for (const fn of cleanups.reverse()) fn()
    cb.onEnd()
  })

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  cleanups.push(() => renderer.dispose())
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.xr.enabled = true
  renderer.xr.setReferenceSpaceType("local")

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.2)
  sun.position.set(2, 5, 3)
  scene.add(sun)
  const camera = new THREE.PerspectiveCamera()

  const layout = buildLayout(THREE, blocks, room)
  // See-through while aiming so the real floor stays visible; the floor plate
  // is only a faint footprint.
  const packMaterials = new Set<Three>()
  layout.traverse((o: Three) => {
    if (o.userData.pack) {
      o.material.transparent = true
      packMaterials.add(o.material)
    }
    if (o.userData.floor) {
      o.material.transparent = true
      o.material.opacity = 0.25
    }
  })
  layout.visible = false
  scene.add(layout)
  cleanups.push(() => disposeObject(layout))

  const boxes = footprintBoxes(blocks, room)
  const samples = footprintSamples(blocks, room)

  const viewerSpace = await session.requestReferenceSpace("viewer")
  const hitSource = await session.requestHitTestSource({ space: viewerSpace })
  cleanups.push(() => hitSource.cancel?.())
  await renderer.xr.setSession(session)
  // The same "local" space three.js renders in, so poses and the scene agree.
  const local = renderer.xr.getReferenceSpace()

  const hasDepth: boolean =
    session.depthUsage === "cpu-optimized" ||
    (session.enabledFeatures ?? []).includes("depth-sensing")
  const hasOverlay = Boolean(session.domOverlayState)

  let phase: PlacementPhase = "aiming"
  let status: PlacementStatus = "searching"
  let lowestFloorY = Infinity
  let frameCount = 0
  let anchor: XR | null = null
  let wantAnchor = false

  const setStatus = (next: PlacementStatus) => {
    if (next === status) return
    status = next
    cb.onStatus(next)
    const tint = next === "blocked" || next === "no-floor" ? BLOCKED_TINT : 0
    for (const m of packMaterials) {
      m.emissive.setHex(tint)
      m.emissiveIntensity = tint ? 0.6 : 0
    }
  }
  const setPhase = (next: PlacementPhase) => {
    phase = next
    cb.onPhase(next)
    for (const m of packMaterials) m.opacity = next === "placed" ? 1 : 0.7
  }
  setPhase("aiming")
  cb.onStatus(status)

  controller.place = () => {
    if (phase !== "aiming" || !layout.visible || !canPlace(status)) return
    setPhase("placed")
    wantAnchor = true
  }
  controller.replace = () => {
    if (phase !== "placed") return
    anchor?.delete?.()
    anchor = null
    wantAnchor = false
    setPhase("aiming")
    setStatus("searching")
  }

  // Overlay buttons must not double as a screen tap into the AR scene.
  const swallow = (e: Event) => e.preventDefault()
  overlay.addEventListener("beforexrselect", swallow)
  cleanups.push(() => overlay.removeEventListener("beforexrselect", swallow))
  // Without a DOM overlay there are no buttons; a screen tap places instead.
  const onSelect = () => {
    if (!hasOverlay) controller.place()
  }
  session.addEventListener("select", onSelect)
  cleanups.push(() => session.removeEventListener("select", onSelect))

  const inverse = new THREE.Matrix4()
  const viewMatrix = new THREE.Matrix4()
  const viewInverse = new THREE.Matrix4()
  const projection = new THREE.Matrix4()
  const v = new THREE.Vector3()
  const up = new THREE.Vector3()
  const quat = new THREE.Quaternion()

  function measureDepth(frame: XR, view: XR): (Vec3 | null)[] {
    let depth: XR
    try {
      depth = frame.getDepthInformation(view)
    } catch {
      return []
    }
    if (!depth) return []
    layout.updateMatrixWorld(true)
    inverse.copy(layout.matrixWorld).invert()
    viewMatrix.fromArray(view.transform.matrix)
    viewInverse.fromArray(view.transform.inverse.matrix)
    projection.fromArray(view.projectionMatrix)
    return samples.map((s) => {
      v.set(s.x, s.y, s.z).applyMatrix4(layout.matrixWorld)
      v.applyMatrix4(viewInverse) // view space, camera looks down -z
      const expected = -v.z
      if (expected <= 0.05) return null
      const viewPoint = v.clone()
      v.applyMatrix4(projection) // normalised device coordinates
      if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null
      const measured: number = depth.getDepthInMeters(
        (v.x + 1) / 2,
        (1 - v.y) / 2
      )
      if (!(measured > 0)) return null
      viewPoint.multiplyScalar(measured / expected)
      viewPoint.applyMatrix4(viewMatrix).applyMatrix4(inverse)
      return { x: viewPoint.x, y: viewPoint.y, z: viewPoint.z }
    })
  }

  function onFrame(_time: number, frame: XR): void {
    if (!frame) return
    frameCount++
    const viewerPose = frame.getViewerPose(local)
    if (!viewerPose) return

    if (phase === "placed") {
      if (wantAnchor && frame.createAnchor) {
        wantAnchor = false
        const p = layout.position
        quat.copy(layout.quaternion)
        frame
          .createAnchor(
            new (
              globalThis as unknown as { XRRigidTransform: Three }
            ).XRRigidTransform(
              { x: p.x, y: p.y, z: p.z },
              { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
            ),
            local
          )
          .then((a: XR) => {
            if (phase === "placed") anchor = a
            else a.delete?.()
          })
          .catch(() => {})
      }
      if (anchor && frame.trackedAnchors?.has(anchor)) {
        const pose = frame.getPose(anchor.anchorSpace, local)
        if (pose) {
          const t = pose.transform
          layout.position.set(t.position.x, t.position.y, t.position.z)
          layout.quaternion.set(
            t.orientation.x,
            t.orientation.y,
            t.orientation.z,
            t.orientation.w
          )
        }
      }
      renderer.render(scene, camera)
      return
    }

    const hit = frame.getHitTestResults(hitSource)[0]
    const pose = hit?.getPose(local)
    const viewerPos = viewerPose.transform.position
    if (!pose) {
      layout.visible = false
      setStatus("searching")
      renderer.render(scene, camera)
      return
    }
    const hp = pose.transform.position
    const o = pose.transform.orientation
    up.set(0, 1, 0).applyQuaternion(quat.set(o.x, o.y, o.z, o.w))
    if (up.y > 0.9 && viewerPos.y - hp.y > MIN_FLOOR_BELOW_VIEWER_M) {
      lowestFloorY = Math.min(lowestFloorY, hp.y)
    }
    if (!isFloorHit(hp, up.y, lowestFloorY, viewerPos.y)) {
      layout.visible = false
      setStatus("searching")
      renderer.render(scene, camera)
      return
    }

    layout.visible = true
    layout.position.set(hp.x, hp.y, hp.z)
    layout.rotation.set(0, facingYaw(hp, viewerPos), 0)

    if (!hasDepth) {
      setStatus("unchecked")
    } else if (frameCount % DEPTH_EVERY_N_FRAMES === 0) {
      setStatus(classifyDepth(measureDepth(frame, viewerPose.views[0]), boxes))
    }
    renderer.render(scene, camera)
  }

  renderer.setAnimationLoop(onFrame)
  cleanups.push(() => {
    renderer.setAnimationLoop(null)
    anchor?.delete?.()
  })
}
