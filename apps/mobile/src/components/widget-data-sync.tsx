import { useEffect, useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import { currentDateKey, type FoodLogEntry } from "@/lib/food-log"
import {
  normalizePresetCard,
  normalizeScheduleRoutines,
  type CachedWorkoutLog,
  type WorkoutPresetCard,
} from "@/lib/workout-sync"
import { updateOneRepWidgets } from "@/lib/home-widgets"
import { updateWatchToday, onWatchAction } from "@/lib/watch-sync"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { calcTrailingSessions } from "@/lib/training-consistency"
import { toast } from "@repo/ui"
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
  // Only the watch shows these two; the home widgets never asked for them.
  const waterLogs = useQuery(api.logs.water.getDay, user ? { date } : "skip")
  const workoutHistory = useQuery(
    api.logs.workouts.getHistory,
    user ? {} : "skip"
  )
  const addWaterEntry = useOfflineMutation(
    api.logs.water.addEntry,
    "logs.water.addEntry"
  )

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

  // The watch gets the same numbers plus water and the streak, which it has
  // room for and a home-screen widget does not.
  const watchPayload = useMemo(() => {
    if (!payload || waterLogs === undefined || workoutHistory === undefined) {
      return null
    }
    const entries = (waterLogs ?? []) as { amountMl: number }[]
    const trainedDates = new Set(
      ((workoutHistory ?? []) as unknown as CachedWorkoutLog[])
        .map((log) => log.date)
        .filter(Boolean)
    )
    const trailingDate = new Date()
    trailingDate.setUTCHours(12, 0, 0, 0)

    return {
      calories: payload.calories,
      calorieGoal: payload.calorieGoal,
      caloriesLeft: payload.caloriesLeft,
      protein: payload.protein,
      proteinGoal: payload.proteinGoal,
      carbs: payload.carbs,
      carbsGoal: payload.carbsGoal,
      fat: payload.fat,
      fatGoal: payload.fatGoal,
      waterMl: entries.reduce((sum, entry) => sum + entry.amountMl, 0),
      waterGoalMl: preferences?.waterGoalMl ?? 2500,
      daysLast28: calcTrailingSessions(trainedDates, trailingDate, 28),
      workoutBrief: payload.workoutBrief,
    }
  }, [payload, preferences?.waterGoalMl, waterLogs, workoutHistory])

  useEffect(() => {
    if (!watchPayload) return
    void updateWatchToday(watchPayload).catch((error) =>
      logDevWarn("Failed to sync the watch", error)
    )
  }, [watchPayload])

  // Taps from the wrist, turned into the same mutations the app's own buttons
  // call. The listener is registered once and torn down on unmount; `disposed`
  // guards the window where the handle is still resolving.
  useEffect(() => {
    if (!user) return
    let disposed = false
    let remove: (() => void) | undefined

    void onWatchAction((event) => {
      if (event.action === "logWater") {
        const amountMl = event.payload.amountMl ?? 250
        void addWaterEntry({
          date: currentDateKey(preferences?.lastActiveTimezone || "UTC"),
          entry: {
            id: crypto.randomUUID(),
            amountMl,
            loggedAt: new Date().toISOString(),
          },
        }).catch(() => toast.error("Could not log water from your watch"))
        return
      }

      if (event.action === "logWorkout") {
        // Nothing to create here. The watch already saved the session to
        // Health, so the existing HealthKit sync will surface it as an
        // unlogged workout — writing a second copy would double-count it.
        const minutes = Math.round((event.payload.durationSeconds ?? 0) / 60)
        toast.success(
          minutes > 0
            ? `Watch workout saved · ${minutes} min`
            : "Watch workout saved"
        )
      }
    })
      .then((dispose) => {
        if (disposed) dispose()
        else remove = dispose
      })
      // A build without the native plugin — an older install, or Android —
      // rejects here. Losing watch actions is survivable; an unhandled
      // rejection on every launch is not.
      .catch((error) => logDevWarn("Watch action listener unavailable", error))

    return () => {
      disposed = true
      remove?.()
    }
  }, [addWaterEntry, preferences?.lastActiveTimezone, user])

  return null
}
