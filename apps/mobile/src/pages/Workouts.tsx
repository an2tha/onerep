import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import {
  Aperture,
  Barbell,
  Barcode,
  CaretRight,
  Fire,
  Heart,
  Lock,
  LockOpen,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  X,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { Card } from "@repo/ui"
import { BottomBar } from "@/components/bottom-bar"
import { MobileSheet } from "@/components/mobile-sheet"
import { SwipeToStart } from "@/components/swipe-to-start"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
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

// ─── Types ────────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
type Day = (typeof DAYS)[number]

// ─── Constants ────────────────────────────────────────────────────────────────

const FOCUS_ICON: Record<
  WorkoutFocus,
  React.FC<{ size?: number; weight?: string; className?: string }>
> = {
  strength: Barbell as React.FC<any>,
  cardio: Fire as React.FC<any>,
  mobility: Heart as React.FC<any>,
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
  subtractDays,
  calcStreak,
  calcWorkoutsThisWeek,
  buildCalendarDays,
} from "@/lib/training-consistency"

// ─── Training streak helpers ──────────────────────────────────────────────────

function TrainingConsistencyCard({ workoutDates }: { workoutDates: Set<string> }) {
  const today = new Date()
  today.setUTCHours(12, 0, 0, 0)

  const calendarDays = buildCalendarDays(today, 28)
  const todayIso = dateToIso(today)
  const streak = calcStreak(workoutDates, today)
  const thisWeek = calcWorkoutsThisWeek(workoutDates, today)
  const last28Count = calendarDays.filter((iso) => workoutDates.has(iso)).length

  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"]

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card px-4 pt-3.5 pb-4">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">Training</p>
          <p className="mt-0.5 text-[15px] font-bold tracking-tight">Consistency</p>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">Streak</p>
            <p className="mt-0.5 text-[22px] font-black leading-none tabular-nums tracking-tight">
              {streak}
              <span className="ml-0.5 text-[11px] font-medium text-muted-foreground/40">days</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">This week</p>
            <p className="mt-0.5 text-[22px] font-black leading-none tabular-nums tracking-tight">
              {thisWeek}
              <span className="ml-0.5 text-[11px] font-medium text-muted-foreground/40">/ 7</span>
            </p>
          </div>
        </div>
      </div>

      {/* Day-of-week labels */}
      <div className="mb-1 grid grid-cols-7 gap-1 px-0.5">
        {dayLabels.map((l, i) => (
          <p key={i} className="text-center text-[8px] font-semibold text-muted-foreground/30 uppercase">{l}</p>
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
                  ? "color-mix(in srgb, #22c55e 70%, #16a34a)"
                  : isToday
                  ? "color-mix(in srgb, var(--foreground) 10%, transparent)"
                  : "color-mix(in srgb, var(--foreground) 5%, transparent)",
                boxShadow: isToday ? "inset 0 0 0 1.5px color-mix(in srgb, var(--foreground) 25%, transparent)" : undefined,
              }}
            />
          )
        })}
      </div>

      {/* Footer */}
      <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground/35">
        <span>{last28Count} workouts last 28 days</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "color-mix(in srgb, #22c55e 70%, #16a34a)" }} />
          Workout
        </span>
      </div>
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  sub,
  action,
}: {
  title: string
  sub?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <div className="flex items-baseline gap-1.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {sub && (
          <span className="text-[11px] text-muted-foreground">{sub}</span>
        )}
      </div>
      {action}
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
        className="sheet-panel w-full max-w-sm rounded-t-3xl border-t border-border bg-background px-5 pt-5 shadow-2xl"
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
            className="h-12 w-full rounded-xl bg-destructive text-sm font-semibold text-white transition-opacity active:opacity-75"
          >
            Delete preset
          </button>
          <button
            onClick={onCancel}
            className="h-12 w-full rounded-xl text-sm font-medium text-muted-foreground transition-colors active:text-foreground"
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
  onEdit: () => void
}) {
  const completedExercises = log.exercises.filter((e) =>
    e.sets.some((s) => s.completed)
  )
  const totalSets = log.exercises.reduce(
    (acc, e) => acc + e.sets.filter((s) => s.completed).length,
    0
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold tracking-widest text-green-600 uppercase dark:text-green-400">
            Done
          </span>
          <span className="text-[11px] text-muted-foreground">
            Workout {slot} · {fmtDuration(log.durationSeconds)}
          </span>
        </div>
        <button
          onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors active:bg-muted/50 active:text-foreground"
          aria-label="Edit workout"
        >
          <PencilSimple size={13} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {completedExercises.map((ex) => {
          const done = ex.sets.filter((s) => s.completed).length
          const total = ex.sets.length
          return (
            <div
              key={ex.exerciseId}
              className="flex items-center gap-3 rounded-xl bg-green-500/[0.07] px-3.5 py-2.5"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/25 text-[9px] font-bold text-green-600 dark:text-green-400">
                ✓
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-green-700 dark:text-green-300">
                {ex.name}
              </span>
              <span className="shrink-0 text-[11px] text-green-600/60 tabular-nums dark:text-green-400/60">
                {done}/{total}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
        <span>
          {completedExercises.length} exercises · {totalSets} sets
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
  onEdit: (slot: 1 | 2) => void
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
              : "transform 340ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {logs.map((log, i) => (
            <div key={i} className="w-full shrink-0">
              <WorkoutLogSummary
                log={log}
                slot={(i + 1) as 1 | 2}
                onEdit={() => onEdit((i + 1) as 1 | 2)}
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
  onPick,
  onClose,
}: {
  presets: WorkoutPresetCard[]
  onPick: (presetId: string) => void
  onClose: () => void
}) {
  const FOCUS_ICON_LOCAL: Record<WorkoutFocus, React.FC<any>> = {
    strength: Barbell as React.FC<any>,
    cardio: Fire as React.FC<any>,
    mobility: Heart as React.FC<any>,
  }

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
          <p className="text-[15px] font-semibold tracking-tight">
            Add second workout
          </p>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors active:bg-muted"
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

const MUSCLE_COLORS: Record<string, string> = {
  quadriceps: "#38bdf8",
  glutes:     "#f59e0b",
  hamstrings: "#a78bfa",
  chest:      "#f87171",
  back:       "#34d399",
  shoulders:  "#fb923c",
  biceps:     "#e879f9",
  triceps:    "#818cf8",
  core:       "#facc15",
  calves:     "#6ee7b7",
}

function muscleColor(muscle: string): string {
  return MUSCLE_COLORS[muscle.toLowerCase()] ?? "#94a3b8"
}

function MuscleVolumeCard({ muscleVolume }: { muscleVolume: MuscleSets[] }) {
  if (muscleVolume.length === 0) {
    return (
      <Card>
        <div className="px-4 py-5 text-center">
          <p className="text-[12px] text-muted-foreground/40">No workouts logged this week yet</p>
        </div>
      </Card>
    )
  }

  const maxSets = Math.max(...muscleVolume.map((m) => m.effectiveSets))

  return (
    <Card>
      <div className="px-4 py-3.5">
        <div className="flex flex-col gap-2.5">
          {muscleVolume.map((item) => {
            const pct = maxSets > 0 ? (item.effectiveSets / maxSets) * 100 : 0
            const color = muscleColor(item.muscle)
            return (
              <div key={item.muscle}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12px] font-medium capitalize text-foreground/80">
                    {item.muscle}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground/50">
                    {item.primarySets}p
                    {item.secondarySets > 0 ? ` + ${item.secondarySets}s` : ""} sets
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground/30">
          p = primary sets · s = secondary sets (secondary counts 0.5×)
        </p>
      </div>
    </Card>
  )
}

export default function Workouts() {
  const navigate = useNavigate()

  // ── Convex ────────────────────────────────────────────────────────────────
  const serverPresets = useQuery(api.logs.presets.list)
  const schedule = useQuery(api.users.schedules.get)
  const todayLog = useQuery(api.logs.workouts.getLog, { date: todayIso() })
  const workoutHistory = useQuery(api.logs.workouts.getHistory)
  const setSchedule = useMutation(api.users.schedules.set)
  const removePresetMutation = useMutation(api.logs.presets.remove)

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
    if (orderReady.current || schedule === undefined || serverPresets === undefined) return
    orderReady.current = true
    const srv = schedule?.presetOrder ?? []
    setLocalOrder(srv.length > 0 ? srv : serverPresets.map((p) => p._id as string))
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
        normalizePresetCard({ id: p._id as string, name: p.name, focus: p.focus, duration: p.duration, steps: p.steps }),
      ])
    )
    const result: WorkoutPresetCard[] = []
    for (const id of localOrder) {
      const p = byId.get(id)
      if (p) result.push(p)
    }
    for (const p of serverPresets) {
      if (!localOrder.includes(p._id as string))
        result.push(normalizePresetCard({ id: p._id as string, name: p.name, focus: p.focus, duration: p.duration, steps: p.steps }))
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
  const workoutLogs: CachedWorkoutLog[] = todayLog ? [todayLog as unknown as CachedWorkoutLog] : []

  const [locked, setLocked] = useState(false)
  const [showSecondWorkoutSheet, setShowSecondWorkoutSheet] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [snapOffline, setSnapOffline] = useState(false)

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

  // ── Muscle volume ────────────────────────────────────────────────────────
  const resolveIds = useAction(api.data.exercises.resolveIds)
  const [exerciseCatalog, setExerciseCatalog] = useState<Map<string, { id: string; primaryMuscles?: string[]; secondaryMuscles?: string[] }>>(new Map())
  const catalogFetched = useRef<string>("")

  const thisWeekLogs = useMemo(() => {
    if (!workoutHistory) return []
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const dow = now.getUTCDay()
    const daysFromMon = dow === 0 ? 6 : dow - 1
    const mon = new Date(now)
    mon.setUTCDate(now.getUTCDate() - daysFromMon)
    const fromStr = mon.toISOString().slice(0, 10)
    return (workoutHistory as any[]).filter(
      (log) => log.date >= fromStr && log.date <= todayStr
    )
  }, [workoutHistory])

  const thisWeekExerciseIds = useMemo(() => {
    const ids = new Set<string>()
    for (const log of thisWeekLogs) {
      for (const ex of log.exercises) ids.add(ex.id)
    }
    return Array.from(ids)
  }, [thisWeekLogs])

  useEffect(() => {
    const key = thisWeekExerciseIds.sort().join(",")
    if (!key || key === catalogFetched.current) return
    catalogFetched.current = key
    void resolveIds({ ids: thisWeekExerciseIds }).then((result) => {
      const map = new Map<string, { id: string; primaryMuscles?: string[]; secondaryMuscles?: string[] }>()
      for (const [id, ex] of Object.entries(result)) {
        map.set(id, { id, primaryMuscles: (ex as any).primaryMuscles, secondaryMuscles: (ex as any).secondaryMuscles })
      }
      setExerciseCatalog(map)
    })
  }, [thisWeekExerciseIds])

  const muscleVolume = useMemo(() => {
    if (thisWeekLogs.length === 0 || exerciseCatalog.size === 0) return []
    const catalog = buildCatalogMap(Array.from(exerciseCatalog.values()))
    return computeWeeklyMuscleVolume(
      thisWeekLogs.map((log) => ({
        date: log.date as string,
        exercises: log.exercises.map((ex: any) => ({
          id: ex.id as string,
          sets: ex.sets.map((s: any) => ({ completed: !!s.completed })),
        })),
      })),
      catalog,
      new Date(),
    )
  }, [thisWeekLogs, exerciseCatalog])

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
    if (locked || (!routine[day] && !routine2[day])) return
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
    if (locked) return
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

      if (day && !locked) {
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
    void removePresetMutation({ id: id as any })
  }

  // ── Ghost ─────────────────────────────────────────────────────────────────

  const ghostPreset = drag ? presets.find((p) => p.id === drag.presetId) : null
  const GhostIcon = ghostPreset ? FOCUS_ICON[ghostPreset.focus] : null

  return (
    <div className="min-h-svh bg-background">
      <div className="page-enter mx-auto flex max-w-lg flex-col pb-28">
        <header className="px-5 pt-14 pb-6">
          <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground/60 uppercase">
            Diary
          </p>
          <h1 className="mt-1.5 text-[1.9rem] leading-[1.15] font-semibold tracking-tight">
            Workouts.
          </h1>
        </header>

        <div className="flex flex-col gap-6 px-4">
          {/* ── Today's workout ─────────────────────────────────────── */}
          <section>
            <SectionHeader
              title="Today's workout"
              sub={today}
              action={
                workoutLogs.length === 1 && (
                  <span className="text-[10px] text-muted-foreground/60">
                    1 of 2 done
                  </span>
                )
              }
            />
            <Card>
              {workoutLogs.length === 2 ? (
                /* ── Two workouts done — carousel ── */
                <div className="px-4 py-4">
                  <WorkoutLogCarousel
                    logs={workoutLogs as [CachedWorkoutLog, CachedWorkoutLog]}
                    onEdit={(slot) => {
                      const p = slot === 1 ? todayPreset : todayPreset2
                      navigate(
                        p
                          ? `/workout/active/${p.id}?slot=${slot}`
                          : `/workout/active?slot=${slot}`
                      )
                    }}
                  />
                </div>
              ) : workoutLogs.length === 1 ? (
                /* ── One workout done — show summary + 2nd workout ── */
                <div className="flex flex-col gap-4 px-4 py-4">
                  <WorkoutLogSummary
                    log={workoutLogs[0]}
                    slot={1}
                    onEdit={() =>
                      navigate(
                        todayPreset
                          ? `/workout/active/${todayPreset.id}?slot=1`
                          : `/workout/active?slot=1`
                      )
                    }
                  />

                  {todayPreset2 ? (
                    /* Scheduled 2nd preset from routine2 */
                    <div className="flex animate-in flex-col gap-3 border-t border-border/30 pt-4 duration-300 fade-in-0 slide-in-from-bottom-2">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <p className="text-base font-semibold tracking-tight">
                            {todayPreset2.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Workout 2 · {todayPreset2.duration}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {todayPreset2.steps.map((step, i) => (
                          <div
                            key={step}
                            className="flex items-center gap-3 rounded-xl bg-muted/30 px-3.5 py-2.5 text-sm"
                          >
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground">
                              {i + 1}
                            </span>
                            <span className="font-medium">{step}</span>
                          </div>
                        ))}
                      </div>
                      <SwipeToStart
                        onComplete={() =>
                          navigate(`/workout/active/${todayPreset2.id}?slot=2`)
                        }
                        label="Start second workout"
                        variant="default"
                      />
                    </div>
                  ) : (
                    /* Generic add — no preset assigned to slot 2 */
                    <button
                      onClick={() => setShowSecondWorkoutSheet(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 py-3 text-[13px] font-medium text-muted-foreground transition-all active:bg-muted/20 active:text-foreground"
                    >
                      <Plus size={13} weight="bold" />
                      Add second workout
                    </button>
                  )}
                </div>
              ) : todayPreset ? (
                /* ── No workout yet — show preset(s) ── */
                <div className="px-4 py-4">
                  <div className="mb-4 flex items-baseline justify-between">
                    <div>
                      <p className="text-xl font-semibold tracking-tight">
                        {todayPreset.name}
                      </p>
                      {todayPreset2 && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          + {todayPreset2.name} after
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {todayPreset.duration}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {todayPreset.steps.map((step, i) => (
                      <div
                        key={step}
                        className="flex items-center gap-3 rounded-xl bg-muted/30 px-3.5 py-3 text-sm"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="font-medium">{step}</span>
                      </div>
                    ))}
                  </div>
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
                /* ── Rest day ── */
                <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                  <p className="text-sm font-medium">Rest day</p>
                  <p className="text-xs text-muted-foreground">
                    No workout scheduled for today
                  </p>
                </div>
              )}
            </Card>
          </section>

          {/* ── Your routine ────────────────────────────────────────── */}
          <section>
            <SectionHeader
              title="Your routine"
              sub={
                locked
                  ? "Locked"
                  : "Drag to assign · drop again for a 2nd workout"
              }
              action={
                <button
                  onClick={() => setLocked((l) => !l)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-200",
                    locked
                      ? "border-foreground/25 bg-foreground/[0.06] text-foreground"
                      : "border-border text-muted-foreground active:text-foreground"
                  )}
                  aria-label={locked ? "Unlock routine" : "Lock routine"}
                >
                  {locked ? (
                    <Lock size={12} weight="fill" />
                  ) : (
                    <LockOpen size={12} />
                  )}
                </button>
              }
            />

            <div className="-mx-0.5 overflow-x-auto px-0.5">
              <div
                className="flex gap-2 pb-1"
                style={{ minWidth: "max-content" }}
              >
                {DAYS.map((day) => {
                  const preset =
                    presets.find((p) => p.id === routine[day]) ?? null
                  const preset2 =
                    presets.find((p) => p.id === routine2[day]) ?? null
                  const isToday = day === today
                  const isOver = overDay === day && hasMoved && !locked
                  // When hovering over a day that already has slot 1, indicate slot 2 will be filled
                  const isSlot2Drop = isOver && !!preset
                  const isRemoving = removingDays.has(day)
                  const isPressing = pressingDay === day
                  const FocusIcon = preset ? FOCUS_ICON[preset.focus] : null
                  const FocusIcon2 = preset2 ? FOCUS_ICON[preset2.focus] : null

                  return (
                    <div
                      key={day}
                      ref={(el) => {
                        slotRefs.current[day] = el
                      }}
                      className={cn(
                        "relative flex w-[82px] shrink-0 flex-col items-center gap-2 overflow-hidden rounded-2xl border py-3 transition-all duration-200",
                        isToday &&
                          !isOver &&
                          "border-foreground/30 bg-foreground/[0.04] ring-1 ring-foreground/10",
                        !isToday && !isOver && "border-border",
                        isOver &&
                          !isSlot2Drop &&
                          "scale-[1.04] border-foreground/40 bg-foreground/[0.07]",
                        isSlot2Drop &&
                          "scale-[1.04] border-primary/50 bg-primary/[0.06]"
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

                      {/* Slot-2 drop badge — animated in when hovering a full slot */}
                      {isSlot2Drop && (
                        <div className="absolute top-1.5 right-1.5 flex h-4 w-4 animate-in items-center justify-center rounded-full bg-primary text-[8px] font-black text-primary-foreground duration-150 zoom-in-50">
                          +2
                        </div>
                      )}

                      <span
                        className={cn(
                          "text-[9.5px] font-bold tracking-[0.16em] uppercase",
                          isToday ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {day}
                      </span>

                      {preset && FocusIcon ? (
                        <button
                          disabled={locked}
                          onPointerDown={() => onSlotPressStart(day)}
                          onPointerUp={onSlotPressEnd}
                          onPointerLeave={onSlotPressEnd}
                          onPointerCancel={onSlotPressEnd}
                          className={cn(
                            "flex w-full flex-col items-center gap-0 transition-all duration-200",
                            isRemoving && "scale-50 opacity-0"
                          )}
                        >
                          {/* Slot 1 */}
                          <div className="flex w-full flex-col items-center gap-1 pb-1">
                            <FocusIcon
                              size={preset2 ? 11 : 15}
                              weight="duotone"
                              className="text-foreground/50"
                            />
                            <span
                              className={cn(
                                "max-w-[68px] truncate px-1 text-center leading-tight font-semibold text-foreground/70",
                                preset2 ? "text-[8.5px]" : "text-[9.5px]"
                              )}
                            >
                              {preset.name}
                            </span>
                          </div>

                          {/* Slot 2 — animated in when present */}
                          {preset2 && FocusIcon2 && (
                            <div className="flex w-full animate-in flex-col items-center gap-1 duration-200 fade-in-0 slide-in-from-bottom-1">
                              <div className="mb-1 h-px w-[54px] rounded-full bg-border/60" />
                              <FocusIcon2
                                size={11}
                                weight="duotone"
                                className="text-primary/70"
                              />
                              <span className="max-w-[68px] truncate px-1 text-center text-[8.5px] leading-tight font-semibold text-primary/80">
                                {preset2.name}
                              </span>
                            </div>
                          )}

                          {!locked && !isRemoving && (
                            <span className="mt-1 text-[7.5px] text-muted-foreground/30">
                              {preset2
                                ? "hold → remove last"
                                : "hold to remove"}
                            </span>
                          )}
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
          </section>

          {/* ── Your presets ────────────────────────────────────────── */}
          <section>
            <SectionHeader
              title="Your presets"
              sub="Drag to assign or reorder · hold 10s to delete"
            />

            <div className="flex flex-col gap-2">
              {syncing && presets.length === 0 && (
                <>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-muted/50" />
                  ))}
                </>
              )}
              {presets.map((preset, idx) => {
                const FocusIcon = FOCUS_ICON[preset.focus]
                const isDraggingThis = drag?.presetId === preset.id && hasMoved
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
                        "relative overflow-hidden rounded-2xl transition-all duration-150 select-none touch-pan-y",
                        isDraggingThis && "scale-[0.98] opacity-40",
                        isDropTarget && "scale-[1.01]"
                      )}
                      onPointerDown={
                        locked ? undefined : (e) => onPresetPointerDown(e, preset.id)
                      }
                      onPointerMove={locked ? undefined : onPresetPointerMove}
                      onPointerUp={locked ? undefined : onPresetPointerUp}
                      onPointerCancel={locked ? undefined : onPresetPointerUp}
                    >
                      {isPressing && (
                        <div
                          className="absolute inset-x-0 bottom-0 z-10 h-[3px] origin-left bg-destructive"
                          style={{
                            animation: `sweep-delete ${PRESET_PRESS_MS}ms linear forwards`,
                          }}
                        />
                      )}

                      <Card>
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                            <FocusIcon
                              size={13}
                              weight="duotone"
                              className="text-foreground/60"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] leading-none font-semibold">
                              {preset.name}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {preset.steps.length} exercises ·{" "}
                              {preset.duration}
                            </p>
                          </div>
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() =>
                              navigate(`/workouts/edit/${preset.id}`)
                            }
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted/50 active:text-foreground"
                            aria-label={`Edit ${preset.name}`}
                          >
                            <PencilSimple size={12} />
                          </button>
                        </div>
                      </Card>
                    </div>
                  </div>
                )
              })}

              <button
                onClick={() => navigate("/workouts/new")}
                className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 py-3 text-[13px] font-medium text-muted-foreground transition-colors active:bg-muted/20 active:text-foreground"
              >
                <Plus size={13} />
                New preset
              </button>
            </div>
          </section>

          {/* ── Training consistency ─────────────────────────────────── */}
          {workoutHistory !== undefined && workoutDates.size > 0 && (
            <section>
              <SectionHeader title="Consistency" sub="Last 28 days" />
              <TrainingConsistencyCard workoutDates={workoutDates} />
            </section>
          )}

          {/* ── Muscle volume ────────────────────────────────────────── */}
          {thisWeekLogs.length > 0 && (
            <section>
              <SectionHeader title="Volume" sub="This week · sets per muscle" />
              <MuscleVolumeCard muscleVolume={muscleVolume} />
            </section>
          )}
        </div>
      </div>

      {/* ── Drag ghost ──────────────────────────────────────────────────── */}
      {hasMoved && ghostPreset && GhostIcon && drag && (
        <div
          className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-xl border border-border/60 bg-background/95 px-3 py-2 shadow-2xl shadow-black/20 backdrop-blur-sm"
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

      <BottomBar onAdd={() => setAddOpen(true)} />

      {addOpen && (
        <MobileSheet
          onClose={() => setAddOpen(false)}
          overlayClassName="bg-black/50 backdrop-blur-[8px]"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
          panelStyle={{
            paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
          }}
        >
          <div className="px-4 pt-1 pb-4">
            {/* Primary — Log Workout (inverted, full-width) */}
            <button
              onClick={() => {
                setAddOpen(false)
                navigate("/workout/active")
              }}
              className="relative mb-2 w-full overflow-hidden rounded-2xl bg-foreground px-5 pt-4 pb-5 text-left text-background transition-opacity active:opacity-75"
            >
              {/* Subtle grid texture */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, currentColor 0, currentColor 1px, transparent 1px, transparent 28px), repeating-linear-gradient(90deg, currentColor 0, currentColor 1px, transparent 1px, transparent 28px)",
                }}
              />
              <p className="relative text-[9px] font-semibold tracking-[0.18em] uppercase opacity-40">
                Quick start
              </p>
              <p className="relative mt-1.5 text-[17px] leading-snug font-semibold tracking-tight">
                Log Workout
              </p>
              <Barbell
                size={18}
                weight="fill"
                className="absolute right-4 bottom-4 opacity-20"
              />
            </button>

            {/* Secondary actions */}
            <div className="overflow-hidden rounded-2xl border border-border/50">
              <button
                onClick={() => {
                  setAddOpen(false)
                  navigate("/camera?mode=barcode")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-muted/40"
              >
                <div className="flex items-center gap-2.5">
                  <Barcode
                    size={13}
                    className="shrink-0 text-muted-foreground/50"
                  />
                  <span className="text-[13px] font-medium">Scan Barcode</span>
                </div>
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
              <div className="mx-4 h-px bg-border/50" />
              <button
                onClick={() => {
                  if (!navigator.onLine) {
                    setSnapOffline(true)
                    return
                  }
                  setSnapOffline(false)
                  setAddOpen(false)
                  navigate("/camera")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-muted/40"
              >
                <div className="flex items-center gap-2.5">
                  <Aperture
                    size={13}
                    className="shrink-0 text-muted-foreground/50"
                  />
                  <span className="text-[13px] font-medium">Snap and Log</span>
                </div>
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
              <div className="mx-4 h-px bg-border/50" />
              <button
                onClick={() => {
                  setAddOpen(false)
                  navigate("/foods/search")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-muted/40"
              >
                <div className="flex items-center gap-2.5">
                  <MagnifyingGlass
                    size={13}
                    className="shrink-0 text-muted-foreground/50"
                  />
                  <span className="text-[13px] font-medium">Search Food</span>
                </div>
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
            </div>
          </div>

          {snapOffline && (
            <div className="mx-4 mb-1 flex items-center gap-2 rounded-xl bg-destructive/10 px-3.5 py-2.5">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
              <p className="text-[12px] font-medium text-destructive">
                No internet connection. Connect and try again.
              </p>
            </div>
          )}
        </MobileSheet>
      )}
    </div>
  )
}
