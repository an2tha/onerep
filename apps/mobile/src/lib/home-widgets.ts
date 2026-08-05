import { Capacitor, registerPlugin } from "@capacitor/core"

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

type HomeWidgetsPlugin = {
  updateWidgets(state: WidgetOverviewState): Promise<void>
}

// iOS: WorkoutLiveActivityPlugin.updateWidgets writes the App Group defaults the
// WidgetKit extension reads. Android: HomeWidgetsPlugin writes SharedPreferences
// and pokes Glance. Widgets were previously gated behind the iOS-only Live
// Activity check, which is the reason they never worked on Android.
const iosPlugin = registerPlugin<HomeWidgetsPlugin>("WorkoutLiveActivity")
const androidPlugin = registerPlugin<HomeWidgetsPlugin>("HomeWidgets")

export async function updateOneRepWidgets(state: WidgetOverviewState) {
  if (!Capacitor.isNativePlatform()) return
  const platform = Capacitor.getPlatform()
  if (platform === "ios") await iosPlugin.updateWidgets(state)
  else if (platform === "android") await androidPlugin.updateWidgets(state)
}
