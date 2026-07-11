/**
 * Compact, display-oriented progress summaries. These helpers deliberately use
 * only the shapes already returned by the existing workout, food, and body
 * queries so the Progress page can stay a read-only view of the user's data.
 */

export type ProgressFoodEntry = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

export type ProgressFoodLog = {
  date: string
  entries?: ProgressFoodEntry[]
}

export type ProgressWorkoutSet = {
  completed?: boolean
}

export type ProgressWorkoutLog = {
  date: string
  durationSeconds?: number
  exercises?: Array<{
    sets?: ProgressWorkoutSet[]
  }>
}

export type ProgressBodyMeasurement = {
  loggedAt: string
  weightKg?: number
  bodyFatPct?: number
}

export type ProgressDay = {
  date: string
  label: string
  isToday: boolean
  nutrition: {
    logged: boolean
    calories: number
    protein: number
    carbs: number
    fat: number
    calorieProgress: number
    proteinProgress: number
  }
  training: {
    workouts: number
    completedSets: number
    durationMinutes: number
  }
}

export type ProgressSummary = {
  days: ProgressDay[]
  nutrition: {
    loggedDays: number
    calorieTargetDays: number
    proteinTargetDays: number
    averageCalories: number
    averageProtein: number
  }
  training: {
    workouts: number
    activeDays: number
    completedSets: number
    durationMinutes: number
  }
  body: {
    latestWeightKg: number | null
    latestBodyFatPct: number | null
    weightDeltaKg: number | null
    weightPoints: Array<{ date: string; weightKg: number }>
  }
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function weekDayLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "narrow" }).format(
    new Date(`${date}T12:00:00Z`)
  )
}

/** Returns calendar keys oldest first, ending on `endDate`. */
export function buildProgressDateRange(endDate: string, days = 7) {
  const count = Math.max(1, Math.floor(days))
  const end = new Date(`${endDate}T12:00:00Z`)

  if (Number.isNaN(end.getTime())) return []

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - (count - index - 1))
    return date.toISOString().slice(0, 10)
  })
}

function nutritionTotals(entries: ProgressFoodEntry[]) {
  return entries.reduce<{
    calories: number
    protein: number
    carbs: number
    fat: number
  }>(
    (totals, entry) => ({
      calories: totals.calories + safeNumber(entry.calories),
      protein: totals.protein + safeNumber(entry.protein),
      carbs: totals.carbs + safeNumber(entry.carbs),
      fat: totals.fat + safeNumber(entry.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function completedSetCount(log: ProgressWorkoutLog) {
  return (log.exercises ?? []).reduce(
    (total, exercise) =>
      total +
      (exercise.sets ?? []).filter((set) => set.completed === true).length,
    0
  )
}

export function buildProgressSummary({
  today,
  foodLogs,
  workoutLogs,
  bodyMeasurements,
  caloriesTarget,
  proteinTarget,
}: {
  today: string
  foodLogs: ProgressFoodLog[]
  workoutLogs: ProgressWorkoutLog[]
  bodyMeasurements: ProgressBodyMeasurement[]
  caloriesTarget: number
  proteinTarget: number
}): ProgressSummary {
  const dates = buildProgressDateRange(today)
  const firstDate = dates[0] ?? today
  const safeCaloriesTarget = Math.max(1, safeNumber(caloriesTarget) || 2000)
  const safeProteinTarget = Math.max(1, safeNumber(proteinTarget) || 150)

  const foodByDate = new Map<string, ProgressFoodEntry[]>()
  for (const log of foodLogs) {
    if (log.date < firstDate || log.date > today) continue
    const entries = foodByDate.get(log.date) ?? []
    entries.push(...(log.entries ?? []))
    foodByDate.set(log.date, entries)
  }

  const workoutsByDate = new Map<string, ProgressWorkoutLog[]>()
  for (const log of workoutLogs) {
    if (log.date < firstDate || log.date > today) continue
    const logs = workoutsByDate.get(log.date) ?? []
    logs.push(log)
    workoutsByDate.set(log.date, logs)
  }

  const days = dates.map((date) => {
    const foodEntries = foodByDate.get(date) ?? []
    const food = nutritionTotals(foodEntries)
    const workouts = workoutsByDate.get(date) ?? []
    const completedSets = workouts.reduce(
      (total, workout) => total + completedSetCount(workout),
      0
    )
    const durationMinutes = workouts.reduce(
      (total, workout) => total + safeNumber(workout.durationSeconds) / 60,
      0
    )

    return {
      date,
      label: weekDayLabel(date),
      isToday: date === today,
      nutrition: {
        logged: foodEntries.length > 0,
        ...food,
        calorieProgress: clamp(
          (food.calories / safeCaloriesTarget) * 100,
          0,
          100
        ),
        proteinProgress: clamp(
          (food.protein / safeProteinTarget) * 100,
          0,
          100
        ),
      },
      training: {
        workouts: workouts.length,
        completedSets,
        durationMinutes: Math.round(durationMinutes),
      },
    }
  })

  const loggedNutritionDays = days.filter((day) => day.nutrition.logged)
  const totalCalories = loggedNutritionDays.reduce(
    (total, day) => total + day.nutrition.calories,
    0
  )
  const totalProtein = loggedNutritionDays.reduce(
    (total, day) => total + day.nutrition.protein,
    0
  )
  const trainingDays = days.filter((day) => day.training.workouts > 0)

  const weights = bodyMeasurements
    .filter(
      (
        measurement
      ): measurement is ProgressBodyMeasurement & { weightKg: number } =>
        typeof measurement.weightKg === "number" &&
        Number.isFinite(measurement.weightKg)
    )
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
    .slice(-12)
    .map((measurement) => ({
      date: measurement.loggedAt.slice(0, 10),
      weightKg: measurement.weightKg,
    }))
  const latestBodyMeasurement = [...bodyMeasurements]
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
    .at(-1)
  const latestWeight = weights.at(-1)?.weightKg ?? null
  const firstWeight = weights[0]?.weightKg ?? null

  return {
    days,
    nutrition: {
      loggedDays: loggedNutritionDays.length,
      calorieTargetDays: loggedNutritionDays.filter((day) => {
        const ratio = day.nutrition.calories / safeCaloriesTarget
        return ratio >= 0.8 && ratio <= 1.2
      }).length,
      proteinTargetDays: loggedNutritionDays.filter(
        (day) => day.nutrition.protein >= safeProteinTarget * 0.9
      ).length,
      averageCalories:
        loggedNutritionDays.length > 0
          ? Math.round(totalCalories / loggedNutritionDays.length)
          : 0,
      averageProtein:
        loggedNutritionDays.length > 0
          ? Math.round(totalProtein / loggedNutritionDays.length)
          : 0,
    },
    training: {
      workouts: days.reduce((total, day) => total + day.training.workouts, 0),
      activeDays: trainingDays.length,
      completedSets: days.reduce(
        (total, day) => total + day.training.completedSets,
        0
      ),
      durationMinutes: days.reduce(
        (total, day) => total + day.training.durationMinutes,
        0
      ),
    },
    body: {
      latestWeightKg: latestWeight,
      latestBodyFatPct:
        typeof latestBodyMeasurement?.bodyFatPct === "number" &&
        Number.isFinite(latestBodyMeasurement.bodyFatPct)
          ? latestBodyMeasurement.bodyFatPct
          : null,
      weightDeltaKg:
        firstWeight != null && latestWeight != null && weights.length > 1
          ? latestWeight - firstWeight
          : null,
      weightPoints: weights,
    },
  }
}
