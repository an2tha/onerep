import { HomeProgrammes } from "@/components/home-programmes"
import { RestartNudge } from "@/components/restart/restart-nudge"
import { Message, tr, uiLocale } from "@repo/ui/i18n"
import { ProfileAvatar } from "@/components/profile-avatar"
import { RecoveryBanner } from "@/components/recovery/recovery-banner"
import { useRecovery } from "@/lib/use-recovery"
import { useMemo, useState, type CSSProperties } from "react"
import { useMutation, useQuery } from "convex/react"
import {
  ChatCircleDots,
  Plus,
} from "@phosphor-icons/react"

import { api } from "../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"
import { mealLabel, type FoodLogEntry } from "@/lib/food-log"
import { RepeatChips } from "@/dashboard/repeat-chips"
import { VoiceLogButton } from "@/dashboard/voice-log-button"
import {
  ScheduleEntrySheet,
  type ScheduleEntryRequest,
} from "@/dashboard/schedule-entry-sheet"
import { DayRail } from "@/dashboard/day-rail"
import { MobileDateSelector, WeekStrip } from "@/dashboard/week-strip"
import { useNutritionHealthWriteBack } from "@/lib/nutrition-writeback"
import {
  QuickActionDrawer,
  type QuickActionId,
} from "@/dashboard/quick-action-drawers"
import { DashboardHero, toast } from "@repo/ui"
import {
  dateKeyToCalendarDate,
  daysAgoLabel,
  greeting,
  hourInTimeZone,
} from "@/dashboard/helpers"
import { DayTimeline, type TimelineEntry } from "@/dashboard/timeline"
import { EntrySheet, type EntrySelection } from "@/dashboard/entry-sheet"
import { useDiaryClock, diaryTime, diaryTimestamp } from "@/lib/diary-clock"
import { DashboardDials } from "@/dashboard/dials"
import { ReactiveOrbField } from "@/components/reactive-orb-field"
import { announceOrbActivity } from "@/lib/orb-activity"
import { useWaterUnit } from "@/lib/use-water-unit"
import { formatWater, type WaterUnit } from "@/lib/measurement-system"

import LegacyApp from "./App.legacy"

// ─── The old dashboard ────────────────────────────────────────────────────────
//
// Everything that used to be here is still here, verbatim, one file over in
// `App.legacy.tsx`. The "Simple dashboard" toggle in Settings controls
// dashboardSettings.simpleMode — when true, the legacy dashboard is shown.

export default function App() {
  const preferences = useQuery(api.users.users.getPreferences, {})
  const useLegacy = preferences?.dashboardSettings?.simpleMode ?? false
  if (useLegacy) return <LegacyApp />
  return <Dashboard />
}

function Dashboard() {
  const recovery = useRecovery()
  const navigate = useSmoothNavigate()
  const { user } = useAppAuth()
  const preferences = useQuery(api.users.users.getPreferences, {})
  const waterUnit = useWaterUnit()
  const activeTimezone = preferences?.lastActiveTimezone || "UTC"
  const { todayKey, now, nowMinutes } = useDiaryClock(activeTimezone)
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
  const nutritionPlan = useQuery(api.users.users.getNutritionPlan, {
    date: dateKey,
  })
  const supplementOverview = useQuery(api.logs.supplements.getOverview, {
    date: dateKey,
  })

  const showNutritionMetric =
    (nutritionPlan?.visibleMetrics.calories ||
      preferences?.showCalorieNumbers === true) &&
    !recovery?.active?.simpleFood
  const timelineEntries = useMemo(
    () =>
      buildTimelineEntries({
        food: foodEntries,
        water: waterEntries,
        supplements: supplementEntries,
        workouts: workoutLogs,
        waterUnit,
        timeZone: activeTimezone,
        showFoodNumbers: showNutritionMetric,
      }),
    [
      foodEntries,
      waterEntries,
      supplementEntries,
      waterUnit,
      workoutLogs,
      activeTimezone,
      showNutritionMetric,
    ]
  )
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
        {
          calories: supplementOverview?.nutritionTotals.calories ?? 0,
          protein: supplementOverview?.nutritionTotals.protein ?? 0,
          carbs: supplementOverview?.nutritionTotals.carbs ?? 0,
          fat: supplementOverview?.nutritionTotals.fat ?? 0,
        }
      ),
    [foodEntries, supplementOverview]
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

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.email ?? "there"

  // Capture the entry and diary context before opening its correction sheet.
  const removeFoodEntry = useMutation(api.logs.foodLogs.removeEntry)
  const removeWaterEntry = useMutation(api.logs.water.removeEntry)
  const removeSupplementEntry = useMutation(api.logs.supplements.removeEntry)
  const removeWorkoutLog = useMutation(api.logs.workouts.remove)

  const updateFoodTime = useMutation(api.logs.foodLogs.updateTime)
  const updateWater = useMutation(api.logs.water.updateEntry)
  const updateSupplement = useMutation(api.logs.supplements.updateEntry)
  const updateWorkoutTime = useMutation(api.logs.workouts.updateTime)
  const [selection, setSelection] = useState<EntrySelection | null>(null)
  const selectEntry = (entry: TimelineEntry, deleting = false) => {
    const id = entry.id.slice(entry.id.indexOf(":") + 1)
    const water = waterEntries?.find((row) => row.id === id)
    const supplement = supplementEntries?.find((row) => row.id === id)
    const workout = workoutLogs?.find((row) => row._id === id)
    setSelection({
      entry,
      date: dateKey,
      deleting,
      timeZone: activeTimezone,
      amount:
        entry.kind === "water"
          ? water?.amountMl
          : entry.kind === "supplement"
            ? supplement?.amount
            : undefined,
      unit: entry.kind === "water" ? "ml" : supplement?.unit,
      duration: workout ? workout.durationSeconds / 60 : undefined,
    })
  }
  const deleteSelected = async () => {
    if (!selection) return
    const { entry, date } = selection
    const id = entry.id.slice(entry.id.indexOf(":") + 1)
    if (entry.kind === "food") await removeFoodEntry({ date, entryId: id })
    else if (entry.kind === "water") await removeWaterEntry({ date, id })
    else if (entry.kind === "supplement")
      await removeSupplementEntry({ date, id })
    else
      await removeWorkoutLog({
        id: id as Parameters<typeof removeWorkoutLog>[0]["id"],
      })
    announceOrbActivity("delete")
    toast.success(tr("Entry deleted."))
  }
  const saveSelected = async (
    time: string,
    amount: number,
    duration: number
  ) => {
    if (!selection) return
    const { entry, date } = selection
    const id = entry.id.slice(entry.id.indexOf(":") + 1)
    const loggedAt = diaryTimestamp(
      date,
      time,
      selection.timeZone ?? activeTimezone
    )
    if (entry.kind === "food") await updateFoodTime({ date, id, loggedAt })
    else if (entry.kind === "water")
      await updateWater({ date, id, loggedAt, amountMl: amount })
    else if (entry.kind === "supplement")
      await updateSupplement({ date, id, loggedAt, amount })
    else
      await updateWorkoutTime({
        date,
        id: id as Parameters<typeof updateWorkoutTime>[0]["id"],
        completedAt: Date.parse(loggedAt),
        durationSeconds: duration * 60,
      })
    toast.success(tr("Changes saved."))
  }

  const TIMELINE_ADD_ACTIONS: Record<TimelineEntry["kind"], QuickActionId> = {
    food: "food",
    water: "water",
    supplement: "supplements",
    workout: "workout",
  }
  // Diary entries open a logging drawer for the selected date and time.
  const [quickAction, setQuickAction] = useState<{
    id: QuickActionId
    dateKey: string
    /** Minutes past local midnight the entry belongs at, when the wheel
     *  picked one. Undefined means now, which is what every other door
     *  into these drawers means. */
    atMinutes?: number
  } | null>(null)
  const openQuickAction = (
    id: QuickActionId,
    forDateKey = dateKey,
    atMinutes?: number
  ) => {
    setQuickAction({ id, dateKey: forDateKey, atMinutes })
  }
  const [editFoodEntry, setEditFoodEntry] = useState<FoodLogEntry | null>(null)
  const [scheduleRequest, setScheduleRequest] =
    useState<ScheduleEntryRequest | null>(null)
  const salutation = greeting(hourInTimeZone(now, activeTimezone))
  const dialProps = {
    showNutritionMetric,
    nutritionPercent:
      foodEntries !== undefined &&
      supplementOverview !== undefined &&
      goals?.effective.calories &&
      showNutritionMetric
        ? (dayTotals.calories / goals.effective.calories) * 100
        : null,
    recoveryStatus: healthDashboard?.recovery?.status ?? null,
    loading:
      preferences === undefined ||
      foodEntries === undefined ||
      healthDashboard === undefined ||
      goals === undefined ||
      supplementOverview === undefined ||
      nutritionPlan === undefined,

    onStartWorkout: () => navigate("/workout/active", { motion: "forward" }),
    onOpenNutrition: () => navigate("/nutrition", { motion: "switch" }),
    onOpenRecovery: () => navigate("/health", { motion: "switch" }),
  }
  const dateLabel = dateKeyToCalendarDate(dateKey).toLocaleDateString(
    uiLocale(),
    {
      weekday: "long",
      month: "long",
      day: "numeric",
    }
  )

  // The tab bar is fixed and the home column is a fixed-height flex, so
  // without the bottom padding the week strip lives underneath it. Reserve the
  // bar's own height plus the home indicator; the desk has no bar to clear.
  return (
    <div className="dashboard-home dashboard-today desktop-canvas relative flex min-h-svh flex-col bg-background pb-[calc(env(safe-area-inset-bottom,0px)+4.25rem)] lg:pr-8 lg:pb-0 lg:pl-72">
      <ReactiveOrbField className="dashboard-home-wash" />
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
          title={
            viewingToday
              ? recovery?.active
                ? tr("Your recovery plan")
                : undefined
              : dateLabel
          }
          subtitle={viewingToday ? undefined : daysAgoLabel(dateKey, todayKey)}
          // The sidebar's profile row is a desktop thing; on a phone, and in
          // the native shells especially, this is the only door into settings.
          profile={
            <div className="-mr-1 flex items-center gap-1 lg:hidden">
              <MobileDateSelector
                todayKey={todayKey}
                selectedKey={dateKey}
                onSelectDay={(day) =>
                  setViewedDateKey(day === todayKey ? null : day)
                }
              />
              <ProfileAvatar />
            </div>
          }
          // Beside the greeting only where there is room beside the greeting.
          // On a phone the crown took half the row and the name paid for it;
          // there the dials go under the words, as a row, in the ledger slot.
          action={
            <div className="hidden lg:block">
              {!recovery?.active && <DashboardDials {...dialProps} />}
            </div>
          }
        >
          <div className="px-[var(--app-page-x)]">
            <HomeProgrammes />
            {viewingToday && <RestartNudge />}
            {viewingToday && <RecoveryBanner />}
            {viewingToday && (
              <div className="my-2 flex items-center gap-2">
                <RepeatChips dateKey={dateKey} />
                <VoiceLogButton />
              </div>
            )}
            <div className="lg:hidden">
              {!recovery?.active && (
                <DashboardDials {...dialProps} layout="row" />
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                navigate("/settings?view=feedback", { motion: "forward" })
              }
              className="dashboard-feedback-hint"
            >
              <Message
                text={"{{value0}}Help shape OneRep"}
                values={{
                  value0: <ChatCircleDots size={15} aria-hidden="true" />,
                }}
              />
            </button>
          </div>
        </DashboardHero>
      </div>
      {/* The phone is only the wheel and one date control. Desktop has room
          for the day's supporting totals in a separate right-hand rail. */}
      <div
        className="relative z-10 mx-auto flex w-full max-w-sm flex-wrap justify-center gap-x-4 gap-y-1 px-4 py-2 text-sm lg:hidden"
        aria-label={tr("Daily summary")}
      >
        {foodEntries === undefined ||
        waterEntries === undefined ||
        supplementOverview === undefined ||
        goals === undefined ||
        nutritionPlan === undefined ? (
          <p role="status">{tr("Loading your day…")}</p>
        ) : (
          <>
            {showNutritionMetric && (
              <span>
                {Math.round(dayTotals.calories)} /{" "}
                {goals?.effective.calories ?? "?"} kcal
              </span>
            )}
            {nutritionPlan?.visibleMetrics.protein &&
              !recovery?.active?.simpleFood && (
                <span>
                  {Math.round(dayTotals.protein)} g {tr("protein")}
                </span>
              )}
            <span>
              {formatWater(
                waterEntries.reduce((sum, row) => sum + row.amountMl, 0),
                waterUnit
              )}{" "}
              {tr("water")}
            </span>
          </>
        )}
      </div>
      <div className="dashboard-today-body relative z-10 flex min-h-0 flex-1 flex-col">
        <div
          style={
            recovery?.active ||
            !nutritionPlan?.visibleMetrics.calories ||
            preferences === undefined ||
            goals === undefined ||
            supplementOverview === undefined ||
            foodEntries === undefined ||
            waterEntries === undefined
              ? { display: "none" }
              : undefined
          }
          className="dashboard-day-rail mx-auto hidden w-full max-w-6xl shrink-0 px-[var(--app-page-x)] pt-1 md:px-8 lg:block"
        >
          <DayRail
            className="dashboard-day-rail-grid"
            dateKey={dateKey}
            isToday={viewingToday}
            calories={dayTotals.calories}
            protein={dayTotals.protein}
            carbs={dayTotals.carbs}
            fat={dayTotals.fat}
            calorieGoal={
              nutritionPlan?.visibleMetrics.calories
                ? goals?.effective.calories
                : undefined
            }
            proteinGoal={goals?.effective.protein}
            carbsGoal={goals?.effective.carbs}
            fatGoal={goals?.effective.fat}
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
          <button
            type="button"
            onClick={() =>
              navigate("/coach", {
                motion: "forward",
                state: {
                  coachMode: "chat",
                  initialInput: "Create a compact dashboard widget for ",
                },
              })
            }
            className="dashboard-add-widget motion-tactile mt-4 hidden min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-[14px] font-semibold text-foreground transition-colors hover:bg-muted lg:flex"
          >
            <Message
              text={"{{value0}}Add widget"}
              values={{
                value0: <Plus size={17} weight="bold" aria-hidden="true" />,
              }}
            />
          </button>
        </div>
        {/* The ruler is taller than the screen on purpose — scrolling it pans
            through the hours in place rather than carrying the hero away. */}
        <div className="dashboard-timeline-stage flex min-h-0 flex-1 justify-center">
          <div className="h-[max(22rem,calc(100svh-24rem))] min-h-0 w-full max-w-sm lg:h-[60svh]">
            <DayTimeline
              // Keyed on the day so switching days re-parks the wheel
              // instead of holding the hour the last day was left on.
              key={dateKey}
              isToday={viewingToday}
              loading={
                preferences === undefined ||
                nutritionPlan === undefined ||
                foodEntries === undefined ||
                waterEntries === undefined ||
                supplementEntries === undefined ||
                workoutLogs === undefined
              }
              entries={timelineEntries}
              nowMinutes={nowMinutes}
              sleepWindow={sleepWindow}
              onEditEntry={(entry) => selectEntry(entry)}
              onDeleteEntry={(entry) => selectEntry(entry, true)}
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
        </div>
        <WeekStrip
          todayKey={todayKey}
          selectedKey={dateKey}
          onSelectDay={(day) => setViewedDateKey(day === todayKey ? null : day)}
          workoutDates={workoutDateSet}
          foodDates={foodDateSet}
          className="dashboard-week-strip mt-1 hidden shrink-0 border-t border-border/60 pt-2 pb-3 lg:flex"
        />
      </div>
      {selection && (
        <EntrySheet
          key={`${selection.date}:${selection.entry.id}:${selection.deleting}`}
          selection={selection}
          onClose={() => setSelection(null)}
          onSave={saveSelected}
          onDelete={deleteSelected}
          onDetails={
            !selection.deleting &&
            (selection.entry.kind === "food" ||
              (selection.entry.kind === "workout" &&
                workoutLogs?.some(
                  (log) =>
                    `workout:${log._id}` === selection.entry.id && log.sessionId
                )))
              ? () => {
                  const id = selection.entry.id.slice(
                    selection.entry.id.indexOf(":") + 1
                  )
                  if (selection.entry.kind === "food") {
                    setEditFoodEntry(
                      foodEntries?.find((row) => row.id === id) ?? null
                    )
                    openQuickAction("food", selection.date)
                  } else {
                    const log = workoutLogs?.find((row) => row._id === id)
                    if (log?.sessionId)
                      navigate(
                        `/workout/log/${selection.date}?sessionId=${encodeURIComponent(log.sessionId)}`,
                        { motion: "forward" }
                      )
                  }
                  setSelection(null)
                }
              : undefined
          }
        />
      )}
      <QuickActionDrawer
        id={quickAction?.id ?? null}
        dateKey={quickAction?.dateKey ?? dateKey}
        atMinutes={quickAction?.atMinutes}
        editEntry={editFoodEntry ?? null}
        onClose={() => {
          setQuickAction(null)
          setEditFoodEntry(null)
        }}
      />
      <ScheduleEntrySheet
        request={scheduleRequest}
        onLog={(kind, minutes) => openQuickAction(kind, dateKey, minutes)}
        onClose={() => setScheduleRequest(null)}
      />
    </div>
  )
}

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
    creatine: tr("Creatine"),
    protein: tr("Protein"),
    vitamins: tr("Vitamins"),
    caffeine: tr("Caffeine"),
  }

function formatLoggedTime(value: string | number, timeZone: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return tr("Unknown")
  return diaryTime(date, timeZone)
}

function round(n: number): number {
  return Math.round(n)
}

function buildTimelineEntries({
  food,
  water,
  supplements,
  workouts,
  waterUnit,
  timeZone,
  showFoodNumbers,
}: {
  food?: TimelineFoodEntry[]
  water?: TimelineWaterEntry[]
  timeZone: string
  showFoodNumbers: boolean
  waterUnit?: WaterUnit
  supplements?: TimelineSupplementEntry[]
  workouts?: TimelineWorkoutLog[]
}): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const entry of food ?? []) {
    entries.push({
      id: `food:${entry.id}`,
      time: formatLoggedTime(entry.loggedAt, timeZone),
      title: entry.name,
      detail: showFoodNumbers
        ? tr("{{value0}} · {{value1}} cal", {
            value0: mealLabel(entry.meal as Parameters<typeof mealLabel>[0]),
            value1: round(entry.calories),
          })
        : mealLabel(entry.meal as Parameters<typeof mealLabel>[0]),
      kind: "food",
      facts: [
        ...(showFoodNumbers
          ? [
              { label: tr("Calories"), value: `${round(entry.calories)} kcal` },
              { label: tr("Protein"), value: `${round(entry.protein)} g` },
              { label: tr("Carbs"), value: `${round(entry.carbs)} g` },
              { label: tr("Fat"), value: `${round(entry.fat)} g` },
            ]
          : []),
        ...(entry.servingLabel
          ? [{ label: tr("Serving"), value: entry.servingLabel }]
          : []),
      ],
    })
  }

  for (const entry of water ?? []) {
    entries.push({
      id: `water:${entry.id}`,
      time: formatLoggedTime(entry.loggedAt, timeZone),
      title: tr("Water"),
      detail: formatWater(entry.amountMl, waterUnit ?? "ml"),
      kind: "water",
      facts: [
        {
          label: tr("Amount"),
          value: formatWater(entry.amountMl, waterUnit ?? "ml"),
        },
      ],
    })
  }

  for (const entry of supplements ?? []) {
    entries.push({
      id: `supplement:${entry.id}`,
      time: formatLoggedTime(entry.loggedAt, timeZone),
      title:
        entry.name ??
        entry.note ??
        SUPPLEMENT_KIND_LABELS[entry.kind] ??
        tr("Supplement"),
      detail: tr("{{value0}} {{value1}}", {
        value0: round(entry.amount),
        value1: entry.unit,
      }),
      kind: "supplement",
      facts: [
        { label: tr("Dose"), value: `${round(entry.amount)} ${entry.unit}` },
        ...(entry.note ? [{ label: tr("Note"), value: entry.note }] : []),
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
      time: log.completedAt
        ? formatLoggedTime(log.completedAt, timeZone)
        : tr("Unknown"),
      title: log.exercises[0]?.name
        ? tr("{{value0}}{{value1}}", {
            value0: log.exercises[0].name,
            value1:
              log.exercises.length > 1 ? ` +${log.exercises.length - 1}` : "",
          })
        : tr("Workout"),
      detail: tr("{{value0}} exercise{{value1}} · {{value2}} min", {
        value0: log.exercises.length,
        value1: log.exercises.length === 1 ? "" : "s",
        value2: minutes,
      }),
      kind: "workout",
      facts: [
        { label: tr("Duration"), value: `${minutes} min` },
        {
          label: tr("Exercises"),
          value: String(log.exercises.length),
        },
        { label: tr("Sets"), value: String(totalSets) },
      ],
    })
  }

  return entries
}
