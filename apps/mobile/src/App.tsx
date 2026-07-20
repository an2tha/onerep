import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Barbell,
  Barcode,
  CalendarDots,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Coffee,
  Clock,
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
  UserCircle,
  X,
} from "@phosphor-icons/react"
import { useAppAuth } from "@/lib/auth-client"
import { useQuery, useMutation } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { cn, safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { useBottomBarAction } from "@/components/bottom-bar"
import {
  DailyLedgerHero,
  DashboardProgressPanels,
  CoachGoalCards,
  TodayHeader,
  TodayTimeline,
  FirstWeekGuide,
  type PinnedCoachGoal,
  type TimelineEvent,
} from "@repo/ui"
import { buildDashboardBriefing } from "@/lib/dashboard-briefing"
import { getActiveWorkoutProgress } from "@/lib/dashboard-workout-progress"
import { MobileSheet } from "@/components/mobile-sheet"
import { SwipeToStart } from "@repo/ui"
import { SlideToDeleteRow } from "@repo/ui"
import { useAiFeatureGate } from "@/lib/ai-access"
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
  buildSupplementDayPlan,
  type SupplementIntakeLog,
  type SupplementItem,
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
import { hapticHeavy, hapticMedium, hapticSelection } from "@/lib/haptics"
import { APP_ACCENT_COLORS, MACRO_COLORS, tint } from "@repo/ui"
import type { TrendMetric } from "@repo/ui"
import { toast } from "@repo/ui"
import {
  STARTER_RECIPES,
  type StarterRecipe,
} from "@/pages/RecipesHub"

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkoutFocus = "strength" | "cardio" | "mobility"
type DashboardSettings = {
  workoutFocus: WorkoutFocus
  trendMetric?: TrendMetric
  simpleMode?: boolean
}

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

type ActiveWorkoutCandidate = {
  slot?: 1 | 2
  completedAt?: number
  abortedAt?: number
  status?: string
  exerciseData?: unknown
  elapsedSeconds?: number
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
          <button
            type="button"
            className="app-icon-button h-10 w-10 bg-transparent text-muted-foreground hover:text-foreground"
            aria-label={`Choose date, ${dayOffsetLabel(offset, timeZone)}`}
          >
            <CalendarDots size={15} weight="bold" />
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
            onClick={() => navigate("/nutrition")}
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
  const [milestoneActive, setMilestoneActive] = useState(false)
  const previousStreak = useRef(streak)

  useEffect(() => {
    const crossedMilestone =
      streak > previousStreak.current && [1, 3, 7, 14, 30].includes(streak)
    previousStreak.current = streak
    if (!crossedMilestone) return

    const key = `onerep:streak-milestone:${streak}`
    if (safeLocalStorageGet(key)) return
    safeLocalStorageSet(key, "seen")
    setMilestoneActive(true)
    hapticMedium()
    const timer = window.setTimeout(() => setMilestoneActive(false), 1500)
    return () => window.clearTimeout(timer)
  }, [streak])

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
          <div
            className={cn(
              "flex shrink-0 flex-col items-center gap-0.5",
              milestoneActive && "streak-milestone"
            )}
            role={milestoneActive ? "status" : undefined}
            aria-label={
              milestoneActive ? `${streak} day streak milestone` : undefined
            }
          >
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

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useSmoothNavigate()
  const { user } = useAppAuth()
  const [dayOffset, setDayOffset] = useState(0)
  const [quickWaterRainKey, setQuickWaterRainKey] = useState(0)
  const [dashboardTrendMetric, setDashboardTrendMetric] =
    useState<TrendMetric>("waistCm")

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
  const activeWorkouts = useQuery(api.logs.activeWorkout.getAllActive, {})
  const recipesQuery = useQuery(api.logs.recipes.list, {})
  const suggestedMeals = useQuery(api.logs.recipes.suggestedForDashboard, {
    beforeOrOn: selectedDate,
    limit: 6,
  })
  const pinnedCoachGoals = useQuery(api.ai.coachGoals.listPinned, { limit: 4 })
  const bodyMeasurements = useQuery(api.bodyProgress.list)

  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date: selectedDate })
  const waterLogs = useQuery(api.logs.water.getDay, { date: selectedDate })
  const supplementLogs = useQuery(api.logs.supplements.getDay, {
    date: selectedDate,
  })
  const supplementOverview = useQuery(api.logs.supplements.getOverview, {
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
  const saveRecipe = useMutation(api.logs.recipes.save)
  const setCoachGoalPinned = useMutation(api.ai.coachGoals.setPinned)
  const setCoachGoalTaskCompleted = useMutation(
    api.ai.coachGoals.setTaskCompleted
  )

  // ── Dashboard settings ───────────────────────────────────────────────────

  const settings: DashboardSettings = useMemo(() => {
    return (
      (preferences?.dashboardSettings as DashboardSettings) || {
        workoutFocus: "strength",
      }
    )
  }, [preferences])

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
    () => (workoutLogsQuery ?? []) as unknown as CachedWorkoutLog[],
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

  const now = useMemo(() => new Date(), [])

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
  const [confirmUnpinGoalId, setConfirmUnpinGoalId] = useState<string | null>(
    null
  )
  const [unpinningCoachGoal, setUnpinningCoachGoal] = useState(false)
  const [homeAddOpen, setHomeAddOpen] = useState(false)
  const [previewRecipe, setPreviewRecipe] = useState<StarterRecipe | null>(null)
  const [recipePreviewClosing, setRecipePreviewClosing] = useState(false)
  const [savingPreviewRecipe, setSavingPreviewRecipe] = useState(false)
  const [previewRecipeSaved, setPreviewRecipeSaved] = useState(false)
  const [snapOffline, setSnapOffline] = useState(false)
  const [showFirstWeekGuide, setShowFirstWeekGuide] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.localStorage.getItem("onerep:first-week-guide-dismissed") !== "1"
  )
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  useBottomBarAction(() => setHomeAddOpen(true))

  async function toggleCoachGoalTask(taskId: string, completed: boolean) {
    hapticSelection()
    try {
      await setCoachGoalTaskCompleted({
        id: taskId as Id<"coachGoalTasks">,
        completed,
      })
    } catch (error) {
      hapticHeavy()
      toast.error(
        error instanceof Error ? error.message : "Could not update this task"
      )
    }
  }

  async function confirmCoachGoalUnpin() {
    if (!confirmUnpinGoalId || unpinningCoachGoal) return
    setUnpinningCoachGoal(true)
    try {
      await setCoachGoalPinned({
        id: confirmUnpinGoalId as Id<"coachGoals">,
        pinned: false,
      })
      hapticSelection()
      toast.success("Goal unpinned from Today")
      setConfirmUnpinGoalId(null)
    } catch (error) {
      hapticHeavy()
      toast.error(
        error instanceof Error ? error.message : "Could not unpin this goal"
      )
    } finally {
      setUnpinningCoachGoal(false)
    }
  }

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
          id: crypto.randomUUID(),
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
  const activeWorkoutProgress = useMemo(
    () => getActiveWorkoutProgress(activeWorkout),
    [activeWorkout]
  )

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
  const currentMealLabel =
    DEFAULT_MEAL_CATEGORIES.find((meal) => meal.id === defaultMeal())?.label ??
    "food"
  const proteinTarget = calorieInfo?.protein ?? 140
  const proteinLeft = Math.max(0, proteinTarget - foodTotals.protein)
  const proteinProgress =
    proteinTarget > 0
      ? Math.min(100, (foodTotals.protein / proteinTarget) * 100)
      : 100
  const waterProgress =
    waterGoalMl > 0 ? Math.min(100, (waterTotalMl / waterGoalMl) * 100) : 0
  const mealSlots = useMemo(
    () =>
      DEFAULT_MEAL_CATEGORIES.map((meal) => ({
        id: meal.id,
        label: meal.label,
        logged: foodEntries.some((entry) => entry.meal === meal.id),
      })),
    [foodEntries]
  )
  const recovery =
    isTodaySelected && hasCompletedWorkout
      ? {
          score: (proteinProgress + waterProgress) / 2,
          proteinPercent: proteinProgress,
          waterPercent: waterProgress,
        }
      : null
  const dashboardBriefing = buildDashboardBriefing({
    activeWorkout: activeWorkout !== null,
    completedWorkout: hasCompletedWorkout,
    scheduledWorkout: scheduledWorkout !== null,
    isToday: isTodaySelected,
    foodLogCount: foodEntries.length,
    proteinLeft,
    waterProgress,
    burnedCalories: calorieInfo?.burnedCalories ?? 0,
    caloriesLeft,
    scheduledWorkoutName: scheduledWorkout?.name,
    currentMealLabel,
  })

  function runDashboardBriefingAction() {
    if (
      dashboardBriefing.action === "resume_workout" ||
      dashboardBriefing.action === "start_workout"
    ) {
      openWorkoutAction()
      return
    }
    if (dashboardBriefing.action === "add_water") {
      addQuickWater()
      return
    }
    if (
      dashboardBriefing.action === "log_meal" ||
      dashboardBriefing.action === "log_recovery_food"
    ) {
      setHomeAddOpen(true)
      return
    }
    navigate(`/nutrition?date=${selectedDate}`, { motion: "switch" })
  }

  function dismissFirstWeekGuide() {
    window.localStorage.setItem("onerep:first-week-guide-dismissed", "1")
    setShowFirstWeekGuide(false)
  }

  function closeRecipePreview() {
    if (recipePreviewClosing || savingPreviewRecipe) return
    setRecipePreviewClosing(true)
    window.setTimeout(() => {
      setPreviewRecipe(null)
      setRecipePreviewClosing(false)
      setPreviewRecipeSaved(false)
    }, 320)
  }

  async function savePreviewRecipe(recipe: StarterRecipe) {
    if (savingPreviewRecipe || previewRecipeSaved) return
    setSavingPreviewRecipe(true)
    hapticSelection()
    try {
      const ingredientCount = recipe.ingredients.length
      const calorieShare = recipe.calories / ingredientCount
      const proteinShare = recipe.protein / ingredientCount
      const remainingCalories = Math.max(0, recipe.calories - recipe.protein * 4)
      const noCook =
        recipe.tags.includes("no cook") ||
        recipe.tags.includes("no bake") ||
        /smoothie|overnight|chia pudding|yogurt bowl/i.test(recipe.name)
      const carbsShare = (remainingCalories * 0.65) / 4 / ingredientCount
      const fatShare = (remainingCalories * 0.35) / 9 / ingredientCount
      await saveRecipe({
        name: recipe.name,
        recipeType: "detailed",
        description: recipe.description,
        servings: 1,
        prepMinutes: noCook ? recipe.time : Math.max(5, Math.round(recipe.time * 0.35)),
        cookMinutes: noCook ? 0 : Math.max(1, Math.round(recipe.time * 0.65)),
        category: recipe.category,
        originCountry: recipe.origin,
        notes: recipe.notes,
        placeholderImage: "starter-kitchen",
        tags: recipe.tags,
        steps: recipe.steps,
        photoStorageIds: [],
        ingredients: recipe.ingredients.map((label, index) => {
          const parsedAmount = Number(label.match(/[\d.]+/)?.[0] ?? 100)
          const grams = /\bg\b/i.test(label) ? parsedAmount : 100
          const name = label.replace(/^[\d.]+\s*(?:g|tbsp|serving)?\s*/i, "")
          return {
            id: `${recipe.id}-${index}`,
            name,
            grams,
            displayAmount: grams,
            displayUnit: "g",
            caloriesPer100: (calorieShare * 100) / grams,
            proteinPer100: (proteinShare * 100) / grams,
            carbsPer100: (carbsShare * 100) / grams,
            fatPer100: (fatShare * 100) / grams,
          }
        }),
      })
      hapticMedium()
      setPreviewRecipeSaved(true)
      toast.success(`${recipe.name} saved`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save recipe")
    } finally {
      setSavingPreviewRecipe(false)
    }
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
    hapticMedium()
    setQuickWaterRainKey((value) => value + 1)
    const id = crypto.randomUUID()
    void addWaterEntry({
      date: selectedDate,
      entry: {
        id,
        amountMl: 250,
        loggedAt: new Date().toISOString(),
      },
    }).catch(() => toast.error("Could not add water. Try again."))
  }

  function deleteTimelineEvent(event: TimelineEvent) {
    if (event.kind === "food") {
      const id = event.id.replace(/^food-/, "")
      void setDay({
        date: selectedDate,
        entries: foodEntries.filter((entry) => entry.id !== id),
      })
      toast.success("Food entry removed", {
        action: {
          label: "Undo",
          onClick: () =>
            void setDay({ date: selectedDate, entries: foodEntries }),
        },
      })
      return
    }

    if (event.kind === "water") {
      void removeWaterEntry({
        date: selectedDate,
        id: event.id.replace(/^water-/, ""),
      })
      toast.success("Water entry removed", {
        action: {
          label: "Undo",
          onClick: () => {
            const entry = waterEntries.find(
              (item) => `water-${item.id}` === event.id
            )
            if (entry) void addWaterEntry({ date: selectedDate, entry })
          },
        },
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
    preferences !== undefined &&
    effectiveGoals !== undefined &&
    foodLogs !== undefined &&
    waterLogs !== undefined &&
    supplementLogs !== undefined &&
    supplementOverview !== undefined &&
    workoutLogsQuery !== undefined &&
    activeWorkouts !== undefined &&
    pinnedCoachGoals !== undefined &&
    serverPresets !== undefined &&
    schedule !== undefined &&
    bodyMeasurements !== undefined &&
    suggestedMeals !== undefined

  return (
    <div className="desktop-canvas relative min-h-svh overflow-hidden bg-background lg:pr-8 lg:pl-72">
      {quickWaterRainKey > 0 && (
        <span
          key={quickWaterRainKey}
          className="water-rain water-rain-home"
          aria-hidden
        >
          {Array.from({ length: 18 }, (_, index) => (
            <span
              key={index}
              style={{
                left: `${(index * 37) % 101}%`,
                animationDelay: `${(index * 43) % 260}ms`,
                animationDuration: `${850 + ((index * 67) % 420)}ms`,
              }}
            />
          ))}
        </span>
      )}
      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col pb-[calc(var(--app-safe-bottom-lg)+6.5rem)] md:max-w-6xl md:pb-10">
        <TodayHeader
          dateLabel={dateLabel}
          salutation={salutation}
          firstName={firstName}
          action={
            <div className="flex items-center gap-1">
              <DateNav
                offset={dayOffset}
                timeZone={activeTimezone}
                onChange={setDayOffset}
              />
              <button
                type="button"
                aria-label="Add food, water, workout, or supplement"
                onClick={() => setHomeAddOpen(true)}
                className="native-toolbar-button px-0"
              >
                <Plus size={22} weight="bold" />
              </button>
              <button
                type="button"
                aria-label="Open profile and settings"
                onClick={() => navigate("/settings", { motion: "forward" })}
                className="native-toolbar-button px-0"
              >
                <UserCircle size={22} weight="regular" />
              </button>
            </div>
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
              workoutProgress={activeWorkoutProgress}
              mealSlots={mealSlots}
              onMealSlotClick={() => setHomeAddOpen(true)}
              recovery={recovery}
              onRecoveryClick={() =>
                navigate(`/nutrition?date=${selectedDate}`, {
                  motion: "switch",
                })
              }
              briefing={dashboardBriefing}
              onBriefingAction={runDashboardBriefingAction}
              showBriefingAction
              proteinLeft={proteinLeft}
            />

            <div className="mx-[var(--app-page-x)] mt-4 md:mx-8">
              <WorkoutCard
                settings={settings}
                dayOffset={dayOffset}
                scheduledWorkout={scheduledWorkout}
                timeZone={activeTimezone}
                workoutLogs={workoutLogs}
                collapsed={todayWorkoutCollapsed}
                onToggleCollapse={() =>
                  setTodayWorkoutCollapsed((collapsed) => !collapsed)
                }
                onDeleteSlot={setConfirmDeleteSlot}
              />
            </div>

            <section className="mt-5" aria-label="Suggested meals">
              <div className="mx-[var(--app-page-x)] mb-3 flex items-end justify-between gap-4 md:mx-8">
                <div>
                  <p className="app-section-title">Suggested meals</p>
                  <p className="native-row-detail mt-0.5">
                    OneRep recipes matched to recent ingredients
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigate("/coach", {
                      motion: "forward",
                      state: {
                        coachMode: "chef",
                        guidedIntent: {
                          kind: "suggest_meal",
                          title: "What sounds good?",
                          detail:
                            "Share a craving, ingredient, time limit, or nutrition goal.",
                          examples: [
                            "High-protein dinner under 30 minutes",
                            "Something with chicken and rice",
                            "A light vegetarian lunch",
                          ],
                        },
                      },
                    })
                  }
                  className="min-h-11 shrink-0 text-[13px] font-semibold text-[var(--accent-food)] active:opacity-60"
                >
                  Ask Coach
                </button>
              </div>

              {suggestedMeals.length > 0 ? (
                <div className="flex snap-x snap-mandatory scroll-pl-[var(--app-page-x)] gap-2.5 overflow-x-auto px-[var(--app-page-x)] pb-2 md:scroll-pl-8 md:px-8">
                  {suggestedMeals.map((meal) => (
                    <button
                      key={meal.id}
                      type="button"
                      onClick={() => {
                        const recipe = STARTER_RECIPES.find(
                          (item) => item.id === meal.id
                        )
                        if (recipe) {
                          hapticSelection()
                          setPreviewRecipeSaved(false)
                          setRecipePreviewClosing(false)
                          setPreviewRecipe(recipe)
                        }
                      }}
                      className="flex h-36 w-[17rem] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card text-left transition-transform active:scale-[0.985] md:h-40 md:w-[22rem]"
                    >
                      {meal.photoUrl ? (
                        <img
                          src={meal.photoUrl}
                          alt=""
                          className="h-full w-[40%] shrink-0 object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-[40%] shrink-0 items-center justify-center bg-[var(--accent-food-bg)] text-[var(--accent-food)]">
                          <ForkKnife size={30} weight="bold" />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col p-3 md:p-3.5">
                        <span className="text-[9px] font-semibold text-muted-foreground md:text-[10px]">
                          OneRep recipe
                        </span>
                        <span className="mt-1 line-clamp-2 shrink-0 text-[14px] leading-tight font-bold tracking-tight md:text-[16px]">
                          {meal.name}
                        </span>
                        <span className="mt-1.5 line-clamp-1 min-h-0 text-[10px] leading-4 text-muted-foreground md:text-[11px]">
                          {meal.description}
                        </span>
                        <span className="mt-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[9px] font-medium text-muted-foreground tabular-nums md:text-[10px]">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={11} /> {meal.prepMinutes} min
                          </span>
                          <span>·</span>
                          <span>{meal.calories} kcal</span>
                          <span>·</span>
                          <span>{meal.protein}g P</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mx-[var(--app-page-x)] md:mx-8">
                  <button
                    type="button"
                    onClick={() =>
                      navigate("/coach", {
                        motion: "forward",
                        state: {
                          coachMode: "chef",
                          guidedIntent: {
                            kind: "suggest_meal",
                            title: "What sounds good?",
                            detail:
                              "Share a craving, ingredient, time limit, or nutrition goal.",
                            examples: [
                              "High-protein dinner under 30 minutes",
                              "Use ingredients I eat often",
                              "A light vegetarian lunch",
                            ],
                          },
                        },
                      })
                    }
                    className="flex min-h-20 w-full items-center gap-3 rounded-xl border border-dashed border-border px-4 text-left"
                  >
                    <ForkKnife size={21} className="text-muted-foreground" />
                    <span>
                      <span className="block text-[13px] font-semibold">
                        Ask Coach for a meal idea
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Your saved recipes will appear here.
                      </span>
                    </span>
                  </button>
                </div>
              )}

              <div className="mx-[var(--app-page-x)] mt-2 md:mx-8">
                <button
                  type="button"
                  onClick={() => {
                    hapticSelection()
                    navigate("/recipes", { motion: "forward" })
                  }}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[13px] font-semibold transition-colors active:bg-muted/60"
                >
                  <ForkKnife size={17} weight="bold" />
                  Discover more recipes
                  <CaretRight size={16} className="text-muted-foreground" />
                </button>
              </div>
            </section>

            {isTodaySelected && showFirstWeekGuide && (
              <FirstWeekGuide onDismiss={dismissFirstWeekGuide} />
            )}

            {isTodaySelected && !settings.simpleMode && (
              <DashboardProgressPanels
                measurements={bodyMeasurements}
                metric={dashboardTrendMetric}
                onMetricChange={setDashboardTrendMetric}
                tdee={calorieInfo?.tdee ?? caloriesTarget}
                calorieTarget={caloriesTarget}
                weightUnit={preferences?.weightUnit === "lbs" ? "lbs" : "kg"}
              />
            )}

            {isTodaySelected && !settings.simpleMode ? (
              <CoachGoalCards
                goals={(pinnedCoachGoals ?? []) as PinnedCoachGoal[]}
                today={todayKey}
                onToggleTask={(taskId, completed) =>
                  void toggleCoachGoalTask(taskId, completed)
                }
                onRequestUnpin={(goalId) => {
                  hapticSelection()
                  setConfirmUnpinGoalId(goalId)
                }}
              />
            ) : null}

            <TodayTimeline
              events={timelineEvents}
              onLogFood={() => setHomeAddOpen(true)}
              onLogWater={addQuickWater}
              onDeleteEvent={deleteTimelineEvent}
              onEditEvent={(event) => {
                if (event.kind === "workout")
                  navigate("/workouts", { motion: "switch" })
                else if (event.kind === "supplement")
                  navigate("/supplements", { motion: "switch" })
                else
                  navigate(`/nutrition?date=${selectedDate}`, {
                    motion: "switch",
                  })
              }}
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

      {previewRecipe && (
        <div
          className={cn(
            "sheet-overlay fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-sm md:items-center md:p-6",
            recipePreviewClosing && "sheet-backdrop-exit"
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-recipe-preview-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRecipePreview()
          }}
        >
          <div
            className={cn(
              "sheet-panel max-h-[90svh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-background md:rounded-[2rem]",
              recipePreviewClosing && "sheet-panel-exit"
            )}
          >
            <div className="relative h-56">
              <img
                src={previewRecipe.image}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={closeRecipePreview}
                aria-label="Close recipe preview"
                className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-7">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                {previewRecipe.category} · {previewRecipe.difficulty}
              </p>
              <h2
                id="dashboard-recipe-preview-title"
                className="mt-2 text-[1.8rem] leading-tight font-semibold tracking-[-0.035em]"
              >
                {previewRecipe.name}
              </h2>
              <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
                {previewRecipe.description}
              </p>
              <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border py-3 text-center">
                <div>
                  <p className="text-[15px] font-semibold">{previewRecipe.time}m</p>
                  <p className="text-[13px] text-muted-foreground">Total time</p>
                </div>
                <div>
                  <p className="text-[15px] font-semibold">{previewRecipe.calories}</p>
                  <p className="text-[13px] text-muted-foreground">Calories</p>
                </div>
                <div>
                  <p className="text-[15px] font-semibold">{previewRecipe.protein}g</p>
                  <p className="text-[13px] text-muted-foreground">Protein</p>
                </div>
              </div>
              <div className="mt-6">
                <h3 className="text-[13px] font-semibold">Ingredients</h3>
                <ul className="mt-2 divide-y divide-border/60 border-y border-border/60">
                  {previewRecipe.ingredients.map((ingredient) => (
                    <li key={ingredient} className="py-2.5 text-[13px] text-foreground/75">
                      {ingredient}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-7">
                <h3 className="text-[13px] font-semibold">Instructions</h3>
                <ol className="mt-3 space-y-4">
                  {previewRecipe.steps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-[13px] leading-5 text-foreground/75">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="mt-6 rounded-2xl bg-muted/55 p-4">
                <p className="text-[11px] font-semibold text-muted-foreground">Serving & storage</p>
                <p className="mt-1 text-[12px] leading-5 text-foreground/70">{previewRecipe.notes}</p>
              </div>
              <button
                type="button"
                disabled={savingPreviewRecipe || previewRecipeSaved}
                aria-busy={savingPreviewRecipe}
                onClick={() => void savePreviewRecipe(previewRecipe)}
                className={cn(
                  "motion-tactile mt-7 flex min-h-13 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 text-[14px] font-semibold transition-[background-color,color,transform]",
                  previewRecipeSaved
                    ? "text-white"
                    : "bg-foreground text-background active:scale-[0.985]"
                )}
                style={
                  previewRecipeSaved ? { backgroundColor: COMPLETE_COLOR } : undefined
                }
              >
                <span
                  key={previewRecipeSaved ? "saved" : savingPreviewRecipe ? "saving" : "save"}
                  className="motion-pop inline-flex items-center gap-2"
                >
                  {previewRecipeSaved ? (
                    <Check size={18} weight="bold" />
                  ) : (
                    <Plus size={18} weight="bold" />
                  )}
                  {previewRecipeSaved
                    ? "Saved to recipes"
                    : savingPreviewRecipe
                      ? "Saving…"
                      : "Save to my recipes"}
                  {previewRecipeSaved && <Sparkle size={15} weight="fill" />}
                </span>
              </button>
              <button
                type="button"
                disabled={savingPreviewRecipe}
                onClick={() => {
                  const recipe = previewRecipe
                  setPreviewRecipe(null)
                  navigate("/coach", {
                    motion: "forward",
                    state: {
                      coachMode: "chef",
                      recipeCustomization: {
                        name: recipe.name,
                        description: recipe.description,
                        image: recipe.image,
                        time: recipe.time,
                        calories: recipe.calories,
                        protein: recipe.protein,
                        ingredients: recipe.ingredients,
                      },
                    },
                  })
                }}
                className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border px-4 text-[13px] font-semibold"
              >
                <Sparkle size={17} /> Customize with Coach
              </button>
            </div>
          </div>
        </div>
      )}

      {homeAddOpen && (
        <MobileSheet
          onClose={() => setHomeAddOpen(false)}
          overlayClassName="bg-black/55"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-2xl border-t border-border bg-card md:!w-full md:!max-w-sm"
          maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
        >
          <div className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="app-eyebrow">Quick add</p>
                <h2 className="mt-1 text-[1.35rem] leading-tight font-bold">
                  Log {currentMealLabel.toLowerCase()}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setHomeAddOpen(false)}
                aria-label="Close quick add"
                className="native-toolbar-button -mt-1 -mr-2 h-11 w-11 shrink-0 px-0 text-muted-foreground"
              >
                <X size={12} weight="bold" />
              </button>
            </div>

            <div className="overflow-hidden border-y border-border">
              {[
                {
                  label: "Search food",
                  detail: "Find an item and log an exact portion",
                  Icon: MagnifyingGlass,
                  action: () => {
                    setHomeAddOpen(false)
                    navigate("/foods/search")
                  },
                },
                {
                  label: "Scan barcode",
                  detail: "Log a packaged food",
                  Icon: Barcode,
                  action: () => {
                    setHomeAddOpen(false)
                    navigate("/camera?mode=barcode")
                  },
                },
                {
                  label: "Snap meal",
                  detail: "Estimate nutrition from a photo",
                  Icon: Aperture,
                  action: openSnapCamera,
                },
                {
                  label: "Describe meal",
                  detail: "Build a temporary recipe with Coach",
                  Icon: Sparkle,
                  action: () => {
                    if (!requireAiAccess()) return
                    setHomeAddOpen(false)
                    navigate("/nutrition?describe=1")
                  },
                },
              ].map(({ label, detail, Icon, action }, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={action}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 px-1 text-left active:bg-muted/40",
                    index > 0 && "border-t border-border"
                  )}
                >
                  <span className="native-row-leading text-muted-foreground">
                    <Icon size={19} weight="regular" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="native-row-title block">{label}</span>
                    <span className="native-row-detail block">{detail}</span>
                  </span>
                  <CaretRight size={18} className="text-muted-foreground" />
                </button>
              ))}
            </div>

            {recipes.length > 0 && (
              <section className="mt-5" aria-label="Saved recipes">
                <p className="native-section-title mb-2">Saved recipes</p>
                <div className="divide-y divide-border border-y border-border">
                  {recipes.slice(0, 5).map((recipe) => {
                    const totals = totalsForRecipe(recipe.ingredients)
                    return (
                      <div
                        key={recipe._id ?? recipe.name}
                        className="flex min-h-14 w-full items-center gap-1"
                      >
                        <button
                          type="button"
                          onClick={() => logRecipeFromQuickAdd(recipe)}
                          className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 px-1 py-2 text-left transition-colors active:bg-muted/40"
                        >
                          <div className="min-w-0 text-left">
                            <p className="native-row-title truncate">
                              {recipe.name}
                            </p>
                            <p className="native-row-detail mt-0.5">
                              {totals.calories} kcal ·{" "}
                              {recipe.ingredients.length} ingredient
                              {recipe.ingredients.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          <CaretRight
                            size={18}
                            className="shrink-0 text-muted-foreground"
                          />
                        </button>
                        {recipe._id && (
                          <button
                            type="button"
                            onClick={() => {
                              setHomeAddOpen(false)
                              navigate(`/foods/recipe/${recipe._id}`)
                            }}
                            className="native-toolbar-button h-11 w-11 shrink-0 px-0 text-muted-foreground"
                            aria-label={`Edit ${recipe.name}`}
                          >
                            <PencilSimple size={17} weight="bold" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            <div className="mt-5">
              <p className="native-section-title mb-2">More</p>
              <div className="divide-y divide-border border-y border-border">
                <button
                  type="button"
                  onClick={() => {
                    setHomeAddOpen(false)
                    navigate("/recipes")
                  }}
                  className="flex min-h-14 w-full items-center gap-3 px-1 text-left transition-colors active:bg-muted/40"
                >
                  <Lightning
                    size={19}
                    weight="bold"
                    className="text-muted-foreground"
                  />
                  <span className="native-row-title min-w-0 flex-1">
                    Inspire me
                  </span>
                  <CaretRight size={18} className="text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHomeAddOpen(false)
                    navigate("/foods/recipe/new")
                  }}
                  className="flex min-h-14 w-full items-center gap-3 px-1 text-left transition-colors active:bg-muted/40"
                >
                  <ForkKnife
                    size={19}
                    weight="bold"
                    className="text-muted-foreground"
                  />
                  <span className="native-row-title min-w-0 flex-1">
                    New recipe
                  </span>
                  <CaretRight size={18} className="text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHomeAddOpen(false)
                    navigate("/supplements")
                  }}
                  className="flex min-h-14 w-full items-center gap-3 px-1 text-left transition-colors active:bg-muted/40"
                >
                  <Pill
                    size={19}
                    weight="bold"
                    className="text-muted-foreground"
                  />
                  <span className="native-row-title min-w-0 flex-1">
                    Supplements
                  </span>
                  <CaretRight size={18} className="text-muted-foreground" />
                </button>
              </div>
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

      {confirmUnpinGoalId && (
        <div
          className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Unpin Coach goal"
          onClick={() => {
            if (!unpinningCoachGoal) setConfirmUnpinGoalId(null)
          }}
        >
          <div
            className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-2xl"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mt-3 mb-5 h-1 w-10 rounded-full bg-border/60" />
            <div className="px-6">
              <h2 className="text-[17px] font-bold tracking-tight">
                Unpin this Coach goal?
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
                It will disappear from Today, but the goal and its task progress
                will stay available to Coach.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={unpinningCoachGoal}
                  onClick={() => void confirmCoachGoalUnpin()}
                  className="h-12 w-full rounded-xl bg-foreground text-[14px] font-bold text-background transition-opacity active:opacity-80 disabled:opacity-50"
                >
                  {unpinningCoachGoal ? "Unpinning…" : "Unpin from Today"}
                </button>
                <button
                  type="button"
                  disabled={unpinningCoachGoal}
                  onClick={() => setConfirmUnpinGoalId(null)}
                  className="h-12 w-full rounded-xl bg-muted text-[14px] font-bold text-foreground transition-opacity active:opacity-80 disabled:opacity-50"
                >
                  Keep pinned
                </button>
              </div>
            </div>
            <div className="h-4" />
          </div>
        </div>
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
