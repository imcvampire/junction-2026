import { useMemo, useRef, useState } from "react"
import { BoxIcon, RotateCcwIcon, ViewIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatNumber } from "@/features/journal-viewer/format"
import { Model3dAr } from "@/features/orders/components/model-3d"
import type { OrderLine, ProductView } from "@/features/orders/types"
import {
  layoutToUsdz,
  openInQuickLook,
  supportsQuickLook,
} from "@/features/orders/storage/ar"
import { colorCss, colorHex } from "@/features/orders/storage/colors"
import {
  DEFAULT_MAX_STACK_M,
  fitReport,
  planSummary,
  recommendLayout,
  recommendedRoom,
  storageItems,
  type Block,
  type Room,
} from "@/features/orders/storage/plan"
import { cn } from "@/lib/utils"

const PLAN_W_PX = 540
const PLAN_D_PX = 440

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function round(v: number, step: number): number {
  return Math.round(v / step) * step
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(clamp(n, min, max))
        }}
        className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
    </label>
  )
}

export function StoragePlanner({
  lines,
  packByProduct,
}: {
  lines: OrderLine[]
  packByProduct: Map<string, ProductView | null>
}) {
  const items = useMemo(
    () =>
      storageItems(
        lines,
        new Map([...packByProduct].map(([id, p]) => [id, p?.pack ?? null]))
      ),
    [lines, packByProduct]
  )

  const [maxStack, setMaxStack] = useState(DEFAULT_MAX_STACK_M)
  const [room, setRoom] = useState<Room>(() =>
    recommendedRoom(items, DEFAULT_MAX_STACK_M)
  )
  const [blocks, setBlocks] = useState<Block[]>(() =>
    recommendLayout(
      items,
      recommendedRoom(items, DEFAULT_MAX_STACK_M),
      DEFAULT_MAX_STACK_M
    )
  )
  const [arBusy, setArBusy] = useState(false)
  const [arError, setArError] = useState<string | null>(null)

  const fit = useMemo(() => fitReport(blocks, room), [blocks, room])
  const summary = useMemo(() => planSummary(items, blocks), [items, blocks])

  const scale = clamp(
    Math.min(PLAN_W_PX / room.width, PLAN_D_PX / room.depth),
    28,
    200
  )
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dz: number } | null>(null)
  const arUrlRef = useRef<string | null>(null)

  function resetToRecommended(stack: number): void {
    const r = recommendedRoom(items, stack)
    setRoom(r)
    setBlocks(recommendLayout(items, r, stack))
  }

  function metresAt(clientX: number, clientY: number): { x: number; z: number } {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, z: 0 }
    return {
      x: ((clientX - rect.left) / rect.width) * room.width,
      z: ((clientY - rect.top) / rect.height) * room.depth,
    }
  }

  function onBlockPointerDown(
    e: React.PointerEvent<SVGGElement>,
    block: Block
  ): void {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = metresAt(e.clientX, e.clientY)
    dragRef.current = { id: block.id, dx: p.x - block.x, dz: p.z - block.z }
  }

  function onBlockPointerMove(e: React.PointerEvent<SVGGElement>): void {
    const drag = dragRef.current
    if (!drag) return
    const p = metresAt(e.clientX, e.clientY)
    setBlocks((bs) =>
      bs.map((b) =>
        b.id === drag.id
          ? {
              ...b,
              x: round(clamp(p.x - drag.dx, -0.3, room.width + 0.3), 0.02),
              z: round(clamp(p.z - drag.dz, -0.3, room.depth + 0.3), 0.02),
            }
          : b
      )
    )
  }

  function onBlockPointerUp(e: React.PointerEvent<SVGGElement>): void {
    dragRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  async function viewInAr(): Promise<void> {
    setArError(null)
    if (!supportsQuickLook()) {
      setArError(
        "AR view needs Safari on an iPhone or iPad. Open this page there and tap View in AR."
      )
      return
    }
    setArBusy(true)
    try {
      const blob = await layoutToUsdz(blocks, room, colorHex)
      if (arUrlRef.current) URL.revokeObjectURL(arUrlRef.current)
      arUrlRef.current = openInQuickLook(blob)
    } catch (err) {
      setArError(`Could not build the AR model (${String(err)}).`)
    } finally {
      setArBusy(false)
    }
  }

  const canPlan = summary.sizedLines > 0
  const gridStep = 0.5

  return (
    <section
      aria-labelledby="storage-heading"
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="storage-heading"
          className="flex items-center gap-2 font-heading text-lg font-semibold"
        >
          <BoxIcon className="size-5" aria-hidden /> Storage plan
        </h2>
        <p className="text-sm text-muted-foreground">
          A suggested way to store this delivery, at true scale. Drag the stacks
          to rearrange, set your room size, then check it in AR.
        </p>
      </div>

      {!canPlan ? (
        <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
          None of this order&rsquo;s products carry package dimensions, so a
          storage plan cannot be drawn.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <NumberField
              label="Room width (m)"
              value={round(room.width, 0.1)}
              min={0.5}
              max={20}
              step={0.1}
              onChange={(width) => setRoom((r) => ({ ...r, width }))}
            />
            <NumberField
              label="Room depth (m)"
              value={round(room.depth, 0.1)}
              min={0.5}
              max={20}
              step={0.1}
              onChange={(depth) => setRoom((r) => ({ ...r, depth }))}
            />
            <NumberField
              label="Room height (m)"
              value={round(room.height, 0.1)}
              min={0.5}
              max={6}
              step={0.1}
              onChange={(height) => setRoom((r) => ({ ...r, height }))}
            />
            <NumberField
              label="Max stack (m)"
              value={round(maxStack, 0.1)}
              min={0.2}
              max={6}
              step={0.1}
              onChange={(v) => {
                setMaxStack(v)
                resetToRecommended(v)
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => resetToRecommended(maxStack)}
            >
              <RotateCcwIcon aria-hidden /> Reset to recommended
            </Button>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="min-w-0 overflow-auto">
              <svg
                ref={svgRef}
                width={room.width * scale}
                height={room.depth * scale}
                viewBox={`0 0 ${room.width * scale} ${room.depth * scale}`}
                role="img"
                aria-label={`Top-down storage plan, room ${formatNumber(room.width)} by ${formatNumber(room.depth)} metres`}
                className="touch-none rounded-lg border bg-muted/30"
              >
                <g>
                  {Array.from(
                    { length: Math.floor(room.width / gridStep) },
                    (_, i) => (
                      <line
                        key={`v${i}`}
                        x1={(i + 1) * gridStep * scale}
                        y1={0}
                        x2={(i + 1) * gridStep * scale}
                        y2={room.depth * scale}
                        className="stroke-foreground/5"
                      />
                    )
                  )}
                  {Array.from(
                    { length: Math.floor(room.depth / gridStep) },
                    (_, i) => (
                      <line
                        key={`h${i}`}
                        x1={0}
                        y1={(i + 1) * gridStep * scale}
                        x2={room.width * scale}
                        y2={(i + 1) * gridStep * scale}
                        className="stroke-foreground/5"
                      />
                    )
                  )}
                </g>
                {blocks.map((b) => {
                  const over = fit.overflow.has(b.id)
                  const lap = fit.overlapping.has(b.id)
                  return (
                    <g
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${b.name}, ${b.packsInColumn} packs, ${formatNumber(b.w)} by ${formatNumber(b.d)} m`}
                      className="cursor-grab touch-none active:cursor-grabbing"
                      onPointerDown={(e) => onBlockPointerDown(e, b)}
                      onPointerMove={onBlockPointerMove}
                      onPointerUp={onBlockPointerUp}
                    >
                      <rect
                        x={b.x * scale}
                        y={b.z * scale}
                        width={b.w * scale}
                        height={b.d * scale}
                        rx={3}
                        fill={colorCss(b.lineIndex)}
                        fillOpacity={0.85}
                        stroke={
                          over ? "#dc2626" : lap ? "#d97706" : "#1f2a44"
                        }
                        strokeWidth={over || lap ? 3 : 1}
                        strokeDasharray={lap && !over ? "5 3" : undefined}
                      />
                      {b.w * scale > 22 && b.d * scale > 16 ? (
                        <text
                          x={(b.x + b.w / 2) * scale}
                          y={(b.z + b.d / 2) * scale}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="pointer-events-none fill-white text-[10px] font-semibold"
                        >
                          {b.packsInColumn}
                        </text>
                      ) : null}
                    </g>
                  )
                })}
              </svg>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div
                className={cn(
                  "rounded-lg border p-3 text-sm",
                  fit.fits
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-amber-500/50 bg-amber-500/5"
                )}
              >
                <p className="font-medium">
                  {fit.fits
                    ? "Everything fits in this room."
                    : `Does not fit yet: ${fit.overflow.size} stack(s) outside the room${fit.overlapping.size ? `, ${fit.overlapping.size} overlapping` : ""}.`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Floor use {Math.round(fit.utilisation * 100)}% ·{" "}
                  {summary.totalColumns} stacks · {summary.totalPacks} packs ·{" "}
                  {formatNumber(Math.round(summary.totalVolumeM3 * 100) / 100)} m³
                  {summary.totalGrossKg !== null
                    ? ` · ${formatNumber(Math.round(summary.totalGrossKg))} kg`
                    : ""}
                </p>
              </div>

              {supportsQuickLook() ? (
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    onClick={() => void viewInAr()}
                    disabled={arBusy}
                  >
                    <ViewIcon aria-hidden />
                    {arBusy ? "Preparing AR…" : "View in your space (AR)"}
                  </Button>
                  {arError ? (
                    <p role="status" className="text-xs text-amber-600">
                      {arError}
                    </p>
                  ) : null}
                </div>
              ) : (
                <Model3dAr blocks={blocks} room={room} />
              )}

              <ul className="flex flex-col gap-1.5 text-sm">
                {items
                  .filter((it) => it.box && it.packs > 0)
                  .map((it) => (
                    <li key={it.lineIndex} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: colorCss(it.lineIndex) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{it.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {it.packs} packs
                        {it.estimated ? " · est. size" : ""}
                      </span>
                    </li>
                  ))}
              </ul>

              {summary.unsizedLines > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {summary.unsizedLines} product(s) have no package dimensions
                  and are left out of the plan.
                </p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
