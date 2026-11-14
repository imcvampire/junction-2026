import { useMemo, useRef, useState } from "react"
import { BoxIcon, BoxesIcon, MapIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatNumber } from "@/features/journal-viewer/format"
import { ArLaunchButton } from "@/features/orders/components/ar-launch-button"
import { Storage3dView } from "@/features/orders/components/storage-3d-view"
import type { OrderLine, ProductView } from "@/features/orders/types"
import { stackColors } from "@/features/orders/storage/colors"
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
  // toFixed strips float noise such as 2.4000000000000004 from the inputs.
  return Number((Math.round(v / step) * step).toFixed(6))
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

  const fit = useMemo(() => fitReport(blocks, room), [blocks, room])
  const summary = useMemo(() => planSummary(items, blocks), [items, blocks])
  const colors = useMemo(() => stackColors(blocks), [blocks])
  // Per product, each stack height with its shade and how many stacks have it,
  // tallest first, for the legend.
  const heightsByLine = useMemo(() => {
    const byLine = new Map<
      number,
      { packs: number; stacks: number; css: string }[]
    >()
    for (const b of blocks) {
      const rows = byLine.get(b.lineIndex) ?? []
      const row = rows.find((r) => r.packs === b.packsInColumn)
      if (row) row.stacks++
      else
        rows.push({
          packs: b.packsInColumn,
          stacks: 1,
          css: colors.get(b.id)?.css ?? "",
        })
      byLine.set(b.lineIndex, rows)
    }
    for (const rows of byLine.values()) rows.sort((a, b) => b.packs - a.packs)
    return byLine
  }, [blocks, colors])

  const scale = clamp(
    Math.min(PLAN_W_PX / room.width, PLAN_D_PX / room.depth),
    28,
    200
  )
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{
    id: string
    dx: number
    dz: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const sliceSeq = useRef(0)

  function resetToRecommended(stack: number): void {
    const r = recommendedRoom(items, stack)
    setRoom(r)
    setBlocks(recommendLayout(items, r, stack))
  }

  // Changing a room dimension re-packs the stacks so they rearrange to fit the
  // new room rather than being left outside it.
  function changeRoom(patch: Partial<Room>): void {
    const next = { ...room, ...patch }
    setRoom(next)
    setBlocks(recommendLayout(items, next, maxStack))
  }

  function metresAt(
    clientX: number,
    clientY: number
  ): { x: number; z: number } {
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
    dragRef.current = {
      id: block.id,
      dx: p.x - block.x,
      dz: p.z - block.z,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
  }

  function onBlockPointerMove(e: React.PointerEvent<SVGGElement>): void {
    const drag = dragRef.current
    if (!drag) return
    // Ignore tiny jitter so a tap (to slice) is not read as a drag (to move).
    if (
      !drag.moved &&
      Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4
    ) {
      return
    }
    drag.moved = true
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
    const drag = dragRef.current
    dragRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    // A tap with no real drag slices the stack in two.
    if (drag && !drag.moved) sliceBlock(drag.id)
  }

  // Split a stack into two shorter stacks the buyer can place separately. The
  // new slice (the top half) is set down beside the original to be dragged away.
  function sliceBlock(id: string): void {
    setBlocks((bs) => {
      const idx = bs.findIndex((b) => b.id === id)
      if (idx < 0 || bs[idx].packsInColumn < 2) return bs
      const b = bs[idx]
      const packH = b.h / b.packsInColumn
      const top = Math.floor(b.packsInColumn / 2)
      const bottom = b.packsInColumn - top
      const kept: Block = { ...b, packsInColumn: bottom, h: bottom * packH }
      const slice: Block = {
        ...b,
        id: `${b.id}|${sliceSeq.current++}`,
        packsInColumn: top,
        h: top * packH,
        x: round(clamp(b.x + b.w + 0.05, -0.3, room.width + 0.3), 0.02),
        z: b.z,
      }
      const next = [...bs]
      next[idx] = kept
      next.splice(idx + 1, 0, slice)
      return next
    })
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
          A suggested way to store this delivery, at true scale. Drag a stack to
          move it, tap it to slice it in two, see how packs stack up in 3D, then
          check it in AR.
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
              onChange={(width) => changeRoom({ width })}
            />
            <NumberField
              label="Room depth (m)"
              value={round(room.depth, 0.1)}
              min={0.5}
              max={20}
              step={0.1}
              onChange={(depth) => changeRoom({ depth })}
            />
            <NumberField
              label="Room height (m)"
              value={round(room.height, 0.1)}
              min={0.5}
              max={6}
              step={0.1}
              onChange={(height) => changeRoom({ height })}
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
            <Tabs defaultValue="plan" className="min-w-0">
              <TabsList aria-label="Storage plan view">
                <TabsTrigger value="plan">
                  <MapIcon aria-hidden /> Floor plan
                </TabsTrigger>
                <TabsTrigger value="3d">
                  <BoxesIcon aria-hidden /> 3D stacks
                </TabsTrigger>
              </TabsList>
              <TabsContent value="plan" className="min-w-0 overflow-auto">
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
                    const color = colors.get(b.id)
                    const side = Math.min(b.w, b.d) * scale
                    return (
                      <g
                        key={b.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${b.name}, ${b.packsInColumn} packs, ${formatNumber(b.w)} by ${formatNumber(b.d)} m. Press to slice in two.`}
                        className="cursor-grab touch-none active:cursor-grabbing"
                        onPointerDown={(e) => onBlockPointerDown(e, b)}
                        onPointerMove={onBlockPointerMove}
                        onPointerUp={onBlockPointerUp}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            sliceBlock(b.id)
                          }
                        }}
                      >
                        <rect
                          x={b.x * scale}
                          y={b.z * scale}
                          width={b.w * scale}
                          height={b.d * scale}
                          rx={Math.min(3, side / 4)}
                          fill={color?.css}
                          // Fade a stack while it sits on another or outside the
                          // room; solid again once it is in an empty spot it fits.
                          fillOpacity={over || lap ? 0.3 : 1}
                          stroke={
                            over ? "#dc2626" : lap ? "#d97706" : "#1f2a44"
                          }
                          strokeWidth={over || lap ? 3 : 1}
                          strokeDasharray={lap && !over ? "5 3" : undefined}
                        />
                        {side >= 11 ? (
                          <text
                            x={(b.x + b.w / 2) * scale}
                            y={(b.z + b.d / 2) * scale}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={color?.text}
                            fillOpacity={over || lap ? 0.3 : 1}
                            fontSize={clamp(side * 0.55, 7, 11)}
                            className="pointer-events-none font-semibold tabular-nums"
                          >
                            {b.packsInColumn}
                          </text>
                        ) : null}
                      </g>
                    )
                  })}
                </svg>
              </TabsContent>
              <TabsContent value="3d" className="w-full min-w-0 lg:w-[540px]">
                <Storage3dView blocks={blocks} room={room} fit={fit} />
              </TabsContent>
            </Tabs>

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
                  {formatNumber(Math.round(summary.totalVolumeM3 * 100) / 100)}{" "}
                  m³
                  {summary.totalGrossKg !== null
                    ? ` · ${formatNumber(Math.round(summary.totalGrossKg))} kg`
                    : ""}
                </p>
              </div>

              <ArLaunchButton blocks={blocks} room={room} />

              <ul className="flex flex-col gap-1.5 text-sm">
                {items
                  .filter((it) => it.box && it.packs > 0)
                  .map((it) => (
                    <li key={it.lineIndex} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">
                          {it.name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {it.packs} packs
                          {it.estimated ? " · est. size" : ""}
                        </span>
                      </div>
                      <ul
                        aria-label={`Stack heights for ${it.name}`}
                        className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums"
                      >
                        {(heightsByLine.get(it.lineIndex) ?? []).map((h) => (
                          <li
                            key={h.packs}
                            className="flex items-center gap-1.5"
                          >
                            <span
                              aria-hidden
                              className="size-3 shrink-0 rounded-sm"
                              style={{ backgroundColor: h.css }}
                            />
                            {h.packs} high × {h.stacks}{" "}
                            {h.stacks === 1 ? "stack" : "stacks"}
                          </li>
                        ))}
                      </ul>
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
