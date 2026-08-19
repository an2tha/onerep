import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Barbell,
  CaretDown,
  CaretRight,
  ClockCounterClockwise,
  Copy,
  DotsThree,
  Fire,
  Heart,
  PencilSimple,
  Play,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react"
import type { CSSProperties } from "react"
import { useSearchParams } from "react-router"
import { cn } from "@/lib/utils"
import { FormCoachPinnedCards } from "@/components/form-coach-card"
import { useSmoothNavigate } from "@/lib/navigation"
import { updateOneRepWidgets } from "@/lib/home-widgets"
import { MobileSheet } from "@/components/mobile-sheet"
import { LogPastWorkoutSheet } from "@/components/log-past-workout-sheet"
import { SwipeToStart, toast } from "@repo/ui"
import {
  HoldToStartDial,
  TrainingStatDial,
} from "@/components/training-hero-dials"
import { TourAnchor, useTourAnchor } from "@/components/walkthrough/tour-anchor"
import { DateSelectorButton } from "@repo/ui"
import { useMutation, useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  compactCardioSummary,
  hasCardioDetails,
  normalizePresetCard,
  normalizeScheduleRoutines,
  scheduleRoutinePayload,
  todayIso,
  type CachedWorkoutLog,
  type Routine,
  type WorkoutFocus,
  type WorkoutPresetCard,
} from "@/lib/workout-sync"
import {
  computeMuscleRecovery,
  computeWeeklyMuscleVolume,
  buildCatalogMap,
  type MuscleSets,
} from "@/lib/muscle-volume"
import { MuscleRecoveryHeatmapCard } from "@repo/ui"
import { PrimaryButton } from "@repo/ui"
import {
  AnimatedAccordion,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui"
import { resolveExerciseIds, type Exercise } from "@/lib/exercise-catalog"
import {
  getLoggedExerciseId,
  toWorkoutLogRecords,
  type WorkoutHistoryLog,
} from "@/lib/exercise-history"
import {
  APP_ACCENT_COLORS,
  MUSCLE_COLORS as ONE_REP_MUSCLE_COLORS,
} from "@repo/ui"
import { offsetDateKey } from "@/lib/food-log"
import { hapticMedium, hapticSelection } from "@/lib/haptics"

// ─── Types ────────────────────────────────────────────────────────────────────

/* The crown: four satellites spaced along the hold dial's lower arc, far
   enough out that the ring in front cuts a clean gap through each. Angles are
   screen-space degrees — 90° is straight down. */
const HERO_ORBIT_RADIUS = 107
const HERO_SATELLITES = [
  { angle: 158, mirrored: true },
  { angle: 114, mirrored: true },
  { angle: 66, mirrored: false },
  { angle: 22, mirrored: false },
] as const

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
type Day = (typeof DAYS)[number]

// ─── Constants ────────────────────────────────────────────────────────────────

const FOCUS_ICON: Record<
  WorkoutFocus,
  React.ComponentType<React.ComponentProps<typeof Barbell>>
> = {
  strength: Barbell,
  cardio: Fire,
  mobility: Heart,
}

const DEFAULT_PRESETS: WorkoutPresetCard[] = [
  {
    id: "p1",
    name: "Lift day",
    focus: "strength",
    duration: "45 min",
    steps: ["Warm up 5 min", "Squat 4×5", "Bench press 4×5", "Barbell row 3×8"],
  },
  {
    id: "p2",
    name: "Cardio day",
    focus: "cardio",
    duration: "35 min",
    steps: [
      "Warm up 5 min",
      "Zone 2 run 20 min",
      "Intervals 6 min",
      "Cool down 4 min",
    ],
  },
  {
    id: "p3",
    name: "Mobility day",
    focus: "mobility",
    duration: "25 min",
    steps: [
      "Breath work 2 min",
      "Joint flow 8 min",
      "Deep stretch 10 min",
      "Walk 5 min",
    ],
  },
]

const EMPTY_ROUTINE: Routine = {
  Mon: null,
  Tue: null,
  Wed: null,
  Thu: null,
  Fri: null,
  Sat: null,
  Sun: null,
}

const SLOT_PRESS_MS = 450
const PRESET_PRESS_MS = 3500

// ─── Persistence helper (defined inside component via closure, stub here) ─────
// The real `persist` is created inside Workouts() using the useMutation hook.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayDay(): Day {
  const map: Day[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return map[new Date().getDay()]
}

function dayFromDateKey(dateKey: string): Day {
  const map: Day[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const date = new Date(`${dateKey}T12:00:00Z`)
  return map[date.getUTCDay()]
}

function formatDateLabel(dateKey: string, todayKey: string) {
  if (dateKey === todayKey) return "Today"
  const yesterday = offsetDateKey(todayKey, -1)
  if (dateKey === yesterday) return "Yesterday"
  const date = new Date(`${dateKey}T12:00:00Z`)
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

import { calcStreak, calcWorkoutsThisWeek } from "@/lib/training-consistency"

function PresetSteps({
  preset,
  limit = 4,
}: {
  preset: WorkoutPresetCard
  limit?: number
}) {
  const visible = preset.steps.slice(0, limit)
  const hidden = Math.max(0, preset.steps.length - visible.length)

  return (
    <ol className="mt-3 divide-y divide-border border-y border-border">
      {visible.map((step, i) => (
        <li
          key={`${preset.id}-${step}-${i}`}
          className="flex min-h-11 items-center gap-3 py-2.5"
        >
          <span className="w-5 shrink-0 text-center text-[13px] font-medium text-muted-foreground">
            {i + 1}
          </span>
          <span className="min-w-0 truncate text-[15px] font-medium text-foreground">
            {step}
          </span>
        </li>
      ))}
      {hidden > 0 && (
        <li className="py-2 text-[13px] font-medium text-muted-foreground">
          +{hidden} more movement{hidden === 1 ? "" : "s"}
        </li>
      )}
    </ol>
  )
}

// ─── Confirm delete sheet ─────────────────────────────────────────────────────

function ConfirmDeleteSheet({
  title,
  description,
  confirmLabel,
  busyLabel,
  cancelLabel = "Keep it",
  onConfirm,
  onCancel,
}: {
  title: string
  description: string
  confirmLabel: string
  busyLabel: string
  cancelLabel?: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  async function confirm() {
    if (deleting) return
    setDeleting(true)
    try {
      await onConfirm()
    } catch {
      // onConfirm surfaces its own error toast.
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={deleting ? undefined : onCancel}
    >
      <div
        className="sheet-panel app-sheet-panel w-full max-w-sm border-t border-border bg-background px-5 pt-5"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => void confirm()}
            disabled={deleting}
            aria-busy={deleting}
            className="app-button app-button-danger h-12 w-full"
          >
            {deleting ? busyLabel : confirmLabel}
          </button>
          <button
            onClick={deleting ? undefined : onCancel}
            disabled={deleting}
            className="app-button app-button-quiet h-12 w-full"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Workout log summary card (used inside the carousel) ──────────────────────

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ""}`
}

function WorkoutLogSummary({
  log,
  slot,
  onEdit,
}: {
  log: CachedWorkoutLog
  slot: 1 | 2
  onEdit?: () => void
}) {
  const completedExercises = log.exercises.filter(
    (e) => hasCardioDetails(e.cardio) || (e.sets ?? []).some((s) => s.completed)
  )
  const totalSets = log.exercises.reduce(
    (acc, e) => acc + (e.sets ?? []).filter((s) => s.completed).length,
    0
  )
  const cardioCount = completedExercises.filter((e) =>
    hasCardioDetails(e.cardio)
  ).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold">Workout {slot}</span>
          <span className="text-[13px] text-muted-foreground">
            Complete · {fmtDuration(log.durationSeconds)}
          </span>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="app-icon-button h-10 w-10 bg-muted/45"
            aria-label="Edit workout"
          >
            <PencilSimple size={13} />
          </button>
        )}
      </div>

      <div className="divide-y divide-border border-y border-border">
        {completedExercises.map((ex) => {
          const isCardio = hasCardioDetails(ex.cardio)
          const done = (ex.sets ?? []).filter((s) => s.completed).length
          const total = ex.sets?.length ?? 0
          const id = getLoggedExerciseId(ex) ?? ex.name
          return (
            <div key={id} className="flex min-h-11 items-center gap-3 py-2.5">
              <span aria-hidden="true" className="text-[15px] text-primary">
                ✓
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">
                {ex.name}
              </span>
              <span className="max-w-[12rem] shrink truncate text-right text-[13px] text-muted-foreground tabular-nums">
                {isCardio
                  ? compactCardioSummary(ex.cardio, ex.cardio?.distanceUnit)
                  : `${done}/${total}`}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between text-[13px] text-muted-foreground">
        <span>
          {completedExercises.length} exercises · {totalSets} sets
          {cardioCount > 0 ? ` · ${cardioCount} cardio` : ""}
        </span>
        <span>
          {new Date(log.completedAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  )
}

// ─── Two-workout carousel ──────────────────────────────────────────────────────

function WorkoutLogCarousel({
  logs,
  onEdit,
}: {
  logs: [CachedWorkoutLog, CachedWorkoutLog]
  onEdit?: (slot: 1 | 2) => void
}) {
  const [slide, setSlide] = useState(0)
  const [touching, setTouching] = useState(false)
  const touchStartX = React.useRef(0)

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    setTouching(true)
  }
  function onTouchEnd(e: React.TouchEvent) {
    setTouching(false)
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) > 40) setSlide(delta > 0 ? 1 : 0)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Slides */}
      <div
        className="overflow-hidden rounded-xl"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex"
          style={{
            transform: `translateX(-${slide * 100}%)`,
            transition: touching
              ? "none"
              : "transform var(--motion-panel) var(--motion-ease-out)",
          }}
        >
          {logs.map((log, i) => (
            <div key={i} className="w-full shrink-0">
              <WorkoutLogSummary
                log={log}
                slot={(i + 1) as 1 | 2}
                onEdit={onEdit ? () => onEdit((i + 1) as 1 | 2) : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5">
        {logs.map((_, i) => (
          <button
            key={i}
            onClick={() => setSlide(i)}
            className={cn(
              "rounded-full transition-all duration-300",
              slide === i
                ? "h-1.5 w-4 bg-foreground/50"
                : "h-1.5 w-1.5 bg-foreground/20"
            )}
            aria-label={`Workout ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Pick second workout sheet ─────────────────────────────────────────────────

function PickSecondWorkoutSheet({
  presets,
  title = "Add second workout",
  onPick,
  onClose,
}: {
  presets: WorkoutPresetCard[]
  title?: string
  onPick: (presetId: string) => void
  onClose: () => void
}) {
  const FOCUS_ICON_LOCAL = FOCUS_ICON

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-2xl"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-foreground/[0.12]" />
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-[15px] font-semibold tracking-tight">{title}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors active:bg-muted"
          >
            <X size={12} weight="bold" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5 px-4 pb-1">
          {presets.map((preset) => {
            const Icon = FOCUS_ICON_LOCAL[preset.focus]
            return (
              <button
                key={preset.id}
                onClick={() => onPick(preset.id)}
                className="flex items-center gap-3 rounded-2xl bg-muted/40 px-4 py-3.5 text-left transition-colors active:bg-muted/70"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/70">
                  <Icon
                    size={14}
                    weight="duotone"
                    className="text-foreground/60"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{preset.name}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {preset.steps.length} exercises · {preset.duration}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type DragState = {
  presetId: string
  x: number
  y: number
  originX: number
  originY: number
}

// ─── Muscle volume card ──────────────────────────────────────────────────────

const MUSCLE_COLORS: Record<string, string> = { ...ONE_REP_MUSCLE_COLORS }

function muscleColor(muscle: string): string {
  return MUSCLE_COLORS[muscle.toLowerCase()] ?? APP_ACCENT_COLORS.neutral
}

function MuscleVolumeCard({ muscleVolume }: { muscleVolume: MuscleSets[] }) {
  if (muscleVolume.length === 0) {
    return (
      <div className="border-y border-border py-5 text-center">
        <p className="text-[15px] text-muted-foreground">
          No workouts logged this week yet
        </p>
      </div>
    )
  }

  const maxSets = Math.max(...muscleVolume.map((m) => m.effectiveSets))

  return (
    <section className="border-y border-border py-5">
      <div className="mb-3">
        <p className="app-section-title">Volume</p>
        <p className="app-section-subtitle">This week · sets per muscle</p>
      </div>
      <div className="flex flex-col gap-2.5">
        {muscleVolume.map((item) => {
          const pct = maxSets > 0 ? (item.effectiveSets / maxSets) * 100 : 0
          const color = muscleColor(item.muscle)
          return (
            <div key={item.muscle}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[15px] font-semibold text-foreground capitalize">
                  {item.muscle}
                </span>
                <span className="text-[13px] font-medium text-muted-foreground tabular-nums">
                  {item.primarySets} primary
                  {item.secondarySets > 0
                    ? ` + ${item.secondarySets} supporting`
                    : ""}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                <div
                  className="motion-progress-fill h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: color,
                    opacity: 0.74,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
        Supporting sets count as half a set when estimating muscle volume.
      </p>
    </section>
  )
}

export default function Workouts() {
  const navigate = useSmoothNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const trainingHeaderRef = useTourAnchor("training-header")
  const trainingStartRef = useTourAnchor("training-start")
  const todayKey = todayIso()
  const [dateKey, setDateKey] = useState(todayKey)
  const [dateSelectorOpen, setDateSelectorOpen] = useState(false)
  const isToday = dateKey === todayKey
  const dateLabel = formatDateLabel(dateKey, todayKey)

  /**
   * Asks how to log a past session before opening anything.
   *
   * Every "log a past workout" entry point funnels through this sheet so the
   * choice — describe it, or start from a preset — is made once, next to the
   * day it applies to, rather than being implied by which button was tapped.
   */
  const [logPastDate, setLogPastDate] = useState<string | null>(() =>
    searchParams.get("logPast")
  )
  const startRetroLog = useCallback((date: string) => {
    hapticMedium()
    setLogPastDate(date)
  }, [])

  // Consume `?logPast=` once. Leaving it in the URL would reopen the sheet
  // every time this tab is returned to.
  useEffect(() => {
    if (!searchParams.has("logPast")) return
    const next = new URLSearchParams(searchParams)
    next.delete("logPast")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  /** Straight into dictation: the retro logger opens with the sheet up. */
  const describeRetroLog = useCallback(
    (date: string) => {
      setLogPastDate(null)
      navigate(`/workout/log/${date}?describe=1`, { motion: "forward" })
    },
    [navigate]
  )

  /** The abridged preset logger: sets × reps per exercise, expandable. */
  const quickLogPreset = useCallback(
    (date: string, presetId: string) => {
      setLogPastDate(null)
      navigate(
        `/workout/log/${date}/quick?preset=${encodeURIComponent(presetId)}`,
        { motion: "forward" }
      )
    },
    [navigate]
  )

  /** Reopens a saved session so sets can be added or corrected. */
  const editRetroLog = useCallback(
    (date: string, sessionId?: string) => {
      if (!sessionId) {
        toast.error("This workout is too old to edit. Delete and re-log it.")
        return
      }
      hapticSelection()
      navigate(
        `/workout/log/${date}?sessionId=${encodeURIComponent(sessionId)}`,
        { motion: "forward" }
      )
    },
    [navigate]
  )

  // ── Convex ────────────────────────────────────────────────────────────────
  const serverPresets = useQuery(api.logs.presets.list)
  const schedule = useQuery(api.users.schedules.get)
  const selectedLog = useQuery(api.logs.workouts.getLog, { date: dateKey })
  const workoutHistory = useQuery(api.logs.workouts.getHistory)
  const setSchedule = useOfflineMutation(
    api.users.schedules.set,
    "users.schedules.set"
  )
  const createPresetMutation = useOfflineMutation(
    api.logs.presets.create,
    "logs.presets.create"
  )
  const removePresetMutation = useOfflineMutation(
    api.logs.presets.remove,
    "logs.presets.remove"
  )
  const removeWorkoutLog = useMutation(api.logs.workouts.remove)
  const replaceWorkoutLog = useOfflineMutation(
    api.logs.workouts.completion,
    "logs.workouts.completion"
  )

  /**
   * Rest days, so a day the user deliberately took off reads as one rather
   * than as an empty accusation. Ninety days covers everything the date
   * picker can reach in practice.
   */
  const restSince = useMemo(() => offsetDateKey(todayKey, -90), [todayKey])
  const restDates = useQuery(api.logs.restDays.listSince, {
    since: restSince,
  }) as string[] | undefined
  const markRestDays = useMutation(api.logs.restDays.mark)
  const unmarkRestDays = useMutation(api.logs.restDays.unmark)
  const isRestDay = Boolean(restDates?.includes(dateKey))

  async function toggleRestDay(date: string) {
    hapticSelection()
    try {
      if (restDates?.includes(date)) {
        await unmarkRestDays({ dates: [date] })
      } else {
        await markRestDays({ dates: [date], source: "manual" })
      }
    } catch {
      toast.error("Couldn't save that. Try again.")
    }
  }

  async function persist(
    nextPresets: WorkoutPresetCard[],
    nextRoutine: Routine,
    nextRoutine2: Routine = routine2
  ) {
    await setSchedule({
      routine: scheduleRoutinePayload(nextRoutine, nextRoutine2),
      presetOrder: nextPresets.map((p) => p.id),
    })
  }

  // ── Preset ordering (local, synced once from server) ──────────────────────
  const [localOrder, setLocalOrder] = useState<string[]>([])
  const [duplicatingPresetId, setDuplicatingPresetId] = useState<string | null>(
    null
  )
  const orderReady = useRef(false)

  useEffect(() => {
    if (
      orderReady.current ||
      schedule === undefined ||
      serverPresets === undefined
    )
      return
    orderReady.current = true
    const srv = schedule?.presetOrder ?? []
    setLocalOrder(
      srv.length > 0 ? srv : serverPresets.map((p) => p._id as string)
    )
  }, [schedule, serverPresets])

  // Merge new/deleted presets from server into local order
  useEffect(() => {
    if (!serverPresets || !orderReady.current) return
    const ids = new Set(serverPresets.map((p) => p._id as string))
    setLocalOrder((prev) => {
      const next = prev.filter((id) => ids.has(id))
      for (const p of serverPresets) {
        if (!next.includes(p._id as string)) next.push(p._id as string)
      }
      return next
    })
  }, [serverPresets])

  const presets: WorkoutPresetCard[] = useMemo(() => {
    if (!serverPresets) return DEFAULT_PRESETS
    const byId = new Map<string, WorkoutPresetCard>(
      serverPresets.map(
        (p) =>
          [
            p._id as string,
            normalizePresetCard({
              id: p._id as string,
              name: p.name,
              focus: p.focus,
              duration: p.duration,
              steps: p.steps,
            }),
          ] as const
      )
    )
    const result: WorkoutPresetCard[] = []
    for (const id of localOrder) {
      const p = byId.get(id)
      if (p) result.push(p)
    }
    for (const p of serverPresets) {
      if (!localOrder.includes(p._id as string))
        result.push(
          normalizePresetCard({
            id: p._id as string,
            name: p.name,
            focus: p.focus,
            duration: p.duration,
            steps: p.steps,
          })
        )
    }
    return result
  }, [serverPresets, localOrder])

  // ── Routine (local, synced once from server) ──────────────────────────────
  const [routine, setRoutine] = useState<Routine>(EMPTY_ROUTINE)
  const routineReady = useRef(false)

  useEffect(() => {
    // schedule === undefined means still loading; null means loaded but no data yet
    if (routineReady.current || schedule === undefined) return
    routineReady.current = true
    if (schedule) {
      const routines = normalizeScheduleRoutines(schedule.routine)
      setRoutine(routines.primary)
      setRoutine2(routines.secondary)
    }
  }, [schedule])

  const [routine2, setRoutine2] = useState<Routine>(EMPTY_ROUTINE)

  const syncing = serverPresets === undefined
  const workoutLogs: CachedWorkoutLog[] = (selectedLog ??
    []) as unknown as CachedWorkoutLog[]
  const selectedWorkoutLog = workoutLogs[0] ?? null

  const [routineEditMode, setRoutineEditMode] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(true)
  const [showSecondWorkoutSheet, setShowSecondWorkoutSheet] = useState(false)
  const [pickRoutineDay, setPickRoutineDay] = useState<Day | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const [drag, setDrag] = useState<DragState | null>(null)
  const [overDay, setOverDay] = useState<Day | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const [pressingDay, setPressingDay] = useState<Day | null>(null)
  const [removingDays, setRemovingDays] = useState<Set<Day>>(new Set())
  const slotPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pressingPreset, setPressingPreset] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteWorkout, setConfirmDeleteWorkout] = useState(false)
  const presetPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const slotRefs = useRef<Partial<Record<Day, HTMLDivElement | null>>>({})
  const presetRefs = useRef<(HTMLDivElement | null)[]>([])

  const today = isToday ? todayDay() : dayFromDateKey(dateKey)
  const todayPreset = presets.find((p) => p.id === routine[today]) ?? null
  const todayPreset2 = presets.find((p) => p.id === routine2[today]) ?? null

  useEffect(() => {
    if (syncing) return
    const scheduled = [todayPreset, todayPreset2].filter(
      (preset): preset is WorkoutPresetCard => Boolean(preset)
    )
    const exerciseNames = scheduled
      .flatMap((preset) => preset.steps)
      .slice(0, 5)
    const totalSets = scheduled.reduce((sum, preset) => {
      const source = serverPresets?.find(
        (candidate) => String(candidate.id ?? candidate._id) === preset.id
      )
      const exerciseData = (source?.exerciseData ?? {}) as Record<
        string,
        { sets?: unknown[] }
      >
      return (
        sum +
        Object.values(exerciseData).reduce(
          (setSum, exercise) => setSum + (exercise.sets?.length ?? 0),
          0
        )
      )
    }, 0)
    void updateOneRepWidgets({
      workoutExercises:
        exerciseNames.length > 0
          ? exerciseNames.join(" · ")
          : "No workout scheduled",
      workoutBrief:
        exerciseNames.length > 0
          ? `${exerciseNames.length} exercises · ${totalSets} sets`
          : "Recovery day",
    })
  }, [serverPresets, syncing, todayPreset, todayPreset2])

  const workoutDates = useMemo<Set<string>>(() => {
    if (!workoutHistory) return new Set<string>()
    return new Set<string>(workoutHistory.map((log) => log.date as string))
  }, [workoutHistory])

  // ── Muscle analytics ─────────────────────────────────────────────────────
  const [exerciseCatalog, setExerciseCatalog] = useState<
    Map<
      string,
      { id: string; primaryMuscles?: string[]; secondaryMuscles?: string[] }
    >
  >(new Map())
  const catalogFetched = useRef<string>("")

  const workoutRecords = useMemo(() => {
    if (!workoutHistory) return []
    return toWorkoutLogRecords(workoutHistory as WorkoutHistoryLog[])
  }, [workoutHistory])

  const analyticsExerciseIds = useMemo(() => {
    const ids = new Set<string>()
    for (const log of workoutRecords) {
      for (const exercise of log.exercises) {
        ids.add(exercise.id)
        if (ids.size >= 100) return Array.from(ids)
      }
    }
    return Array.from(ids)
  }, [workoutRecords])

  useEffect(() => {
    const key = [...analyticsExerciseIds].sort().join(",")
    if (!key) {
      catalogFetched.current = ""
      setExerciseCatalog(new Map())
      return
    }
    if (key === catalogFetched.current) return

    catalogFetched.current = key
    void resolveExerciseIds(analyticsExerciseIds).then((result) => {
      const map = new Map<string, Exercise>()
      for (const [id, ex] of Object.entries(result)) {
        map.set(id, { ...ex, id })
      }
      setExerciseCatalog(map)
    })
  }, [analyticsExerciseIds])

  const muscleVolume = useMemo(() => {
    if (workoutRecords.length === 0 || exerciseCatalog.size === 0) return []
    const catalog = buildCatalogMap(Array.from(exerciseCatalog.values()))
    return computeWeeklyMuscleVolume(workoutRecords, catalog, new Date())
  }, [workoutRecords, exerciseCatalog])

  const muscleRecovery = useMemo(() => {
    if (workoutRecords.length === 0 || exerciseCatalog.size === 0) return []
    const catalog = buildCatalogMap(Array.from(exerciseCatalog.values()))
    return computeMuscleRecovery(workoutRecords, catalog, new Date())
  }, [workoutRecords, exerciseCatalog])

  const trainingStatsDate = useMemo(() => {
    const date = new Date()
    date.setUTCHours(12, 0, 0, 0)
    return date
  }, [])
  const trainingStreak = calcStreak(workoutDates, trainingStatsDate)
  const workoutsThisWeek = calcWorkoutsThisWeek(workoutDates, trainingStatsDate)

  const hasMoved =
    drag !== null &&
    (Math.abs(drag.x - drag.originX) > 6 || Math.abs(drag.y - drag.originY) > 6)

  // ── Routine slot removal ──────────────────────────────────────────────────

  function removeSlot(day: Day) {
    setRemovingDays((s) => new Set(s).add(day))
    setTimeout(() => {
      // Remove slot 2 first if it has something; otherwise remove slot 1
      if (routine2[day]) {
        setRoutine2((r) => {
          const next = { ...r, [day]: null }
          void persist(presets, routine, next)
          return next
        })
      } else {
        setRoutine((r) => {
          const next = { ...r, [day]: null }
          void persist(presets, next)
          return next
        })
      }
      setRemovingDays((s) => {
        const n = new Set(s)
        n.delete(day)
        return n
      })
    }, 220)
  }

  function onSlotPressStart(day: Day) {
    if (!routineEditMode || (!routine[day] && !routine2[day])) return
    setPressingDay(day)
    slotPressTimer.current = setTimeout(() => {
      setPressingDay(null)
      removeSlot(day)
    }, SLOT_PRESS_MS)
  }

  function onSlotPressEnd() {
    if (slotPressTimer.current) {
      clearTimeout(slotPressTimer.current)
      slotPressTimer.current = null
    }
    setPressingDay(null)
  }

  // ── Hit detection ─────────────────────────────────────────────────────────

  function hitDay(x: number, y: number): Day | null {
    for (const day of DAYS) {
      const el = slotRefs.current[day]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return day
    }
    return null
  }

  function hitPresetIdx(y: number): number | null {
    for (let i = 0; i < presetRefs.current.length; i++) {
      const el = presetRefs.current[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (y >= r.top && y <= r.bottom) return i
    }
    return null
  }

  // ── Preset drag / long-press ──────────────────────────────────────────────

  function onPresetPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    presetId: string
  ) {
    if (!routineEditMode) return
    e.currentTarget.setPointerCapture(e.pointerId)

    setPressingPreset(presetId)
    presetPressTimer.current = setTimeout(() => {
      setPressingPreset(null)
      setConfirmDeleteId(presetId)
    }, PRESET_PRESS_MS)

    setDrag({
      presetId,
      x: e.clientX,
      y: e.clientY,
      originX: e.clientX,
      originY: e.clientY,
    })
  }

  function onPresetPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return
    const x = e.clientX,
      y = e.clientY
    setDrag((d) => (d ? { ...d, x, y } : null))

    if (
      (Math.abs(x - drag.originX) > 6 || Math.abs(y - drag.originY) > 6) &&
      presetPressTimer.current
    ) {
      clearTimeout(presetPressTimer.current)
      presetPressTimer.current = null
      setPressingPreset(null)
    }

    if (hasMoved) {
      const day = hitDay(x, y)
      setOverDay(day)
      setDragOverIdx(day ? null : hitPresetIdx(y))
    }
  }

  function onPresetPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (presetPressTimer.current) {
      clearTimeout(presetPressTimer.current)
      presetPressTimer.current = null
    }
    setPressingPreset(null)

    if (drag && hasMoved) {
      hapticMedium()
      const day = hitDay(e.clientX, e.clientY)

      if (day) {
        if (!routine[day]) {
          // Slot 1 is empty — fill it
          const nextRoutine = { ...routine, [day]: drag.presetId }
          setRoutine(nextRoutine)
          void persist(presets, nextRoutine)
        } else {
          // Slot 1 is taken — fill (or replace) slot 2
          setRoutine2((r) => {
            const next = { ...r, [day]: drag.presetId }
            void persist(presets, routine, next)
            return next
          })
        }
      } else {
        // Reorder within the presets list
        const toIdx = hitPresetIdx(e.clientY)
        if (toIdx !== null) {
          const from = presets.findIndex((p) => p.id === drag.presetId)
          if (from !== -1 && from !== toIdx) {
            const next = [...presets]
            const [item] = next.splice(from, 1)
            next.splice(toIdx, 0, item)
            setLocalOrder(next.map((p) => p.id))
            persist(next, routine)
          }
        }
      }
    }

    setDrag(null)
    setOverDay(null)
    setDragOverIdx(null)
  }

  // ── Delete confirmed ──────────────────────────────────────────────────────

  async function duplicatePreset(preset: WorkoutPresetCard) {
    if (duplicatingPresetId !== null) return
    const source = serverPresets?.find(
      (item) => (item._id as string) === preset.id
    )
    setDuplicatingPresetId(preset.id)
    try {
      await createPresetMutation({
        name: `${preset.name} copy`,
        items: (source?.items as unknown[]) ?? [],
        exerciseData: source?.exerciseData ?? {},
        focus: source?.focus ?? preset.focus,
        duration: source?.duration ?? preset.duration,
        steps: source?.steps ?? preset.steps,
      })
      hapticMedium()
      toast.success(`${preset.name} duplicated`)
    } catch {
      toast.error("Could not duplicate this preset")
    } finally {
      setDuplicatingPresetId(null)
    }
  }

  async function deletePreset(id: string) {
    const nextPresets = presets.filter((p) => p.id !== id)
    const nextRoutine = { ...routine }
    const nextRoutine2 = { ...routine2 }
    for (const day of DAYS) {
      if (nextRoutine[day] === id) nextRoutine[day] = null
      if (nextRoutine2[day] === id) nextRoutine2[day] = null
    }

    const previousOrder = localOrder
    const previousRoutine = routine
    const previousRoutine2 = routine2

    setLocalOrder(nextPresets.map((p) => p.id))
    setRoutine(nextRoutine)
    setRoutine2(nextRoutine2)
    try {
      await persist(nextPresets, nextRoutine, nextRoutine2)
      await removePresetMutation({ id: id as Id<"presets"> })
    } catch (error) {
      // Roll the optimistic update back so the list matches the server.
      setLocalOrder(previousOrder)
      setRoutine(previousRoutine)
      setRoutine2(previousRoutine2)
      toast.error(
        error instanceof Error ? error.message : "Could not delete preset"
      )
      return
    }
    hapticMedium()
    toast.success("Preset deleted")
    setConfirmDeleteId(null)
  }

  async function deleteSelectedWorkout() {
    const id = selectedWorkoutLog?._id as Id<"workoutLogs"> | undefined
    if (!id) return
    hapticMedium()
    try {
      await removeWorkoutLog({ id })
      toast.success("Workout removed")
    } catch {
      toast.error("Could not remove workout")
    }
  }

  function removeLoggedExercise(exerciseKey: string) {
    if (!selectedWorkoutLog) return
    const nextExercises = selectedWorkoutLog.exercises
      .filter((exercise) => {
        const key = getLoggedExerciseId(exercise) ?? exercise.name
        return key !== exerciseKey
      })
      .map((exercise) => ({
        id: getLoggedExerciseId(exercise) ?? exercise.name,
        name: exercise.name,
        ...(exercise.category ? { category: exercise.category } : {}),
        sets: (exercise.sets ?? []).map((set) => ({
          type: "type" in set ? String(set.type) : "normal",
          reps: Number(set.reps) || 0,
          weight: Number(set.weight) || 0,
          completed: Boolean(set.completed),
        })),
        ...(exercise.cardio ? { cardio: exercise.cardio } : {}),
      }))
    if (nextExercises.length === 0) {
      void deleteSelectedWorkout()
      return
    }
    void replaceWorkoutLog({
      date: dateKey,
      ...(selectedWorkoutLog.sessionId
        ? { sessionId: selectedWorkoutLog.sessionId }
        : {}),
      ...(selectedWorkoutLog.slot ? { slot: selectedWorkoutLog.slot } : {}),
      exercises: nextExercises,
      durationSeconds: selectedWorkoutLog.durationSeconds,
    })
  }

  const heroTitle =
    workoutLogs.length === 2
      ? "Training complete"
      : workoutLogs.length === 1
        ? todayPreset2
          ? todayPreset2.name
          : "One workout logged"
        : todayPreset
          ? todayPreset.name
          : "Rest day"
  const heroDetail =
    workoutLogs.length === 2
      ? "Both workout slots are complete today."
      : workoutLogs.length === 1
        ? todayPreset2
          ? `Next: ${todayPreset2.duration}`
          : "Add a second session if today needs one."
        : todayPreset
          ? `${todayPreset.steps.length} exercises · ${todayPreset.duration}`
          : "No workout scheduled. Log an open session anytime."
  const nextWorkoutPreset =
    workoutLogs.length === 1 && todayPreset2 ? todayPreset2 : todayPreset
  const nextWorkoutHref = nextWorkoutPreset
    ? `/workout/active/${nextWorkoutPreset.id}${workoutLogs.length === 1 ? "?slot=2" : ""}`
    : "/workout/active"
  const nextWorkoutAction =
    workoutLogs.length === 1 && todayPreset2
      ? `Start ${todayPreset2.name}`
      : nextWorkoutPreset
        ? `Start ${nextWorkoutPreset.name}`
        : "Start open workout"
  // The week's own plan is the denominator: a five-day routine shouldn't be
  // graded against seven. An empty schedule falls back to a plain five.
  const scheduledDaysThisWeek =
    DAYS.filter((day) => Boolean(routine[day])).length || 5
  const weekFill = Math.min(
    100,
    Math.round((workoutsThisWeek / scheduledDaysThisWeek) * 100)
  )
  // Effective sets logged this week, against a plain twelve per scheduled
  // session — enough to mean something, not so many it reads as a scolding.
  const weeklyEffectiveSets = Math.round(
    muscleVolume.reduce((sum, entry) => sum + entry.effectiveSets, 0)
  )
  const weeklySetTarget = scheduledDaysThisWeek * 12
  // Muscles that have had time to come back. A muscle still marked `trained`
  // is one you hit recently enough that it hasn't.
  const recoveredMuscles = muscleRecovery.filter(
    (entry) => entry.status !== "trained"
  ).length
  // Four readings hung on the lower arc of the hold dial. Order matters:
  // they run left to right along the crown.
  const heroStats = [
    {
      name: "Week",
      value: workoutsThisWeek,
      target: scheduledDaysThisWeek,
      suffix: "",
      color: APP_ACCENT_COLORS.neutral,
    },
    {
      name: "Sets",
      value: weeklyEffectiveSets,
      target: weeklySetTarget,
      suffix: "",
      color: APP_ACCENT_COLORS.workout,
    },
    {
      name: "Ready",
      value: recoveredMuscles,
      target: Math.max(1, muscleRecovery.length),
      suffix: "",
      color: APP_ACCENT_COLORS.complete,
    },
    {
      name: "Streak",
      value: trainingStreak,
      target: Math.max(7, trainingStreak),
      suffix: "d",
      color: APP_ACCENT_COLORS.progress,
    },
  ]

  // Days since the last completed session — the number that quietly explains
  // why a streak of zero isn't the same as never having trained.
  const daysSinceLastWorkout = (() => {
    for (let back = 0; back <= 30; back++) {
      if (workoutDates.has(offsetDateKey(todayKey, -back))) return back
    }
    return null
  })()
  // ── Ghost ─────────────────────────────────────────────────────────────────

  const ghostPreset = drag ? presets.find((p) => p.id === drag.presetId) : null
  const GhostIcon = ghostPreset ? FOCUS_ICON[ghostPreset.focus] : null

  return (
    <div
      className={cn(
        "desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72",
        // The wash starts at the very top of the page so the title row sits
        // inside the same field as the dials, and it deepens as the week fills.
        isToday && "app-hero"
      )}
      style={
        isToday
          ? ({
              "--hero-fill": weekFill,
              "--hero-accent": "var(--accent-training-hero)",
            } as CSSProperties)
          : undefined
      }
    >
      {isToday && <span className="app-hero-wash" aria-hidden="true" />}
      <main className="app-page">
        <header className="app-header" ref={trainingHeaderRef}>
          <div className="min-w-0">
            <h1 className="app-title">Training</h1>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <DateSelectorButton
              onInteract={hapticSelection}
              value={dateKey}
              todayKey={todayKey}
              onChange={setDateKey}
              open={dateSelectorOpen}
              onOpenChange={setDateSelectorOpen}
              label="Workout date"
            />
          </div>
        </header>

        {!isToday && (
          <section className="border-y border-border py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-muted-foreground">
                  {dateLabel}
                </p>
                <h2 className="mt-1 text-[1.55rem] leading-none font-bold">
                  {selectedWorkoutLog
                    ? "Workout logged"
                    : isRestDay
                      ? "Rest day"
                      : "No workout"}
                </h2>
                <p className="mt-2 text-[15px] text-muted-foreground">
                  {selectedWorkoutLog
                    ? `${selectedWorkoutLog.exercises.length} exercises · ${fmtDuration(selectedWorkoutLog.durationSeconds)}`
                    : isRestDay
                      ? "You called this one off on purpose."
                      : "No completed training on this date."}
                </p>
                {!selectedWorkoutLog && (
                  <button
                    type="button"
                    onClick={() => void toggleRestDay(dateKey)}
                    className="mt-3 inline-flex min-h-11 items-center text-[14px] font-semibold text-muted-foreground transition-colors active:text-foreground"
                  >
                    {isRestDay ? "Not a rest day" : "Mark as rest day"}
                  </button>
                )}
              </div>
              {selectedWorkoutLog && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteWorkout(true)}
                  className="app-header-icon-action text-destructive/70"
                  aria-label="Delete workout log"
                >
                  <Trash size={13} weight="bold" />
                </button>
              )}
            </div>

            {selectedWorkoutLog ? (
              <div className="mt-4 divide-y divide-border border-t border-border">
                {selectedWorkoutLog.exercises.map((exercise) => {
                  const isCardio = hasCardioDetails(exercise.cardio)
                  const done = (exercise.sets ?? []).filter(
                    (set) => set.completed
                  ).length
                  const total = exercise.sets?.length ?? 0
                  const key = getLoggedExerciseId(exercise) ?? exercise.name
                  return (
                    <div
                      key={key}
                      className="workout-history-row flex min-h-12 items-center justify-between gap-2 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">
                          {exercise.name}
                        </p>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          {isCardio
                            ? compactCardioSummary(
                                exercise.cardio,
                                exercise.cardio?.distanceUnit
                              )
                            : `${done}/${total} sets`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLoggedExercise(key)}
                        className="app-header-icon-action h-11 min-h-11 w-11 min-w-11 text-destructive"
                        aria-label={`Remove ${exercise.name}`}
                      >
                        <Trash size={12} weight="bold" />
                      </button>
                    </div>
                  )
                })}
                <p className="pt-3 text-[13px] text-muted-foreground">
                  Completed{" "}
                  {new Date(selectedWorkoutLog.completedAt).toLocaleTimeString(
                    [],
                    { hour: "numeric", minute: "2-digit" }
                  )}
                </p>
                <div className="flex flex-col gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      editRetroLog(dateKey, selectedWorkoutLog.sessionId)
                    }
                    className="motion-tactile h-[46px] w-full rounded-[18px] bg-muted/60 text-[14px] font-semibold transition-opacity active:opacity-80"
                  >
                    Add to this workout
                  </button>
                  {workoutLogs.length < 2 && (
                    <button
                      type="button"
                      onClick={() => startRetroLog(dateKey)}
                      className="motion-tactile h-[46px] w-full rounded-[18px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35 active:text-foreground"
                    >
                      Log a second session
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-[15px] leading-6 text-muted-foreground">
                  Trained without your phone? Add it now.
                </p>
                <button
                  type="button"
                  onClick={() => startRetroLog(dateKey)}
                  className="motion-tactile mt-3 h-[52px] w-full rounded-[20px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-80"
                >
                  Log this workout
                </button>
              </div>
            )}
          </section>
        )}

        {!isToday ? null : (
          <>
            {/* Same instrument as the nutrition hero, hung differently: the
                thing you act on takes the middle and the two readings hang
                off its lower edge, so the hold dial is the only thing at eye
                level. The centre is held, not read. */}
            <section
              className="app-hero-frame progress-tab-enter relative flex flex-col justify-center pt-3 pb-4 text-center"
              aria-labelledby="next-training-title"
            >
              <p className="text-[13px] font-medium text-muted-foreground">
                Today · {today}
              </p>
              <h2
                id="next-training-title"
                className="mt-1.5 text-[2.4rem] leading-none font-extrabold tracking-tight"
              >
                {heroTitle}
              </h2>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                {heroDetail}
              </p>

              {/* A crown, not a row: the thing you act on holds the centre
                  at eye level and the four readings ring its lower arc, so
                  the hero can carry twice the instrumentation without
                  turning into a row of widgets. */}
              <div
                className="relative mx-auto mt-7 mb-1"
                style={{ width: 280, height: 226 }}
              >
                {HERO_SATELLITES.map((satellite, index) => {
                  const stat = heroStats[index]
                  if (!stat) return null
                  const radians = (satellite.angle * Math.PI) / 180
                  return (
                    <div
                      key={stat.name}
                      className="absolute z-0"
                      style={{
                        left: 140 + HERO_ORBIT_RADIUS * Math.cos(radians) - 39,
                        top: 84 + HERO_ORBIT_RADIUS * Math.sin(radians) - 39,
                      }}
                    >
                      <TrainingStatDial
                        name={stat.name}
                        value={stat.value}
                        target={stat.target}
                        suffix={stat.suffix}
                        color={stat.color}
                        size={78}
                        stroke={6}
                        mirrored={satellite.mirrored}
                      />
                    </div>
                  )
                })}
                <div
                  className="absolute z-10"
                  style={{ left: 140 - 84, top: 0 }}
                >
                  {workoutLogs.length < 2 ? (
                    <HoldToStartDial
                      label={nextWorkoutAction}
                      detail={
                        nextWorkoutPreset
                          ? nextWorkoutPreset.duration
                          : undefined
                      }
                      onComplete={() => navigate(nextWorkoutHref)}
                      size={168}
                      stroke={9}
                      color="var(--accent-training-hero)"
                    />
                  ) : (
                    <TrainingStatDial
                      name="Sessions"
                      value={workoutLogs.length}
                      target={2}
                      color={APP_ACCENT_COLORS.complete}
                      size={168}
                      stroke={9}
                    />
                  )}
                </div>
              </div>

              <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
                {daysSinceLastWorkout === null
                  ? "No sessions in the last month"
                  : daysSinceLastWorkout === 0
                    ? "Last session today"
                    : `Last session ${daysSinceLastWorkout} day${daysSinceLastWorkout === 1 ? "" : "s"} ago`}
              </p>

              {workoutLogs.length < 2 && (
                <button
                  type="button"
                  onClick={() => startRetroLog(offsetDateKey(todayKey, -1))}
                  className="motion-tactile mt-3 h-11 w-full rounded-[18px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35 active:text-foreground"
                >
                  Log a past workout
                </button>
              )}
            </section>

            <section className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:mt-3">
              <div className="grid min-w-0 content-start gap-3">
                {workoutLogs.length > 0 && (
                  <section className="border-y border-border py-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="app-section-title">Today's workout</p>
                        <p className="app-section-subtitle">
                          {workoutLogs.length === 2
                            ? "Both sessions complete"
                            : workoutLogs.length === 1
                              ? "Session one complete"
                              : todayPreset
                                ? todayPreset.duration
                                : "Open training"}
                        </p>
                      </div>
                      {workoutLogs.length === 1 && (
                        <span className="text-[13px] font-medium text-muted-foreground">
                          1 of 2 complete
                        </span>
                      )}
                    </div>

                    {workoutLogs.length === 2 ? (
                      <WorkoutLogCarousel
                        logs={
                          workoutLogs as [CachedWorkoutLog, CachedWorkoutLog]
                        }
                        onEdit={(editSlot) =>
                          editRetroLog(
                            dateKey,
                            workoutLogs[editSlot - 1]?.sessionId
                          )
                        }
                      />
                    ) : workoutLogs.length === 1 ? (
                      <div className="space-y-3.5">
                        <WorkoutLogSummary
                          log={workoutLogs[0]}
                          slot={1}
                          onEdit={() =>
                            editRetroLog(dateKey, workoutLogs[0]?.sessionId)
                          }
                        />

                        {todayPreset2 ? (
                          <div className="border-t border-border/35 pt-3.5">
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-[15px] font-bold">
                                  {todayPreset2.name}
                                </p>
                                <p className="mt-0.5 text-[13px] text-muted-foreground/56">
                                  Workout 2 · {todayPreset2.duration}
                                </p>
                              </div>
                            </div>
                            <PresetSteps preset={todayPreset2} limit={3} />
                            <div className="mt-3">
                              <SwipeToStart
                                onComplete={() =>
                                  navigate(
                                    `/workout/active/${todayPreset2.id}?slot=2`
                                  )
                                }
                                label="Start second workout"
                                variant="default"
                              />
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowSecondWorkoutSheet(true)}
                            className="app-empty w-full justify-center py-3 text-[13px] font-semibold transition-colors active:bg-muted/20 active:text-foreground"
                          >
                            <Plus size={13} weight="bold" />
                            Add second workout
                          </button>
                        )}
                      </div>
                    ) : (
                      <></>
                    )}
                  </section>
                )}

                <section className="py-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="app-section-title">Routine</p>
                      <p className="app-section-subtitle">
                        Drag presets while editing
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRoutineEditMode((value) => !value)}
                        className={cn(
                          "app-button transition-colors",
                          routineEditMode
                            ? "app-button-primary"
                            : "app-button-quiet",
                          "sm:bg-none"
                        )}
                      >
                        {routineEditMode ? "Done" : "Edit routine"}
                      </button>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap justify-center gap-2.5 pb-1 md:grid md:grid-cols-7 md:justify-stretch md:gap-2.5 md:pb-0">
                      {DAYS.map((day) => {
                        const preset =
                          presets.find((p) => p.id === routine[day]) ?? null
                        const preset2 =
                          presets.find((p) => p.id === routine2[day]) ?? null
                        const isToday = day === today
                        const isOver =
                          overDay === day && hasMoved && routineEditMode
                        const isSlot2Drop = isOver && !!preset
                        const isRemoving = removingDays.has(day)
                        const isPressing = pressingDay === day
                        const FocusIcon = preset
                          ? FOCUS_ICON[preset.focus]
                          : null
                        const FocusIcon2 = preset2
                          ? FOCUS_ICON[preset2.focus]
                          : null

                        return (
                          <div
                            key={day}
                            ref={(el) => {
                              slotRefs.current[day] = el
                            }}
                            className={cn(
                              "motion-card relative flex min-h-[6rem] min-w-0 basis-[calc((100%-1rem)/3)] flex-col items-center justify-center gap-2 overflow-hidden rounded-[20px] border border-border/55 bg-card px-2 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.05)] transition-[transform,background-color,border-color,box-shadow] min-[430px]:basis-[calc((100%-1.5rem)/4)] md:min-h-[6.25rem] md:basis-auto md:px-2 md:py-3.5",
                              isToday &&
                                !isOver &&
                                "border-foreground/20 bg-foreground/[0.055] shadow-[0_10px_32px_rgba(0,0,0,0.075)]",
                              isOver &&
                                "scale-[1.035] border-foreground/30 bg-foreground/[0.08] shadow-lg"
                            )}
                          >
                            {isPressing && (
                              <div
                                className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-destructive"
                                style={{
                                  animation: `sweep-delete ${SLOT_PRESS_MS}ms linear forwards`,
                                }}
                              />
                            )}

                            {isSlot2Drop && (
                              <div className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[13px] font-bold text-background">
                                +2
                              </div>
                            )}

                            {routineEditMode && (preset || preset2) && (
                              <button
                                type="button"
                                onClick={() => removeSlot(day)}
                                className="app-icon-button absolute top-1 right-1 z-10 h-8 w-8 bg-background/80 text-destructive md:top-1.5 md:right-1.5 md:h-9 md:w-9"
                                aria-label={`Remove workout from ${day}`}
                              >
                                <X size={11} weight="bold" />
                              </button>
                            )}

                            <span
                              className={cn(
                                "text-[12px] font-bold tracking-[0.06em] uppercase",
                                isToday
                                  ? "text-foreground"
                                  : "text-muted-foreground/62"
                              )}
                            >
                              {day}
                            </span>

                            {preset && FocusIcon ? (
                              <button
                                type="button"
                                onPointerDown={() => onSlotPressStart(day)}
                                onPointerUp={onSlotPressEnd}
                                onPointerLeave={onSlotPressEnd}
                                onPointerCancel={onSlotPressEnd}
                                className={cn(
                                  "motion-tactile flex w-full flex-col items-center gap-0 rounded-xl transition-all duration-200 active:scale-[0.97]",
                                  isRemoving && "opacity-0"
                                )}
                              >
                                <div className="flex w-full flex-col items-center gap-1 pb-1">
                                  <FocusIcon
                                    size={preset2 ? 12 : 16}
                                    weight="duotone"
                                    className="text-foreground/55"
                                  />
                                  <span
                                    className={cn(
                                      "max-w-full truncate px-1 text-center leading-tight font-bold text-foreground/72",
                                      preset2
                                        ? "text-[13px] md:text-[13px]"
                                        : "text-[13px] md:text-[13px]"
                                    )}
                                  >
                                    {preset.name}
                                  </span>
                                </div>

                                {preset2 && FocusIcon2 && (
                                  <div className="flex w-full animate-in flex-col items-center gap-1 duration-200 fade-in-0 slide-in-from-bottom-1">
                                    <div className="mb-1 h-px w-7 rounded-full bg-border/55 md:w-[54px]" />
                                    <FocusIcon2
                                      size={12}
                                      weight="duotone"
                                      className="text-foreground/55"
                                    />
                                    <span className="max-w-full truncate px-1 text-center text-[13px] leading-tight font-bold text-foreground/72 md:text-[13px]">
                                      {preset2.name}
                                    </span>
                                  </div>
                                )}
                              </button>
                            ) : routineEditMode ? (
                              <button
                                type="button"
                                onClick={() => setPickRoutineDay(day)}
                                className="motion-tactile flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[13px] font-bold text-muted-foreground/62 transition-colors active:scale-[0.96] active:text-foreground md:min-h-10"
                              >
                                <Plus size={14} weight="bold" />
                                Add
                              </button>
                            ) : (
                              <span className="py-1.5 text-[13px] font-medium text-muted-foreground/70">
                                Rest
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </section>

                <AnimatedAccordion
                  summary="Training insights"
                  className="border-y border-border"
                  triggerClassName="min-h-14 text-[15px] font-semibold"
                  contentClassName="grid gap-4 pb-4"
                >
                  <MuscleVolumeCard muscleVolume={muscleVolume} />
                  <div>
                    <div className="mb-2 px-1">
                      <p className="app-section-title">Muscle recovery</p>
                      <p className="app-section-subtitle">
                        Estimate from your latest completed sets
                      </p>
                    </div>
                    <MuscleRecoveryHeatmapCard
                      muscleRecovery={muscleRecovery}
                    />
                  </div>
                </AnimatedAccordion>
              </div>

              <div className="grid min-w-0 content-start gap-3">
                <section className="border-y border-border py-6">
                  <div
                    className={cn(
                      "flex items-center justify-between gap-3 transition-[margin] duration-300 ease-out",
                      presetsOpen && "mb-5"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="app-section-title">Presets</p>
                      <p className="app-section-subtitle">
                        Your reusable training sessions
                      </p>
                    </div>
                    <TourAnchor anchor="training-build" className="shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          hapticSelection()
                          navigate("/workouts/new")
                        }}
                        className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                      >
                        <Plus size={14} weight="bold" />
                        New preset
                      </button>
                    </TourAnchor>
                    <button
                      type="button"
                      onClick={() => setPresetsOpen((open) => !open)}
                      className="app-icon-button h-10 w-10 shrink-0 bg-transparent text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                      aria-expanded={presetsOpen}
                      aria-controls="workout-presets-list"
                      aria-label={
                        presetsOpen ? "Collapse presets" : "Expand presets"
                      }
                    >
                      <CaretDown
                        size={15}
                        weight="bold"
                        className={cn(
                          "transition-transform duration-300 ease-out",
                          !presetsOpen && "-rotate-90"
                        )}
                      />
                    </button>
                  </div>

                  <div
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                      presetsOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div
                        ref={trainingStartRef}
                        id="workout-presets-list"
                        className="divide-y divide-border/70 border-y border-border/70"
                      >
                        {syncing && presets.length === 0 && (
                          <>
                            {[0, 1, 2].map((i) => (
                              <div
                                key={i}
                                className="h-[62px] animate-pulse rounded-[0.8rem] bg-foreground/[0.04]"
                              />
                            ))}
                          </>
                        )}
                        {!syncing && presets.length === 0 && (
                          <div className="border-y border-border py-5">
                            <p className="text-[16px] font-semibold text-foreground">
                              No presets yet
                            </p>
                            <p className="mt-1 text-[15px] leading-6 text-muted-foreground">
                              Save a repeatable workout, then assign it to your
                              weekly routine.
                            </p>
                            <button
                              type="button"
                              onClick={() => navigate("/workouts/new")}
                              className="app-button app-button-primary mt-3 h-10 w-full"
                            >
                              Create your first preset
                            </button>
                          </div>
                        )}
                        {presets.map((preset, idx) => {
                          const isDraggingThis =
                            drag?.presetId === preset.id && hasMoved
                          const isDropTarget =
                            dragOverIdx === idx &&
                            hasMoved &&
                            drag?.presetId !== preset.id
                          const isPressing = pressingPreset === preset.id
                          const duplicatingThis =
                            duplicatingPresetId === preset.id

                          return (
                            <div key={preset.id} className="relative">
                              {isDropTarget && (
                                <div className="absolute inset-x-0 -top-px z-10 h-px bg-foreground/40" />
                              )}

                              <div
                                ref={(el) => {
                                  presetRefs.current[idx] = el
                                }}
                                className={cn(
                                  "group relative touch-pan-y overflow-hidden py-4 transition-colors select-none hover:bg-foreground/[0.018] md:flex md:items-center md:gap-6 md:px-1",
                                  isDraggingThis && "opacity-35",
                                  isDropTarget && "bg-foreground/[0.045]"
                                )}
                                onPointerDown={
                                  !routineEditMode
                                    ? undefined
                                    : (e) => onPresetPointerDown(e, preset.id)
                                }
                                onPointerMove={
                                  !routineEditMode
                                    ? undefined
                                    : onPresetPointerMove
                                }
                                onPointerUp={
                                  !routineEditMode
                                    ? undefined
                                    : onPresetPointerUp
                                }
                                onPointerCancel={
                                  !routineEditMode
                                    ? undefined
                                    : onPresetPointerUp
                                }
                              >
                                {isPressing && (
                                  <div
                                    className="absolute inset-x-0 bottom-0 z-10 h-[3px] origin-left bg-destructive"
                                    style={{
                                      animation: `sweep-delete ${PRESET_PRESS_MS}ms linear forwards`,
                                    }}
                                  />
                                )}

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[16px] leading-tight font-semibold tracking-[-0.015em]">
                                    {preset.name}
                                  </p>
                                  <p className="mt-1.5 text-[13px] text-muted-foreground/75">
                                    {preset.steps.length} exercises ·{" "}
                                    {preset.duration}
                                  </p>
                                </div>
                                <div className="mt-3 flex items-center gap-1 md:mt-0">
                                  <button
                                    type="button"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={() => {
                                      hapticMedium()
                                      navigate(`/workout/active/${preset.id}`)
                                    }}
                                    className="motion-tactile flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold text-foreground/70 transition-colors hover:bg-foreground/[0.045] hover:text-foreground md:flex-none"
                                    aria-label={`Start ${preset.name} now`}
                                  >
                                    <Play size={12} weight="fill" />
                                    Start
                                  </button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        onPointerDown={(e) =>
                                          e.stopPropagation()
                                        }
                                        className="app-icon-button h-10 w-10 shrink-0 bg-transparent text-muted-foreground/65 hover:bg-foreground/[0.045] hover:text-foreground"
                                        aria-label={`More actions for ${preset.name}`}
                                        aria-busy={duplicatingThis}
                                      >
                                        {duplicatingThis ? (
                                          <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current/25 border-t-current" />
                                        ) : (
                                          <DotsThree size={18} weight="bold" />
                                        )}
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="end"
                                      sideOffset={6}
                                      className="min-w-44 rounded-xl p-1.5"
                                    >
                                      <DropdownMenuItem
                                        className="rounded-lg py-2.5"
                                        onSelect={() => {
                                          hapticSelection()
                                          navigate(
                                            `/workouts/edit/${preset.id}`
                                          )
                                        }}
                                      >
                                        <PencilSimple /> Edit preset
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="rounded-lg py-2.5"
                                        disabled={duplicatingPresetId !== null}
                                        onSelect={() => {
                                          hapticSelection()
                                          void duplicatePreset(preset)
                                        }}
                                      >
                                        <Copy /> Duplicate
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="rounded-lg py-2.5"
                                        onSelect={() => {
                                          hapticSelection()
                                          quickLogPreset(dateKey, preset.id)
                                        }}
                                      >
                                        <ClockCounterClockwise /> Log past
                                        session
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        variant="destructive"
                                        className="rounded-lg py-2.5"
                                        onSelect={() => {
                                          hapticSelection()
                                          setConfirmDeleteId(preset.id)
                                        }}
                                      >
                                        <Trash /> Delete preset
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </section>

            {/* Below the presets, where it reads as a footnote to the page
                rather than competing with today's session. */}
            <FormCoachPinnedCards surface="workouts" />
          </>
        )}
      </main>

      {/* ── Drag ghost ──────────────────────────────────────────────────── */}
      {hasMoved && ghostPreset && GhostIcon && drag && (
        <div
          className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-xl bg-background/95 px-3 py-2 shadow-2xl shadow-black/20 backdrop-blur-sm"
          style={{ left: drag.x - 80, top: drag.y - 20, minWidth: 150 }}
        >
          <GhostIcon
            size={13}
            weight="duotone"
            className="shrink-0 text-foreground/50"
          />
          <span className="text-[13px] font-semibold">{ghostPreset.name}</span>
        </div>
      )}

      {/* ── Pick second workout sheet ───────────────────────────────────── */}
      {showSecondWorkoutSheet && (
        <PickSecondWorkoutSheet
          presets={presets}
          onPick={(presetId) => {
            setShowSecondWorkoutSheet(false)
            navigate(`/workout/active/${presetId}?slot=2`)
          }}
          onClose={() => setShowSecondWorkoutSheet(false)}
        />
      )}

      {pickRoutineDay && (
        <PickSecondWorkoutSheet
          title={`Assign ${pickRoutineDay}`}
          presets={presets}
          onPick={(presetId) => {
            const nextRoutine = { ...routine, [pickRoutineDay]: presetId }
            setRoutine(nextRoutine)
            void persist(presets, nextRoutine)
            setPickRoutineDay(null)
          }}
          onClose={() => setPickRoutineDay(null)}
        />
      )}

      {/* ── Confirm delete sheet ─────────────────────────────────────────── */}
      {confirmDeleteId &&
        (() => {
          const p = presets.find((x) => x.id === confirmDeleteId)
          if (!p) return null
          return (
            <ConfirmDeleteSheet
              title={`Delete "${p.name}"?`}
              description="This preset will be permanently removed. Any routine days using it will be cleared."
              confirmLabel="Delete preset"
              busyLabel="Deleting..."
              onConfirm={() => deletePreset(confirmDeleteId)}
              onCancel={() => setConfirmDeleteId(null)}
            />
          )
        })()}

      {confirmDeleteWorkout && selectedWorkoutLog && (
        <ConfirmDeleteSheet
          title="Delete this workout log?"
          description="This completed training session will be permanently removed."
          confirmLabel="Delete workout"
          busyLabel="Deleting..."
          onConfirm={async () => {
            await deleteSelectedWorkout()
            setConfirmDeleteWorkout(false)
          }}
          onCancel={() => setConfirmDeleteWorkout(false)}
        />
      )}

      {logPastDate && (
        <LogPastWorkoutSheet
          todayKey={todayKey}
          initialDate={logPastDate}
          presets={presets}
          onDescribe={describeRetroLog}
          onPickPreset={quickLogPreset}
          onClose={() => setLogPastDate(null)}
        />
      )}

      {addOpen && (
        <MobileSheet
          onClose={() => setAddOpen(false)}
          overlayClassName="bg-black/50 backdrop-blur-[8px]"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-[24px] bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
          panelStyle={{
            paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
          }}
          maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
        >
          <div className="px-4 pt-1 pb-4">
            <div className="app-surface overflow-hidden">
              <button
                onClick={() => {
                  setAddOpen(false)
                  navigate("/workout/active")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors active:bg-muted/40"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="app-icon-button pointer-events-none h-9 w-9 bg-muted/55 text-muted-foreground/70">
                    <Barbell size={16} weight="bold" />
                  </span>
                  <span className="text-[13px] font-semibold">Log workout</span>
                </span>
                <CaretRight size={11} className="text-muted-foreground" />
              </button>
              <div className="mx-4 h-px bg-border/50" />
              <button
                onClick={() => {
                  setAddOpen(false)
                  navigate("/workouts/new")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors active:bg-muted/40"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="app-icon-button pointer-events-none h-9 w-9 bg-muted/55 text-muted-foreground/70">
                    <Plus size={16} weight="bold" />
                  </span>
                  <span className="text-[13px] font-semibold">New preset</span>
                </span>
                <CaretRight size={11} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        </MobileSheet>
      )}
    </div>
  )
}
