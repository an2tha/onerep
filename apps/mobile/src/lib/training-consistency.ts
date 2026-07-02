/**
 * Pure helpers for training-consistency calculations.
 */

import { localDateKey } from "./utils"

/** Format a Date as YYYY-MM-DD using the local calendar day. */
export function dateToIso(date: Date): string {
  return localDateKey(date)
}

/** Return a copy normalized to local noon for calendar-day calculations. */
export function localNoon(date: Date = new Date()): Date {
  const normalized = new Date(date)
  normalized.setHours(12, 0, 0, 0)
  return normalized
}

/** Return a new Date offset by `days` (negative = past). */
export function subtractDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return d
}

/**
 * Count the current consecutive-day streak ending on `today`.
 * A day counts if its ISO string is present in `workoutDates`.
 */
export function calcStreak(workoutDates: Set<string>, today: Date): number {
  let streak = 0
  let cursor = localNoon(today)
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
  const ref = localNoon(today)
  const todayIso = dateToIso(ref)
  const dow = ref.getDay() // 0 = Sun
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
  const ref = localNoon(today)
  const result: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    result.push(dateToIso(subtractDays(ref, i)))
  }
  return result
}
