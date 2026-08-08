/**
 * Trigger logic for the built-in full-screen moments, kept pure so the
 * question of *whether* to interrupt someone can be argued with in a test
 * rather than at 22:40 on a Tuesday with a real user on the other end.
 *
 * Every trigger returns a key or null. The key is the scope one showing
 * covers; null is the answer most of the time, and should be.
 */

import { dateToIso, localNoon, subtractDays } from "./training-consistency"

/**
 * The built-in moments, by id. Shared with the developer menu, which opens
 * them by name and would otherwise be guessing at string literals.
 */
export const MOMENT_IDS = {
  missedLog: "moment.missed-log",
  trainingLapse: "moment.training-lapse",
  weeklyReport: "moment.weekly-report",
} as const

export type MomentId = (typeof MOMENT_IDS)[keyof typeof MOMENT_IDS]

export type MomentFoodEntry = {
  loggedAt?: string
  calories?: number
  protein?: number
}

export type MomentFoodLog = {
  date: string
  entries?: MomentFoodEntry[]
}

export type MomentWorkoutLog = {
  date: string
  durationSeconds?: number
  exercises?: Array<{ sets?: Array<{ completed?: boolean }> }>
}

export type MomentBodyMeasurement = {
  loggedAt: string
  weightKg?: number
}

/** Days of history the "usual time" estimate looks at. */
const HABIT_WINDOW_DAYS = 14
/** Below this many logged days there is no habit to be late for. */
const MIN_HABIT_DAYS = 3
/** How long after the usual time to wait before saying anything. */
const NUDGE_GRACE_MINUTES = 45
/** The estimate is clamped here: nobody gets asked at 07:00 or at midnight. */
const EARLIEST_NUDGE_MINUTES = 11 * 60
const LATEST_NUDGE_MINUTES = 22 * 60 + 30

/** Days off before a lapse is worth a word. */
const LAPSE_DAYS = 4
/** And the lapse only counts for someone who was training in the first place. */
const LAPSE_HISTORY_DAYS = 60
const LAPSE_MIN_SESSIONS = 3

/** Sunday evening is when the week is over in every sense that matters. */
const WEEK_CLOSE_MINUTES = 18 * 60

export function minutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

/** Local minutes-of-day for an ISO timestamp, or null if it is nonsense. */
export function loggedAtMinutes(loggedAt: string | undefined) {
  if (!loggedAt) return null
  const at = new Date(loggedAt)
  if (Number.isNaN(at.getTime())) return null
  return minutesOfDay(at)
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Whole calendar days between two YYYY-MM-DD keys, `from` earlier. */
export function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T12:00:00`).getTime()
  const end = new Date(`${to}T12:00:00`).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.round((end - start) / 86_400_000)
}

function entriesOf(log: MomentFoodLog | undefined) {
  return log?.entries ?? []
}

/**
 * The hour this user is usually done logging, as minutes past midnight.
 *
 * Taken from the last entry of each recent day rather than the first: the
 * question the nudge asks is whether the day went unlogged, and breakfast
 * being late is not that.
 */
export function usualLogMinutes(
  foodLogs: MomentFoodLog[],
  todayKey: string,
  windowDays = HABIT_WINDOW_DAYS
) {
  const earliest = dateToIso(
    subtractDays(localNoon(new Date(`${todayKey}T12:00:00`)), windowDays)
  )

  const lastEntryPerDay: number[] = []
  for (const log of foodLogs) {
    if (log.date >= todayKey || log.date < earliest) continue
    const minutes = entriesOf(log)
      .map((entry) => loggedAtMinutes(entry.loggedAt))
      .filter((value): value is number => value !== null)
    if (minutes.length === 0) continue
    lastEntryPerDay.push(Math.max(...minutes))
  }

  if (lastEntryPerDay.length < MIN_HABIT_DAYS) return null
  const typical = median(lastEntryPerDay)
  if (typical === null) return null
  return clamp(typical, EARLIEST_NUDGE_MINUTES, LATEST_NUDGE_MINUTES)
}

/** Days in the last `windowDays` (today excluded) that carry any food entry. */
export function loggedDaysInWindow(
  foodLogs: MomentFoodLog[],
  todayKey: string,
  windowDays: number
) {
  const earliest = dateToIso(
    subtractDays(localNoon(new Date(`${todayKey}T12:00:00`)), windowDays)
  )
  return foodLogs.filter(
    (log) =>
      log.date < todayKey && log.date >= earliest && entriesOf(log).length > 0
  ).length
}

/**
 * "You have not logged today, and it is past the time you usually have."
 *
 * Returns today's date key when the question is fair to ask, otherwise null.
 */
export function missedLogTrigger({
  foodLogs,
  todayKey,
  nowMinutes,
}: {
  foodLogs: MomentFoodLog[]
  todayKey: string
  nowMinutes: number
}): { key: string; usualMinutes: number } | null {
  const today = foodLogs.find((log) => log.date === todayKey)
  if (entriesOf(today).length > 0) return null

  if (loggedDaysInWindow(foodLogs, todayKey, 7) < MIN_HABIT_DAYS) return null

  const usualMinutes = usualLogMinutes(foodLogs, todayKey)
  if (usualMinutes === null) return null
  if (nowMinutes < usualMinutes + NUDGE_GRACE_MINUTES) return null

  return { key: todayKey, usualMinutes }
}

/**
 * "You have not trained in a while."
 *
 * The key re-arms once a week, so a long absence is one question every seven
 * days rather than one every morning.
 */
export function trainingLapseTrigger({
  workoutLogs,
  todayKey,
}: {
  workoutLogs: MomentWorkoutLog[]
  todayKey: string
}): { key: string; daysSince: number; lastWorkoutDate: string | null } | null {
  const past = workoutLogs
    .map((log) => log.date)
    .filter((date) => date <= todayKey)
    .sort()

  const recentCutoff = dateToIso(
    subtractDays(
      localNoon(new Date(`${todayKey}T12:00:00`)),
      LAPSE_HISTORY_DAYS
    )
  )
  const recentSessions = new Set(past.filter((date) => date >= recentCutoff))
  if (recentSessions.size < LAPSE_MIN_SESSIONS) return null

  const lastWorkoutDate = past.at(-1) ?? null
  if (!lastWorkoutDate) return null

  const daysSince = daysBetween(lastWorkoutDate, todayKey)
  if (daysSince < LAPSE_DAYS) return null

  const week = Math.floor(daysSince / 7)
  return { key: `${lastWorkoutDate}:${week}`, daysSince, lastWorkoutDate }
}

// ── The week ─────────────────────────────────────────────────────────────────

/** Monday of the ISO week containing `dateKey`. */
export function weekStartOf(dateKey: string) {
  const ref = localNoon(new Date(`${dateKey}T12:00:00`))
  const dow = ref.getDay() // 0 = Sunday
  return dateToIso(subtractDays(ref, dow === 0 ? 6 : dow - 1))
}

/** `2026-W32`, the ISO week the Monday `weekStart` belongs to. */
export function isoWeekKey(weekStart: string) {
  const date = new Date(`${weekStart}T12:00:00Z`)
  // Thursday decides the ISO year, which is the entire trick.
  date.setUTCDate(date.getUTCDate() + 3)
  const isoYear = date.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4, 12))
  const offset = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - offset + 3)
  const week =
    1 +
    Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return `${isoYear}-W${String(week).padStart(2, "0")}`
}

/**
 * The most recently finished week, from Sunday evening onwards.
 *
 * Before that the week is still being written, and a report on a week with a
 * Sunday session still in it is a report that is wrong.
 */
export function completedWeek(todayKey: string, nowMinutes: number) {
  const ref = localNoon(new Date(`${todayKey}T12:00:00`))
  const isSunday = ref.getDay() === 0
  const thisWeekStart = weekStartOf(todayKey)

  if (isSunday && nowMinutes >= WEEK_CLOSE_MINUTES) {
    return { start: thisWeekStart, end: todayKey }
  }

  const previousStart = dateToIso(
    subtractDays(localNoon(new Date(`${thisWeekStart}T12:00:00`)), 7)
  )
  return {
    start: previousStart,
    end: dateToIso(
      subtractDays(localNoon(new Date(`${thisWeekStart}T12:00:00`)), 1)
    ),
  }
}

export type WeeklyReport = {
  weekKey: string
  start: string
  end: string
  rangeLabel: string
  headline: string
  training: {
    workouts: number
    activeDays: number
    completedSets: number
    minutes: number
    previousWorkouts: number
  }
  nutrition: {
    loggedDays: number
    averageCalories: number | null
    averageProtein: number | null
    calorieTarget: number
    proteinTarget: number
    onTargetDays: number
  }
  body: {
    latestWeightKg: number | null
    weightDeltaKg: number | null
  }
  highlights: string[]
}

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end
}

function completedSets(log: MomentWorkoutLog) {
  return (log.exercises ?? []).reduce(
    (total, exercise) =>
      total +
      (exercise.sets ?? []).filter((set) => set.completed === true).length,
    0
  )
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function average(values: number[]) {
  if (values.length === 0) return null
  return Math.round(sum(values) / values.length)
}

function rangeLabel(start: string, end: string) {
  const format = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })
  return `${format(start)} – ${format(end)}`
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * The one line at the top. It is allowed to have an opinion; it is not allowed
 * to be cheerful about a week that did not happen.
 */
function headlineFor({
  workouts,
  previousWorkouts,
  loggedDays,
}: {
  workouts: number
  previousWorkouts: number
  loggedDays: number
}) {
  if (workouts === 0 && loggedDays === 0) {
    return "Nothing logged, nothing trained. Weeks like this happen; two in a row is a decision."
  }
  if (workouts === 0) {
    return `You logged ${plural(loggedDays, "day", "days")} of food and trained none of them.`
  }
  if (previousWorkouts === 0) {
    return `${plural(workouts, "session", "sessions")} after a week off. That is the hard one, and it is behind you.`
  }
  if (workouts > previousWorkouts) {
    return `${plural(workouts, "session", "sessions")}, up from ${previousWorkouts}. The line is going the right way.`
  }
  if (workouts < previousWorkouts) {
    return `${plural(workouts, "session", "sessions")}, down from ${previousWorkouts}. Not a collapse. Worth noticing.`
  }
  return `${plural(workouts, "session", "sessions")}, same as last week. Consistency, assuming you meant it.`
}

export function buildWeeklyReport({
  start,
  end,
  foodLogs,
  workoutLogs,
  bodyMeasurements,
  calorieTarget,
  proteinTarget,
}: {
  start: string
  end: string
  foodLogs: MomentFoodLog[]
  workoutLogs: MomentWorkoutLog[]
  bodyMeasurements: MomentBodyMeasurement[]
  calorieTarget: number
  proteinTarget: number
}): WeeklyReport {
  const previousStart = dateToIso(
    subtractDays(localNoon(new Date(`${start}T12:00:00`)), 7)
  )
  const previousEnd = dateToIso(
    subtractDays(localNoon(new Date(`${start}T12:00:00`)), 1)
  )

  const weekWorkouts = workoutLogs.filter((log) =>
    inRange(log.date, start, end)
  )
  const previousWorkouts = workoutLogs.filter((log) =>
    inRange(log.date, previousStart, previousEnd)
  )

  const weekFood = foodLogs.filter(
    (log) => inRange(log.date, start, end) && entriesOf(log).length > 0
  )

  const dailyCalories = weekFood.map((log) =>
    sum(entriesOf(log).map((entry) => entry.calories ?? 0))
  )
  const dailyProtein = weekFood.map((log) =>
    sum(entriesOf(log).map((entry) => entry.protein ?? 0))
  )

  const weights = bodyMeasurements
    .filter((entry) => typeof entry.weightKg === "number")
    .filter((entry) => entry.loggedAt.slice(0, 10) <= end)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
  const weekWeights = weights.filter(
    (entry) => entry.loggedAt.slice(0, 10) >= start
  )
  const firstWeight = weekWeights[0]?.weightKg ?? null
  const lastWeight = weekWeights.at(-1)?.weightKg ?? null
  const latestWeightKg = weights.at(-1)?.weightKg ?? null
  const weightDeltaKg =
    firstWeight !== null && lastWeight !== null && weekWeights.length > 1
      ? Math.round((lastWeight - firstWeight) * 10) / 10
      : null

  const onTargetDays = dailyCalories.filter(
    (calories) => Math.abs(calories - calorieTarget) <= calorieTarget * 0.1
  ).length

  const training = {
    workouts: weekWorkouts.length,
    activeDays: new Set(weekWorkouts.map((log) => log.date)).size,
    completedSets: sum(weekWorkouts.map(completedSets)),
    minutes: Math.round(
      sum(weekWorkouts.map((log) => log.durationSeconds ?? 0)) / 60
    ),
    previousWorkouts: previousWorkouts.length,
  }

  const nutrition = {
    loggedDays: weekFood.length,
    averageCalories: average(dailyCalories),
    averageProtein: average(dailyProtein),
    calorieTarget,
    proteinTarget,
    onTargetDays,
  }

  return {
    weekKey: isoWeekKey(start),
    start,
    end,
    rangeLabel: rangeLabel(start, end),
    headline: headlineFor({
      workouts: training.workouts,
      previousWorkouts: training.previousWorkouts,
      loggedDays: nutrition.loggedDays,
    }),
    training,
    nutrition,
    body: { latestWeightKg, weightDeltaKg },
    highlights: buildHighlights(training, nutrition, weightDeltaKg),
  }
}

function buildHighlights(
  training: WeeklyReport["training"],
  nutrition: WeeklyReport["nutrition"],
  weightDeltaKg: number | null
) {
  const lines: string[] = []

  if (training.completedSets > 0) {
    lines.push(
      `${plural(training.completedSets, "set", "sets")} across ${plural(training.activeDays, "day", "days")}, ${training.minutes} minutes under load.`
    )
  }

  if (nutrition.loggedDays >= 2 && nutrition.averageProtein !== null) {
    const gap = nutrition.averageProtein - nutrition.proteinTarget
    lines.push(
      gap >= 0
        ? `Protein averaged ${nutrition.averageProtein}g, clear of your ${nutrition.proteinTarget}g target.`
        : `Protein averaged ${nutrition.averageProtein}g, ${Math.abs(gap)}g short of target.`
    )
  }

  if (nutrition.loggedDays > 0) {
    lines.push(
      `${plural(nutrition.onTargetDays, "day", "days")} within 10% of your calorie target, out of ${plural(nutrition.loggedDays, "logged day", "logged days")}.`
    )
  }

  if (weightDeltaKg !== null && weightDeltaKg !== 0) {
    lines.push(
      `Weight moved ${weightDeltaKg > 0 ? "+" : ""}${weightDeltaKg}kg across the week.`
    )
  }

  return lines
}

/**
 * Whether last week is worth reporting on, and the report if it is.
 *
 * A week with nothing in it gets no screen. There is no reading of seven empty
 * days that helps anybody.
 */
export function weeklyReportTrigger({
  todayKey,
  nowMinutes,
  foodLogs,
  workoutLogs,
  bodyMeasurements,
  calorieTarget,
  proteinTarget,
}: {
  todayKey: string
  nowMinutes: number
  foodLogs: MomentFoodLog[]
  workoutLogs: MomentWorkoutLog[]
  bodyMeasurements: MomentBodyMeasurement[]
  calorieTarget: number
  proteinTarget: number
}): { key: string; report: WeeklyReport } | null {
  const { start, end } = completedWeek(todayKey, nowMinutes)
  const report = buildWeeklyReport({
    start,
    end,
    foodLogs,
    workoutLogs,
    bodyMeasurements,
    calorieTarget,
    proteinTarget,
  })

  if (report.training.workouts === 0 && report.nutrition.loggedDays === 0) {
    return null
  }

  return { key: report.weekKey, report }
}
