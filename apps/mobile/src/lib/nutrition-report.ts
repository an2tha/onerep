import {
  FOOD_MICRONUTRIENT_KEYS,
  mealLabel,
  offsetDateKey,
  type FoodLogEntry,
  type FoodMicronutrientKey,
} from "./food-log"

// ─── Types ────────────────────────────────────────────────────────────────────

export type NutritionReportRange = "7d" | "14d" | "30d" | "90d"

export const NUTRITION_REPORT_RANGES: {
  id: NutritionReportRange
  label: string
  days: number
}[] = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "14d", label: "14 days", days: 14 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
]

export type NutritionReportGoals = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

export type ReportDayLog = {
  date: string
  entries: FoodLogEntry[]
}

export type ReportMacroTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
  /**
   * Total carbs minus fiber, clamped at zero per entry. Carried alongside
   * `carbs` so the report can honour the net-carb display mode without a
   * second pass over the entries.
   */
  netCarbs: number
}

export type ReportMealBreakdown = {
  meal: string
  label: string
  entries: number
  totals: ReportMacroTotals
  shareOfCalories: number
}

export type ReportDay = {
  date: string
  logged: boolean
  entries: FoodLogEntry[]
  totals: ReportMacroTotals
  micros: Partial<Record<FoodMicronutrientKey, number>>
  /** 0–1, calories vs the calorie goal. `undefined` when no goal is set. */
  goalRatio?: number
}

export type NutritionReport = {
  start: string
  end: string
  days: ReportDay[]
  daysInRange: number
  daysLogged: number
  loggingRate: number
  totals: ReportMacroTotals
  averages: ReportMacroTotals
  /** Averages across logged days only — the honest number for a coach. */
  averagesPerLoggedDay: ReportMacroTotals
  macroSplit: { protein: number; carbs: number; fat: number }
  micros: Partial<Record<FoodMicronutrientKey, number>>
  microAverages: Partial<Record<FoodMicronutrientKey, number>>
  meals: ReportMealBreakdown[]
  goals?: NutritionReportGoals
  goalAdherence?: {
    daysOnTarget: number
    daysUnder: number
    daysOver: number
    averageDeviation: number
  }
  topFoods: { name: string; count: number; calories: number }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_TOTALS: ReportMacroTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  netCarbs: 0,
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0
}

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function rangeDays(range: NutritionReportRange) {
  return (
    NUTRITION_REPORT_RANGES.find((option) => option.id === range)?.days ?? 7
  )
}

/** Inclusive [start, end] date keys ending on `endDate`. */
export function reportRangeBounds(
  endDate: string,
  range: NutritionReportRange
) {
  const days = rangeDays(range)
  return { start: offsetDateKey(endDate, -(days - 1)), end: endDate }
}

export function enumerateDateKeys(start: string, end: string) {
  const keys: string[] = []
  let cursor = start
  // Guard against a reversed range producing an unbounded loop.
  for (let i = 0; i < 400 && cursor <= end; i += 1) {
    keys.push(cursor)
    cursor = offsetDateKey(cursor, 1)
  }
  return keys
}

export function sumEntryTotals(entries: FoodLogEntry[]): ReportMacroTotals {
  return entries.reduce<ReportMacroTotals>(
    (totals, entry) => ({
      calories: totals.calories + number(entry.calories),
      protein: totals.protein + number(entry.protein),
      carbs: totals.carbs + number(entry.carbs),
      fat: totals.fat + number(entry.fat),
      netCarbs:
        totals.netCarbs +
        Math.max(0, number(entry.carbs) - number(entry.fiber)),
    }),
    { ...EMPTY_TOTALS }
  )
}

function sumEntryMicros(entries: FoodLogEntry[]) {
  const micros: Partial<Record<FoodMicronutrientKey, number>> = {}
  for (const entry of entries) {
    for (const key of FOOD_MICRONUTRIENT_KEYS) {
      const value = number(entry[key])
      if (value > 0) micros[key] = (micros[key] ?? 0) + value
    }
  }
  return micros
}

/** Percentage of calories from each macro, using 4/4/9. */
export function macroSplitFromTotals(
  totals: Omit<ReportMacroTotals, "netCarbs">
) {
  const proteinKcal = totals.protein * 4
  const carbsKcal = totals.carbs * 4
  const fatKcal = totals.fat * 9
  const sum = proteinKcal + carbsKcal + fatKcal
  if (sum <= 0) return { protein: 0, carbs: 0, fat: 0 }

  return {
    protein: round((proteinKcal / sum) * 100),
    carbs: round((carbsKcal / sum) * 100),
    fat: round((fatKcal / sum) * 100),
  }
}

// ─── Report builder ───────────────────────────────────────────────────────────

/** A day within ±10% of the calorie goal counts as on target. */
const GOAL_TOLERANCE = 0.1

export function buildNutritionReport(options: {
  start: string
  end: string
  logs: ReportDayLog[]
  goals?: NutritionReportGoals
}): NutritionReport {
  const { start, end, goals } = options
  const byDate = new Map(options.logs.map((log) => [log.date, log.entries]))
  const dateKeys = enumerateDateKeys(start, end)

  const days: ReportDay[] = dateKeys.map((date) => {
    const entries = (byDate.get(date) ?? []).filter(Boolean)
    const totals = sumEntryTotals(entries)
    const goalRatio =
      goals?.calories && goals.calories > 0
        ? totals.calories / goals.calories
        : undefined

    return {
      date,
      logged: entries.length > 0,
      entries,
      totals,
      micros: sumEntryMicros(entries),
      goalRatio,
    }
  })

  const loggedDays = days.filter((day) => day.logged)
  const allEntries = loggedDays.flatMap((day) => day.entries)
  const totals = sumEntryTotals(allEntries)
  const micros = sumEntryMicros(allEntries)

  const perDay = (value: number, divisor: number) =>
    divisor > 0 ? value / divisor : 0

  const averages: ReportMacroTotals = {
    calories: round(perDay(totals.calories, days.length)),
    protein: round(perDay(totals.protein, days.length)),
    carbs: round(perDay(totals.carbs, days.length)),
    fat: round(perDay(totals.fat, days.length)),
    netCarbs: round(perDay(totals.netCarbs, days.length)),
  }
  const averagesPerLoggedDay: ReportMacroTotals = {
    calories: round(perDay(totals.calories, loggedDays.length)),
    protein: round(perDay(totals.protein, loggedDays.length)),
    carbs: round(perDay(totals.carbs, loggedDays.length)),
    fat: round(perDay(totals.fat, loggedDays.length)),
    netCarbs: round(perDay(totals.netCarbs, loggedDays.length)),
  }

  const microAverages: Partial<Record<FoodMicronutrientKey, number>> = {}
  for (const key of FOOD_MICRONUTRIENT_KEYS) {
    const value = micros[key]
    if (value === undefined) continue
    microAverages[key] = round(perDay(value, loggedDays.length), 1)
  }

  return {
    start,
    end,
    days,
    daysInRange: days.length,
    daysLogged: loggedDays.length,
    loggingRate: days.length > 0 ? loggedDays.length / days.length : 0,
    totals: {
      calories: round(totals.calories),
      protein: round(totals.protein),
      carbs: round(totals.carbs),
      fat: round(totals.fat),
      netCarbs: round(totals.netCarbs),
    },
    averages,
    averagesPerLoggedDay,
    macroSplit: macroSplitFromTotals(totals),
    micros,
    microAverages,
    meals: mealBreakdown(allEntries, totals.calories),
    goals,
    goalAdherence: goalAdherence(loggedDays, goals),
    topFoods: topFoods(allEntries),
  }
}

function mealBreakdown(
  entries: FoodLogEntry[],
  totalCalories: number
): ReportMealBreakdown[] {
  const byMeal = new Map<string, FoodLogEntry[]>()
  for (const entry of entries) {
    const meal = entry.meal || "other"
    const bucket = byMeal.get(meal)
    if (bucket) bucket.push(entry)
    else byMeal.set(meal, [entry])
  }

  return [...byMeal.entries()]
    .map(([meal, mealEntries]) => {
      const totals = sumEntryTotals(mealEntries)
      return {
        meal,
        label: mealLabel(meal),
        entries: mealEntries.length,
        totals: {
          calories: round(totals.calories),
          protein: round(totals.protein),
          carbs: round(totals.carbs),
          fat: round(totals.fat),
          netCarbs: round(totals.netCarbs),
        },
        shareOfCalories:
          totalCalories > 0
            ? round((totals.calories / totalCalories) * 100)
            : 0,
      }
    })
    .sort((a, b) => b.totals.calories - a.totals.calories)
}

function goalAdherence(
  loggedDays: ReportDay[],
  goals: NutritionReportGoals | undefined
) {
  if (!goals?.calories || goals.calories <= 0 || loggedDays.length === 0) {
    return undefined
  }

  let daysOnTarget = 0
  let daysUnder = 0
  let daysOver = 0
  let deviationSum = 0

  for (const day of loggedDays) {
    const ratio = day.goalRatio ?? 0
    deviationSum += Math.abs(ratio - 1)
    if (ratio < 1 - GOAL_TOLERANCE) daysUnder += 1
    else if (ratio > 1 + GOAL_TOLERANCE) daysOver += 1
    else daysOnTarget += 1
  }

  return {
    daysOnTarget,
    daysUnder,
    daysOver,
    averageDeviation: round((deviationSum / loggedDays.length) * 100),
  }
}

function topFoods(entries: FoodLogEntry[]) {
  const byName = new Map<string, { count: number; calories: number }>()
  for (const entry of entries) {
    const name = entry.name?.trim()
    if (!name) continue
    const existing = byName.get(name) ?? { count: 0, calories: 0 }
    existing.count += 1
    existing.calories += number(entry.calories)
    byName.set(name, existing)
  }

  return [...byName.entries()]
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      calories: round(stats.calories),
    }))
    .sort((a, b) => b.count - a.count || b.calories - a.calories)
    .slice(0, 10)
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatReportDate(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateKey
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function formatReportRangeLabel(start: string, end: string) {
  return `${formatReportDate(start)} – ${formatReportDate(end)}`
}

export function reportFilename(start: string, end: string) {
  return `onerep-nutrition-${start}-to-${end}`
}
