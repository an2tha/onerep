/**
 * Retention, measured without following anybody around.
 *
 * Umami is cookieless and rotates its visitor hash daily, so it cannot answer
 * "did this person come back on day seven" — and on a phone that drifts between
 * wifi and cell the hash changes anyway. The usual fix is to hand the analytics
 * host a stable user id, which is exactly the thing `analytics.ts` promises not
 * to do.
 *
 * So the cohort is computed here, on the device, and only the bucket is sent.
 * Every open emits `app_open` with the age of the account in days and the week
 * it was created. Umami counts those events; grouping them by `day` gives the
 * retention curve, and filtering to a `cohort` gives one week's copy of it. No
 * identifier is involved at any point, because the arithmetic that would have
 * needed one has already happened.
 *
 * The event fires once per local calendar day. Firing per launch would measure
 * how often people background the app, which is a different and less useful
 * question.
 */

import { isoWeekKey, weekStartOf } from "@repo/models/moments"
import { trackUmami } from "./analytics"
import { safeLocalStorageGet, safeLocalStorageSet } from "./utils"

const LAST_SEEN_KEY = "onerep:retention-day"

/** Format a Date as YYYY-MM-DD in the local calendar, matching the diary. */
export function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Whole calendar days between two day keys.
 *
 * Noon anchors the subtraction so a daylight-saving boundary — a 23- or 25-hour
 * day — still divides into a whole number. Signing up on the evening of the
 * 3rd and opening the app on the morning of the 4th is one day, not zero; the
 * calendar is what "came back the next day" means to a person.
 */
export function daysBetweenDayKeys(fromKey: string, toKey: string) {
  const from = new Date(`${fromKey}T12:00:00`).getTime()
  const to = new Date(`${toKey}T12:00:00`).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.round((to - from) / 86_400_000)
}

/**
 * The first month is reported day by day, because that is where retention is
 * won or lost and where every comparison number in the industry lives. After
 * that the tail is bucketed — four hundred distinct property values would make
 * the Umami breakdown unreadable and tell you nothing a range cannot.
 */
export function dayBucket(daysSinceSignup: number) {
  if (daysSinceSignup < 0) return "unknown"
  if (daysSinceSignup <= 30) return `d${daysSinceSignup}`
  if (daysSinceSignup <= 60) return "d31_60"
  if (daysSinceSignup <= 90) return "d61_90"
  if (daysSinceSignup <= 180) return "d91_180"
  if (daysSinceSignup <= 365) return "d181_365"
  return "d365_plus"
}

export type RetentionProperties = {
  day: string
  cohort: string
  days: number
}

/**
 * The payload for one `app_open`. Returns null when the signup timestamp is
 * missing or nonsense — an event with `day: "unknown"` in it is worse than no
 * event, because it silently pads the day-zero column.
 */
export function retentionProperties(
  signupAt: number | null | undefined,
  now: Date
): RetentionProperties | null {
  if (typeof signupAt !== "number" || !Number.isFinite(signupAt)) return null
  if (signupAt <= 0) return null

  const signupKey = localDateKey(new Date(signupAt))
  const todayKey = localDateKey(now)
  const days = daysBetweenDayKeys(signupKey, todayKey)
  // A clock set backwards, or a signup stamped in the future, lands here.
  if (days === null || days < 0) return null

  return {
    day: dayBucket(days),
    cohort: isoWeekKey(weekStartOf(signupKey)),
    days,
  }
}

/**
 * True when today has not been counted yet. Reading and writing in one call
 * keeps the two from drifting apart at a midnight boundary.
 */
export function claimRetentionDay(todayKey: string) {
  if (safeLocalStorageGet(LAST_SEEN_KEY) === todayKey) return false
  safeLocalStorageSet(LAST_SEEN_KEY, todayKey)
  return true
}

/**
 * Fire the day's `app_open`, if it is owed. Safe to call on every render pass
 * and every resume; all but the first of the day are a string comparison.
 */
export function trackAppOpen(
  signupAt: number | null | undefined,
  now: Date = new Date()
) {
  const properties = retentionProperties(signupAt, now)
  if (!properties) return false
  if (!claimRetentionDay(localDateKey(now))) return false
  trackUmami("app_open", properties)
  return true
}
