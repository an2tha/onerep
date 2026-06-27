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
    <div className="px-4 pt-3.5 short-phone:pt-3 pb-4 short-phone:pb-3.5 overflow-hidden app-surface">
      {/* Header row */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="app-eyebrow">Training</p>
          <p className="mt-0.5 font-bold text-[15px]">Consistency</p>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="font-semibold text-[10px] text-muted-foreground/40 uppercase">
              Streak
            </p>
            <p className="mt-0.5 font-black tabular-nums text-[22px] leading-none">
              {streak}
              <span className="ml-0.5 font-medium text-[11px] text-muted-foreground/40">
                days
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-[10px] text-muted-foreground/40 uppercase">
              This week
            </p>
            <p className="mt-0.5 font-black tabular-nums text-[22px] leading-none">
              {thisWeek}
              <span className="ml-0.5 font-medium text-[11px] text-muted-foreground/40">
                / 7
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Day-of-week labels */}
      <div className="gap-1 grid grid-cols-7 mb-1 px-0.5">
        {dayLabels.map((l, i) => (
          <p
            key={i}
            className="font-semibold text-[8px] text-muted-foreground/30 text-center uppercase"
          >
            {l}
          </p>
        ))}
      </div>

      {/* 4 weeks × 7 days grid */}
      <div className="gap-1 grid grid-cols-7">
        {calendarDays.map((iso) => {
          const isToday = iso === todayIso
          const hasWorkout = workoutDates.has(iso)
          const isFuture = iso > todayIso
          return (
            <div
              key={iso}
              className="rounded-md aspect-square transition-colors"
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
    <div className="bg-foreground/[0.045] px-3 py-3 rounded-[0.8rem]">
      <div className="flex justify-between items-center gap-2">
        <p className="font-bold text-[10px] text-muted-foreground/66">
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
      <p className="mt-1.5 font-extrabold tabular-nums text-[1.35rem] leading-none">
        {value}
      </p>
      <p className="mt-1 font-semibold text-[10.5px] text-muted-foreground/52 leading-4">
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
    <div className="space-y-1.5 mt-3">
      {visible.map((step, i) => (
        <div
          key={`${preset.id}-${step}-${i}`}
          className="flex items-center gap-2.5 bg-foreground/[0.035] px-2.5 py-2 rounded-[0.7rem]"
        >
          <span className="flex justify-center items-center bg-foreground/[0.07] rounded-[0.45rem] w-5 h-5 font-bold text-[10px] text-muted-foreground/66 shrink-0">
            {i + 1}
          </span>
          <span className="min-w-0 font-semibold text-[12.5px] text-foreground/78 truncate">
            {step}
          </span>
        </div>
      ))}
      {hidden > 0 && (
        <p className="px-1 font-semibold text-[10.5px] text-muted-foreground/48">
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
      className="z-50 fixed inset-0 flex justify-center items-end bg-black/30 backdrop-blur-[2px] sheet-overlay"
      onClick={onCancel}
    >
      <div
        className="bg-background px-5 pt-5 border-border border-t w-full max-w-sm sheet-panel app-sheet-panel"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 bg-border rounded-full w-10 h-1" />
        <h2 className="font-semibold text-base">Delete "{preset.name}"?</h2>
        <p className="mt-1.5 text-muted-foreground text-sm">
          This preset will be permanently removed. Any routine days using it
          will be cleared.
        </p>
        <div className="flex flex-col gap-2 mt-6">
          <button
            onClick={onConfirm}
            className="w-full h-12 app-button app-button-danger"
          >
            Delete preset
          </button>
          <button
            onClick={onCancel}
            className="w-full h-12 app-button app-button-quiet"
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
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="bg-muted/55 px-2 py-0.5 rounded-full font-bold text-[10px] text-muted-foreground/70 uppercase">
            Done
          </span>
          <span className="text-[11px] text-muted-foreground">
            Workout {slot} · {fmtDuration(log.durationSeconds)}
          </span>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="bg-muted/45 w-10 h-10 app-icon-button"
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
              className="flex items-center gap-3 bg-muted/35 px-3.5 py-2.5 rounded-xl"
            >
              <span className="flex justify-center items-center bg-foreground/10 rounded-full w-5 h-5 font-bold text-[9px] text-foreground/65 shrink-0">
                ✓
              </span>
              <span className="flex-1 min-w-0 font-medium text-[13px] text-foreground/78 truncate">
                {ex.name}
              </span>
              <span className="max-w-[12rem] tabular-nums text-[11px] text-muted-foreground/58 text-right truncate shrink">
                {isCardio
                  ? compactCardioSummary(ex.cardio, ex.cardio?.distanceUnit)
                  : `${done}/${total}`}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex justify-between items-center text-[10px] text-muted-foreground/50">
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
        className="rounded-xl overflow-hidden"
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
      <div className="flex justify-center items-center gap-1.5">
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
      className="z-50 fixed inset-0 flex justify-center items-end bg-black/40 backdrop-blur-[3px] sheet-overlay"
      onClick={onClose}
    >
      <div
        className="bg-card shadow-2xl rounded-t-3xl w-full max-w-sm overflow-hidden sheet-panel"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="bg-foreground/[0.12] rounded-full w-10 h-1" />
        </div>
        <div className="flex justify-between items-center px-5 py-3">
          <p className="font-semibold text-[15px] tracking-tight">{title}</p>
          <button
            onClick={onClose}
            className="flex justify-center items-center bg-muted/60 active:bg-muted rounded-full w-10 h-10 text-muted-foreground transition-colors"
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
                className="flex items-center gap-3 bg-muted/40 active:bg-muted/70 px-4 py-3.5 rounded-2xl text-left transition-colors"
              >
                <div className="flex justify-center items-center bg-background/70 rounded-lg w-8 h-8 shrink-0">
                  <Icon
                    size={14}
                    weight="duotone"
                    className="text-foreground/60"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[13px]">{preset.name}</p>
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
      <div className="p-4 text-center app-surface">
        <p className="text-[12px] text-muted-foreground/40">
          No workouts logged this week yet
        </p>
      </div>
    )
  }

  const maxSets = Math.max(...muscleVolume.map((m) => m.effectiveSets))

  return (
    <div className="p-4 app-surface">
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
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-[12px] text-foreground/78 capitalize">
                  {item.muscle}
                </span>
                <span className="font-semibold tabular-nums text-[10.5px] text-muted-foreground/50">
                  {item.primarySets}p
                  {item.secondarySets > 0 ? ` + ${item.secondarySets}s` : ""}{" "}
                  sets
                </span>
              </div>
              <div className="bg-foreground/[0.06] rounded-full w-full h-1.5 overflow-hidden">
                <div
                  className="rounded-full h-full motion-progress-fill"
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
    <div className="bg-background lg:pr-8 lg:pl-72 min-h-svh desktop-canvas">
      <main className="app-page">
        <header className="app-header">
          <div className="min-w-0">
            <h1 className="app-title">Workouts</h1>
            <p className="mt-1 text-[12px] text-muted-foreground/60">
              Plan sessions, start lifts, and review exercises in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="app-header-icon-action md:hidden"
            aria-label="Add workout"
          >
            <Plus weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="hidden bg-foreground text-background app-button md:inline-flex"
            aria-label="Add workout"
          >
            <Plus size={13} weight="bold" /> Add
          </button>
        </header>

        <section className="p-4 app-surface">
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0">
              <p className="app-eyebrow">Today · {today}</p>
              <p className="mt-2 font-extrabold text-[2.05rem] truncate leading-none tracking-tight">
                {heroTitle}
              </p>
              <p className="mt-1 font-semibold text-[11px] text-muted-foreground/58">
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

          <div className="mt-5 grid grid-cols-1 gap-2.5 min-[430px]:grid-cols-3">
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

        <section className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:mt-3 lg:grid-cols-2 lg:items-start lg:gap-4">
          <div className="content-start gap-3 grid min-w-0">
            <div className="p-4 app-surface">
              <div className="flex justify-between items-center gap-3 mb-3">
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
                  <span className="bg-foreground/[0.055] px-2.5 py-1 rounded-full font-bold text-[10px] text-muted-foreground/62">
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
                    <div className="pt-3.5 border-border/35 border-t">
                      <div className="flex justify-between items-baseline gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-[15px] truncate">
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
                      className="justify-center active:bg-muted/20 py-3 w-full font-semibold text-[13px] active:text-foreground transition-colors app-empty"
                    >
                      <Plus size={13} weight="bold" />
                      Add second workout
                    </button>
                  )}
                </div>
              ) : todayPreset ? (
                <div>
                  <div className="flex justify-between items-baseline gap-3">
                    <div className="min-w-0">
                      <p className="font-extrabold text-[1.25rem] truncate leading-tight tracking-tight">
                        {todayPreset.name}
                      </p>
                      {todayPreset2 && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground/56 truncate">
                          + {todayPreset2.name} after
                        </p>
                      )}
                    </div>
                    <span className="font-semibold text-[11px] text-muted-foreground/56 shrink-0">
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
                <div className="bg-foreground/[0.035] px-4 py-5 rounded-[0.9rem] text-center">
                  <p className="font-bold text-[14px]">Rest day</p>
                  <p className="mt-1 text-[12px] text-muted-foreground/58">
                    No workout scheduled for today.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/workout/active")}
                    className="mt-4 app-button app-button-quiet"
                  >
                    Log open workout
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 app-surface">
              <div className="flex justify-between items-center gap-3 mb-3">
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
                      "transition-colors app-button",
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
                <div className="gap-1 md:gap-1.5 grid grid-cols-7 pb-1 md:pb-0 min-w-0">
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
                          "relative flex flex-col items-center gap-1.5 md:gap-2 bg-foreground/[0.035] px-0.5 md:px-1 py-2 md:py-3 rounded-[0.8rem] min-w-0 min-h-[4.65rem] md:min-h-[5.5rem] overflow-hidden transition-all duration-200",
                          isToday && !isOver && "bg-foreground/[0.07]",
                          isOver && "scale-[1.04] bg-foreground/[0.1]"
                        )}
                      >
                        {isPressing && (
                          <div
                            className="bottom-0 absolute inset-x-0 bg-destructive h-[3px] origin-left"
                            style={{
                              animation: `sweep-delete ${SLOT_PRESS_MS}ms linear forwards`,
                            }}
                          />
                        )}

                        {isSlot2Drop && (
                          <div className="top-1.5 right-1.5 absolute flex justify-center items-center bg-foreground rounded-full w-4 h-4 font-black text-[8px] text-background animate-in duration-150 zoom-in-50">
                            +2
                          </div>
                        )}

                        {routineEditMode && (preset || preset2) && (
                          <button
                            type="button"
                            onClick={() => removeSlot(day)}
                            className="top-1 md:top-1.5 right-1 md:right-1.5 z-10 absolute bg-background/80 w-8 md:w-9 h-8 md:h-9 text-destructive app-icon-button"
                            aria-label={`Remove workout from ${day}`}
                          >
                            <X size={11} weight="bold" />
                          </button>
                        )}

                        <span
                          className={cn(
                            "font-bold text-[9.5px] uppercase",
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
                              "flex flex-col items-center gap-0 w-full transition-all duration-200",
                              isRemoving && "scale-50 opacity-0"
                            )}
                          >
                            <div className="flex flex-col items-center gap-1 pb-1 w-full">
                              <FocusIcon
                                size={preset2 ? 11 : 15}
                                weight="duotone"
                                className="text-foreground/55"
                              />
                              <span
                                className={cn(
                                  "px-1 max-w-full font-bold text-foreground/72 text-center truncate leading-tight",
                                  preset2 ? "text-[8.5px]" : "text-[9.5px]"
                                )}
                              >
                                {preset.name}
                              </span>
                            </div>

                            {preset2 && FocusIcon2 && (
                              <div className="slide-in-from-bottom-1 flex flex-col items-center gap-1 w-full animate-in duration-200 fade-in-0">
                                <div className="mb-1 bg-border/55 rounded-full w-7 md:w-[54px] h-px" />
                                <FocusIcon2
                                  size={11}
                                  weight="duotone"
                                  className="text-foreground/55"
                                />
                                <span className="px-1 max-w-full font-bold text-[8.5px] text-foreground/72 text-center truncate leading-tight">
                                  {preset2.name}
                                </span>
                              </div>
                            )}
                          </button>
                        ) : routineEditMode ? (
                          <button
                            type="button"
                            onClick={() => setPickRoutineDay(day)}
                            className="flex flex-col justify-center items-center gap-1 px-2 min-h-10 font-bold text-[10px] text-muted-foreground/62 active:text-foreground transition-colors"
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

          <div className="content-start gap-3 grid min-w-0">
            <div className="p-4 app-surface">
              <div className="flex justify-between items-center gap-3 mb-3">
                <div>
                  <p className="app-section-title">Presets</p>
                  <p className="app-section-subtitle">
                    Build and assign reusable sessions
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/workouts/new")}
                  className="h-9 app-button app-button-quiet"
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
                        className="bg-foreground/[0.04] rounded-[0.8rem] h-[62px] animate-pulse"
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
                        <div className="-top-1 absolute inset-x-3 bg-foreground/30 rounded-full h-0.5" />
                      )}

                      <div
                        ref={(el) => {
                          presetRefs.current[idx] = el
                        }}
                        className={cn(
                          "relative bg-foreground/[0.035] rounded-[0.8rem] overflow-hidden transition-all duration-150 touch-pan-y select-none",
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
                            className="bottom-0 z-10 absolute inset-x-0 bg-destructive h-[3px] origin-left"
                            style={{
                              animation: `sweep-delete ${PRESET_PRESS_MS}ms linear forwards`,
                            }}
                          />
                        )}

                        <div className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2.5">
                          <span className="bg-foreground/[0.055] w-8 h-8 pointer-events-none app-icon-button shrink-0">
                            <FocusIcon
                              size={14}
                              weight="duotone"
                              className="text-foreground/62"
                            />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[12.5px] truncate leading-tight">
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
                            className="bg-transparent w-9 h-9 app-icon-button shrink-0"
                            aria-label={`Edit ${preset.name}`}
                          >
                            <PencilSimple size={12} />
                          </button>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => duplicatePreset(preset)}
                            className="bg-transparent w-9 h-9 app-icon-button shrink-0"
                            aria-label={`Duplicate ${preset.name}`}
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => setConfirmDeleteId(preset.id)}
                            className="bg-transparent w-9 h-9 text-destructive/70 app-icon-button shrink-0"
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
          className="z-50 fixed flex items-center gap-2 bg-background/95 shadow-2xl shadow-black/20 backdrop-blur-sm px-3 py-2 rounded-xl pointer-events-none"
          style={{ left: drag.x - 80, top: drag.y - 20, minWidth: 150 }}
        >
          <GhostIcon
            size={13}
            weight="duotone"
            className="text-foreground/50 shrink-0"
          />
          <span className="font-semibold text-[12px]">{ghostPreset.name}</span>
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
          maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
        >
          <div className="px-4 pt-1 pb-4">
            <div className="overflow-hidden app-surface">
              <button
                onClick={() => {
                  setAddOpen(false)
                  navigate("/workout/active")
                }}
                className="flex justify-between items-center active:bg-muted/40 px-4 py-3.5 w-full text-left transition-colors"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="bg-muted/55 w-9 h-9 text-muted-foreground/70 pointer-events-none app-icon-button">
                    <Barbell size={16} weight="bold" />
                  </span>
                  <span className="font-semibold text-[13px]">Log workout</span>
                </span>
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
              <div className="mx-4 bg-border/50 h-px" />
              <button
                onClick={() => {
                  setAddOpen(false)
                  navigate("/workouts/new")
                }}
                className="flex justify-between items-center active:bg-muted/40 px-4 py-3.5 w-full text-left transition-colors"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="bg-muted/55 w-9 h-9 text-muted-foreground/70 pointer-events-none app-icon-button">
                    <Plus size={16} weight="bold" />
                  </span>
                  <span className="font-semibold text-[13px]">New preset</span>
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
