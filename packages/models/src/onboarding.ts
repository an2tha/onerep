export type OnboardingGoal = "lose" | "build" | "health" | "performance"

export interface OnboardingProfile {
  userId: string
  age: number
  heightCm: number
  goal: OnboardingGoal
  updatedAt: Date
}
