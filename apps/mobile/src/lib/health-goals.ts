import type { CalibrationStatus } from "@repo/ui"

export const ONBOARDING_GOALS = [
  "lose",
  "build",
  "health",
  "performance",
] as const

export const ACTIVITY_LEVELS = [
  "sedentary",
  "lightly_active",
  "moderately_active",
  "very_active",
  "extra_active",
] as const

export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number]
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]
export type CalorieGoal = "lose" | "maintain" | "gain"
export type Sex = "male" | "female"
export type WeightUnit = "kg" | "lbs"

export type OnboardingDraft = {
  age: number
  heightCm: number
  goal: OnboardingGoal | null
}

export type HealthProfileDraft = {
  sex: Sex | null
  age: number
  weightKg: number
  heightCm: number
  activityLevel: ActivityLevel
  goal: CalorieGoal
}

export type MacroGoals = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

export type EffectiveGoalsResult = {
  custom: MacroGoals | null
  health: {
    calories: number
    protein: number
    carbs: number
    fat: number
    bmr: number
    tdee: number
    fiber?: number
    saturatedFatLimit?: number
    sodiumLimit?: number
    calorieStrategy?: string
    safetyMode?: string
    trackingMode?: string
    guidance?: string[]
    source: "healthProfile" | "onboarding"
  } | null
  effective: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  burnedCalories: number
  isTrainingDay: boolean
  macroCyclingEnabled: boolean
  workoutAdjustmentEnabled: boolean
  mealTargetsEnabled: boolean
  /** Always resolved, even when disabled, so the Settings preview can render. */
  mealTargets: { meal: string; percent: number; calories: number }[]
}

export type NutritionPlan = {
  targets: {
    calories: number
    protein: number
    carbs: number
    fat: number
    fiber: number
    saturatedFatLimit: number
    sodiumLimit: number
  }
  safetyMode: "standard" | "habit" | "clinician" | "recovery" | string
  trackingMode:
    | "full"
    | "protein_calories"
    | "photo_portion"
    | "habit"
    | "recovery"
    | string
  visibleMetrics: {
    calories: boolean
    macros: boolean
    protein: boolean
    micros: boolean
    habits: boolean
    water: boolean
    streaks: boolean
  }
  guidance: string[]
  nextBestAction: {
    kind: string
    label: string
    path: string
    detail?: string
  }
  calibration: {
    status: CalibrationStatus
    title: string
    detail: string
    canApply: boolean
    targets?: {
      calories: number
      protein: number
      carbs: number
      fat: number
    }
  }
  mealSuggestions: Array<{
    id: string
    title: string
    detail: string
    action: string
    tags: string[]
    presetId?: string
    recipeId?: string
  }>
}

export function isOnboardingGoal(value: unknown): value is OnboardingGoal {
  return ONBOARDING_GOALS.includes(value as OnboardingGoal)
}

export function mapOnboardingGoalToCalorieGoal(
  goal: OnboardingGoal
): CalorieGoal {
  switch (goal) {
    case "lose":
      return "lose"
    case "build":
    case "performance":
      return "gain"
    case "health":
    default:
      return "maintain"
  }
}
