/** Only explicit supported physical units are normalized; package contents are never guessed. */
export function physicalAmount(
  text?: string | null
): { value: number; unit: "L" | "kg" } | null {
  const match = text?.match(/^\s*(\d+(?:[.,]\d+)?)\s*(l|dl|cl|ml|kg|g)\s*$/i)
  if (!match) return null
  const units: Record<string, [number, "L" | "kg"]> = {
    l: [1, "L"],
    dl: [0.1, "L"],
    cl: [0.01, "L"],
    ml: [0.001, "L"],
    kg: [1, "kg"],
    g: [0.001, "kg"],
  }
  const [factor, unit] = units[match[2].toLowerCase()]
  const value = Number(match[1].replace(",", ".")) * factor
  return value > 0 ? { value, unit } : null
}

export function sameRequestedAmount(a?: string | null, b?: string | null) {
  const left = physicalAmount(a),
    right = physicalAmount(b)
  return left && right
    ? left.unit === right.unit && Math.abs(left.value - right.value) < 1e-9
    : !!a?.trim() && a.trim() === b?.trim()
}
