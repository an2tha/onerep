import { Barbell, CheckCircle, ForkKnife, Scales } from "@phosphor-icons/react"
import type { ReactNode } from "react"

import { MetricTooltip } from "./app-feedback"
import { PrimaryButton } from "./mobile-ui"
import { useEnergyUnitLabel } from "../lib/energy-unit"

export type ProgressWeightUnit = "kg" | "lbs"
export type ProgressDayView = {
  date: string
  label: string
  isToday: boolean
  nutrition: {
    logged: boolean
    calories: number
    protein: number
    carbs: number
    fat: number
    calorieProgress: number
    proteinProgress: number
  }
  training: { workouts: number; completedSets: number; durationMinutes: number }
}
export type ProgressSummaryView = {
  days: ProgressDayView[]
  nutrition: {
    loggedDays: number
    previousLoggedDays: number
    calorieTargetDays: number
    proteinTargetDays: number
    averageCalories: number
    averageProtein: number
    averageCarbs: number
    averageFat: number
    calorieDeltaFromTarget: number | null
    previousAverageCalories: number | null
    averageCalorieChange: number | null
  }
  training: {
    workouts: number
    activeDays: number
    completedSets: number
    durationMinutes: number
    averageSetsPerWorkout: number
    previousWorkouts: number
    previousCompletedSets: number
    workoutChange: number
    completedSetChange: number
  }
  body: {
    latestWeightKg: number | null
    latestBodyFatPct: number | null
    latestWaistCm: number | null
    weightDeltaKg: number | null
    bodyFatDeltaPct: number | null
    waistDeltaCm: number | null
    weeklyWeightDeltaKg: number | null
    latestCheckInDate: string | null
    weightTrendDays: number | null
    weightPoints: Array<{ date: string; weightKg: number }>
  }
}
export type BodyMeasurementView = {
  clientId: string
  loggedAt: string
  weightKg?: number
  bodyFatPct?: number
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10)
}
function sparklinePoints(values: number[], width: number, height: number) {
  if (!values.length) return ""
  const min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1
  return values
    .map((value, index) => {
      const x =
        values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
      const y = height - ((value - min) / range) * (height * 0.85)
      return `${x},${y}`
    })
    .join(" ")
}

export function formatProgressWeight(
  weightKg: number | null,
  unit: ProgressWeightUnit
) {
  if (weightKg == null) return "—"
  const value = unit === "lbs" ? weightKg * 2.20462 : weightKg
  return `${value.toFixed(1)} ${unit}`
}

function formatWeightDelta(deltaKg: number | null, unit: ProgressWeightUnit) {
  if (deltaKg == null) return "Not enough data"
  const value = unit === "lbs" ? deltaKg * 2.20462 : deltaKg
  const prefix = value > 0 ? "+" : ""
  return `${prefix}${value.toFixed(1)} ${unit}`
}

export function formatProgressDate(date: string | null) {
  if (!date) return "No check-in"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`))
}

function signed(value: number, suffix = "") {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US")}${suffix}`
}

function comparisonText(value: number, noun: string) {
  if (value === 0) return `Same ${noun} as the prior 7 days`
  return `${Math.abs(value)} ${noun} ${value > 0 ? "more" : "fewer"} than the prior 7 days`
}

function WeekAxis({ days }: { days: ProgressDayView[] }) {
  return (
    <div className="mt-2 grid grid-cols-7 gap-1 px-0.5" aria-hidden="true">
      {days.map((day) => (
        <span
          key={day.date}
          className={`text-center text-[13px] font-semibold ${
            day.isToday ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {day.label}
        </span>
      ))}
    </div>
  )
}

function ChartLegend({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
      {children}
    </p>
  )
}

function NutritionWeekBars({ days }: { days: ProgressDayView[] }) {
  const energyUnit = useEnergyUnitLabel()
  return (
    <div
      className="mt-5"
      role="img"
      aria-label="Seven-day nutrition chart. Orange bars show calories as a percentage of the daily target. Purple dots mark days reaching at least 90 percent of the protein target."
    >
      <div className="grid h-24 grid-cols-7 items-end gap-2 border-b border-border pb-1">
        {days.map((day) => {
          const isLogged = day.nutrition.logged
          const height = isLogged
            ? Math.max(12, day.nutrition.calorieProgress)
            : 5
          const proteinHit = day.nutrition.proteinProgress >= 90

          return (
            <div
              key={day.date}
              className="relative flex h-full items-end justify-center"
              title={
                isLogged
                  ? `${day.date}: ${Math.round(day.nutrition.calories)} ${energyUnit} and ${Math.round(day.nutrition.protein)} g protein`
                  : `${day.date}: no food logged`
              }
            >
              {proteinHit && (
                <span
                  className="absolute top-0 h-2.5 w-2.5 rounded-full bg-[var(--accent-progress)] ring-2 ring-background"
                  aria-hidden="true"
                />
              )}
              <span
                className={`progress-chart-bar w-full max-w-8 rounded-t-lg ${
                  isLogged ? "bg-[var(--accent-food)]" : "bg-muted"
                }`}
                style={{
                  height: `${height}%`,
                  opacity: day.isToday ? 1 : 0.82,
                  animationDelay: `${days.indexOf(day) * 45}ms`,
                }}
                aria-hidden="true"
              />
            </div>
          )
        })}
      </div>
      <WeekAxis days={days} />
      <ChartLegend>
        Orange = calories versus target. Purple dot = protein target reached.
        Empty days are not counted as zero-calorie days.
      </ChartLegend>
    </div>
  )
}

function TrainingWeekBars({ days }: { days: ProgressDayView[] }) {
  const maxSets = Math.max(1, ...days.map((day) => day.training.completedSets))

  return (
    <div
      className="mt-5"
      role="img"
      aria-label="Seven-day training chart. Purple bar height represents completed sets for each day."
    >
      <div className="grid h-24 grid-cols-7 items-end gap-2 border-b border-border pb-1">
        {days.map((day) => {
          const trained = day.training.workouts > 0
          const height = trained
            ? Math.max(16, (day.training.completedSets / maxSets) * 100)
            : 5

          return (
            <div
              key={day.date}
              className="flex h-full items-end justify-center"
              title={
                trained
                  ? `${day.date}: ${day.training.workouts} workout${day.training.workouts === 1 ? "" : "s"}, ${day.training.completedSets} completed sets`
                  : `${day.date}: no workout logged`
              }
            >
              <span
                className={`progress-chart-bar w-full max-w-8 rounded-t-lg ${
                  trained ? "bg-[var(--accent-workout)]" : "bg-muted"
                }`}
                style={{
                  height: `${height}%`,
                  opacity: day.isToday ? 1 : 0.82,
                  animationDelay: `${days.indexOf(day) * 45}ms`,
                }}
                aria-hidden="true"
              />
            </div>
          )
        })}
      </div>
      <WeekAxis days={days} />
      <ChartLegend>
        Bar height compares completed sets within this week. It does not compare
        weight lifted or exercise difficulty.
      </ChartLegend>
    </div>
  )
}

function MetricHeading({
  icon,
  title,
  tooltip,
}: {
  icon: ReactNode
  title: string
  tooltip: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <h2 className="native-section-title">{title}</h2>
      <MetricTooltip label={title}>{tooltip}</MetricTooltip>
    </div>
  )
}

function InsightRow({
  label,
  value,
  detail,
  tooltip,
}: {
  label: string
  value: string
  detail: string
  tooltip?: ReactNode
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[15px] font-semibold">{label}</p>
          {tooltip && (
            <MetricTooltip label={label} align="start">
              {tooltip}
            </MetricTooltip>
          )}
        </div>
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
          {detail}
        </p>
      </div>
      <p className="shrink-0 text-right text-[15px] font-semibold tabular-nums">
        {value}
      </p>
    </div>
  )
}

function Interpretation({ children }: { children: ReactNode }) {
  return (
    <section
      className="progress-tab-enter border-y border-border bg-muted/25 px-4 py-4"
      style={{ animationDelay: "120ms" }}
    >
      <div className="flex gap-3">
        <CheckCircle
          size={20}
          weight="regular"
          className="mt-0.5 shrink-0 text-[var(--status-success)]"
          aria-hidden="true"
        />
        <div>
          <h3 className="text-[15px] font-semibold">What to do next</h3>
          <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
            {children}
          </p>
        </div>
      </div>
    </section>
  )
}

function WeightChart({ summary }: { summary: ProgressSummaryView }) {
  const values = summary.body.weightPoints.map((point) => point.weightKg)
  const points = values.length >= 2 ? sparklinePoints(values, 320, 92) : ""

  return (
    <div className="mt-5">
      <div className="h-28 border-b border-border bg-muted/20 px-2 py-2">
        {points ? (
          <svg
            viewBox="0 0 320 92"
            role="img"
            aria-label={`${values.length} body-weight check-ins from ${summary.body.weightPoints[0]?.date} to ${summary.body.weightPoints.at(-1)?.date}`}
            className="h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient
                id="progress-weight-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0"
                  stopColor="var(--accent-progress)"
                  stopOpacity="0.22"
                />
                <stop
                  offset="1"
                  stopColor="var(--accent-progress)"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <polygon
              points={`${points} 320,92 0,92`}
              fill="url(#progress-weight-fill)"
              className="progress-chart-area"
              aria-hidden="true"
            />
            <polyline
              points={points}
              fill="none"
              stroke="var(--accent-progress)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pathLength="1"
              className="progress-chart-line"
            />
            {points.split(" ").map((point, index, all) => {
              const [x, y] = point.split(",")
              const isLatest = index === all.length - 1
              return (
                <g key={point}>
                  {isLatest && (
                    <circle
                      cx={x}
                      cy={y}
                      r="5"
                      fill="none"
                      stroke="var(--accent-progress)"
                      strokeWidth="1.5"
                      className="progress-chart-pulse"
                      aria-hidden="true"
                    />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={isLatest ? 4 : 3.5}
                    fill="var(--background)"
                    stroke="var(--accent-progress)"
                    strokeWidth="2.5"
                    className="progress-chart-point"
                    style={{ animationDelay: `${240 + index * 70}ms` }}
                  />
                </g>
              )
            })}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
            Add a second check-in to reveal a trend.
          </div>
        )}
      </div>
      {summary.body.weightPoints.length > 1 && (
        <div className="mt-2 flex justify-between text-[13px] font-medium text-muted-foreground">
          <span>
            {formatProgressDate(summary.body.weightPoints[0]?.date ?? null)}
          </span>
          <span>
            {formatProgressDate(summary.body.weightPoints.at(-1)?.date ?? null)}
          </span>
        </div>
      )}
    </div>
  )
}

export function BodyProgress({
  summary,
  measurements,
  unit,
  onAdd,
}: {
  summary: ProgressSummaryView
  measurements: BodyMeasurementView[]
  unit: ProgressWeightUnit
  onAdd: () => void
}) {
  const latestCheckIn = summary.body.latestCheckInDate
  const daysSinceCheckIn = latestCheckIn
    ? Math.max(
        0,
        Math.floor(
          (new Date(`${currentDateKey()}T12:00:00Z`).getTime() -
            new Date(`${latestCheckIn}T12:00:00Z`).getTime()) /
            86_400_000
        )
      )
    : null
  const recentMeasurements = [...measurements]
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
    .slice(0, 5)
  const guidance =
    summary.body.weightPoints.length === 0
      ? "Add a baseline measurement. Progress needs at least two comparable check-ins before it can describe direction."
      : summary.body.weightPoints.length === 1
        ? "Add another check-in after several days under similar conditions. One measurement is a baseline, not a trend."
        : daysSinceCheckIn != null && daysSinceCheckIn >= 8
          ? `Your latest check-in is ${daysSinceCheckIn} days old. Add a current measurement before acting on the trend.`
          : "Keep check-ins under similar conditions and judge the multi-check-in direction, not a single day’s fluctuation."

  return (
    <div className="grid gap-5">
      <section
        className="progress-tab-enter app-surface px-4 py-4"
        aria-label="Body progress"
      >
        <MetricHeading
          icon={<Scales size={20} />}
          title="Weight trend"
          tooltip="The change uses the oldest and newest of your latest 12 valid weight check-ins. Weekly pace normalizes that change by the number of elapsed days."
        />
        <p className="mt-4 text-[2rem] leading-none font-bold tracking-tight tabular-nums">
          {formatProgressWeight(summary.body.latestWeightKg, unit)}
        </p>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {summary.body.weightDeltaKg == null
            ? "Add at least two weight check-ins"
            : `${formatWeightDelta(summary.body.weightDeltaKg, unit)} across ${summary.body.weightTrendDays} days`}
        </p>
        <WeightChart summary={summary} />
      </section>

      <section
        className="progress-tab-enter"
        style={{ animationDelay: "60ms" }}
        aria-label="Body insights"
      >
        <h2 className="native-section-title mb-1">Body insights</h2>
        <div className="border-y border-border">
          <InsightRow
            label="Weekly pace"
            value={formatWeightDelta(summary.body.weeklyWeightDeltaKg, unit)}
            detail="Normalized from your check-in trend"
            tooltip="This is not a prediction. It is the observed change between your oldest and newest displayed check-ins, divided by elapsed time and expressed per seven days."
          />
          <InsightRow
            label="Body fat"
            value={
              summary.body.latestBodyFatPct == null
                ? "Not logged"
                : `${summary.body.latestBodyFatPct.toFixed(1)}%`
            }
            detail={
              summary.body.bodyFatDeltaPct == null
                ? "Two estimates are needed for change"
                : `${signed(Number(summary.body.bodyFatDeltaPct.toFixed(1)), " pts")} across recorded estimates`
            }
            tooltip="Consumer body-fat estimates can vary with hydration and device. Use the same method and focus on the longer-term direction."
          />
          <InsightRow
            label="Waist"
            value={
              summary.body.latestWaistCm == null
                ? "Not logged"
                : `${summary.body.latestWaistCm.toFixed(1)} cm`
            }
            detail={
              summary.body.waistDeltaCm == null
                ? "Two measurements are needed for change"
                : `${signed(Number(summary.body.waistDeltaCm.toFixed(1)), " cm")} across recorded measurements`
            }
            tooltip="Measure at the same anatomical point, posture, and time of day. Small differences can be measurement noise."
          />
          <InsightRow
            label="Latest check-in"
            value={daysSinceCheckIn == null ? "—" : `${daysSinceCheckIn}d ago`}
            detail={formatProgressDate(summary.body.latestCheckInDate)}
          />
        </div>
      </section>

      <Interpretation>{guidance}</Interpretation>

      <PrimaryButton onClick={onAdd} className="w-full">
        Add measurement
      </PrimaryButton>

      {recentMeasurements.length > 0 && (
        <section
        className="progress-tab-enter"
        style={{ animationDelay: "160ms" }}
        aria-label="Recent body check-ins"
      >
          <h2 className="native-section-title mb-1">Recent check-ins</h2>
          <div className="border-y border-border">
            {recentMeasurements.map((measurement) => (
              <div
                key={measurement.clientId}
                className="flex min-h-14 items-center justify-between gap-4 border-b border-border py-2 last:border-b-0"
              >
                <div>
                  <p className="text-[15px] font-medium">
                    {formatProgressDate(measurement.loggedAt.slice(0, 10))}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {measurement.bodyFatPct != null
                      ? `${measurement.bodyFatPct.toFixed(1)}% body fat`
                      : "Weight check-in"}
                  </p>
                </div>
                <p className="text-[15px] font-semibold tabular-nums">
                  {formatProgressWeight(measurement.weightKg ?? null, unit)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function NutritionProgress({
  summary,
  calorieTarget,
  proteinTarget,
  onOpenDiary,
}: {
  summary: ProgressSummaryView
  calorieTarget: number
  proteinTarget: number
  onOpenDiary: () => void
}) {
  const energyUnit = useEnergyUnitLabel()
  const logged = summary.nutrition.loggedDays
  const guidance =
    logged < 4
      ? `Only ${logged} of 7 days contain food logs. Log at least four representative days before using the averages to change your plan.`
      : summary.nutrition.proteinTargetDays < Math.ceil(logged / 2)
        ? `Protein reached at least 90% of target on ${summary.nutrition.proteinTargetDays} of ${logged} logged days. Plan a reliable protein source earlier in the day.`
        : summary.nutrition.calorieTargetDays < Math.ceil(logged / 2)
          ? `Calories landed within 80–120% of target on ${summary.nutrition.calorieTargetDays} of ${logged} logged days. Review the outlier days before changing the target.`
          : "Logging coverage and target consistency are strong enough to review alongside your body trend. Keep the plan stable unless the longer-term outcome disagrees."

  return (
    <div className="grid gap-5">
      <section
        className="progress-tab-enter app-surface px-4 py-4"
        aria-label="Nutrition progress"
      >
        <MetricHeading
          icon={<ForkKnife size={20} />}
          title="Average intake"
          tooltip="Averages include only days with at least one food entry. Unlogged days are excluded rather than treated as zero intake."
        />
        <p className="mt-4 text-[2rem] leading-none font-bold tracking-tight tabular-nums">
          {logged > 0
            ? `${summary.nutrition.averageCalories.toLocaleString("en-US")} ${energyUnit}`
            : "No data"}
        </p>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {summary.nutrition.calorieDeltaFromTarget == null
            ? `Daily target ${calorieTarget.toLocaleString("en-US")} ${energyUnit}`
            : `${signed(summary.nutrition.calorieDeltaFromTarget, ` ${energyUnit}`)} versus target on logged days`}
        </p>
        <NutritionWeekBars days={summary.days} />
      </section>

      <section
        className="progress-tab-enter"
        style={{ animationDelay: "60ms" }}
        aria-label="Nutrition insights"
      >
        <h2 className="native-section-title mb-1">Nutrition insights</h2>
        <div className="border-y border-border">
          <InsightRow
            label="Logging coverage"
            value={`${logged}/7 days`}
            detail={
              logged >= 4
                ? "Enough coverage for a directional weekly view"
                : "Low coverage; averages may not represent the week"
            }
            tooltip="Four logged days is used here as a practical confidence cue, not a scientific threshold. Include typical weekdays and weekends when possible."
          />
          <InsightRow
            label="Calorie consistency"
            value={`${summary.nutrition.calorieTargetDays}/${Math.max(1, logged)}`}
            detail="Logged days within 80–120% of target"
            tooltip="The range is deliberately broad to identify major outliers. It is not a pass/fail judgment and does not replace goal calibration."
          />
          <InsightRow
            label="Protein consistency"
            value={`${summary.nutrition.proteinTargetDays}/${Math.max(1, logged)}`}
            detail={`Days reaching at least 90% of ${proteinTarget} g`}
            tooltip="A day counts when recorded protein reaches at least 90% of the current target. Unlogged days are excluded."
          />
          <InsightRow
            label="Average macros"
            value={`${summary.nutrition.averageProtein}P · ${summary.nutrition.averageCarbs}C · ${summary.nutrition.averageFat}F`}
            detail="Grams per logged day"
          />
          <InsightRow
            label="Prior-week change"
            value={
              summary.nutrition.averageCalorieChange == null
                ? "No comparison"
                : signed(summary.nutrition.averageCalorieChange, ` ${energyUnit}`)
            }
            detail={
              summary.nutrition.previousAverageCalories == null
                ? "No food was logged in the prior 7 days"
                : `Prior average ${summary.nutrition.previousAverageCalories.toLocaleString("en-US")} ${energyUnit} across ${summary.nutrition.previousLoggedDays} logged days`
            }
            tooltip="This compares average calories per logged day. Large changes can reflect different logging coverage, so check the day counts before interpreting it."
          />
        </div>
      </section>

      <Interpretation>{guidance}</Interpretation>
      <PrimaryButton onClick={onOpenDiary} className="w-full">
        Open nutrition diary
      </PrimaryButton>
    </div>
  )
}

export function TrainingProgress({
  summary,
  onOpenTraining,
}: {
  summary: ProgressSummaryView
  onOpenTraining: () => void
}) {
  const guidance =
    summary.training.workouts === 0
      ? "No workout was completed in the last 7 days. Start the next planned session; a single completed workout is more useful than an arbitrary activity score."
      : summary.training.activeDays === 1
        ? "Training is concentrated on one day. If your plan calls for more sessions, schedule the next one now rather than chasing extra sets today."
        : summary.training.completedSetChange > 6
          ? "Completed-set volume rose meaningfully from the prior week. Keep recovery and exercise quality stable before increasing it again."
          : "Use completed sets and active days to check plan execution. Exercise difficulty and load still matter, so review session history before changing volume."

  return (
    <div className="grid gap-5">
      <section
        className="progress-tab-enter app-surface px-4 py-4"
        aria-label="Training progress"
      >
        <MetricHeading
          icon={<Barbell size={20} />}
          title="Completed-set volume"
          tooltip="This counts sets marked complete during the last 7 days. It is a simple consistency proxy and does not account for weight, reps, proximity to failure, or exercise difficulty."
        />
        <p className="mt-4 text-[2rem] leading-none font-bold tracking-tight tabular-nums">
          {summary.training.completedSets} sets
        </p>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {comparisonText(summary.training.completedSetChange, "set")}
        </p>
        <TrainingWeekBars days={summary.days} />
      </section>

      <section
        className="progress-tab-enter"
        style={{ animationDelay: "60ms" }}
        aria-label="Training insights"
      >
        <h2 className="native-section-title mb-1">Training insights</h2>
        <div className="border-y border-border">
          <InsightRow
            label="Sessions"
            value={`${summary.training.workouts}`}
            detail={comparisonText(summary.training.workoutChange, "session")}
          />
          <InsightRow
            label="Active days"
            value={`${summary.training.activeDays}/7`}
            detail="Calendar days with at least one completed workout"
            tooltip="Multiple sessions on one day count as one active day. This helps distinguish training frequency from session count."
          />
          <InsightRow
            label="Training time"
            value={`${summary.training.durationMinutes} min`}
            detail="Total recorded session duration"
            tooltip="This is elapsed workout time, not time under tension. Pauses and incomplete timer data can affect it."
          />
          <InsightRow
            label="Sets per session"
            value={`${summary.training.averageSetsPerWorkout}`}
            detail="Completed sets divided by recorded sessions"
            tooltip="Use this to spot unusually short or dense weeks. It does not indicate whether those sets were appropriate for a specific muscle group."
          />
        </div>
      </section>

      <Interpretation>{guidance}</Interpretation>
      <PrimaryButton onClick={onOpenTraining} className="w-full">
        Open training
      </PrimaryButton>
    </div>
  )
}

export function ProgressLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading progress">
      <div className="app-surface h-64 animate-pulse bg-muted/50" />
      <div className="h-52 animate-pulse border-y border-border bg-muted/30" />
    </div>
  )
}
