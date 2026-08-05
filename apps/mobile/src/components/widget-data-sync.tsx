import { useEffect, useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import { currentDateKey, type FoodLogEntry } from "@/lib/food-log"
import {
  normalizePresetCard,
  normalizeScheduleRoutines,
  type WorkoutPresetCard,
} from "@/lib/workout-sync"
import { updateOneRepWidgets } from "@/lib/home-widgets"
import { logDevWarn } from "@/lib/utils"

export function WidgetDataSync() {
  const { user } = useAppAuth()
  const preferences = useQuery(
    api.users.users.getPreferences,
    user ? {} : "skip"
  )
  const date = currentDateKey(preferences?.lastActiveTimezone || "UTC")
  const goals = useQuery(
    api.users.users.getEffectiveGoals,
    user ? { date } : "skip"
  )
  const foodLogs = useQuery(api.logs.foodLogs.getDay, user ? { date } : "skip")
  const schedule = useQuery(api.users.schedules.get, user ? {} : "skip")
  const presetDocs = useQuery(api.logs.presets.list, user ? {} : "skip")

  const payload = useMemo(() => {
    if (!user || !goals || !foodLogs || !presetDocs || schedule === undefined) {
      return null
    }

    const entries = foodLogs as FoodLogEntry[]
    const totals = entries.reduce(
      (sum, entry) => ({
        calories: sum.calories + entry.calories,
        protein: sum.protein + entry.protein,
        carbs: sum.carbs + entry.carbs,
        fat: sum.fat + entry.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
    const target = goals.effective
    const presets = presetDocs.map((preset) =>
      normalizePresetCard(preset as Parameters<typeof normalizePresetCard>[0])
    )
    const routines = normalizeScheduleRoutines(schedule?.routine)
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: preferences?.lastActiveTimezone || "UTC",
      weekday: "short",
    }).format(new Date())
    const ids = [
      routines.primary[day as keyof typeof routines.primary],
      routines.secondary[day as keyof typeof routines.secondary],
    ].filter(Boolean)
    const scheduled = ids
      .map((id) => presets.find((preset) => preset.id === id))
      .filter((preset): preset is WorkoutPresetCard => Boolean(preset))
    const exerciseNames = scheduled
      .flatMap((preset) => preset.steps)
      .slice(0, 6)
    const totalSets = scheduled.reduce((sum, preset) => {
      const source = presetDocs.find(
        (candidate) => String(candidate.id ?? candidate._id) === preset.id
      )
      const data = (source?.exerciseData ?? {}) as Record<
        string,
        { sets?: unknown[] }
      >
      return (
        sum +
        Object.values(data).reduce(
          (count, exercise) => count + (exercise.sets?.length ?? 0),
          0
        )
      )
    }, 0)

    return {
      calories: Math.round(totals.calories),
      calorieGoal: Math.round(target.calories),
      caloriesLeft: Math.round(target.calories - totals.calories),
      protein: Math.round(totals.protein),
      proteinGoal: Math.round(target.protein),
      carbs: Math.round(totals.carbs),
      carbsGoal: Math.round(target.carbs),
      fat: Math.round(totals.fat),
      fatGoal: Math.round(target.fat),
      foodsLogged:
        entries.length > 0
          ? entries
              .slice(-4)
              .map((entry) => entry.name)
              .join(" · ")
          : "No food logged yet",
      workoutExercises:
        exerciseNames.length > 0
          ? exerciseNames.join(" · ")
          : "No workout scheduled",
      workoutBrief:
        exerciseNames.length > 0
          ? `${exerciseNames.length} exercises · ${totalSets} sets`
          : "Recovery day",
    }
  }, [
    foodLogs,
    goals,
    preferences?.lastActiveTimezone,
    presetDocs,
    schedule,
    user,
  ])

  useEffect(() => {
    if (!payload) return
    void updateOneRepWidgets(payload).catch((error) =>
      logDevWarn("Failed to sync home-screen widgets", error)
    )
  }, [payload])

  return null
}
