/**
 * The pure core of workout logging: types, unit and plate math, set/item
 * helpers, draft persistence, and the two timers.
 *
 * Extracted from `pages/ActiveWorkout.tsx` so the live logger and the retro
 * logger ("workout first, log later") share one definition of what a set is and
 * how it converts. Nothing here reaches for Convex, routing, or the DOM beyond
 * localStorage and the visibility event, so it is directly unit-testable.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import {
  createClientId,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "@/lib/utils"
import olympicBarPng from "@/assets/bars/bar-olympic.png"
import ezBarPng from "@/assets/bars/bar-ez.png"
import trapBarPng from "@/assets/bars/bar-trap.png"
import type { Exercise } from "@/lib/exercise-catalog"
import {
  calcPaceSecondsPerKm,
  cardioDistanceToMeters,
  cardioMetersToDistance,
  hasCardioDetails,
  type CardioDistanceUnit,
  type CardioSourceProvider,
  type CardioWorkoutDetails,
} from "@/lib/workout-sync"
import {
  healthProvider,
  healthProviderLabel,
  type HealthWorkout,
} from "@/lib/health-provider"
import { playRestCompletion } from "@/lib/workout-celebration"
import {
  cancelRestAlert,
  playNativeRestHaptic,
  scheduleRestAlert,
} from "@/lib/rest-alerts"

export type SetType = "working" | "warmup" | "failure" | "myoreps" | "drop"
export type WeightUnit = "kg" | "lbs"

export type BarType = "olympic" | "womens" | "ez" | "trap" | "custom"
export type HeartRateZoneKey =
  | "zone1Seconds"
  | "zone2Seconds"
  | "zone3Seconds"
  | "zone4Seconds"
  | "zone5Seconds"

export type WorkoutSet = {
  id: string
  type: SetType
  weight: string
  reps: string
  restSeconds: number
  completed: boolean
}

export type PersistedWorkoutSet = Partial<WorkoutSet>

export type CardioExerciseState = {
  distance: string
  distanceUnit: CardioDistanceUnit
  durationHours: string
  durationMinutes: string
  durationSeconds: string
  paceMinutes: string
  paceSeconds: string
  avgHeartRate: string
  maxHeartRate: string
  zones: Record<HeartRateZoneKey, string>
  routeName: string
  routeUrl: string
  sourceProvider: CardioSourceProvider
  sourceName: string
  sourceExternalId: string
  sourceImportedAt: string
  notes: string
}

export type ExerciseState = {
  sets: WorkoutSet[]
  trackRpe: boolean
  trackUnilateral: boolean
  barWeight: string
  barType: BarType
  cardio: CardioExerciseState
}

export type PersistedExerciseState = Partial<
  Omit<ExerciseState, "sets" | "cardio">
> & {
  sets?: PersistedWorkoutSet[]
  cardio?: Partial<CardioExerciseState>
}

export type LoggedWorkoutSet = {
  weight: number
  reps: number
  completed: boolean
  type: string
}

export type LastSession = {
  date: string
  sets: LoggedWorkoutSet[]
}

export type LoggedWorkoutExercise = {
  id: string
  sets: LoggedWorkoutSet[]
}

export type WorkoutItem =
  | { kind: "solo"; exerciseId: string }
  | { kind: "superset"; id: string; color: string; exerciseIds: string[] }

export type LocalActiveWorkoutDraft = {
  elapsedSeconds: number
  exerciseData: Record<string, ExerciseState>
  items: WorkoutItem[]
  presetId?: string
  savedAt: number
  slot: 1 | 2
  startedAt: number
}

export type AiWorkoutMode = "append" | "replace" | "swap"

export type AgentWorkoutSetDraft = Partial<WorkoutSet>

export type AgentWorkoutExerciseDraft = {
  name: string
  sets?: AgentWorkoutSetDraft[]
  trackRpe?: boolean
  trackUnilateral?: boolean
}

export type AgentWorkoutDraft = {
  name?: string
  exercises?: AgentWorkoutExerciseDraft[]
  notes?: string
}

export type CoachWorkoutProposal = {
  reply: string
  draft: AgentWorkoutDraft
  mode: AiWorkoutMode
}

export const ACTIVE_WORKOUT_DRAFT_PREFIX = "onerep:active-workout-draft:v1:"
export const REST_TIMER_PREFIX = "onerep:active-rest-timer:v1:"
export const RETRO_WORKOUT_DRAFT_PREFIX = "onerep:retro-workout-draft:v1:"

export const SET_ORDER: SetType[] = [
  "working",
  "warmup",
  "failure",
  "myoreps",
  "drop",
]

export const KG_TO_LBS = 2.20462

export const BAR_TYPES = ["olympic", "womens", "ez", "trap", "custom"] as const

export const BAR_PROFILES: Array<{
  type: BarType
  label: string
  shortLabel: string
  kg: number
  lbs: number
  image: string
}> = [
  {
    type: "olympic",
    label: "Olympic bar",
    shortLabel: "Olympic",
    kg: 20,
    lbs: 45,
    image: olympicBarPng,
  },
  {
    type: "womens",
    label: "Training bar",
    shortLabel: "15 kg",
    kg: 15,
    lbs: 35,
    image: olympicBarPng,
  },
  {
    type: "ez",
    label: "EZ curl bar",
    shortLabel: "EZ",
    kg: 10,
    lbs: 25,
    image: ezBarPng,
  },
  {
    type: "trap",
    label: "Trap bar",
    shortLabel: "Trap",
    kg: 25,
    lbs: 55,
    image: trapBarPng,
  },
]

export const CARDIO_SOURCE_OPTIONS: Array<{
  provider: CardioSourceProvider
  label: string
}> = [
  { provider: "manual", label: "Manual" },
  { provider: "apple_health", label: "Apple Health" },
  { provider: "strava", label: "Strava" },
  { provider: "garmin", label: "Garmin" },
  { provider: "fitbit", label: "Fitbit" },
  { provider: "gpx", label: "GPX" },
  { provider: "other", label: "Other" },
]

export const HEART_RATE_ZONES: Array<{
  key: HeartRateZoneKey
  label: string
}> = [
  { key: "zone1Seconds", label: "Z1" },
  { key: "zone2Seconds", label: "Z2" },
  { key: "zone3Seconds", label: "Z3" },
  { key: "zone4Seconds", label: "Z4" },
  { key: "zone5Seconds", label: "Z5" },
]

export function uid() {
  return createClientId()
}

export function formatElapsed(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  return `${m}:${String(sec).padStart(2, "0")}`
}

export function parsePositiveFloat(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function parseNonNegativeInt(value: string) {
  const parsed = Number.parseInt(value || "0", 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function durationFromCardioState(cardio: CardioExerciseState) {
  const hours = parseNonNegativeInt(cardio.durationHours)
  const minutes = parseNonNegativeInt(cardio.durationMinutes)
  const seconds = parseNonNegativeInt(cardio.durationSeconds)
  const total = hours * 3600 + minutes * 60 + seconds
  return total > 0 ? total : null
}

export function paceFromCardioState(cardio: CardioExerciseState) {
  const minutes = parseNonNegativeInt(cardio.paceMinutes)
  const seconds = parseNonNegativeInt(cardio.paceSeconds)
  const total = minutes * 60 + seconds
  if (total <= 0) return null
  return cardio.distanceUnit === "mi" ? total / 1.609344 : total
}

export function formatCardioNumber(value: number) {
  return String(Number.isInteger(value) ? value : +value.toFixed(2))
}

export function splitDurationForState(totalSeconds?: number | null) {
  const safeTotal = Math.max(0, Math.round(totalSeconds ?? 0))
  const hours = Math.floor(safeTotal / 3600)
  const minutes = Math.floor((safeTotal % 3600) / 60)
  const seconds = safeTotal % 60
  return {
    hours: hours ? String(hours) : "",
    minutes: minutes ? String(minutes) : "",
    seconds: seconds ? String(seconds) : "",
  }
}

export function healthWorkoutToCardioPatch(
  workout: HealthWorkout,
  distanceUnit: CardioDistanceUnit
): Partial<CardioExerciseState> {
  const duration = splitDurationForState(workout.durationSeconds)
  const distance =
    workout.totalDistanceMeters && workout.totalDistanceMeters > 0
      ? formatCardioNumber(
          cardioMetersToDistance(workout.totalDistanceMeters, distanceUnit)
        )
      : ""
  return {
    distance,
    distanceUnit,
    durationHours: duration.hours,
    durationMinutes: duration.minutes,
    durationSeconds: duration.seconds,
    paceMinutes: "",
    paceSeconds: "",
    avgHeartRate: workout.avgHeartRateBpm
      ? String(Math.round(workout.avgHeartRateBpm))
      : "",
    maxHeartRate: workout.maxHeartRateBpm
      ? String(Math.round(workout.maxHeartRateBpm))
      : "",
    routeName:
      workout.routeName ??
      (workout.hasRoute ? `${workout.activityName} route` : ""),
    routeUrl: "",
    sourceProvider: healthProvider() ?? "apple_health",
    sourceName: workout.sourceName ?? healthProviderLabel(),
    sourceExternalId: workout.uuid,
    sourceImportedAt: new Date().toISOString(),
  }
}

export function formatHealthWorkoutDate(startedAt: string) {
  const date = new Date(startedAt)
  if (Number.isNaN(date.getTime())) return "Recent"
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function makeCardioState(): CardioExerciseState {
  return {
    distance: "",
    distanceUnit: "km",
    durationHours: "",
    durationMinutes: "",
    durationSeconds: "",
    paceMinutes: "",
    paceSeconds: "",
    avgHeartRate: "",
    maxHeartRate: "",
    zones: {
      zone1Seconds: "",
      zone2Seconds: "",
      zone3Seconds: "",
      zone4Seconds: "",
      zone5Seconds: "",
    },
    routeName: "",
    routeUrl: "",
    sourceProvider: "manual",
    sourceName: "",
    sourceExternalId: "",
    sourceImportedAt: "",
    notes: "",
  }
}

export function normalizeCardioState(
  state?: Partial<CardioExerciseState>
): CardioExerciseState {
  const defaults = makeCardioState()
  return {
    ...defaults,
    ...state,
    distanceUnit: state?.distanceUnit === "mi" ? "mi" : "km",
    sourceProvider: CARDIO_SOURCE_OPTIONS.some(
      (option) => option.provider === state?.sourceProvider
    )
      ? (state?.sourceProvider as CardioSourceProvider)
      : "manual",
    zones: {
      ...defaults.zones,
      ...(state?.zones ?? {}),
    },
  }
}

export function cardioLogFromState(
  cardio: CardioExerciseState
): CardioWorkoutDetails | null {
  const details: CardioWorkoutDetails = {}
  const distance = parsePositiveFloat(cardio.distance)
  if (distance) {
    details.distanceMeters = +cardioDistanceToMeters(
      distance,
      cardio.distanceUnit
    ).toFixed(2)
    details.distanceUnit = cardio.distanceUnit
  }

  const durationSeconds = durationFromCardioState(cardio)
  if (durationSeconds) details.durationSeconds = durationSeconds

  const calculatedPace = calcPaceSecondsPerKm(
    details.distanceMeters,
    durationSeconds ?? undefined
  )
  const manualPace = paceFromCardioState(cardio)
  const paceSecondsPerKm = calculatedPace ?? manualPace
  if (paceSecondsPerKm) {
    details.paceSecondsPerKm = Math.round(paceSecondsPerKm)
  }

  const avgHeartRate = parsePositiveFloat(cardio.avgHeartRate)
  if (avgHeartRate) details.avgHeartRateBpm = Math.round(avgHeartRate)

  const maxHeartRate = parsePositiveFloat(cardio.maxHeartRate)
  if (maxHeartRate) details.maxHeartRateBpm = Math.round(maxHeartRate)

  const heartRateZones = Object.fromEntries(
    HEART_RATE_ZONES.flatMap(({ key }) => {
      const minutes = parsePositiveFloat(cardio.zones[key])
      return minutes ? [[key, Math.round(minutes * 60)]] : []
    })
  ) as NonNullable<CardioWorkoutDetails["heartRateZones"]>
  if (Object.keys(heartRateZones).length > 0) {
    details.heartRateZones = heartRateZones
  }

  const routeName = cardio.routeName.trim()
  const routeUrl = cardio.routeUrl.trim()
  if (routeName || routeUrl) {
    details.route = {
      ...(routeName ? { name: routeName } : {}),
      ...(routeUrl ? { url: routeUrl } : {}),
    }
  }

  const sourceName = cardio.sourceName.trim()
  const sourceExternalId = cardio.sourceExternalId.trim()
  const sourceImportedAt = cardio.sourceImportedAt.trim()
  if (cardio.sourceProvider !== "manual" || sourceName || sourceExternalId) {
    details.source = {
      provider: cardio.sourceProvider,
      ...(sourceName ? { name: sourceName } : {}),
      ...(sourceExternalId ? { externalId: sourceExternalId } : {}),
      ...(sourceImportedAt ? { importedAt: sourceImportedAt } : {}),
    }
  }

  const notes = cardio.notes.trim()
  if (notes) details.notes = notes

  return hasCardioDetails(details) ? details : null
}

export function cardioDetailsFromState(cardio: CardioExerciseState) {
  return cardioLogFromState(cardio)
}

export function hasCardioStateDetails(cardio: CardioExerciseState) {
  return Boolean(cardioDetailsFromState(cardio))
}

export function toDisplay(kgStr: string, unit: WeightUnit): string {
  if (!kgStr) return ""
  const kg = parseFloat(kgStr)
  if (isNaN(kg)) return kgStr
  return formatWeightValue(kg, unit)
}

export function toKg(displayVal: string, unit: WeightUnit): string {
  if (!displayVal) return ""
  const n = parseFloat(displayVal)
  if (isNaN(n)) return displayVal
  return unit === "lbs" ? formatKgString(n / KG_TO_LBS) : formatKgString(n)
}

export function parseKg(value?: string | number | null) {
  if (value == null || value === "") return null
  const parsed = typeof value === "number" ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatKgString(kg: number) {
  return String(+kg.toFixed(2))
}

export function formatWeightValue(kg: number, unit: WeightUnit) {
  const value = unit === "lbs" ? kg * KG_TO_LBS : kg
  return String(Number.isInteger(value) ? value : +value.toFixed(1))
}

export function displayWeightToKg(value: number, unit: WeightUnit) {
  return unit === "lbs" ? value / KG_TO_LBS : value
}

export function getBarProfile(type: BarType) {
  return BAR_PROFILES.find((profile) => profile.type === type)
}

export function isBarType(value: unknown): value is BarType {
  return (
    typeof value === "string" &&
    (BAR_TYPES as readonly string[]).includes(value)
  )
}

export function normalizeBarType(value: unknown, barWeight?: string): BarType {
  if (isBarType(value)) return value
  const kg = parseKg(barWeight)
  if (!kg) return "olympic"
  const exactProfile = BAR_PROFILES.find(
    (profile) =>
      Math.abs(profile.kg - kg) < 0.01 ||
      Math.abs(profile.lbs / KG_TO_LBS - kg) < 0.01
  )
  return exactProfile?.type ?? "custom"
}

export function defaultBarWeight(type: BarType, unit: WeightUnit) {
  const profile = getBarProfile(type) ?? BAR_PROFILES[0]
  return unit === "lbs"
    ? toKg(String(profile.lbs), "lbs")
    : formatKgString(profile.kg)
}

export function barImageForType(type: BarType) {
  return getBarProfile(type)?.image ?? olympicBarPng
}

export function barLabelForType(type: BarType) {
  return getBarProfile(type)?.label ?? "Custom bar"
}

export function platePerSideKg(totalKg: number | null, barKg: number | null) {
  if (barKg == null || barKg <= 0 || totalKg == null) return null
  return Math.max(0, (totalKg - barKg) / 2)
}

export function plateDisplayFromValues(
  totalWeight: string,
  barWeight: string,
  unit: WeightUnit
) {
  const totalKg = parseKg(totalWeight)
  const barKg = parseKg(barWeight)
  const plateKg = platePerSideKg(totalKg, barKg)
  return plateKg == null ? "" : formatWeightValue(plateKg, unit)
}

/**
 * A blank set.
 *
 * `completed` is a parameter because the retro logger records sets that have
 * already happened — asking someone to tick every set of a workout they
 * finished an hour ago is busywork.
 */
export function makeSet(completed = false): WorkoutSet {
  return {
    id: uid(),
    type: "working",
    weight: "",
    reps: "",
    restSeconds: 120,
    completed,
  }
}

/**
 * Set a weight or reps value on one set and carry it down to the sets after it.
 *
 * Straight sets are the common case, so typing 100 kg × 8 four times is
 * busywork. A later set is only filled when it is still blank or when it still
 * shows the value being replaced (so correcting 100 → 105 on the first set
 * moves the whole run). Anything the user typed themselves is left alone, and
 * completed sets are never touched — they are already history.
 */
export function fillDownSetField(
  sets: WorkoutSet[],
  index: number,
  field: "weight" | "reps",
  value: string
): WorkoutSet[] {
  const previous = sets[index]?.[field] ?? ""
  const next = sets.map((set, i) =>
    i === index ? { ...set, [field]: value } : set
  )
  if (!value.trim()) return next
  for (let i = index + 1; i < next.length; i++) {
    const set = next[i]
    if (set.completed) continue
    const current = set[field]
    if (current.trim() && current !== previous) break
    next[i] = { ...set, [field]: value }
  }
  return next
}

export function removeExFromItems(
  items: WorkoutItem[],
  exId: string
): WorkoutItem[] {
  return items.flatMap((item): WorkoutItem[] => {
    if (item.kind === "solo") return item.exerciseId === exId ? [] : [item]
    const rest = item.exerciseIds.filter((id) => id !== exId)
    if (rest.length === 0) return []
    if (rest.length === 1)
      return [{ kind: "solo" as const, exerciseId: rest[0] }]
    return [{ ...item, exerciseIds: rest }]
  })
}

export function workoutItemKey(item: WorkoutItem) {
  return item.kind === "solo"
    ? `solo:${item.exerciseId}`
    : `superset:${item.id}`
}

export function workoutDragLabel(
  itemKey: string,
  items: WorkoutItem[],
  exerciseLookup: Record<string, Exercise>
) {
  const item = items.find((candidate) => workoutItemKey(candidate) === itemKey)
  if (!item) return ""
  if (item.kind === "solo") {
    return exerciseLookup[item.exerciseId]?.name ?? ""
  }
  return item.exerciseIds
    .map((id) => exerciseLookup[id]?.name)
    .filter(Boolean)
    .join(" + ")
}

/**
 * Count total sets and completed sets across the given workout items.
 *
 * @param items - Array of workout items (solo exercises or supersets) to include in the count
 * @param exData - Mapping from exercise ID to its state (including the `sets` array)
 * @returns An object with `total` — the number of sets across all referenced exercises, and `done` — the number of sets whose `completed` flag is `true`
 */
export function countWorkoutProgress(
  items: WorkoutItem[],
  exData: Record<string, ExerciseState>,
  exerciseLookup: Record<string, Exercise>
) {
  let total = 0,
    done = 0
  for (const item of items) {
    const ids = item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
    for (const id of ids) {
      const exercise = exerciseLookup[id]
      const data = exData[id]
      if (!data) continue
      if (exercise?.category === "cardio") {
        total += 1
        if (hasCardioStateDetails(data.cardio)) done += 1
        continue
      }
      const sets = data.sets ?? []
      total += sets.length
      done += sets.filter((x) => x.completed).length
    }
  }
  return { total, done }
}

export function normalizeExerciseState(
  state?: PersistedExerciseState
): ExerciseState {
  const barWeight = state?.barWeight || ""
  return {
    sets: (state?.sets || []).map((s) => ({
      id: s.id || uid(),
      type: s.type || "working",
      weight: s.weight || "",
      reps: s.reps || "",
      restSeconds: s.restSeconds || 120,
      completed: !!s.completed,
    })),
    trackRpe: false,
    trackUnilateral: false,
    barWeight,
    barType: normalizeBarType(state?.barType, barWeight),
    cardio: normalizeCardioState(state?.cardio),
  }
}

export function isCardioExercise(exercise: Exercise | undefined | null) {
  return exercise?.category === "cardio"
}

export function makeDefaultExerciseState(
  exercise: Exercise,
  completed = false
): ExerciseState {
  return {
    sets: isCardioExercise(exercise)
      ? []
      : [makeSet(completed), makeSet(completed), makeSet(completed)],
    trackRpe: false,
    trackUnilateral: false,
    barWeight: "",
    barType: "olympic",
    cardio: makeCardioState(),
  }
}

export function normalizeExerciseNameForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function scoreExerciseMatch(query: string, exercise: Exercise) {
  const q = normalizeExerciseNameForMatch(query)
  const name = normalizeExerciseNameForMatch(exercise.name)
  if (!q || !name) return 0
  if (q === name) return 100
  if (name.includes(q) || q.includes(name)) return 85

  const qTokens = new Set(q.split(" ").filter((token) => token.length > 2))
  const haystack = normalizeExerciseNameForMatch(
    [
      exercise.name,
      exercise.muscle,
      exercise.equipment,
      ...(exercise.primaryMuscles ?? []),
      ...(exercise.secondaryMuscles ?? []),
    ]
      .filter(Boolean)
      .join(" ")
  )
  const matches = [...qTokens].filter((token) => haystack.includes(token))
  return matches.length * 12 - Math.max(0, qTokens.size - matches.length) * 3
}

export function pickBestExerciseMatch(query: string, candidates: Exercise[]) {
  const best = candidates
    .map((exercise) => ({
      exercise,
      score: scoreExerciseMatch(query, exercise),
    }))
    .sort((a, b) => b.score - a.score)[0]
  return best && best.score > 0 ? best.exercise : undefined
}

export function normalizeAgentWorkoutSet(
  set: AgentWorkoutSetDraft
): WorkoutSet {
  const type = SET_ORDER.includes(set.type as SetType)
    ? (set.type as SetType)
    : "working"
  const restSeconds = Number.isFinite(Number(set.restSeconds))
    ? Math.max(0, Math.min(600, Math.round(Number(set.restSeconds))))
    : 120

  return normalizeExerciseState({
    sets: [
      {
        ...set,
        id: uid(),
        type,
        weight: String(set.weight ?? "").trim(),
        reps: String(set.reps ?? "").trim(),
        restSeconds,
        completed: false,
      },
    ],
  }).sets[0]
}

export function makeExerciseStateFromAgentDraft(
  exercise: Exercise,
  draft: AgentWorkoutExerciseDraft
): ExerciseState {
  const base = makeDefaultExerciseState(exercise)
  if (isCardioExercise(exercise)) return base

  const sets =
    draft.sets && draft.sets.length > 0
      ? draft.sets.slice(0, 8).map((set) => normalizeAgentWorkoutSet(set))
      : base.sets

  return {
    ...base,
    sets,
    trackRpe: false,
    trackUnilateral: false,
  }
}

export function replaceExerciseInItems(
  items: WorkoutItem[],
  oldExerciseId: string,
  newExerciseId: string
): WorkoutItem[] {
  return items.flatMap((item): WorkoutItem[] => {
    if (item.kind === "solo") {
      return [
        {
          kind: "solo" as const,
          exerciseId:
            item.exerciseId === oldExerciseId ? newExerciseId : item.exerciseId,
        },
      ]
    }

    const exerciseIds = item.exerciseIds.reduce<string[]>((acc, id) => {
      const nextId = id === oldExerciseId ? newExerciseId : id
      if (!acc.includes(nextId)) acc.push(nextId)
      return acc
    }, [])

    if (exerciseIds.length === 0) return []
    if (exerciseIds.length === 1) {
      return [{ kind: "solo", exerciseId: exerciseIds[0] }]
    }
    return [{ ...item, exerciseIds }]
  })
}

export function activeWorkoutDraftKey(slot: 1 | 2) {
  return `${ACTIVE_WORKOUT_DRAFT_PREFIX}${slot}`
}

/**
 * The draft key for a reconstructed session.
 *
 * Deliberately keyed by date and session rather than slot: a retro draft must
 * never be mistaken for — or overwrite — the draft of a workout running right
 * now in the same slot.
 */
export function retroWorkoutDraftKey(date: string, sessionId: string) {
  return `${RETRO_WORKOUT_DRAFT_PREFIX}${date}:${sessionId}`
}

export function restTimerKey(slot: 1 | 2) {
  return `${REST_TIMER_PREFIX}${slot}`
}

export function readActiveWorkoutDraft(
  slot: 1 | 2,
  key: string = activeWorkoutDraftKey(slot)
): LocalActiveWorkoutDraft | null {
  const raw = safeLocalStorageGet(key)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<LocalActiveWorkoutDraft>
    if (
      parsed.slot !== slot ||
      !Array.isArray(parsed.items) ||
      typeof parsed.exerciseData !== "object" ||
      parsed.exerciseData === null ||
      typeof parsed.startedAt !== "number" ||
      typeof parsed.savedAt !== "number"
    ) {
      return null
    }

    return {
      elapsedSeconds:
        typeof parsed.elapsedSeconds === "number" ? parsed.elapsedSeconds : 0,
      exerciseData: parsed.exerciseData as Record<string, ExerciseState>,
      items: parsed.items as WorkoutItem[],
      presetId:
        typeof parsed.presetId === "string" ? parsed.presetId : undefined,
      savedAt: parsed.savedAt,
      slot,
      startedAt: parsed.startedAt,
    }
  } catch {
    return null
  }
}

export function writeActiveWorkoutDraft(
  draft: LocalActiveWorkoutDraft,
  key: string = activeWorkoutDraftKey(draft.slot)
) {
  safeLocalStorageSet(key, JSON.stringify(draft))
}

export function clearActiveWorkoutDraft(slot: 1 | 2, key?: string) {
  safeLocalStorageRemove(key ?? activeWorkoutDraftKey(slot))
  // A retro session never starts a rest timer, so there is none to clear.
  if (!key) safeLocalStorageRemove(restTimerKey(slot))
}

// ─── Rest timer countdown ─────────────────────────────────────────────────────

export function useRestCountdown(storageKey: string) {
  const [remaining, setRemaining] = useState<number | null>(null)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)
  const endAtRef = useRef<number | null>(null)

  const stopInterval = useCallback(() => {
    if (ref.current) {
      clearInterval(ref.current)
      ref.current = null
    }
  }, [])

  const updateFromEndAt = useCallback(() => {
    const endAt = endAtRef.current
    if (!endAt) {
      setRemaining(null)
      return
    }

    const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
    if (next <= 0) {
      stopInterval()
      endAtRef.current = null
      safeLocalStorageRemove(storageKey)
      setRemaining(null)
      playRestCompletion()
      void playNativeRestHaptic()
      void cancelRestAlert()
      return
    }

    setRemaining(next)
  }, [storageKey, stopInterval])

  const startTicker = useCallback(() => {
    stopInterval()
    updateFromEndAt()
    ref.current = setInterval(updateFromEndAt, 1000)
  }, [stopInterval, updateFromEndAt])

  function start(seconds: number) {
    const endAt = Date.now() + seconds * 1000
    endAtRef.current = endAt
    safeLocalStorageSet(storageKey, JSON.stringify({ endAt }))
    void scheduleRestAlert(endAt)
    startTicker()
  }

  function dismiss() {
    stopInterval()
    endAtRef.current = null
    safeLocalStorageRemove(storageKey)
    void cancelRestAlert()
    setRemaining(null)
  }

  useEffect(() => {
    const raw = safeLocalStorageGet(storageKey)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as { endAt?: unknown }
      if (typeof parsed.endAt === "number" && parsed.endAt > Date.now()) {
        endAtRef.current = parsed.endAt
        startTicker()
      } else {
        safeLocalStorageRemove(storageKey)
      }
    } catch {
      safeLocalStorageRemove(storageKey)
    }
  }, [startTicker, storageKey])

  useEffect(
    () => () => {
      stopInterval()
    },
    [stopInterval]
  )

  return { remaining, start, dismiss }
}

/**
 * Tracks seconds elapsed since a given start timestamp.
 *
 * Recalculates every second and also when the document becomes visible again.
 *
 * @param startedAt - Unix epoch milliseconds timestamp marking the start, or `null` if not started
 * @returns The number of whole seconds elapsed since `startedAt`; `0` if `startedAt` is `null`
 */

export function useElapsedTimer(startedAt: number | null) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    /**
     * Update the elapsed seconds state based on the `startedAt` timestamp.
     *
     * If `startedAt` is defined, computes the whole seconds elapsed since that timestamp
     * (using floor) and updates the component state via `setElapsed`.
     */
    function updateElapsed() {
      if (startedAt) {
        const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
        setElapsed(elapsedSeconds)
      }
    }

    // Initial calculation
    updateElapsed()

    // Update every second
    const id = setInterval(updateElapsed, 1000)

    /**
     * Recalculates the elapsed workout timer when the document becomes visible.
     *
     * This should be registered on the document's `visibilitychange` event so the elapsed time is updated when the tab or window regains focus.
     */
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        updateElapsed()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [startedAt])

  return elapsed
}

// ─── Reconstructing a saved workout ───────────────────────────────────────────

/**
 * Rebuilds editable exercise state from an already-logged exercise.
 *
 * The inverse of the flatten `handleFinish` performs on the way out, so a saved
 * workout can be reopened, changed, and written back. Every loaded set arrives
 * completed — it was, by definition — and weights come back as the kilogram
 * strings the editor expects rather than the numbers the log stores.
 */
export function exerciseStateFromLoggedExercise(
  logged: {
    sets?: Array<{
      weight?: number
      reps?: number
      completed?: boolean
      type?: string
      restSeconds?: number
    }>
    cardio?: Partial<CardioWorkoutDetails> | null
  },
  exercise?: Exercise
): ExerciseState {
  const base = exercise
    ? makeDefaultExerciseState(exercise)
    : normalizeExerciseState()

  const sets = (logged.sets ?? []).map((set) => ({
    id: uid(),
    type: (SET_ORDER.includes(set.type as SetType)
      ? (set.type as SetType)
      : "working") as SetType,
    weight:
      typeof set.weight === "number" && set.weight > 0
        ? formatKgString(set.weight)
        : "",
    reps: typeof set.reps === "number" && set.reps > 0 ? String(set.reps) : "",
    restSeconds: typeof set.restSeconds === "number" ? set.restSeconds : 120,
    // A logged set was performed. An incomplete one was never written.
    completed: true,
  }))

  const cardio = logged.cardio
    ? normalizeCardioState(cardioStateFromDetails(logged.cardio))
    : base.cardio

  return { ...base, sets, cardio }
}

/** Fills the cardio editor from the details a log stores. */
function cardioStateFromDetails(
  details: Partial<CardioWorkoutDetails>
): Partial<CardioExerciseState> {
  const distanceUnit: CardioDistanceUnit =
    details.distanceUnit === "mi" ? "mi" : "km"
  const duration = splitDurationForState(details.durationSeconds)
  return {
    distance:
      details.distanceMeters && details.distanceMeters > 0
        ? formatCardioNumber(
            cardioMetersToDistance(details.distanceMeters, distanceUnit)
          )
        : "",
    distanceUnit,
    durationHours: duration.hours,
    durationMinutes: duration.minutes,
    durationSeconds: duration.seconds,
    avgHeartRate: details.avgHeartRateBpm
      ? String(Math.round(details.avgHeartRateBpm))
      : "",
    maxHeartRate: details.maxHeartRateBpm
      ? String(Math.round(details.maxHeartRateBpm))
      : "",
    routeName: details.route?.name ?? "",
    routeUrl: details.route?.url ?? "",
    sourceProvider: details.source?.provider ?? "manual",
    sourceName: details.source?.name ?? "",
    sourceExternalId: details.source?.externalId ?? "",
    sourceImportedAt: details.source?.importedAt ?? "",
    notes: details.notes ?? "",
  }
}

/** Lower bound on a reconstructed session, in seconds. */
export const MIN_RETRO_DURATION_SECONDS = 300
/** Upper bound on a reconstructed session, in seconds. */
export const MAX_RETRO_DURATION_SECONDS = 21_600

/**
 * A plausible length for a session nobody timed.
 *
 * Only ever a starting value: the save sheet shows it as an editable field, so
 * the user corrects it rather than the app quietly inventing a number. Roughly
 * 45 seconds of work per completed set plus the rest that was planned between
 * them.
 */
export function estimateRetroDurationSeconds(
  items: WorkoutItem[],
  exerciseData: Record<string, ExerciseState>
): number {
  let seconds = 0
  for (const item of items) {
    const ids = item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
    for (const id of ids) {
      const data = exerciseData[id]
      if (!data) continue
      for (const set of data.sets ?? []) {
        if (!set.completed) continue
        seconds += 45 + (Number.isFinite(set.restSeconds) ? set.restSeconds : 0)
      }
      const cardioSeconds = durationFromCardioState(data.cardio)
      if (cardioSeconds) seconds += cardioSeconds
    }
  }
  return Math.min(
    MAX_RETRO_DURATION_SECONDS,
    Math.max(MIN_RETRO_DURATION_SECONDS, Math.round(seconds))
  )
}
