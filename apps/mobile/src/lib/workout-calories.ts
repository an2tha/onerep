/**
 * Estimate calories burned during a workout.
 *
 * Uses a simplified MET (Metabolic Equivalent of Task) approach:
 *   Calories = MET × weight_kg × duration_hours
 *
 * If body weight is unavailable, a default of 75 kg is used.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Approximate MET values by exercise category */
export const MET_BY_CATEGORY: Record<string, number> = {
  strength: 5.0,   // General weight training
  cardio: 8.0,     // Vigorous cardio / running
  mobility: 2.5,   // Yoga / stretching
  core: 3.5,       // Core-focused circuit
}

const DEFAULT_WEIGHT_KG = 75
const DEFAULT_MET = 5.0

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkoutCaloriesInput = {
  durationSeconds: number
  /** Primary category of the workout (determines MET). Falls back to DEFAULT_MET. */
  category?: string
  /** User body weight in kg. Falls back to DEFAULT_WEIGHT_KG. */
  weightKg?: number
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Estimate kilocalories burned for a single workout session.
 * Returns 0 for durations ≤ 0.
 */
export function estimateWorkoutCalories({
  durationSeconds,
  category,
  weightKg,
}: WorkoutCaloriesInput): number {
  if (durationSeconds <= 0) return 0
  const met = (category ? MET_BY_CATEGORY[category] : undefined) ?? DEFAULT_MET
  const weight = weightKg != null && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG
  const hours = durationSeconds / 3600
  return Math.round(met * weight * hours)
}

/**
 * Sum burned calories across multiple workout sessions on the same day.
 */
export function totalDayWorkoutCalories(
  sessions: WorkoutCaloriesInput[],
): number {
  return sessions.reduce(
    (sum, s) => sum + estimateWorkoutCalories(s),
    0,
  )
}

/**
 * Adjusted calorie budget: base target minus burned calories (net approach).
 * Never returns below a minimum safe floor of 1200 kcal.
 */
export function adjustedCalorieTarget(
  baseTarget: number,
  burnedCalories: number,
  floor = 1200,
): number {
  return Math.max(floor, baseTarget + burnedCalories)
}
