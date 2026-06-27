import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  Barbell,
  CaretRight,
  Copy,
  Fire,
  Heart,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { useBottomBarAction } from "@/components/bottom-bar"
import { MobileSheet } from "@/components/mobile-sheet"
import { SwipeToStart } from "@/components/swipe-to-start"
import { useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  compactCardioSummary,
  hasCardioDetails,
  normalizePresetCard,
  todayIso,
  type CachedWorkoutLog,
  type Routine,
  type WorkoutFocus,
  type WorkoutPresetCard,
} from "@/lib/workout-sync"
import {
  computeWeeklyMuscleVolume,
  buildCatalogMap,
  type MuscleSets,
} from "@/lib/muscle-volume"
import { resolveExerciseIds, type Exercise } from "@/lib/exercise-catalog"
import {
  getLoggedExerciseId,
  toWorkoutLogRecords,
  type WorkoutHistoryLog,
} from "@/lib/exercise-history"
import {
  APP_ACCENT_COLORS,
  MUSCLE_COLORS as ONE_REP_MUSCLE_COLORS,
} from "@/lib/design-tokens"

// ─── Types ────────────────────────────────────────────────────────────────────

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

import {
  dateToIso,
  calcStreak,
  calcWorkoutsThisWeek,
  buildCalendarDays,
} from "@/lib/training-consistency"

// ─── Training streak helpers ──────────────────────────────────────────────────

function TrainingConsistencyCard({
  workoutDates,
}: {
  workoutDates: Set<string>
}) {
  const today = new Date()
  today.setUTCHours(12, 0, 0, 0)

  const calendarDays = buildCalendarDays(today, 28)
  const todayIso = dateToIso(today)
  const streak = calcStreak(workoutDates, today)
  const thisWeek = calcWorkoutsThisWeek(workoutDates, today)
  const last28Count = calendarDays.filter((iso) => workoutDates.has(iso)).length

  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"]

  return (
    <div className="app-surface overflow-hidden px-4 pt-3.5 pb-4 short-phone:pt-3 short-phone:pb-3.5">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="app-eyebrow">Training</p>
          <p className="mt-0.5 text-[15px] font-bold">Consistency</p>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase">
              Streak
            </p>
            <p className="mt-0.5 text-[22px] leading-none font-black tabular-nums">
              {streak}
              <span className="ml-0.5 text-[11px] font-medium text-muted-foreground/40">
                days
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase">
              This week
            </p>
            <p className="mt-0.5 text-[22px] leading-none font-black tabular-nums">
              {thisWeek}
              <span className="ml-0.5 text-[11px] font-medium text-muted-foreground/40">
                / 7
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Day-of-week labels */}
      <div className="mb-1 grid grid-cols-7 gap-1 px-0.5">
        {dayLabels.map((l, i) => (
          <p
            key={i}
            className="text-center text-[8px] font-semibold text-muted-foreground/30 uppercase"
          >
            {l}
          </p>
        ))}
      </div>

      {/* 4 weeks × 7 days grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((iso) => {
          const isToday = iso === todayIso
          const hasWorkout = workoutDates.has(iso)
          const isFuture = iso > todayIso
          return (
            <div
              key={iso}
              className="aspect-square rounded-md transition-colors"
              style={{
                background: isFuture
                  ? "color-mix(in srgb, var(--foreground) 3%, transparent)"
                  : hasWorkout
                    ? "color-mix(in srgb, var(--foreground) 72%, transparent)"
                    : isToday
                      ? "color-mix(in srgb, var(--foreground) 10%, transparent)"
                      : "color-mix(in srgb, var(--foreground) 5%, transparent)",
                boxShadow: isToday
                  ? "inset 0 0 0 1.5px color-mix(in srgb, var(--foreground) 25%, transparent)"
                  : undefined,
              }}
            />
          )
        })}
      </div>

      {/* Footer */}
      <p className="mt-2.5 text-[10px] text-muted-foreground/35">
        {last28Count} workouts last 28 days
      </p>
    </div>
  )
}

function TrainingMetricTile({
  label,
  value,
  detail,
  icon,
  complete,
}: {
  label: string
  value: string | number
  detail: string
  icon: React.ReactNode
  complete?: boolean
}) {
  return (
    <div className="rounded-[0.8rem] bg-foreground/[0.045] px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-muted-foreground/66">
          {label}
        </p>
        <span
          className={cn(
            "text-muted-foreground/56",
            complete && "text-foreground/70"
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-1.5 text-[1.35rem] leading-none font-extrabold tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[10.5px] leading-4 font-semibold text-muted-foreground/52">
        {detail}
      </p>
    </div>
  )
}

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
    <div className="mt-3 space-y-1.5">
      {visible.map((step, i) => (
        <div
          key={`${preset.id}-${step}-${i}`}
          className="flex items-center gap-2.5 rounded-[0.7rem] bg-foreground/[0.035] px-2.5 py-2"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.45rem] bg-foreground/[0.07] text-[10px] font-bold text-muted-foreground/66">
            {i + 1}
          </span>
          <span className="min-w-0 truncate text-[12.5px] font-semibold text-foreground/78">
            {step}
          </span>
        </div>
      ))}
      {hidden > 0 && (
        <p className="px-1 text-[10.5px] font-semibold text-muted-foreground/48">
          +{hidden} more movement{hidden === 1 ? "" : "s"}
        </p>
      )}
    </div>
  )
}

// ─── Confirm delete sheet ─────────────────────────────────────────────────────

function ConfirmDeleteSheet({
  preset,
  onConfirm,
  onCancel,
}: {
  preset: WorkoutPresetCard
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        className="sheet-panel app-sheet-panel w-full max-w-sm border-t border-border bg-background px-5 pt-5"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        <h2 className="text-base font-semibold">Delete "{preset.name}"?</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This preset will be permanently removed. Any routine days using it
          will be cleared.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="app-button app-button-danger h-12 w-full"
          >
            Delete preset
          </button>
          <button
            onClick={onCancel}
            className="app-button app-button-quiet h-12 w-full"
          >
            Keep it
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
  return `${Math.floor(m / 60)}h ${m % 60 > 0 ? ` ${m % 60}m` : ""}`
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
          <span className="rounded-full bg-muted/55 px-2 py-0.5 text-[10px] font-bold text-muted-foreground/70 uppercase">
            Done
          </span>
          <span className="text-[11px] text-muted-foreground">
            Workout {slot} · {fmtDuration(log.durationSeconds)}
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

      <div className="flex flex-col gap-1.5">
        {completedExercises.map((ex) => {
          const isCardio = hasCardioDetails(ex.cardio)
          const done = (ex.sets ?? []).filter((s) => s.completed).length
          const total = ex.sets?.length ?? 0
          const id = getLoggedExerciseId(ex) ?? ex.name
          return (
            <div
              key={id}
              className="flex items-center gap-3 rounded-xl bg-muted/35 px-3.5 py-2.5"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[9px] font-bold text-foreground/65">
                ✓
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/78">
                {ex.name}
              </span>
              <span className="max-w-[12rem] shrink truncate text-right text-[11px] text-muted-foreground/58 tabular-nums">
                {isCardio
                  ? compactCardioSummary(ex.cardio, ex.cardio?.distanceUnit)
                  : `${done}/${total}`}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
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
                  <p className="text-[11px] text-muted-foreground">
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
      <div className="app-surface p-4 text-center">
        <p className="text-[12px] text-muted-foreground/40">
          No workouts logged this week yet
        </p>
      </div>
    )
  }

  const maxSets = Math.max(...muscleVolume.map((m) => m.effectiveSets))

  return (
    <div className="app-surface p-4">
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
                <span className="text-[12px] font-bold text-foreground/78 capitalize">
                  {item.muscle}
                </span>
                <span className="text-[10.5px] font-semibold text-muted-foreground/50 tabular-nums">
                  {item.primarySets}p
                  {item.secondarySets > 0 ? ` + ${item.secondarySets}s` : ""}{" "}
                  sets
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
      <p className="mt-3 text-[10px] text-muted-foreground/35">
        p = primary sets · s = secondary sets (secondary counts 0.5×)
      </p>
    </div>
  )
}

export default function Workouts() {
  const navigate = useSmoothNavigate()

  // ── Convex ────────────────────────────────────────────────────────────────
  const serverPresets = useQuery(api.logs.presets.list)
  const schedule = useQuery(api.users.schedules.get)
  const todayLog = useQuery(api.logs.workouts.getLog, { date: todayIso() })
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

  function persist(nextPresets: WorkoutPresetCard[], nextRoutine: Routine) {
    void setSchedule({
      routine: nextRoutine as Record<string, string | null>,
      presetOrder: nextPresets.map((p) => p.id),
    })
  }

  // ── Preset ordering (local, synced once from server) ──────────────────────
  const [localOrder, setLocalOrder] = useState<string[]>([])
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
    const byId = new Map(
      serverPresets.map((p) => [
        p._id as string,
        normalizePresetCard({
          id: p._id as string,
          name: p.name,
          focus: p.focus,
          duration: p.duration,
          steps: p.steps,
        }),
      ])
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
      setRoutine({
        Mon: schedule.routine?.Mon ?? null,
        Tue: schedule.routine?.Tue ?? null,
        Wed: schedule.routine?.Wed ?? null,
        Thu: schedule.routine?.Thu ?? null,
        Fri: schedule.routine?.Fri ?? null,
        Sat: schedule.routine?.Sat ?? null,
        Sun: schedule.routine?.Sun ?? null,
      } as Routine)
    }
  }, [schedule])

  const [routine2, setRoutine2] = useState<Routine>(EMPTY_ROUTINE)

  const syncing = serverPresets === undefined
  const workoutLogs: CachedWorkoutLog[] = todayLog
    ? [todayLog as unknown as CachedWorkoutLog]
    : []

  const [routineEditMode, setRoutineEditMode] = useState(false)
  const [showSecondWorkoutSheet, setShowSecondWorkoutSheet] = useState(false)
  const [pickRoutineDay, setPickRoutineDay] = useState<Day | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  useBottomBarAction(() => setAddOpen(true))

  const [drag, setDrag] = useState<DragState | null>(null)
  const [overDay, setOverDay] = useState<Day | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const [pressingDay, setPressingDay] = useState<Day | null>(null)
  const [removingDays, setRemovingDays] = useState<Set<Day>>(new Set())
  const slotPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pressingPreset, setPressingPreset] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const presetPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const slotRefs = useRef<Partial<Record<Day, HTMLDivElement | null>>>({})
  const presetRefs = useRef<(HTMLDivElement | null)[]>([])

  const today = todayDay()
  const todayPreset = presets.find((p) => p.id === routine[today]) ?? null
  const todayPreset2 = presets.find((p) => p.id === routine2[today]) ?? null

  const workoutDates = useMemo(() => {
    if (!workoutHistory) return new Set<string>()
    return new Set(workoutHistory.map((log) => log.date as string))
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
        setRoutine2((r) => ({ ...r, [day]: null }))
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
      const day = hitDay(e.clientX, e.clientY)

      if (day) {
        if (!routine[day]) {
          // Slot 1 is empty — fill it
          const nextRoutine = { ...routine, [day]: drag.presetId }
          setRoutine(nextRoutine)
          void persist(presets, nextRoutine)
        } else {
          // Slot 1 is taken — fill (or replace) slot 2
          setRoutine2((r) => ({ ...r, [day]: drag.presetId }))
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

  function duplicatePreset(preset: WorkoutPresetCard) {
    const source = serverPresets?.find(
      (item) => (item._id as string) === preset.id
    )
    void createPresetMutation({
      name: `${preset.name} copy`,
      items: (source?.items as unknown[]) ?? [],
      exerciseData: source?.exerciseData ?? {},
      focus: source?.focus ?? preset.focus,
      duration: source?.duration ?? preset.duration,
      steps: source?.steps ?? preset.steps,
    })
  }

  function deletePreset(id: string) {
    const nextPresets = presets.filter((p) => p.id !== id)
    const nextRoutine = { ...routine }
    const nextRoutine2 = { ...routine2 }
    for (const day of DAYS) {
      if (nextRoutine[day] === id) nextRoutine[day] = null
      if (nextRoutine2[day] === id) nextRoutine2[day] = null
    }

    setLocalOrder(nextPresets.map((p) => p.id))
    setRoutine(nextRoutine)
    setRoutine2(nextRoutine2)
    setConfirmDeleteId(null)

    persist(nextPresets, nextRoutine)
    void removePresetMutation({ id: id as Id<"presets"> })
  }

  function handlePrimaryTrainingAction() {
    if (workoutLogs.length === 0 && todayPreset) {
      navigate(`/workout/active/${todayPreset.id}`)
      return
    }
    if (workoutLogs.length === 1 && todayPreset2) {
      navigate(`/workout/active/${todayPreset2.id}?slot=2`)
      return
    }
    setAddOpen(true)
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
  const heroActionLabel =
    workoutLogs.length === 2
      ? "Done"
      : workoutLogs.length === 0 && todayPreset
        ? "Start"
        : workoutLogs.length === 1 && todayPreset2
          ? "Start next"
          : "Add"

  // ── Ghost ─────────────────────────────────────────────────────────────────

  const ghostPreset = drag ? presets.find((p) => p.id === drag.presetId) : null
  const GhostIcon = ghostPreset ? FOCUS_ICON[ghostPreset.focus] : null

  return (
    <div className="desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <main className="app-page">
        <header className="app-header">
          <div className="min-w-0">
            <p className="app-eyebrow">Training</p>
            <h1 className="app-title">Workouts</h1>
            <p className="mt-1 text-[12px] text-muted-foreground/60">
              Plan sessions, start lifts, and review exercises in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="app-button app-header-action bg-foreground text-background"
            aria-label="Add workout"
          >
            <Plus size={13} weight="bold" /> Add
          </button>
        </header>

        <section className="app-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="app-eyebrow">Today · {today}</p>
              <p className="mt-2 truncate text-[2.05rem] leading-none font-extrabold tracking-tight">
                {heroTitle}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground/58">
                {heroDetail}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePrimaryTrainingAction}
              disabled={workoutLogs.length === 2}
              className={cn(
                "app-button app-button-quiet shrink-0",
                workoutLogs.length === 2 && "opacity-50"
              )}
            >
              {heroActionLabel}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <TrainingMetricTile
              label="Week"
              value={workoutsThisWeek}
              detail={`${workoutLogs.length}/2 today`}
              icon={<Barbell size={14} weight="bold" />}
              complete={workoutsThisWeek > 0}
            />
            <TrainingMetricTile
              label="Streak"
              value={trainingStreak}
              detail="days in a row"
              icon={<Heart size={14} weight="bold" />}
              complete={trainingStreak > 0}
            />
            <TrainingMetricTile
              label="Presets"
              value={presets.length}
              detail="ready sessions"
              icon={<Fire size={14} weight="bold" />}
              complete={presets.length > 0}
            />
          </div>
        </section>

        <section className="mt-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
          <div className="grid min-w-0 content-start gap-3">
            <div className="app-surface p-4">
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
                  <span className="rounded-full bg-foreground/[0.055] px-2.5 py-1 text-[10px] font-bold text-muted-foreground/62">
                    1 of 2 done
                  </span>
                )}
              </div>

              {workoutLogs.length === 2 ? (
                <WorkoutLogCarousel
                  logs={workoutLogs as [CachedWorkoutLog, CachedWorkoutLog]}
                />
              ) : workoutLogs.length === 1 ? (
                <div className="space-y-3.5">
                  <WorkoutLogSummary log={workoutLogs[0]} slot={1} />

                  {todayPreset2 ? (
                    <div className="border-t border-border/35 pt-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-bold">
                            {todayPreset2.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground/56">
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
              ) : todayPreset ? (
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[1.25rem] leading-tight font-extrabold tracking-tight">
                        {todayPreset.name}
                      </p>
                      {todayPreset2 && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/56">
                          + {todayPreset2.name} after
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-muted-foreground/56">
                      {todayPreset.duration}
                    </span>
                  </div>
                  <PresetSteps preset={todayPreset} />
                  <div className="mt-4">
                    <SwipeToStart
                      onComplete={() =>
                        navigate(`/workout/active/${todayPreset.id}`)
                      }
                      label="Start workout"
                      variant="default"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-[0.9rem] bg-foreground/[0.035] px-4 py-5 text-center">
                  <p className="text-[14px] font-bold">Rest day</p>
                  <p className="mt-1 text-[12px] text-muted-foreground/58">
                    No workout scheduled for today.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/workout/active")}
                    className="app-button app-button-quiet mt-4"
                  >
                    Log open workout
                  </button>
                </div>
              )}
            </div>

            <div className="app-surface p-4">
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
                        : "app-button-quiet"
                    )}
                  >
                    {routineEditMode ? "Done" : "Edit"}
                  </button>
                </div>
              </div>

              <div className="min-w-0">
                <div className="grid min-w-0 grid-cols-7 gap-1 pb-1 md:gap-1.5 md:pb-0">
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
                    const FocusIcon = preset ? FOCUS_ICON[preset.focus] : null
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
                          "relative flex min-h-[4.65rem] min-w-0 flex-col items-center gap-1.5 overflow-hidden rounded-[0.8rem] bg-foreground/[0.035] px-0.5 py-2 transition-all duration-200 md:min-h-[5.5rem] md:gap-2 md:px-1 md:py-3",
                          isToday && !isOver && "bg-foreground/[0.07]",
                          isOver && "scale-[1.04] bg-foreground/[0.1]"
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
                          <div className="absolute top-1.5 right-1.5 flex h-4 w-4 animate-in items-center justify-center rounded-full bg-foreground text-[8px] font-black text-background duration-150 zoom-in-50">
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
                            "text-[9.5px] font-bold uppercase",
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
                              "flex w-full flex-col items-center gap-0 transition-all duration-200",
                              isRemoving && "scale-50 opacity-0"
                            )}
                          >
                            <div className="flex w-full flex-col items-center gap-1 pb-1">
                              <FocusIcon
                                size={preset2 ? 11 : 15}
                                weight="duotone"
                                className="text-foreground/55"
                              />
                              <span
                                className={cn(
                                  "max-w-full truncate px-1 text-center leading-tight font-bold text-foreground/72",
                                  preset2 ? "text-[8.5px]" : "text-[9.5px]"
                                )}
                              >
                                {preset.name}
                              </span>
                            </div>

                            {preset2 && FocusIcon2 && (
                              <div className="flex w-full animate-in flex-col items-center gap-1 duration-200 fade-in-0 slide-in-from-bottom-1">
                                <div className="mb-1 h-px w-7 rounded-full bg-border/55 md:w-[54px]" />
                                <FocusIcon2
                                  size={11}
                                  weight="duotone"
                                  className="text-foreground/55"
                                />
                                <span className="max-w-full truncate px-1 text-center text-[8.5px] leading-tight font-bold text-foreground/72">
                                  {preset2.name}
                                </span>
                              </div>
                            )}
                          </button>
                        ) : routineEditMode ? (
                          <button
                            type="button"
                            onClick={() => setPickRoutineDay(day)}
                            className="flex min-h-10 flex-col items-center justify-center gap-1 px-2 text-[10px] font-bold text-muted-foreground/62 transition-colors active:text-foreground"
                          >
                            <Plus size={14} weight="bold" />
                            Add
                          </button>
                        ) : (
                          <span className="py-1.5 text-[10px] text-muted-foreground/35">
                            Rest
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {muscleVolume.length > 0 && (
              <MuscleVolumeCard muscleVolume={muscleVolume} />
            )}
          </div>

          <div className="grid min-w-0 content-start gap-3">
            <div className="app-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="app-section-title">Presets</p>
                  <p className="app-section-subtitle">
                    Build and assign reusable sessions
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/workouts/new")}
                  className="app-button app-button-quiet h-9"
                >
                  New
                </button>
              </div>

              <div className="flex flex-col gap-2">
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
                {presets.map((preset, idx) => {
                  const FocusIcon = FOCUS_ICON[preset.focus]
                  const isDraggingThis =
                    drag?.presetId === preset.id && hasMoved
                  const isDropTarget =
                    dragOverIdx === idx &&
                    hasMoved &&
                    drag?.presetId !== preset.id
                  const isPressing = pressingPreset === preset.id

                  return (
                    <div key={preset.id} className="relative">
                      {isDropTarget && (
                        <div className="absolute inset-x-3 -top-1 h-0.5 rounded-full bg-foreground/30" />
                      )}

                      <div
                        ref={(el) => {
                          presetRefs.current[idx] = el
                        }}
                        className={cn(
                          "relative touch-pan-y overflow-hidden rounded-[0.8rem] bg-foreground/[0.035] transition-all duration-150 select-none",
                          isDraggingThis && "scale-[0.98] opacity-40",
                          isDropTarget && "scale-[1.01] bg-foreground/[0.07]"
                        )}
                        onPointerDown={
                          !routineEditMode
                            ? undefined
                            : (e) => onPresetPointerDown(e, preset.id)
                        }
                        onPointerMove={
                          !routineEditMode ? undefined : onPresetPointerMove
                        }
                        onPointerUp={
                          !routineEditMode ? undefined : onPresetPointerUp
                        }
                        onPointerCancel={
                          !routineEditMode ? undefined : onPresetPointerUp
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

                        <div className="flex items-center gap-1.5 px-2.5 py-2.5 md:gap-2 md:px-3">
                          <span className="app-icon-button pointer-events-none h-8 w-8 shrink-0 bg-foreground/[0.055]">
                            <FocusIcon
                              size={14}
                              weight="duotone"
                              className="text-foreground/62"
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] leading-tight font-bold">
                              {preset.name}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-muted-foreground/55">
                              {preset.steps.length} exercises ·{" "}
                              {preset.duration}
                            </p>
                          </div>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() =>
                              navigate(`/workouts/edit/${preset.id}`)
                            }
                            className="app-icon-button h-9 w-9 shrink-0 bg-transparent"
                            aria-label={`Edit ${preset.name}`}
                          >
                            <PencilSimple size={12} />
                          </button>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => duplicatePreset(preset)}
                            className="app-icon-button h-9 w-9 shrink-0 bg-transparent"
                            aria-label={`Duplicate ${preset.name}`}
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => setConfirmDeleteId(preset.id)}
                            className="app-icon-button h-9 w-9 shrink-0 bg-transparent text-destructive/70"
                            aria-label={`Delete ${preset.name}`}
                          >
                            <Trash size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {workoutHistory !== undefined && workoutDates.size > 0 && (
              <TrainingConsistencyCard workoutDates={workoutDates} />
            )}
          </div>
        </section>
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
          <span className="text-[12px] font-semibold">{ghostPreset.name}</span>
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
              preset={p}
              onConfirm={() => deletePreset(confirmDeleteId)}
              onCancel={() => setConfirmDeleteId(null)}
            />
          )
        })()}

      {addOpen && (
        <MobileSheet
          onClose={() => setAddOpen(false)}
          overlayClassName="bg-black/50 backdrop-blur-[8px]"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-[24px] bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
          panelStyle={{
            paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
          }}
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
                <CaretRight size={11} className="text-muted-foreground/30" />
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
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
            </div>
          </div>
        </MobileSheet>
      )}
    </div>
  )
}
