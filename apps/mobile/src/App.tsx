import React, { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import {
  Barbell,
  Barcode,
  CaretDown,
  CaretLeft,
  CaretRight,
  Coffee,
  Cookie,
  ForkKnife,
  Aperture,
  MagnifyingGlass,
  Moon,
  PencilSimple,
  Plus,
  SignOut,
  Trash,
  X,
} from "@phosphor-icons/react"
import { useQuery, useMutation } from "convex/react"
import { authClient } from "@/lib/auth-client"
import { api } from "../../../convex/_generated/api"
import { cn } from "@/lib/utils"
import { BottomBar } from "@/components/bottom-bar"
import { MobileSheet } from "@/components/mobile-sheet"
import { SwipeToStart } from "@/components/swipe-to-start"
import {
  formatReminderLabel,
} from "@/lib/body-progress"
import {
  normalizePresetCard,
  type Routine,
  todayIso,
  type CachedWorkoutLog,
  type WorkoutPresetCard,
} from "@/lib/workout-sync"
import {
  currentDateKey,
  dateForOffset,
  detectTimeZone,
  offsetDateKey,
  type FoodLogEntry,
  DEFAULT_MEAL_CATEGORIES,
} from "@/lib/food-log"
import {
  Calendar,
  Card,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui"

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkoutFocus = "strength" | "cardio" | "mobility"
type DashboardSettings = { workoutFocus: WorkoutFocus }

type CalorieInfo = {
  target: number
  bmr: number
  tdee: number
  protein: number
  carbs: number
  fat: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_DAY_OFFSET = -6 // how far back history goes

const EMPTY_WORKOUT_ROUTINE: Routine = {
  Mon: null,
  Tue: null,
  Wed: null,
  Thu: null,
  Fri: null,
  Sat: null,
  Sun: null,
}

const WORKOUTS: Record<
  WorkoutFocus,
  { title: string; duration: string; steps: string[] }
> = {
  strength: {
    title: "Lift day",
    duration: "45 min",
    steps: [
      "Warm up 5 min",
      "Squat 4 × 5",
      "Bench press 4 × 5",
      "Barbell row 3 × 8",
    ],
  },
  cardio: {
    title: "Cardio day",
    duration: "35 min",
    steps: [
      "Warm up 5 min",
      "Zone 2 run 20 min",
      "Intervals 6 min",
      "Cool down 4 min",
    ],
  },
  mobility: {
    title: "Mobility day",
    duration: "25 min",
    steps: [
      "Breath work 2 min",
      "Joint flow 8 min",
      "Deep stretch 10 min",
      "Walk 5 min",
    ],
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(hour: number) {
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function fmtKcal(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n))
}

function getInitials(name?: string) {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function dayOffsetLabel(offset: number, timeZone: string): string {
  if (offset === 0) return "Today"
  if (offset === -1) return "Yesterday"
  return dateKeyToCalendarDate(
    dateForOffset(offset, timeZone)
  ).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function dateKeyToDay(dateKey: string, timeZone: string): RoutineDay {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date(`${dateKey}T12:00:00Z`))

  const map: Record<string, RoutineDay> = {
    Mon: "Mon",
    Tue: "Tue",
    Wed: "Wed",
    Thu: "Thu",
    Fri: "Fri",
    Sat: "Sat",
    Sun: "Sun",
  }

  return map[weekday]
}

type RoutineDay = keyof Routine

function dateKeyToCalendarDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`)
}

function hourInTimeZone(date: Date, timeZone: string) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(date)
  )
}

function totalsForEntries(entries: FoodLogEntry[]) {
  return entries.reduce(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      carbs: acc.carbs + entry.carbs,
      fat: acc.fat + entry.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function ProgressCard() {
  const navigate = useNavigate()
  const measurements = useQuery(api.bodyProgress.list, {})
  const latest = measurements && measurements.length > 0 ? measurements[measurements.length - 1] : null

  return (
    <Card>
      <button
        onClick={() => navigate("/progress")}
        className="flex w-full items-start justify-between gap-4 px-4 py-3.5 text-left transition-colors active:bg-muted/20"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold">Body progress</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground/60">
            {latest?.weightKg != null
              ? `Latest check-in: ${latest.weightKg.toFixed(1)} kg on ${new Date(`${latest.loggedAt}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
              : "Log weight, body fat, waist, and more to see your trend."}
          </p>
        </div>
        <div className="rounded-2xl bg-foreground/[0.06] px-3 py-2">
          <span className="text-[11px] font-semibold">Open</span>
        </div>
      </button>
    </Card>
  )
}

function CheckInPrompt({ reminderEnabled, reminderLabel }: { reminderEnabled: boolean; reminderLabel: string }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate("/progress")}
      className="relative mx-4 mb-3 overflow-hidden rounded-[26px] bg-foreground px-4 pt-3.5 pb-4 text-left text-background transition-opacity active:opacity-80"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, currentColor 0, currentColor 1.5px, transparent 1.5px, transparent 6px)",
        }}
      />
      <div className="pointer-events-none absolute top-3 right-3 h-14 w-14 rounded-full border border-background/12" />
      <div className="pointer-events-none absolute top-5 right-5 h-10 w-10 rounded-full border border-background/10" />

      <div className="relative min-w-0">
        <p className="mt-2 text-[17px] leading-snug font-semibold tracking-tight">
          Log your first
          <br />
          body snapshot
        </p>
        <p className="mt-2 max-w-[15rem] text-[11.5px] leading-relaxed text-background/62">
          Weight, waist, and body-fat trends start here.
          {reminderEnabled ? ` ${reminderLabel}.` : ""}
        </p>
      </div>
      <div className="relative mt-3 inline-flex items-center rounded-full bg-background/10 px-3 py-1.5 text-[11px] font-semibold text-background ring-1 ring-background/12">
        Check in
      </div>
    </button>
  )
}

// ─── Date nav ─────────────────────────────────────────────────────────────────

function DateNav({
  offset,
  timeZone,
  onChange,
}: {
  offset: number
  timeZone: string
  onChange: (o: number) => void
}) {
  const [open, setOpen] = useState(false)

  const todayKey = dateForOffset(0, timeZone)
  const minDateKey = dateForOffset(MIN_DAY_OFFSET, timeZone)
  const selectedDateKey = dateForOffset(offset, timeZone)
  const today = dateKeyToCalendarDate(todayKey)
  const minDate = dateKeyToCalendarDate(minDateKey)
  const selectedDate = dateKeyToCalendarDate(selectedDateKey)

  function handleCalendarSelect(date: Date | undefined) {
    if (!date) return
    const diffMs = date.getTime() - today.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
    const clamped = Math.max(MIN_DAY_OFFSET, Math.min(0, diffDays))
    onChange(clamped)
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => onChange(Math.max(MIN_DAY_OFFSET, offset - 1))}
        disabled={offset <= MIN_DAY_OFFSET}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors active:text-foreground disabled:opacity-25"
        aria-label="Previous day"
      >
        <CaretLeft size={11} weight="bold" />
      </button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="min-w-[72px] rounded-md px-1 py-0.5 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground active:text-foreground">
            {dayOffsetLabel(offset, timeZone)}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            disabled={(date) => date > today || date < minDate}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <button
        onClick={() => onChange(Math.min(0, offset + 1))}
        disabled={offset >= 0}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors active:text-foreground disabled:opacity-25"
        aria-label="Next day"
      >
        <CaretRight size={11} weight="bold" />
      </button>
    </div>
  )
}

// ─── Calorie card ─────────────────────────────────────────────────────────────

function CalorieCard({
  info,
  loading,
  entries,
  dayOffset,
  timeZone,
  onDayOffsetChange,
}: {
  info: CalorieInfo | null
  loading: boolean
  entries: FoodLogEntry[]
  dayOffset: number
  timeZone: string
  onDayOffsetChange: (o: number) => void
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [barMounted, setBarMounted] = useState(false)

  useEffect(() => {
    setBarMounted(false)
    const t = setTimeout(() => setBarMounted(true), 80)
    return () => clearTimeout(t)
  }, [dayOffset, loading])

  const target = info?.target ?? 1840
  const bmr = info?.bmr ?? 1480
  const tdee = info?.tdee ?? 2100
  const consumedTotals = totalsForEntries(entries)
  const consumed = consumedTotals.calories
  const remaining = Math.max(0, target - consumed)
  const isToday = dayOffset === 0
  const pct =
    target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0

  const { protein, carbs, fat } = consumedTotals

  const MACRO_COLORS = {
    protein: "#f59e0b",
    carbs: "#38bdf8",
    fat: "#a78bfa",
  } as const

  return (
    <Card>
      <div className="px-4 py-3.5">
        {/* Header row */}
        <div className="mb-3 flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            {isToday ? "Calories" : "Calories"}
          </CardTitle>
          <DateNav
            offset={dayOffset}
            timeZone={timeZone}
            onChange={onDayOffsetChange}
          />
        </div>

        {loading ? (
          <div className="flex flex-col gap-2.5">
            <div className="h-7 w-28 animate-pulse rounded-lg bg-muted/50" />
            <div className="h-[2px] w-full rounded bg-muted/40" />
          </div>
        ) : (
          <>
            {/* Hero row: consumed ← hairline → remaining */}
            <div className="flex items-end justify-between">
              <div>
                <span className="text-[1.75rem] leading-none font-bold tracking-tight tabular-nums">
                  {fmtKcal(consumed)}
                </span>
                <span className="ml-1 text-[11px] text-muted-foreground/50">
                  kcal
                </span>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    "text-[1.1rem] leading-none font-semibold tabular-nums",
                    consumed > target
                      ? "text-destructive/70"
                      : "text-muted-foreground/40"
                  )}
                >
                  {consumed > target
                    ? `+${fmtKcal(consumed - target)}`
                    : fmtKcal(remaining)}
                </span>
                <p className="text-[9.5px] text-muted-foreground/35">
                  {consumed > target ? "over" : "left"}
                </p>
              </div>
            </div>

            {/* Hairline progress */}
            <div className="relative mt-2.5 h-[2px] rounded-sm bg-muted/40">
              <div
                className="absolute inset-y-0 left-0 rounded-sm transition-all duration-700 ease-out"
                style={{
                  width: barMounted ? `${pct}%` : "0%",
                  backgroundColor:
                    consumed > target ? "#ef4444" : "var(--foreground)",
                  opacity: 0.45,
                }}
              />
            </div>
            <p className="mt-1 text-[9.5px] text-muted-foreground/30 tabular-nums">
              of {fmtKcal(target)} goal
            </p>

            {/* Macro pills row */}
            <div className="mt-3 flex items-center gap-3 border-t border-border/20 pt-3">
              {[
                {
                  key: "protein" as const,
                  label: "P",
                  val: protein,
                  t: info?.protein ?? 140,
                },
                {
                  key: "carbs" as const,
                  label: "C",
                  val: carbs,
                  t: info?.carbs ?? 220,
                },
                {
                  key: "fat" as const,
                  label: "F",
                  val: fat,
                  t: info?.fat ?? 65,
                },
              ].map(({ key, label, val, t }) => {
                const over = val > t
                return (
                  <div key={key} className="flex items-baseline gap-1">
                    <span
                      className="text-[9.5px] font-semibold"
                      style={{ color: MACRO_COLORS[key], opacity: 0.8 }}
                    >
                      {label}
                    </span>
                    <span
                      className={cn(
                        "text-[12.5px] font-semibold tabular-nums",
                        over && "text-destructive/70"
                      )}
                    >
                      {Math.round(val)}
                    </span>
                    <span className="text-[9.5px] text-muted-foreground/35 tabular-nums">
                      /{t}g
                    </span>
                  </div>
                )
              })}

              {/* BMR/TDEE toggle — pushed to right */}
              <button
                onClick={() => setBreakdownOpen((o) => !o)}
                className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground/35 transition-colors active:text-muted-foreground/60"
              >
                <CaretDown
                  size={9}
                  weight="bold"
                  className={cn(
                    "transition-transform duration-200",
                    breakdownOpen && "rotate-180"
                  )}
                />
                BMR/TDEE
              </button>
            </div>

            {/* Collapsible BMR / TDEE */}
            <div
              className={cn(
                "grid transition-all duration-200 ease-out",
                breakdownOpen
                  ? "mt-2 grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <div className="flex gap-4 pt-1">
                  {[
                    { abbr: "BMR", value: bmr, desc: "at rest" },
                    { abbr: "TDEE", value: tdee, desc: "with activity" },
                  ].map(({ abbr, value, desc }) => (
                    <div key={abbr} className="flex items-baseline gap-1.5">
                      <span className="text-[9.5px] font-semibold text-muted-foreground/40">
                        {abbr}
                      </span>
                      <span className="text-[12.5px] font-semibold tabular-nums">
                        {fmtKcal(value)}
                      </span>
                      <span className="text-[9.5px] text-muted-foreground/30">
                        {desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

// ─── Compact workout log summary (home screen) ───────────────────────────────

function HomeWorkoutSummary({
  log,
  slot,
}: {
  log: CachedWorkoutLog
  slot: 1 | 2
}) {
  const completedExercises = log.exercises.filter((e) =>
    e.sets.some((s) => s.completed)
  )
  const totalSets = log.exercises.reduce(
    (acc, e) => acc + e.sets.filter((s) => s.completed).length,
    0
  )
  const durationMin = Math.floor(log.durationSeconds / 60)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[9.5px] font-bold tracking-widest text-green-600 uppercase dark:text-green-400">
          Done
        </span>
        <span className="text-[11px] text-muted-foreground/60">
          Workout {slot} · {durationMin} min
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {completedExercises.map((ex) => (
          <div
            key={ex.exerciseId}
            className="flex items-center gap-2.5 rounded-lg bg-green-500/[0.06] px-3 py-1.5"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-[8px] font-bold text-green-600 dark:text-green-400">
              ✓
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-green-700 dark:text-green-300">
              {ex.name}
            </span>
            <span className="shrink-0 text-[10.5px] text-green-600/50 tabular-nums dark:text-green-400/50">
              {ex.sets.filter((s) => s.completed).length}/{ex.sets.length}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[9.5px] text-muted-foreground/40">
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

// ─── Workout card ─────────────────────────────────────────────────────────────

function WorkoutCard({
  settings,
  dayOffset,
  scheduledWorkout,
  timeZone,
  workoutLogs,
  collapsed,
  onToggleCollapse,
  onDeleteSlot,
}: {
  settings: DashboardSettings
  dayOffset: number
  scheduledWorkout: WorkoutPresetCard | null
  timeZone: string
  workoutLogs: CachedWorkoutLog[]
  collapsed: boolean
  onToggleCollapse: () => void
  onDeleteSlot: (slot: 1 | 2) => void
}) {
  const navigate = useNavigate()
  const isToday = dayOffset === 0
  const focus = settings.workoutFocus
  const fallbackWorkout = WORKOUTS[focus]
  const workout = scheduledWorkout ?? fallbackWorkout
  const done = isToday && workoutLogs.length > 0
  const isRestDay = scheduledWorkout === null

  const title = isToday
    ? "Today's workout"
    : `${dayOffsetLabel(dayOffset, timeZone)}'s workout`

  // Slide state for dual-workout carousel
  const [slide, setSlide] = useState(0)
  const touchStartX = useRef(0)

  // Reset slide when logs change
  useEffect(() => {
    setSlide(0)
  }, [workoutLogs.length])

  return (
    <Card>
      <div className="px-4 py-3.5">
        {/* ── Header ── */}
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            {done && workoutLogs.length === 1 && (
              <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold tracking-widest text-green-600 uppercase dark:text-green-400">
                Done
              </span>
            )}
            {done && workoutLogs.length === 2 && (
              <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold tracking-widest text-green-600 uppercase dark:text-green-400">
                2× Done
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isToday && done && (
              <button
                onClick={() => onDeleteSlot(workoutLogs.length === 2 ? 2 : 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors active:bg-destructive/10 active:text-destructive"
                aria-label="Delete workout"
              >
                <Trash size={14} />
              </button>
            )}
            {isToday && (
              <button
                onClick={onToggleCollapse}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/45 transition-colors active:bg-muted/40 active:text-foreground"
                aria-label={collapsed ? "Expand" : "Collapse"}
              >
                <CaretDown
                  size={14}
                  className={cn(
                    "transition-transform duration-300",
                    !collapsed && "rotate-180"
                  )}
                />
              </button>
            )}
            {!isToday && (
              <button
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors active:text-foreground"
                aria-label="Edit workout"
              >
                <PencilSimple size={15} />
              </button>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
            collapsed
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            {isToday && workoutLogs.length === 2 ? (
              /* ── Two workouts done — animated carousel ── */
              <div className="pt-1">
                <div
                  className="overflow-hidden rounded-xl"
                  onTouchStart={(e) => {
                    touchStartX.current = e.touches[0].clientX
                  }}
                  onTouchEnd={(e) => {
                    const delta =
                      touchStartX.current - e.changedTouches[0].clientX
                    if (Math.abs(delta) > 40) setSlide(delta > 0 ? 1 : 0)
                  }}
                >
                  <div
                    className="flex"
                    style={{
                      transform: `translateX(-${slide * 100}%)`,
                      transition:
                        "transform 340ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  >
                    {workoutLogs.map((log, i) => (
                      <div key={i} className="w-full shrink-0">
                        <HomeWorkoutSummary log={log} slot={(i + 1) as 1 | 2} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Dot indicators */}
                <div className="mt-3 flex items-center justify-center gap-1.5">
                  {workoutLogs.map((_, i) => (
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
            ) : isToday && workoutLogs.length === 1 ? (
              /* ── One workout done ── */
              <div className="pt-1">
                <HomeWorkoutSummary log={workoutLogs[0]} slot={1} />
              </div>
            ) : (
              /* ── Upcoming workout ── */
              <>
                {isRestDay ? (
                  <div className="flex flex-col items-center gap-2 py-7 text-center">
                    <Barbell size={28} className="text-muted-foreground/20" />
                    <p className="text-[16px] font-semibold tracking-tight">
                      Rest day
                    </p>
                    <p className="max-w-[18rem] text-[12.5px] text-muted-foreground/55">
                      No workout is scheduled for this day in your routine.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-baseline justify-between pt-1">
                      <p className="text-[17px] font-semibold tracking-tight">
                        {workout.title}
                      </p>
                      <span className="text-[11px] text-muted-foreground/50">
                        {workout.duration}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {workout.steps.map((step, i) => (
                        <div
                          key={step}
                          className="flex items-center gap-2.5 rounded-lg bg-muted/30 px-3 py-2 text-[12.5px] active:bg-muted/60"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-[9.5px] font-semibold text-muted-foreground/60">
                            {i + 1}
                          </span>
                          <span className="font-medium">{step}</span>
                        </div>
                      ))}
                    </div>
                    {isToday && (
                      <div className="mt-3">
                        <SwipeToStart
                          onComplete={() =>
                            navigate(
                              scheduledWorkout
                                ? `/workout/active/${scheduledWorkout.id}`
                                : "/workout/active"
                            )
                          }
                          label="Start workout"
                          variant="default"
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── Meal icon ────────────────────────────────────────────────────────────────

const MEAL_ICON: Record<string, React.FC<any>> = {
  breakfast: Coffee as React.FC<any>,
  lunch: ForkKnife as React.FC<any>,
  dinner: Moon as React.FC<any>,
  snack: Cookie as React.FC<any>,
}

// ─── Swipe-to-delete row ─────────────────────────────────────────────────────

function SwipeRow({
  entry,
  onDelete,
}: {
  entry: FoodLogEntry
  onDelete: () => void
}) {
  const [tx, setTx] = React.useState(0)
  const startX = React.useRef(0)
  const dragging = React.useRef(false)
  const THRESHOLD = 72

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX
    dragging.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    const delta = Math.min(0, e.clientX - startX.current)
    setTx(delta)
  }

  function onPointerUp() {
    dragging.current = false
    if (tx < -THRESHOLD) setTx(-THRESHOLD)
    else setTx(0)
  }

  const revealed = tx <= -THRESHOLD

  return (
    <div className="relative overflow-hidden">
      <div
        className="absolute inset-y-0 right-0 flex w-16 items-center justify-center bg-destructive/90"
        style={{ borderRadius: "0 8px 8px 0" }}
      >
        <Trash size={14} weight="fill" className="text-white" />
      </div>
      <div
        className="relative flex touch-pan-y items-center gap-2 bg-background py-[5px] transition-transform duration-150 ease-out"
        style={{ transform: `translateX(${tx}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/80">
          {entry.name}
        </p>
        <span className="shrink-0 text-[12px] font-medium text-foreground/55 tabular-nums">
          {entry.calories}
        </span>
        {revealed && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
            className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive transition-colors active:bg-destructive/30"
          >
            <X size={9} weight="bold" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Logged today card ────────────────────────────────────────────────────────

function LoggedTodayCard({
  dayOffset,
  timeZone,
  entries,
  onEntriesChange,
}: {
  dayOffset: number
  timeZone: string
  entries: FoodLogEntry[]
  onEntriesChange: (entries: FoodLogEntry[]) => void
}) {
  const date = dateForOffset(dayOffset, timeZone)

  function handleRemove(id: string) {
    onEntriesChange(entries.filter((e) => e.id !== id))
  }

  const sorted = [...entries].sort((a, b) =>
    a.loggedAt.localeCompare(b.loggedAt)
  )
  const total = entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.calories,
      p: acc.p + e.protein,
      c: acc.c + e.carbs,
      f: acc.f + e.fat,
    }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  )

  // Group by meal category
  const cats = DEFAULT_MEAL_CATEGORIES
  const byMeal = new Map<string, FoodLogEntry[]>()
  for (const e of sorted) {
    if (!byMeal.has(e.meal)) byMeal.set(e.meal, [])
    byMeal.get(e.meal)!.push(e)
  }
  const groups = DEFAULT_MEAL_CATEGORIES
    .filter((c) => byMeal.has(c.id))
    .map((c) => ({ cfg: c, entries: byMeal.get(c.id)! }))

  return (
    <Card>
      <div className="px-4 py-3.5">
        <div className="mb-2.5">
          <CardTitle className="text-sm font-semibold">
            {dayOffset === 0 ? "Logged today" : "Food log"}
          </CardTitle>
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-7 text-center">
            <ForkKnife
              size={28}
              style={{
                color: "color-mix(in srgb, var(--foreground) 11%, transparent)",
              }}
            />
            <p className="text-[13px] text-muted-foreground/55">
              Nothing here, yet
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {groups.map(({ cfg, entries: ge }) => {
              const gKcal = ge.reduce((s, e) => s + e.calories, 0)
              return (
                <div key={cfg.label}>
                  <div className="mb-0.5 flex items-center justify-between">
                    <span
                      className="text-[9.5px] font-semibold tracking-[0.12em] uppercase"
                      style={{ color: cfg.color }}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-[9.5px] text-muted-foreground/35 tabular-nums">
                      {gKcal} kcal
                    </span>
                  </div>
                  {ge.map((entry) => (
                    <SwipeRow
                      key={entry.id}
                      entry={entry}
                      onDelete={() => handleRemove(entry.id)}
                    />
                  ))}
                </div>
              )
            })}
            <div className="flex items-center justify-between border-t border-border/30 pt-2.5">
              <span className="text-[9.5px] font-semibold tracking-[0.12em] text-muted-foreground/45 uppercase">
                Total
              </span>
              <div className="flex items-baseline gap-2">
                {total.p > 0 && (
                  <span className="text-[9.5px] text-muted-foreground/35 tabular-nums">
                    P{Math.round(total.p)} C{Math.round(total.c)} F
                    {Math.round(total.f)}g
                  </span>
                )}
                <span className="text-[14px] font-semibold tabular-nums">
                  {total.kcal}
                  <span className="ml-0.5 text-[10px] font-normal text-muted-foreground/45">
                    {" "}
                    kcal
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── Profile dropdown ─────────────────────────────────────────────────────────

function ProfileDropdown({
  name,
  email,
  settings,
  onChange,
  onResetOnboarding,
  onLogout,
}: {
  name?: string
  email?: string
  settings: DashboardSettings
  onChange: (s: DashboardSettings) => void
  onResetOnboarding: () => void
  onLogout: () => Promise<void>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground transition-opacity active:opacity-70"
          aria-label="Profile"
        >
          {getInitials(name)}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="px-3 py-2.5">
          <p className="text-sm leading-none font-semibold">{name ?? "User"}</p>
          {email && (
            <p className="mt-1 text-xs text-muted-foreground">{email}</p>
          )}
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          Workout focus
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={settings.workoutFocus}
          onValueChange={(v) =>
            onChange({
              ...settings,
              workoutFocus:
                v === "cardio"
                  ? "cardio"
                  : v === "mobility"
                    ? "mobility"
                    : "strength",
            })
          }
        >
          <DropdownMenuRadioItem value="strength">
            Strength
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="cardio">Cardio</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="mobility">
            Mobility
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          Dev tools
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={onResetOnboarding} variant="destructive">
          <Trash size={14} /> Reset onboarding
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void onLogout()}
          variant="destructive"
        >
          <SignOut size={14} /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const [dayOffset, setDayOffset] = useState(0)

  // ── Queries ──────────────────────────────────────────────────────────────

  const onboarding = useQuery(api.users.onboarding.get, {})
  const goalsRes = useQuery(api.logs.calories.getGoals, {})
  const serverPresets = useQuery(api.logs.presets.list, {})
  const schedule = useQuery(api.users.schedules.get, {})
  const preferences = useQuery(api.users.users.getPreferences, {})
  const bodyMeasurements = useQuery(api.bodyProgress.list, {})

  const activeTimezone = preferences?.lastActiveTimezone || "UTC"
  const todayKey = currentDateKey(activeTimezone)
  const selectedDate = useMemo(() => offsetDateKey(todayKey, dayOffset), [dayOffset, todayKey])

  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date: selectedDate })
  const workoutLogsQuery = useQuery(api.logs.workouts.getLog, { date: selectedDate })

  const syncTimezone = useMutation(api.users.users.syncTimezone)
  const clearOnboarding = useMutation(api.users.onboarding.clear)
  const setDashboardSettings = useMutation(api.users.users.setDashboardSettings)
  const setDay = useMutation(api.logs.foodLogs.setDay)

  // ── Dashboard settings ───────────────────────────────────────────────────

  const settings: DashboardSettings = useMemo(() => {
    return (preferences?.dashboardSettings as DashboardSettings) || { workoutFocus: "strength" }
  }, [preferences])

  // ── Mappings ──────────────────────────────────────────────────────────────

  const calorieInfo = useMemo(() => {
    if (!goalsRes) return null
    return {
      target: Math.round(goalsRes.targetCalories),
      bmr: Math.round(goalsRes.bmr),
      tdee: Math.round(goalsRes.tdee),
      protein: Math.round(goalsRes.protein),
      carbs: Math.round(goalsRes.carbs),
      fat: Math.round(goalsRes.fat),
    }
  }, [goalsRes])

  const storedPresets = useMemo(() => {
    return (serverPresets ?? [])
      .map((preset) =>
        normalizePresetCard({
          id: preset.id ?? preset._id ?? "",
          name: preset.name,
          focus: preset.focus,
          duration: preset.duration,
          steps: preset.steps,
        })
      )
      .filter((preset) => preset.id.length > 0)
  }, [serverPresets])

  const storedRoutine = useMemo(() => {
    return (schedule?.routine as Routine) || EMPTY_WORKOUT_ROUTINE
  }, [schedule])

  const workoutLogs = useMemo(() => workoutLogsQuery ? [workoutLogsQuery] as CachedWorkoutLog[] : [], [workoutLogsQuery])
  const foodEntries = useMemo(() => (foodLogs ?? []) as FoodLogEntry[], [foodLogs])

  const loading = onboarding === undefined || goalsRes === undefined || preferences === undefined

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    void syncTimezone({ timeZone: detectTimeZone() })
  }, [syncTimezone])

  const now = new Date()
  const firstName = session?.user?.name?.trim().split(/\s+/)[0] ?? "there"
  const salutation = greeting(hourInTimeZone(now, activeTimezone))
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: activeTimezone,
  })

  const scheduledWorkout = useMemo(() => {
    const day = dateKeyToDay(selectedDate, activeTimezone)
    const presetId = storedRoutine[day]
    return storedPresets.find((preset) => preset.id === presetId) ?? null
  }, [activeTimezone, selectedDate, storedPresets, storedRoutine])

  const [todayWorkoutCollapsed, setTodayWorkoutCollapsed] = useState(false)
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<1 | 2 | null>(null)
  const [homeAddOpen, setHomeAddOpen] = useState(false)
  const [snapOffline, setSnapOffline] = useState(false)

  return (
    <div className="min-h-svh bg-background">
      <div className="page-enter mx-auto flex max-w-lg flex-col pb-24">
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-12 pb-4">
          <div>
            <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground/60 uppercase">
              {dateLabel}
            </p>
            <h1 className="mt-0.5 text-[1.5rem] leading-snug font-semibold tracking-tight">
              {salutation}, {firstName}.
            </h1>
          </div>
          <div>
            <ProfileDropdown
              name={session?.user?.name}
              email={session?.user?.email}
              settings={settings}
              onChange={(s) => void setDashboardSettings(s)}
              onResetOnboarding={() => {
                void clearOnboarding({})
                navigate("/onboarding", { replace: true })
              }}
              onLogout={async () => {
                await authClient.signOut()
                navigate("/login", { replace: true })
              }}
            />
          </div>
        </header>

        {bodyMeasurements !== undefined && bodyMeasurements.length === 0 && (
          <CheckInPrompt 
            reminderEnabled={preferences?.bodyReminder?.enabled ?? false} 
            reminderLabel={preferences?.bodyReminder ? formatReminderLabel(preferences.bodyReminder) : ""}
          />
        )}

        {/* Cards */}
        <main className="flex flex-col gap-3 px-4">
          <CalorieCard
            info={calorieInfo}
            loading={loading}
            entries={foodEntries}
            dayOffset={dayOffset}
            timeZone={activeTimezone}
            onDayOffsetChange={setDayOffset}
          />
          <WorkoutCard
            settings={settings}
            dayOffset={dayOffset}
            scheduledWorkout={scheduledWorkout}
            timeZone={activeTimezone}
            workoutLogs={dayOffset === 0 ? workoutLogs : []}
            collapsed={dayOffset === 0 ? todayWorkoutCollapsed : false}
            onToggleCollapse={() => {
              if (dayOffset === 0) setTodayWorkoutCollapsed((value) => !value)
            }}
            onDeleteSlot={(slot) => setConfirmDeleteSlot(slot)}
          />
          <LoggedTodayCard
            dayOffset={dayOffset}
            timeZone={activeTimezone}
            entries={foodEntries}
            onEntriesChange={(entries) => void setDay({ date: selectedDate, entries })}
          />
          <ProgressCard />
        </main>
      </div>

      <BottomBar onAdd={() => setHomeAddOpen(true)} />

      {homeAddOpen && (
        <MobileSheet
          onClose={() => setHomeAddOpen(false)}
          overlayClassName="bg-black/50 backdrop-blur-[8px]"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
          panelStyle={{
            paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
          }}
        >
          <div className="px-4 pt-1 pb-4">
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setHomeAddOpen(false)
                  navigate("/camera?mode=barcode")
                }}
                className="relative overflow-hidden rounded-2xl bg-foreground px-4 pt-3.5 pb-4 text-left text-background transition-opacity active:opacity-75"
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.055]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, currentColor 0, currentColor 1.5px, transparent 1.5px, transparent 5px)",
                  }}
                />
                <div className="scan-line pointer-events-none absolute right-3 left-3 h-px bg-background/50" />
                <p className="relative text-[9px] font-semibold tracking-[0.18em] uppercase opacity-40">
                  Capture
                </p>
                <p className="relative mt-1.5 text-[15px] leading-snug font-semibold tracking-tight">
                  Scan
                  <br />
                  Barcode
                </p>
                <Barcode
                  size={15}
                  weight="bold"
                  className="absolute right-3.5 bottom-3.5 opacity-25"
                />
              </button>

              <button
                onClick={() => {
                  if (!navigator.onLine) {
                    setSnapOffline(true)
                    return
                  }
                  setSnapOffline(false)
                  setHomeAddOpen(false)
                  navigate("/camera")
                }}
                className="relative overflow-hidden rounded-2xl bg-foreground/[0.055] px-5 pt-5 pb-6 text-left ring-1 ring-foreground/[0.07] transition-colors active:bg-foreground/[0.10]"
              >
                <div className="pointer-events-none absolute top-3 left-3 h-4 w-4 border-t-[1.5px] border-l-[1.5px] border-foreground/30" />
                <div className="pointer-events-none absolute top-3 right-3 h-4 w-4 border-t-[1.5px] border-r-[1.5px] border-foreground/30" />
                <div className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 border-b-[1.5px] border-l-[1.5px] border-foreground/30" />
                <div className="pointer-events-none absolute right-3 bottom-3 h-4 w-4 border-r-[1.5px] border-b-[1.5px] border-foreground/30" />
                <p className="relative text-[9px] font-semibold tracking-[0.18em] text-muted-foreground/50 uppercase">
                  Capture
                </p>
                <p className="relative mt-5 text-[15px] leading-snug font-semibold tracking-tight">
                  Snap
                  <br />
                  and Log
                </p>
                <Aperture
                  size={18}
                  weight="light"
                  className="absolute right-4 bottom-4 opacity-20"
                />
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/50">
              <button
                onClick={() => {
                  setHomeAddOpen(false)
                  navigate("/foods/search")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-muted/40"
              >
                <div className="flex items-center gap-2.5">
                  <MagnifyingGlass size={13} className="shrink-0 text-muted-foreground/50" />
                  <span className="text-[13px] font-medium">Search Food</span>
                </div>
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
              <div className="mx-4 h-px bg-border/50" />
              <button
                onClick={() => {
                  setHomeAddOpen(false)
                  navigate("/foods/recipe/new")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-muted/40"
              >
                <div className="flex items-center gap-2.5">
                  <ForkKnife size={13} className="shrink-0 text-muted-foreground/50" />
                  <span className="text-[13px] font-medium">New Recipe</span>
                </div>
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
              <div className="mx-4 h-px bg-border/50" />
              <button
                onClick={() => {
                  setHomeAddOpen(false)
                  navigate("/workout/active")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-muted/40"
              >
                <div className="flex items-center gap-2.5">
                  <Barbell size={13} className="shrink-0 text-muted-foreground/50" />
                  <span className="text-[13px] font-medium">Log Workout</span>
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
