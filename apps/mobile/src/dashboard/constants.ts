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
  weekPlan: "This week's plan",
  progress: "Progress snapshot",
  goals: "Coach goals",
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
    title: "Lift day",
    duration: "45 min",
    steps: [
      "Warm up 5 min",
      "Squat 4 × 5",
      "Bench press 4 × 5",
      "Barbell row 3 × 8",
    ],
  },
  cardio: {
    title: "Cardio day",
    duration: "35 min",
    steps: [
      "Warm up 5 min",
      "Zone 2 run 20 min",
      "Intervals 6 min",
      "Cool down 4 min",
    ],
  },
  mobility: {
    title: "Mobility day",
    duration: "25 min",
    steps: [
      "Breath work 2 min",
      "Joint flow 8 min",
      "Deep stretch 10 min",
      "Walk 5 min",
    ],
  },
}
