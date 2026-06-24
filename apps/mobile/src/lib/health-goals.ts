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
}

export function isOnboardingGoal(value: unknown): value is OnboardingGoal {
  return ONBOARDING_GOALS.includes(value as OnboardingGoal)
}

export function mapOnboardingGoalToCalorieGoal(
  goal: OnboardingGoal,
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
