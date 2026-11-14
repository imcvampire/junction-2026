// One stable hue per order line (repeating past the end of the palette), and
// per-stack shades of it by height, shared by the floor plan, the 3D view and
// the AR models.

const PALETTE: { css: string; hex: number }[] = [
  { css: "#2563eb", hex: 0x2563eb },
  { css: "#16a34a", hex: 0x16a34a },
  { css: "#d97706", hex: 0xd97706 },
  { css: "#db2777", hex: 0xdb2777 },
  { css: "#0891b2", hex: 0x0891b2 },
  { css: "#7c3aed", hex: 0x7c3aed },
  { css: "#dc2626", hex: 0xdc2626 },
  { css: "#65a30d", hex: 0x65a30d },
]

export function colorCss(lineIndex: number): string {
  return PALETTE[lineIndex % PALETTE.length].css
}

export function colorHex(lineIndex: number): number {
  return PALETTE[lineIndex % PALETTE.length].hex
}

export interface StackColor {
  css: string
  hex: number
  text: string // label colour that stays readable on this fill
}

// How far the shortest stack of a product is tinted towards white.
const MAX_TINT = 0.55

function tint(hex: number, t: number): number {
  const ch = (shift: number) => {
    const c = (hex >> shift) & 0xff
    return Math.round(c + (255 - c) * t)
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

function luminance(hex: number): number {
  const lin = (shift: number) => {
    const c = ((hex >> shift) & 0xff) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(16) + 0.7152 * lin(8) + 0.0722 * lin(0)
}

/**
 * One colour per stack: the product's hue, shaded by stack height. A product's
 * tallest stacks get the base colour, each shorter height a lighter tint, so
 * stacks of different heights stand apart while products stay recognisable.
 */
export function stackColors(
  blocks: { id: string; lineIndex: number; packsInColumn: number }[]
): Map<string, StackColor> {
  const heights = new Map<number, number[]>()
  for (const b of blocks) {
    const hs = heights.get(b.lineIndex) ?? []
    if (!hs.includes(b.packsInColumn)) hs.push(b.packsInColumn)
    heights.set(b.lineIndex, hs)
  }
  for (const hs of heights.values()) hs.sort((a, b) => b - a)

  const colors = new Map<string, StackColor>()
  for (const b of blocks) {
    const hs = heights.get(b.lineIndex) ?? [b.packsInColumn]
    const rank = hs.indexOf(b.packsInColumn)
    const t = hs.length > 1 ? (MAX_TINT * rank) / (hs.length - 1) : 0
    const hex = tint(colorHex(b.lineIndex), t)
    colors.set(b.id, {
      hex,
      css: `#${hex.toString(16).padStart(6, "0")}`,
      text: luminance(hex) > 0.35 ? "#0f172a" : "#ffffff",
    })
  }
  return colors
}
