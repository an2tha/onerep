/**
 * The weekly report, and the app's view of the moment triggers.
 *
 * The trigger logic itself moved to `@repo/models/moments` once the server
 * started asking the same questions — a nudge that fires from a cron and a
 * moment that fires on open must agree about whether this person deserves to
 * be interrupted, and two copies of that rule is one copy too many. What stays
 * here is the report: locale formatting and a headline with an opinion, both
 * of which are presentation and neither of which the server needs.
 */

import {
  completedWeek,
  dateToIso,
  isoWeekKey,
  localNoon,
  subtractDays,
  type MomentBodyMeasurement,
  type MomentFoodLog,
  type MomentWorkoutLog,
} from "@repo/models/moments"

export {
  completedWeek,
  daysAfter,
  daysBetween,
  isoWeekKey,
  loggedAtMinutes,
  loggedDaysInWindow,
  minutesOfDay,
  missedLogTrigger,
  MOMENT_IDS,
  trainingLapseTrigger,
  usualLogMinutes,
  weekStartOf,
  type MomentBodyMeasurement,
  type MomentFoodEntry,
  type MomentFoodLog,
  type MomentId,
  type MomentWorkoutLog,
} from "@repo/models/moments"

function entriesOf(log: MomentFoodLog | undefined) {
  return log?.entries ?? []
}

export type WeeklyReportDay = {
  date: string
  /** Single-letter weekday, for a strip seven columns wide on a phone. */
  label: string
  sets: number
  workouts: number
  calories: number
  loggedFood: boolean
}

export type WeeklyReport = {
  weekKey: string
  start: string
  end: string
  rangeLabel: string
  headline: string
  days: WeeklyReportDay[]
  /** What they said they'd do, if they said anything, and whether they did. */
  target: number | null
  metTarget: boolean | null
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
 *
 * A target the user set themselves outranks every other reading of the week:
 * they said the number, so the number is the story.
 */
function headlineFor({
  workouts,
  previousWorkouts,
  loggedDays,
  target,
}: {
  workouts: number
  previousWorkouts: number
  loggedDays: number
  target: number | null
}) {
  if (target !== null) {
    if (workouts >= target) {
      return `You said ${target}. You did ${workouts}. Nothing further from me.`
    }
    if (workouts === 0) {
      return `You said ${target} sessions and did none of them. It happens; it should not happen twice.`
    }
    return `You said ${target}, you did ${workouts}. Closer than none, short of the plan.`
  }
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
  target = null,
}: {
  start: string
  end: string
  foodLogs: MomentFoodLog[]
  workoutLogs: MomentWorkoutLog[]
  bodyMeasurements: MomentBodyMeasurement[]
  calorieTarget: number
  proteinTarget: number
  /** Sessions the user committed to for this week, if they committed. */
  target?: number | null
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

  // Seven columns, always, including the days nothing happened. A strip that
  // skips the empty days is a strip that hides the point.
  const days: WeeklyReportDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = dateToIso(
      subtractDays(localNoon(new Date(`${start}T12:00:00`)), -index)
    )
    const dayWorkouts = weekWorkouts.filter((log) => log.date === date)
    const food = foodLogs.find((log) => log.date === date)
    const entries = entriesOf(food)
    return {
      date,
      label: new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(
        new Date(`${date}T12:00:00`)
      ),
      sets: sum(dayWorkouts.map(completedSets)),
      workouts: dayWorkouts.length,
      calories: sum(entries.map((entry) => entry.calories ?? 0)),
      loggedFood: entries.length > 0,
    }
  })

  return {
    weekKey: isoWeekKey(start),
    start,
    end,
    rangeLabel: rangeLabel(start, end),
    headline: headlineFor({
      workouts: training.workouts,
      previousWorkouts: training.previousWorkouts,
      loggedDays: nutrition.loggedDays,
      target,
    }),
    days,
    target,
    metTarget: target === null ? null : training.workouts >= target,
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
  target = null,
}: {
  todayKey: string
  nowMinutes: number
  foodLogs: MomentFoodLog[]
  workoutLogs: MomentWorkoutLog[]
  bodyMeasurements: MomentBodyMeasurement[]
  calorieTarget: number
  proteinTarget: number
  target?: number | null
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
    target,
  })

  // A week with nothing in it gets no screen — unless the user set a target
  // for it, in which case the emptiness is the thing they asked to hear about.
  if (
    report.training.workouts === 0 &&
    report.nutrition.loggedDays === 0 &&
    target === null
  ) {
    return null
  }

  return { key: report.weekKey, report }
}
