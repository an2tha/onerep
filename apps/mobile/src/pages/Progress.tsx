import { useMemo, type ReactNode } from "react"
import {
  Barbell,
  CaretRight,
  ChartLine,
  ForkKnife,
  TrendUp,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { currentDateKey, type FoodLogDaySnapshot } from "@/lib/food-log"
import type { BodyMeasurementEntry } from "@/lib/body-progress"
import type { EffectiveGoalsResult, WeightUnit } from "@/lib/health-goals"
import { useSmoothNavigate } from "@/lib/navigation"
import { sparklinePoints } from "@/lib/progress-metrics"
import {
  buildProgressSummary,
  type ProgressDay,
  type ProgressSummary,
} from "@/lib/progress-summary"
import type { CachedWorkoutLog } from "@/lib/workout-sync"

function formatWeight(weightKg: number | null, unit: WeightUnit) {
  if (weightKg == null) return "—"
  const value = unit === "lbs" ? weightKg * 2.20462 : weightKg
  return `${value.toFixed(1)} ${unit}`
}

function formatWeightDelta(deltaKg: number | null, unit: WeightUnit) {
  if (deltaKg == null) return "No trend yet"
  const value = unit === "lbs" ? deltaKg * 2.20462 : deltaKg
  const prefix = value > 0 ? "+" : ""
  return `${prefix}${value.toFixed(1)} ${unit}`
}

function SnapshotTile({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string | number
  detail: string
  tone: string
}) {
  return (
    <div className="app-surface min-w-0 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-[10px]"
          style={{
            background: `color-mix(in srgb, ${tone} 12%, transparent)`,
            color: tone,
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground/46">
          {label}
        </span>
      </div>
      <p className="app-display mt-3 text-[1.38rem] tabular-nums">{value}</p>
      <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground/52">
        {detail}
      </p>
    </div>
  )
}

function WeekAxis({ days }: { days: ProgressDay[] }) {
  return (
    <div className="mt-2 grid grid-cols-7 gap-1 px-0.5" aria-hidden="true">
      {days.map((day) => (
        <span
          key={day.date}
          className={`text-center text-[9px] font-semibold ${
            day.isToday ? "text-foreground" : "text-muted-foreground/46"
          }`}
        >
          {day.label}
        </span>
      ))}
    </div>
  )
}

function NutritionWeekBars({ days }: { days: ProgressDay[] }) {
  return (
    <div
      className="mt-4"
      role="img"
      aria-label="Seven-day nutrition chart. Filled bars show calorie progress. Purple dots mark protein target days."
    >
      <div className="grid h-16 grid-cols-7 items-end gap-1">
        {days.map((day) => {
          const isLogged = day.nutrition.logged
          const height = isLogged
            ? Math.max(12, day.nutrition.calorieProgress)
            : 7
          const proteinHit = day.nutrition.proteinProgress >= 90

          return (
            <div
              key={day.date}
              className="relative flex h-full items-end justify-center"
              title={
                isLogged
                  ? `${day.date}: ${Math.round(day.nutrition.calories)} calories, ${Math.round(day.nutrition.protein)} grams protein`
                  : `${day.date}: no food logged`
              }
            >
              {proteinHit && (
                <span
                  className="absolute top-0 h-1.5 w-1.5 rounded-full bg-[var(--accent-progress)]"
                  aria-hidden="true"
                />
              )}
              <span
                className={`w-full max-w-7 rounded-[5px] ${
                  isLogged ? "bg-[var(--accent-food)]" : "bg-foreground/[0.06]"
                }`}
                style={{
                  height: `${height}%`,
                  opacity: day.isToday ? 1 : 0.72,
                }}
                aria-hidden="true"
              />
            </div>
          )
        })}
      </div>
      <WeekAxis days={days} />
    </div>
  )
}

function TrainingWeekBars({ days }: { days: ProgressDay[] }) {
  const maxSets = Math.max(1, ...days.map((day) => day.training.completedSets))

  return (
    <div
      className="mt-4"
      role="img"
      aria-label="Seven-day training chart. Bar height represents completed sets."
    >
      <div className="grid h-16 grid-cols-7 items-end gap-1">
        {days.map((day) => {
          const trained = day.training.workouts > 0
          const height = trained
            ? Math.max(16, (day.training.completedSets / maxSets) * 100)
            : 7

          return (
            <div
              key={day.date}
              className="flex h-full items-end justify-center"
              title={
                trained
                  ? `${day.date}: ${day.training.workouts} workout${day.training.workouts === 1 ? "" : "s"}, ${day.training.completedSets} completed sets`
                  : `${day.date}: rest day`
              }
            >
              <span
                className={`w-full max-w-7 rounded-[5px] ${
                  trained
                    ? "bg-[var(--accent-workout)]"
                    : "bg-foreground/[0.06]"
                }`}
                style={{
                  height: `${height}%`,
                  opacity: day.isToday ? 1 : 0.72,
                }}
                aria-hidden="true"
              />
            </div>
          )
        })}
      </div>
      <WeekAxis days={days} />
    </div>
  )
}

function BodyTrend({
  summary,
  unit,
}: {
  summary: ProgressSummary
  unit: WeightUnit
}) {
  const points = summary.body.weightPoints
  const weights = points.map((point) => point.weightKg)
  const line = weights.length >= 2 ? sparklinePoints(weights, 280, 58) : ""
  const bodyFat = summary.body.latestBodyFatPct

  return (
    <section
      className="app-surface min-w-0 px-3.5 py-3.5"
      aria-label={`Body trend. Latest weight ${formatWeight(summary.body.latestWeightKg, unit)}.`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-progress-bg)] text-[var(--accent-progress)]">
            <ChartLine size={15} weight="bold" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold">Body</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground/52">
              {points.length > 0
                ? `${points.length} check-in${points.length === 1 ? "" : "s"}`
                : "No check-ins"}
            </p>
          </div>
        </div>
        <div className="min-w-0 text-right">
          <p className="app-display truncate text-[1.1rem] tabular-nums">
            {formatWeight(summary.body.latestWeightKg, unit)}
          </p>
          <p className="mt-0.5 text-[10px] font-medium text-muted-foreground/52">
            {formatWeightDelta(summary.body.weightDeltaKg, unit)}
          </p>
        </div>
      </div>

      <div className="mt-4 h-[58px] rounded-[12px] bg-foreground/[0.035] px-1.5 py-1">
        {line ? (
          <svg
            viewBox="0 0 280 58"
            role="img"
            aria-label={`${points.length} body-weight check-ins shown as a trend line`}
            className="h-full w-full overflow-visible"
          >
            <polyline
              points={line}
              fill="none"
              stroke="var(--accent-progress)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="h-px w-16 bg-foreground/10" aria-hidden="true" />
          </div>
        )}
      </div>

      {bodyFat != null && (
        <p className="mt-2 text-right text-[10px] font-medium text-muted-foreground/52">
          {bodyFat.toFixed(1)}% body fat
        </p>
      )}
    </section>
  )
}

function ProgressLoading() {
  return (
    <div
      className="grid gap-2.5"
      aria-busy="true"
      aria-label="Loading progress"
    >
      <div className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="app-surface h-24 animate-pulse bg-foreground/[0.04]"
          />
        ))}
      </div>
      <div className="app-surface h-44 animate-pulse bg-foreground/[0.04]" />
    </div>
  )
}

export default function Progress() {
  const navigate = useSmoothNavigate()
  const today = currentDateKey()
  const bodyMeasurements = useQuery(api.bodyProgress.list) as
    BodyMeasurementEntry[] | undefined
  const workoutHistory = useQuery(api.logs.workouts.getHistory) as
    CachedWorkoutLog[] | undefined
  const foodHistory = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: today,
    limit: 30,
  }) as FoodLogDaySnapshot[] | undefined
  const effectiveGoals = useQuery(api.users.users.getEffectiveGoals, {}) as
    EffectiveGoalsResult | null | undefined
  const preferences = useQuery(api.users.users.getPreferences, {})

  const summary = useMemo(
    () =>
      buildProgressSummary({
        today,
        foodLogs: foodHistory ?? [],
        workoutLogs: workoutHistory ?? [],
        bodyMeasurements: bodyMeasurements ?? [],
        caloriesTarget: effectiveGoals?.effective.calories ?? 2000,
        proteinTarget: effectiveGoals?.effective.protein ?? 150,
      }),
    [bodyMeasurements, effectiveGoals, foodHistory, today, workoutHistory]
  )
  const unit: WeightUnit = preferences?.weightUnit === "lbs" ? "lbs" : "kg"
  const loading =
    bodyMeasurements === undefined ||
    workoutHistory === undefined ||
    foodHistory === undefined ||
    effectiveGoals === undefined ||
    preferences === undefined

  return (
    <div className="desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <main className="app-page">
        <header className="app-header">
          <div>
            <h1 className="app-title">Progress</h1>
          </div>
          <span className="rounded-full bg-foreground/[0.055] px-2.5 py-1 text-[10px] font-bold text-muted-foreground/62">
            7 days
          </span>
        </header>

        {loading ? (
          <ProgressLoading />
        ) : (
          <div className="grid gap-2.5">
            <section
              className="grid grid-cols-3 gap-2.5"
              aria-label="Weekly overview"
            >
              <SnapshotTile
                icon={<TrendUp size={15} weight="bold" />}
                label="Body"
                value={formatWeight(summary.body.latestWeightKg, unit)}
                detail={formatWeightDelta(summary.body.weightDeltaKg, unit)}
                tone="var(--accent-progress)"
              />
              <SnapshotTile
                icon={<ForkKnife size={15} weight="bold" />}
                label="Food"
                value={`${summary.nutrition.loggedDays}/7`}
                detail={`${summary.nutrition.proteinTargetDays} protein`}
                tone="var(--accent-food)"
              />
              <SnapshotTile
                icon={<Barbell size={15} weight="bold" />}
                label="Training"
                value={summary.training.workouts}
                detail={`${summary.training.completedSets} sets`}
                tone="var(--accent-workout)"
              />
            </section>

            <section className="grid gap-2.5 md:grid-cols-2">
              <button
                type="button"
                onClick={() => navigate("/nutrition", { motion: "switch" })}
                className="app-surface min-w-0 px-3.5 py-3.5 text-left transition-transform active:translate-y-px"
                aria-label="Open nutrition week"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-food-bg)] text-[var(--accent-food)]">
                      <ForkKnife size={15} weight="bold" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold">Nutrition</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/52">
                        {summary.nutrition.calorieTargetDays}/7 on target
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-right text-muted-foreground/54">
                    <span className="text-[11px] font-bold tabular-nums">
                      {summary.nutrition.averageCalories || "—"}
                    </span>
                    <CaretRight size={13} weight="bold" aria-hidden="true" />
                  </div>
                </div>
                <NutritionWeekBars days={summary.days} />
              </button>

              <button
                type="button"
                onClick={() => navigate("/workouts", { motion: "switch" })}
                className="app-surface min-w-0 px-3.5 py-3.5 text-left transition-transform active:translate-y-px"
                aria-label="Open training week"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-workout-bg)] text-[var(--accent-workout)]">
                      <Barbell size={15} weight="bold" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold">Training</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/52">
                        {summary.training.activeDays}/7 active days
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-right text-muted-foreground/54">
                    <span className="text-[11px] font-bold tabular-nums">
                      {summary.training.durationMinutes > 0
                        ? `${summary.training.durationMinutes}m`
                        : "—"}
                    </span>
                    <CaretRight size={13} weight="bold" aria-hidden="true" />
                  </div>
                </div>
                <TrainingWeekBars days={summary.days} />
              </button>
            </section>

            <BodyTrend summary={summary} unit={unit} />
          </div>
        )}
      </main>
    </div>
  )
}
