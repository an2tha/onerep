import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Barbell,
  Barcode,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  DotsSixVertical,
  Fire,
  ForkKnife,
  Lightning,
  Aperture,
  MagnifyingGlass,
  Pill,
  PintGlass,
  Play,
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
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useUser } from "@clerk/react"
import {
  DEFAULT_LAYOUT,
  isDefaultLayout,
  moveWidgetById,
  reorderLayout,
  resolveLayout,
  type WidgetConfig,
  type WidgetId,
} from "@/lib/widget-layout"
import { useQuery, useMutation } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { isBrowserOnline } from "@/lib/offline-queue"
import {
  canStartFoodCapture,
  foodCapturePath,
  type FoodCaptureMode,
} from "@/lib/food-capture"
import { api } from "../../../convex/_generated/api"
import {
  cn,
  createClientId,
  logDevWarn,
  safeSessionStorageGet,
  safeSessionStorageRemove,
} from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { useBottomBarAction } from "@/components/bottom-bar"
import {
  DailyLedgerHero,
  DailySummaryStrip,
  InsightWidgets,
  TodayHeader,
  TodayTimeline,
  type DailySummaryAction,
  type MacroProgress,
  type TimelineEvent,
} from "@/components/home"
import { MobileSheet } from "@/components/mobile-sheet"
import { calcStreak, calcWorkoutsThisWeek } from "@/lib/training-consistency"
import {
  normalizePresetCard,
  type Routine,
  type CachedWorkoutLog,
} from "@/lib/workout-sync"
import {
  currentDateKey,
  dateForOffset,
  defaultMeal,
  detectTimeZone,
  nutritionDetailTotals,
  offsetDateKey,
  type FoodLogEntry,
  DEFAULT_MEAL_CATEGORIES,
} from "@/lib/food-log"
import {
  SUPPLEMENT_DEFINITIONS,
  SUPPLEMENT_LIST,
  completedSupplementCount,
  supplementEntryLabel,
  type SupplementLogEntry,
} from "@/lib/supplements"
import {
  Calendar,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui"
import {
  APP_ACCENT_COLORS,
  MACRO_COLORS,
  MICRO_COLORS,
} from "@/lib/design-tokens"

// ─── Types ────────────────────────────────────────────────────────────────────

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
const COMPLETE_COLOR = APP_ACCENT_COLORS.complete
const DANGER_COLOR = APP_ACCENT_COLORS.danger
const FOOD_COLOR = APP_ACCENT_COLORS.food
const WATER_COLOR = APP_ACCENT_COLORS.water

const EMPTY_WORKOUT_ROUTINE: Routine = {
  Mon: null,
  Tue: null,
  Wed: null,
  Thu: null,
  Fri: null,
  Sat: null,
  Sun: null,
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

function readRecentlyAbortedWorkoutSlot(): 1 | 2 | null {
  const value = safeSessionStorageGet(ABORTED_WORKOUT_SLOT_KEY)
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

function fmtWater(ml: number): string {
  if (ml >= 1000) {
    const l = ml / 1000
    return l % 1 === 0 ? `${l} L` : `${l.toFixed(1)} L`
  }
  return `${ml} ml`
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
  label,
  index,
  count,
  onMove,
  children,
}: {
  id: WidgetId
  editMode: boolean
  size: "full" | "small"
  label: string
  index: number
  count: number
  onMove: (id: WidgetId, direction: "up" | "down") => void
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
        "relative flex min-h-0",
        size === "full" ? "col-span-2 row-span-2" : "col-span-1 row-span-1"
      )}
    >
      {children}
      {editMode && (
        <div className="pointer-events-none absolute inset-0 z-10 flex overflow-hidden rounded-[12px]">
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
          <div className="pointer-events-auto ml-auto flex flex-col border-l border-border/35 bg-background/82 backdrop-blur">
            <button
              type="button"
              onClick={() => onMove(id, "up")}
              disabled={index === 0}
              className="flex h-10 w-10 items-center justify-center text-muted-foreground/70 transition-colors active:bg-muted/60 active:text-foreground disabled:opacity-25"
              aria-label={`Move ${label} earlier`}
            >
              <CaretUp size={13} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => onMove(id, "down")}
              disabled={index >= count - 1}
              className="flex h-10 w-10 items-center justify-center border-t border-border/35 text-muted-foreground/70 transition-colors active:bg-muted/60 active:text-foreground disabled:opacity-25"
              aria-label={`Move ${label} later`}
            >
              <CaretDown size={13} weight="bold" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useSmoothNavigate()
  const { user } = useUser()
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

  // ── Widget layout ─────────────────────────────────────────────────────────

  const [widgetLayout, setWidgetLayout] = useState<WidgetConfig[]>(() =>
    resolveLayout(null)
  )
  const [widgetLayoutSaveState, setWidgetLayoutSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const widgetLayoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
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

  useEffect(() => {
    return () => {
      if (widgetLayoutSaveTimer.current) {
        clearTimeout(widgetLayoutSaveTimer.current)
      }
    }
  }, [])

  function persistWidgetLayout(next: WidgetConfig[]) {
    if (widgetLayoutSaveTimer.current) {
      clearTimeout(widgetLayoutSaveTimer.current)
      widgetLayoutSaveTimer.current = null
    }

    setWidgetLayout(next)
    setWidgetLayoutSaveState("saving")
    void saveWidgetLayout({ layout: next })
      .then(() => {
        setWidgetLayoutSaveState("saved")
        widgetLayoutSaveTimer.current = setTimeout(() => {
          setWidgetLayoutSaveState("idle")
          widgetLayoutSaveTimer.current = null
        }, 1600)
      })
      .catch((error) => {
        setWidgetLayoutSaveState("error")
        reportOfflineMutationError(error)
      })
  }

  function handleMoveWidget(id: WidgetId, direction: "up" | "down") {
    const next = moveWidgetById(widgetLayout, id, direction)
    if (next === widgetLayout) return
    persistWidgetLayout(next)
  }

  function resetWidgetLayout() {
    persistWidgetLayout([...DEFAULT_LAYOUT])
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = widgetLayout.findIndex((w) => w.id === active.id)
    const newIndex = widgetLayout.findIndex((w) => w.id === over.id)
    const next = reorderLayout(widgetLayout, oldIndex, newIndex)
    if (next === widgetLayout) return
    persistWidgetLayout(next)
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
  const waterEntries = useMemo(
    () =>
      (waterLogs ?? []) as { id: string; amountMl: number; loggedAt: string }[],
    [waterLogs]
  )
  const supplementEntries = useMemo(
    () => (supplementLogs ?? []) as SupplementLogEntry[],
    [supplementLogs]
  )

  const now = new Date()

  const workoutDates = useMemo(
    () =>
      new Set((workoutHistory ?? []).map((log: { date: string }) => log.date)),
    [workoutHistory]
  )
  const streak = calcStreak(workoutDates, now)
  const workoutsThisWeek = calcWorkoutsThisWeek(workoutDates, now)

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser) return
    void syncTimezone({ timeZone: detectTimeZone() }).catch((error) => {
      logDevWarn("Failed to sync timezone", error)
    })
  }, [currentUser, syncTimezone])

  useEffect(() => {
    if (currentUser && onboarding === null) {
      navigate("/onboarding", { replace: true })
    }
  }, [currentUser, navigate, onboarding])

  const firstName =
    user?.firstName ?? user?.fullName?.trim().split(/\s+/)[0] ?? "there"
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

  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<1 | 2 | null>(null)
  const [homeAddOpen, setHomeAddOpen] = useState(false)
  const [snapOffline, setSnapOffline] = useState(false)
  useBottomBarAction(() => setHomeAddOpen(true))

  function startFoodCapture(mode: FoodCaptureMode) {
    if (!canStartFoodCapture(mode, isBrowserOnline())) {
      setSnapOffline(true)
      return false
    }

    setSnapOffline(false)
    navigate(foodCapturePath(mode))
    return true
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
    if (!stillReturned) {
      safeSessionStorageRemove(ABORTED_WORKOUT_SLOT_KEY)
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

  const dailySummaryActions: DailySummaryAction[] = (() => {
    const actions: DailySummaryAction[] = []

    if (activeWorkout) {
      actions.push({
        id: "active-workout",
        label: "Next",
        value: "Resume workout",
        detail: `Slot ${activeWorkout.slot ?? 1} is in progress`,
        icon: <Play size={17} weight="fill" />,
        tone: "workout",
        onClick: openWorkoutAction,
      })
    } else if (!hasCompletedWorkout && scheduledWorkout) {
      actions.push({
        id: "scheduled-workout",
        label: isTodaySelected ? "Next" : "Planned",
        value: scheduledWorkout.name,
        detail: `${scheduledWorkout.duration} ready`,
        icon: <Barbell size={17} weight="bold" />,
        tone: "workout",
        onClick: openWorkoutAction,
      })
    }

    if (foodEntries.length === 0) {
      actions.push({
        id: "log-meal",
        label: "Food",
        value: `Log ${currentMealLabel.toLowerCase()}`,
        detail: "Search, scan, or snap a meal",
        icon: <ForkKnife size={17} weight="bold" />,
        tone: "food",
        onClick: () => setHomeAddOpen(true),
      })
    } else if (caloriesLeft < 0) {
      actions.push({
        id: "calorie-over",
        label: "Food",
        value: `${fmtKcal(Math.abs(caloriesLeft))} over`,
        detail: "Review today’s intake",
        icon: <Fire size={17} weight="fill" />,
        tone: "food",
        onClick: () => navigate("/nutrition"),
      })
    } else {
      actions.push({
        id: "calorie-left",
        label: "Food",
        value: `${fmtKcal(caloriesLeft)} kcal left`,
        detail: `${foodEntries.length} logged today`,
        icon: <ForkKnife size={17} weight="bold" />,
        tone: "food",
        onClick: () => navigate("/foods"),
      })
    }

    const waterRemainingMl = Math.max(0, waterGoalMl - waterTotalMl)
    actions.push({
      id: "water",
      label: "Water",
      value:
        waterRemainingMl > 0
          ? `${fmtWater(waterRemainingMl)} left`
          : "Goal hit",
      detail:
        waterRemainingMl > 0
          ? "+250 ml now"
          : `${fmtWater(waterTotalMl)} logged`,
      icon: <PintGlass size={17} weight="bold" />,
      tone: "water",
      onClick: addQuickWater,
    })

    if (supplementRemainingCount > 0) {
      actions.push({
        id: "supplements",
        label: "Supplements",
        value: `${supplementRemainingCount} left`,
        detail: `${supplementDoneCount}/${supplementTargetCount} done`,
        icon: <Pill size={17} weight="bold" />,
        tone: "supplement",
        onClick: () => navigate("/supplements"),
      })
    } else {
      actions.push({
        id: "progress",
        label: "Progress",
        value: latestMeasurement ? "Check trends" : "Check in",
        detail: latestMeasurement ? weightDetail : "Add body metrics",
        icon: <Lightning size={17} weight="bold" />,
        tone: "progress",
        onClick: () => navigate("/progress"),
      })
    }

    return actions.slice(0, 3)
  })()

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

  function addWaterAmount(amountMl: number) {
    void addWaterEntry({
      date: selectedDate,
      entry: {
        id: createClientId(),
        amountMl,
        loggedAt: new Date().toISOString(),
      },
    }).catch(reportOfflineMutationError)
  }

  function addQuickWater() {
    addWaterAmount(250)
  }

  function deleteTimelineEvent(event: TimelineEvent) {
    if (event.kind === "food") {
      const id = event.id.replace(/^food-/, "")
      void setDay({
        date: selectedDate,
        entries: foodEntries.filter((entry) => entry.id !== id),
      }).catch(reportOfflineMutationError)
      return
    }

    if (event.kind === "water") {
      void removeWaterEntry({
        date: selectedDate,
        id: event.id.replace(/^water-/, ""),
      }).catch(reportOfflineMutationError)
      return
    }

    if (event.kind === "supplement") {
      void removeSupplementEntry({
        date: selectedDate,
        id: event.id.replace(/^supplement-/, ""),
      }).catch(reportOfflineMutationError)
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
      <div className="mx-auto flex max-w-lg flex-col pb-24 md:max-w-6xl md:pb-10">
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

            <DailySummaryStrip actions={dailySummaryActions} />

            <InsightWidgets
              editMode={editMode}
              onToggleEdit={() => setEditMode((value) => !value)}
              onReset={resetWidgetLayout}
              canReset={!isDefaultLayout(widgetLayout)}
              saveState={widgetLayoutSaveState}
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
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {widgetLayout.map((widget, index) => (
                      <SortableWidget
                        key={widget.id}
                        id={widget.id}
                        editMode={editMode}
                        size={widget.size}
                        label={statsByWidget[widget.id].title}
                        index={index}
                        count={widgetLayout.length}
                        onMove={handleMoveWidget}
                      >
                        <DashboardStatCard
                          stat={statsByWidget[widget.id]}
                          compact={widget.size === "small"}
                        />
                      </SortableWidget>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </InsightWidgets>

            <TodayTimeline
              events={timelineEvents}
              onLogFood={() => navigate("/foods")}
              onLogWater={addQuickWater}
              onStartWorkout={openWorkoutAction}
              onDeleteEvent={deleteTimelineEvent}
            />
          </>
        ) : (
          <div
            role="status"
            aria-label="Loading today"
            className="flex min-h-[45svh] flex-col items-center justify-center px-6 text-center"
          >
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
            <p className="mt-4 text-[14px] font-semibold tracking-tight">
              Loading today
            </p>
            <p className="mt-1 max-w-[16rem] text-[12px] leading-4 text-muted-foreground/60">
              Pulling together your workout, food, water, and supplement logs.
            </p>
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
        >
          <div className="px-4 pt-1 pb-4">
            <div className="app-surface mb-3 overflow-hidden">
              <button
                onClick={() => {
                  if (startFoodCapture("barcode") !== false)
                    setHomeAddOpen(false)
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
                onClick={() => {
                  if (startFoodCapture("snap") !== false) setHomeAddOpen(false)
                }}
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
            </div>

            <div className="app-surface mb-3 p-3.5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="app-icon-button pointer-events-none h-9 w-9 bg-[var(--accent-water-bg)] text-[var(--accent-water)]">
                    <PintGlass size={16} weight="bold" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">Quick water</p>
                    <p className="text-[11.5px] text-muted-foreground/60">
                      {fmtWater(waterTotalMl)} of {fmtWater(waterGoalMl)}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] font-bold text-muted-foreground/50 tabular-nums">
                  {waterPct}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[250, 500, 1000].map((amountMl) => (
                  <button
                    key={amountMl}
                    type="button"
                    onClick={() => {
                      addWaterAmount(amountMl)
                      setHomeAddOpen(false)
                    }}
                    className="h-11 rounded-[10px] bg-[var(--accent-water-bg)] text-[13px] font-extrabold text-[var(--accent-water)] transition-opacity active:opacity-70"
                  >
                    +{fmtWater(amountMl)}
                  </button>
                ))}
              </div>
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
                  <span className="text-[13px] font-medium">Search food</span>
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
                  <span className="text-[13px] font-medium">New recipe</span>
                </div>
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
              <div className="mx-4 h-px bg-border/50" />
              <button
                onClick={() => {
                  setHomeAddOpen(false)
                  navigate("/supplements")
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
                  <span className="text-[13px] font-medium">Log workout</span>
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
                    }).catch(reportOfflineMutationError)
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
    </div>
  )
}
