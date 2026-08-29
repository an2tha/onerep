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
  waistCm?: number
  hipsCm?: number
  chestCm?: number
  armsCm?: number
  thighsCm?: number
  calvesCm?: number
  neckCm?: number
  leanBodyMassKg?: number
  boneMassKg?: number
  basalMetabolicRateKcal?: number
}

/**
 * The check-in fields beyond weight, body fat and waist, which have their own
 * headline treatment. Everything a smart scale or a tape can put on a check-in
 * used to be stored and then shown nowhere: lean mass synced in from Apple
 * Health for months and the Body tab kept reporting the same three numbers.
 */
export const PROGRESS_MEASUREMENT_KEYS = [
  "leanBodyMassKg",
  "boneMassKg",
  "basalMetabolicRateKcal",
  "hipsCm",
  "chestCm",
  "armsCm",
  "thighsCm",
  "calvesCm",
  "neckCm",
] as const

export type ProgressMeasurementKey = (typeof PROGRESS_MEASUREMENT_KEYS)[number]

export type ProgressMeasurementTrend = {
  key: ProgressMeasurementKey
  label: string
  /** "kg", "cm" or "kcal". Weight-like keys are converted by the view. */
  unit: "kg" | "cm" | "kcal"
  group: "composition" | "tape"
  latest: number
  latestDate: string
  /** Newest minus oldest across every recorded reading; null with one reading. */
  delta: number | null
  readings: number
}

const MEASUREMENT_META: Record<
  ProgressMeasurementKey,
  { label: string; unit: "kg" | "cm" | "kcal"; group: "composition" | "tape" }
> = {
  leanBodyMassKg: { label: "Lean mass", unit: "kg", group: "composition" },
  boneMassKg: { label: "Bone mass", unit: "kg", group: "composition" },
  basalMetabolicRateKcal: {
    label: "Basal metabolic rate",
    unit: "kcal",
    group: "composition",
  },
  hipsCm: { label: "Hips", unit: "cm", group: "tape" },
  chestCm: { label: "Chest", unit: "cm", group: "tape" },
  armsCm: { label: "Arms", unit: "cm", group: "tape" },
  thighsCm: { label: "Thighs", unit: "cm", group: "tape" },
  calvesCm: { label: "Calves", unit: "cm", group: "tape" },
  neckCm: { label: "Neck", unit: "cm", group: "tape" },
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
    previousLoggedDays: number
    calorieTargetDays: number
    proteinTargetDays: number
    averageCalories: number
    averageProtein: number
    averageCarbs: number
    averageFat: number
    calorieDeltaFromTarget: number | null
    previousAverageCalories: number | null
    averageCalorieChange: number | null
  }
  training: {
    workouts: number
    activeDays: number
    completedSets: number
    durationMinutes: number
    averageSetsPerWorkout: number
    previousWorkouts: number
    previousCompletedSets: number
    workoutChange: number
    completedSetChange: number
  }
  body: {
    latestWeightKg: number | null
    latestBodyFatPct: number | null
    latestWaistCm: number | null
    weightDeltaKg: number | null
    bodyFatDeltaPct: number | null
    waistDeltaCm: number | null
    weeklyWeightDeltaKg: number | null
    latestCheckInDate: string | null
    weightTrendDays: number | null
    weightPoints: Array<{ date: string; weightKg: number }>
    /**
     * Every other measurement with at least one reading, in catalogue order.
     * Keys nobody has recorded are left out rather than listed as "—": a row of
     * blanks says the feature is broken, a shorter list says you never measured
     * your calves.
     */
    measurements: ProgressMeasurementTrend[]
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

function measurementTrends(
  measurements: ProgressBodyMeasurement[]
): ProgressMeasurementTrend[] {
  const ordered = [...measurements].sort((a, b) =>
    a.loggedAt.localeCompare(b.loggedAt)
  )
  const trends: ProgressMeasurementTrend[] = []
  for (const key of PROGRESS_MEASUREMENT_KEYS) {
    const readings = ordered.filter(
      (measurement) =>
        typeof measurement[key] === "number" &&
        Number.isFinite(measurement[key])
    )
    const latest = readings.at(-1)
    if (!latest) continue
    const first = readings[0]
    const latestValue = latest[key] as number
    trends.push({
      key,
      ...MEASUREMENT_META[key],
      latest: latestValue,
      latestDate: latest.loggedAt.slice(0, 10),
      delta: readings.length > 1 ? latestValue - (first[key] as number) : null,
      readings: readings.length,
    })
  }
  return trends
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
  const comparisonDates = buildProgressDateRange(today, 14)
  const previousDates = comparisonDates.slice(0, 7)
  const firstDate = comparisonDates[0] ?? today
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

  const allDays = comparisonDates.map((date) => {
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

  const days = allDays.slice(-7)
  const previousDays = allDays.slice(0, previousDates.length)

  const loggedNutritionDays = days.filter((day) => day.nutrition.logged)
  const previousLoggedNutritionDays = previousDays.filter(
    (day) => day.nutrition.logged
  )
  const totalCalories = loggedNutritionDays.reduce(
    (total, day) => total + day.nutrition.calories,
    0
  )
  const totalProtein = loggedNutritionDays.reduce(
    (total, day) => total + day.nutrition.protein,
    0
  )
  const totalCarbs = loggedNutritionDays.reduce(
    (total, day) => total + day.nutrition.carbs,
    0
  )
  const totalFat = loggedNutritionDays.reduce(
    (total, day) => total + day.nutrition.fat,
    0
  )
  const previousTotalCalories = previousLoggedNutritionDays.reduce(
    (total, day) => total + day.nutrition.calories,
    0
  )
  const trainingDays = days.filter((day) => day.training.workouts > 0)
  const currentWorkouts = days.reduce(
    (total, day) => total + day.training.workouts,
    0
  )
  const currentCompletedSets = days.reduce(
    (total, day) => total + day.training.completedSets,
    0
  )
  const previousWorkouts = previousDays.reduce(
    (total, day) => total + day.training.workouts,
    0
  )
  const previousCompletedSets = previousDays.reduce(
    (total, day) => total + day.training.completedSets,
    0
  )

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
  const firstWeightDate = weights[0]?.date ?? null
  const latestWeightDate = weights.at(-1)?.date ?? null
  const weightTrendDays =
    firstWeightDate && latestWeightDate && weights.length > 1
      ? Math.max(
          1,
          Math.round(
            (new Date(`${latestWeightDate}T12:00:00Z`).getTime() -
              new Date(`${firstWeightDate}T12:00:00Z`).getTime()) /
              86_400_000
          )
        )
      : null
  const bodyFatMeasurements = [...bodyMeasurements]
    .filter(
      (measurement) =>
        typeof measurement.bodyFatPct === "number" &&
        Number.isFinite(measurement.bodyFatPct)
    )
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
  const waistMeasurements = [...bodyMeasurements]
    .filter(
      (
        measurement
      ): measurement is ProgressBodyMeasurement & {
        waistCm: number
      } =>
        typeof measurement.waistCm === "number" &&
        Number.isFinite(measurement.waistCm)
    )
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
  const firstBodyFat = bodyFatMeasurements[0]?.bodyFatPct
  const latestBodyFat = bodyFatMeasurements.at(-1)?.bodyFatPct
  const firstWaist = waistMeasurements[0]?.waistCm
  const latestWaist = waistMeasurements.at(-1)?.waistCm
  const averageCalories =
    loggedNutritionDays.length > 0
      ? Math.round(totalCalories / loggedNutritionDays.length)
      : 0
  const previousAverageCalories =
    previousLoggedNutritionDays.length > 0
      ? Math.round(previousTotalCalories / previousLoggedNutritionDays.length)
      : null

  return {
    days,
    nutrition: {
      loggedDays: loggedNutritionDays.length,
      previousLoggedDays: previousLoggedNutritionDays.length,
      calorieTargetDays: loggedNutritionDays.filter((day) => {
        const ratio = day.nutrition.calories / safeCaloriesTarget
        return ratio >= 0.8 && ratio <= 1.2
      }).length,
      proteinTargetDays: loggedNutritionDays.filter(
        (day) => day.nutrition.protein >= safeProteinTarget * 0.9
      ).length,
      averageCalories,
      averageProtein:
        loggedNutritionDays.length > 0
          ? Math.round(totalProtein / loggedNutritionDays.length)
          : 0,
      averageCarbs:
        loggedNutritionDays.length > 0
          ? Math.round(totalCarbs / loggedNutritionDays.length)
          : 0,
      averageFat:
        loggedNutritionDays.length > 0
          ? Math.round(totalFat / loggedNutritionDays.length)
          : 0,
      calorieDeltaFromTarget:
        loggedNutritionDays.length > 0
          ? averageCalories - safeCaloriesTarget
          : null,
      previousAverageCalories,
      averageCalorieChange:
        previousAverageCalories == null
          ? null
          : averageCalories - previousAverageCalories,
    },
    training: {
      workouts: currentWorkouts,
      activeDays: trainingDays.length,
      completedSets: currentCompletedSets,
      durationMinutes: days.reduce(
        (total, day) => total + day.training.durationMinutes,
        0
      ),
      averageSetsPerWorkout:
        currentWorkouts > 0
          ? Math.round((currentCompletedSets / currentWorkouts) * 10) / 10
          : 0,
      previousWorkouts,
      previousCompletedSets,
      workoutChange: currentWorkouts - previousWorkouts,
      completedSetChange: currentCompletedSets - previousCompletedSets,
    },
    body: {
      latestWeightKg: latestWeight,
      latestBodyFatPct: latestBodyFat ?? null,
      latestWaistCm: latestWaist ?? null,
      weightDeltaKg:
        firstWeight != null && latestWeight != null && weights.length > 1
          ? latestWeight - firstWeight
          : null,
      bodyFatDeltaPct:
        firstBodyFat != null && latestBodyFat != null
          ? latestBodyFat - firstBodyFat
          : null,
      waistDeltaCm:
        firstWaist != null && latestWaist != null
          ? latestWaist - firstWaist
          : null,
      weeklyWeightDeltaKg:
        firstWeight != null && latestWeight != null && weightTrendDays != null
          ? ((latestWeight - firstWeight) / weightTrendDays) * 7
          : null,
      latestCheckInDate: latestBodyMeasurement?.loggedAt.slice(0, 10) ?? null,
      weightTrendDays,
      weightPoints: weights,
      measurements: measurementTrends(bodyMeasurements),
    },
  }
}
