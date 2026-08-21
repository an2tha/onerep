import { useEffect, useMemo, useRef, useState } from "react"
import { useWeightUnit } from "@/lib/use-weight-unit"
import { useEnergyUnit } from "@/lib/use-energy-unit"
import { flushSync } from "react-dom"
import {
  Aperture,
  ArrowsInLineVertical,
  Barcode,
  BookBookmark,
  CaretDown,
  CaretRight,
  Check,
  Clock,
  Eye,
  EyeSlash,
  ForkKnife,
  Lightning,
  MagnifyingGlass,
  PencilSimple,
  Pill,
  Plus,
  PushPin,
  SlidersHorizontal,
  Sparkle,
  UserCircle,
  X,
} from "@phosphor-icons/react"
import { useAppAuth } from "@/lib/auth-client"
import { useQuery, useMutation } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { computeReadiness } from "@/lib/readiness"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { cn, safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"
import { WELCOME_NUDGE_SEEN_KEY } from "@/lib/welcome-nudge"
import { useSmoothNavigate } from "@/lib/navigation"
import { useBottomBarAction } from "@/components/bottom-bar"
import {
  DailyLedgerHero,
  DashboardHero,
  DashboardWeekRings,
  DashboardProgressPanels,
  CoachDashboardWidgets,
  CoachGoalCards,
  TrainingWeekCard,
  TodayTimeline,
  WeeklyPlanCard,
  type PinnedCoachGoal,
  type TimelineEvent,
  type WeeklyPlanDayView,
} from "@repo/ui"
import { weekStart } from "@/lib/muscle-volume"
import { getActiveWorkoutProgress } from "@/lib/dashboard-workout-progress"
import { MobileSheet } from "@/components/mobile-sheet"
import { TourAnchor } from "@/components/walkthrough/tour-anchor"
import { useAiFeatureGate } from "@/lib/ai-access"
import {
  normalizePresetCard,
  type Routine,
  type CachedWorkoutLog,
} from "@/lib/workout-sync"
import type { WorkoutHistoryLog } from "@/lib/exercise-history"
import { useMuscleRecovery } from "@/lib/use-muscle-recovery"
import {
  currentDateKey,
  defaultMeal,
  detectTimeZone,
  nutritionDetailTotals,
  offsetDateKey,
  stripUndefined,
  type FoodLogEntry,
  type Recipe,
  DEFAULT_MEAL_CATEGORIES,
} from "@/lib/food-log"
import {
  carbLabel,
  displayCarbGoal,
  netCarbs,
  type CarbDisplayMode,
} from "@/lib/carb-display"
import {
  SUPPLEMENT_DEFINITIONS,
  combineMacroTotals,
  nutrientTotal,
  supplementEntryLabel,
  type SupplementLogEntry,
} from "@/lib/supplements"
import { hapticHeavy, hapticMedium, hapticSelection } from "@/lib/haptics"
import {
  ACTIVITY_WEEKS,
  buildActivityGrid,
  calcTrailingSessions,
  calcWorkoutsThisWeek,
} from "@/lib/training-consistency"
import { useReplayKey } from "@repo/ui"
import { MACRO_COLORS } from "@repo/ui"
import { isTrendMetric, type TrendMetric } from "@repo/ui"
import { toast } from "@repo/ui"
import { STARTER_RECIPES, type StarterRecipe } from "@/pages/RecipesHub"

// ─── Dashboard modules ────────────────────────────────────────────────────────
//
// The cards themselves live in `src/dashboard/`. What stays here is the part
// that cannot be pulled apart: the queries, the day's derived numbers, and the
// order the sections appear in.

import {
  ABORTED_WORKOUT_SLOT_KEY,
  DANGER_COLOR,
  DEFAULT_DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_LABELS,
  COMPLETE_COLOR,
  EMPTY_WORKOUT_ROUTINE,
  WEEK_LABELS,
  type ActiveWorkoutCandidate,
  type CalorieInfo,
  type DashboardSettings,
  type DashboardWidgetLayoutItem,
} from "@/dashboard/constants"
import {
  dateKeyToCalendarDate,
  dateKeyToDay,
  dayOffsetLabel,
  fmtWater,
  greeting,
  hourInTimeZone,
  isLiveActiveWorkout,
  readRecentlyAbortedWorkoutSlot,
  totalsForEntries,
  totalsForRecipe,
} from "@/dashboard/helpers"
import { DateNav } from "@/dashboard/date-nav"
import { WorkoutCard } from "@/dashboard/workout-card"
import { ActivityGraph } from "@/dashboard/activity-graph"
import { WaterWidget } from "@/dashboard/water"
import { UnloggedWorkoutNudge, WelcomeNudge } from "@/dashboard/nudges"

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useSmoothNavigate()
  const { user } = useAppAuth()
  const energyUnit = useEnergyUnit()
  const [dayOffset, setDayOffset] = useState(0)
  const quickWaterBurst = useReplayKey(1300)
  const [dashboardTrendMetric, setDashboardTrendMetricState] =
    useState<TrendMetric>("waistCm")
  // Preferences arrive after first paint, so seed once and then let the user's
  // own selection win — same guard pattern as `datePickedRef` in Nutrition.
  const trendMetricSeededRef = useRef(false)

  // ── Queries ──────────────────────────────────────────────────────────────

  const onboarding = useQuery(api.users.onboarding.get, {})
  const currentUser = useQuery(api.users.users.getCurrentUser, {})
  const preferences = useQuery(api.users.users.getPreferences, {})
  const weightUnit = useWeightUnit()
  const activeTimezone = preferences?.lastActiveTimezone || "UTC"
  const todayKey = currentDateKey(activeTimezone)
  const selectedDate = useMemo(
    () => offsetDateKey(todayKey, dayOffset),
    [dayOffset, todayKey]
  )

  // Coach writes weekly plans but nothing read them back until now. `weekStart`
  // is the shared Monday-anchored helper, matched by `mondayOf` on the server.
  const weeklyPlanRaw = useQuery(api.ai.coachState.getWeeklyPlan, {
    weekStart: weekStart(todayKey),
  })
  const weeklyPlan = weeklyPlanRaw as
    | {
        title: string
        days: WeeklyPlanDayView[]
        assumptions: string[]
      }
    | null
    | undefined
  const todayShortDay = useMemo(
    () =>
      new Date(`${todayKey}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "UTC",
      }),
    [todayKey]
  )

  const effectiveGoals = useQuery(api.users.users.getEffectiveGoals, {
    date: selectedDate,
  })
  const serverPresets = useQuery(api.logs.presets.list, {})
  const schedule = useQuery(api.users.schedules.get, {})
  const activeWorkouts = useQuery(api.logs.activeWorkout.getAllActive, {})
  const recipesQuery = useQuery(api.logs.recipes.list, {})
  const suggestedMealsQuery = useQuery(api.logs.recipes.suggestedForDashboard, {
    beforeOrOn: selectedDate,
    limit: 6,
  })
  // Defaulted rather than gated on: the dashboard renders before the slower
  // secondary queries land, so every consumer has to tolerate "not yet".
  const suggestedMeals = useMemo(
    () => suggestedMealsQuery ?? [],
    [suggestedMealsQuery]
  )
  const pinnedCoachGoals = useQuery(api.ai.coachGoals.listPinned, { limit: 4 })
  const latestCheckIns = useQuery(api.ai.coachState.listCheckIns, { limit: 1 })
  const bodyMeasurements = useQuery(api.bodyProgress.list)
  const coachDashboardWidgets = useQuery(
    api.dashboardWidgets.listPinnedWithData,
    { beforeOrOn: selectedDate }
  )

  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date: selectedDate })
  const recentFoodLogs = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: selectedDate,
    limit: 7,
  })
  // Separate window for the 28-day consistency grid so the 7-day averages
  // above keep their own range.
  const consistencyFoodLogs = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: selectedDate,
    limit: 28,
  })
  const workoutHistoryQuery = useQuery(api.logs.workouts.getHistory)
  const muscleRecovery = useMuscleRecovery(
    workoutHistoryQuery as unknown as WorkoutHistoryLog[] | undefined
  )
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
  const removeFoodEntryById = useOfflineMutation(
    api.logs.foodLogs.removeEntry,
    "logs.foodLogs.removeEntry"
  )
  const addFoodEntry = useOfflineMutation(
    api.logs.foodLogs.addEntry,
    "logs.foodLogs.addEntry"
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
  const saveDashboardWidgetLayout = useOfflineMutation(
    api.users.users.setWidgetLayout,
    "users.users.setWidgetLayout"
  )
  const persistTrendMetric = useOfflineMutation(
    api.users.users.setDashboardTrendMetric,
    "users.users.setDashboardTrendMetric"
  )
  const setCoachGoalPinned = useMutation(api.ai.coachGoals.setPinned)
  const setCoachDashboardWidgetPinned = useMutation(
    api.dashboardWidgets.setPinned
  )
  const setCustomProgressMetricValue = useMutation(
    api.customProgressMetrics.setValue
  )
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

  useEffect(() => {
    if (trendMetricSeededRef.current) return
    const stored = preferences?.dashboardSettings?.trendMetric
    if (!stored) return
    if (isTrendMetric(stored)) setDashboardTrendMetricState(stored)
    trendMetricSeededRef.current = true
  }, [preferences])

  function setDashboardTrendMetric(metric: TrendMetric) {
    // Optimistic: the chart redraws immediately, the write catches up.
    trendMetricSeededRef.current = true
    setDashboardTrendMetricState(metric)
    void persistTrendMetric({ metric })
  }

  useEffect(() => {
    const saved = preferences?.widgetLayout as
      DashboardWidgetLayoutItem[] | undefined
    if (!saved?.length) return
    const known = saved.filter((item) => item.id in DASHBOARD_WIDGET_LABELS)
    const missing = DEFAULT_DASHBOARD_WIDGETS.filter(
      (widget) => !known.some((item) => item.id === widget.id)
    )
    setDashboardWidgetLayout([...known, ...missing])
  }, [preferences?.widgetLayout])

  function updateDashboardLayout(next: DashboardWidgetLayoutItem[]) {
    setDashboardWidgetLayout(next)
    void saveDashboardWidgetLayout({ layout: next })
  }

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
  // Scenery: a photo at random, crossfading to another every twenty seconds,
  // served from the device once the first launch has stored it.
  const selectedDateLabel = dayOffsetLabel(dayOffset, activeTimezone)
  const dateLabel = `${dateKeyToCalendarDate(selectedDate).toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
    }
  )}${calorieInfo?.isTrainingDay ? " · training day" : ""}${
    dayOffset === 0 ? "" : ` · ${selectedDateLabel}`
  }`

  const scheduledWorkout = useMemo(() => {
    const day = dateKeyToDay(selectedDate, activeTimezone)
    const presetId = storedRoutine[day]
    return storedPresets.find((preset) => preset.id === presetId) ?? null
  }, [activeTimezone, selectedDate, storedPresets, storedRoutine])

  // Shown once per day; dismissing stores the day it applies to.
  const [welcomeSeenDay, setWelcomeSeenDay] = useState(() =>
    safeLocalStorageGet(WELCOME_NUDGE_SEEN_KEY)
  )
  const showWelcomeNudge = dayOffset === 0 && welcomeSeenDay !== todayKey
  function dismissWelcomeNudge() {
    safeLocalStorageSet(WELCOME_NUDGE_SEEN_KEY, todayKey)
    setWelcomeSeenDay(todayKey)
  }

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
  const [recipeRemix, setRecipeRemix] = useState<{
    label: string
    calories: number
    protein: number
    request: string
  } | null>(null)
  const [dashboardCustomizeOpen, setDashboardCustomizeOpen] = useState(false)
  const [dashboardWidgetLayout, setDashboardWidgetLayout] = useState<
    DashboardWidgetLayoutItem[]
  >(DEFAULT_DASHBOARD_WIDGETS)
  const [snapOffline, setSnapOffline] = useState(false)
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
    if (!requireAiAccess(1, "snap_camera")) return
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

  // Supplements carry real macros (protein powder, mass gainers, MCT oil), so
  // the day's intake is food + supplements. The Nutrition page already does
  // this; Today used to show food only and the two screens disagreed.
  const supplementNutritionTotals = (
    supplementOverview as
      { nutritionTotals?: Partial<Record<string, number>> } | undefined
  )?.nutritionTotals
  const intakeTotals = useMemo(
    () =>
      combineMacroTotals(
        totalsForEntries(foodEntries),
        supplementNutritionTotals
      ),
    [foodEntries, supplementNutritionTotals]
  )
  const supplementCalories = nutrientTotal(
    supplementNutritionTotals,
    "calories"
  )
  const carbMode: CarbDisplayMode = preferences?.netCarbsEnabled
    ? "net"
    : "total"
  // Only computed when net mode is on — nutritionDetailTotals walks every
  // micronutrient for every entry, which is wasted work in total mode.
  const foodFiberTotal = useMemo(
    () =>
      carbMode === "net" ? (nutritionDetailTotals(foodEntries).fiber ?? 0) : 0,
    [carbMode, foodEntries]
  )
  const fiberGoal = effectiveGoals?.health?.fiber
  // Someone commenting on your diary is the one sharing event worth surfacing
  // on Today. Dismissal is per-session — no push in v1.
  const unreadComments =
    useQuery(api.sharing.diaryComments.unreadCount, {}) ?? 0
  const [commentsDismissed, setCommentsDismissed] = useState(false)
  const waterGoalMl = preferences?.waterGoalMl ?? 2500
  const waterTotalMl = waterEntries.reduce(
    (sum, entry) => sum + entry.amountMl,
    0
  )
  const caloriesTarget = calorieInfo?.target ?? 2000
  const caloriesLeft = Math.round(caloriesTarget - intakeTotals.calories)
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
  const proteinProgress =
    proteinTarget > 0
      ? Math.min(100, (intakeTotals.protein / proteinTarget) * 100)
      : 100
  const waterProgress =
    waterGoalMl > 0 ? Math.min(100, (waterTotalMl / waterGoalMl) * 100) : 0
  const heroMacros = useMemo(
    () => [
      {
        label: "Protein",
        shortLabel: "P",
        value: Math.round(intakeTotals.protein),
        target: Math.round(calorieInfo?.protein ?? 140),
        color: MACRO_COLORS.protein,
      },
      {
        label: carbLabel(carbMode),
        shortLabel: "C",
        value: Math.round(
          carbMode === "net"
            ? netCarbs({ carbs: intakeTotals.carbs, fiber: foodFiberTotal })
            : intakeTotals.carbs
        ),
        target: Math.round(
          displayCarbGoal(calorieInfo?.carbs ?? 220, fiberGoal, carbMode)
        ),
        color: MACRO_COLORS.carbs,
      },
      {
        label: "Fat",
        shortLabel: "F",
        value: Math.round(intakeTotals.fat),
        target: Math.round(calorieInfo?.fat ?? 70),
        color: MACRO_COLORS.fat,
      },
    ],
    [
      calorieInfo?.carbs,
      calorieInfo?.fat,
      calorieInfo?.protein,
      carbMode,
      fiberGoal,
      foodFiberTotal,
      intakeTotals.carbs,
      intakeTotals.fat,
      intakeTotals.protein,
    ]
  )

  // Mon–Sun set volume for the "Training this week" strip. Today's scheduled
  // (but not yet completed) session renders as the hatched, planned bar.
  const trainingWeek = useMemo(() => {
    const logs = (
      (workoutHistoryQuery ?? []) as unknown as CachedWorkoutLog[]
    ).filter((log) => Boolean(log.date))
    const todayKeyLocal = currentDateKey(activeTimezone)
    const todayDow = dateKeyToCalendarDate(todayKeyLocal).getDay()
    const daysFromMonday = todayDow === 0 ? 6 : todayDow - 1

    const setsByDate = new Map<string, number>()
    for (const log of logs) {
      const completedSets = (log.exercises ?? []).reduce(
        (total, exercise) =>
          total + (exercise.sets ?? []).filter((set) => set.completed).length,
        0
      )
      setsByDate.set(log.date, (setsByDate.get(log.date) ?? 0) + completedSets)
    }

    // Planned set count comes from the raw preset doc; the card type only
    // carries display strings.
    const scheduledPresetDoc = scheduledWorkout
      ? (serverPresets ?? []).find(
          (preset) => (preset.id ?? preset._id) === scheduledWorkout.id
        )
      : undefined
    const exerciseData = (scheduledPresetDoc?.exerciseData ?? {}) as Record<
      string,
      { sets?: unknown[] }
    >
    const plannedSets = Object.values(exerciseData).reduce(
      (total, state) => total + (state?.sets?.length ?? 0),
      0
    )

    const days = Array.from({ length: 7 }, (_, index) => {
      const dateKey = offsetDateKey(todayKeyLocal, index - daysFromMonday)
      const sets = setsByDate.get(dateKey) ?? 0
      const isToday = dateKey === todayKeyLocal
      return {
        label: WEEK_LABELS[index]!,
        sets: isToday && sets === 0 && plannedSets > 0 ? plannedSets : sets,
        isToday,
        planned: isToday && sets === 0 && plannedSets > 0,
      }
    })

    const weekDateKeys = new Set(
      Array.from({ length: 7 }, (_, index) =>
        offsetDateKey(todayKeyLocal, index - daysFromMonday)
      )
    )
    const weekLogs = logs.filter((log) => weekDateKeys.has(log.date))

    return {
      days,
      sessions: weekLogs.length,
      sets: days.reduce(
        (total, day) => total + (day.planned ? 0 : day.sets),
        0
      ),
      plannedSets,
    }
  }, [activeTimezone, scheduledWorkout, serverPresets, workoutHistoryQuery])

  // 28-day consistency grid. A day counts as "full" when it was genuinely
  // tracked (2+ meals logged), "partial" when there was some activity that day
  // (one meal, or a workout with no food logged).
  const workoutDates = useMemo(
    () =>
      new Set(
        ((workoutHistoryQuery ?? []) as unknown as CachedWorkoutLog[])
          .map((log) => log.date)
          .filter(Boolean)
      ),
    [workoutHistoryQuery]
  )
  const trainingStatsDate = useMemo(() => {
    const date = new Date()
    date.setUTCHours(12, 0, 0, 0)
    return date
  }, [])
  const workoutsThisWeek = calcWorkoutsThisWeek(workoutDates, trainingStatsDate)
  const trainingDaysLast28 = calcTrailingSessions(
    workoutDates,
    trainingStatsDate,
    28
  )

  // Completed sets per day, which is what shades a square. A logged session
  // with nothing ticked off still counts as one set: the day happened.
  const activityCells = useMemo(() => {
    const setsByDate = new Map<string, number>()
    for (const log of (workoutHistoryQuery ??
      []) as unknown as CachedWorkoutLog[]) {
      if (!log.date) continue
      const sets = (log.exercises ?? []).reduce(
        (total, exercise) =>
          total + (exercise.sets ?? []).filter((set) => set.completed).length,
        0
      )
      setsByDate.set(log.date, (setsByDate.get(log.date) ?? 0) + Math.max(1, sets))
    }
    return buildActivityGrid(setsByDate, trainingStatsDate, ACTIVITY_WEEKS)
  }, [trainingStatsDate, workoutHistoryQuery])

  const consistency = useMemo(() => {
    const foodDays = new Map<string, number>()
    for (const day of (consistencyFoodLogs ?? []) as Array<{
      date: string
      entries: FoodLogEntry[]
    }>) {
      const meals = new Set(day.entries.map((entry) => entry.meal))
      foodDays.set(day.date, meals.size)
    }
    const workoutDays = new Set(
      ((workoutHistoryQuery ?? []) as unknown as CachedWorkoutLog[])
        .map((log) => log.date)
        .filter(Boolean)
    )

    const todayKeyLocal = currentDateKey(activeTimezone)
    const days = Array.from({ length: 28 }, (_, index) => {
      const dateKey = offsetDateKey(todayKeyLocal, index - 27)
      const mealCount = foodDays.get(dateKey) ?? 0
      const trained = workoutDays.has(dateKey)
      const level: "full" | "partial" | "none" =
        mealCount >= 2
          ? "full"
          : mealCount === 1 || trained
            ? "partial"
            : "none"
      return { date: dateKey, level }
    })

    return {
      days,
      fullCount: days.filter((day) => day.level === "full").length,
      windowSize: days.length,
    }
  }, [activeTimezone, consistencyFoodLogs, workoutHistoryQuery])

  const dashboardWeeklyStory = useMemo(() => {
    const allWorkouts = [
      ...((workoutHistoryQuery ?? []) as unknown as CachedWorkoutLog[]),
    ].sort(
      (a, b) =>
        Number(new Date(a.completedAt)) - Number(new Date(b.completedAt))
    )
    const recentWorkouts = allWorkouts.slice(-7)
    const completedSets = recentWorkouts.reduce(
      (total, workout) =>
        total +
        (workout.exercises ?? []).reduce(
          (exerciseTotal, exercise) =>
            exerciseTotal +
            (exercise.sets ?? []).filter((set) => set.completed).length,
          0
        ),
      0
    )
    const days = (recentFoodLogs ?? []) as Array<{
      entries: FoodLogEntry[]
    }>
    const proteinAverage =
      days.length > 0
        ? days.reduce(
            (sum, day) =>
              sum +
              day.entries.reduce((daySum, entry) => daySum + entry.protein, 0),
            0
          ) / days.length
        : 0
    const bestByExercise = new Map<string, number>()
    const recordTimeline: Array<{ label: string; detail: string }> = []
    for (const workout of allWorkouts) {
      for (const exercise of workout.exercises ?? []) {
        const bestSet = Math.max(
          0,
          ...(exercise.sets ?? [])
            .filter((set) => set.completed)
            .map((set) => Number(set.weight))
            .filter(Number.isFinite)
        )
        const previousBest = bestByExercise.get(exercise.name) ?? 0
        if (bestSet > previousBest) {
          if (previousBest > 0) {
            recordTimeline.push({
              label: exercise.name,
              detail: `${bestSet} ${weightUnit === "lbs" ? "lb" : "kg"} · ${workout.date}`,
            })
          }
          bestByExercise.set(exercise.name, bestSet)
        }
      }
    }
    const measured = (bodyMeasurements ?? []).filter(
      (item) => typeof item.weightKg === "number"
    )
    const firstWeight = measured[0]?.weightKg
    const lastWeight = measured.at(-1)?.weightKg
    const unitMultiplier = weightUnit === "lbs" ? 2.20462 : 1
    return {
      workouts: recentWorkouts.length,
      completedSets,
      nutritionDays: days.filter((day) => day.entries.length > 0).length,
      proteinAdherence:
        proteinTarget > 0
          ? Math.min(200, (proteinAverage / proteinTarget) * 100)
          : 0,
      ...(firstWeight != null && lastWeight != null
        ? { weightChange: (lastWeight - firstWeight) * unitMultiplier }
        : {}),
      weightUnit:
        weightUnit,
      records: recordTimeline.slice(-3).reverse(),
    }
  }, [
    bodyMeasurements,
    preferences?.weightUnit,
    proteinTarget,
    recentFoodLogs,
    workoutHistoryQuery,
  ])

  // The health page's headline number, so the week reads as one picture rather
  // than sending people to another tab to find out how they are doing.
  const healthDashboard = useQuery(api.logs.healthMetrics.dashboard, {
    today: selectedDate,
  })

  const dashboardReadiness = useMemo(
    () =>
      computeReadiness({
        checkIn: latestCheckIns?.[0] ?? null,
        proteinProgress,
        waterProgress,
        muscleGroups: muscleRecovery,
      }),
    [latestCheckIns, muscleRecovery, proteinProgress, waterProgress]
  )

  const recentMealNames = useMemo(
    () =>
      [
        ...new Set(
          (
            (recentFoodLogs ?? []) as Array<{ entries: FoodLogEntry[] }>
          ).flatMap((day) => day.entries.map((entry) => entry.name))
        ),
      ].slice(0, 3),
    [recentFoodLogs]
  )

  /**
   * Repeats and saved recipes, merged into one list. A repeat that is also a
   * saved recipe is the same tap either way, so it appears once — showing it
   * twice was an artefact of them being two separate rows.
   */
  const quickLogRows = useMemo(() => {
    const rows: Array<{
      kind: "repeat" | "recipe"
      name: string
      detail: string
      onLog: () => void
    }> = []
    const seen = new Set<string>()

    for (const meal of recentMealNames) {
      const key = meal.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const recipe = recipes.find((item) => item.name === meal)
      rows.push({
        kind: "repeat",
        name: meal,
        detail: recipe
          ? `Recent · ${totalsForRecipe(recipe.ingredients).calories} ${energyUnit}`
          : "Recent",
        onLog: () => {
          hapticSelection()
          if (recipe) logRecipeFromQuickAdd(recipe)
          else
            navigate(`/foods/search?q=${encodeURIComponent(meal)}`, {
              motion: "forward",
            })
        },
      })
    }

    for (const recipe of recipes) {
      const key = recipe.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const totals = totalsForRecipe(recipe.ingredients)
      rows.push({
        kind: "recipe",
        name: recipe.name,
        detail: `Recipe · ${totals.calories} ${energyUnit}`,
        onLog: () => {
          hapticSelection()
          logRecipeFromQuickAdd(recipe)
        },
      })
    }

    return rows.slice(0, 5)
  }, [recentMealNames, recipes, navigate, energyUnit])

  function openRecipePreview(recipe: StarterRecipe) {
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => { finished: Promise<void> }
    }
    if (!transitionDocument.startViewTransition) {
      setPreviewRecipe(recipe)
      return
    }
    document.documentElement.dataset.recipeTransition = "true"
    const transition = transitionDocument.startViewTransition(() => {
      flushSync(() => setPreviewRecipe(recipe))
    })
    void transition.finished.finally(() => {
      delete document.documentElement.dataset.recipeTransition
    })
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
      const remainingCalories = Math.max(
        0,
        recipe.calories - recipe.protein * 4
      )
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
        prepMinutes: noCook
          ? recipe.time
          : Math.max(5, Math.round(recipe.time * 0.35)),
        cookMinutes: noCook ? 0 : Math.max(1, Math.round(recipe.time * 0.65)),
        category: recipe.category,
        originCountry: recipe.origin,
        notes: recipe.notes,
        placeholderImage: "starter-kitchen",
        tags: recipe.tags,
        steps: recipe.steps,
        photoUploadIds: [],
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
      toast.error(
        error instanceof Error ? error.message : "Could not save recipe"
      )
    } finally {
      setSavingPreviewRecipe(false)
    }
  }

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const foodEvents = foodEntries.map((entry) => ({
      id: `food-${entry.id}`,
      title: entry.name,
      detail: `${Math.round(entry.calories)} ${energyUnit} logged`,
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
  }, [
    foodEntries,
    selectedDate,
    supplementEntries,
    waterEntries,
    workoutLogs,
    energyUnit,
  ])

  function addQuickWater() {
    hapticMedium()
    quickWaterBurst.replay()
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
      // slice, not replace: an entry id could itself start with "food-".
      const id = event.id.slice("food-".length)
      const removed = foodEntries.find((entry) => entry.id === id)
      // Targeted removal instead of rewriting the day from this client's
      // snapshot — a setDay here erases anything logged concurrently (coach,
      // MCP, another device) and can itself be undone by a racing write,
      // which read as "delete doesn't work".
      void removeFoodEntryById({ date: selectedDate, entryId: id })
      toast.success("Food entry removed", {
        action: {
          label: "Undo",
          onClick: () => {
            if (removed) {
              void addFoodEntry({ date: selectedDate, entry: removed })
            }
          },
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

  function renderDashboardWidget(widget: DashboardWidgetLayoutItem) {
    const compactClass = widget.size === "small" ? "md:max-w-xl" : undefined
    if (widget.id === "weekPlan") {
      // An empty shell is worse than absence — the widget only appears once
      // Coach has actually saved a plan for this week.
      if (!weeklyPlan) return null
      return (
        <div key={widget.id} className={compactClass}>
          <WeeklyPlanCard
            title={weeklyPlan.title}
            today={todayShortDay}
            days={weeklyPlan.days}
            assumptions={weeklyPlan.assumptions}
            onOpenPreset={(presetId) =>
              navigate(`/workout/active/${presetId}`, { motion: "forward" })
            }
            onOpenRecipe={(recipeId) =>
              navigate(`/foods/recipe/${recipeId}`, { motion: "forward" })
            }
            onAskCoach={() =>
              navigate("/coach", {
                motion: "forward",
                state: {
                  coachMode: "chat",
                  guidedIntent: {
                    kind: "plan_week",
                    title: "Adjust this week",
                    detail:
                      "Tell Coach what changed and it will rework the remaining days around it.",
                    examples: [
                      "I need to move Thursday's session",
                      "Make the back half lighter",
                      "Swap the dinners for something faster",
                    ],
                  },
                },
              })
            }
          />
        </div>
      )
    }
    if (widget.id === "progress") {
      if ((bodyMeasurements ?? []).length === 0) return null
      return (
        <div key={widget.id} className={compactClass}>
          <DashboardProgressPanels
            measurements={bodyMeasurements ?? []}
            metric={dashboardTrendMetric}
            onMetricChange={setDashboardTrendMetric}
            tdee={calorieInfo?.tdee ?? caloriesTarget}
            calorieTarget={caloriesTarget}
            weightUnit={weightUnit}
          />
        </div>
      )
    }
    return (
      <div key={widget.id} className={compactClass}>
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
      </div>
    )
  }

  // Only what the first screenful actually needs. Gating on every dashboard
  // query meant the slowest one held the whole screen blank — on a cold first
  // launch (fresh auth handshake, nothing cached) that read as a minute-long
  // hang. Everything else defaults to empty and fills in as it arrives.
  const homeBodyReady =
    preferences !== undefined &&
    effectiveGoals !== undefined &&
    foodLogs !== undefined &&
    supplementOverview !== undefined

  return (
    <div className="dashboard-home desktop-canvas relative min-h-svh overflow-hidden bg-background lg:pr-8 lg:pl-72">
      {/* Picks up where the curve leaves off: the page below the photograph
          carries a little of its warmth down through the first cards instead
          of starting as a flat slab. */}
      <span className="dashboard-home-wash" aria-hidden="true" />
      {quickWaterBurst.active && (
        <span
          key={quickWaterBurst.key}
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
      {/* Outside the reading column on purpose: the field answers to the
          window, not to the text measure. Its own header and ledger are put
          back onto the column's grid in CSS. */}
      <div className="relative z-10">
        <DashboardHero
          dateLabel={dateLabel}
          salutation={salutation}
          firstName={firstName}
          fill={
            caloriesTarget > 0
              ? Math.round((intakeTotals.calories / caloriesTarget) * 100)
              : 0
          }
          action={
            <div className="flex items-center gap-1">
              <DateNav
                offset={dayOffset}
                timeZone={activeTimezone}
                onChange={setDayOffset}
              />
              <TourAnchor anchor="today-log-meal">
                <button
                  type="button"
                  aria-label="Add food, water, workout, or supplement"
                  onClick={() => setHomeAddOpen(true)}
                  className="native-toolbar-button px-0"
                >
                  <Plus size={22} weight="bold" />
                </button>
              </TourAnchor>
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
        >
          {homeBodyReady && (
            <TourAnchor anchor="today-ledger" className="block">
              <DailyLedgerHero
                translucent
                caloriesLeft={caloriesLeft}
                caloriesTarget={caloriesTarget}
                macros={heroMacros}
                supplementCalories={supplementCalories}
              />
            </TourAnchor>
          )}
          {homeBodyReady && (
            <div className="mx-[var(--app-page-x)] mt-6 flex flex-col gap-6 md:mx-8 md:flex-row md:items-center md:gap-10">
              {/* Phone: the grid above the rings. Desktop: the hero is wide
                  enough for both, so the rings ride alongside instead of
                  pushing everything down a row. */}
              <ActivityGraph
                translucent
                cells={activityCells}
                weeks={ACTIVITY_WEEKS}
                sessions={trainingDaysLast28}
                windowDays={28}
              />
              <DashboardWeekRings
                className="md:min-w-0 md:flex-1"
                readiness={dashboardReadiness}
                story={dashboardWeeklyStory}
                health={
                  healthDashboard
                    ? {
                        score: healthDashboard.score ?? null,
                        band: healthDashboard.band ?? undefined,
                      }
                    : null
                }
                onOpenTraining={() => navigate("/coach", { motion: "forward" })}
                onOpenHealth={() => navigate("/health", { motion: "switch" })}
                onOpenProgress={() =>
                  navigate("/progress", { motion: "switch" })
                }
              />
            </div>
          )}
        </DashboardHero>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col pb-[calc(var(--app-safe-bottom-lg)+6.5rem)] md:max-w-6xl md:pb-10">
        {homeBodyReady ? (
          <div className="motion-content-in mt-4 flex min-w-0 flex-col">
            {/* One list, one direction. Repeats, saved recipes and water were
                three different shapes here — two of them scrolling sideways
                with their contents cut off at the screen edge. They are the
                same job, so they are the same row: what it is on the left,
                the button that logs it on the right. */}
            {(recentMealNames.length > 0 || recipes.length > 0) && (
              <section
                className="mx-[var(--app-page-x)] mb-4 md:mx-8"
                aria-label="Quick log"
              >
                <div className="flex items-center justify-between gap-3 pb-1">
                  <p className="app-section-title">Quick log</p>
                  {recipes.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate("/recipes", { motion: "forward" })
                      }
                      className="motion-tactile -mr-2 inline-flex min-h-11 items-center gap-1 px-2 text-[12px] font-semibold text-muted-foreground active:text-foreground"
                    >
                      All recipes
                      <CaretRight size={12} weight="bold" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="divide-y divide-border/60 border-y border-border/60">
                  {quickLogRows.map((row) => (
                    <button
                      key={`${row.kind}-${row.name}`}
                      type="button"
                      onClick={row.onLog}
                      aria-label={`Log ${row.name}`}
                      className="flex min-h-14 w-full items-center gap-3 px-1 text-left transition-colors active:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="native-row-title truncate">{row.name}</p>
                        <p className="native-row-detail mt-0.5 truncate">
                          {row.detail}
                        </p>
                      </div>
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted/60 text-foreground"
                      >
                        <Plus size={15} weight="bold" />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {showWelcomeNudge && (
              <div className="mx-[var(--app-page-x)] md:mx-8">
                <WelcomeNudge
                  scheduledWorkout={scheduledWorkout}
                  workoutLogged={workoutLogs.length > 0}
                  workoutsThisWeek={workoutsThisWeek}
                  daysLast28={trainingDaysLast28}
                  onDismiss={dismissWelcomeNudge}
                />
              </div>
            )}
            {unreadComments > 0 && !commentsDismissed && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                <button
                  type="button"
                  onClick={() => navigate("/shared")}
                  aria-label={`${unreadComments} new comment${
                    unreadComments === 1 ? "" : "s"
                  } on your diary. Open shared diaries`}
                  className="min-w-0 flex-1 text-left active:opacity-70"
                >
                  <span className="native-row-title block">
                    {unreadComments} new comment
                    {unreadComments === 1 ? "" : "s"} on your diary
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCommentsDismissed(true)}
                  aria-label="Dismiss diary comment notice"
                  className="native-toolbar-button h-9 w-9 px-0 text-muted-foreground"
                >
                  <X size={15} weight="bold" />
                </button>
              </div>
            )}
            <div className="mx-[var(--app-page-x)] md:mx-8">
              <WaterWidget dateKey={selectedDate} />
            </div>

            <TourAnchor
              anchor="today-workout"
              className="dashboard-workout-stage mx-[var(--app-page-x)] mt-4 block md:mx-8"
            >
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
            </TourAnchor>

            <div className="mx-[var(--app-page-x)] mt-3 grid gap-2 md:mx-8">
              <UnloggedWorkoutNudge />
            </div>

            {(trainingWeek.sessions > 0 || trainingWeek.sets > 0) && (
              <TrainingWeekCard
                sessions={trainingWeek.sessions}
                sets={trainingWeek.sets}
                records={dashboardWeeklyStory.records.length}
                days={trainingWeek.days}
                consistency={consistency}
                onOpen={() => navigate("/workouts", { motion: "switch" })}
              />
            )}

            <section
              className="dashboard-meals-stage mt-5"
              aria-label="Suggested meals"
            >
              <div className="mx-[var(--app-page-x)] mb-3 flex items-end justify-between gap-4 md:mx-8">
                <p className="app-section-title">Suggested meals</p>
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
                  className="min-h-11 shrink-0 text-[12px] font-semibold text-muted-foreground active:text-foreground"
                >
                  Ask Coach
                </button>
              </div>

              {suggestedMeals.length > 0 ? (
                <div className="app-scroll-strip flex snap-x snap-mandatory scroll-pl-[var(--app-page-x)] gap-2.5 overflow-x-auto overscroll-x-contain px-[var(--app-page-x)] pb-1 md:scroll-pl-8 md:px-8">
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
                          setRecipeRemix(null)
                          setRecipePreviewClosing(false)
                          openRecipePreview(recipe)
                        }
                      }}
                      className="flex h-[6.75rem] w-[16rem] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card text-left transition-transform active:scale-[0.985] md:h-32 md:w-[20rem]"
                    >
                      {meal.photoUrl ? (
                        <img
                          src={meal.photoUrl}
                          alt=""
                          className="h-full w-[40%] shrink-0 object-cover"
                          style={{ viewTransitionName: `recipe-${meal.id}` }}
                        />
                      ) : (
                        <span className="flex h-full w-[40%] shrink-0 items-center justify-center bg-[var(--accent-food-bg)] text-[var(--accent-food)]">
                          <ForkKnife size={30} weight="bold" />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col p-3 md:p-3.5">
                        <span className="line-clamp-2 shrink-0 text-[14px] leading-tight font-bold tracking-tight md:text-[15px]">
                          {meal.name}
                        </span>
                        <span className="mt-auto flex shrink-0 items-center gap-1.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={11} /> {meal.prepMinutes} min
                          </span>
                          <span>·</span>
                          <span>
                            {meal.calories} {energyUnit}
                          </span>
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
                    <span className="text-[13px] font-semibold">
                      Ask Coach for a meal idea
                    </span>
                  </button>
                </div>
              )}

              {/* This row is the only way into the recipe library from here,
                  and it used to be a grey line of text under a wall of
                  photographs. It is a destination, so it looks like one. */}
              <div className="mx-[var(--app-page-x)] mt-3 md:mx-8">
                <button
                  type="button"
                  onClick={() => {
                    hapticSelection()
                    navigate("/recipes", { motion: "forward" })
                  }}
                  className="motion-tactile flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-3.5 text-left transition-colors active:bg-muted/40"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-food-bg)] text-[var(--accent-food)]">
                    <ForkKnife size={17} weight="bold" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold tracking-tight">
                      All recipes
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      Yours, saved, and suggested
                    </span>
                  </span>
                  <CaretRight
                    size={15}
                    weight="bold"
                    className="shrink-0 text-muted-foreground"
                  />
                </button>
              </div>
            </section>

            {isTodaySelected && !settings.simpleMode && (
              <section
                className="dashboard-widgets-stage mt-5"
                aria-label="Custom dashboard widgets"
              >
                <CoachDashboardWidgets
                  widgets={(coachDashboardWidgets ?? []).map((widget) => ({
                    ...widget,
                    _id: String(widget._id),
                  }))}
                  onRemove={(widgetId) => {
                    hapticSelection()
                    void setCoachDashboardWidgetPinned({
                      widgetId: widgetId as Id<"dashboardWidgets">,
                      pinned: false,
                    })
                  }}
                  onSetValue={(metricId, value) => {
                    hapticSelection()
                    void setCustomProgressMetricValue({
                      metricId: metricId as Id<"customProgressMetrics">,
                      date: selectedDate,
                      value,
                    })
                  }}
                  className="mb-2"
                />
                {[...dashboardWidgetLayout]
                  .sort(
                    (a, b) =>
                      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
                  )
                  .filter((widget) => !widget.hidden)
                  .map(renderDashboardWidget)}
                <div className="mx-[var(--app-page-x)] mt-2 md:mx-8">
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      setDashboardCustomizeOpen(true)
                    }}
                    className="app-translucent motion-tactile mx-auto flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[12px] font-semibold transition-colors"
                  >
                    <SlidersHorizontal size={15} weight="bold" />
                    Customize dashboard
                  </button>
                </div>
              </section>
            )}

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
          </div>
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

      {dashboardCustomizeOpen && (
        <MobileSheet
          ariaLabel="Customize dashboard"
          onClose={() => setDashboardCustomizeOpen(false)}
          overlayClassName="bg-black/45"
          panelClassName="mx-auto w-full max-w-md"
        >
          {/* Three bordered text buttons per row read as a form to fill in.
              Each section is one line now: what it is, where it sits, and the
              controls as icons that show their own state. */}
          <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="flex items-start justify-between gap-4 pb-1">
              <div className="min-w-0">
                <h2 className="text-[19px] font-bold tracking-tight">
                  Customize dashboard
                </h2>
                <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  Reorder, resize, hide, or pin the sections below the hero.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDashboardCustomizeOpen(false)}
                aria-label="Close dashboard customization"
                className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted active:text-foreground"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="mt-4 flex flex-col divide-y divide-border/60 border-y border-border/60">
              {dashboardWidgetLayout.map((widget, index) => {
                const label = DASHBOARD_WIDGET_LABELS[widget.id]
                const patch = (
                  next: Partial<DashboardWidgetLayoutItem>,
                  exclusive = false
                ) =>
                  updateDashboardLayout(
                    dashboardWidgetLayout.map((item) =>
                      item.id === widget.id
                        ? { ...item, ...next }
                        : exclusive
                          ? { ...item, pinned: false }
                          : item
                    )
                  )
                const move = (delta: number) => {
                  const next = [...dashboardWidgetLayout]
                  const target = index + delta
                  ;[next[index], next[target]] = [next[target], next[index]]
                  updateDashboardLayout(next)
                }

                return (
                  <div
                    key={widget.id}
                    className="flex min-h-16 items-center gap-2 py-2"
                  >
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`Move ${label} up`}
                        onClick={() => move(-1)}
                        className="flex h-6 w-8 items-center justify-center rounded-md text-muted-foreground active:bg-muted active:text-foreground disabled:opacity-20"
                      >
                        <CaretDown
                          size={13}
                          weight="bold"
                          className="rotate-180"
                        />
                      </button>
                      <button
                        type="button"
                        disabled={index === dashboardWidgetLayout.length - 1}
                        aria-label={`Move ${label} down`}
                        onClick={() => move(1)}
                        className="flex h-6 w-8 items-center justify-center rounded-md text-muted-foreground active:bg-muted active:text-foreground disabled:opacity-20"
                      >
                        <CaretDown size={13} weight="bold" />
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-[15px] font-semibold",
                          widget.hidden && "text-muted-foreground"
                        )}
                      >
                        {label}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                        {widget.hidden
                          ? "Hidden"
                          : widget.size === "small"
                            ? "Compact"
                            : "Full width"}
                        {widget.pinned && !widget.hidden ? " · Pinned" : ""}
                      </p>
                    </div>

                    <button
                      type="button"
                      aria-label={`${widget.size === "full" ? "Make" : "Undo"} ${label} compact`}
                      aria-pressed={widget.size === "small"}
                      onClick={() =>
                        patch({
                          size: widget.size === "full" ? "small" : "full",
                        })
                      }
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted",
                        widget.size === "small" && "bg-muted text-foreground"
                      )}
                    >
                      <ArrowsInLineVertical size={17} weight="bold" />
                    </button>
                    <button
                      type="button"
                      aria-label={`${widget.pinned ? "Unpin" : "Pin"} ${label}`}
                      aria-pressed={Boolean(widget.pinned)}
                      onClick={() => patch({ pinned: !widget.pinned }, true)}
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted",
                        widget.pinned && "bg-muted text-foreground"
                      )}
                    >
                      <PushPin
                        size={17}
                        weight={widget.pinned ? "fill" : "bold"}
                      />
                    </button>
                    <button
                      type="button"
                      aria-label={`${widget.hidden ? "Show" : "Hide"} ${label}`}
                      aria-pressed={Boolean(widget.hidden)}
                      onClick={() => patch({ hidden: !widget.hidden })}
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted",
                        widget.hidden && "bg-muted text-foreground"
                      )}
                    >
                      {widget.hidden ? (
                        <EyeSlash size={17} weight="bold" />
                      ) : (
                        <Eye size={17} weight="bold" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </MobileSheet>
      )}

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
                style={{
                  viewTransitionName: `recipe-${previewRecipe.id}`,
                }}
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
                  <p className="text-[15px] font-semibold">
                    {previewRecipe.time}m
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Total time
                  </p>
                </div>
                <div>
                  <p className="text-[15px] font-semibold">
                    {previewRecipe.calories}
                  </p>
                  <p className="text-[13px] text-muted-foreground">Calories</p>
                </div>
                <div>
                  <p className="text-[15px] font-semibold">
                    {previewRecipe.protein}g
                  </p>
                  <p className="text-[13px] text-muted-foreground">Protein</p>
                </div>
              </div>
              <div className="mt-5">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Preview a remix
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    {
                      label: "Higher protein",
                      calories: previewRecipe.calories + 70,
                      protein: previewRecipe.protein + 18,
                      request:
                        "Increase protein by at least 15g without making the recipe much larger.",
                    },
                    {
                      label: "Lighter",
                      calories: Math.max(200, previewRecipe.calories - 120),
                      protein: previewRecipe.protein,
                      request:
                        "Reduce calories by about 120 while preserving protein and the character of the recipe.",
                    },
                    {
                      label: "Vegetarian",
                      calories: previewRecipe.calories - 30,
                      protein: Math.max(15, previewRecipe.protein - 5),
                      request:
                        "Make this vegetarian with a satisfying protein replacement.",
                    },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => {
                        hapticSelection()
                        setRecipeRemix(option)
                      }}
                      className={cn(
                        "motion-tactile min-h-10 rounded-full border px-3 text-[10px] font-semibold",
                        recipeRemix?.label === option.label
                          ? "border-foreground bg-foreground text-background"
                          : "border-border"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {recipeRemix && (
                  <div className="motion-pop mt-3 grid grid-cols-2 divide-x divide-border rounded-xl bg-muted/55 py-3 text-center">
                    <div>
                      <p className="text-[9px] font-semibold text-muted-foreground">
                        Current
                      </p>
                      <p className="mt-1 text-[12px] font-bold">
                        {previewRecipe.calories} {energyUnit} ·{" "}
                        {previewRecipe.protein}g
                        P
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-muted-foreground">
                        Estimated remix
                      </p>
                      <p className="mt-1 text-[12px] font-bold">
                        {recipeRemix.calories} {energyUnit} ·{" "}
                        {recipeRemix.protein}g P
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-6">
                <h3 className="text-[13px] font-semibold">Ingredients</h3>
                <ul className="mt-2 divide-y divide-border/60 border-y border-border/60">
                  {previewRecipe.ingredients.map((ingredient) => (
                    <li
                      key={ingredient}
                      className="py-2.5 text-[13px] text-foreground/75"
                    >
                      {ingredient}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-7">
                <h3 className="text-[13px] font-semibold">Instructions</h3>
                <ol className="mt-3 space-y-4">
                  {previewRecipe.steps.map((step, index) => (
                    <li
                      key={step}
                      className="flex gap-3 text-[13px] leading-5 text-foreground/75"
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="mt-6 rounded-2xl bg-muted/55 p-4">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Serving & storage
                </p>
                <p className="mt-1 text-[12px] leading-5 text-foreground/70">
                  {previewRecipe.notes}
                </p>
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
                  previewRecipeSaved
                    ? { backgroundColor: COMPLETE_COLOR }
                    : undefined
                }
              >
                <span
                  key={
                    previewRecipeSaved
                      ? "saved"
                      : savingPreviewRecipe
                        ? "saving"
                        : "save"
                  }
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
                      initialInput: recipeRemix?.request,
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
                    if (!requireAiAccess(1, "describe_meal")) return
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
                              {totals.calories} {energyUnit} ·{" "}
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
          role="dialog"
          aria-modal="true"
          aria-label="Delete workout"
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
                    }).catch(() => toast.error("Could not delete workout"))
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
