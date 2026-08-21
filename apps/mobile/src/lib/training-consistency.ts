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

/** Number of week columns the dashboard activity graph draws. */
export const ACTIVITY_WEEKS = 18

/** 0 = the day was skipped, 4 = the day was a lot. */
export type ActivityLevel = 0 | 1 | 2 | 3 | 4

export type ActivityCell = {
  date: string
  sets: number
  level: ActivityLevel
  /** Days after today, which the grid draws as holes rather than as rest. */
  future: boolean
}

/**
 * Set count to shading. The bands are deliberately wide at the bottom: the
 * difference between one set and none is the whole argument, and the
 * difference between thirty and forty is a matter for someone else.
 */
export function activityLevel(sets: number): ActivityLevel {
  if (sets <= 0) return 0
  if (sets < 8) return 1
  if (sets < 15) return 2
  if (sets < 22) return 3
  return 4
}

/**
 * Build the activity grid in column-major order: one column per week, Monday
 * at the top, the last column being the week `today` falls in. Days past today
 * are still emitted so every column is seven tall — they carry `future`.
 */
export function buildActivityGrid(
  setsByDate: Map<string, number>,
  today: Date,
  weeks: number = ACTIVITY_WEEKS
): ActivityCell[] {
  const ref = localNoon(today)
  const todayIso = dateToIso(ref)
  const dow = ref.getDay() // 0 = Sun
  const monday = subtractDays(ref, dow === 0 ? 6 : dow - 1)
  const firstMonday = subtractDays(monday, (weeks - 1) * 7)

  const cells: ActivityCell[] = []
  for (let week = 0; week < weeks; week++) {
    for (let day = 0; day < 7; day++) {
      const date = dateToIso(subtractDays(firstMonday, -(week * 7 + day)))
      const sets = setsByDate.get(date) ?? 0
      cells.push({
        date,
        sets,
        level: date > todayIso ? 0 : activityLevel(sets),
        future: date > todayIso,
      })
    }
  }
  return cells
}

/**
 * Days trained in the trailing `days`-day window ending on `today`. Unlike a
 * streak this one bends instead of breaking: a missed Tuesday costs it a
 * point, not the whole thing.
 */
export function calcTrailingSessions(
  workoutDates: Set<string>,
  today: Date,
  days: number
): number {
  const ref = localNoon(today)
  let count = 0
  for (let i = 0; i < days; i++) {
    if (workoutDates.has(dateToIso(subtractDays(ref, i)))) count++
  }
  return count
}

/**
 * Count workouts logged during the ISO week (Mon–Sun) containing `today`.
 * Days in the future (after `today`) are excluded.
 */
export function calcWorkoutsThisWeek(
  workoutDates: Set<string>,
  today: Date
): number {
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
