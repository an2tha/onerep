import { useMemo, useState, type CSSProperties } from "react"
import { useMutation, useQuery } from "convex/react"
import {
  Barbell,
  CookingPot,
  ForkKnife,
  GearSix,
  MagnifyingGlass,
  PintGlass,
  Pill,
  Timer,
} from "@phosphor-icons/react"

import { api } from "../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"
import { currentDateKey, mealLabel, type FoodLogEntry } from "@/lib/food-log"
import { QuickAddFab, type QuickAddOption } from "@/dashboard/quick-add-fab"
import {
  ScheduleEntrySheet,
  type ScheduleEntryRequest,
} from "@/dashboard/schedule-entry-sheet"
import { DayRail } from "@/dashboard/day-rail"
import { WeekStrip } from "@/dashboard/week-strip"
import { useNutritionHealthWriteBack } from "@/lib/nutrition-writeback"
import {
  QuickActionDrawer,
  type QuickActionId,
} from "@/dashboard/quick-action-drawers"
import { DashboardHero } from "@repo/ui"
import {
  dateKeyToCalendarDate,
  daysAgoLabel,
  greeting,
  hourInTimeZone,
} from "@/dashboard/helpers"
import { DayTimeline, type TimelineEntry } from "@/dashboard/timeline"
import { DashboardDials } from "@/dashboard/dials"

import LegacyApp from "./App.legacy"

// ─── The old dashboard ────────────────────────────────────────────────────────
//
// Everything that used to be here is still here, verbatim, one file over in
// `App.legacy.tsx`. Flip this to `true` and the old home page comes back
// exactly as it was; flip it back and you are on the bare canvas again. The
// redesign happens below the hero, in the empty space where the cards were.

const USE_LEGACY_DASHBOARD = false

export default function App() {
  if (USE_LEGACY_DASHBOARD) return <LegacyApp />
  return <Dashboard />
}

function Dashboard() {
  const navigate = useSmoothNavigate()
  const { user } = useAppAuth()
  const preferences = useQuery(api.users.users.getPreferences, {})
  const activeTimezone = preferences?.lastActiveTimezone || "UTC"
  const todayKey = useMemo(
    () => currentDateKey(activeTimezone),
    [activeTimezone]
  )
  // Which day the wheel is showing. Null is today — held separately rather
  // than defaulting the state to a date string, so that a session left open
  // past midnight rolls over with the clock instead of pinning yesterday.
  const [viewedDateKey, setViewedDateKey] = useState<string | null>(null)
  const dateKey = viewedDateKey ?? todayKey
  const viewingToday = dateKey === todayKey

  // Today's ledger, straight from the logs. Each source knows its own
  // shape; buildTimelineEntries flattens them into wheel rows.
  const foodEntries = useQuery(api.logs.foodLogs.getDay, { date: dateKey })
  const waterEntries = useQuery(api.logs.water.getDay, { date: dateKey })
  const supplementEntries = useQuery(api.logs.supplements.getDay, {
    date: dateKey,
  })
  const workoutLogs = useQuery(api.logs.workouts.getLog, { date: dateKey })

  // The rails around the wheel: health signals for the night shading,
  // history for the week strip, and today's standing for the day rail.
  const healthDashboard = useQuery(api.logs.healthMetrics.dashboard, {
    today: dateKey,
  })
  const workoutHistory = useQuery(api.logs.workouts.getHistory, {})
  const recentFoodDays = useQuery(api.logs.foodLogs.getRecent, { limit: 30 })
  const goals = useQuery(api.users.users.getEffectiveGoals, {
    date: dateKey,
  })
  const supplementOverview = useQuery(api.logs.supplements.getOverview, {
    date: dateKey,
  })

  const timelineEntries = useMemo(
    () =>
      buildTimelineEntries({
        food: foodEntries,
        water: waterEntries,
        supplements: supplementEntries,
        workouts: workoutLogs,
      }),
    [foodEntries, waterEntries, supplementEntries, workoutLogs]
  )
  const [timelineOverrides, setTimelineOverrides] = useState<
    Record<string, string>
  >({})

  // The night window: their average nightly sleep from the health store,
  // centred on the middle of the night. No data, no shading — a guessed
  // bedtime would be worse than none.
  const sleepWindow = useMemo(() => {
    const values = (healthDashboard?.days ?? [])
      .map((day) => day.sleepMinutes)
      .filter((v): v is number => typeof v === "number" && v > 0)
    if (values.length === 0) return null
    const averageMinutes = values.reduce((sum, v) => sum + v, 0) / values.length
    const halfWindow = Math.min(6 * 60, Math.max(4 * 60, averageMinutes / 2))
    const center = 3 * 60 // ~3am, the middle of the night
    return {
      start: (((center - halfWindow) % 1440) + 1440) % 1440,
      end: Math.min(center + halfWindow, 12 * 60),
    }
  }, [healthDashboard])

  // Adherence sets for the week bar — raw dates, since the bar itself
  // navigates across weeks.
  const workoutDateSet = useMemo<Set<string>>(
    () => new Set((workoutHistory ?? []).map((log) => log.date)),
    [workoutHistory]
  )
  const foodDateSet = useMemo<Set<string>>(
    () =>
      new Set(
        (recentFoodDays ?? [])
          .filter((day) => day.entries.length > 0)
          .map((d) => d.date)
      ),
    [recentFoodDays]
  )

  // What's been eaten so far, for the rail's ledger — and pushed out to
  // the health store (opt-in) whenever the day changes.
  const dayTotals = useMemo(
    () =>
      (foodEntries ?? []).reduce(
        (acc, entry) => ({
          calories: acc.calories + entry.calories,
          protein: acc.protein + entry.protein,
          carbs: acc.carbs + entry.carbs,
          fat: acc.fat + entry.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [foodEntries]
  )
  // Today only. The push is keyed on the day's totals and Health Connect
  // merges records by summing, so browsing back through the week would
  // re-push every day it landed on and double it in the store.
  useNutritionHealthWriteBack(
    todayKey,
    viewingToday ? foodEntries : undefined,
    viewingToday
      ? (waterEntries ?? []).reduce((sum, entry) => sum + entry.amountMl, 0)
      : 0
  )

  // Which of the plan's supplements are taken today, as supplement id →
  // intake-log id, so the rail's checkboxes can untake as well as take.
  const takenSupplementLogs = useMemo(() => {
    const bySupplement = new Map<string, string>()
    for (const log of supplementOverview?.logs ?? []) {
      if (log.status === "taken" && log.supplementId) {
        bySupplement.set(log.supplementId, log._id)
      }
    }
    return bySupplement
  }, [supplementOverview])

  const now = useMemo(() => new Date(), [])
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.email ?? "there"

  // Row actions on the wheel. Deletes go straight at the owning log's own
  // mutation; edits hand off to the page that owns the kind, because every
  // one of those pages already has the real editing UI; adds open the
  // matching drawer.
  const removeFoodEntry = useMutation(api.logs.foodLogs.removeEntry)
  const removeWaterEntry = useMutation(api.logs.water.removeEntry)
  const removeSupplementEntry = useMutation(api.logs.supplements.removeEntry)
  const removeWorkoutLog = useMutation(api.logs.workouts.remove)

  const handleDeleteTimelineEntry = (entry: TimelineEntry) => {
    const separator = entry.id.indexOf(":")
    if (separator === -1) return
    const kind = entry.id.slice(0, separator)
    const id = entry.id.slice(separator + 1)
    if (kind === "food") {
      void removeFoodEntry({ date: dateKey, entryId: id })
    } else if (kind === "water") {
      void removeWaterEntry({ date: dateKey, id })
    } else if (kind === "supplement") {
      void removeSupplementEntry({ date: dateKey, id })
    } else if (kind === "workout" && id !== "unknown") {
      void removeWorkoutLog({
        id: id as Parameters<typeof removeWorkoutLog>[0]["id"],
      })
    }
  }

  const TIMELINE_EDIT_ROUTES: Record<TimelineEntry["kind"], string> = {
    food: "/nutrition",
    water: "/water",
    supplement: "/supplements",
    workout: "/workouts",
  }

  const TIMELINE_ADD_ACTIONS: Record<TimelineEntry["kind"], QuickActionId> = {
    food: "food",
    water: "water",
    supplement: "supplements",
    workout: "workout",
  }
  // The fan opens drawers, not pages: the common interaction happens in the
  // drawer itself, and the full page stays one row away inside it.
  // The fan opens drawers, not pages: the common interaction happens in the
  // drawer itself, and the full page stays one row away inside it. The
  // drawer carries its own date — today from the fan, or a past day when
  // retro-logging from the week bar.
  const [quickAction, setQuickAction] = useState<{
    id: QuickActionId
    dateKey: string
  } | null>(null)
  const openQuickAction = (id: QuickActionId, forDateKey = dateKey) =>
    setQuickAction({ id, dateKey: forDateKey })
  const [editFoodEntry, setEditFoodEntry] = useState<FoodLogEntry | null>(null)
  const [scheduleRequest, setScheduleRequest] =
    useState<ScheduleEntryRequest | null>(null)
  const salutation = greeting(hourInTimeZone(now, activeTimezone))
  const dateLabel = dateKeyToCalendarDate(dateKey).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  // The tab bar is fixed and the home column is a fixed-height flex, so
  // without the bottom padding the week strip lives underneath it. Reserve the
  // bar's own height plus the home indicator; the desk has no bar to clear.
  return (
    <div className="dashboard-home desktop-canvas relative flex h-svh flex-col overflow-hidden bg-background pb-[calc(env(safe-area-inset-bottom,0px)+4.25rem)] lg:pr-8 lg:pb-0 lg:pl-72">
      <span className="dashboard-home-wash" aria-hidden="true" />
      <div
        className="relative z-10 shrink-0"
        style={{ "--app-hero-min-h": "0rem" } as CSSProperties}
      >
        <DashboardHero
          dateLabel={dateLabel}
          salutation={salutation}
          firstName={firstName}
          // A finished day names itself. The greeting is about now, and now
          // is not what is on screen.
          title={viewingToday ? undefined : dateLabel}
          subtitle={viewingToday ? undefined : daysAgoLabel(dateKey, todayKey)}
          // The sidebar's profile row is a desktop thing; on a phone, and in
          // the native shells especially, this is the only door into settings.
          profile={
            <button
              type="button"
              onClick={() => navigate("/settings", { motion: "forward" })}
              aria-label="Open profile and settings"
              className="-mr-1 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground active:bg-muted/60 active:text-foreground lg:hidden"
            >
              <GearSix size={22} />
            </button>
          }
          action={
            <DashboardDials
              nutritionPercent={62}
              recoveryScore={78}
              // No confirmation step and no picker: the hold *is* the
              // confirmation, so it drops straight into an empty session.
              onStartWorkout={() =>
                navigate("/workout/active", { motion: "forward" })
              }
              onOpenNutrition={() =>
                navigate("/nutrition", { motion: "switch" })
              }
              onOpenRecovery={() => navigate("/health", { motion: "switch" })}
            />
          }
        />
      </div>
      {/* The day rail sits right under the dials: where the day already
          stands, before you scroll into anything. On the phone it's a strip
          of cards that pans sideways; on the desk it spreads into columns. */}
      <div className="relative z-10 shrink-0 px-4 pt-1 lg:px-10">
        <DayRail
          dateKey={dateKey}
          isToday={viewingToday}
          calories={dayTotals.calories}
          protein={dayTotals.protein}
          carbs={dayTotals.carbs}
          fat={dayTotals.fat}
          calorieGoal={goals?.calories}
          proteinGoal={goals?.protein}
          carbsGoal={goals?.carbs}
          fatGoal={goals?.fat}
          waterTotalMl={(waterEntries ?? []).reduce(
            (sum, entry) => sum + entry.amountMl,
            0
          )}
          waterGoalMl={preferences?.waterGoalMl ?? 2500}
          supplements={(supplementOverview?.items ?? [])
            .filter((item) => item.active)
            .map((item) => ({
              id: item._id,
              name: item.name,
              logId: takenSupplementLogs.get(item._id),
            }))}
        />
      </div>
      {/* The wheel owns the rest of the screen, centered. The ruler inside it
          is taller than the screen on purpose — scrolling it pans through the
          hours in place, rather than carrying the hero off screen. */}
      <div className="relative z-10 flex min-h-0 flex-1 justify-center">
        <div className="flex min-h-0 w-full max-w-sm flex-col">
          <div className="min-h-0 flex-1">
            <DayTimeline
              // Keyed on the day so switching days re-parks the wheel
              // instead of holding the hour the last day was left on.
              key={dateKey}
              isToday={viewingToday}
              loading={
                foodEntries === undefined ||
                waterEntries === undefined ||
                supplementEntries === undefined ||
                workoutLogs === undefined
              }
              entries={timelineEntries.map((entry) => ({
                ...entry,
                time: timelineOverrides[entry.id] ?? entry.time,
              }))}
              onEntryTimeChange={(id, time) =>
                setTimelineOverrides((prev) => ({ ...prev, [id]: time }))
              }
              sleepWindow={sleepWindow}
              onEditEntry={(entry) => {
                const separator = entry.id.indexOf(":")
                if (separator === -1) return
                const kind = entry.id.slice(0, separator)
                const id = entry.id.slice(separator + 1)
                if (kind === "food") {
                  setEditFoodEntry(
                    (foodEntries ?? []).find((food) => food.id === id) ?? null
                  )
                  openQuickAction("food", dateKey)
                } else {
                  navigate(
                    TIMELINE_EDIT_ROUTES[kind as TimelineEntry["kind"]],
                    { motion: "switch" }
                  )
                }
              }}
              onDeleteEntry={handleDeleteTimelineEntry}
              onAddEntry={(kind) => openQuickAction(TIMELINE_ADD_ACTIONS[kind])}
              // The anchor-edge buttons ask before they act: the sheet lets
              // the user pick workout or food, then either opens that
              // drawer (the + , for a minute already gone) or sets a
              // one-shot reminder (the clock, for a minute still ahead).
              onQuickLog={(phase, minutes) =>
                setScheduleRequest({ phase, minutes })
              }
            />
          </div>
          <WeekStrip
            todayKey={todayKey}
            selectedKey={dateKey}
            onSelectDay={(day) =>
              setViewedDateKey(day === todayKey ? null : day)
            }
            workoutDates={workoutDateSet}
            foodDates={foodDateSet}
            className="mt-1 shrink-0 pb-3"
          />
        </div>
      </div>
      <QuickAddFab
        options={QUICK_ADD_OPTIONS}
        onChoose={(action) => openQuickAction(action)}
      />
      <QuickActionDrawer
        id={quickAction?.id ?? null}
        dateKey={quickAction?.dateKey ?? dateKey}
        editEntry={editFoodEntry ?? null}
        onClose={() => {
          setQuickAction(null)
          setEditFoodEntry(null)
        }}
      />
      <ScheduleEntrySheet
        request={scheduleRequest}
        onLog={(kind) => openQuickAction(kind, dateKey)}
        onClose={() => setScheduleRequest(null)}
      />
    </div>
  )
}

// The fan of things the round black button can start. Same corner, same
// bubble as the active workout page — each one opens its own drawer instead
// of a page, so logging never costs a navigation.
const QUICK_ADD_OPTIONS: QuickAddOption[] = [
  { action: "workout", label: "Log a workout", icon: Barbell },
  { action: "food", label: "Log Food", icon: ForkKnife },
  { action: "recipe-create", label: "Create a recipe", icon: CookingPot },
  { action: "recipes", label: "Find Recipes", icon: MagnifyingGlass },
  { action: "water", label: "Log water", icon: PintGlass },
  { action: "fasting", label: "Start a fast", icon: Timer },
  { action: "supplements", label: "Take supplements", icon: Pill },
]

// ─── Today, from the logs ──────────────────────────────────────────────────

// Structural views of what the log queries return — just the fields the
// wheel needs, so this file doesn't have to import table internals.
type TimelineFoodEntry = {
  id: string
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  meal: string
  loggedAt: string // ISO datetime
  servingLabel?: string
}

type TimelineWaterEntry = { id: string; amountMl: number; loggedAt: string }

type TimelineSupplementEntry = {
  id: string
  kind: "creatine" | "protein" | "vitamins" | "caffeine"
  name?: string
  note?: string
  amount: number
  unit: string
  loggedAt: string
}

type TimelineWorkoutLog = {
  /** The stored log's id — the only way a delete can target the doc. */
  _id?: string
  exercises: Array<{ name: string; sets: unknown[] }>
  durationSeconds: number
  completedAt?: number
}

const SUPPLEMENT_KIND_LABELS: Record<TimelineSupplementEntry["kind"], string> =
  {
    creatine: "Creatine",
    protein: "Protein",
    vitamins: "Vitamins",
    caffeine: "Caffeine",
  }

function formatLoggedTime(value: string | number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function round(n: number): number {
  return Math.round(n)
}

function buildTimelineEntries({
  food,
  water,
  supplements,
  workouts,
}: {
  food?: TimelineFoodEntry[]
  water?: TimelineWaterEntry[]
  supplements?: TimelineSupplementEntry[]
  workouts?: TimelineWorkoutLog[]
}): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const entry of food ?? []) {
    entries.push({
      id: `food:${entry.id}`,
      time: formatLoggedTime(entry.loggedAt),
      title: entry.name,
      detail: `${mealLabel(entry.meal as Parameters<typeof mealLabel>[0])} · ${round(entry.calories)} cal`,
      kind: "food",
      facts: [
        { label: "Calories", value: `${round(entry.calories)} kcal` },
        { label: "Protein", value: `${round(entry.protein)} g` },
        { label: "Carbs", value: `${round(entry.carbs)} g` },
        { label: "Fat", value: `${round(entry.fat)} g` },
        ...(entry.servingLabel
          ? [{ label: "Serving", value: entry.servingLabel }]
          : []),
      ],
    })
  }

  for (const entry of water ?? []) {
    const liters = entry.amountMl >= 1000
    entries.push({
      id: `water:${entry.id}`,
      time: formatLoggedTime(entry.loggedAt),
      title: "Water",
      detail: liters
        ? `${(entry.amountMl / 1000).toFixed(1).replace(/\.0$/, "")} L`
        : `${entry.amountMl} ml`,
      kind: "water",
      facts: [{ label: "Amount", value: `${entry.amountMl} ml` }],
    })
  }

  for (const entry of supplements ?? []) {
    entries.push({
      id: `supplement:${entry.id}`,
      time: formatLoggedTime(entry.loggedAt),
      title:
        entry.name ??
        entry.note ??
        SUPPLEMENT_KIND_LABELS[entry.kind] ??
        "Supplement",
      detail: `${round(entry.amount)} ${entry.unit}`,
      kind: "supplement",
      facts: [
        { label: "Dose", value: `${round(entry.amount)} ${entry.unit}` },
        ...(entry.note ? [{ label: "Note", value: entry.note }] : []),
      ],
    })
  }

  for (const log of workouts ?? []) {
    const minutes = Math.max(1, Math.round(log.durationSeconds / 60))
    const totalSets = log.exercises.reduce(
      (sum, exercise) => sum + exercise.sets.length,
      0
    )
    entries.push({
      id: `workout:${log._id ?? log.completedAt ?? "unknown"}`,
      time: log.completedAt ? formatLoggedTime(log.completedAt) : "—",
      title: log.exercises[0]?.name
        ? `${log.exercises[0].name}${log.exercises.length > 1 ? ` +${log.exercises.length - 1}` : ""}`
        : "Workout",
      detail: `${log.exercises.length} exercise${log.exercises.length === 1 ? "" : "s"} · ${minutes} min`,
      kind: "workout",
      facts: [
        { label: "Duration", value: `${minutes} min` },
        {
          label: "Exercises",
          value: String(log.exercises.length),
        },
        { label: "Sets", value: String(totalSets) },
      ],
    })
  }

  return entries
}
