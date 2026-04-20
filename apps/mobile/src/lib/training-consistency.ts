/**
 * Pure helpers for training-consistency calculations.
 */

/** Format a Date as YYYY-MM-DD using UTC. */
export function dateToIso(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Return a new Date offset by `days` (negative = past). */
export function subtractDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

/**
 * Count the current consecutive-day streak ending on `today`.
 * A day counts if its ISO string is present in `workoutDates`.
 */
export function calcStreak(workoutDates: Set<string>, today: Date): number {
  let streak = 0
  let cursor = new Date(today)
  cursor.setUTCHours(12, 0, 0, 0)
  while (workoutDates.has(dateToIso(cursor))) {
    streak++
    cursor = subtractDays(cursor, 1)
  }
  return streak
}

/**
 * Count workouts logged during the ISO week (Mon–Sun) containing `today`.
 * Days in the future (after `today`) are excluded.
 */
export function calcWorkoutsThisWeek(workoutDates: Set<string>, today: Date): number {
  const ref = new Date(today)
  ref.setUTCHours(12, 0, 0, 0)
  const todayIso = dateToIso(ref)
  const dow = ref.getUTCDay() // 0 = Sun
  const startOfWeek = subtractDays(ref, dow === 0 ? 6 : dow - 1) // back to Monday

  let count = 0
  for (let i = 0; i < 7; i++) {
    const d = subtractDays(startOfWeek, -i)
    if (dateToIso(d) <= todayIso && workoutDates.has(dateToIso(d))) count++
  }
  return count
}

/**
 * Build the list of ISO date strings for the last `days` calendar days,
 * oldest first, ending on (and including) `today`.
 */
export function buildCalendarDays(today: Date, days: number): string[] {
  const ref = new Date(today)
  ref.setUTCHours(12, 0, 0, 0)
  const result: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    result.push(dateToIso(subtractDays(ref, i)))
  }
  return result
}
