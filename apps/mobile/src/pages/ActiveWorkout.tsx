import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { usePostHog } from "@posthog/react"
import { useAction, useQuery, useMutation } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { toast } from "sonner"
import {
  ArrowLeft,
  AppleLogo,
  Barbell,
  CaretDown,
  CaretUp,
  ChartLine,
  Check,
  ClockCounterClockwise,
  DotsSixVertical,
  Fire,
  MagnifyingGlass,
  Minus,
  Plus,
  Sparkle,
  Timer,
  Wind,
  X,
} from "@phosphor-icons/react"
import {
  cn,
  createClientId,
  logDevError,
  logDevWarn,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  safeSessionStorageRemove,
  safeSessionStorageSet,
} from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { sparklinePoints } from "@/lib/progress-metrics"
import olympicBarPng from "@/assets/bars/bar-olympic.png"
import ezBarPng from "@/assets/bars/bar-ez.png"
import trapBarPng from "@/assets/bars/bar-trap.png"
import {
  resolveExerciseIds,
  searchExercises,
  visiblePopularExerciseSearches,
  type Exercise,
  type ExerciseCategory,
} from "@/lib/exercise-catalog"
import {
  readRecentExerciseSearches,
  rememberRecentExerciseSearch,
  visibleRecentExerciseSearches,
  type RecentExerciseSearch,
} from "@/lib/exercise-search-recents"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { hapticMedium, hapticSelection } from "@/lib/haptics"
import { api } from "../../../../convex/_generated/api"
import {
  calcPaceSecondsPerKm,
  cardioDistanceToMeters,
  cardioMetersToDistance,
  compactCardioSummary,
  formatCardioDistance,
  formatCardioDuration,
  formatCardioPace,
  hasCardioDetails,
  todayIso,
  type CardioDistanceUnit,
  type CardioSourceProvider,
  type CardioWorkoutDetails,
} from "@/lib/workout-sync"
import {
  getRecentAppleHealthWorkouts,
  isAppleHealthSupportedPlatform,
  requestAppleHealthAuthorization,
  type AppleHealthWorkout,
} from "@/lib/apple-health"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui"
import { EXERCISE_CATEGORY_COLORS } from "@/lib/design-tokens"
import { useAiFeatureGate } from "@/lib/ai-access"

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = ExerciseCategory
type SetType = "working" | "warmup" | "failure" | "myoreps" | "drop"
type WeightUnit = "kg" | "lbs"
type WorkoutSyncStatus = "idle" | "pending" | "saving" | "saved" | "error"
type BarType = "olympic" | "womens" | "ez" | "trap" | "custom"
type HeartRateZoneKey =
  | "zone1Seconds"
  | "zone2Seconds"
  | "zone3Seconds"
  | "zone4Seconds"
  | "zone5Seconds"

type WorkoutSet = {
  id: string
  type: SetType
  weight: string
  reps: string
  leftReps: string
  rightReps: string
  rpe: string
  restSeconds: number
  completed: boolean
}

type PersistedWorkoutSet = Partial<WorkoutSet>

type CardioExerciseState = {
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

type ExerciseState = {
  sets: WorkoutSet[]
  trackRpe: boolean
  trackUnilateral: boolean
  barWeight: string
  barType: BarType
  cardio: CardioExerciseState
}

type PersistedExerciseState = Partial<
  Omit<ExerciseState, "sets" | "cardio">
> & {
  sets?: PersistedWorkoutSet[]
  cardio?: Partial<CardioExerciseState>
}

type LoggedWorkoutSet = {
  weight: number
  reps: number
  completed: boolean
  type: string
}

type LastSession = {
  date: string
  sets: LoggedWorkoutSet[]
}

type LoggedWorkoutExercise = {
  id: string
  sets: LoggedWorkoutSet[]
}

type ExerciseCardDropProps = {
  showLineBefore: boolean
  showLineAfter: boolean
}

type WeightSelectorChange = {
  weight?: string
  barWeight?: string
  barType?: BarType
}

type WorkoutItem =
  | { kind: "solo"; exerciseId: string }
  | { kind: "superset"; id: string; color: string; exerciseIds: string[] }

type LocalActiveWorkoutDraft = {
  elapsedSeconds: number
  exerciseData: Record<string, ExerciseState>
  items: WorkoutItem[]
  presetId?: string
  savedAt: number
  slot: 1 | 2
  startedAt: number
}

type ResumePromptState = {
  source: "convex" | "local"
  draft?: LocalActiveWorkoutDraft
} | null

type DragInfo = {
  itemKey: string
  x: number
  y: number
  startX: number
  startY: number
  active: boolean
}

type DropTarget = {
  type: "before" | "after"
  targetKey: string
} | null

type AiWorkoutMode = "append" | "replace" | "swap"

type AgentWorkoutSetDraft = Partial<WorkoutSet>

type AgentWorkoutExerciseDraft = {
  name: string
  sets?: AgentWorkoutSetDraft[]
  trackRpe?: boolean
  trackUnilateral?: boolean
}

type AgentWorkoutDraft = {
  name?: string
  exercises?: AgentWorkoutExerciseDraft[]
  notes?: string
}

type AiWorkoutSheetTarget = {
  exerciseId?: string
  exerciseName?: string
} | null

// ─── Constants ────────────────────────────────────────────────────────────────

const ABORTED_WORKOUT_SLOT_KEY = "onerep:aborted-workout-slot"
const ACTIVE_WORKOUT_DRAFT_PREFIX = "onerep:active-workout-draft:v1:"
const REST_TIMER_PREFIX = "onerep:active-rest-timer:v1:"

const CATEGORY_ICON: Record<
  Category,
  React.ComponentType<React.ComponentProps<typeof Barbell>>
> = {
  strength: Barbell,
  cardio: Fire,
  mobility: Wind,
  core: Sparkle,
}

const CATEGORY_COLOR: Record<Category, string> = {
  strength: EXERCISE_CATEGORY_COLORS.strength,
  cardio: EXERCISE_CATEGORY_COLORS.cardio,
  mobility: EXERCISE_CATEGORY_COLORS.mobility,
  core: EXERCISE_CATEGORY_COLORS.core,
}

const SET_ORDER: SetType[] = ["working", "warmup", "failure", "myoreps", "drop"]

const SET_CFG: Record<SetType, { label: string; color: string; bg: string }> = {
  working: {
    label: "Working",
    color: "color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground))",
    bg: "color-mix(in srgb, var(--muted) 58%, transparent)",
  },
  warmup: {
    label: "Warm-up",
    color: "color-mix(in srgb, var(--foreground) 58%, var(--muted-foreground))",
    bg: "color-mix(in srgb, var(--muted) 48%, transparent)",
  },
  failure: {
    label: "Failure",
    color: "color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground))",
    bg: "color-mix(in srgb, var(--muted) 58%, transparent)",
  },
  myoreps: {
    label: "Myo-reps",
    color: "color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground))",
    bg: "color-mix(in srgb, var(--muted) 58%, transparent)",
  },
  drop: {
    label: "Drop set",
    color: "color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground))",
    bg: "color-mix(in srgb, var(--muted) 58%, transparent)",
  },
}

const REST_OPTS = [0, 30, 60, 90, 120, 150, 180, 240, 300]
const KG_TO_LBS = 2.20462

const BAR_TYPES = ["olympic", "womens", "ez", "trap", "custom"] as const

const BAR_PROFILES: Array<{
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

const CARDIO_SOURCE_OPTIONS: Array<{
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

const HEART_RATE_ZONES: Array<{
  key: HeartRateZoneKey
  label: string
}> = [
  { key: "zone1Seconds", label: "Z1" },
  { key: "zone2Seconds", label: "Z2" },
  { key: "zone3Seconds", label: "Z3" },
  { key: "zone4Seconds", label: "Z4" },
  { key: "zone5Seconds", label: "Z5" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return createClientId()
}

function formatRest(s: number) {
  if (s <= 0) return "Off"
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function splitRest(seconds: number) {
  return {
    minutes: String(Math.floor(seconds / 60)),
    secs: String(seconds % 60).padStart(2, "0"),
  }
}

function clampRestInput(minutes: string, secs: string) {
  const safeMinutes = Math.max(0, Number.parseInt(minutes || "0", 10) || 0)
  const safeSeconds = Math.min(
    59,
    Math.max(0, Number.parseInt(secs || "0", 10) || 0)
  )
  return safeMinutes * 60 + safeSeconds
}

function formatElapsed(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  return `${m}:${String(sec).padStart(2, "0")}`
}

function parsePositiveFloat(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseNonNegativeInt(value: string) {
  const parsed = Number.parseInt(value || "0", 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function durationFromCardioState(cardio: CardioExerciseState) {
  const hours = parseNonNegativeInt(cardio.durationHours)
  const minutes = parseNonNegativeInt(cardio.durationMinutes)
  const seconds = parseNonNegativeInt(cardio.durationSeconds)
  const total = hours * 3600 + minutes * 60 + seconds
  return total > 0 ? total : null
}

function paceFromCardioState(cardio: CardioExerciseState) {
  const minutes = parseNonNegativeInt(cardio.paceMinutes)
  const seconds = parseNonNegativeInt(cardio.paceSeconds)
  const total = minutes * 60 + seconds
  if (total <= 0) return null
  return cardio.distanceUnit === "mi" ? total / 1.609344 : total
}

function formatCardioNumber(value: number) {
  return String(Number.isInteger(value) ? value : +value.toFixed(2))
}

function splitDurationForState(totalSeconds?: number | null) {
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

function appleHealthWorkoutToCardioPatch(
  workout: AppleHealthWorkout,
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
    sourceProvider: "apple_health",
    sourceName: workout.sourceName ?? "Apple Health",
    sourceExternalId: workout.uuid,
    sourceImportedAt: new Date().toISOString(),
  }
}

function formatAppleHealthWorkoutDate(startedAt: string) {
  const date = new Date(startedAt)
  if (Number.isNaN(date.getTime())) return "Recent"
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function makeCardioState(): CardioExerciseState {
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

function normalizeCardioState(
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

function cardioLogFromState(
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

function cardioDetailsFromState(cardio: CardioExerciseState) {
  return cardioLogFromState(cardio)
}

function hasCardioStateDetails(cardio: CardioExerciseState) {
  return Boolean(cardioDetailsFromState(cardio))
}

function toDisplay(kgStr: string, unit: WeightUnit): string {
  if (!kgStr) return ""
  const kg = parseFloat(kgStr)
  if (isNaN(kg)) return kgStr
  return formatWeightValue(kg, unit)
}

function toKg(displayVal: string, unit: WeightUnit): string {
  if (!displayVal) return ""
  const n = parseFloat(displayVal)
  if (isNaN(n)) return displayVal
  return unit === "lbs" ? formatKgString(n / KG_TO_LBS) : formatKgString(n)
}

function parseKg(value?: string | number | null) {
  if (value == null || value === "") return null
  const parsed = typeof value === "number" ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatKgString(kg: number) {
  return String(+kg.toFixed(2))
}

function formatWeightValue(kg: number, unit: WeightUnit) {
  const value = unit === "lbs" ? kg * KG_TO_LBS : kg
  return String(Number.isInteger(value) ? value : +value.toFixed(1))
}

function displayWeightToKg(value: number, unit: WeightUnit) {
  return unit === "lbs" ? value / KG_TO_LBS : value
}

function getBarProfile(type: BarType) {
  return BAR_PROFILES.find((profile) => profile.type === type)
}

function isBarType(value: unknown): value is BarType {
  return (
    typeof value === "string" &&
    (BAR_TYPES as readonly string[]).includes(value)
  )
}

function normalizeBarType(value: unknown, barWeight?: string): BarType {
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

function defaultBarWeight(type: BarType, unit: WeightUnit) {
  const profile = getBarProfile(type) ?? BAR_PROFILES[0]
  return unit === "lbs"
    ? toKg(String(profile.lbs), "lbs")
    : formatKgString(profile.kg)
}

function barImageForType(type: BarType) {
  return getBarProfile(type)?.image ?? olympicBarPng
}

function barLabelForType(type: BarType) {
  return getBarProfile(type)?.label ?? "Custom bar"
}

function platePerSideKg(totalKg: number | null, barKg: number | null) {
  if (barKg == null || barKg <= 0 || totalKg == null) return null
  return Math.max(0, (totalKg - barKg) / 2)
}

function plateDisplayFromValues(
  totalWeight: string,
  barWeight: string,
  unit: WeightUnit
) {
  const totalKg = parseKg(totalWeight)
  const barKg = parseKg(barWeight)
  const plateKg = platePerSideKg(totalKg, barKg)
  return plateKg == null ? "" : formatWeightValue(plateKg, unit)
}

function makeSet(): WorkoutSet {
  return {
    id: uid(),
    type: "working",
    weight: "",
    reps: "",
    leftReps: "",
    rightReps: "",
    rpe: "",
    restSeconds: 120,
    completed: false,
  }
}

function removeExFromItems(items: WorkoutItem[], exId: string): WorkoutItem[] {
  return items.flatMap((item): WorkoutItem[] => {
    if (item.kind === "solo") return item.exerciseId === exId ? [] : [item]
    const rest = item.exerciseIds.filter((id) => id !== exId)
    if (rest.length === 0) return []
    if (rest.length === 1)
      return [{ kind: "solo" as const, exerciseId: rest[0] }]
    return [{ ...item, exerciseIds: rest }]
  })
}

function workoutItemKey(item: WorkoutItem) {
  return item.kind === "solo"
    ? `solo:${item.exerciseId}`
    : `superset:${item.id}`
}

/**
 * Count total sets and completed sets across the given workout items.
 *
 * @param items - Array of workout items (solo exercises or supersets) to include in the count
 * @param exData - Mapping from exercise ID to its state (including the `sets` array)
 * @returns An object with `total` — the number of sets across all referenced exercises, and `done` — the number of sets whose `completed` flag is `true`
 */
function countWorkoutProgress(
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

// ─── Next set indicator ───────────────────────────────────────────────────────

type NextTarget =
  | {
      kind: "set"
      exerciseId: string
      setIndex: number
    }
  | {
      kind: "cardio"
      exerciseId: string
    }
  | null

function SetNumberField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  inputMode = "numeric",
  min,
  max,
  step,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className: string
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"]
  min?: string
  max?: string
  step?: string
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="px-1 text-[10px] leading-none font-bold tracking-[0.14em] text-muted-foreground/55 uppercase">
        {label}
      </span>
      <input
        type="number"
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        className={className}
      />
    </label>
  )
}

function setGridClass(trackUnilateral: boolean, trackRpe: boolean) {
  if (trackUnilateral && trackRpe) {
    return "md:grid-cols-[2.25rem_7rem_minmax(4.5rem,1fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_4rem_5rem_2.75rem_2.25rem]"
  }
  if (trackUnilateral) {
    return "md:grid-cols-[2.25rem_7rem_minmax(5rem,1fr)_minmax(4.5rem,1fr)_minmax(4.5rem,1fr)_5rem_2.75rem_2.25rem]"
  }
  if (trackRpe) {
    return "md:grid-cols-[2.25rem_7rem_minmax(5rem,1fr)_minmax(5rem,1fr)_4rem_5rem_2.75rem_2.25rem]"
  }
  return "md:grid-cols-[2.25rem_7rem_minmax(5rem,1fr)_minmax(5rem,1fr)_2.75rem]"
}

/**
 * Locate the first incomplete set across the workout items, scanning items in order.
 *
 * @param items - Ordered list of workout items (solo exercises or supersets) to scan
 * @param exData - Mapping from exercise ID to its corresponding ExerciseState
 * @returns A `NextTarget` with `exerciseId` and `setIndex` for the first incomplete set, or `null` if none found
 */
function findNextTarget(
  items: WorkoutItem[],
  exData: Record<string, ExerciseState>,
  exerciseLookup: Record<string, Exercise>
): NextTarget {
  for (const item of items) {
    const exerciseIds =
      item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
    for (const exerciseId of exerciseIds) {
      const data = exData[exerciseId]
      if (!data) continue
      if (exerciseLookup[exerciseId]?.category === "cardio") {
        if (!hasCardioStateDetails(data.cardio)) {
          return { kind: "cardio", exerciseId }
        }
        continue
      }
      const firstIncomplete = data.sets.findIndex((s) => !s.completed)
      if (firstIncomplete !== -1) {
        return { kind: "set", exerciseId, setIndex: firstIncomplete }
      }
    }
  }
  return null
}

/**
 * Normalize persisted or partial exercise state into a complete ExerciseState with sensible defaults.
 *
 * Converts an incoming (possibly undefined or partial) state object into an ExerciseState:
 * - Ensures `sets` is an array; each set is given an `id` if missing and defaults:
 *   `type` = "working", `weight`/`reps`/`leftReps`/`rightReps`/`rpe` = `""`, `restSeconds` = `120`, `completed` coerced to boolean.
 * - Ensures `trackRpe` and `trackUnilateral` are booleans.
 *
 * @param state - Partial or persisted exercise state (may be undefined or missing fields)
 * @returns A normalized ExerciseState ready for UI usage and persistence
 */
function normalizeExerciseState(state?: PersistedExerciseState): ExerciseState {
  const barWeight = state?.barWeight || ""
  return {
    sets: (state?.sets || []).map((s) => ({
      id: s.id || uid(),
      type: s.type || "working",
      weight: s.weight || "",
      reps: s.reps || "",
      leftReps: s.leftReps || "",
      rightReps: s.rightReps || "",
      rpe: s.rpe || "",
      restSeconds: s.restSeconds || 120,
      completed: !!s.completed,
    })),
    trackRpe: !!state?.trackRpe,
    trackUnilateral: !!state?.trackUnilateral,
    barWeight,
    barType: normalizeBarType(state?.barType, barWeight),
    cardio: normalizeCardioState(state?.cardio),
  }
}

function isCardioExercise(exercise: Exercise | undefined | null) {
  return exercise?.category === "cardio"
}

function makeDefaultExerciseState(exercise: Exercise): ExerciseState {
  return {
    sets: isCardioExercise(exercise) ? [] : [makeSet(), makeSet(), makeSet()],
    trackRpe: false,
    trackUnilateral: false,
    barWeight: "",
    barType: "olympic",
    cardio: makeCardioState(),
  }
}

function normalizeExerciseNameForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function scoreExerciseMatch(query: string, exercise: Exercise) {
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

function pickBestExerciseMatch(query: string, candidates: Exercise[]) {
  const best = candidates
    .map((exercise) => ({
      exercise,
      score: scoreExerciseMatch(query, exercise),
    }))
    .sort((a, b) => b.score - a.score)[0]
  return best && best.score > 0 ? best.exercise : undefined
}

function normalizeAgentWorkoutSet(set: AgentWorkoutSetDraft): WorkoutSet {
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
        leftReps: String(set.leftReps ?? "").trim(),
        rightReps: String(set.rightReps ?? "").trim(),
        rpe: String(set.rpe ?? "").trim(),
        restSeconds,
        completed: false,
      },
    ],
  }).sets[0]
}

function makeExerciseStateFromAgentDraft(
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
    trackRpe: Boolean(draft.trackRpe) || sets.some((set) => Boolean(set.rpe)),
    trackUnilateral:
      Boolean(draft.trackUnilateral) ||
      sets.some((set) => Boolean(set.leftReps || set.rightReps)),
  }
}

function replaceExerciseInItems(
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

function activeWorkoutDraftKey(slot: 1 | 2) {
  return `${ACTIVE_WORKOUT_DRAFT_PREFIX}${slot}`
}

function restTimerKey(slot: 1 | 2) {
  return `${REST_TIMER_PREFIX}${slot}`
}

function readActiveWorkoutDraft(slot: 1 | 2): LocalActiveWorkoutDraft | null {
  const raw = safeLocalStorageGet(activeWorkoutDraftKey(slot))
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
      presetId: typeof parsed.presetId === "string" ? parsed.presetId : undefined,
      savedAt: parsed.savedAt,
      slot,
      startedAt: parsed.startedAt,
    }
  } catch {
    return null
  }
}

function writeActiveWorkoutDraft(draft: LocalActiveWorkoutDraft) {
  safeLocalStorageSet(activeWorkoutDraftKey(draft.slot), JSON.stringify(draft))
}

function clearActiveWorkoutDraft(slot: 1 | 2) {
  safeLocalStorageRemove(activeWorkoutDraftKey(slot))
  safeLocalStorageRemove(restTimerKey(slot))
}

// ─── Rest timer countdown ─────────────────────────────────────────────────────

function useRestCountdown(storageKey: string) {
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
    startTicker()
  }

  function dismiss() {
    stopInterval()
    endAtRef.current = null
    safeLocalStorageRemove(storageKey)
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

function useElapsedTimer(startedAt: number | null) {
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

// ─── Rest timer picker sheet ──────────────────────────────────────────────────

function RestTimerSheet({
  current,
  onSelect,
  onClose,
}: {
  current: number
  onSelect: (s: number) => void
  onClose: () => void
}) {
  const [minutes, setMinutes] = useState(() => splitRest(current).minutes)
  const [secs, setSecs] = useState(() => splitRest(current).secs)

  useEffect(() => {
    const next = splitRest(current)
    setMinutes(next.minutes)
    setSecs(next.secs)
  }, [current])

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[6px]"
      onClick={onClose}
    >
      <div
        className="sheet-panel app-sheet-panel w-full max-w-sm overflow-hidden"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="app-sheet-handle" />
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <Timer size={14} className="text-muted-foreground/60" />
            <span className="text-[14px] font-bold">Rest timer</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rest timer"
            className="app-icon-button"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {REST_OPTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSelect(s)}
              className={cn(
                "h-[52px] rounded-[10px] text-[14px] font-black tabular-nums transition-all active:scale-[0.985]",
                s === current
                  ? "bg-foreground text-background"
                  : "bg-muted/50 text-muted-foreground/80 active:bg-muted"
              )}
            >
              {formatRest(s)}
            </button>
          ))}
        </div>
        <div className="border-t border-border/40 px-4 pt-3 pb-2">
          <p className="mb-2.5 text-[9px] font-medium tracking-[0.18em] text-muted-foreground/45 uppercase">
            Custom
          </p>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[9px] font-bold tracking-widest text-muted-foreground/35 uppercase">
                Min
              </span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                className="h-12 [appearance:textfield] rounded-[10px] border border-border/45 bg-muted/25 px-3 text-center text-[18px] font-black tabular-nums outline-none focus:border-primary/35 focus:bg-background/70 [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
            <span className="mb-3 text-[18px] font-light text-muted-foreground/30">
              :
            </span>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[9px] font-bold tracking-widest text-muted-foreground/35 uppercase">
                Sec
              </span>
              <input
                type="number"
                min="0"
                max="59"
                inputMode="numeric"
                value={secs}
                onChange={(event) => setSecs(event.target.value)}
                className="h-12 [appearance:textfield] rounded-[10px] border border-border/45 bg-muted/25 px-3 text-center text-[18px] font-black tabular-nums outline-none focus:border-primary/35 focus:bg-background/70 [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
            <button
              onClick={() => onSelect(clampRestInput(minutes, secs))}
              className="h-12 shrink-0 rounded-[10px] bg-foreground px-5 text-[13px] font-bold text-background transition-opacity active:opacity-80"
            >
              Set
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function WeightSelectorSheet({
  currentWeight,
  barWeight,
  barType,
  unit,
  lastSet,
  onChange,
  onClose,
}: {
  currentWeight: string
  barWeight: string
  barType: BarType
  unit: WeightUnit
  lastSet?: { weight: number; reps: number } | null
  onChange: (change: WeightSelectorChange) => void
  onClose: () => void
}) {
  const [isClosing, setIsClosing] = useState(false)
  const [weightInput, setWeightInput] = useState(() =>
    toDisplay(currentWeight, unit)
  )
  const [barInput, setBarInput] = useState(() => toDisplay(barWeight, unit))
  const [selectedBarType, setSelectedBarType] = useState<BarType>(() =>
    normalizeBarType(barType, barWeight)
  )
  const [plateInput, setPlateInput] = useState(() =>
    plateDisplayFromValues(currentWeight, barWeight, unit)
  )

  useEffect(() => {
    setWeightInput(toDisplay(currentWeight, unit))
    setBarInput(toDisplay(barWeight, unit))
    setPlateInput(plateDisplayFromValues(currentWeight, barWeight, unit))
  }, [barWeight, currentWeight, unit])

  useEffect(() => {
    setSelectedBarType(normalizeBarType(barType, barWeight))
  }, [barType, barWeight])

  const totalKg = parseKg(toKg(weightInput, unit))
  const barKg = parseKg(toKg(barInput, unit))
  const hasBar = !!barKg && barKg > 0
  const activeBarImage = barImageForType(selectedBarType)
  const activeBarLabel = barLabelForType(selectedBarType)
  const currentPlateKg = platePerSideKg(totalKg, barKg)
  const lastWeightLabel =
    lastSet?.weight && lastSet.weight > 0
      ? `${toDisplay(String(lastSet.weight), unit)} ${unit}`
      : null
  const barDisplayValue =
    hasBar && barKg != null ? formatWeightValue(barKg, unit) : ""
  const plateDisplayValue =
    currentPlateKg != null ? formatWeightValue(currentPlateKg, unit) : ""
  const quickDeltas = unit === "kg" ? [1.25, 2.5, 5, 10] : [2.5, 5, 10, 25]
  const plateDeltas = unit === "kg" ? [1.25, 2.5, 5] : [2.5, 5, 10]
  const platePresets =
    unit === "kg" ? [1.25, 2.5, 5, 10, 15, 20, 25] : [2.5, 5, 10, 25, 35, 45]

  function dismiss() {
    if (isClosing) return
    setIsClosing(true)
    window.setTimeout(onClose, 190)
  }

  function emitChange(change: WeightSelectorChange) {
    onChange({
      barType: selectedBarType,
      barWeight: barKg != null && barKg > 0 ? formatKgString(barKg) : "",
      ...change,
    })
  }

  function updatePlateInput(nextTotalKg: number | null, nextBarKg = barKg) {
    const nextPlateKg = platePerSideKg(nextTotalKg, nextBarKg)
    setPlateInput(
      nextPlateKg == null ? "" : formatWeightValue(nextPlateKg, unit)
    )
  }

  function commitWeightKg(
    nextTotalKg: number,
    nextBarKg = barKg,
    nextBarType = selectedBarType
  ) {
    const nextWeightKg = formatKgString(nextTotalKg)
    setWeightInput(formatWeightValue(nextTotalKg, unit))
    updatePlateInput(nextTotalKg, nextBarKg)
    onChange({
      weight: nextWeightKg,
      barWeight:
        nextBarKg != null && nextBarKg > 0 ? formatKgString(nextBarKg) : "",
      barType: nextBarType,
    })
  }

  function setWeightDisplay(value: string) {
    setWeightInput(value)
    const nextWeightKg = toKg(value, unit)
    updatePlateInput(parseKg(nextWeightKg))
    emitChange({ weight: nextWeightKg })
  }

  function setBarDisplay(
    value: string,
    recalculateTotal = true,
    nextBarType = selectedBarType
  ) {
    const previousPlateKg =
      currentPlateKg ?? parseKg(toKg(plateInput, unit)) ?? 0
    const nextBarKgString = toKg(value, unit)
    const nextBarKg = parseKg(nextBarKgString)
    setBarInput(value)
    if (recalculateTotal && nextBarKg != null && nextBarKg > 0) {
      commitWeightKg(nextBarKg + previousPlateKg * 2, nextBarKg, nextBarType)
      return
    }
    if (nextBarKg == null || nextBarKg <= 0) {
      setPlateInput("")
    }
    onChange({
      barWeight: nextBarKgString,
      barType: nextBarType,
    })
  }

  function setWeightFromDisplayNumber(value: number) {
    const safeValue = Math.max(0, value)
    setWeightDisplay(
      String(Number.isInteger(safeValue) ? safeValue : +safeValue.toFixed(1))
    )
  }

  function applyDelta(delta: number) {
    const currentDisplay =
      totalKg != null ? (unit === "lbs" ? totalKg * KG_TO_LBS : totalKg) : 0
    setWeightFromDisplayNumber(currentDisplay + delta)
  }

  function selectBarType(type: BarType) {
    const previousPlateKg =
      currentPlateKg ?? parseKg(toKg(plateInput, unit)) ?? 0
    const nextBarKgString = defaultBarWeight(type, unit)
    const nextBarKg = parseKg(nextBarKgString)
    setSelectedBarType(type)
    setBarInput(toDisplay(nextBarKgString, unit))
    if (nextBarKg != null) {
      commitWeightKg(nextBarKg + previousPlateKg * 2, nextBarKg, type)
      return
    }
    onChange({ barWeight: nextBarKgString, barType: type })
  }

  function toggleBar() {
    if (!hasBar) {
      selectBarType(selectedBarType === "custom" ? "olympic" : selectedBarType)
      return
    }
    setBarInput("")
    setPlateInput("")
    onChange({ barWeight: "", barType: selectedBarType })
  }

  function setCustomBarDisplay(value: string) {
    if (selectedBarType !== "custom") {
      setSelectedBarType("custom")
    }
    setBarDisplay(value, true, "custom")
  }

  function ensureBarForPlates() {
    if (barKg != null && barKg > 0) {
      return { kg: barKg, type: selectedBarType }
    }
    const nextType = selectedBarType === "custom" ? "olympic" : selectedBarType
    const nextBarKgString = defaultBarWeight(nextType, unit)
    const nextBarKg = parseKg(nextBarKgString)
    setSelectedBarType(nextType)
    setBarInput(toDisplay(nextBarKgString, unit))
    return { kg: nextBarKg ?? 0, type: nextType }
  }

  function setPlatePerSideDisplay(value: string) {
    setPlateInput(value)
    const nextPlateKg = parseKg(toKg(value, unit))
    const activeBar = ensureBarForPlates()
    if (nextPlateKg == null) return
    commitWeightKg(activeBar.kg + nextPlateKg * 2, activeBar.kg, activeBar.type)
  }

  function setPlateFromDisplayNumber(value: number) {
    const safeValue = Math.max(0, value)
    setPlatePerSideDisplay(
      String(Number.isInteger(safeValue) ? safeValue : +safeValue.toFixed(1))
    )
  }

  function applyPlateDelta(delta: number) {
    const currentDisplay =
      currentPlateKg != null
        ? unit === "lbs"
          ? currentPlateKg * KG_TO_LBS
          : currentPlateKg
        : 0
    setPlateFromDisplayNumber(currentDisplay + delta)
  }

  function selectPlatePerSide(displayPlate: number) {
    const activeBar = ensureBarForPlates()
    const plateKg = displayWeightToKg(displayPlate, unit)
    setPlateInput(String(displayPlate))
    commitWeightKg(activeBar.kg + plateKg * 2, activeBar.kg, activeBar.type)
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[8px] md:block md:p-6",
        isClosing
          ? "weight-selector-overlay-exit"
          : "weight-selector-overlay-enter"
      )}
      onClick={dismiss}
    >
      <div
        className={cn(
          "max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.24)] md:absolute md:top-1/2 md:left-1/2 md:max-w-3xl md:rounded-[28px] md:shadow-2xl",
          isClosing
            ? "weight-selector-panel-exit"
            : "weight-selector-panel-enter"
        )}
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[18px] bg-muted/55 text-foreground/70">
              <Barbell size={17} weight="bold" />
            </span>
            <div>
              <p className="text-[15px] font-black tracking-tight">Weight</p>
              <p className="text-[11px] text-muted-foreground/55">
                {lastWeightLabel
                  ? `Last set ${lastWeightLabel}`
                  : hasBar
                    ? `${activeBarLabel} + plates`
                    : `Total load in ${unit}`}
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground/60 transition-colors active:bg-muted active:text-foreground"
          >
            <X size={13} weight="bold" />
          </button>
        </div>

        <div className="px-5 pb-4 md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:gap-3 md:px-6 md:pb-6">
          <div className="rounded-[26px] border border-border/45 bg-background p-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className="text-[9px] font-black tracking-[0.18em] text-muted-foreground/45 uppercase">
                  Bar setup
                </p>
                <p className="mt-1 truncate text-[12px] font-semibold text-foreground/75">
                  {hasBar
                    ? `${activeBarLabel} · ${barDisplayValue} ${unit}`
                    : "No bar added"}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleBar}
                className={cn(
                  "h-10 shrink-0 rounded-[18px] px-3 text-[12px] font-black transition-all active:scale-[0.985]",
                  hasBar
                    ? "bg-foreground text-background"
                    : "bg-muted/55 text-muted-foreground/75 active:bg-muted active:text-foreground"
                )}
              >
                {hasBar ? "On" : "Use bar"}
              </button>
            </div>

            <div className="relative mt-3 overflow-hidden rounded-[24px] border border-border/35 bg-muted/25 px-3 py-4">
              <div className="absolute inset-x-5 top-1/2 h-px bg-border/45" />
              <img
                src={activeBarImage}
                alt=""
                className={cn(
                  "relative mx-auto w-full object-contain transition-all duration-200",
                  selectedBarType === "trap" ? "h-24" : "h-14",
                  !hasBar && "opacity-35 grayscale"
                )}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {BAR_PROFILES.map((profile) => {
                const selected = hasBar && selectedBarType === profile.type
                const presetWeight =
                  unit === "lbs" ? `${profile.lbs} lbs` : `${profile.kg} kg`
                return (
                  <button
                    key={profile.type}
                    type="button"
                    onClick={() => selectBarType(profile.type)}
                    className={cn(
                      "min-w-0 overflow-hidden rounded-[20px] border p-2 text-left transition-all active:scale-[0.985]",
                      selected
                        ? "border-foreground/20 bg-foreground text-background shadow-sm"
                        : "border-border/40 bg-card/65 active:border-primary/20 active:bg-card"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 items-center rounded-[14px] px-1.5",
                        selected ? "bg-background/10" : "bg-muted/30"
                      )}
                    >
                      <img
                        src={profile.image}
                        alt=""
                        className={cn(
                          "h-full w-full object-contain",
                          profile.type === "trap" && "scale-125"
                        )}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11px] font-black">
                        {profile.shortLabel}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-black tabular-nums",
                          selected
                            ? "text-background/70"
                            : "text-muted-foreground/55"
                        )}
                      >
                        {presetWeight}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {hasBar && (
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <label className="relative min-w-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={barInput}
                    onChange={(event) =>
                      setCustomBarDisplay(event.target.value)
                    }
                    className="h-12 w-full [appearance:textfield] rounded-[20px] border border-border/50 bg-card px-3 pr-12 text-center text-[18px] font-black tabular-nums transition-all outline-none focus:border-primary/30 focus:ring-2 focus:ring-primary/10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    aria-label={`Bar weight in ${unit}`}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[9px] font-black tracking-[0.14em] text-muted-foreground/45 uppercase">
                    {unit}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setCustomBarDisplay(barInput || "0")}
                  className={cn(
                    "h-12 rounded-[20px] px-3 text-[11px] font-black tracking-[0.12em] uppercase transition-all active:scale-[0.985]",
                    selectedBarType === "custom"
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground/70 active:bg-muted active:text-foreground"
                  )}
                >
                  Custom
                </button>
              </div>
            )}
          </div>

          {hasBar && (
            <div className="mt-3 rounded-[24px] border border-border/50 bg-background px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black tracking-[0.18em] text-muted-foreground/45 uppercase">
                    Plates per side
                  </p>
                  <p className="mt-1 text-[12px] font-semibold text-foreground/75">
                    Total {weightInput || "0"} {unit}
                  </p>
                </div>
                <span className="rounded-full bg-muted/45 px-2.5 py-1 text-[10px] font-black tracking-[0.1em] text-muted-foreground/65 uppercase">
                  {activeBarLabel}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyPlateDelta(-(unit === "kg" ? 1.25 : 2.5))}
                  className="flex h-11 items-center justify-center rounded-[18px] bg-muted/55 text-muted-foreground/70 transition-all active:scale-[0.985] active:bg-muted"
                  aria-label="Decrease plates per side"
                >
                  <Minus size={15} weight="bold" />
                </button>
                <label className="relative min-w-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={plateInput}
                    onChange={(event) =>
                      setPlatePerSideDisplay(event.target.value)
                    }
                    placeholder="0"
                    className="h-12 w-full [appearance:textfield] rounded-[20px] border border-border/55 bg-card px-4 pr-14 text-center text-[22px] leading-none font-black tracking-tight tabular-nums transition-all outline-none placeholder:text-muted-foreground/25 focus:border-primary/30 focus:ring-2 focus:ring-primary/10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    aria-label={`Plates per side in ${unit}`}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[10px] font-black tracking-[0.16em] text-muted-foreground/45 uppercase">
                    {unit}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => applyPlateDelta(unit === "kg" ? 1.25 : 2.5)}
                  className="flex h-11 items-center justify-center rounded-[18px] bg-muted/55 text-muted-foreground/70 transition-all active:scale-[0.985] active:bg-muted"
                  aria-label="Increase plates per side"
                >
                  <Plus size={15} weight="bold" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {plateDeltas.map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => applyPlateDelta(delta)}
                    className="h-9 rounded-[15px] bg-muted/40 text-[11px] font-black text-muted-foreground/75 tabular-nums transition-all active:scale-[0.985] active:bg-muted active:text-foreground"
                  >
                    +{delta}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {platePresets.map((plate) => (
                  <button
                    key={plate}
                    type="button"
                    onClick={() => selectPlatePerSide(plate)}
                    className="h-9 rounded-[15px] bg-card/80 text-[11px] font-black text-muted-foreground/75 tabular-nums transition-all active:scale-[0.985] active:bg-card active:text-foreground"
                  >
                    {plate}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-[24px] border border-border/50 bg-background px-4 py-4 md:mt-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black tracking-[0.18em] text-muted-foreground/45 uppercase">
                  Total weight
                </p>
                <p className="mt-1 text-[12px] font-semibold text-foreground/75">
                  {hasBar
                    ? `${barDisplayValue} ${unit} bar + ${plateDisplayValue || "0"} ${unit}/side`
                    : `Direct entry in ${unit}`}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[3.25rem_minmax(0,1fr)_3.25rem] items-center gap-2">
              <button
                type="button"
                onClick={() => applyDelta(-(unit === "kg" ? 2.5 : 5))}
                className="flex h-12 items-center justify-center rounded-[20px] bg-muted/55 text-muted-foreground/70 transition-all active:scale-[0.985] active:bg-muted"
                aria-label="Decrease weight"
              >
                <Minus size={16} weight="bold" />
              </button>
              <label className="relative min-w-0">
                <input
                  type="number"
                  inputMode="decimal"
                  value={weightInput}
                  onChange={(event) => setWeightDisplay(event.target.value)}
                  placeholder="0"
                  className="h-[58px] w-full [appearance:textfield] rounded-[22px] border border-border/55 bg-card px-4 pr-14 text-center text-[28px] leading-none font-black tracking-tight tabular-nums transition-all outline-none placeholder:text-muted-foreground/25 focus:border-primary/30 focus:ring-2 focus:ring-primary/10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  aria-label={`Total weight in ${unit}`}
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[10px] font-black tracking-[0.16em] text-muted-foreground/45 uppercase">
                  {unit}
                </span>
              </label>
              <button
                type="button"
                onClick={() => applyDelta(unit === "kg" ? 2.5 : 5)}
                className="flex h-12 items-center justify-center rounded-[20px] bg-muted/55 text-muted-foreground/70 transition-all active:scale-[0.985] active:bg-muted"
                aria-label="Increase weight"
              >
                <Plus size={16} weight="bold" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {quickDeltas.map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => applyDelta(delta)}
                  className="h-10 rounded-[16px] bg-muted/40 text-[12px] font-black text-muted-foreground/75 tabular-nums transition-all active:scale-[0.985] active:bg-muted active:text-foreground"
                >
                  +{delta}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="mt-3 h-12 w-full rounded-[20px] bg-foreground text-[14px] font-black tracking-tight text-background transition-opacity active:opacity-85 md:col-span-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function WeightSelectorButton({
  value,
  placeholder,
  unit,
  barWeight,
  disabled,
  compact,
  onClick,
}: {
  value: string
  placeholder: string
  unit: WeightUnit
  barWeight: string
  disabled?: boolean
  compact?: boolean
  onClick: () => void
}) {
  const totalKg = parseKg(value)
  const barKg = parseKg(barWeight)
  const hasBar = !!barKg && barKg > 0
  const platePerSide =
    hasBar && totalKg != null ? Math.max(0, (totalKg - barKg) / 2) : null
  const display = toDisplay(value, unit)
  const plateLabel =
    platePerSide != null
      ? `${formatWeightValue(platePerSide, unit)}/side`
      : null

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Select weight in ${unit}`}
      className={cn(
        "group flex w-full min-w-0 items-center justify-center border text-center font-semibold tabular-nums transition-all outline-none disabled:pointer-events-none",
        compact
          ? "h-10 rounded-[18px] px-2.5 text-[14px]"
          : "h-12 rounded-[20px] px-3 text-[17px]",
        disabled
          ? "border-border/30 bg-muted/30 text-foreground/50"
          : "border-border/45 bg-muted/20 active:scale-[0.985] active:border-primary/25 active:bg-card/80"
      )}
    >
      <span className="min-w-0 truncate">{display || placeholder}</span>
      {display && (
        <span className="ml-1.5 shrink-0 text-[9px] font-black tracking-[0.12em] text-muted-foreground/45 uppercase">
          {unit}
        </span>
      )}
      {plateLabel && !compact && (
        <span className="ml-2 min-w-0 truncate rounded-full bg-muted/55 px-2 py-0.5 text-[9px] font-black tracking-[0.08em] text-muted-foreground/65 uppercase">
          {plateLabel}
        </span>
      )}
    </button>
  )
}

/**
 * Render a single active set row allowing the user to edit weight/reps/RPE, toggle completion, pick rest, cycle set type, and delete the set.
 *
 * The row visualizes completion state, optionally highlights the "next" set, and opens a rest-duration sheet when the timer button is tapped.
 *
 * @param set - The WorkoutSet data for this row (weights, reps, rpe, restSeconds, completed, etc.).
 * @param index - Zero-based index of the set within its exercise.
 * @param trackRpe - Whether the UI should show and allow editing of the RPE field.
 * @param trackUnilateral - Whether reps are tracked per limb (shows left/right inputs) instead of a single reps field.
 * @param unit - Display unit for weight (kg or lbs); inputs/outputs are converted via unit helpers.
 * @param onUpdate - Called with an updated WorkoutSet when any editable field changes.
 * @param onDelete - Called when the delete action is triggered for this set.
 * @param canDelete - When true, shows the delete control (disabled/hidden when the set is completed).
 * @param onComplete - Invoked with the set's restSeconds when the set is newly marked completed (used to start the rest countdown).
 * @param isNext - When true and the set is not completed, the row receives visual emphasis indicating it's the next target.
 *
 * @returns A JSX element representing the interactive set row.
 */

function ActiveSetRow({
  set,
  index,
  trackRpe,
  trackUnilateral,
  unit,
  onUpdate,
  onDelete,
  canDelete,
  onComplete,
  isNext,
  lastSet,
  barWeight,
  barType,
  onWeightConfigChange,
}: {
  set: WorkoutSet
  index: number
  trackRpe: boolean
  trackUnilateral: boolean
  unit: WeightUnit
  onUpdate: (s: WorkoutSet) => void
  onDelete: () => void
  canDelete: boolean
  onComplete: (restSeconds: number) => void
  isNext?: boolean
  lastSet?: { weight: number; reps: number } | null
  barWeight: string
  barType: BarType
  onWeightConfigChange: (change: WeightSelectorChange) => void
}) {
  const [showRest, setShowRest] = useState(false)
  const [showWeight, setShowWeight] = useState(false)
  const [completionPulse, setCompletionPulse] = useState(false)
  const cfg = SET_CFG[set.type]

  useEffect(() => {
    if (!completionPulse) return
    const id = window.setTimeout(() => setCompletionPulse(false), 520)
    return () => window.clearTimeout(id)
  }, [completionPulse])

  function cycleType() {
    const i = SET_ORDER.indexOf(set.type)
    onUpdate({ ...set, type: SET_ORDER[(i + 1) % SET_ORDER.length] })
  }

  function toggleDone() {
    const next = !set.completed
    onUpdate({ ...set, completed: next })
    if (next) setCompletionPulse(true)
    if (next && set.restSeconds > 0) onComplete(set.restSeconds)
  }

  const fieldCls = cn(
    "h-11 w-full rounded-md border px-3 text-center text-[16px] font-semibold tabular-nums transition-all outline-none",
    "placeholder:text-muted-foreground/30",
    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    set.completed
      ? "cursor-default border-border/30 bg-muted/30 text-foreground/55"
      : "border-border/45 bg-muted/20 focus:border-primary/30 focus:bg-card/80 focus:ring-2 focus:ring-primary/10",
    "disabled:pointer-events-none"
  )
  const compactFieldCls = cn(
    "h-9 w-full rounded-md border px-2.5 text-center text-[14px] font-semibold tabular-nums transition-all outline-none",
    "placeholder:text-muted-foreground/25",
    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    set.completed
      ? "cursor-default border-border/30 bg-muted/30 text-foreground/50"
      : "border-border/40 bg-muted/20 focus:border-primary/30 focus:bg-card/80 focus:ring-2 focus:ring-primary/10",
    "disabled:pointer-events-none"
  )
  const repsModeKey = trackUnilateral ? "unilateral" : "bilateral"
  const trackingModeKey = `${repsModeKey}-${trackRpe ? "rpe" : "base"}`
  const fullWidthComplete = trackUnilateral || trackRpe
  const showSecondarySetControls = trackUnilateral || trackRpe
  const desktopGridClass = setGridClass(trackUnilateral, trackRpe)
  const weightPlaceholder = lastSet?.weight
    ? toDisplay(String(lastSet.weight), unit)
    : "–"

  return (
    <>
      <div
        className={cn(
          "relative hidden items-center gap-2 px-3 py-2 transition-colors md:grid",
          desktopGridClass,
          set.completed && "bg-muted/15",
          isNext && !set.completed && "bg-primary/[0.028]"
        )}
      >
        {isNext && !set.completed && (
          <div className="absolute inset-y-2 left-0 w-px rounded-r-full bg-primary/35" />
        )}
        <span className="text-center text-[12px] font-semibold text-muted-foreground/70 tabular-nums">
          {index + 1}
        </span>
        <button
          onClick={cycleType}
          disabled={set.completed}
          aria-label={`Set mode: ${cfg.label}. Tap to change.`}
          title={`Set mode: ${cfg.label}`}
          className="flex h-9 items-center justify-center rounded-md px-2 text-[11px] font-bold transition-colors active:bg-muted disabled:pointer-events-none"
          style={{
            backgroundColor: set.completed
              ? "color-mix(in srgb, var(--muted) 70%, transparent)"
              : cfg.bg,
            color: cfg.color,
          }}
        >
          {set.completed ? <Check size={14} weight="bold" /> : cfg.label}
        </button>
        <WeightSelectorButton
          value={set.weight}
          placeholder={weightPlaceholder}
          unit={unit}
          barWeight={barWeight}
          compact
          disabled={set.completed}
          onClick={() => setShowWeight(true)}
        />
        {trackUnilateral ? (
          <>
            <input
              type="number"
              inputMode="numeric"
              value={set.leftReps}
              onChange={(event) =>
                onUpdate({ ...set, leftReps: event.target.value })
              }
              placeholder="–"
              disabled={set.completed}
              aria-label="Left reps"
              className={compactFieldCls}
            />
            <input
              type="number"
              inputMode="numeric"
              value={set.rightReps}
              onChange={(event) =>
                onUpdate({ ...set, rightReps: event.target.value })
              }
              placeholder="–"
              disabled={set.completed}
              aria-label="Right reps"
              className={compactFieldCls}
            />
          </>
        ) : (
          <input
            type="number"
            inputMode="numeric"
            value={set.reps}
            onChange={(event) => onUpdate({ ...set, reps: event.target.value })}
            placeholder={lastSet?.reps ? String(lastSet.reps) : "–"}
            disabled={set.completed}
            aria-label="Reps"
            className={compactFieldCls}
          />
        )}
        {trackRpe && (
          <input
            type="number"
            inputMode="decimal"
            value={set.rpe}
            onChange={(event) => onUpdate({ ...set, rpe: event.target.value })}
            placeholder="–"
            min="1"
            max="10"
            step="0.5"
            disabled={set.completed}
            aria-label="RPE"
            className={compactFieldCls}
          />
        )}
        {showSecondarySetControls && (
          <button
            onClick={() => setShowRest(true)}
            aria-label="Set rest timer"
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-border/35 bg-transparent px-2 text-[12px] font-semibold text-muted-foreground/70 transition-colors active:bg-muted/35"
          >
            <Timer size={13} />
            <span className="tabular-nums">{formatRest(set.restSeconds)}</span>
          </button>
        )}
        <button
          onClick={toggleDone}
          aria-label={
            set.completed ? "Mark set incomplete" : "Mark set complete"
          }
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md border transition-colors active:bg-muted/45",
            set.completed
              ? "border-border/45 bg-muted/55 text-foreground/70"
              : "border-border/35 bg-transparent text-muted-foreground/60"
          )}
        >
          <Check size={14} weight="bold" />
        </button>
        {showSecondarySetControls &&
          (canDelete && !set.completed ? (
            <button
              onClick={onDelete}
              aria-label="Delete set"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground/40 transition-colors active:bg-muted/35 active:text-foreground"
            >
              <X size={14} weight="bold" />
            </button>
          ) : (
            <div />
          ))}
      </div>
      <div
        className={cn(
          "relative px-3 py-3 transition-[background-color,transform,box-shadow] duration-300 md:hidden",
          set.completed && "bg-muted/[0.12]",
          isNext && !set.completed && "bg-muted/[0.10]",
          completionPulse && "bg-muted/20",
          !set.completed && !isNext && "bg-background"
        )}
        style={
          completionPulse
            ? {
                boxShadow:
                  "inset 0 0 0 1px color-mix(in srgb, var(--border) 70%, transparent)",
              }
            : isNext && !set.completed
              ? {
                  boxShadow:
                    "inset 0 0 0 1px color-mix(in srgb, var(--border) 70%, transparent)",
                }
              : undefined
        }
      >
        {isNext && !set.completed && (
          <div className="absolute inset-y-3 left-0 w-px rounded-r-full bg-foreground/25" />
        )}
        <div className="mb-2 flex items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold tabular-nums select-none",
              set.completed
                ? "bg-muted/45 text-foreground/60"
                : isNext
                  ? "bg-muted/55 text-foreground/75"
                  : "bg-muted/35 text-muted-foreground/65"
            )}
          >
            {index + 1}
          </span>
          <button
            onClick={cycleType}
            disabled={set.completed}
            aria-label={`Set mode: ${cfg.label}. Tap to change.`}
            title={`Set mode: ${cfg.label}`}
            className={cn(
              "flex h-8 min-w-[5.5rem] shrink-0 items-center justify-center rounded-md border border-border/35 px-2.5 transition-colors select-none active:bg-muted/35 disabled:pointer-events-none"
            )}
          >
            {set.completed ? (
              <Check size={15} weight="bold" className="text-foreground/65" />
            ) : (
              <span className="truncate text-[11px] font-bold text-muted-foreground/75">
                {cfg.label}
              </span>
            )}
          </button>
          {isNext && !set.completed && (
            <span className="rounded-md bg-muted/45 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground/70">
              Next
            </span>
          )}
          {showSecondarySetControls && (
            <button
              onClick={() => setShowRest(true)}
              aria-label="Set rest timer"
              className="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/35 bg-transparent px-2.5 transition-colors active:bg-muted/35"
            >
              <Timer size={13} className="text-muted-foreground/55" />
              <span className="text-[11px] font-semibold text-foreground/65 tabular-nums">
                {formatRest(set.restSeconds)}
              </span>
            </button>
          )}
          {showSecondarySetControls && canDelete && !set.completed && (
            <button
              onClick={onDelete}
              aria-label="Delete set"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors active:bg-muted/35 active:text-foreground"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
        <div
          key={trackingModeKey}
          className={cn(
            "grid animate-in gap-2 duration-200 fade-in-0 zoom-in-95 slide-in-from-bottom-1",
            fullWidthComplete
              ? "grid-cols-2"
              : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3rem]"
          )}
        >
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="px-0.5 text-[10px] leading-none font-semibold text-muted-foreground/50">
              Weight
            </span>
            <WeightSelectorButton
              value={set.weight}
              placeholder={weightPlaceholder}
              unit={unit}
              barWeight={barWeight}
              disabled={set.completed}
              onClick={() => setShowWeight(true)}
            />
          </label>
          {trackUnilateral ? (
            <>
              <SetNumberField
                label="Left reps"
                value={set.leftReps}
                onChange={(value) => onUpdate({ ...set, leftReps: value })}
                placeholder="–"
                disabled={set.completed}
                className={fieldCls}
              />
              <SetNumberField
                label="Right reps"
                value={set.rightReps}
                onChange={(value) => onUpdate({ ...set, rightReps: value })}
                placeholder="–"
                disabled={set.completed}
                className={fieldCls}
              />
            </>
          ) : (
            <SetNumberField
              label="Reps"
              value={set.reps}
              onChange={(value) => onUpdate({ ...set, reps: value })}
              placeholder={lastSet?.reps ? String(lastSet.reps) : "–"}
              disabled={set.completed}
              className={fieldCls}
            />
          )}
          {trackRpe && (
            <SetNumberField
              label="RPE"
              inputMode="decimal"
              value={set.rpe}
              onChange={(value) => onUpdate({ ...set, rpe: value })}
              placeholder="–"
              min="1"
              max="10"
              step="0.5"
              disabled={set.completed}
              className={fieldCls}
            />
          )}
          <button
            onClick={toggleDone}
            aria-label={
              set.completed ? "Mark set incomplete" : "Mark set complete"
            }
            className={cn(
              "flex h-11 items-center justify-center rounded-md border text-[13px] font-bold transition-colors active:bg-muted/35",
              fullWidthComplete ? "col-span-2 gap-2" : "w-full",
              set.completed
                ? "border-border/45 bg-muted/55 text-foreground/70"
                : "border-border/35 bg-transparent text-muted-foreground/55",
              completionPulse && "motion-set-complete"
            )}
          >
            <Check size={14} weight="bold" />
            {fullWidthComplete && (
              <span>{set.completed ? "Undo" : "Done"}</span>
            )}
          </button>
        </div>
      </div>
      {showRest && (
        <RestTimerSheet
          current={set.restSeconds}
          onSelect={(s) => {
            onUpdate({ ...set, restSeconds: s })
            setShowRest(false)
          }}
          onClose={() => setShowRest(false)}
        />
      )}
      {showWeight && (
        <WeightSelectorSheet
          currentWeight={set.weight}
          barWeight={barWeight}
          barType={barType}
          unit={unit}
          lastSet={lastSet}
          onChange={onWeightConfigChange}
          onClose={() => setShowWeight(false)}
        />
      )}
    </>
  )
}

function CardioDetailsPanel({
  cardio,
  onUpdate,
  isNext,
}: {
  cardio: CardioExerciseState
  onUpdate: (cardio: CardioExerciseState) => void
  isNext?: boolean
}) {
  const details = cardioDetailsFromState(cardio)
  const distance = parsePositiveFloat(cardio.distance)
  const durationSeconds = durationFromCardioState(cardio)
  const calculatedPace = calcPaceSecondsPerKm(
    distance
      ? cardioDistanceToMeters(distance, cardio.distanceUnit)
      : undefined,
    durationSeconds ?? undefined
  )
  const paceLabel =
    formatCardioPace(
      calculatedPace ?? details?.paceSecondsPerKm,
      cardio.distanceUnit
    ) ?? "–"
  const durationLabel = formatCardioDuration(durationSeconds) ?? "–"
  const sourceLabel =
    CARDIO_SOURCE_OPTIONS.find(
      (option) => option.provider === cardio.sourceProvider
    )?.label ?? "Manual"
  const appleHealthSupported = isAppleHealthSupportedPlatform()
  const [appleHealthLoading, setAppleHealthLoading] = useState(false)
  const [appleHealthError, setAppleHealthError] = useState<string | null>(null)
  const [appleHealthWorkouts, setAppleHealthWorkouts] = useState<
    AppleHealthWorkout[]
  >([])
  const [showAppleHealthWorkouts, setShowAppleHealthWorkouts] = useState(false)
  const appleHealthLoadingRef = useRef(false)

  function update(patch: Partial<CardioExerciseState>) {
    onUpdate({ ...cardio, ...patch })
  }

  function updateZone(key: HeartRateZoneKey, value: string) {
    onUpdate({
      ...cardio,
      zones: {
        ...cardio.zones,
        [key]: value,
      },
    })
  }

  function setDistanceUnit(unit: CardioDistanceUnit) {
    if (unit === cardio.distanceUnit) return
    const currentDistance = parsePositiveFloat(cardio.distance)
    if (!currentDistance) {
      update({ distanceUnit: unit })
      return
    }
    const meters = cardioDistanceToMeters(currentDistance, cardio.distanceUnit)
    update({
      distanceUnit: unit,
      distance: formatCardioNumber(cardioMetersToDistance(meters, unit)),
    })
  }

  async function loadAppleHealthWorkouts() {
    if (appleHealthLoadingRef.current || appleHealthLoading) return
    appleHealthLoadingRef.current = true
    setAppleHealthLoading(true)
    setAppleHealthError(null)
    try {
      const authorization = await requestAppleHealthAuthorization()
      if (!authorization.available) {
        setAppleHealthError("Apple Health is not available on this device.")
        setAppleHealthWorkouts([])
        setShowAppleHealthWorkouts(true)
        return
      }
      if (!authorization.granted) {
        setAppleHealthError("Apple Health permission was not granted.")
        setAppleHealthWorkouts([])
        setShowAppleHealthWorkouts(true)
        return
      }

      const workouts = await getRecentAppleHealthWorkouts({
        daysBack: 30,
        limit: 12,
      })
      setAppleHealthWorkouts(workouts)
      setShowAppleHealthWorkouts(true)
      if (workouts.length === 0) {
        setAppleHealthError("No recent cardio workouts found in Apple Health.")
      }
    } catch (error) {
      setAppleHealthWorkouts([])
      setShowAppleHealthWorkouts(true)
      setAppleHealthError(
        error instanceof Error
          ? error.message
          : "Could not read Apple Health workouts."
      )
    } finally {
      appleHealthLoadingRef.current = false
      setAppleHealthLoading(false)
    }
  }

  function importAppleHealthWorkout(workout: AppleHealthWorkout) {
    onUpdate({
      ...cardio,
      ...appleHealthWorkoutToCardioPatch(workout, cardio.distanceUnit),
      zones: cardio.zones,
      notes: cardio.notes,
    })
    setShowAppleHealthWorkouts(false)
    toast.success("Imported Apple Health workout")
  }

  const fieldCls =
    "h-12 w-full [appearance:textfield] rounded-[20px] border border-border/45 bg-muted/20 px-3 text-center text-[16px] font-semibold tabular-nums outline-none transition-all placeholder:text-muted-foreground/25 focus:border-primary/30 focus:bg-card/80 focus:ring-2 focus:ring-primary/10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
  const labelCls =
    "px-1 text-[10px] leading-none font-bold tracking-[0.14em] text-muted-foreground/55 uppercase"

  return (
    <div
      className={cn(
        "border-t border-border/45 px-3 py-3 sm:px-4",
        isNext && "bg-primary/[0.028]"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black tracking-[0.18em] text-muted-foreground/45 uppercase">
            Cardio
          </p>
          <p className="mt-1 truncate text-[12px] font-semibold text-foreground/70">
            {compactCardioSummary(details, cardio.distanceUnit)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {appleHealthSupported && (
            <button
              type="button"
              onClick={loadAppleHealthWorkouts}
              disabled={appleHealthLoading}
              aria-busy={appleHealthLoading}
              className="flex h-8 items-center gap-1.5 rounded-full bg-foreground px-2.5 text-[10px] font-black text-background transition-opacity active:opacity-80 disabled:opacity-55"
            >
              <AppleLogo size={13} weight="fill" />
              {appleHealthLoading ? "Syncing" : "Health"}
            </button>
          )}
          <span className="rounded-full bg-muted/50 px-2.5 py-1 text-[10px] font-black text-muted-foreground/60 tabular-nums">
            {paceLabel}
          </span>
        </div>
      </div>

      {appleHealthSupported && showAppleHealthWorkouts && (
        <div className="mb-3 rounded-[22px] border border-border/45 bg-background p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="text-[10px] font-black tracking-[0.16em] text-muted-foreground/45 uppercase">
                Apple Health
              </p>
              <p className="truncate text-[11px] font-semibold text-muted-foreground/60">
                Recent cardio workouts
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                appleHealthLoading ? undefined : setShowAppleHealthWorkouts(false)
              }
              disabled={appleHealthLoading}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/45 text-muted-foreground/60 active:bg-muted disabled:opacity-40"
              aria-label="Close Apple Health workouts"
            >
              <X size={12} weight="bold" />
            </button>
          </div>
          {appleHealthError && (
            <p className="rounded-[16px] bg-muted/35 px-3 py-2 text-[12px] font-semibold text-muted-foreground/75">
              {appleHealthError}
            </p>
          )}
          {appleHealthWorkouts.length > 0 && (
            <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
              {appleHealthWorkouts.map((workout) => (
                <button
                  key={workout.uuid}
                  type="button"
                  onClick={() => importAppleHealthWorkout(workout)}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[17px] bg-muted/25 px-3 py-2 text-left transition-colors active:bg-muted/55"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-black text-foreground/85">
                      {workout.activityName}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold text-muted-foreground/60">
                      {[
                        formatCardioDistance(
                          workout.totalDistanceMeters,
                          cardio.distanceUnit
                        ),
                        formatCardioDuration(workout.durationSeconds),
                        workout.avgHeartRateBpm
                          ? `${Math.round(workout.avgHeartRateBpm)} bpm`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] font-black text-muted-foreground/50">
                    {formatAppleHealthWorkoutDate(workout.startedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Distance</span>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              value={cardio.distance}
              onChange={(event) => update({ distance: event.target.value })}
              placeholder="0"
              className={fieldCls}
            />
            <div className="flex h-12 overflow-hidden rounded-[20px] border border-border/45 bg-muted/25 text-[11px] font-black uppercase">
              {(["km", "mi"] as CardioDistanceUnit[]).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => setDistanceUnit(unit)}
                  className={cn(
                    "min-w-10 px-2 transition-colors",
                    cardio.distanceUnit === unit
                      ? "bg-foreground text-background"
                      : "text-muted-foreground/65 active:bg-muted/60"
                  )}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>
        </label>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Duration</span>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              ["durationHours", "h"],
              ["durationMinutes", "m"],
              ["durationSeconds", "s"],
            ].map(([key, label]) => (
              <label key={key} className="relative min-w-0">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={cardio[key as keyof CardioExerciseState] as string}
                  onChange={(event) =>
                    update({
                      [key]: event.target.value,
                    } as Partial<CardioExerciseState>)
                  }
                  placeholder="0"
                  className={cn(fieldCls, "pr-7")}
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[9px] font-black text-muted-foreground/40 uppercase">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1">
          <span className={labelCls}>Pace</span>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
            <label className="relative min-w-0">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={cardio.paceMinutes}
                onChange={(event) =>
                  update({ paceMinutes: event.target.value })
                }
                placeholder="0"
                className={cn(fieldCls, "pr-9")}
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[9px] font-black text-muted-foreground/40 uppercase">
                min
              </span>
            </label>
            <label className="relative min-w-0">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={cardio.paceSeconds}
                onChange={(event) =>
                  update({ paceSeconds: event.target.value })
                }
                placeholder="0"
                className={cn(fieldCls, "pr-9")}
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[9px] font-black text-muted-foreground/40 uppercase">
                sec
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Avg HR</span>
          <input
            type="number"
            inputMode="numeric"
            value={cardio.avgHeartRate}
            onChange={(event) => update({ avgHeartRate: event.target.value })}
            placeholder="bpm"
            className={fieldCls}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Max HR</span>
          <input
            type="number"
            inputMode="numeric"
            value={cardio.maxHeartRate}
            onChange={(event) => update({ maxHeartRate: event.target.value })}
            placeholder="bpm"
            className={fieldCls}
          />
        </label>
      </div>

      <div className="mt-3">
        <p className={labelCls}>Heart-rate zones</p>
        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
          {HEART_RATE_ZONES.map(({ key, label }) => (
            <label key={key} className="min-w-0">
              <span className="mb-1 block text-center text-[9px] font-black text-muted-foreground/45">
                {label}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={cardio.zones[key]}
                onChange={(event) => updateZone(key, event.target.value)}
                placeholder="m"
                className="h-10 w-full [appearance:textfield] rounded-[16px] border border-border/40 bg-muted/20 px-1.5 text-center text-[13px] font-semibold tabular-nums outline-none placeholder:text-muted-foreground/25 focus:border-primary/30 focus:bg-card/80 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Source</span>
          <select
            value={cardio.sourceProvider}
            onChange={(event) =>
              update({
                sourceProvider: event.target.value as CardioSourceProvider,
              })
            }
            className="h-12 rounded-[20px] border border-border/45 bg-muted/20 px-3 text-[13px] font-semibold outline-none focus:border-primary/30 focus:bg-card/80"
          >
            {CARDIO_SOURCE_OPTIONS.map((option) => (
              <option key={option.provider} value={option.provider}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Source name</span>
          <input
            value={cardio.sourceName}
            onChange={(event) => update({ sourceName: event.target.value })}
            placeholder="Morning run"
            className="h-12 rounded-[20px] border border-border/45 bg-muted/20 px-3 text-[13px] font-semibold outline-none placeholder:text-muted-foreground/30 focus:border-primary/30 focus:bg-card/80"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Activity ID</span>
          <input
            value={cardio.sourceExternalId}
            onChange={(event) =>
              update({ sourceExternalId: event.target.value })
            }
            placeholder="Import ID"
            className="h-12 rounded-[20px] border border-border/45 bg-muted/20 px-3 text-[13px] font-semibold outline-none placeholder:text-muted-foreground/30 focus:border-primary/30 focus:bg-card/80"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Route</span>
          <input
            value={cardio.routeName}
            onChange={(event) => update({ routeName: event.target.value })}
            placeholder="Route name"
            className="h-12 rounded-[20px] border border-border/45 bg-muted/20 px-3 text-[13px] font-semibold outline-none placeholder:text-muted-foreground/30 focus:border-primary/30 focus:bg-card/80"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Route URL</span>
          <input
            type="url"
            value={cardio.routeUrl}
            onChange={(event) => update({ routeUrl: event.target.value })}
            placeholder="https://"
            className="h-12 rounded-[20px] border border-border/45 bg-muted/20 px-3 text-[13px] font-semibold outline-none placeholder:text-muted-foreground/30 focus:border-primary/30 focus:bg-card/80"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-muted-foreground/45">
        <span>{durationLabel}</span>
        <span>{sourceLabel}</span>
      </div>
    </div>
  )
}

/**
 * Render an exercise card containing its sets, controls, and compact history for the active workout UI.
 *
 * Displays exercise metadata, set rows (with editing, completion, and rest controls), tracking toggles (RPE / unilateral),
 * drag handle, collapse toggle, remove button, and an optional last-session summary. Highlights the next incomplete set
 * when `nextSetIndex` is provided.
 *
 * @param exercise - Exercise metadata (name, color, muscle, etc.).
 * @param data - Per-exercise state including the list of sets and tracking flags.
 * @param unit - Weight display unit (`"kg"` or `"lbs"`).
 * @param onUpdate - Called with an updated `ExerciseState` when sets or tracking options change.
 * @param onRemove - Called to remove this exercise from the workout.
 * @param isDragging - Whether this card is currently being dragged (applies visual transform).
 * @param showLineBefore - Render a decorative line above the card when true.
 * @param showLineAfter - Render a decorative line below the card when true.
 * @param inSuperset - True when the card is rendered inside a superset container.
 * @param collapsed - Whether the card's set list is collapsed.
 * @param onToggleCollapse - Toggle collapsed state for this card.
 * @param dragHandlers - Pointer/drag event handlers to attach to the drag handle when reordering is allowed.
 * @param cardRef - Ref callback for the card DOM element (used for hit-testing during drag).
 * @param onStartRest - Called with rest seconds when a set is completed and a rest timer should start.
 * @param lastSession - Optional recent session summary (date and sets) to render a compact history row.
 * @param onShowHistory - Open the full history sheet for this exercise.
 * @param nextSetIndex - Optional index of the next incomplete set to visually emphasize; pass `null` to disable.
 *
 * @returns The rendered React element for the exercise card.
 */
function ActiveExerciseCard({
  exercise,
  data,
  unit,
  onUpdate,
  onRemove,
  isDragging,
  showLineBefore,
  showLineAfter,
  inSuperset,
  collapsed,
  onToggleCollapse,
  dragHandlers,
  cardRef,
  onStartRest,
  lastSession,
  onShowHistory,
  onAiChange,
  nextSetIndex,
  isNextCardio,
}: {
  exercise: Exercise
  data: ExerciseState
  unit: WeightUnit
  onUpdate: (d: ExerciseState) => void
  onRemove: () => void
  isDragging: boolean
  showLineBefore: boolean
  showLineAfter: boolean
  inSuperset?: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  dragHandlers?: React.HTMLAttributes<HTMLDivElement>
  cardRef: (el: HTMLDivElement | null) => void
  onStartRest: (seconds: number) => void
  lastSession?: {
    date: string
    sets: Array<{
      weight: number
      reps: number
      completed: boolean
      type: string
    }>
  } | null
  onShowHistory: () => void
  onAiChange?: () => void
  nextSetIndex?: number | null
  isNextCardio?: boolean
}) {
  function addSet() {
    onUpdate({ ...data, sets: [...data.sets, makeSet()] })
  }
  function updateSet(i: number, s: WorkoutSet) {
    const sets = [...data.sets]
    sets[i] = s
    onUpdate({ ...data, sets })
  }
  function updateWeightConfig(i: number, change: WeightSelectorChange) {
    const sets = [...data.sets]
    if (change.weight !== undefined) {
      sets[i] = { ...sets[i], weight: change.weight }
    }
    onUpdate({
      ...data,
      sets,
      barWeight:
        change.barWeight !== undefined ? change.barWeight : data.barWeight,
      barType: change.barType ?? data.barType,
    })
  }
  function removeSet(i: number) {
    onUpdate({ ...data, sets: data.sets.filter((_, j) => j !== i) })
  }
  const isCardio = exercise.category === "cardio"
  const cardioLogged = hasCardioStateDetails(data.cardio)
  const allDone = isCardio
    ? cardioLogged
    : data.sets.length > 0 && data.sets.every((s) => s.completed)
  const doneSets = data.sets.filter((s) => s.completed).length
  const totalRest = data.sets.reduce((sum, set) => sum + set.restSeconds, 0)
  const selectedBarType = normalizeBarType(data.barType, data.barWeight)
  const barKg = parseKg(data.barWeight)
  const hasBarWeight = !!barKg && barKg > 0
  const barLabel =
    hasBarWeight && barKg != null
      ? `${formatWeightValue(barKg, unit)} ${unit}`
      : "Add bar"
  const barModeLabel = hasBarWeight
    ? barLabelForType(selectedBarType)
    : "No bar"

  function toggleBarWeight() {
    onUpdate({
      ...data,
      barType: selectedBarType,
      barWeight: hasBarWeight ? "" : defaultBarWeight(selectedBarType, unit),
    })
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative flex overflow-hidden transition-[opacity,transform] duration-150",
        inSuperset
          ? "border-t border-border/35 bg-transparent first:border-t-0"
          : "rounded-[12px] border border-border/45 bg-card",
        !inSuperset && allDone && "border-border/55",
        isDragging && "scale-[0.985] opacity-25"
      )}
    >
      {showLineBefore && (
        <div className="pointer-events-none absolute -top-[5px] right-4 left-4 z-10 h-[2.5px] rounded-full bg-primary/40" />
      )}
      {showLineAfter && (
        <div className="pointer-events-none absolute right-4 -bottom-[5px] left-4 z-10 h-[2.5px] rounded-full bg-primary/40" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={cn("px-3 py-2.5 md:py-3", inSuperset && "pl-4")}>
          <div className="flex items-center gap-2">
            {dragHandlers && (
              <div
                {...dragHandlers}
                role="button"
                aria-label="Reorder exercise"
                className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/30 transition-colors select-none active:cursor-grabbing active:bg-muted/35 active:text-muted-foreground/65"
              >
                <DotsSixVertical size={14} weight="bold" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] leading-tight font-semibold tracking-tight">
                {exercise.name}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground/50">
                {collapsed
                  ? isCardio
                    ? compactCardioSummary(
                        cardioDetailsFromState(data.cardio),
                        data.cardio.distanceUnit
                      )
                    : `${doneSets}/${data.sets.length} sets · ${formatRest(totalRest)} rest`
                  : exercise.muscle}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-tight tabular-nums transition-colors",
                allDone
                  ? "bg-muted/60 text-foreground/65"
                  : "bg-muted/35 text-muted-foreground/65"
              )}
            >
              {isCardio
                ? cardioLogged
                  ? "Logged"
                  : "Open"
                : `${doneSets}/${data.sets.length}`}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1">
            {!isCardio && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Tracking options for ${exercise.name}`}
                      className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border border-border/35 bg-transparent px-2.5 text-[10px] font-bold tracking-[0.08em] text-muted-foreground/65 uppercase transition-colors active:bg-muted/35 md:flex-none"
                    >
                      Track
                      <span className="truncate text-[11px] tracking-normal text-foreground/60">
                        {[data.trackRpe && "RPE", data.trackUnilateral && "UNI"]
                          .filter(Boolean)
                          .join(" · ") || "Off"}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="text-[10px] font-semibold tracking-[0.15em] uppercase">
                      Advanced tracking
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={data.trackRpe}
                      onCheckedChange={(checked) =>
                        onUpdate({ ...data, trackRpe: checked === true })
                      }
                    >
                      Track RPE
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={data.trackUnilateral}
                      onCheckedChange={(checked) =>
                        onUpdate({
                          ...data,
                          trackUnilateral: checked === true,
                        })
                      }
                    >
                      Track unilateral reps
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  type="button"
                  onClick={toggleBarWeight}
                  aria-label={
                    hasBarWeight
                      ? `Remove ${barLabel} bar weight`
                      : "Add bar weight"
                  }
                  className={cn(
                    "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[10px] font-bold tracking-[0.08em] uppercase transition-colors md:flex-none",
                    hasBarWeight
                      ? "border-border/50 bg-muted/55 text-foreground/75"
                      : "border-border/35 bg-transparent text-muted-foreground/65 active:bg-muted/35"
                  )}
                >
                  <Barbell size={13} weight="bold" />
                  <span className="min-w-0 truncate tracking-normal">
                    {barLabel}
                  </span>
                  {hasBarWeight && (
                    <span className="hidden max-w-20 truncate text-[10px] tracking-normal opacity-60 sm:inline">
                      {barModeLabel}
                    </span>
                  )}
                </button>
                <button
                  onClick={onShowHistory}
                  aria-label="Open exercise history"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors active:bg-muted/35 active:text-foreground"
                >
                  <ChartLine size={15} weight="bold" />
                </button>
              </>
            )}
            {onAiChange && (
              <button
                onClick={onAiChange}
                aria-label={`AI change ${exercise.name}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors active:bg-muted/35 active:text-foreground"
              >
                <Sparkle size={14} weight="fill" />
              </button>
            )}
            <button
              onClick={onRemove}
              aria-label="Remove exercise"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors active:bg-muted/35 active:text-foreground"
            >
              <X size={15} weight="bold" />
            </button>
            <button
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand exercise" : "Collapse exercise"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/55 transition-colors active:bg-muted/35 active:text-foreground"
            >
              {collapsed ? (
                <CaretDown size={15} weight="bold" />
              ) : (
                <CaretUp size={15} weight="bold" />
              )}
            </button>
          </div>
        </div>
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
            collapsed
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            {!isCardio &&
              lastSession &&
              (() => {
                const completedSets = lastSession.sets.filter(
                  (s) => s.completed !== false
                )
                if (completedSets.length === 0) return null
                const fmtW = (kg: number) =>
                  unit === "lbs" ? `${+(kg * 2.20462).toFixed(1)}` : `${kg}`
                const summary = completedSets
                  .map((s) => `${fmtW(s.weight)}×${s.reps}`)
                  .join("  ")
                return (
                  <div
                    className="flex items-center gap-2 px-3 py-2"
                    style={{
                      borderTop:
                        "1px solid color-mix(in srgb, var(--border) 45%, transparent)",
                    }}
                  >
                    <ClockCounterClockwise
                      size={13}
                      style={{
                        color:
                          "color-mix(in srgb, var(--muted-foreground) 62%, transparent)",
                        flexShrink: 0,
                      }}
                    />
                    <span className="text-[10.5px] font-medium text-muted-foreground/45">
                      {new Date(
                        `${lastSession.date}T12:00:00Z`
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="min-w-0 truncate text-[10.5px] text-muted-foreground/55 tabular-nums">
                      {summary}
                    </span>
                  </div>
                )
              })()}
            {isCardio ? (
              <CardioDetailsPanel
                cardio={data.cardio}
                onUpdate={(cardio) => onUpdate({ ...data, cardio })}
                isNext={isNextCardio}
              />
            ) : (
              <>
                <div
                  style={{
                    borderTop:
                      "1px solid color-mix(in srgb, var(--border) 45%, transparent)",
                  }}
                >
                  <div
                    className={cn(
                      "hidden items-center gap-2 border-b border-border/25 px-3 py-2 text-[10px] font-semibold text-muted-foreground/50 md:grid",
                      setGridClass(data.trackUnilateral, data.trackRpe)
                    )}
                  >
                    <span className="text-center">Set</span>
                    <span>Type</span>
                    <span>Weight</span>
                    {data.trackUnilateral ? (
                      <>
                        <span>Left</span>
                        <span>Right</span>
                      </>
                    ) : (
                      <span>Reps</span>
                    )}
                    {data.trackRpe && <span>RPE</span>}
                    {(data.trackRpe || data.trackUnilateral) && (
                      <span>Rest</span>
                    )}
                    <span className="text-center">Done</span>
                    {(data.trackRpe || data.trackUnilateral) && <span />}
                  </div>
                  {data.sets.map((s, i) => (
                    <div
                      key={s.id}
                      style={
                        i > 0
                          ? {
                              borderTop:
                                "1px solid color-mix(in srgb, var(--border) 45%, transparent)",
                            }
                          : undefined
                      }
                    >
                      <ActiveSetRow
                        set={s}
                        index={i}
                        trackRpe={data.trackRpe}
                        trackUnilateral={data.trackUnilateral}
                        unit={unit}
                        onUpdate={(updated) => updateSet(i, updated)}
                        onDelete={() => removeSet(i)}
                        canDelete={data.sets.length > 1}
                        onComplete={onStartRest}
                        isNext={nextSetIndex === i}
                        lastSet={lastSession?.sets[i]}
                        barWeight={data.barWeight}
                        barType={selectedBarType}
                        onWeightConfigChange={(change) =>
                          updateWeightConfig(i, change)
                        }
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={addSet}
                  className="flex h-10 w-full items-center justify-center gap-2 text-muted-foreground/45 transition-colors active:bg-muted/25 active:text-foreground"
                  style={{
                    borderTop:
                      "1px solid color-mix(in srgb, var(--border) 45%, transparent)",
                  }}
                >
                  <Plus size={14} weight="bold" />
                  <span className="text-[11px] font-semibold">
                    Add set
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import { estimate1RM } from "@/lib/one-rm"

// ─── Sparkline helper ─────────────────────────────────────────────────────────

function formatSessionDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

// ─── Exercise history sheet ───────────────────────────────────────────────────

type HistorySession = {
  date: string
  sets: Array<{
    weight: number
    reps: number
    completed: boolean
    type: string
  }>
}

function ExerciseHistorySheet({
  exerciseId,
  exerciseName,
  unit,
  onClose,
}: {
  exerciseId: string
  exerciseName: string
  unit: WeightUnit
  onClose: () => void
}) {
  const history = useQuery(api.logs.workouts.historyForExercise, {
    exerciseId,
  }) as HistorySession[] | undefined

  const completedSessions = useMemo(() => {
    if (!history) return []
    return history
      .map((session) => ({
        ...session,
        sets: session.sets.filter((s) => s.completed !== false),
      }))
      .filter((s) => s.sets.length > 0)
  }, [history])

  const maxWeights = completedSessions.map((s) =>
    Math.max(...s.sets.map((set) => set.weight || 0))
  )

  const chartW = 280
  const chartH = 60
  const points = sparklinePoints(maxWeights, chartW, chartH)

  function fmtWeight(kg: number) {
    if (unit === "lbs") return `${+(kg * 2.20462).toFixed(1)}`
    return `${kg}`
  }

  function fmtSets(sets: HistorySession["sets"]) {
    return sets.map((s) => `${fmtWeight(s.weight)}×${s.reps}`).join(", ")
  }

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={onClose}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3">
          <div className="h-1 w-10 rounded-full bg-foreground/[0.10]" />
        </div>
        <div className="flex items-center gap-3 px-5 pt-4 pb-3">
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-muted/60"
            style={{
              color: "color-mix(in srgb, var(--foreground) 40%, transparent)",
            }}
          >
            <ArrowLeft size={14} weight="bold" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-black tracking-tight">
              {exerciseName}
            </h2>
            <p className="text-[11px] text-muted-foreground/50">
              Strength history
            </p>
          </div>
        </div>

        {history === undefined ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-[13px] text-muted-foreground/40">
              Loading…
            </span>
          </div>
        ) : completedSessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16">
            <ChartLine
              size={28}
              style={{
                color: "color-mix(in srgb, var(--foreground) 18%, transparent)",
              }}
            />
            <p className="text-[13px] font-semibold text-muted-foreground/50">
              No history yet
            </p>
            <p className="text-[11px] text-muted-foreground/30">
              Complete this exercise to start tracking
            </p>
          </div>
        ) : (
          <>
            {completedSessions.length >= 2 && (
              <div className="mx-5 mb-4 overflow-hidden rounded-2xl bg-foreground/[0.04] px-4 py-4">
                <p className="mb-3 text-[9px] font-bold tracking-[0.18em] text-muted-foreground/40 uppercase">
                  Max weight · {unit}
                </p>
                <svg
                  width={chartW}
                  height={chartH}
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="w-full overflow-visible text-foreground/60"
                >
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity="0.45"
                      />
                      <stop offset="100%" stopColor="currentColor" />
                    </linearGradient>
                  </defs>
                  <polyline
                    points={points}
                    fill="none"
                    stroke="url(#chartGrad)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {maxWeights.map((w, i) => {
                    const x =
                      maxWeights.length === 1
                        ? chartW / 2
                        : (i / (maxWeights.length - 1)) * chartW
                    const min = Math.min(...maxWeights)
                    const max = Math.max(...maxWeights)
                    const range = max - min || 1
                    const y = chartH - ((w - min) / range) * (chartH * 0.85)
                    return (
                      <circle key={i} cx={x} cy={y} r="3" fill="currentColor" />
                    )
                  })}
                </svg>
                <div className="mt-2 flex justify-between">
                  <span className="text-[10px] text-muted-foreground/35">
                    {formatSessionDate(completedSessions[0].date)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/35">
                    {formatSessionDate(
                      completedSessions[completedSessions.length - 1].date
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* ── Estimated 1RM ── */}
            {(() => {
              // Find the best working set across all sessions (highest estimated 1RM)
              const bestSet = completedSessions
                .flatMap((s) =>
                  s.sets.filter((set) => set.weight > 0 && set.reps > 0)
                )
                .reduce<{ weight: number; reps: number; est: number } | null>(
                  (best, set) => {
                    const est = estimate1RM(set.weight, set.reps)
                    return !best || est > best.est
                      ? { weight: set.weight, reps: set.reps, est }
                      : best
                  },
                  null
                )
              if (!bestSet) return null
              const orm = bestSet.est
              const fmtW = (kg: number) =>
                unit === "lbs"
                  ? `${+(kg * 2.20462).toFixed(1)}`
                  : `${+kg.toFixed(1)}`
              const pcts = [
                {
                  pct: 100,
                  label: "1RM (est.)",
                  color:
                    "color-mix(in srgb, var(--foreground) 78%, transparent)",
                },
                {
                  pct: 90,
                  label: "Training max",
                  color:
                    "color-mix(in srgb, var(--foreground) 55%, transparent)",
                },
                {
                  pct: 80,
                  label: "Heavy work",
                  color:
                    "color-mix(in srgb, var(--foreground) 45%, transparent)",
                },
                {
                  pct: 70,
                  label: "Moderate",
                  color:
                    "color-mix(in srgb, var(--foreground) 35%, transparent)",
                },
              ]
              return (
                <div
                  className="mx-5 mb-4 overflow-hidden rounded-2xl"
                  style={{
                    border:
                      "1px solid color-mix(in srgb, var(--foreground) 8%, transparent)",
                    background:
                      "color-mix(in srgb, var(--foreground) 3%, var(--card))",
                  }}
                >
                  <div
                    className="flex items-center justify-between px-4 pt-3 pb-2"
                    style={{
                      borderBottom:
                        "1px solid color-mix(in srgb, var(--foreground) 6%, transparent)",
                    }}
                  >
                    <p className="text-[9px] font-bold tracking-[0.18em] text-muted-foreground/40 uppercase">
                      Estimated 1RM
                    </p>
                    <p className="text-[9px] text-muted-foreground/30">
                      from {fmtW(bestSet.weight)} {unit} × {bestSet.reps} reps
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-0">
                    {pcts.map(({ pct, label, color }) => {
                      const val = (orm * pct) / 100
                      return (
                        <div
                          key={pct}
                          className="flex flex-col items-center gap-0.5 px-2 py-3"
                        >
                          <span
                            className="text-[16px] leading-none font-black tracking-tight tabular-nums"
                            style={{ color }}
                          >
                            {fmtW(val)}
                          </span>
                          <span className="mt-0.5 text-[7.5px] font-medium tracking-widest text-muted-foreground/35 uppercase">
                            {unit}
                          </span>
                          <span
                            className="mt-1 text-[9px] font-semibold"
                            style={{ color }}
                          >
                            {pct}%
                          </span>
                          <span className="text-center text-[8.5px] leading-tight text-muted-foreground/35">
                            {label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            <div
              className="mx-5 overflow-hidden rounded-2xl"
              style={{
                border:
                  "1px solid color-mix(in srgb, var(--foreground) 7%, transparent)",
              }}
            >
              <p className="px-4 pt-3 pb-2 text-[9px] font-bold tracking-[0.18em] text-muted-foreground/40 uppercase">
                Sessions
              </p>
              <div className="max-h-[240px] overflow-y-auto">
                {[...completedSessions].reverse().map((session, i) => (
                  <div
                    key={session.date}
                    className="flex items-start gap-3 px-4 py-2.5"
                    style={
                      i > 0
                        ? {
                            borderTop:
                              "1px solid color-mix(in srgb, var(--foreground) 5%, transparent)",
                          }
                        : undefined
                    }
                  >
                    <span className="w-[52px] shrink-0 text-[11px] font-semibold text-muted-foreground/50">
                      {formatSessionDate(session.date)}
                    </span>
                    <span className="min-w-0 flex-1 text-[11px] leading-snug text-foreground/70">
                      {fmtSets(session.sets)}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold text-muted-foreground/40 tabular-nums">
                      {fmtWeight(
                        Math.max(...session.sets.map((s) => s.weight || 0))
                      )}{" "}
                      {unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AddExerciseSheet({
  addedIds,
  onAdd,
  onClose,
}: {
  addedIds: string[]
  onAdd: (ex: Exercise) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [activeFilters, setActiveFilters] = useState<Set<Category>>(new Set())
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle")
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [remoteExercises, setRemoteExercises] = useState<Exercise[]>([])
  const [recentExercises, setRecentExercises] = useState(() =>
    readRecentExerciseSearches()
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])
  function toggleFilter(cat: Category) {
    setActiveFilters((s) => {
      const next = new Set(s)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }
  useEffect(() => {
    const q = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    searchSeqRef.current += 1
    const delay = q.length === 0 ? 0 : 280
    debounceRef.current = setTimeout(async () => {
      const requestSeq = ++searchSeqRef.current
      setSearchState("loading")
      try {
        const results = await searchExercises({
          query: q,
          categories: activeFilters.size > 0 ? [...activeFilters] : undefined,
          limit: 25,
        })
        if (requestSeq !== searchSeqRef.current) return
        setRemoteExercises(results as Exercise[])
        setSearchState("done")
      } catch {
        if (requestSeq !== searchSeqRef.current) return
        setRemoteExercises([])
        setSearchState("error")
      }
    }, delay)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [activeFilters, query, searchAttempt])
  const filtered = remoteExercises
  const recentSuggestions = visibleRecentExerciseSearches(
    addedIds,
    recentExercises
  )
  const recentSuggestionIds = new Set(
    recentSuggestions.map((exercise) => exercise.id)
  )
  const popularSuggestions = visiblePopularExerciseSearches(addedIds).filter(
    (exercise) => !recentSuggestionIds.has(exercise.id)
  )
  const FILTERS: { cat: Category; label: string }[] = [
    { cat: "strength", label: "Strength" },
    { cat: "cardio", label: "Cardio" },
    { cat: "mobility", label: "Mobility" },
    { cat: "core", label: "Core" },
  ]

  function chooseSuggestion(exercise: ExerciseSearchSuggestion) {
    setActiveFilters(new Set())
    setQuery(exercise.name)
    inputRef.current?.focus()
  }

  function retrySearch() {
    setSearchAttempt((current) => current + 1)
  }

  function addAndRememberExercise(exercise: Exercise) {
    onAdd(exercise)
    setRecentExercises(rememberRecentExerciseSearch(exercise))
    onClose()
  }

  return (
    <div
      className="sheet-overlay fixed inset-0 z-40 md:flex md:justify-center md:bg-black/40 md:backdrop-blur-sm"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      onClick={onClose}
    >
      <div
        className="sheet-panel flex h-full w-full flex-col bg-background md:mt-12 md:h-auto md:max-h-[76vh] md:max-w-lg md:self-start md:overflow-hidden md:rounded-[28px] md:border md:border-border/45 md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
          <div className="relative flex-1">
            <MagnifyingGlass
              size={15}
              className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground/40"
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises…"
              className="h-11 w-full rounded-[20px] border border-border/45 bg-muted/35 pr-4 pl-10 text-[14px] transition-all outline-none placeholder:text-muted-foreground/35 focus:border-primary/30 focus:bg-background"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground/40 active:text-foreground"
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-[13px] font-semibold text-muted-foreground transition-colors active:text-foreground"
          >
            Done
          </button>
        </div>
        <div
          className="flex overflow-x-auto border-b border-border/40 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {FILTERS.map(({ cat, label }) => {
            const active = activeFilters.has(cat)
            const Icon = CATEGORY_ICON[cat]
            return (
              <button
                key={cat}
                onClick={() => toggleFilter(cat)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 px-4 py-3 text-[12px] font-semibold transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground/50 active:text-foreground/70"
                )}
              >
                <Icon
                  size={11}
                  weight={active ? "fill" : "regular"}
                  style={active ? { color: CATEGORY_COLOR[cat] } : undefined}
                />
                {label}
                {active && (
                  <span
                    className="absolute right-0 bottom-0 left-0 h-[2px] rounded-t-full"
                    style={{ backgroundColor: CATEGORY_COLOR[cat] }}
                  />
                )}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto">
          {searchState === "loading" ? (
            <div className="flex flex-col items-center gap-2 py-20">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground/70" />
              <p className="text-[13px] font-semibold text-muted-foreground">
                Searching exercises…
              </p>
            </div>
          ) : filtered.length > 0 ? (
            <div className="flex flex-col divide-y divide-border/30">
              {filtered.map((ex) => {
                const already = addedIds.includes(ex.id)
                return (
                  <div
                    key={ex.id}
                    className={cn(
                      "flex items-stretch",
                      already && "opacity-50"
                    )}
                  >
                    <div
                      className="w-[3px] shrink-0 rounded-l-sm"
                      style={{ backgroundColor: ex.color }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col justify-center py-3.5 pr-2 pl-4 text-left">
                      <p className="truncate text-[14px] leading-snug font-semibold">
                        {ex.name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground/55">
                        {ex.muscle}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (!already) {
                          addAndRememberExercise(ex)
                        }
                      }}
                      disabled={already}
                      className="flex items-center pr-4 pl-2 text-muted-foreground/40 transition-colors active:text-foreground disabled:pointer-events-none"
                    >
                      {already ? (
                        <Check
                          size={14}
                          weight="bold"
                          className="text-foreground/60"
                        />
                      ) : (
                        <Plus size={16} weight="bold" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : searchState === "done" ? (
            <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
              <div className="flex flex-col items-center gap-2">
                <p className="text-[13px] font-semibold text-muted-foreground">
                  No exercises found
                </p>
                <p className="text-[11px] text-muted-foreground/50">
                  Try a different search or filter
                </p>
              </div>
              <ExerciseSuggestionGroups
                recentSuggestions={recentSuggestions}
                popularSuggestions={popularSuggestions}
                onChoose={chooseSuggestion}
              />
            </div>
          ) : searchState === "error" ? (
            <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
              <div className="flex flex-col items-center gap-2">
                <p className="text-[13px] font-semibold text-muted-foreground">
                  Search failed
                </p>
                <p className="text-[11px] text-muted-foreground/50">
                  Check your connection and try again
                </p>
                <button
                  type="button"
                  onClick={retrySearch}
                  className="mt-1 min-h-9 rounded-[10px] bg-foreground px-4 text-[12px] font-semibold text-background active:opacity-85"
                >
                  Retry search
                </button>
              </div>
              <ExerciseSuggestionGroups
                recentSuggestions={recentSuggestions}
                popularSuggestions={popularSuggestions}
                onChoose={chooseSuggestion}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

type ExerciseSearchSuggestion =
  | Exercise
  | RecentExerciseSearch

function ExerciseSuggestionGroups({
  recentSuggestions,
  popularSuggestions,
  onChoose,
}: {
  recentSuggestions: RecentExerciseSearch[]
  popularSuggestions: Exercise[]
  onChoose: (exercise: ExerciseSearchSuggestion) => void
}) {
  if (recentSuggestions.length === 0 && popularSuggestions.length === 0) {
    return null
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ExerciseSuggestionChips
        label="Recent"
        suggestions={recentSuggestions}
        onChoose={onChoose}
      />
      <ExerciseSuggestionChips
        label="Try instead"
        suggestions={popularSuggestions}
        onChoose={onChoose}
      />
    </div>
  )
}

function ExerciseSuggestionChips({
  label,
  suggestions,
  onChoose,
}: {
  label: string
  suggestions: ExerciseSearchSuggestion[]
  onChoose: (exercise: ExerciseSearchSuggestion) => void
}) {
  if (suggestions.length === 0) return null

  return (
    <div className="w-full">
      <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/35 uppercase">
        {label}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((exercise) => {
          const Icon = CATEGORY_ICON[exercise.category]
          return (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onChoose(exercise)}
              className="flex min-h-9 items-center gap-1.5 rounded-[10px] border border-border/50 bg-muted/45 px-3 text-[12px] font-semibold text-foreground/75 transition-all active:scale-[0.985] active:bg-muted/70"
            >
              <Icon
                size={11}
                weight="fill"
                style={{ color: CATEGORY_COLOR[exercise.category] }}
              />
              {exercise.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AiWorkoutSheet({
  target,
  hasExisting,
  loading,
  onGenerate,
  onClose,
}: {
  target: AiWorkoutSheetTarget
  hasExisting: boolean
  loading: boolean
  onGenerate: (text: string, mode: AiWorkoutMode) => void | Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState("")
  const [mode, setMode] = useState<Exclude<AiWorkoutMode, "swap">>("append")
  const activeMode: AiWorkoutMode = target?.exerciseId ? "swap" : mode
  const canGenerate = text.trim().length >= 4 && !loading
  const title = target?.exerciseName
    ? `Change ${target.exerciseName}`
    : "Change this workout"
  const description = target?.exerciseName
    ? "Describe the swap you want. We'll match the best exercise and update this card without finishing your workout."
    : "Ask for exercises to add, or replace the remaining workout with a pasted plan. Everything stays editable."

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[6px]"
      onClick={loading ? undefined : onClose}
    >
      <div
        className="sheet-panel w-full max-w-lg overflow-hidden rounded-t-3xl bg-card shadow-2xl"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border/60" />
        <div className="px-5 pt-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
              <Sparkle size={17} weight="fill" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black tracking-[0.2em] text-muted-foreground/45 uppercase">
                Workout AI
              </p>
              <h2 className="mt-1 text-[19px] leading-tight font-black tracking-tight">
                {title}
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
                {description}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors active:bg-muted/60 active:text-foreground disabled:opacity-40"
              aria-label="Close workout AI"
            >
              <X size={15} weight="bold" />
            </button>
          </div>

          {!target?.exerciseId && hasExisting && (
            <div className="mt-5 grid grid-cols-2 rounded-2xl bg-muted/45 p-1 text-[12px] font-bold">
              {(
                [
                  { value: "append", label: "Add" },
                  { value: "replace", label: "Replace" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  disabled={loading}
                  className={cn(
                    "h-10 rounded-xl transition-all",
                    mode === option.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground/55 active:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            placeholder={
              target?.exerciseId
                ? "Swap for incline dumbbell press 3x10, keep rest around 90s"
                : "Add cable row 3x12 and face pulls 3x15\nOr paste a full lower-body day to replace this workout"
            }
            className="mt-5 min-h-48 w-full resize-none rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/30 focus:border-foreground/20 disabled:opacity-60"
          />

          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={() => void onGenerate(text.trim(), activeMode)}
              disabled={!canGenerate}
              aria-busy={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-[14px] font-black tracking-tight text-background transition-opacity active:opacity-80 disabled:opacity-35"
            >
              <Sparkle
                size={15}
                weight="fill"
                className={loading ? "animate-spin" : ""}
              />
              {loading
                ? "Updating workout…"
                : activeMode === "swap"
                  ? "Change exercise"
                  : activeMode === "replace"
                    ? "Replace workout"
                    : "Add exercises"}
            </button>
            <button
              onClick={onClose}
              disabled={loading}
              className="h-11 w-full rounded-xl bg-muted/55 text-[13px] font-semibold text-muted-foreground transition-colors active:bg-muted active:text-foreground disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResumeWorkoutSheet({
  source,
  savedAt,
  onResume,
  onDiscard,
}: {
  source: "convex" | "local"
  savedAt?: number
  onResume: () => void
  onDiscard: () => Promise<void>
}) {
  const [discarding, setDiscarding] = useState(false)
  const savedLabel = savedAt
    ? new Date(savedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  async function discard() {
    if (discarding) return
    setDiscarding(true)
    try {
      await onDiscard()
    } catch {
      setDiscarding(false)
    }
  }

  return (
    <div className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]">
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
      >
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-[20px] font-black tracking-tight">
            You have an active workout
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
            Resume your {source === "local" ? "locally saved" : "saved"} workout
            {savedLabel ? ` from ${savedLabel}` : ""}, or discard it and start
            fresh.
          </p>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            type="button"
            onClick={onResume}
            disabled={discarding}
            className="h-[52px] w-full rounded-[20px] bg-foreground text-[15px] font-black tracking-tight text-background transition-opacity active:opacity-80 disabled:opacity-60"
          >
            Resume workout
          </button>
          <button
            type="button"
            onClick={() => void discard()}
            disabled={discarding}
            aria-busy={discarding}
            className="h-[52px] w-full rounded-[20px] bg-destructive/10 text-[14px] font-bold text-destructive transition-colors active:bg-destructive/15 disabled:opacity-50"
          >
            {discarding ? "Discarding..." : "Discard workout"}
          </button>
        </div>
      </div>
    </div>
  )
}

function FinishSheet({
  elapsed,
  totalSets,
  doneSets,
  onFinish,
  onCancel,
}: {
  elapsed: number
  totalSets: number
  doneSets: number
  onFinish: () => Promise<void>
  onCancel: () => void
}) {
  const allDone = doneSets >= totalSets
  const [finishing, setFinishing] = useState(false)

  async function confirmFinish() {
    if (finishing) return
    setFinishing(true)
    try {
      await onFinish()
    } catch {
      setFinishing(false)
    }
  }

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={finishing ? undefined : onCancel}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="h-1 w-full transition-colors duration-500"
          style={{
            background: allDone
              ? "color-mix(in srgb, var(--primary) 50%, transparent)"
              : "transparent",
          }}
        />
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-[20px] font-black tracking-tight">
            {allDone ? "Workout complete" : "Finish early?"}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
            {!allDone &&
              `${totalSets - doneSets} set${totalSets - doneSets > 1 ? "s" : ""} still incomplete. `}
            Total time:{" "}
            <span className="font-black text-foreground tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          </p>
          <div className="mt-4 flex gap-3">
            {[
              { label: "Complete", value: `${doneSets}/${totalSets}` },
              { label: "Duration", value: formatElapsed(elapsed) },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-1 flex-col gap-0.5 rounded-[20px] bg-muted/40 px-3 py-2.5"
              >
                <span className="text-[9px] font-black tracking-[0.18em] text-muted-foreground/50 uppercase">
                  {label}
                </span>
                <span className="text-[18px] font-black tracking-tight tabular-nums">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            type="button"
            onClick={() => void confirmFinish()}
            disabled={finishing}
            aria-busy={finishing}
            className="h-[52px] w-full rounded-[20px] bg-foreground text-[15px] font-black tracking-tight text-background transition-opacity active:opacity-80 disabled:opacity-60"
          >
            {finishing ? "Finishing..." : "Finish workout"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={finishing}
            className="h-[52px] w-full rounded-[20px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35 active:text-foreground disabled:opacity-50"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
}

function AbortSheet({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [aborting, setAborting] = useState(false)

  async function confirmAbort() {
    if (aborting) return
    setAborting(true)
    try {
      await onConfirm()
    } catch {
      setAborting(false)
    }
  }

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={aborting ? undefined : onCancel}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-[20px] font-black tracking-tight">
            Abort workout?
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground/70">
            Your progress won't be saved.
          </p>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            type="button"
            onClick={() => void confirmAbort()}
            disabled={aborting}
            aria-busy={aborting}
            className="h-[52px] w-full rounded-[20px] bg-destructive text-[15px] font-black tracking-tight text-white transition-opacity active:opacity-80 disabled:opacity-60"
          >
            {aborting ? "Aborting..." : "Abort workout"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={aborting}
            className="h-[52px] w-full rounded-[20px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35 active:text-foreground disabled:opacity-50"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Renders a superset container with its member exercises as ActiveExerciseCard entries.
 *
 * Renders visual superset chrome (colored side band, header, connecting lines), maps each exercise ID
 * to an ActiveExerciseCard with drag handlers, collapse state, history link, rest control, and next-set highlighting.
 *
 * @param item - The superset workout item containing `exerciseIds`, `color`, and `id`.
 * @param exData - Map of exercise state keyed by exercise ID.
 * @param unit - Current weight unit (`kg` or `lbs`) for display/conversion.
 * @param updateExData - Callback to replace an exercise's ExerciseState.
 * @param removeExercise - Callback to remove an exercise from the workout.
 * @param drag - Current drag state or null.
 * @param dropTarget - Current drop target information used to render before/after indicators.
 * @param collapsed - Map of exerciseId to collapsed boolean.
 * @param toggleCollapsed - Toggles collapsed state for a given exercise ID.
 * @param makeDragHandlers - Factory that returns pointer/drag handlers for a given exercise ID.
 * @param itemRefs - Mutable ref map from top-level item key to the item DOM element (used for hit-testing).
 * @param onStartRest - Invoked with rest seconds to start the rest countdown for a set.
 * @param exerciseLookup - Map of exercise metadata keyed by exercise ID.
 * @param lastSessionMap - Map of exerciseId to last completed session summary (date and sets) or undefined.
 * @param onShowHistory - Callback invoked to open the exercise history sheet (exerciseId, name).
 * @param nextTarget - Optional next-set target identifying which exercise and set index should be highlighted.
 *
 * @returns A JSX element representing the superset block and its exercise cards.
 */
function renderSupersetItem(
  item: Extract<WorkoutItem, { kind: "superset" }>,
  exData: Record<string, ExerciseState>,
  unit: WeightUnit,
  updateExData: (id: string, d: ExerciseState) => void,
  removeExercise: (id: string) => void,
  drag: DragInfo | null,
  dropTarget: DropTarget,
  collapsed: Record<string, boolean>,
  toggleCollapsed: (id: string) => void,
  makeDragHandlers: (itemKey: string) => React.HTMLAttributes<HTMLDivElement>,
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  onStartRest: (s: number) => void,
  exerciseLookup: Record<string, Exercise>,
  lastSessionMap: Record<string, LastSession>,
  onShowHistory: (exId: string, name: string) => void,
  onAiChange: (exId: string, name: string) => void,
  nextTarget: NextTarget
) {
  const key = workoutItemKey(item)
  const dt = dropTarget
  const isTarget = dt?.targetKey === key
  const showLineBefore = !!(isTarget && dt?.type === "before")
  const showLineAfter = !!(isTarget && dt?.type === "after")
  const allDone = item.exerciseIds.every((id) => {
    const exercise = exerciseLookup[id]
    const data = exData[id]
    if (!data) return false
    if (exercise?.category === "cardio")
      return hasCardioStateDetails(data.cardio)
    return data.sets.every((s) => s.completed)
  })
  const groupSets = item.exerciseIds.reduce(
    (acc, id) => {
      if (exerciseLookup[id]?.category === "cardio") {
        const data = exData[id]
        return {
          done: acc.done + (data && hasCardioStateDetails(data.cardio) ? 1 : 0),
          total: acc.total + 1,
        }
      }
      const sets = exData[id]?.sets ?? []
      return {
        done: acc.done + sets.filter((set) => set.completed).length,
        total: acc.total + sets.length,
      }
    },
    { done: 0, total: 0 }
  )

  return (
    <div
      key={item.id}
      ref={(el) => {
        if (el) itemRefs.current.set(key, el)
        else itemRefs.current.delete(key)
      }}
      className={cn(
        "relative overflow-hidden rounded-[20px] border bg-card transition-[border-color,opacity,transform] duration-150 md:rounded-[22px]",
        allDone ? "border-primary/25" : "border-border/55",
        drag?.itemKey === key && drag.active && "scale-[0.985] opacity-25"
      )}
    >
      {showLineBefore && (
        <div className="pointer-events-none absolute -top-[5px] right-4 left-4 z-10 h-[2.5px] rounded-full bg-primary/40" />
      )}
      {showLineAfter && (
        <div className="pointer-events-none absolute right-4 -bottom-[5px] left-4 z-10 h-[2.5px] rounded-full bg-primary/40" />
      )}
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          background: allDone
            ? "color-mix(in srgb, var(--primary) 36%, transparent)"
            : "color-mix(in srgb, var(--muted-foreground) 18%, transparent)",
          opacity: 0.85,
        }}
      />
      <div
        className="flex items-center justify-between gap-3 border-b border-border/45 bg-muted/10 px-4 py-3"
        style={{
          paddingLeft: "calc(1rem + 4px)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div
            {...makeDragHandlers(key)}
            role="button"
            aria-label="Reorder superset"
            className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground/35 transition-colors select-none active:cursor-grabbing active:bg-muted/50 active:text-muted-foreground/70"
          >
            <DotsSixVertical size={15} weight="bold" />
          </div>
          <div className="min-w-0">
            <span className="text-[10.5px] font-bold tracking-[0.14em] text-muted-foreground/75 uppercase">
              Superset
            </span>
            <p className="mt-1 truncate text-[12px] text-muted-foreground/55">
              {item.exerciseIds.length} exercises
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-semibold tabular-nums",
            allDone
              ? "bg-primary/[0.10] text-primary"
              : "bg-muted/45 text-muted-foreground/70"
          )}
        >
          {groupSets.done}/{groupSets.total}
        </span>
      </div>
      <div className="flex flex-col pl-[3px]">
        {item.exerciseIds.map((exId) => {
          const ex = exerciseLookup[exId]
          if (!ex || !exData[exId]) return null
          return (
            <ActiveExerciseCard
              key={exId}
              exercise={ex}
              data={exData[exId]}
              unit={unit}
              onUpdate={(d) => updateExData(exId, d)}
              onRemove={() => removeExercise(exId)}
              isDragging={false}
              showLineBefore={false}
              showLineAfter={false}
              inSuperset
              collapsed={Boolean(collapsed[exId])}
              onToggleCollapse={() => toggleCollapsed(exId)}
              cardRef={() => undefined}
              onStartRest={onStartRest}
              lastSession={lastSessionMap[exId] ?? null}
              onShowHistory={() => onShowHistory(exId, ex.name)}
              onAiChange={() => onAiChange(exId, ex.name)}
              nextSetIndex={
                nextTarget?.kind === "set" && nextTarget.exerciseId === exId
                  ? nextTarget.setIndex
                  : null
              }
              isNextCardio={
                nextTarget?.kind === "cardio" && nextTarget.exerciseId === exId
              }
            />
          )
        })}
      </div>
    </div>
  )
}
/**
 * Renders and manages the Active Workout page, including UI for editing/performing sets and exercises, timers, drag-and-drop reordering, and sheets for adding exercises, viewing history, finishing, or aborting a workout.
 *
 * This component initializes from a Convex active workout or a preset, maintains local workout state (items, per-exercise sets and tracking options, UI collapse/drag state, and elapsed/rest timers), and debounces syncing updates back to Convex. It also handles creating the active workout record, finishing (with Convex primary and legacy fallback logging), aborting, and analytics events.
 *
 * @returns The React element for the Active Workout page.
 */
export default function ActiveWorkout() {
  const { presetId } = useParams<{ presetId?: string }>()
  const navigate = useSmoothNavigate()
  const posthog = usePostHog()
  const [searchParams] = useSearchParams()
  const slot = (Number(searchParams.get("slot") ?? "1") || 1) as 1 | 2
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()

  const presets = useQuery(api.logs.presets.list, {})
  const logCompletion = useOfflineMutation(
    api.logs.workouts.completion,
    "logs.workouts.completion"
  )
  const workoutHistory = useQuery(api.logs.workouts.getHistory)

  // Active workout Convex sync
  const activeWorkout = useQuery(api.logs.activeWorkout.getActive, { slot })
  const createActive = useMutation(api.logs.activeWorkout.createActive)
  const updateActive = useMutation(api.logs.activeWorkout.updateActive)
  const abortActive = useMutation(api.logs.activeWorkout.abortActive)
  const finishActive = useMutation(api.logs.activeWorkout.finishActive)
  const createWorkoutDraft = useAction(api.logs.presetAgent.createFromText)

  const [items, setItems] = useState<WorkoutItem[]>([])
  const [exData, setExData] = useState<Record<string, ExerciseState>>({})
  const [exerciseLookup, setExerciseLookup] = useState<
    Record<string, Exercise>
  >({})
  const preferences = useQuery(api.users.users.getPreferences)
  const [unit, setUnit] = useState<WeightUnit>("kg")
  const [confirmAbort, setConfirmAbort] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [aiSheetTarget, setAiSheetTarget] = useState<AiWorkoutSheetTarget>(null)
  const [aiUpdating, setAiUpdating] = useState(false)
  const [historySheet, setHistorySheet] = useState<{
    exerciseId: string
    name: string
  } | null>(null)
  const [workoutSyncStatus, setWorkoutSyncStatus] =
    useState<WorkoutSyncStatus>("idle")
  const [workoutSyncError, setWorkoutSyncError] = useState("")
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [localStartedAt, setLocalStartedAt] = useState<number | null>(null)
  const [resumePrompt, setResumePrompt] = useState<ResumePromptState>(null)
  const [resumeDecision, setResumeDecision] = useState<
    "pending" | "resume" | "discard"
  >("pending")
  const [completedPulseKey, setCompletedPulseKey] = useState<string | null>(
    null
  )
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const elapsed = useElapsedTimer(activeWorkout?.startedAt ?? localStartedAt)
  const rest = useRestCountdown(restTimerKey(slot))

  // Track if we've initialized from Convex to avoid overwriting user's workout data
  const [isInitialized, setIsInitialized] = useState(false)
  // Debounce sync to Convex
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSyncingRef = useRef(false)
  const isDirtyRef = useRef(false)
  const dirtyVersionRef = useRef(0)
  const abortingRef = useRef(false)
  const aiUpdatingRef = useRef(false)
  // Refs to capture current state for sync
  const itemsRef = useRef(items)
  const exDataRef = useRef(exData)
  const elapsedRef = useRef(elapsed)
  const slotRef = useRef(slot)

  // Keep refs in sync with state
  useEffect(() => {
    itemsRef.current = items
    if (!abortingRef.current) {
      isDirtyRef.current = true
      dirtyVersionRef.current += 1
    }
  }, [items])
  useEffect(() => {
    exDataRef.current = exData
    if (!abortingRef.current) {
      isDirtyRef.current = true
      dirtyVersionRef.current += 1
    }
  }, [exData])
  useEffect(() => {
    elapsedRef.current = elapsed
  }, [elapsed])
  useEffect(() => {
    slotRef.current = slot
  }, [slot])

  const allExIds = items.flatMap((i) =>
    i.kind === "solo" ? [i.exerciseId] : i.exerciseIds
  )
  const uniqueExerciseIds = [...new Set(allExIds)]
  const { total: totalSets, done: doneSets } = countWorkoutProgress(
    items,
    exData,
    exerciseLookup
  )

  const lastSessionMap = useMemo(() => {
    if (!workoutHistory)
      return {} as Record<
        string,
        {
          date: string
          sets: Array<{
            weight: number
            reps: number
            completed: boolean
            type: string
          }>
        }
      >
    const today = todayIso()
    const map: Record<string, LastSession> = {}
    for (const log of workoutHistory) {
      if (log.date >= today) continue
      for (const ex of log.exercises as unknown as LoggedWorkoutExercise[]) {
        if (!map[ex.id]) map[ex.id] = { date: log.date, sets: ex.sets }
      }
    }
    return map
  }, [workoutHistory])
  const progressPct =
    totalSets > 0 ? `${Math.round((doneSets / totalSets) * 100)}%` : "0%"
  const workoutSyncLabel =
    workoutSyncStatus === "pending"
      ? "Save pending"
      : workoutSyncStatus === "saving"
        ? "Saving workout"
        : workoutSyncStatus === "saved"
          ? "Workout saved"
          : workoutSyncStatus === "error"
            ? "Sync failed"
            : ""

  // Find the next set to highlight
  const nextTarget = useMemo(
    () => findNextTarget(items, exData, exerciseLookup),
    [items, exData, exerciseLookup]
  )
  const nextExercise = nextTarget
    ? exerciseLookup[nextTarget.exerciseId]
    : undefined
  const nextSetLabel = nextTarget
    ? nextTarget.kind === "cardio"
      ? `${nextExercise?.name ?? "Cardio"} · details`
      : `${nextExercise?.name ?? "Next exercise"} · set ${nextTarget.setIndex + 1}`
    : totalSets > 0
      ? "Ready to finish"
      : "Add an exercise"
  const activeExerciseIndex = nextTarget
    ? Math.max(0, uniqueExerciseIds.indexOf(nextTarget.exerciseId)) + 1
    : Math.min(uniqueExerciseIds.length, uniqueExerciseIds.length || 1)
  const activeExerciseName =
    nextExercise?.name ?? (totalSets > 0 ? "Workout" : "No exercise yet")
  const activeSetNumber =
    nextTarget?.kind === "set" ? nextTarget.setIndex + 1 : doneSets + 1

  // ── Sync state to Convex (debounced) ──────────────────────────────────────
  const syncToConvex = useCallback(
    (options: { immediate?: boolean } = {}) => {
      if (abortingRef.current) return
      if (!isDirtyRef.current) return
      if (isSyncingRef.current) return

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
      setWorkoutSyncStatus("pending")

      syncTimeoutRef.current = setTimeout(async () => {
        if (abortingRef.current) return
        if (!isDirtyRef.current) return
        isSyncingRef.current = true
        syncTimeoutRef.current = null
        try {
          while (!abortingRef.current && isDirtyRef.current) {
            const syncVersion = dirtyVersionRef.current
            setWorkoutSyncStatus("saving")
            await updateActive({
              slot: slotRef.current,
              items: itemsRef.current,
              exerciseData: exDataRef.current,
              elapsedSeconds: elapsedRef.current,
            })
            if (dirtyVersionRef.current === syncVersion) {
              isDirtyRef.current = false
              setWorkoutSyncError("")
              setWorkoutSyncStatus("saved")
            } else {
              setWorkoutSyncStatus("pending")
            }
          }
        } catch (err) {
          logDevWarn("Failed to sync workout to Convex:", err)
          setWorkoutSyncError(
            "Workout changes are not synced. Check your connection and retry."
          )
          setWorkoutSyncStatus("error")
        } finally {
          isSyncingRef.current = false
        }
      }, options.immediate ? 0 : 500) // Debounce 500ms
    },
    [updateActive]
  )

  // ── Load from Convex or preset on mount ────────────────────────────────────
  useEffect(() => {
    if (isInitialized) return

    const loadWorkoutState = (
      loadedItems: WorkoutItem[],
      loadedExData: Record<string, ExerciseState>,
      startedAt?: number | null
    ) => {
      setIsInitialized(true)
      if (startedAt) setLocalStartedAt(startedAt)
      setItems(loadedItems)
      setExData(
        Object.fromEntries(
          Object.entries(loadedExData).map(([exerciseId, state]) => [
            exerciseId,
            normalizeExerciseState(state),
          ])
        )
      )

      const ids = loadedItems.flatMap((i) =>
        i.kind === "solo" ? [i.exerciseId] : i.exerciseIds
      )
      if (ids.length > 0) {
        void resolveExerciseIds(ids)
          .then((lookup) => {
            setExerciseLookup((prev) => ({
              ...prev,
              ...(lookup as Record<string, Exercise>),
            }))
          })
          .catch((error) => {
            logDevWarn("Failed to resolve active workout exercises", error)
          })
      }
    }

    // If there's an active workout in Convex, load it
    if (activeWorkout) {
      if (resumeDecision === "pending") {
        setResumePrompt({ source: "convex" })
        return
      }
      if (resumeDecision === "discard") return

      const loadedItems = (activeWorkout.items as WorkoutItem[]) ?? []
      const loadedExData =
        (activeWorkout.exerciseData as Record<string, ExerciseState>) ?? {}
      loadWorkoutState(loadedItems, loadedExData, activeWorkout.startedAt)
      return
    }

    const localDraft = readActiveWorkoutDraft(slot)
    if (localDraft && localDraft.items.length > 0) {
      if (resumeDecision === "pending") {
        setResumePrompt({ source: "local", draft: localDraft })
        return
      }
      if (resumeDecision === "resume") {
        loadWorkoutState(
          localDraft.items,
          localDraft.exerciseData,
          localDraft.startedAt
        )
        return
      }
    }

    // If no Convex state, try to load from preset
    if (presetId && presets) {
      const match = presets.find((p) => (p.id ?? p._id) === presetId)
      if (match) {
        const loadedItems = (match.items as WorkoutItem[]) ?? []
        const loadedExData =
          (match.exerciseData as Record<string, ExerciseState>) ?? {}
        loadWorkoutState(loadedItems, loadedExData, Date.now())
      }
    }
  }, [activeWorkout, isInitialized, presetId, presets, resumeDecision, slot])

  // ── Create active workout in Convex when items are loaded ─────────────────
  useEffect(() => {
    if (!isInitialized) return
    if (abortingRef.current) return
    if (items.length === 0) return
    if (activeWorkout) return // Already have an active workout

    const ids = items.flatMap((i) =>
      i.kind === "solo" ? [i.exerciseId] : i.exerciseIds
    )
    if (ids.length > 0) {
      safeSessionStorageRemove(ABORTED_WORKOUT_SLOT_KEY)
      void createActive({
        slot,
        presetId: presetId ?? undefined,
        items,
        exerciseData: exData,
      }).catch(reportOfflineMutationError)
    }
  }, [
    isInitialized,
    items.length,
    activeWorkout,
    createActive,
    slot,
    presetId,
    items,
    exData,
  ])

  // ── Sync to Convex when state changes ─────────────────────────────────────
  useEffect(() => {
    if (!isInitialized) return
    syncToConvex()
  }, [isInitialized, items, exData, syncToConvex])

  // Sync elapsed time every 5 seconds
  useEffect(() => {
    if (!isInitialized) return
    if (elapsed % 5 !== 0) return // Only sync every 5 seconds for elapsed time
    syncToConvex()
  }, [isInitialized, elapsed, syncToConvex])

  useEffect(() => {
    if (preferences?.weightUnit) {
      setUnit(preferences.weightUnit as WeightUnit)
    }
  }, [preferences])

  useEffect(() => {
    if (!isInitialized || abortingRef.current || items.length === 0) return
    const startedAt = activeWorkout?.startedAt ?? localStartedAt ?? Date.now()
    if (!localStartedAt && !activeWorkout?.startedAt) {
      setLocalStartedAt(startedAt)
    }
    writeActiveWorkoutDraft({
      elapsedSeconds: elapsed,
      exerciseData: exData,
      items,
      presetId,
      savedAt: Date.now(),
      slot,
      startedAt,
    })
  }, [
    activeWorkout?.startedAt,
    elapsed,
    exData,
    isInitialized,
    items,
    localStartedAt,
    presetId,
    slot,
  ])

  useEffect(() => {
    if (isInitialized) {
      posthog.capture("workout_started", { preset_id: presetId ?? null })
    }
  }, [isInitialized, presetId, posthog])

  function openAiWorkoutSheet(target: AiWorkoutSheetTarget) {
    if (requireAiAccess()) setAiSheetTarget(target)
  }

  async function resolveAiDraftExercises(
    draftExercises: AgentWorkoutExerciseDraft[]
  ) {
    return await Promise.all(
      draftExercises.map(async (draftExercise) => {
        const candidates = await searchExercises({
          query: draftExercise.name,
          limit: 6,
        })
        return {
          draftExercise,
          exercise: pickBestExerciseMatch(draftExercise.name, candidates),
        }
      })
    )
  }

  async function handleAiWorkoutChange(text: string, mode: AiWorkoutMode) {
    if (!requireAiAccess()) return
    if (!text.trim()) return
    if (aiUpdatingRef.current || aiUpdating) return

    aiUpdatingRef.current = true
    setAiUpdating(true)
    try {
      const draft = (await createWorkoutDraft({ text })) as AgentWorkoutDraft
      const draftExercises = (draft.exercises ?? []).filter((exercise) =>
        exercise.name?.trim()
      )

      if (draftExercises.length === 0) {
        throw new Error("I couldn't find any exercises in that request.")
      }

      const resolved = await resolveAiDraftExercises(draftExercises)
      const unmatched: string[] = []

      if (mode === "swap") {
        const targetId = aiSheetTarget?.exerciseId
        if (!targetId) throw new Error("Pick an exercise to change first.")

        const match = resolved.find((item) => item.exercise)
        if (!match?.exercise) {
          throw new Error("I couldn't match that swap to the exercise catalog.")
        }

        const exercise = match.exercise
        const duplicateIds = new Set(
          uniqueExerciseIds.filter((id) => id !== targetId)
        )
        if (duplicateIds.has(exercise.id)) {
          throw new Error(`${exercise.name} is already in this workout.`)
        }

        const nextState = makeExerciseStateFromAgentDraft(
          exercise,
          match.draftExercise
        )

        setExerciseLookup((prev) => ({ ...prev, [exercise.id]: exercise }))
        setItems((prev) => replaceExerciseInItems(prev, targetId, exercise.id))
        setExData((prev) => {
          const next = { ...prev }
          if (exercise.id !== targetId) delete next[targetId]
          next[exercise.id] = nextState
          return next
        })
        setCollapsed((prev) => {
          if (exercise.id === targetId) return prev
          const next = { ...prev }
          delete next[targetId]
          return next
        })

        posthog.capture("active_workout_ai_changed", {
          mode,
          matched_count: 1,
          unmatched_count: resolved.length - 1,
        })
        setAiSheetTarget(null)
        toast.success(`Changed to ${exercise.name}`)
        return
      }

      const existingIds = new Set(mode === "append" ? uniqueExerciseIds : [])
      const seenIds = new Set<string>()
      const nextItems: WorkoutItem[] = []
      const nextExerciseData: Record<string, ExerciseState> = {}
      const nextExerciseLookup: Record<string, Exercise> = {}

      for (const match of resolved) {
        const exercise = match.exercise
        if (!exercise) {
          unmatched.push(match.draftExercise.name)
          continue
        }
        if (seenIds.has(exercise.id) || existingIds.has(exercise.id)) continue

        seenIds.add(exercise.id)
        nextItems.push({ kind: "solo", exerciseId: exercise.id })
        nextExerciseData[exercise.id] = makeExerciseStateFromAgentDraft(
          exercise,
          match.draftExercise
        )
        nextExerciseLookup[exercise.id] = exercise
      }

      if (nextItems.length === 0) {
        throw new Error(
          mode === "append"
            ? "Those exercises are already in this workout."
            : "I couldn't match those exercises to the catalog."
        )
      }

      if (mode === "replace") {
        setItems(nextItems)
        setExData(nextExerciseData)
        setExerciseLookup(nextExerciseLookup)
        setCollapsed({})
        rest.dismiss()
      } else {
        setItems((prev) => [...prev, ...nextItems])
        setExData((prev) => ({ ...prev, ...nextExerciseData }))
        setExerciseLookup((prev) => ({ ...prev, ...nextExerciseLookup }))
      }

      posthog.capture("active_workout_ai_changed", {
        mode,
        matched_count: nextItems.length,
        unmatched_count: unmatched.length,
      })

      setAiSheetTarget(null)
      toast.success(
        unmatched.length > 0
          ? `Added ${nextItems.length} exercises. ${unmatched.length} couldn't be matched.`
          : mode === "replace"
            ? `Rebuilt workout with ${nextItems.length} exercises`
            : `Added ${nextItems.length} exercises`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update workout"
      )
    } finally {
      aiUpdatingRef.current = false
      setAiUpdating(false)
    }
  }

  function addExercise(ex: Exercise) {
    const id = ex.id
    setExerciseLookup((prev) => ({ ...prev, [id]: ex }))
    setItems((prev) => [...prev, { kind: "solo", exerciseId: id }])
    setExData((prev) => ({
      ...prev,
      [id]: makeDefaultExerciseState(ex),
    }))
  }
  function removeExercise(id: string) {
    setItems((prev) => removeExFromItems(prev, id))
    setExData((prev) => {
      const n = { ...prev }
      delete n[id]
      return n
    })
  }
  function updateExData(id: string, data: ExerciseState) {
    setExData((prev) => ({ ...prev, [id]: data }))
  }
  function toggleCollapsed(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }
  function calcDropTarget(
    x: number,
    y: number,
    draggedKey: string
  ): DropTarget {
    for (const [targetKey, el] of itemRefs.current) {
      if (targetKey === draggedKey) continue
      const rect = el.getBoundingClientRect()
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
        continue
      const relY = (y - rect.top) / rect.height
      return relY < 0.5
        ? { type: "before", targetKey }
        : { type: "after", targetKey }
    }
    return null
  }
  useEffect(() => {
    if (!drag) return
    const currentDrag = drag
    function handlePointerMove(event: PointerEvent) {
      setDrag((prev) => {
        if (!prev) return prev
        const moved =
          prev.active ||
          Math.hypot(event.clientX - prev.startX, event.clientY - prev.startY) >
            6
        return {
          ...prev,
          x: event.clientX,
          y: event.clientY,
          active: moved,
        }
      })
      const movedX = event.clientX
      const movedY = event.clientY
      setDropTarget(calcDropTarget(movedX, movedY, currentDrag.itemKey))
    }
    function handlePointerEnd() {
      if (currentDrag.active && dropTarget) {
        executeDrop(currentDrag.itemKey, dropTarget)
      }
      setDrag(null)
      setDropTarget(null)
    }
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerEnd)
    window.addEventListener("pointercancel", handlePointerEnd)
    document.body.style.userSelect = "none"
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerEnd)
      window.removeEventListener("pointercancel", handlePointerEnd)
      document.body.style.userSelect = ""
    }
  }, [drag, dropTarget])

  function makeDragHandlers(
    itemKey: string
  ): React.HTMLAttributes<HTMLDivElement> {
    return {
      onPointerDown(event) {
        event.preventDefault()
        event.stopPropagation()
        setDrag({
          itemKey,
          x: event.clientX,
          y: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
        })
      },
    }
  }

  function executeDrop(draggedKey: string, zone: DropTarget) {
    if (!zone) return

    setItems((prev) => {
      const fromIdx = prev.findIndex(
        (item) => workoutItemKey(item) === draggedKey
      )
      if (fromIdx === -1) return prev

      const draggedItem = prev[fromIdx]
      const nextItems = prev.filter((_, index) => index !== fromIdx)
      const targetIdx = nextItems.findIndex(
        (item) => workoutItemKey(item) === zone.targetKey
      )
      if (targetIdx === -1) return prev

      const insertAt = zone.type === "before" ? targetIdx : targetIdx + 1
      return [
        ...nextItems.slice(0, insertAt),
        draggedItem,
        ...nextItems.slice(insertAt),
      ]
    })
  }

  async function handleFinish() {
    const exercises = items.flatMap((item) => {
      const ids = item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
      return ids.flatMap((id) => {
        const ex = exerciseLookup[id]
        const data = exData[id]
        if (!ex || !data) return []
        const isCardio = ex.category === "cardio"
        const cardio = isCardio ? cardioLogFromState(data.cardio) : null
        const sets = isCardio
          ? []
          : data.sets
              .filter((s) => s.completed)
              .map((s) => ({
                type: "normal",
                weight: parseFloat(String(s.weight)) || 0,
                reps: parseFloat(String(s.reps)) || 0,
                completed: s.completed,
              }))
        return [
          {
            id,
            name: ex.name,
            category: ex.category,
            sets,
            ...(cardio ? { cardio } : {}),
          },
        ]
      })
    })
    try {
      // Finish the active workout in Convex (this also logs it)
      await finishActive({
        slot,
        exercises,
        durationSeconds: elapsed,
      })
      posthog.capture("workout_completed", {
        preset_id: presetId ?? null,
        duration_seconds: elapsed,
        exercise_count: exercises.length,
        total_sets: exercises.reduce(
          (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
          0
        ),
        cardio_count: exercises.filter((ex) => Boolean(ex.cardio)).length,
      })
      clearActiveWorkoutDraft(slot)
      navigate(-1)
    } catch (err) {
      logDevError("Failed to finish workout:", err)
      // Fallback to old method if Convex fails
      try {
        await logCompletion({
          date: todayIso(),
          exercises,
          durationSeconds: elapsed,
        })
        clearActiveWorkoutDraft(slot)
        navigate(-1)
      } catch (fallbackErr) {
        logDevError("Failed to log workout as fallback:", fallbackErr)
        toast.error("Failed to finish workout. Please try again.")
        throw fallbackErr
      }
    }
  }

  function cardProps(
    itemKey: string,
    inSuperset = false
  ): ExerciseCardDropProps {
    const dt = dropTarget
    const isTarget = dt?.targetKey === itemKey
    if (inSuperset)
      return {
        showLineBefore: false,
        showLineAfter: false,
      }
    return {
      showLineBefore: isTarget && dt?.type === "before",
      showLineAfter: isTarget && dt?.type === "after",
    }
  }

  function completeNextSet() {
    if (nextTarget?.kind !== "set") {
      hapticSelection()
      if (totalSets > 0) setConfirmFinish(true)
      else setSearchOpen(true)
      return
    }

    const currentData = exData[nextTarget.exerciseId]
    const currentSet = currentData?.sets[nextTarget.setIndex]
    if (!currentData || !currentSet) return

    updateExData(nextTarget.exerciseId, {
      ...currentData,
      sets: currentData.sets.map((set, index) =>
        index === nextTarget.setIndex ? { ...set, completed: true } : set
      ),
    })
    const pulseKey = `${nextTarget.exerciseId}:${nextTarget.setIndex}`
    setCompletedPulseKey(pulseKey)
    window.setTimeout(() => {
      setCompletedPulseKey((current) => (current === pulseKey ? null : current))
    }, 520)
    hapticMedium()
    if (!currentSet.completed && currentSet.restSeconds > 0) {
      rest.start(currentSet.restSeconds)
    }
  }

  return (
    <div className="desktop-canvas min-h-svh bg-background md:px-8">
      <div className="mx-auto flex w-full max-w-xl flex-col pb-[calc(var(--app-safe-bottom-lg)+7rem)] md:max-w-5xl md:pb-10 xl:max-w-6xl">
        <div className="workout-live-header sticky top-0 z-30 border-b border-border/35 bg-background/96 px-[var(--app-page-x)] backdrop-blur-xl md:border-b-0 md:px-8">
          <div
            className="flex items-center justify-between gap-2"
            style={{
              paddingTop:
                "max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))",
              paddingBottom: "0.5rem",
            }}
          >
            <button
              type="button"
              aria-label="Abort workout"
              title="Abort workout"
              onClick={() => setConfirmAbort(true)}
              className="motion-tactile inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-0 text-[13px] font-bold text-muted-foreground active:text-foreground md:min-w-0 md:px-1"
            >
              <X size={22} weight="bold" className="md:hidden" />
              <span className="hidden md:inline">Abort</span>
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-2">
              <span className="truncate text-[11px] font-bold text-muted-foreground/55 uppercase">
                {doneSets}/{totalSets} done
              </span>
              {slot === 2 && (
                <span className="rounded-[8px] bg-muted/55 px-2 py-0.5 text-[9px] font-bold text-muted-foreground/80 uppercase">
                  Slot 2
                </span>
              )}
              {workoutSyncStatus !== "idle" && (
                <span
                  role="status"
                  aria-live="polite"
                  title={workoutSyncError || undefined}
                  className={cn(
                    "rounded-[8px] px-2 py-0.5 text-[9px] font-bold uppercase",
                    workoutSyncStatus === "error"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-muted/55 text-muted-foreground/80"
                  )}
                >
                  {workoutSyncLabel}
                </span>
              )}
            </div>
            <div className="flex h-10 shrink-0 overflow-hidden rounded-[10px] border border-border/45 bg-muted/35 text-[11px] font-bold">
              {(["kg", "lbs"] as WeightUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={cn(
                    "motion-tactile min-w-10 px-2.5 md:min-w-12 md:px-3",
                    unit === u
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground/65 active:bg-muted/60 active:text-foreground"
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <section
            className={cn(
              "pb-3 md:pb-4",
              completedPulseKey && "motion-success-pop"
            )}
          >
            <div className="min-w-0 text-center">
              <p className="truncate text-[11px] font-extrabold tracking-[0.12em] text-muted-foreground/55 uppercase">
                {uniqueExerciseIds.length > 0
                  ? `Exercise ${activeExerciseIndex} of ${uniqueExerciseIds.length}`
                  : "Active workout"}
              </p>
              <h1 className="mt-1 truncate text-[1.55rem] leading-none font-black tracking-tight text-foreground md:text-[2rem]">
                {activeExerciseName}
              </h1>
              <p className="mt-1 truncate text-[12px] font-semibold text-muted-foreground/60">
                {nextSetLabel}
              </p>
            </div>

            <div className="mt-3 rounded-[18px] bg-card p-3 shadow-[0_8px_24px_color-mix(in_srgb,var(--foreground)_5%,transparent)] md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-4 md:rounded-[22px] md:border md:border-border md:p-4">
              <div className="text-center md:text-left">
                <p className="text-[10px] font-extrabold tracking-[0.12em] text-muted-foreground/50 uppercase">
                  {rest.remaining !== null ? "Rest" : "Time"}
                </p>
                <div className="mt-1 text-[2.65rem] leading-none font-black tracking-tight tabular-nums md:text-[3.4rem]">
                  {formatElapsed(rest.remaining ?? elapsed)}
                </div>
              </div>
              {rest.remaining !== null ? (
                <button
                  onClick={rest.dismiss}
                  className="motion-tactile mt-3 h-12 w-full rounded-[14px] bg-muted text-[14px] font-extrabold md:mt-0 md:w-auto md:px-5"
                >
                  Skip rest
                </button>
              ) : (
                <button
                  onClick={completeNextSet}
                  className="motion-tactile mt-3 h-12 w-full rounded-[14px] bg-primary text-[14px] font-extrabold text-primary-foreground md:mt-0 md:w-auto md:px-5"
                >
                  {nextTarget?.kind === "set"
                    ? `Done with set ${activeSetNumber}`
                    : totalSets > 0
                      ? "Finish workout"
                      : "Add exercise"}
                </button>
              )}
            </div>

            <div className="mt-3 flex items-center gap-3">
              {workoutSyncStatus === "error" && (
                <button
                  type="button"
                  onClick={() => syncToConvex({ immediate: true })}
                  className="motion-tactile min-h-11 shrink-0 rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 text-[11px] font-extrabold text-destructive"
                  aria-label="Retry active workout sync"
                >
                  Retry
                </button>
              )}
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/55">
                <div
                  className="motion-progress-fill h-full rounded-full bg-primary/55"
                  style={{ width: progressPct }}
                />
              </div>
              <span className="shrink-0 text-[10px] font-bold text-muted-foreground/45 tabular-nums">
                {progressPct}
              </span>
            </div>
          </section>
        </div>
        <div className="flex flex-col gap-4 px-[var(--app-page-x)] pt-3 md:px-8 md:pt-5">
          <div className="flex flex-col gap-3 md:gap-2.5">
            {items.map((item) => {
              if (item.kind === "solo") {
                const ex = exerciseLookup[item.exerciseId]
                if (!ex) return null
                const key = workoutItemKey(item)
                return (
                  <ActiveExerciseCard
                    key={item.exerciseId}
                    exercise={ex}
                    data={exData[item.exerciseId]}
                    unit={unit}
                    onUpdate={(d) => updateExData(item.exerciseId, d)}
                    onRemove={() => removeExercise(item.exerciseId)}
                    isDragging={drag?.itemKey === key && drag.active}
                    {...cardProps(key)}
                    collapsed={Boolean(collapsed[item.exerciseId])}
                    onToggleCollapse={() => toggleCollapsed(item.exerciseId)}
                    dragHandlers={makeDragHandlers(key)}
                    cardRef={(el) => {
                      if (el) itemRefs.current.set(key, el)
                      else itemRefs.current.delete(key)
                    }}
                    onStartRest={rest.start}
                    lastSession={lastSessionMap[item.exerciseId] ?? null}
                    onShowHistory={() =>
                      setHistorySheet({
                        exerciseId: item.exerciseId,
                        name: ex.name,
                      })
                    }
                    onAiChange={() =>
                      openAiWorkoutSheet({
                        exerciseId: item.exerciseId,
                        exerciseName: ex.name,
                      })
                    }
                    nextSetIndex={
                      nextTarget?.kind === "set" &&
                      nextTarget.exerciseId === item.exerciseId
                        ? nextTarget.setIndex
                        : null
                    }
                    isNextCardio={
                      nextTarget?.kind === "cardio" &&
                      nextTarget.exerciseId === item.exerciseId
                    }
                  />
                )
              }
              return renderSupersetItem(
                item,
                exData,
                unit,
                updateExData,
                removeExercise,
                drag,
                dropTarget,
                collapsed,
                toggleCollapsed,
                makeDragHandlers,
                itemRefs,
                rest.start,
                exerciseLookup,
                lastSessionMap,
                (exId, name) => setHistorySheet({ exerciseId: exId, name }),
                (exId, name) =>
                  openAiWorkoutSheet({ exerciseId: exId, exerciseName: name }),
                nextTarget
              )
            })}
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="app-empty h-14 w-full justify-center text-[13px] font-medium transition-colors active:bg-muted/25 active:text-foreground"
          >
            <Plus size={14} weight="bold" />
            Add exercise
          </button>
          <button
            onClick={() => openAiWorkoutSheet({})}
            disabled={aiUpdating}
            aria-busy={aiUpdating}
            className="app-empty h-14 w-full justify-center border-dashed border-border/60 bg-transparent text-[13px] font-semibold text-muted-foreground/70 transition-colors active:bg-muted/25 active:text-foreground disabled:opacity-45"
          >
            <Sparkle
              size={14}
              weight="fill"
              className={aiUpdating ? "animate-spin" : ""}
            />
            AI change workout
          </button>
        </div>
      </div>
      {searchOpen && (
        <AddExerciseSheet
          addedIds={uniqueExerciseIds}
          onAdd={addExercise}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {aiSheetTarget !== null && (
        <AiWorkoutSheet
          target={aiSheetTarget}
          hasExisting={uniqueExerciseIds.length > 0}
          loading={aiUpdating}
          onGenerate={handleAiWorkoutChange}
          onClose={() => setAiSheetTarget(null)}
        />
      )}
      {confirmFinish && (
        <FinishSheet
          elapsed={elapsed}
          totalSets={totalSets}
          doneSets={doneSets}
          onFinish={handleFinish}
          onCancel={() => setConfirmFinish(false)}
        />
      )}
      {confirmAbort && (
        <AbortSheet
          onConfirm={async () => {
            try {
              abortingRef.current = true
              isDirtyRef.current = false
              if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current)
                syncTimeoutRef.current = null
              }
              await abortActive({ slot })
              clearActiveWorkoutDraft(slot)
              safeSessionStorageSet(ABORTED_WORKOUT_SLOT_KEY, String(slot))
              navigate(-1)
            } catch (err) {
              abortingRef.current = false
              logDevError("Failed to abort workout in Convex:", err)
              // Clear pending sync timer on error
              if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current)
                syncTimeoutRef.current = null
              }
              toast.error("Failed to abort workout. Please try again.")
              throw err
            }
          }}
          onCancel={() => setConfirmAbort(false)}
        />
      )}
      {resumePrompt && (
        <ResumeWorkoutSheet
          source={resumePrompt.source}
          savedAt={
            resumePrompt.source === "local"
              ? resumePrompt.draft?.savedAt
              : activeWorkout?._creationTime
          }
          onResume={() => {
            hapticSelection()
            setResumeDecision("resume")
            setResumePrompt(null)
          }}
          onDiscard={async () => {
            hapticMedium()
            clearActiveWorkoutDraft(slot)
            setResumeDecision("discard")
            setResumePrompt(null)
            if (resumePrompt.source === "convex") {
              abortingRef.current = true
              isDirtyRef.current = false
              if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current)
                syncTimeoutRef.current = null
              }
              await abortActive({ slot })
              safeSessionStorageSet(ABORTED_WORKOUT_SLOT_KEY, String(slot))
              abortingRef.current = false
            }
            if (!presetId) {
              setLocalStartedAt(Date.now())
              setIsInitialized(true)
            }
          }}
        />
      )}
      {historySheet && (
        <ExerciseHistorySheet
          exerciseId={historySheet.exerciseId}
          exerciseName={historySheet.name}
          unit={unit}
          onClose={() => setHistorySheet(null)}
        />
      )}

      {aiAccessModal}
    </div>
  )
}
