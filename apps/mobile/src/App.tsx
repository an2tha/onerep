import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Barbell,
  Barcode,
  CaretDown,
  CaretLeft,
  CaretRight,
  Coffee,
  DotsSixVertical,
  Fire,
  ForkKnife,
  Lightning,
  Aperture,
  MagnifyingGlass,
  PencilSimple,
  Pill,
  PintGlass,
  Play,
  Plus,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useAppAuth } from "@/lib/auth-client"
import {
  resolveLayout,
  type WidgetConfig,
  type WidgetId,
} from "@/lib/widget-layout"
import { useQuery, useMutation } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../convex/_generated/api"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { useBottomBarAction } from "@/components/bottom-bar"
import {
  DailyLedgerHero,
  InsightWidgets,
  TodayHeader,
  TodayTimeline,
  type MacroProgress,
  type TimelineEvent,
} from "@/components/home"
import { MobileSheet } from "@/components/mobile-sheet"
import { SwipeToStart } from "@/components/swipe-to-start"
import { SlideToDeleteRow } from "@/components/slide-to-delete-row"
import { useAiFeatureGate } from "@/lib/ai-access"
import { calcStreak, calcWorkoutsThisWeek } from "@/lib/training-consistency"
import {
  compactCardioSummary,
  hasCardioDetails,
  normalizePresetCard,
  type Routine,
  type CachedWorkoutLog,
  type WorkoutPresetCard,
} from "@/lib/workout-sync"
import { getLoggedExerciseId } from "@/lib/exercise-history"
import {
  currentDateKey,
  dateForOffset,
  defaultMeal,
  detectTimeZone,
  nutritionDetailTotals,
  offsetDateKey,
  stripUndefined,
  type FoodLogEntry,
  type Recipe,
  type RecipeIngredient,
  DEFAULT_MEAL_CATEGORIES,
} from "@/lib/food-log"
import {
  filledWaterGlassCount,
  waterAmountNeededForGlass,
  WATER_GLASS_COUNT,
  waterGlassTargetMl,
} from "@/lib/water-glasses"
import {
  SUPPLEMENT_DEFINITIONS,
  SUPPLEMENT_LIST,
  completedSupplementCount,
  formatSupplementAmount,
  supplementEntryLabel,
  supplementTotals,
  type SupplementKind,
  type SupplementLogEntry,
} from "@/lib/supplements"
import {
  Calendar,
  Card,
  CardTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui"
import {
  APP_ACCENT_COLORS,
  MACRO_COLORS,
  MICRO_COLORS,
  tint,
} from "@/lib/design-tokens"

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
  source: "healthProfile" | "onboarding" | "default"
  isTrainingDay?: boolean
  burnedCalories?: number
}

type DashboardStatLine = {
  label: string
  value: string
  progress?: number
  color?: string
}

type DashboardStat = {
  title: string
  value: string
  detail?: string
  lines?: DashboardStatLine[]
  onClick?: () => void
}

type ActiveWorkoutCandidate = {
  slot?: 1 | 2
  completedAt?: number
  abortedAt?: number
  status?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_DAY_OFFSET = -6 // how far back history goes
const ABORTED_WORKOUT_SLOT_KEY = "onerep:aborted-workout-slot"
const DASHBOARD_EMPTY_ICON_CLASS = "size-7 shrink-0 md:size-6"
const DASHBOARD_TILE_ICON_CLASS = "size-[22px] shrink-0 md:size-5"
const DASHBOARD_METRIC_ICON_CLASS = "size-8 shrink-0 md:size-6"
const DASHBOARD_SMALL_METRIC_ICON_CLASS = "size-[22px] shrink-0 md:size-5"
const COMPLETE_COLOR = APP_ACCENT_COLORS.complete
const COMPLETE_BG = tint(COMPLETE_COLOR, 13)
const COMPLETE_SOFT_BG = tint(COMPLETE_COLOR, 7)
const CAUTION_COLOR = APP_ACCENT_COLORS.caution
const DANGER_COLOR = APP_ACCENT_COLORS.danger
const FOOD_COLOR = APP_ACCENT_COLORS.food
const FOOD_BG = tint(FOOD_COLOR, 10)
const WATER_COLOR = APP_ACCENT_COLORS.water
const WATER_BG = tint(WATER_COLOR, 13)

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

function totalsForRecipe(ingredients: RecipeIngredient[]) {
  return ingredients.reduce(
    (acc, ingredient) => ({
      calories:
        acc.calories +
        Math.round((ingredient.caloriesPer100 * ingredient.grams) / 100),
      protein:
        acc.protein +
        Math.round((ingredient.proteinPer100 * ingredient.grams) / 100),
      carbs:
        acc.carbs +
        Math.round((ingredient.carbsPer100 * ingredient.grams) / 100),
      fat:
        acc.fat + Math.round((ingredient.fatPer100 * ingredient.grams) / 100),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function readRecentlyAbortedWorkoutSlot(): 1 | 2 | null {
  if (typeof window === "undefined") return null
  const value = window.sessionStorage.getItem(ABORTED_WORKOUT_SLOT_KEY)
  if (value === "1") return 1
  if (value === "2") return 2
  return null
}

function isLiveActiveWorkout(
  workout: ActiveWorkoutCandidate | null | undefined
) {
  if (!workout) return false
  if (workout.completedAt || workout.abortedAt) return false
  const status = workout.status?.toLowerCase()
  return status !== "aborted" && status !== "complete" && status !== "completed"
}

function statPct(value: number, target: number) {
  if (target <= 0) return undefined
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)))
}

function fmtStatNutrient(value: number | undefined, unit: "g" | "mg" | "mcg") {
  const safe = Number.isFinite(value) ? Math.max(0, value ?? 0) : 0
  if (unit === "g") {
    return `${safe >= 10 ? Math.round(safe) : safe.toFixed(1).replace(/\.0$/, "")}g`
  }
  if (unit === "mg") return `${Math.round(safe).toLocaleString("en-US")}mg`
  return `${Math.round(safe).toLocaleString("en-US")}mcg`
}

function ProgressCard() {
  const navigate = useSmoothNavigate()
  const measurements = useQuery(api.bodyProgress.list, {})
  const latest =
    measurements && measurements.length > 0
      ? measurements[measurements.length - 1]
      : null

  return (
    <Card>
      <button
        onClick={() => navigate("/progress")}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors active:bg-muted/20"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold">Body progress</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground/60">
            {latest?.weightKg != null
              ? `Latest check-in: ${latest.weightKg.toFixed(1)} kg on ${new Date(`${latest.loggedAt}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
              : "Log weight, body fat, waist, and more to see your trend."}
          </p>
        </div>
        <div className="rounded-[10px] bg-foreground/[0.06] px-3 py-2">
          <span className="text-[11px] font-semibold">Open</span>
        </div>
      </button>
    </Card>
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
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(MIN_DAY_OFFSET, offset - 1))}
        disabled={offset <= MIN_DAY_OFFSET}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted/45 active:text-foreground disabled:opacity-25"
        aria-label="Previous day"
      >
        <CaretLeft size={14} weight="bold" />
      </button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="min-h-10 min-w-[84px] rounded-lg px-2 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground active:bg-muted/45 active:text-foreground">
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
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted/45 active:text-foreground disabled:opacity-25"
        aria-label="Next day"
      >
        <CaretRight size={14} weight="bold" />
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
  const hasCalculatedBaseline = (info?.bmr ?? 0) > 0 && (info?.tdee ?? 0) > 0
  const bmr = hasCalculatedBaseline ? info!.bmr : 1480
  const tdee = hasCalculatedBaseline ? info!.tdee : 2100
  const sourceLabel =
    info?.source === "healthProfile"
      ? "profile"
      : info?.source === "onboarding"
        ? "estimated"
        : "default"
  const consumedTotals = totalsForEntries(entries)
  const consumed = consumedTotals.calories
  const remaining = Math.max(0, target - consumed)
  const pct =
    target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0

  const { protein, carbs, fat } = consumedTotals

  return (
    <Card>
      <div className="px-4 py-2.5">
        {/* Header row */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-semibold">Calories</CardTitle>
            {info?.isTrainingDay && (
              <div
                className="rounded-full px-1.5 py-0.5 text-[8px] font-bold tracking-wider uppercase"
                style={{ backgroundColor: FOOD_BG, color: FOOD_COLOR }}
              >
                Training Day
              </div>
            )}
          </div>
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
                <span className="text-[1.5rem] leading-none font-bold tracking-tight tabular-nums">
                  {fmtKcal(consumed)}
                </span>
                <span className="ml-1 text-[11px] text-muted-foreground/50">
                  kcal
                </span>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    "text-[1rem] leading-none font-semibold tabular-nums",
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
                  {info?.burnedCalories ? (
                    <span
                      className="ml-1"
                      style={{
                        color: `color-mix(in srgb, ${COMPLETE_COLOR} 62%, transparent)`,
                      }}
                    >
                      (+{info.burnedCalories} activity)
                    </span>
                  ) : null}
                </p>
              </div>
            </div>

            {/* Hairline progress */}
            <div className="relative mt-2.5 h-[2px] rounded-sm bg-muted/40">
              <div
                className="motion-progress-fill absolute inset-y-0 left-0 rounded-sm"
                style={{
                  width: barMounted ? `${pct}%` : "0%",
                  backgroundColor:
                    consumed > target ? DANGER_COLOR : "var(--foreground)",
                  opacity: 0.45,
                }}
              />
            </div>
            <p className="mt-1 text-[9.5px] text-muted-foreground/30 tabular-nums">
              of {fmtKcal(target)} {sourceLabel} goal
            </p>

            {/* Macro pills row */}
            <div className="mt-2.5 flex items-center gap-3 border-t border-border/20 pt-2.5">
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
                className="ml-auto flex min-h-10 items-center gap-1 rounded-lg px-2 text-[10px] text-muted-foreground/45 transition-colors active:bg-muted/45 active:text-muted-foreground/70"
                aria-expanded={breakdownOpen}
              >
                <CaretDown
                  size={10}
                  weight="bold"
                  className={cn(
                    "transition-transform duration-200",
                    breakdownOpen && "rotate-180"
                  )}
                />
                {hasCalculatedBaseline ? "BMR/TDEE" : "Est. BMR/TDEE"}
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
  const durationMin = Math.floor(log.durationSeconds / 60)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[9.5px] font-bold tracking-widest uppercase"
          style={{ backgroundColor: COMPLETE_BG, color: COMPLETE_COLOR }}
        >
          Done
        </span>
        <span className="text-[11px] text-muted-foreground/60">
          Workout {slot} · {durationMin} min
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {completedExercises.map((ex) => {
          const isCardio = hasCardioDetails(ex.cardio)
          const id = getLoggedExerciseId(ex) ?? ex.name
          return (
            <div
              key={id}
              className="flex items-center gap-2.5 rounded-lg px-3 py-1.5"
              style={{ backgroundColor: COMPLETE_SOFT_BG }}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
                style={{
                  backgroundColor: tint(COMPLETE_COLOR, 20),
                  color: COMPLETE_COLOR,
                }}
              >
                ✓
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[12.5px] font-medium"
                style={{ color: COMPLETE_COLOR }}
              >
                {ex.name}
              </span>
              <span
                className="max-w-[8.5rem] shrink truncate text-right text-[10.5px] tabular-nums"
                style={{
                  color: `color-mix(in srgb, ${COMPLETE_COLOR} 54%, transparent)`,
                }}
              >
                {isCardio
                  ? compactCardioSummary(ex.cardio, ex.cardio?.distanceUnit)
                  : `${(ex.sets ?? []).filter((s) => s.completed).length}/${ex.sets?.length ?? 0}`}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[9.5px] text-muted-foreground/40">
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
  const navigate = useSmoothNavigate()
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
      <div className="px-4 py-2.5">
        {/* ── Header ── */}
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            {done && workoutLogs.length === 1 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase"
                style={{ backgroundColor: COMPLETE_BG, color: COMPLETE_COLOR }}
              >
                Done
              </span>
            )}
            {done && workoutLogs.length === 2 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase"
                style={{ backgroundColor: COMPLETE_BG, color: COMPLETE_COLOR }}
              >
                2× Done
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isToday && done && (
              <button
                onClick={() => onDeleteSlot(workoutLogs.length === 2 ? 2 : 1)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors active:bg-destructive/10 active:text-destructive"
                aria-label="Delete workout"
              >
                <Trash size={15} />
              </button>
            )}
            {isToday && (
              <button
                onClick={onToggleCollapse}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/45 transition-colors active:bg-muted/40 active:text-foreground"
                aria-label={collapsed ? "Expand" : "Collapse"}
              >
                <CaretDown
                  size={15}
                  className={cn(
                    "transition-transform duration-300",
                    !collapsed && "rotate-180"
                  )}
                />
              </button>
            )}
            {!isToday && (
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors active:text-foreground"
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
                        "transform var(--motion-panel) var(--motion-ease-out)",
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
                      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-muted/45"
                      aria-label={`Workout ${i + 1}`}
                    >
                      <span
                        className={cn(
                          "rounded-full transition-all duration-300",
                          slide === i
                            ? "h-1.5 w-4 bg-foreground/50"
                            : "h-1.5 w-1.5 bg-foreground/20"
                        )}
                      />
                    </button>
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
                  <div className="flex flex-col items-center gap-2 py-5 text-center">
                    <Barbell
                      size={28}
                      className={cn(
                        DASHBOARD_EMPTY_ICON_CLASS,
                        "text-muted-foreground/20"
                      )}
                    />
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
                        {"title" in workout ? workout.title : workout.name}
                      </p>
                      <span className="text-[11px] text-muted-foreground/50">
                        {workout.duration}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {workout.steps.map((step, i) => (
                        <div
                          key={step}
                          className="flex items-center gap-2.5 rounded-lg bg-muted/30 px-3 py-1.5 text-[12.5px] active:bg-muted/60"
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

// ─── Swipe-to-delete row ─────────────────────────────────────────────────────

function SwipeRow({
  entry,
  onDelete,
}: {
  entry: FoodLogEntry
  onDelete: () => void
}) {
  const navigate = useSmoothNavigate()
  const canEditRecipe = Boolean(entry.recipeId || entry.recipeDraft)

  function editRecipe() {
    if (entry.recipeId) {
      navigate(`/foods/recipe/${entry.recipeId}`)
      return
    }
    if (entry.recipeDraft) {
      navigate("/foods/recipe/new", {
        state: { draftRecipe: entry.recipeDraft },
      })
    }
  }

  return (
    <SlideToDeleteRow
      deleteLabel={`Delete ${entry.name}`}
      onDelete={onDelete}
      actionClassName="rounded-r-lg"
      rowClassName="flex items-center gap-2 bg-background py-[5px]"
    >
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/80">
        {entry.name}
      </p>
      {canEditRecipe && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            editRecipe()
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/55 text-muted-foreground/55 transition-opacity active:opacity-70"
          aria-label={`Edit recipe for ${entry.name}`}
        >
          <PencilSimple size={11} weight="bold" />
        </button>
      )}
      <span className="shrink-0 text-[12px] font-medium text-foreground/55 tabular-nums">
        {entry.calories}
      </span>
    </SlideToDeleteRow>
  )
}

// ─── Logged today card ────────────────────────────────────────────────────────

function LoggedTodayCard({
  dayOffset,
  timeZone: _timeZone,
  entries,
  onEntriesChange,
}: {
  dayOffset: number
  timeZone: string
  entries: FoodLogEntry[]
  onEntriesChange: (entries: FoodLogEntry[]) => void
}) {
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
  const byMeal = new Map<string, FoodLogEntry[]>()
  for (const e of sorted) {
    if (!byMeal.has(e.meal)) byMeal.set(e.meal, [])
    byMeal.get(e.meal)!.push(e)
  }
  const groups = DEFAULT_MEAL_CATEGORIES.filter((c) => byMeal.has(c.id)).map(
    (c) => ({ cfg: c, entries: byMeal.get(c.id)! })
  )

  return (
    <Card>
      <div className="px-4 py-2.5">
        <div className="mb-2">
          <CardTitle className="text-sm font-semibold">
            {dayOffset === 0 ? "Logged today" : "Food log"}
          </CardTitle>
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-5 text-center">
            <ForkKnife
              size={28}
              className={DASHBOARD_EMPTY_ICON_CLASS}
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

// ─── Water widget ─────────────────────────────────────────────────────────────

function fmtWater(ml: number): string {
  if (ml >= 1000) {
    const l = ml / 1000
    return l % 1 === 0 ? `${l} L` : `${l.toFixed(1)} L`
  }
  return `${ml} ml`
}

function WaterWidget({ dateKey }: { dateKey: string }) {
  const navigate = useSmoothNavigate()
  const [hoveredGlass, setHoveredGlass] = useState<number | null>(null)
  const preferences = useQuery(api.users.users.getPreferences)
  const goalMl = preferences?.waterGoalMl ?? 2500

  const rawEntries = useQuery(api.logs.water.getDay, { date: dateKey })
  const setWaterDay = useOfflineMutation(
    api.logs.water.setDay,
    "logs.water.setDay"
  )

  const entries = (rawEntries ?? []) as {
    id: string
    amountMl: number
    loggedAt: string
  }[]
  const totalMl = entries.reduce((s, e) => s + e.amountMl, 0)
  const mlPerGlass = waterGlassTargetMl(goalMl, 1)
  const filledCount = filledWaterGlassCount(totalMl, goalMl)
  const previewFilledCount =
    hoveredGlass === null
      ? filledCount
      : Math.max(filledCount, hoveredGlass + 1)

  function addWater(amountMl: number) {
    if (amountMl <= 0) return
    const entry = {
      id: crypto.randomUUID(),
      amountMl,
      loggedAt: new Date().toISOString(),
    }
    void setWaterDay({ date: dateKey, entries: [...entries, entry] })
  }

  function addGlass() {
    if (filledCount >= WATER_GLASS_COUNT) {
      addWater(mlPerGlass)
      return
    }
    addWater(waterAmountNeededForGlass(totalMl, goalMl, filledCount + 1))
  }

  function fillToGlass(index: number) {
    addWater(waterAmountNeededForGlass(totalMl, goalMl, index + 1))
  }

  function removeLastEntry() {
    if (entries.length === 0) return
    const sorted = [...entries].sort((a, b) =>
      b.loggedAt.localeCompare(a.loggedAt)
    )
    void setWaterDay({ date: dateKey, entries: sorted.slice(1) })
  }

  return (
    <Card>
      <div className="px-4 py-2.5">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Water</CardTitle>
          <button
            onClick={() => navigate("/water")}
            className="flex min-h-10 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium text-muted-foreground/45 active:bg-muted/45 active:text-muted-foreground/70"
          >
            Open
            <CaretRight size={10} weight="bold" />
          </button>
        </div>

        {/* 2×4 glass grid */}
        <div
          className="grid grid-cols-4 gap-2"
          onPointerLeave={() => setHoveredGlass(null)}
        >
          {Array.from({ length: WATER_GLASS_COUNT }, (_, i) => {
            const filled = i < filledCount
            const previewFilled = i < previewFilledCount
            return (
              <button
                key={i}
                onClick={filled ? removeLastEntry : () => fillToGlass(i)}
                onPointerEnter={() => setHoveredGlass(i)}
                onFocus={() => setHoveredGlass(i)}
                onBlur={() => setHoveredGlass(null)}
                className={cn(
                  "flex items-center justify-center rounded-xl py-2.5 transition-all active:scale-[0.985]",
                  previewFilled ? "" : "bg-muted/25"
                )}
                style={
                  previewFilled ? { backgroundColor: WATER_BG } : undefined
                }
                aria-label={
                  filled
                    ? "Remove last water entry"
                    : `Fill to ${fmtWater(waterGlassTargetMl(goalMl, i + 1))}`
                }
              >
                <PintGlass
                  size={22}
                  weight={previewFilled ? "fill" : "regular"}
                  style={{ color: previewFilled ? WATER_COLOR : undefined }}
                  className={cn(
                    DASHBOARD_TILE_ICON_CLASS,
                    !previewFilled && "text-muted-foreground/20"
                  )}
                />
              </button>
            )
          })}
        </div>

        {/* Summary + more button */}
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/40 tabular-nums">
            {fmtWater(totalMl)} / {fmtWater(goalMl)}
          </p>
          <button
            onClick={addGlass}
            className="min-h-10 rounded-lg bg-muted/40 px-3 text-[10.5px] font-medium text-muted-foreground/60 active:bg-muted/70"
          >
            + More water
          </button>
        </div>
      </div>
    </Card>
  )
}

// ─── Streak card ─────────────────────────────────────────────────────────────

const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const

function StreakCard({
  streak,
  workoutsThisWeek,
  workoutDates,
  today,
}: {
  streak: number
  workoutsThisWeek: number
  workoutDates: Set<string>
  today: Date
}) {
  // Build Mon–Sun for the current week
  const todayDow = today.getUTCDay() // 0=Sun … 6=Sat
  const daysFromMon = todayDow === 0 ? 6 : todayDow - 1
  const monday = new Date(today)
  monday.setUTCDate(today.getUTCDate() - daysFromMon)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const active = streak > 0
  const fireColor = active
    ? FOOD_COLOR
    : "color-mix(in srgb, var(--foreground) 18%, transparent)"

  return (
    <Card>
      <div className="px-4 py-2.5">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Streak</CardTitle>
          {streak > 1 && (
            <span
              className="text-[10px] font-semibold tabular-nums"
              style={{ color: FOOD_COLOR }}
            >
              {streak} days
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Flame + count */}
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <Fire
              size={32}
              weight={active ? "fill" : "regular"}
              style={{ color: fireColor }}
              className={DASHBOARD_METRIC_ICON_CLASS}
            />
            <span
              className="text-[22px] leading-none font-bold tracking-tight tabular-nums"
              style={{
                color: active
                  ? FOOD_COLOR
                  : "color-mix(in srgb, var(--foreground) 30%, transparent)",
              }}
            >
              {streak}
            </span>
          </div>

          {/* Divider */}
          <div className="h-10 w-px bg-border/30" />

          {/* Week dots */}
          <div className="flex flex-1 items-end justify-between gap-1">
            {weekDays.map((iso, i) => {
              const isToday = iso === today.toISOString().slice(0, 10)
              const isFuture = iso > today.toISOString().slice(0, 10)
              const done = workoutDates.has(iso)
              return (
                <div key={iso} className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      "h-5 w-5 rounded-full transition-colors",
                      done ? "" : isFuture ? "bg-muted/20" : "bg-muted/40"
                    )}
                    style={
                      done
                        ? { backgroundColor: FOOD_COLOR }
                        : isToday
                          ? {
                              boxShadow:
                                "inset 0 0 0 1.5px color-mix(in srgb, var(--foreground) 20%, transparent)",
                            }
                          : undefined
                    }
                  />
                  <span
                    className={cn(
                      "text-[8.5px] font-medium",
                      isToday
                        ? "text-foreground/60"
                        : "text-muted-foreground/30"
                    )}
                  >
                    {WEEK_LABELS[i]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer label */}
        <p className="mt-2.5 text-[10px] text-muted-foreground/35">
          {workoutsThisWeek === 0
            ? "No workouts logged this week yet"
            : workoutsThisWeek === 1
              ? "1 workout this week"
              : `${workoutsThisWeek} workouts this week`}
        </p>
      </div>
    </Card>
  )
}

// ─── Small widget variants ────────────────────────────────────────────────────

function CalorieSmall({
  consumed,
  target,
  protein,
  carbs,
  fat,
  onAdd,
}: {
  consumed: number
  target: number
  protein: number
  carbs: number
  fat: number
  onAdd: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressStartRef = useRef<number>(0)
  const isPressingRef = useRef(false)
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pct =
    target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0
  const over = consumed > target

  function haptic(pattern: number | number[]) {
    navigator.vibrate?.(pattern)
  }

  function handlePointerDown() {
    isPressingRef.current = true
    pressStartRef.current = Date.now()
    haptic(8)
  }

  function handlePointerUp() {
    if (!isPressingRef.current) return
    isPressingRef.current = false
    const pressDuration = Date.now() - pressStartRef.current

    // Long press (> 300ms) triggers add
    if (pressDuration >= 300) {
      haptic(15)
      onAdd()
      return
    }

    // Short tap toggles expansion
    haptic([12, 30, 18])
    if (expanded) {
      setExpanded(false)
    } else {
      setExpanded(true)
      // Auto-collapse after showing overview
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current)
      expandTimeoutRef.current = setTimeout(() => {
        setExpanded(false)
      }, 1800)
    }
  }

  function handlePointerLeave() {
    isPressingRef.current = false
  }

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current)
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current)
    }
  }, [])

  return (
    <Card className="h-full overflow-hidden">
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onClick={() => {
          // Only trigger onClick if we didn't handle the press/release above
          // This prevents double-firing when tapping
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="group relative flex h-full w-full flex-col justify-between px-3.5 py-3 text-left"
      >
        {/* Base state */}
        <div
          className={cn(
            "flex w-full items-start justify-between transition-opacity duration-200",
            expanded && "opacity-0"
          )}
        >
          <p className="text-[10px] font-semibold text-muted-foreground/50">
            Calories
          </p>
          <Plus size={10} className="mt-0.5 text-muted-foreground/25" />
        </div>
        <div
          className={cn(
            "w-full transition-opacity duration-200",
            expanded && "opacity-0"
          )}
        >
          <div className="flex items-baseline gap-1">
            <span className="text-[1.35rem] leading-none font-bold tracking-tight tabular-nums">
              {fmtKcal(consumed)}
            </span>
            <span className="text-[9.5px] text-muted-foreground/40">kcal</span>
          </div>
          <div className="mt-2 h-[2px] w-full rounded bg-muted/40">
            <div
              className="motion-progress-fill h-full rounded"
              style={{
                width: `${pct}%`,
                backgroundColor: over ? DANGER_COLOR : "var(--foreground)",
                opacity: 0.45,
              }}
            />
          </div>
          <p className="mt-1 text-[9px] text-muted-foreground/30 tabular-nums">
            {over
              ? `+${fmtKcal(consumed - target)} over`
              : `${fmtKcal(target - consumed)} left`}
          </p>
        </div>

        {/* Expanded overview overlay */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-center px-3.5 py-3 transition-all duration-250 ease-out",
            expanded
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-2 opacity-0"
          )}
        >
          {/* Calories hero */}
          <div className="flex items-baseline gap-1">
            <span className="text-[1.4rem] leading-none font-bold tracking-tight tabular-nums">
              {fmtKcal(consumed)}
            </span>
            <span className="text-[10px] text-muted-foreground/50">kcal</span>
          </div>

          {/* Macro pills */}
          <div className="mt-2.5 flex items-center gap-3">
            <div className="flex items-baseline gap-0.5">
              <span
                className="text-[9px] font-semibold"
                style={{ color: MACRO_COLORS.protein, opacity: 0.85 }}
              >
                P
              </span>
              <span className="text-[12px] font-semibold tabular-nums">
                {Math.round(protein)}
              </span>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span
                className="text-[9px] font-semibold"
                style={{ color: MACRO_COLORS.carbs, opacity: 0.85 }}
              >
                C
              </span>
              <span className="text-[12px] font-semibold tabular-nums">
                {Math.round(carbs)}
              </span>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span
                className="text-[9px] font-semibold"
                style={{ color: MACRO_COLORS.fat, opacity: 0.85 }}
              >
                F
              </span>
              <span className="text-[12px] font-semibold tabular-nums">
                {Math.round(fat)}
              </span>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="mt-2 h-[2px] w-full rounded bg-muted/40">
            <div
              className="motion-progress-fill h-full rounded"
              style={{
                width: `${pct}%`,
                backgroundColor: over ? DANGER_COLOR : "var(--foreground)",
                opacity: 0.45,
              }}
            />
          </div>
          <p className="mt-1 text-[9px] text-muted-foreground/35 tabular-nums">
            {pct}% of {fmtKcal(target)}
          </p>
        </div>
      </button>
    </Card>
  )
}

function WaterSmall({ dateKey, goalMl }: { dateKey: string; goalMl: number }) {
  const [hoveredGlass, setHoveredGlass] = useState<number | null>(null)
  const rawEntries = useQuery(api.logs.water.getDay, { date: dateKey })
  const entries = (rawEntries ?? []) as {
    id: string
    amountMl: number
    loggedAt: string
  }[]
  const setWaterDay = useOfflineMutation(
    api.logs.water.setDay,
    "logs.water.setDay"
  )
  const totalMl = entries.reduce((s, e) => s + e.amountMl, 0)
  const filledCount = filledWaterGlassCount(totalMl, goalMl)
  const previewFilledCount =
    hoveredGlass === null
      ? filledCount
      : Math.max(filledCount, hoveredGlass + 1)

  function addWater(amountMl: number) {
    if (amountMl <= 0) return
    const entry = {
      id: crypto.randomUUID(),
      amountMl,
      loggedAt: new Date().toISOString(),
    }
    void setWaterDay({ date: dateKey, entries: [...entries, entry] })
  }

  function fillToGlass(index: number) {
    addWater(waterAmountNeededForGlass(totalMl, goalMl, index + 1))
  }

  function removeLastGlass() {
    if (entries.length === 0) return
    const sorted = [...entries].sort((a, b) =>
      b.loggedAt.localeCompare(a.loggedAt)
    )
    void setWaterDay({ date: dateKey, entries: sorted.slice(1) })
  }

  return (
    <Card className="h-full">
      <div className="flex h-full flex-col justify-between px-3.5 py-3">
        <div className="flex items-start justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground/50">
            Water
          </p>
          <p className="text-[9px] text-muted-foreground/30 tabular-nums">
            {filledCount}/{WATER_GLASS_COUNT}
          </p>
        </div>
        <div>
          <div
            className="grid grid-cols-4 gap-1"
            onPointerLeave={() => setHoveredGlass(null)}
          >
            {Array.from({ length: WATER_GLASS_COUNT }, (_, i) => {
              const filled = i < filledCount
              const previewFilled = i < previewFilledCount
              return (
                <button
                  key={i}
                  onClick={filled ? removeLastGlass : () => fillToGlass(i)}
                  onPointerEnter={() => setHoveredGlass(i)}
                  onFocus={() => setHoveredGlass(i)}
                  onBlur={() => setHoveredGlass(null)}
                  className={cn(
                    "flex h-6 items-center justify-center rounded transition-all active:scale-[0.985]",
                    previewFilled ? "" : "bg-muted/25 active:bg-muted/50"
                  )}
                  style={
                    previewFilled
                      ? {
                          backgroundColor: tint(WATER_COLOR, 20),
                        }
                      : undefined
                  }
                  aria-label={
                    filled
                      ? "Remove glass"
                      : `Fill to ${fmtWater(waterGlassTargetMl(goalMl, i + 1))}`
                  }
                >
                  <PintGlass
                    size={11}
                    weight={previewFilled ? "fill" : "regular"}
                    style={{ color: previewFilled ? WATER_COLOR : undefined }}
                    className={
                      previewFilled ? undefined : "text-muted-foreground/20"
                    }
                  />
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[9px] text-muted-foreground/30 tabular-nums">
            {fmtWater(totalMl)} / {fmtWater(goalMl)}
          </p>
        </div>
      </div>
    </Card>
  )
}

const SUPPLEMENT_ICON = {
  creatine: Lightning,
  protein: ForkKnife,
  vitamins: Pill,
  caffeine: Coffee,
} as const

function SupplementWidget({
  dateKey,
  entries,
}: {
  dateKey: string
  entries: SupplementLogEntry[]
}) {
  const navigate = useSmoothNavigate()
  const addSupplement = useOfflineMutation(
    api.logs.supplements.addEntry,
    "logs.supplements.addEntry"
  )
  const totals = supplementTotals(entries)
  const doneCount = completedSupplementCount(entries)

  function quickAdd(kind: SupplementKind) {
    const definition = SUPPLEMENT_DEFINITIONS[kind]
    void addSupplement({
      date: dateKey,
      entry: {
        id: crypto.randomUUID(),
        kind,
        amount: definition.defaultAmount,
        unit: definition.unit,
        loggedAt: new Date().toISOString(),
      },
    })
  }

  return (
    <Card>
      <div className="px-4 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-sm font-semibold">Supplements</CardTitle>
            <span className="text-[10px] text-muted-foreground/35 tabular-nums">
              {doneCount}/{SUPPLEMENT_LIST.length}
            </span>
          </div>
          <button
            onClick={() => navigate("/supplements")}
            className="flex min-h-10 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium text-muted-foreground/45 active:bg-muted/45 active:text-muted-foreground/70"
          >
            Open
            <CaretRight size={10} weight="bold" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {SUPPLEMENT_LIST.map((definition) => {
            const Icon = SUPPLEMENT_ICON[definition.kind]
            const total = totals[definition.kind]
            const done = total > 0
            return (
              <button
                key={definition.kind}
                type="button"
                onClick={() => quickAdd(definition.kind)}
                className={cn(
                  "flex min-h-[58px] items-center gap-2 rounded-xl px-3 py-2 text-left transition-transform active:scale-[0.985]",
                  done ? "bg-foreground/[0.055]" : "bg-muted/28"
                )}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: definition.bg,
                    color: definition.color,
                  }}
                >
                  <Icon size={15} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold">
                    {definition.shortLabel}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground/45 tabular-nums">
                    {done
                      ? formatSupplementAmount(total, definition.unit)
                      : formatSupplementAmount(
                          definition.defaultAmount,
                          definition.unit
                        )}
                  </span>
                </span>
                <Plus size={11} className="shrink-0 text-muted-foreground/25" />
              </button>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

function SupplementsSmall({
  entries,
  onOpen,
}: {
  entries: SupplementLogEntry[]
  onOpen: () => void
}) {
  const doneCount = completedSupplementCount(entries)
  const totals = supplementTotals(entries)

  return (
    <Card className="h-full">
      <button
        onClick={onOpen}
        className="flex h-full w-full flex-col justify-between px-3.5 py-3 text-left transition-colors active:bg-muted/20"
      >
        <div className="flex w-full items-start justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground/50">
            Supplements
          </p>
          <Pill
            size={14}
            weight="bold"
            className="mt-0.5 text-[var(--accent-supplement)]"
          />
        </div>
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-[1.35rem] leading-none font-bold tracking-tight tabular-nums">
              {doneCount}
            </span>
            <span className="text-[9.5px] text-muted-foreground/40">
              /{SUPPLEMENT_LIST.length}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[9px] text-muted-foreground/35">
            {formatSupplementAmount(totals.caffeine, "mg")} caffeine
          </p>
        </div>
      </button>
    </Card>
  )
}

const HOLD_DURATION = 650 // ms to fill the ring
const RING_R = 18
const RING_C = 2 * Math.PI * RING_R

function HoldToStartRing({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0)
  const holdingRef = useRef(false)
  const startRef = useRef(0)
  const rafRef = useRef<number>(0)

  function haptic(pattern: number | number[]) {
    navigator.vibrate?.(pattern)
  }

  function startHold(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    holdingRef.current = true
    startRef.current = Date.now()
    haptic(8)

    function tick() {
      if (!holdingRef.current) return
      const pct = Math.min(1, (Date.now() - startRef.current) / HOLD_DURATION)
      setProgress(pct)
      if (pct >= 1) {
        haptic([15, 40, 25])
        holdingRef.current = false
        onComplete()
      } else {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function cancelHold() {
    if (!holdingRef.current) return
    holdingRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setProgress(0)
  }

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  const offset = RING_C * (1 - progress)
  const active = progress > 0

  return (
    <button
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      className="relative flex h-12 w-12 touch-none items-center justify-center rounded-full transition-transform select-none active:scale-[0.985]"
      aria-label="Hold to start workout"
    >
      {/* ring */}
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        className="absolute inset-0"
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* track */}
        <circle
          cx="24"
          cy="24"
          r={RING_R}
          fill="none"
          strokeWidth="2.5"
          className="stroke-foreground/10"
        />
        {/* fill */}
        <circle
          cx="24"
          cy="24"
          r={RING_R}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={offset}
          className="stroke-foreground/70"
          style={{
            transition: active
              ? "none"
              : "stroke-dashoffset var(--motion-medium) var(--motion-ease-out)",
          }}
        />
      </svg>
      {/* play icon */}
      <Play
        size={14}
        weight="fill"
        className={cn(
          "relative transition-opacity",
          active ? "text-foreground/80" : "text-muted-foreground/40"
        )}
      />
    </button>
  )
}

function WorkoutSmall({
  done,
  workoutName,
  isRestDay,
}: {
  done: boolean
  workoutName: string
  isRestDay: boolean
}) {
  const navigate = useSmoothNavigate()
  return (
    <Card className="h-full">
      <div className="flex h-full flex-col justify-between px-3.5 py-3">
        <p className="text-[10px] font-semibold text-muted-foreground/50">
          Workout
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] leading-snug font-semibold tracking-tight">
              {isRestDay ? "Rest day" : workoutName}
            </p>
            <div className="mt-1 flex items-center gap-1">
              <div
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isRestDay && "bg-muted-foreground/20"
                )}
                style={
                  done
                    ? { backgroundColor: COMPLETE_COLOR }
                    : !isRestDay
                      ? { backgroundColor: CAUTION_COLOR }
                      : undefined
                }
              />
              <span className="text-[9px] text-muted-foreground/40">
                {done ? "Done" : isRestDay ? "Rest" : "Hold to start"}
              </span>
            </div>
          </div>
          {!done && !isRestDay && (
            <HoldToStartRing onComplete={() => navigate("/workout/active")} />
          )}
        </div>
      </div>
    </Card>
  )
}

function StreakSmall({ streak }: { streak: number }) {
  const navigate = useSmoothNavigate()
  const active = streak > 0
  return (
    <Card className="h-full">
      <button
        onClick={() => navigate("/workouts")}
        className="flex h-full w-full flex-col justify-between px-3.5 py-3 text-left transition-colors active:bg-muted/20"
      >
        <div className="flex w-full items-start justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground/50">
            Streak
          </p>
          <CaretRight size={9} className="mt-0.5 text-muted-foreground/20" />
        </div>
        <div className="flex items-end gap-2">
          <Fire
            size={22}
            weight={active ? "fill" : "regular"}
            style={{
              color: active
                ? FOOD_COLOR
                : "color-mix(in srgb, var(--foreground) 20%, transparent)",
            }}
            className={DASHBOARD_SMALL_METRIC_ICON_CLASS}
          />
          <div>
            <span
              className="text-[1.35rem] leading-none font-bold tracking-tight tabular-nums"
              style={{
                color: active
                  ? FOOD_COLOR
                  : "color-mix(in srgb, var(--foreground) 35%, transparent)",
              }}
            >
              {streak}
            </span>
            <p className="text-[9px] text-muted-foreground/35">
              {streak === 1 ? "day" : "days"}
            </p>
          </div>
        </div>
      </button>
    </Card>
  )
}

function FoodSmall({
  entries,
  onAdd,
}: {
  entries: FoodLogEntry[]
  onAdd: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const pressStartRef = useRef<number>(0)
  const isPressingRef = useRef(false)
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const total = entries.reduce((s, e) => s + e.calories, 0)
  const meals = new Set(entries.map((e) => e.meal)).size

  function haptic(pattern: number | number[]) {
    navigator.vibrate?.(pattern)
  }

  function handlePointerDown() {
    isPressingRef.current = true
    pressStartRef.current = Date.now()
    haptic(8)
  }

  function handlePointerUp() {
    if (!isPressingRef.current) return
    isPressingRef.current = false
    const pressDuration = Date.now() - pressStartRef.current

    // Long press triggers add
    if (pressDuration >= 300) {
      haptic(15)
      onAdd()
      return
    }

    // Short tap toggles expansion
    haptic([12, 30, 18])
    if (expanded) {
      setExpanded(false)
    } else {
      setExpanded(true)
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current)
      expandTimeoutRef.current = setTimeout(() => {
        setExpanded(false)
      }, 2200)
    }
  }

  function handlePointerLeave() {
    isPressingRef.current = false
  }

  useEffect(() => {
    return () => {
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current)
    }
  }, [])

  // Group entries by meal category
  const sorted = [...entries].sort((a, b) =>
    a.loggedAt.localeCompare(b.loggedAt)
  )
  const byMeal = new Map<string, FoodLogEntry[]>()
  for (const e of sorted) {
    if (!byMeal.has(e.meal)) byMeal.set(e.meal, [])
    byMeal.get(e.meal)!.push(e)
  }
  const groups = DEFAULT_MEAL_CATEGORIES.filter((c) => byMeal.has(c.id)).map(
    (c) => ({ cfg: c, entries: byMeal.get(c.id)! })
  )

  const macroTotals = entries.reduce(
    (acc, e) => ({
      p: acc.p + e.protein,
      c: acc.c + e.carbs,
      f: acc.f + e.fat,
    }),
    { p: 0, c: 0, f: 0 }
  )

  return (
    <Card className="h-full overflow-hidden">
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onContextMenu={(e) => e.preventDefault()}
        className="group relative flex h-full w-full flex-col justify-between px-3.5 py-3 text-left"
      >
        {/* Base state */}
        <div
          className={cn(
            "flex w-full items-start justify-between transition-opacity duration-200",
            expanded && "opacity-0"
          )}
        >
          <p className="text-[10px] font-semibold text-muted-foreground/50">
            Food
          </p>
          <Plus size={10} className="mt-0.5 text-muted-foreground/25" />
        </div>
        <div
          className={cn(
            "transition-opacity duration-200",
            expanded && "opacity-0"
          )}
        >
          <div className="flex items-baseline gap-1">
            <span className="text-[1.35rem] leading-none font-bold tracking-tight tabular-nums">
              {fmtKcal(total)}
            </span>
            <span className="text-[9.5px] text-muted-foreground/40">kcal</span>
          </div>
          <p className="mt-0.5 text-[9px] text-muted-foreground/35">
            {entries.length === 0
              ? "Tap to log food"
              : `${entries.length} item${entries.length !== 1 ? "s" : ""} · ${meals} meal${meals !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Expanded "Logged today" view */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col overflow-hidden transition-all duration-250 ease-out",
            expanded
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-2 opacity-0"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 pt-3">
            <p className="text-[10px] font-semibold text-muted-foreground/50">
              Logged today
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(false)
                haptic(8)
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/40"
              aria-label="Collapse"
            >
              <X size={11} weight="bold" className="text-muted-foreground/50" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-3.5 pb-3">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <ForkKnife size={20} className="text-muted-foreground/20" />
                <p className="mt-1.5 text-[11px] text-muted-foreground/40">
                  Nothing logged yet
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {groups.map(({ cfg, entries: ge }) => (
                  <div key={cfg.label}>
                    <div className="mb-0.5 flex items-center justify-between">
                      <span
                        className="text-[8.5px] font-semibold tracking-[0.1em] uppercase"
                        style={{ color: cfg.color }}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-[8.5px] text-muted-foreground/30 tabular-nums">
                        {ge.reduce((s, e) => s + e.calories, 0)} kcal
                      </span>
                    </div>
                    {ge.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between py-0.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/70">
                          {entry.name}
                        </span>
                        <span className="ml-2 shrink-0 text-[10.5px] font-medium text-foreground/50 tabular-nums">
                          {entry.calories}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Macro totals */}
                <div className="mt-1 flex items-center gap-3 border-t border-border/25 pt-2">
                  <span className="text-[8.5px] font-semibold text-muted-foreground/35">
                    Total
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-bold tabular-nums">
                      {total}
                    </span>
                    <span className="text-[9px] text-muted-foreground/40">
                      kcal
                    </span>
                  </div>
                  {macroTotals.p > 0 && (
                    <span className="text-[9px] text-muted-foreground/30 tabular-nums">
                      P{Math.round(macroTotals.p)} C{Math.round(macroTotals.c)}{" "}
                      F{Math.round(macroTotals.f)}g
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </button>
    </Card>
  )
}

function ProgressSmall({
  measurements,
}: {
  measurements:
    | Array<{ weightKg?: number; loggedAt: string }>
    | null
    | undefined
}) {
  const navigate = useSmoothNavigate()
  const latest =
    measurements && measurements.length > 0
      ? measurements[measurements.length - 1]
      : null

  return (
    <Card className="h-full">
      <button
        onClick={() => navigate("/progress")}
        className="flex h-full w-full flex-col justify-between px-3.5 py-3 text-left transition-colors active:bg-muted/20"
      >
        <div className="flex w-full items-start justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground/50">
            Progress
          </p>
          <CaretRight size={9} className="mt-0.5 text-muted-foreground/20" />
        </div>
        <div>
          {latest?.weightKg != null ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-[1.35rem] leading-none font-bold tracking-tight tabular-nums">
                  {latest.weightKg.toFixed(1)}
                </span>
                <span className="text-[9.5px] text-muted-foreground/40">
                  kg
                </span>
              </div>
              <p className="mt-0.5 text-[9px] text-muted-foreground/35">
                {new Date(`${latest.loggedAt}T12:00:00Z`).toLocaleDateString(
                  "en-US",
                  {
                    month: "short",
                    day: "numeric",
                  }
                )}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">
              Tap to check in
            </p>
          )}
        </div>
      </button>
    </Card>
  )
}

// ─── Stats preview ────────────────────────────────────────────────────────────

function DashboardStatCard({
  stat,
  compact,
}: {
  stat: DashboardStat
  compact: boolean
}) {
  const lines = compact ? stat.lines?.slice(0, 2) : stat.lines
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="app-eyebrow text-[0.62rem] text-muted-foreground/64">
            {stat.title}
          </p>
          <p className="mt-2 truncate text-[1.35rem] leading-none font-extrabold tabular-nums">
            {stat.value}
          </p>
        </div>
        {stat.onClick && (
          <span className="shrink-0 rounded-full bg-muted/50 px-2.5 py-1 text-[10px] font-bold text-muted-foreground/70">
            Open
          </span>
        )}
      </div>
      {stat.detail && (
        <p className="mt-2 line-clamp-2 text-[11.5px] leading-4 font-semibold text-muted-foreground/60">
          {stat.detail}
        </p>
      )}
      {lines && lines.length > 0 && (
        <div className="mt-3 space-y-2">
          {lines.map((line) => (
            <div key={line.label}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-[10.5px] font-semibold text-muted-foreground/62">
                  {line.label}
                </span>
                <span className="shrink-0 text-[10.5px] font-bold text-foreground/72 tabular-nums">
                  {line.value}
                </span>
              </div>
              {line.progress != null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
                  <div
                    className="h-full rounded-full bg-foreground/70"
                    style={{
                      width: `${Math.max(0, Math.min(100, line.progress))}%`,
                      backgroundColor: line.color ?? "var(--foreground)",
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )

  const className = cn(
    "app-surface flex h-full min-h-[8.4rem] w-full flex-col p-3.5 text-left transition-colors active:bg-muted/20",
    compact ? "min-h-[8.4rem]" : "min-h-[10.5rem]"
  )

  if (stat.onClick) {
    return (
      <button type="button" onClick={stat.onClick} className={className}>
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}

// ─── Sortable widget wrapper ──────────────────────────────────────────────────

function SortableWidget({
  id,
  editMode,
  size,
  children,
}: {
  id: WidgetId
  editMode: boolean
  size: "full" | "small"
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={cn(
        "relative flex min-h-0 shrink-0 snap-center basis-[min(84vw,20rem)] md:shrink md:basis-auto md:snap-none",
        size === "full"
          ? "basis-[min(90vw,22rem)] md:col-span-2 md:row-span-2"
          : "md:col-span-1 md:row-span-1"
      )}
    >
      {children}
      {editMode && (
        <div className="pointer-events-none absolute inset-0 z-10 hidden overflow-hidden rounded-[12px] md:flex">
          {/* drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="pointer-events-auto flex w-10 shrink-0 touch-none items-center justify-center bg-foreground/[0.07] text-muted-foreground/50 transition-colors active:bg-foreground/[0.13]"
            aria-label="Drag to reorder"
          >
            <DotsSixVertical size={15} weight="bold" />
          </button>
          <div className="flex-1" />
        </div>
      )}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useSmoothNavigate()
  const { user } = useAppAuth()
  const [dayOffset, setDayOffset] = useState(0)

  // ── Queries ──────────────────────────────────────────────────────────────

  const onboarding = useQuery(api.users.onboarding.get, {})
  const currentUser = useQuery(api.users.users.getCurrentUser, {})
  const preferences = useQuery(api.users.users.getPreferences, {})
  const activeTimezone = preferences?.lastActiveTimezone || "UTC"
  const todayKey = currentDateKey(activeTimezone)
  const selectedDate = useMemo(
    () => offsetDateKey(todayKey, dayOffset),
    [dayOffset, todayKey]
  )

  const effectiveGoals = useQuery(api.users.users.getEffectiveGoals, {
    date: selectedDate,
  })
  const serverPresets = useQuery(api.logs.presets.list, {})
  const schedule = useQuery(api.users.schedules.get, {})
  const bodyMeasurements = useQuery(api.bodyProgress.list, {})
  const workoutHistory = useQuery(api.logs.workouts.getHistory, {})
  const activeWorkouts = useQuery(api.logs.activeWorkout.getAllActive, {})
  const recipesQuery = useQuery(api.logs.recipes.list, {})

  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date: selectedDate })
  const waterLogs = useQuery(api.logs.water.getDay, { date: selectedDate })
  const supplementLogs = useQuery(api.logs.supplements.getDay, {
    date: selectedDate,
  })
  const workoutLogsQuery = useQuery(api.logs.workouts.getLog, {
    date: selectedDate,
  })

  const syncTimezone = useOfflineMutation(
    api.users.users.syncTimezone,
    "users.users.syncTimezone"
  )
  const setDay = useOfflineMutation(
    api.logs.foodLogs.setDay,
    "logs.foodLogs.setDay"
  )
  const addWaterEntry = useOfflineMutation(
    api.logs.water.addEntry,
    "logs.water.addEntry"
  )
  const removeWaterEntry = useOfflineMutation(
    api.logs.water.removeEntry,
    "logs.water.removeEntry"
  )
  const removeSupplementEntry = useOfflineMutation(
    api.logs.supplements.removeEntry,
    "logs.supplements.removeEntry"
  )
  const removeWorkoutBySlot = useMutation(api.logs.workouts.removeBySlot)
  const saveWidgetLayout = useOfflineMutation(
    api.users.users.setWidgetLayout,
    "users.users.setWidgetLayout"
  )

  // ── Dashboard settings ───────────────────────────────────────────────────

  const settings: DashboardSettings = useMemo(() => {
    return (
      (preferences?.dashboardSettings as DashboardSettings) || {
        workoutFocus: "strength",
      }
    )
  }, [preferences])

  // ── Widget layout ─────────────────────────────────────────────────────────

  const [widgetLayout, setWidgetLayout] = useState<WidgetConfig[]>(() =>
    resolveLayout(null)
  )
  // Sync from Convex once loaded (only on initial load)
  const layoutInitialized = useRef(false)
  useEffect(() => {
    if (!layoutInitialized.current && preferences !== undefined) {
      layoutInitialized.current = true
      const stored = preferences?.widgetLayout as WidgetConfig[] | undefined
      setWidgetLayout(resolveLayout(stored))
    }
  }, [preferences])

  const [editMode, setEditMode] = useState(false)
  const statsScrollRef = useRef<HTMLDivElement | null>(null)
  const [statsScrollIndicator, setStatsScrollIndicator] = useState({
    visible: false,
    leftPct: 0,
    thumbPct: 30,
  })

  function updateStatsScrollIndicator() {
    const el = statsScrollRef.current
    if (!el) {
      setStatsScrollIndicator({ visible: false, leftPct: 0, thumbPct: 30 })
      return
    }

    const maxScroll = el.scrollWidth - el.clientWidth
    const visible = maxScroll > 2
    const progress = visible
      ? Math.max(0, Math.min(1, el.scrollLeft / maxScroll))
      : 0
    const thumbPct = visible
      ? Math.max(18, Math.min(70, (el.clientWidth / el.scrollWidth) * 100))
      : 100
    const leftPct = progress * (100 - thumbPct)

    setStatsScrollIndicator((current) => {
      if (
        current.visible === visible &&
        Math.abs(current.leftPct - leftPct) < 0.25 &&
        Math.abs(current.thumbPct - thumbPct) < 0.25
      ) {
        return current
      }

      return { visible, leftPct, thumbPct }
    })
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateStatsScrollIndicator)
    const el = statsScrollRef.current
    let resizeObserver: ResizeObserver | undefined

    if (el && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateStatsScrollIndicator)
      resizeObserver.observe(el)
      Array.from(el.children).forEach((child) => resizeObserver?.observe(child))
    }

    window.addEventListener("resize", updateStatsScrollIndicator)
    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      window.removeEventListener("resize", updateStatsScrollIndicator)
    }
  }, [widgetLayout.length])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = widgetLayout.findIndex((w) => w.id === active.id)
    const newIndex = widgetLayout.findIndex((w) => w.id === over.id)
    const next = arrayMove(widgetLayout, oldIndex, newIndex)
    setWidgetLayout(next)
    void saveWidgetLayout({ layout: next })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Mappings ──────────────────────────────────────────────────────────────

  const calorieInfo = useMemo<CalorieInfo | null>(() => {
    if (!effectiveGoals) return null
    const { effective, health } = effectiveGoals
    return {
      target: Math.round(effective.calories),
      bmr: Math.round(health?.bmr ?? 0),
      tdee: Math.round(health?.tdee ?? 0),
      protein: Math.round(effective.protein),
      carbs: Math.round(effective.carbs),
      fat: Math.round(effective.fat),
      source: health?.source ?? "default",
      isTrainingDay: effectiveGoals.isTrainingDay,
      burnedCalories: effectiveGoals.burnedCalories,
    }
  }, [effectiveGoals])

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

  const workoutLogs = useMemo(
    () =>
      workoutLogsQuery
        ? ([workoutLogsQuery] as unknown as CachedWorkoutLog[])
        : [],
    [workoutLogsQuery]
  )
  const foodEntries = useMemo(
    () => (foodLogs ?? []) as FoodLogEntry[],
    [foodLogs]
  )
  const recipes = useMemo(
    () => (recipesQuery ?? []) as unknown as Recipe[],
    [recipesQuery]
  )
  const waterEntries = useMemo(
    () =>
      (waterLogs ?? []) as { id: string; amountMl: number; loggedAt: string }[],
    [waterLogs]
  )
  const supplementEntries = useMemo(
    () => (supplementLogs ?? []) as SupplementLogEntry[],
    [supplementLogs]
  )

  const loading =
    onboarding === undefined ||
    effectiveGoals === undefined ||
    preferences === undefined

  const now = new Date()

  const workoutDates = useMemo(
    () =>
      new Set((workoutHistory ?? []).map((log: { date: string }) => log.date)),
    [workoutHistory]
  )
  const streak = useMemo(() => calcStreak(workoutDates, now), [workoutDates])
  const workoutsThisWeek = useMemo(
    () => calcWorkoutsThisWeek(workoutDates, now),
    [workoutDates]
  )

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser) return
    void syncTimezone({ timeZone: detectTimeZone() })
  }, [currentUser, syncTimezone])

  useEffect(() => {
    if (currentUser && onboarding === null) {
      navigate("/onboarding", { replace: true })
    }
  }, [currentUser, navigate, onboarding])

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.email ?? "there"
  const salutation = greeting(hourInTimeZone(now, activeTimezone))
  const selectedDateLabel = dayOffsetLabel(dayOffset, activeTimezone)
  const dateLabel = `${selectedDateLabel} · ${dateKeyToCalendarDate(
    selectedDate
  ).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })}`

  const scheduledWorkout = useMemo(() => {
    const day = dateKeyToDay(selectedDate, activeTimezone)
    const presetId = storedRoutine[day]
    return storedPresets.find((preset) => preset.id === presetId) ?? null
  }, [activeTimezone, selectedDate, storedPresets, storedRoutine])

  const [todayWorkoutCollapsed, setTodayWorkoutCollapsed] = useState(false)
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<1 | 2 | null>(null)
  const [homeAddOpen, setHomeAddOpen] = useState(false)
  const [snapOffline, setSnapOffline] = useState(false)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  useBottomBarAction(() => setHomeAddOpen(true))

  function openSnapCamera() {
    if (!requireAiAccess()) return
    if (!navigator.onLine) {
      setSnapOffline(true)
      return
    }
    setSnapOffline(false)
    setHomeAddOpen(false)
    navigate("/camera")
  }

  function logRecipeFromQuickAdd(recipe: Recipe) {
    const totals = totalsForRecipe(recipe.ingredients)
    void setDay({
      date: selectedDate,
      entries: [
        ...foodEntries,
        stripUndefined({
          id: Math.random().toString(36).slice(2),
          name: recipe.name,
          ...totals,
          loggedAt: new Date().toISOString(),
          meal: defaultMeal(),
          recipeId: recipe._id,
        }),
      ],
    })
    setHomeAddOpen(false)
  }

  const foodTotals = useMemo(() => totalsForEntries(foodEntries), [foodEntries])
  const waterGoalMl = preferences?.waterGoalMl ?? 2500
  const waterTotalMl = waterEntries.reduce(
    (sum, entry) => sum + entry.amountMl,
    0
  )
  const caloriesTarget = calorieInfo?.target ?? 2000
  const caloriesLeft = Math.round(caloriesTarget - foodTotals.calories)
  const isTodaySelected = dayOffset === 0
  const recentlyAbortedSlot = readRecentlyAbortedWorkoutSlot()
  const activeWorkout = isTodaySelected
    ? (((activeWorkouts ?? []) as ActiveWorkoutCandidate[]).find(
        (workout) =>
          isLiveActiveWorkout(workout) && workout.slot !== recentlyAbortedSlot
      ) ?? null)
    : null

  useEffect(() => {
    if (!recentlyAbortedSlot || activeWorkouts === undefined) return
    const stillReturned = (activeWorkouts as ActiveWorkoutCandidate[]).some(
      (workout) =>
        workout.slot === recentlyAbortedSlot && isLiveActiveWorkout(workout)
    )
    if (!stillReturned && typeof window !== "undefined") {
      window.sessionStorage.removeItem(ABORTED_WORKOUT_SLOT_KEY)
    }
  }, [activeWorkouts, recentlyAbortedSlot])

  const hasCompletedWorkout = workoutLogs.length > 0
  const workoutState = activeWorkout
    ? "Active"
    : hasCompletedWorkout
      ? "Done"
      : scheduledWorkout
        ? isTodaySelected
          ? "Ready"
          : "Planned"
        : "Rest"
  const workoutActionDetail = activeWorkout
    ? "Resume active session"
    : hasCompletedWorkout
      ? "View workout log"
      : scheduledWorkout
        ? `${scheduledWorkout.duration} planned`
        : "Choose workout"
  const currentMealLabel =
    DEFAULT_MEAL_CATEGORIES.find((meal) => meal.id === defaultMeal())?.label ??
    "food"
  const proteinTarget = calorieInfo?.protein ?? 140
  const carbsTarget = calorieInfo?.carbs ?? 220
  const fatTarget = calorieInfo?.fat ?? 65
  const macroProgress: MacroProgress[] = [
    {
      label: "Protein",
      shortLabel: "P",
      value: foodTotals.protein,
      target: proteinTarget,
      color: MACRO_COLORS.protein,
    },
    {
      label: "Carbs",
      shortLabel: "C",
      value: foodTotals.carbs,
      target: carbsTarget,
      color: MACRO_COLORS.carbs,
    },
    {
      label: "Fat",
      shortLabel: "F",
      value: foodTotals.fat,
      target: fatTarget,
      color: MACRO_COLORS.fat,
    },
  ]
  const supplementDoneCount = completedSupplementCount(supplementEntries)
  const supplementTargetCount = SUPPLEMENT_LIST.length
  const supplementRemainingCount = Math.max(
    0,
    supplementTargetCount - supplementDoneCount
  )
  const waterPct = statPct(waterTotalMl, waterGoalMl) ?? 0
  const caloriePct = statPct(foodTotals.calories, caloriesTarget) ?? 0
  const supplementPct = statPct(supplementDoneCount, supplementTargetCount) ?? 0
  const goalsHit =
    (foodEntries.length > 0 && caloriesLeft >= 0 ? 1 : 0) +
    (waterTotalMl >= waterGoalMl ? 1 : 0) +
    (supplementRemainingCount === 0 ? 1 : 0)
  const microTotals = useMemo(
    () => nutritionDetailTotals(foodEntries),
    [foodEntries]
  )
  const measurements = (bodyMeasurements ?? []) as Array<{
    weightKg?: number
    loggedAt: string
  }>
  const latestMeasurement =
    measurements.length > 0 ? measurements[measurements.length - 1] : null
  const previousMeasurement =
    measurements.length > 1 ? measurements[measurements.length - 2] : null
  const weightDelta =
    latestMeasurement?.weightKg != null && previousMeasurement?.weightKg != null
      ? latestMeasurement.weightKg - previousMeasurement.weightKg
      : null
  const weightDetail = latestMeasurement
    ? `${new Date(`${latestMeasurement.loggedAt}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${weightDelta != null ? ` · ${weightDelta >= 0 ? "+" : ""}${weightDelta.toFixed(1)} kg` : ""}`
    : "Log weight, waist, or body fat"
  const microLines: DashboardStatLine[] = [
    {
      label: "Fiber",
      value: `${fmtStatNutrient(microTotals.fiber, "g")} / 30g`,
      progress: statPct(microTotals.fiber ?? 0, 30),
      color: MICRO_COLORS.fiber,
    },
    {
      label: "Sodium",
      value: `${fmtStatNutrient(microTotals.sodium, "mg")} / 2,300mg`,
      progress: statPct(microTotals.sodium ?? 0, 2300),
      color: MICRO_COLORS.sodium,
    },
    {
      label: "Sugar",
      value: fmtStatNutrient(microTotals.sugar, "g"),
      color: MICRO_COLORS.sugar,
    },
  ]
  const workoutPreviewDetail = activeWorkout
    ? "Active session in progress"
    : hasCompletedWorkout
      ? `${workoutLogs.length} workout${workoutLogs.length === 1 ? "" : "s"} logged`
      : scheduledWorkout
        ? `${scheduledWorkout.duration} · ${scheduledWorkout.steps.slice(0, 2).join(" · ")}`
        : "No workout scheduled"
  const statsByWidget: Record<WidgetId, DashboardStat> = {
    water: {
      title: "Daily goals",
      value: `${goalsHit}/3`,
      lines: [
        {
          label: "Calories",
          value: `${fmtKcal(foodTotals.calories)} / ${fmtKcal(caloriesTarget)}`,
          progress: caloriePct,
          color: caloriesLeft < 0 ? DANGER_COLOR : FOOD_COLOR,
        },
        {
          label: "Water",
          value: `${fmtWater(waterTotalMl)} / ${fmtWater(waterGoalMl)}`,
          progress: waterPct,
          color: WATER_COLOR,
        },
        {
          label: "Supplements",
          value: `${supplementDoneCount}/${supplementTargetCount}`,
          progress: supplementPct,
          color: COMPLETE_COLOR,
        },
      ],
    },
    workout: {
      title: "Today’s workout",
      value: activeWorkout
        ? "Active"
        : hasCompletedWorkout
          ? "Done"
          : (scheduledWorkout?.name ?? "Rest"),
      detail: workoutPreviewDetail,
      lines: scheduledWorkout
        ? scheduledWorkout.steps.slice(0, 3).map((step, index) => ({
            label: `Step ${index + 1}`,
            value: step,
          }))
        : undefined,
      onClick: hasCompletedWorkout
        ? () => navigate("/workouts")
        : openWorkoutAction,
    },
    streak: {
      title: "Training week",
      value: `${workoutsThisWeek}`,
      detail:
        workoutsThisWeek === 1
          ? "1 workout logged this week"
          : `${workoutsThisWeek} workouts logged this week`,
      lines: [
        {
          label: "Current streak",
          value: `${streak} day${streak === 1 ? "" : "s"}`,
          progress: Math.min(100, streak * 14),
          color: COMPLETE_COLOR,
        },
      ],
      onClick: () => navigate("/workouts"),
    },
    food: {
      title: "Micros",
      value:
        (microTotals.fiber ?? 0) > 0
          ? `${fmtStatNutrient(microTotals.fiber, "g")} fiber`
          : "No detail",
      detail: "Fiber, sodium, and sugar from foods with nutrition details.",
      lines: microLines,
      onClick: () => navigate("/foods"),
    },
    progress: {
      title: "Body",
      value:
        latestMeasurement?.weightKg != null
          ? `${latestMeasurement.weightKg.toFixed(1)} kg`
          : "Check in",
      detail: weightDetail,
      onClick: () => navigate("/progress"),
    },
  }

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const foodEvents = foodEntries.map((entry) => ({
      id: `food-${entry.id}`,
      title: entry.name,
      detail: `${Math.round(entry.calories)} kcal logged`,
      kind: "food" as const,
      loggedAt: entry.loggedAt,
      deleteLabel: `Delete ${entry.name}`,
    }))
    const waterEvents = waterEntries.map((entry) => ({
      id: `water-${entry.id}`,
      title: "Water",
      detail: `${fmtWater(entry.amountMl)} added`,
      kind: "water" as const,
      loggedAt: entry.loggedAt,
      deleteLabel: `Delete ${fmtWater(entry.amountMl)} water entry`,
    }))
    const supplementEvents = supplementEntries.map((entry) => ({
      id: `supplement-${entry.id}`,
      title: SUPPLEMENT_DEFINITIONS[entry.kind].label,
      detail: supplementEntryLabel(entry),
      kind: "supplement" as const,
      loggedAt: entry.loggedAt,
      deleteLabel: `Delete ${SUPPLEMENT_DEFINITIONS[entry.kind].label}`,
    }))
    const workoutEvents = workoutLogs.map((log, index) => ({
      id: `workout-${log._id ?? index}`,
      title: "Workout completed",
      detail: `${log.exercises?.length ?? 0} exercises logged`,
      kind: "workout" as const,
      loggedAt: log.completedAt
        ? new Date(log.completedAt).toISOString()
        : `${selectedDate}T23:59:00.000Z`,
      deleteLabel: "Delete workout",
      deleteSlot: (index + 1) as 1 | 2,
    }))

    return [
      ...foodEvents,
      ...waterEvents,
      ...supplementEvents,
      ...workoutEvents,
    ]
      .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
      .slice(0, 20)
  }, [foodEntries, selectedDate, supplementEntries, waterEntries, workoutLogs])

  function addQuickWater() {
    void addWaterEntry({
      date: selectedDate,
      entry: {
        id: crypto.randomUUID(),
        amountMl: 250,
        loggedAt: new Date().toISOString(),
      },
    })
  }

  function deleteTimelineEvent(event: TimelineEvent) {
    if (event.kind === "food") {
      const id = event.id.replace(/^food-/, "")
      void setDay({
        date: selectedDate,
        entries: foodEntries.filter((entry) => entry.id !== id),
      })
      return
    }

    if (event.kind === "water") {
      void removeWaterEntry({
        date: selectedDate,
        id: event.id.replace(/^water-/, ""),
      })
      return
    }

    if (event.kind === "supplement") {
      void removeSupplementEntry({
        date: selectedDate,
        id: event.id.replace(/^supplement-/, ""),
      })
      return
    }

    if (event.kind === "workout" && event.deleteSlot) {
      setConfirmDeleteSlot(event.deleteSlot)
    }
  }

  function openWorkoutAction() {
    if (activeWorkout) {
      navigate(`/workout/active?slot=${activeWorkout.slot}`)
      return
    }
    if (hasCompletedWorkout) {
      navigate("/workouts")
      return
    }
    if (scheduledWorkout) {
      navigate(`/workout/active/${scheduledWorkout.id}`)
      return
    }
    navigate("/workout/active")
  }

  const homeBodyReady =
    bodyMeasurements !== undefined &&
    preferences !== undefined &&
    effectiveGoals !== undefined &&
    foodLogs !== undefined &&
    waterLogs !== undefined &&
    supplementLogs !== undefined &&
    workoutLogsQuery !== undefined &&
    activeWorkouts !== undefined &&
    serverPresets !== undefined &&
    schedule !== undefined

  return (
    <div className="desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <div className="mx-auto flex w-full max-w-lg flex-col pb-[calc(var(--app-safe-bottom-lg)+6.5rem)] md:max-w-6xl md:pb-10">
        <TodayHeader
          dateLabel={dateLabel}
          salutation={salutation}
          firstName={firstName}
          action={
            <DateNav
              offset={dayOffset}
              timeZone={activeTimezone}
              onChange={setDayOffset}
            />
          }
        />

        {homeBodyReady ? (
          <>
            <DailyLedgerHero
              caloriesLeft={caloriesLeft}
              caloriesTarget={caloriesTarget}
              waterMl={waterTotalMl}
              waterGoalMl={waterGoalMl}
              workoutState={workoutState}
              macros={macroProgress}
              food={{
                label: `Log ${currentMealLabel.toLowerCase()}`,
                detail:
                  foodEntries.length > 0
                    ? `${foodEntries.length} logged today`
                    : "Search, scan, or repeat meal",
                onClick: () => setHomeAddOpen(true),
              }}
              workout={{
                label: activeWorkout
                  ? "Continue"
                  : hasCompletedWorkout
                    ? "Done"
                    : "Workout",
                detail: workoutActionDetail,
                onClick: openWorkoutAction,
              }}
              water={{
                label: "Water",
                detail: "+250 ml",
                onClick: addQuickWater,
              }}
            />

            <InsightWidgets
              editMode={editMode}
              onToggleEdit={() => setEditMode((value) => !value)}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={widgetLayout.map((widget) => widget.id)}
                  strategy={rectSortingStrategy}
                >
                  <div
                    ref={statsScrollRef}
                    onScroll={updateStatsScrollIndicator}
                    className="app-scroll-strip -mx-[var(--app-page-x)] mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-[calc(var(--app-page-x)+1rem)] pb-2 scroll-px-[calc(var(--app-page-x)+1rem)] md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 md:scroll-px-0"
                  >
                    {widgetLayout.map((widget) => (
                      <SortableWidget
                        key={widget.id}
                        id={widget.id}
                        editMode={editMode}
                        size={widget.size}
                      >
                        <DashboardStatCard
                          stat={statsByWidget[widget.id]}
                          compact={widget.size === "small"}
                        />
                      </SortableWidget>
                    ))}
                    <div
                      aria-hidden="true"
                      className="w-[calc(var(--app-page-x)+2rem)] shrink-0 md:hidden"
                    />
                  </div>
                  <div
                    className={cn(
                      "home-scroll-hint md:hidden",
                      !statsScrollIndicator.visible && "opacity-0"
                    )}
                    style={
                      {
                        "--scroll-thumb-left": `${statsScrollIndicator.leftPct}%`,
                        "--scroll-thumb-width": `${statsScrollIndicator.thumbPct}%`,
                      } as React.CSSProperties
                    }
                    aria-hidden="true"
                  >
                    <div className="home-scroll-hint-thumb" />
                  </div>
                </SortableContext>
              </DndContext>
            </InsightWidgets>

            <TodayTimeline
              events={timelineEvents}
              onLogFood={() => navigate("/foods")}
              onLogWater={addQuickWater}
              onDeleteEvent={deleteTimelineEvent}
            />
          </>
        ) : (
          <div
            role="status"
            aria-label="Loading today"
            className="flex min-h-[45svh] items-center justify-center"
          >
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
          </div>
        )}
      </div>

      {homeAddOpen && (
        <MobileSheet
          onClose={() => setHomeAddOpen(false)}
          overlayClassName="bg-black/50 backdrop-blur-[8px]"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
          panelStyle={{
            paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
          }}
          maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
        >
          <div className="px-4 pt-1 pb-4">
            <div className="app-surface mb-3 overflow-hidden">
              <button
                onClick={() => {
                  setHomeAddOpen(false)
                  navigate("/camera?mode=barcode")
                }}
                className="flex w-full items-center justify-between gap-3 border-b border-border/40 px-4 py-3.5 text-left transition-colors active:bg-muted/35"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="app-icon-button pointer-events-none h-9 w-9 bg-[var(--accent-food-bg)] text-[var(--accent-food)]">
                    <Barcode size={16} weight="bold" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">
                      Scan barcode
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground/60">
                      Packaged food
                    </span>
                  </span>
                </span>
                <CaretRight size={12} className="text-muted-foreground/35" />
              </button>

              <button
                onClick={openSnapCamera}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors active:bg-muted/35"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="app-icon-button pointer-events-none h-9 w-9 bg-muted/60 text-muted-foreground/70">
                    <Aperture size={17} weight="bold" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">
                      Snap meal
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground/60">
                      Estimate from photo
                    </span>
                  </span>
                </span>
                <CaretRight size={12} className="text-muted-foreground/35" />
              </button>

              <button
                onClick={() => {
                  if (!requireAiAccess()) return
                  setHomeAddOpen(false)
                  navigate("/foods?describe=1")
                }}
                className="flex w-full items-center justify-between gap-3 border-t border-border/40 px-4 py-3.5 text-left transition-colors active:bg-muted/35"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="app-icon-button pointer-events-none h-9 w-9 bg-muted/60 text-muted-foreground/70">
                    <Sparkle size={16} weight="fill" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">
                      Describe meal
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground/60">
                      AI builds a temporary recipe
                    </span>
                  </span>
                </span>
                <CaretRight size={12} className="text-muted-foreground/35" />
              </button>
            </div>

            <div className="app-surface overflow-hidden">
              <button
                onClick={() => {
                  setHomeAddOpen(false)
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
              <div className="mx-4 h-px bg-border/50" />
              <button
                onClick={() => {
                  setHomeAddOpen(false)
                  navigate("/foods/recipe/new")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-muted/40"
              >
                <div className="flex items-center gap-2.5">
                  <ForkKnife
                    size={13}
                    className="shrink-0 text-muted-foreground/50"
                  />
                  <span className="text-[13px] font-medium">New Recipe</span>
                </div>
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
              {recipes.length > 0 && (
                <>
                  <div className="mx-4 h-px bg-border/50" />
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground/38 uppercase">
                      Saved recipes
                    </p>
                  </div>
                  {recipes.slice(0, 5).map((recipe) => {
                    const totals = totalsForRecipe(recipe.ingredients)
                    return (
                      <div
                        key={recipe._id ?? recipe.name}
                        className="flex w-full items-center gap-1 px-2 py-1"
                      >
                        <button
                          type="button"
                          onClick={() => logRecipeFromQuickAdd(recipe)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-colors active:bg-muted/40"
                        >
                          <div className="min-w-0 text-left">
                            <p className="truncate text-[13px] font-medium">
                              {recipe.name}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-muted-foreground/45">
                              {totals.calories} kcal · {recipe.ingredients.length} ingredient
                              {recipe.ingredients.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          <CaretRight
                            size={11}
                            className="shrink-0 text-muted-foreground/30"
                          />
                        </button>
                        {recipe._id && (
                          <button
                            type="button"
                            onClick={() => {
                              setHomeAddOpen(false)
                              navigate(`/foods/recipe/${recipe._id}`)
                            }}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground/50 transition-colors active:bg-muted/40"
                            aria-label={`Edit ${recipe.name}`}
                          >
                            <PencilSimple size={13} weight="bold" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
              <div className="mx-4 h-px bg-border/50" />
              <button
                onClick={() => {
                  setHomeAddOpen(false)
                  navigate("/foods")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-muted/40"
              >
                <div className="flex items-center gap-2.5">
                  <Pill
                    size={13}
                    className="shrink-0 text-muted-foreground/50"
                  />
                  <span className="text-[13px] font-medium">Supplements</span>
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
                  <Barbell
                    size={13}
                    className="shrink-0 text-muted-foreground/50"
                  />
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

      {confirmDeleteSlot && (
        <div
          className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[3px]"
          onClick={() => setConfirmDeleteSlot(null)}
        >
          <div
            className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-2xl"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-3 mb-5 h-1 w-10 rounded-full bg-border/60" />
            <div className="px-6">
              <h2 className="text-[17px] font-bold tracking-tight">
                Delete workout?
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
                This will remove the workout from your log. This cannot be
                undone.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  onClick={() => {
                    void removeWorkoutBySlot({
                      date: selectedDate,
                      slot: confirmDeleteSlot,
                    })
                    setConfirmDeleteSlot(null)
                  }}
                  className="h-12 w-full rounded-xl text-[14px] font-bold text-white transition-opacity active:opacity-80"
                  style={{ backgroundColor: DANGER_COLOR }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDeleteSlot(null)}
                  className="h-12 w-full rounded-xl bg-muted text-[14px] font-bold text-foreground transition-opacity active:opacity-80"
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="h-4" />
          </div>
        </div>
      )}

      {aiAccessModal}
    </div>
  )
}
