import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
  currentDateKey,
  dateForOffset,
  detectTimeZone,
  type FoodLogEntry,
} from "@/lib/food-log"
import type { BodyMeasurementEntry } from "@/lib/body-progress"
import type { CachedWorkoutLog } from "@/lib/workout-sync"

export type CoachInsight = {
  label: string
  title: string
  detail: string
}

export type CoachContext = {
  goal: string | null
  experienceLevel: string | null
  safetyMode: string
  safetyFlags: string[]
  nutritionGuidance: string[]
  weightPaceKgPerWeek: number | null
  weightStatus: string
  calorieTarget: number
  averageCalories: number
  averageProtein: number
  proteinTarget: number
  proteinAdherence: number
  calorieAccuracy: number
  macroConsistency: number
  workoutDays7: number
  volumeChange7Pct: number | null
  hardSets7: number
  selectedExerciseName: string | null
  selectedLiftPaceKgPerWeek: number | null
  selectedLiftFrequency: number | null
  dataConfidence: number
  existingInsights: CoachInsight[]
}

type FoodLogSnapshot = {
  date: string
  entries: FoodLogEntry[]
}

function average(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return 0
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function sumFood(entries: FoodLogEntry[]) {
  return entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + (Number(entry.calories) || 0),
      protein: totals.protein + (Number(entry.protein) || 0),
      carbs: totals.carbs + (Number(entry.carbs) || 0),
      fat: totals.fat + (Number(entry.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function sumWorkoutVolume(log: CachedWorkoutLog) {
  return log.exercises.reduce(
    (total, exercise) =>
      total +
      exercise.sets.reduce((setTotal, set) => {
        if (!set.completed) return setTotal
        const weight = Number(set.weight)
        const reps = Number(set.reps)
        if (!Number.isFinite(weight) || !Number.isFinite(reps)) return setTotal
        return setTotal + weight * reps
      }, 0),
    0
  )
}

function countHardSets(logs: CachedWorkoutLog[]) {
  return logs.reduce(
    (total, log) =>
      total +
      log.exercises.reduce(
        (exerciseTotal, exercise) =>
          exerciseTotal + exercise.sets.filter((set) => set.completed).length,
        0
      ),
    0
  )
}

function weightPace(entries: BodyMeasurementEntry[]) {
  const withWeight = entries
    .filter((entry) => typeof entry.weightKg === "number")
    .slice(-8)
  const first = withWeight.at(0)
  const last = withWeight.at(-1)
  if (!first || !last || first.loggedAt === last.loggedAt) return null

  const days =
    (new Date(`${last.loggedAt}T12:00:00Z`).getTime() -
      new Date(`${first.loggedAt}T12:00:00Z`).getTime()) /
    86400000
  if (!Number.isFinite(days) || days <= 0) return null
  return (((last.weightKg ?? 0) - (first.weightKg ?? 0)) / days) * 7
}

export function buildCoachContext({
  foodLogs,
  workouts,
  body,
  goals,
  onboarding,
}: {
  foodLogs: FoodLogSnapshot[]
  workouts: CachedWorkoutLog[]
  body: BodyMeasurementEntry[]
  goals:
    | {
        effective: {
          calories: number
          protein: number
          carbs: number
          fat: number
        }
        health?: { calorieStrategy?: string; guidance?: string[] }
      }
    | null
    | undefined
  onboarding:
    | {
        experienceLevel?: string
        safetyMode?: string
        safetyFlags?: string[]
      }
    | null
    | undefined
}): CoachContext {
  const timeZone = detectTimeZone()
  const effective = goals?.effective ?? {
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 65,
  }
  const nutrition = foodLogs
    .map((day) => sumFood(day.entries))
    .filter((day) => day.calories > 0)
  const last7Start = dateForOffset(-6, timeZone)
  const previous7Start = dateForOffset(-13, timeZone)
  const workouts7 = workouts.filter((log) => log.date >= last7Start)
  const previousWorkouts7 = workouts.filter(
    (log) => log.date >= previous7Start && log.date < last7Start
  )
  const volume7 = workouts7.reduce((sum, log) => sum + sumWorkoutVolume(log), 0)
  const previousVolume7 = previousWorkouts7.reduce(
    (sum, log) => sum + sumWorkoutVolume(log),
    0
  )
  const averageCalories = average(nutrition.map((day) => day.calories))
  const averageProtein = average(nutrition.map((day) => day.protein))
  const proteinAdherence =
    effective.protein > 0 ? (averageProtein / effective.protein) * 100 : 0
  const calorieAccuracy =
    effective.calories > 0
      ? 100 -
        Math.min(
          100,
          (Math.abs(averageCalories - effective.calories) /
            effective.calories) *
            100
        )
      : 0

  const context = {
    goal: goals?.health?.calorieStrategy ?? null,
    experienceLevel: onboarding?.experienceLevel ?? null,
    safetyMode: onboarding?.safetyMode ?? "standard",
    safetyFlags: onboarding?.safetyFlags ?? [],
    nutritionGuidance: goals?.health?.guidance ?? [],
    weightPaceKgPerWeek: weightPace(body),
    weightStatus:
      body.length > 0
        ? `${body.length} body check-ins logged`
        : "No body trend yet",
    calorieTarget: effective.calories,
    averageCalories,
    averageProtein,
    proteinTarget: effective.protein,
    proteinAdherence,
    calorieAccuracy,
    macroConsistency: average([
      proteinAdherence,
      effective.carbs > 0
        ? (average(nutrition.map((day) => day.carbs)) / effective.carbs) * 100
        : 0,
      effective.fat > 0
        ? (average(nutrition.map((day) => day.fat)) / effective.fat) * 100
        : 0,
    ]),
    workoutDays7: workouts7.length,
    volumeChange7Pct:
      previousVolume7 > 0
        ? ((volume7 - previousVolume7) / previousVolume7) * 100
        : null,
    hardSets7: countHardSets(workouts7),
    selectedExerciseName: workouts7[0]?.exercises[0]?.name ?? null,
    selectedLiftPaceKgPerWeek: null,
    selectedLiftFrequency: workouts7.length,
    dataConfidence: average([
      Math.min(100, nutrition.length * 14),
      Math.min(100, workouts7.length * 25),
      Math.min(100, body.length * 20),
    ]),
  }

  return {
    ...context,
    existingInsights: [
      {
        label: "Nutrition",
        title: `${Math.round(averageCalories)} kcal average`,
        detail: `Target is ${Math.round(effective.calories)} kcal with ${Math.round(averageProtein)}g protein average.`,
      },
      {
        label: "Training",
        title: `${workouts7.length} workouts this week`,
        detail: `${countHardSets(workouts7)} completed sets in the last 7 days.`,
      },
    ],
  }
}

export function useCoachContext() {
  const timeZone = detectTimeZone()
  const todayKey = currentDateKey(timeZone)
  const foodLogs = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: todayKey,
    limit: 14,
  }) as FoodLogSnapshot[] | undefined
  const workouts = useQuery(api.logs.workouts.getHistory) as
    CachedWorkoutLog[] | undefined
  const body = useQuery(api.bodyProgress.list) as
    BodyMeasurementEntry[] | undefined
  const goals = useQuery(api.users.users.getEffectiveGoals, {
    date: todayKey,
  })
  const onboarding = useQuery(api.users.onboarding.get, {})

  return useMemo(
    () => ({
      loading:
        foodLogs === undefined ||
        workouts === undefined ||
        body === undefined ||
        onboarding === undefined,
      context: buildCoachContext({
        foodLogs: foodLogs ?? [],
        workouts: workouts ?? [],
        body: body ?? [],
        goals,
        onboarding,
      }),
    }),
    [body, foodLogs, goals, onboarding, workouts]
  )
}
