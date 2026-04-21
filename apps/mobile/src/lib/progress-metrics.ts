/**
 * Pure helpers for body-progress chart computation.
 */

/**
 * Trailing rolling average over `window` elements.
 * Each output value is the mean of the preceding `window` input values (inclusive).
 */
export function rollingAvg(values: number[], window: number): number[] {
  if (window < 1) throw new RangeError("window must be ≥ 1")
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

/**
 * Converts an array of values to SVG polyline points string.
 * Y is scaled so the range fills `height * 0.85` to leave headroom.
 */
export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
  customMin?: number,
  customMax?: number
): string {
  if (values.length === 0) return ""
  const min = customMin ?? Math.min(...values)
  const max = customMax ?? Math.max(...values)
  const range = max - min || 1
  return values
    .map((value, index) => {
      const x =
        values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
      const y = height - ((value - min) / range) * (height * 0.85)
      return `${x},${y}`
    })
    .join(" ")
}
