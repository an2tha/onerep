/**
 * 1RM estimation formulas.
 * All functions take weight (any unit) and reps, return estimated 1RM in the same unit.
 */

/** Epley formula: w × (1 + r/30) */
export function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

/** Brzycki formula: w / (1.0278 − 0.0278 × r). Falls back to Epley for r ≥ 37. */
export function brzycki1RM(weight: number, reps: number): number {
  if (reps === 1) return weight
  if (reps >= 37) return epley1RM(weight, reps)
  return weight / (1.0278 - 0.0278 * reps)
}

/** Average of Epley + Brzycki for a balanced single estimate. */
export function estimate1RM(weight: number, reps: number): number {
  return (epley1RM(weight, reps) + brzycki1RM(weight, reps)) / 2
}

/** Returns percentage breakdowns of an estimated 1RM. */
export function orm1RMBreakdown(
  orm: number
): Array<{ pct: number; weight: number }> {
  return [100, 90, 80, 70, 60].map((pct) => ({
    pct,
    weight: (orm * pct) / 100,
  }))
}
