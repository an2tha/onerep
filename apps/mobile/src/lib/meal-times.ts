import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"
import { isFoodLogTime } from "@/lib/food-log-context"

/**
 * Per-meal default log times.
 *
 * Logging breakfast at 9pm for 7am is the normal case, not the edge case —
 * the day is reviewed after it happened. Rather than asking for a time on
 * every entry, the meal tag answers it: "breakfast" means 08:00 until the
 * user says otherwise, and every logging surface that already knows the meal
 * can stamp correctly without growing a time input.
 *
 * Times are per-device (localStorage), like the custom meal categories this
 * generalises. The tag is a default, never a cage: an explicit time always
 * wins, and editing an entry can always change it afterwards.
 */

export type MealTimeDefaults = Partial<Record<string, string>>

const MEAL_TIMES_KEY = "onerep_meal_time_defaults"

/** Sensible first-run defaults; the settings screen makes every one editable. */
export const DEFAULT_MEAL_TIMES: Record<string, string> = {
  breakfast: "08:00",
  lunch: "12:30",
  dinner: "19:00",
  snack: "15:00",
}

export function readMealTimes(): MealTimeDefaults {
  try {
    const raw = safeLocalStorageGet(MEAL_TIMES_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }
    const times: MealTimeDefaults = {}
    for (const [meal, time] of Object.entries(parsed)) {
      if (typeof time === "string" && isFoodLogTime(time)) times[meal] = time
      else if (typeof time === "string" && isMealTimeOff(time)) times[meal] = time
    }
    return times
  } catch {
    return {}
  }
}

export function writeMealTimes(times: MealTimeDefaults): void {
  const clean: MealTimeDefaults = {}
  for (const [meal, time] of Object.entries(times)) {
    if ((isFoodLogTime(time) || isMealTimeOff(time)) && time) clean[meal] = time
  }
  safeLocalStorageSet(MEAL_TIMES_KEY, JSON.stringify(clean))
}

/** The "off" marker: a meal tagged with this logs at the real clock time. */
export const MEAL_TIME_OFF = "off"

export function isMealTimeOff(value: string): boolean {
  return value === MEAL_TIME_OFF
}

/**
 * The log time a meal tag implies, or null when the tag has no time (unset,
 * or the user turned the default off for that meal).
 */
export function mealDefaultTime(meal: string): string | null {
  const times = readMealTimes()
  const stored = times[meal]
  if (stored) return isMealTimeOff(stored) ? null : stored
  return DEFAULT_MEAL_TIMES[meal] ?? null
}
