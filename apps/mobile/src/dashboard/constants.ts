import { tr } from "@repo/ui/i18n"
/**
 * Shared vocabulary for the Today dashboard.
 *
 * The dashboard is assembled from a dozen cards that all need the same accent
 * colors, the same widget identifiers, and the same idea of what a "routine"
 * looks like. Keeping that in one module is the only thing stopping each card
 * from inventing its own.
 */

import { APP_ACCENT_COLORS, tint } from "@repo/ui"
import type { Routine } from "@/lib/workout-sync"

export type WorkoutFocus = "strength" | "cardio" | "mobility"

export type DashboardSettings = {
  workoutFocus: WorkoutFocus
  trendMetric?: import("@repo/ui").TrendMetric
  simpleMode?: boolean
}

export type DashboardWidgetId = "weekPlan" | "progress" | "goals"

export type DashboardWidgetLayoutItem = {
  id: DashboardWidgetId
  size: "full" | "small"
  hidden?: boolean
  pinned?: boolean
}

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetLayoutItem[] = [
  { id: "weekPlan", size: "full" },
  { id: "progress", size: "full" },
  { id: "goals", size: "full" },
]

export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  weekPlan: tr("This week's plan"),
  progress: tr("Progress snapshot"),
  goals: tr("Coach goals"),
}

export type CalorieInfo = {
  target: number
  bmr: number
  tdee: number
  protein: number
  carbs: number
  fat: number
  source: "healthProfile" | "onboarding" | "default"
  isTrainingDay?: boolean
  burnedCalories?: number
}

export type ActiveWorkoutCandidate = {
  slot?: 1 | 2
  completedAt?: number
  abortedAt?: number
  status?: string
  exerciseData?: unknown
  elapsedSeconds?: number
}

export type RoutineDay = keyof Routine

/** How far back the date picker will let the day offset go. */
export const MIN_DAY_OFFSET = -6
export const ABORTED_WORKOUT_SLOT_KEY = "onerep:aborted-workout-slot"
export const DASHBOARD_EMPTY_ICON_CLASS = "size-7 shrink-0 md:size-6"
export const DASHBOARD_SMALL_METRIC_ICON_CLASS =
  "size-[22px] shrink-0 md:size-5"

export const COMPLETE_COLOR = APP_ACCENT_COLORS.complete
export const COMPLETE_BG = tint(COMPLETE_COLOR, 13)
export const COMPLETE_SOFT_BG = tint(COMPLETE_COLOR, 7)
export const CAUTION_COLOR = APP_ACCENT_COLORS.caution
export const DANGER_COLOR = APP_ACCENT_COLORS.danger
export const FOOD_COLOR = APP_ACCENT_COLORS.food
export const FOOD_BG = tint(FOOD_COLOR, 10)
export const WORKOUT_COLOR = APP_ACCENT_COLORS.workout
export const WATER_COLOR = APP_ACCENT_COLORS.water
export const WATER_BG = tint(WATER_COLOR, 13)

export const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const

export const EMPTY_WORKOUT_ROUTINE: Routine = {
  Mon: null,
  Tue: null,
  Wed: null,
  Thu: null,
  Fri: null,
  Sat: null,
  Sun: null,
}

/** The fallback session shown when the routine has nothing scheduled. */
export const WORKOUTS: Record<
  WorkoutFocus,
  { title: string; duration: string; steps: string[] }
> = {
  strength: {
    title: tr("Lift day"),
    duration: tr("45 min"),
    steps: [
      tr("Warm up 5 min"),
      tr("Squat 4 × 5"),
      tr("Bench press 4 × 5"),
      tr("Barbell row 3 × 8"),
    ],
  },
  cardio: {
    title: tr("Cardio day"),
    duration: tr("35 min"),
    steps: [
      tr("Warm up 5 min"),
      tr("Zone 2 run 20 min"),
      tr("Intervals 6 min"),
      tr("Cool down 4 min"),
    ],
  },
  mobility: {
    title: tr("Mobility day"),
    duration: tr("25 min"),
    steps: [
      tr("Breath work 2 min"),
      tr("Joint flow 8 min"),
      tr("Deep stretch 10 min"),
      tr("Walk 5 min"),
    ],
  },
}
