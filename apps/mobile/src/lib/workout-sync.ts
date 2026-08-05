export type WorkoutFocus = "strength" | "cardio" | "mobility"
export type CardioDistanceUnit = "km" | "mi"
/** Mirrors `CardioSourceProvider` in packages/models/src/workoutLogs.ts. */
export type CardioSourceProvider =
  | "manual"
  | "apple_health"
  | "health_connect"
  | "strava"
  | "garmin"
  | "fitbit"
  | "gpx"
  | "other"

export type HeartRateZones = {
  zone1Seconds?: number
  zone2Seconds?: number
  zone3Seconds?: number
  zone4Seconds?: number
  zone5Seconds?: number
}

export type CardioWorkoutDetails = {
  distanceMeters?: number
  distanceUnit?: CardioDistanceUnit
  durationSeconds?: number
  paceSecondsPerKm?: number
  avgHeartRateBpm?: number
  maxHeartRateBpm?: number
  heartRateZones?: HeartRateZones
  route?: {
    name?: string
    url?: string
  }
  source?: {
    provider: CardioSourceProvider
    name?: string
    externalId?: string
    importedAt?: string
  }
  notes?: string
}

// ─── Workout log types ────────────────────────────────────────────────────────

export type CachedWorkoutLog = {
  _id?: string // Convex ID
  date: string // YYYY-MM-DD
  // Optional while legacy one-log-per-day records are still in the database.
  sessionId?: string
  slot?: 1 | 2
  exercises: Array<{
    id?: string
    exerciseId?: string
    name: string
    category?: string
    trackRpe?: boolean
    trackUnilateral?: boolean
    sets: Array<{
      weight: string | number
      reps: string | number
      completed: boolean
    }>
    cardio?: CardioWorkoutDetails
  }>
  durationSeconds: number
  completedAt: string | number // ISO string or Convex timestamp
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export type WorkoutPresetCard = {
  id: string
  name: string
  focus: WorkoutFocus
  duration: string
  steps: string[]
}

export const WEEK_DAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const
export type Day = (typeof WEEK_DAYS)[number]
export type Routine = Record<Day, string | null>
export type ScheduleRoutines = {
  primary: Routine
  secondary: Routine
}

const METERS_PER_MILE = 1609.344

export function cardioDistanceToMeters(
  value: number,
  unit: CardioDistanceUnit
) {
  return unit === "mi" ? value * METERS_PER_MILE : value * 1000
}

export function cardioMetersToDistance(
  meters: number,
  unit: CardioDistanceUnit
) {
  return unit === "mi" ? meters / METERS_PER_MILE : meters / 1000
}

export function calcPaceSecondsPerKm(
  distanceMeters?: number,
  durationSeconds?: number
) {
  if (!distanceMeters || !durationSeconds || distanceMeters <= 0) return null
  return durationSeconds / (distanceMeters / 1000)
}

export function formatCardioDuration(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

export function formatCardioDistance(
  meters?: number | null,
  unit: CardioDistanceUnit = "km"
): string | null {
  if (!meters || meters <= 0) return null
  const value = cardioMetersToDistance(meters, unit)
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`
}

export function formatCardioPace(
  paceSecondsPerKm?: number | null,
  unit: CardioDistanceUnit = "km"
): string | null {
  if (!paceSecondsPerKm || paceSecondsPerKm <= 0) return null
  const secondsPerUnit =
    unit === "mi"
      ? paceSecondsPerKm * (METERS_PER_MILE / 1000)
      : paceSecondsPerKm
  const roundedSeconds = Math.round(secondsPerUnit)
  const minutes = Math.floor(roundedSeconds / 60)
  const seconds = roundedSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}/${unit}`
}

export function hasCardioDetails(cardio?: CardioWorkoutDetails | null) {
  if (!cardio) return false
  const zones = cardio.heartRateZones
  const hasZones =
    !!zones &&
    Object.values(zones).some(
      (seconds) => typeof seconds === "number" && seconds > 0
    )
  return Boolean(
    (cardio.distanceMeters && cardio.distanceMeters > 0) ||
    (cardio.durationSeconds && cardio.durationSeconds > 0) ||
    (cardio.paceSecondsPerKm && cardio.paceSecondsPerKm > 0) ||
    (cardio.avgHeartRateBpm && cardio.avgHeartRateBpm > 0) ||
    (cardio.maxHeartRateBpm && cardio.maxHeartRateBpm > 0) ||
    hasZones ||
    cardio.route?.name ||
    cardio.route?.url ||
    (cardio.source?.provider && cardio.source.provider !== "manual") ||
    cardio.source?.externalId ||
    cardio.source?.name ||
    cardio.notes
  )
}

export function compactCardioSummary(
  cardio?: CardioWorkoutDetails | null,
  unit: CardioDistanceUnit = cardio?.distanceUnit ?? "km"
) {
  if (!cardio || !hasCardioDetails(cardio)) return "Cardio details"
  const pace = cardio.paceSecondsPerKm
    ? cardio.paceSecondsPerKm
    : (calcPaceSecondsPerKm(cardio.distanceMeters, cardio.durationSeconds) ??
      undefined)
  return [
    formatCardioDistance(cardio.distanceMeters, unit),
    formatCardioDuration(cardio.durationSeconds),
    formatCardioPace(pace, unit),
    cardio.avgHeartRateBpm ? `${Math.round(cardio.avgHeartRateBpm)} bpm` : null,
    cardio.route?.name,
  ]
    .filter(Boolean)
    .join(" · ")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function emptyRoutine(): Routine {
  return WEEK_DAYS.reduce((routine, day) => {
    routine[day] = null
    return routine
  }, {} as Routine)
}

export function normalizeRoutine(input: unknown): Routine {
  const record = isRecord(input) ? input : {}
  return WEEK_DAYS.reduce((routine, day) => {
    const value = record[day]
    routine[day] = typeof value === "string" && value.length > 0 ? value : null
    return routine
  }, emptyRoutine())
}

export function normalizeScheduleRoutines(input: unknown): ScheduleRoutines {
  const record = isRecord(input) ? input : null
  if (record && isRecord(record.primary)) {
    return {
      primary: normalizeRoutine(record.primary),
      secondary: normalizeRoutine(record.secondary),
    }
  }

  return {
    primary: normalizeRoutine(input),
    secondary: emptyRoutine(),
  }
}

export function scheduleRoutinePayload(
  primary: Routine,
  secondary: Routine
): ScheduleRoutines {
  return {
    primary: normalizeRoutine(primary),
    secondary: normalizeRoutine(secondary),
  }
}

export function normalizePresetCard(input: {
  id: string
  name: string
  focus?: string | null
  duration?: string | null
  steps?: string[] | null
}): WorkoutPresetCard {
  return {
    id: input.id,
    name: input.name,
    focus:
      input.focus === "cardio" || input.focus === "mobility"
        ? input.focus
        : "strength",
    duration: input.duration ?? "30 min",
    steps:
      Array.isArray(input.steps) && input.steps.length > 0
        ? input.steps
        : ["Warm up 5 min"],
  }
}

export function movePresetById<T extends { id: string }>(
  presets: T[],
  id: string,
  direction: "up" | "down"
): T[] {
  const fromIndex = presets.findIndex((preset) => preset.id === id)
  if (fromIndex === -1) return presets

  const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1
  if (toIndex < 0 || toIndex >= presets.length) return presets

  const next = [...presets]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}
