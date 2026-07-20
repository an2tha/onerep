import { Capacitor, registerPlugin } from "@capacitor/core"

type WorkoutActivityState = {
  exerciseName: string
  setLabel: string
  completedSets: number
  totalSets: number
  isResting: boolean
  restEndAt?: number
  slot: 1 | 2
}

export type WidgetOverviewState = {
  calories?: number
  calorieGoal?: number
  protein?: number
  proteinGoal?: number
  carbs?: number
  carbsGoal?: number
  fat?: number
  fatGoal?: number
  caloriesLeft?: number
  foodsLogged?: string
  workoutExercises?: string
  workoutBrief?: string
}

type WorkoutLiveActivityPlugin = {
  start(
    state: WorkoutActivityState
  ): Promise<{ supported: boolean; id?: string }>
  update(state: WorkoutActivityState): Promise<void>
  end(state: WorkoutActivityState): Promise<void>
  updateWidgets(state: WidgetOverviewState): Promise<void>
}

const plugin = registerPlugin<WorkoutLiveActivityPlugin>("WorkoutLiveActivity")

export function supportsWorkoutLiveActivity() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios"
}

export async function startWorkoutLiveActivity(state: WorkoutActivityState) {
  if (!supportsWorkoutLiveActivity()) return
  await plugin.start(state)
}

export async function updateWorkoutLiveActivity(state: WorkoutActivityState) {
  if (!supportsWorkoutLiveActivity()) return
  await plugin.update(state)
}

export async function updateOneRepWidgets(state: WidgetOverviewState) {
  if (!supportsWorkoutLiveActivity()) return
  await plugin.updateWidgets(state)
}

export async function endWorkoutLiveActivity(state: WorkoutActivityState) {
  if (!supportsWorkoutLiveActivity()) return
  await plugin.end(state)
}
