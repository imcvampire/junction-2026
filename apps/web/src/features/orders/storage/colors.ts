// One stable colour per order line, used by the top-down plan (CSS) and the AR
// model (hex). Colours repeat past the end of the palette.

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
