import { useEffect, useRef, useState } from "react"
import { RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatNumber } from "@/features/journal-viewer/format"
import {
  buildLayout,
  disposeObject,
  loadOrbitControls,
  loadThree,
  type PackMeta,
} from "@/features/orders/storage/ar"
import type { Block, FitReport, Room } from "@/features/orders/storage/plan"

/* eslint-disable @typescript-eslint/no-explicit-any */
type Three = any

interface Stage {
  THREE: Three
  renderer: Three
  scene: Three
  camera: Three
  controls: Three
  raycaster: Three
  layout: Three | null
  room: Three | null
  render: () => void
}

interface Hover {
  x: number
  y: number
  hostWidth: number
  meta: PackMeta
}

const OVERFLOW_EDGE = 0xdc2626
const OVERLAP_EDGE = 0xd97706
const ROOM_LINE = 0x8a8f98

// Fit the room's bounding sphere in view from a front-right, raised angle.
function frameCamera(stage: Stage, room: Room): void {
  const radius = Math.hypot(room.width, room.depth, room.height) / 2
  const fov = (stage.camera.fov * Math.PI) / 180
  const distance = (radius / Math.sin(fov / 2)) * 1.05
  const dir = new stage.THREE.Vector3(0.75, 0.6, 1).normalize()
  stage.controls.target.set(0, room.height / 2, 0)
  stage.camera.position
    .copy(dir.multiplyScalar(distance))
    .add(stage.controls.target)
  stage.controls.maxDistance = distance * 4
  stage.controls.update()
}

function disposeLayout(layout: Three): void {
  disposeObject(layout)
  for (const m of layout.userData.edgeMaterials ?? []) m.dispose()
}

function roomOutline(THREE: Three, room: Room): Three {
  const group = new THREE.Group()
  const lineMat = new THREE.LineBasicMaterial({
    color: ROOM_LINE,
    transparent: true,
    opacity: 0.55,
  })
  const shell = new THREE.LineSegments(
    new THREE.EdgesGeometry(
      new THREE.BoxGeometry(room.width, room.height, room.depth)
    ),
    lineMat
  )
  shell.position.set(0, room.height / 2, 0)
  group.add(shell)

  const step = 0.5
  const points: number[] = []
  const hw = room.width / 2
  const hd = room.depth / 2
  for (let x = -hw + step; x < hw - 1e-6; x += step) {
    points.push(x, 0.001, -hd, x, 0.001, hd)
  }
  for (let z = -hd + step; z < hd - 1e-6; z += step) {
    points.push(-hw, 0.001, z, hw, 0.001, z)
  }
  const gridGeo = new THREE.BufferGeometry()
  gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3))
  group.add(
    new THREE.LineSegments(
      gridGeo,
      new THREE.LineBasicMaterial({
        color: ROOM_LINE,
        transparent: true,
        opacity: 0.25,
      })
    )
  )
  return group
}

// Live, orbitable 3D view of the layout: every pack drawn as its own box in its
// stack, inside a wireframe of the room. Renders on demand (no animation loop).
export function Storage3dView({
  blocks,
  room,
  fit,
}: {
  blocks: Block[]
  room: Room
  fit: FitReport
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let cleanup = () => {}

    void (async () => {
      try {
        const [THREE, OrbitControls] = await Promise.all([
          loadThree(),
          loadOrbitControls(),
        ])
        if (cancelled) return

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.domElement.className = "block size-full touch-none"
        host.appendChild(renderer.domElement)

        const scene = new THREE.Scene()
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6))
        const sun = new THREE.DirectionalLight(0xffffff, 1.4)
        sun.position.set(3, 6, 4)
        scene.add(sun)

        const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200)
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.maxPolarAngle = Math.PI / 2 - 0.02
        controls.minDistance = 0.3

        const render = () => renderer.render(scene, camera)
        controls.addEventListener("change", render)

        const resize = () => {
          const { clientWidth: w, clientHeight: h } = host
          if (w === 0 || h === 0) return
          renderer.setSize(w, h, false)
          camera.aspect = w / h
          camera.updateProjectionMatrix()
          render()
        }
        const observer = new ResizeObserver(resize)
        observer.observe(host)

        stageRef.current = {
          THREE,
          renderer,
          scene,
          camera,
          controls,
          raycaster: new THREE.Raycaster(),
          layout: null,
          room: null,
          render,
        }
        resize()
        setReady(true)

        cleanup = () => {
          const stage = stageRef.current
          observer.disconnect()
          controls.removeEventListener("change", render)
          controls.dispose()
          if (stage?.layout) disposeLayout(stage.layout)
          if (stage?.room) disposeObject(stage.room)
          renderer.dispose()
          renderer.domElement.remove()
          stageRef.current = null
        }
      } catch (err) {
        if (!cancelled) setError(`Could not load the 3D view (${String(err)}).`)
      }
    })()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage) return
    if (stage.room) {
      stage.scene.remove(stage.room)
      disposeObject(stage.room)
    }
    stage.room = roomOutline(stage.THREE, room)
    stage.scene.add(stage.room)
    frameCamera(stage, room)
    stage.render()
  }, [ready, room])

  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage) return
    if (stage.layout) {
      stage.scene.remove(stage.layout)
      disposeLayout(stage.layout)
    }
    const layout = buildLayout(stage.THREE, blocks, room)
    const overflowMat = new stage.THREE.LineBasicMaterial({
      color: OVERFLOW_EDGE,
    })
    const overlapMat = new stage.THREE.LineBasicMaterial({
      color: OVERLAP_EDGE,
    })
    layout.traverse((o: Three) => {
      const id = o.userData.blockId
      if (!id) return
      if (fit.overflow.has(id)) o.material = overflowMat
      else if (fit.overlapping.has(id)) o.material = overlapMat
    })
    layout.userData.edgeMaterials = [overflowMat, overlapMat]
    stage.layout = layout
    stage.scene.add(layout)
    stage.render()
    setHover(null)
  }, [ready, blocks, room, fit])

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const stage = stageRef.current
    const host = hostRef.current
    if (!stage?.layout || !host || e.buttons !== 0) {
      if (hover) setHover(null)
      return
    }
    const rect = host.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    stage.raycaster.setFromCamera(
      { x: (x / rect.width) * 2 - 1, y: -(y / rect.height) * 2 + 1 },
      stage.camera
    )
    const hit = stage.raycaster
      .intersectObjects(stage.layout.children, false)
      .find((h: Three) => h.object.userData.pack)
    setHover(
      hit
        ? { x, y, hostWidth: rect.width, meta: hit.object.userData.pack }
        : null
    )
  }

  function resetView(): void {
    const stage = stageRef.current
    if (!stage) return
    frameCamera(stage, room)
    stage.render()
  }

  const tallest = blocks.reduce((m, b) => Math.max(m, b.h), 0)

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={hostRef}
        role="img"
        aria-label={`3D storage plan: ${blocks.length} stacks in a ${formatNumber(room.width)} by ${formatNumber(room.depth)} by ${formatNumber(room.height)} metre room, tallest stack ${formatNumber(Math.round(tallest * 100) / 100)} metres`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        className="relative h-[440px] w-full overflow-hidden rounded-lg border bg-muted/30"
      >
        {!ready && !error ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Loading 3D view…
          </p>
        ) : null}
        {error ? (
          <p
            role="status"
            className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-amber-600"
          >
            {error}
          </p>
        ) : null}
        {hover ? (
          <div
            className="pointer-events-none absolute z-10 max-w-60 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
            style={{
              left: Math.min(hover.x + 12, hover.hostWidth - 200),
              top: hover.y + 12,
            }}
          >
            <p className="truncate font-medium">{hover.meta.name}</p>
            <p className="text-muted-foreground tabular-nums">
              Pack {hover.meta.packIndex} of {hover.meta.packsInColumn} from the
              floor ·{" "}
              {formatNumber(Math.round(hover.meta.packHeight * 100) / 100)} m
              each
            </p>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Drag to orbit, scroll or pinch to zoom, right-drag to pan. Hover a
          pack to see where it sits in its stack.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={resetView}
          disabled={!ready}
        >
          <RotateCcwIcon aria-hidden /> Reset view
        </Button>
      </div>
    </div>
  )
}
