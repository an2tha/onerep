import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import {
  Barbell,
  CheckCircle,
  ForkKnife,
  Plus,
  Scales,
  X,
} from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { useSearchParams } from "react-router"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
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
import {
  DisclosureRow,
  FormField,
  GroupedList,
  PrimaryButton,
  ToolbarButton,
} from "@/components/mobile-ui"
import { MobileSheet } from "@/components/mobile-sheet"
import { hapticMedium } from "@/lib/haptics"
import { toast } from "sonner"
import {
  AppTooltip,
  APP_TOOLTIP_IDS,
  MetricTooltip,
} from "@/components/tooltips"

function formatWeight(weightKg: number | null, unit: WeightUnit) {
  if (weightKg == null) return "—"
  const value = unit === "lbs" ? weightKg * 2.20462 : weightKg
  return `${value.toFixed(1)} ${unit}`
}

function formatWeightDelta(deltaKg: number | null, unit: WeightUnit) {
  if (deltaKg == null) return "Not enough data"
  const value = unit === "lbs" ? deltaKg * 2.20462 : deltaKg
  const prefix = value > 0 ? "+" : ""
  return `${prefix}${value.toFixed(1)} ${unit}`
}

function formatDate(date: string | null) {
  if (!date) return "No check-in"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`))
}

function signed(value: number, suffix = "") {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}${suffix}`
}

function comparisonText(value: number, noun: string) {
  if (value === 0) return `Same ${noun} as the prior 7 days`
  return `${Math.abs(value)} ${noun} ${value > 0 ? "more" : "fewer"} than the prior 7 days`
}

function WeekAxis({ days }: { days: ProgressDay[] }) {
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

function NutritionWeekBars({ days }: { days: ProgressDay[] }) {
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
                  ? `${day.date}: ${Math.round(day.nutrition.calories)} kcal and ${Math.round(day.nutrition.protein)} g protein`
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
                className={`w-full max-w-8 rounded-t-lg ${
                  isLogged ? "bg-[var(--accent-food)]" : "bg-muted"
                }`}
                style={{
                  height: `${height}%`,
                  opacity: day.isToday ? 1 : 0.82,
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

function TrainingWeekBars({ days }: { days: ProgressDay[] }) {
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
                className={`w-full max-w-8 rounded-t-lg ${
                  trained ? "bg-[var(--accent-workout)]" : "bg-muted"
                }`}
                style={{
                  height: `${height}%`,
                  opacity: day.isToday ? 1 : 0.82,
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
    <section className="border-y border-border bg-muted/25 px-4 py-4">
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

function WeightChart({ summary }: { summary: ProgressSummary }) {
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
            <polyline
              points={points}
              fill="none"
              stroke="var(--accent-progress)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {points.split(" ").map((point) => {
              const [x, y] = point.split(",")
              return (
                <circle
                  key={point}
                  cx={x}
                  cy={y}
                  r="3.5"
                  fill="var(--background)"
                  stroke="var(--accent-progress)"
                  strokeWidth="2.5"
                />
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
          <span>{formatDate(summary.body.weightPoints[0]?.date ?? null)}</span>
          <span>
            {formatDate(summary.body.weightPoints.at(-1)?.date ?? null)}
          </span>
        </div>
      )}
    </div>
  )
}

function BodyProgress({
  summary,
  measurements,
  unit,
  onAdd,
}: {
  summary: ProgressSummary
  measurements: BodyMeasurementEntry[]
  unit: WeightUnit
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
      <section className="app-surface px-4 py-4" aria-label="Body progress">
        <MetricHeading
          icon={<Scales size={20} />}
          title="Weight trend"
          tooltip="The change uses the oldest and newest of your latest 12 valid weight check-ins. Weekly pace normalizes that change by the number of elapsed days."
        />
        <p className="mt-4 text-[2rem] leading-none font-bold tracking-tight tabular-nums">
          {formatWeight(summary.body.latestWeightKg, unit)}
        </p>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {summary.body.weightDeltaKg == null
            ? "Add at least two weight check-ins"
            : `${formatWeightDelta(summary.body.weightDeltaKg, unit)} across ${summary.body.weightTrendDays} days`}
        </p>
        <WeightChart summary={summary} />
      </section>

      <section aria-label="Body insights">
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
            detail={formatDate(summary.body.latestCheckInDate)}
          />
        </div>
      </section>

      <Interpretation>{guidance}</Interpretation>

      <PrimaryButton onClick={onAdd} className="w-full">
        Add measurement
      </PrimaryButton>

      {recentMeasurements.length > 0 && (
        <section aria-label="Recent body check-ins">
          <h2 className="native-section-title mb-1">Recent check-ins</h2>
          <div className="border-y border-border">
            {recentMeasurements.map((measurement) => (
              <div
                key={measurement.clientId}
                className="flex min-h-14 items-center justify-between gap-4 border-b border-border py-2 last:border-b-0"
              >
                <div>
                  <p className="text-[15px] font-medium">
                    {formatDate(measurement.loggedAt.slice(0, 10))}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {measurement.bodyFatPct != null
                      ? `${measurement.bodyFatPct.toFixed(1)}% body fat`
                      : "Weight check-in"}
                  </p>
                </div>
                <p className="text-[15px] font-semibold tabular-nums">
                  {formatWeight(measurement.weightKg ?? null, unit)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function NutritionProgress({
  summary,
  calorieTarget,
  proteinTarget,
  onOpenDiary,
}: {
  summary: ProgressSummary
  calorieTarget: number
  proteinTarget: number
  onOpenDiary: () => void
}) {
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
        className="app-surface px-4 py-4"
        aria-label="Nutrition progress"
      >
        <MetricHeading
          icon={<ForkKnife size={20} />}
          title="Average intake"
          tooltip="Averages include only days with at least one food entry. Unlogged days are excluded rather than treated as zero intake."
        />
        <p className="mt-4 text-[2rem] leading-none font-bold tracking-tight tabular-nums">
          {logged > 0
            ? `${summary.nutrition.averageCalories.toLocaleString()} kcal`
            : "No data"}
        </p>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {summary.nutrition.calorieDeltaFromTarget == null
            ? `Daily target ${calorieTarget.toLocaleString()} kcal`
            : `${signed(summary.nutrition.calorieDeltaFromTarget, " kcal")} versus target on logged days`}
        </p>
        <NutritionWeekBars days={summary.days} />
      </section>

      <section aria-label="Nutrition insights">
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
                : signed(summary.nutrition.averageCalorieChange, " kcal")
            }
            detail={
              summary.nutrition.previousAverageCalories == null
                ? "No food was logged in the prior 7 days"
                : `Prior average ${summary.nutrition.previousAverageCalories.toLocaleString()} kcal across ${summary.nutrition.previousLoggedDays} logged days`
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

function TrainingProgress({
  summary,
  onOpenTraining,
}: {
  summary: ProgressSummary
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
      <section className="app-surface px-4 py-4" aria-label="Training progress">
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

      <section aria-label="Training insights">
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

function ProgressLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading progress">
      <div className="app-surface h-64 animate-pulse bg-muted/50" />
      <div className="h-52 animate-pulse border-y border-border bg-muted/30" />
    </div>
  )
}

export default function Progress() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const [metric, setMetric] = useState<"body" | "nutrition" | "training">(
    "body"
  )
  const [entryOpen, setEntryOpen] = useState(
    () => searchParams.get("checkIn") === "1"
  )
  const [weight, setWeight] = useState("")
  const [bodyFat, setBodyFat] = useState("")
  const [waist, setWaist] = useState("")
  const [hips, setHips] = useState("")
  const [chest, setChest] = useState("")
  const [notes, setNotes] = useState("")
  const [entryClientId, setEntryClientId] = useState<string | null>(null)
  const [entryPrepared, setEntryPrepared] = useState(false)
  const [savingEntry, setSavingEntry] = useState(false)
  const [entryError, setEntryError] = useState("")
  const saveMeasurement = useMutation(api.bodyProgress.save)
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
  const calorieTarget = effectiveGoals?.effective.calories ?? 2000
  const proteinTarget = effectiveGoals?.effective.protein ?? 150

  const summary = useMemo(
    () =>
      buildProgressSummary({
        today,
        foodLogs: foodHistory ?? [],
        workoutLogs: workoutHistory ?? [],
        bodyMeasurements: bodyMeasurements ?? [],
        caloriesTarget: calorieTarget,
        proteinTarget,
      }),
    [
      bodyMeasurements,
      calorieTarget,
      foodHistory,
      proteinTarget,
      today,
      workoutHistory,
    ]
  )
  const unit: WeightUnit = preferences?.weightUnit === "lbs" ? "lbs" : "kg"
  const orderedMeasurements = useMemo(
    () =>
      [...(bodyMeasurements ?? [])].sort((a, b) =>
        a.loggedAt.localeCompare(b.loggedAt)
      ),
    [bodyMeasurements]
  )
  const todayMeasurement = useMemo(
    () =>
      [...orderedMeasurements]
        .reverse()
        .find((measurement) => measurement.loggedAt.slice(0, 10) === today),
    [orderedMeasurements, today]
  )
  const previousMeasurement = useMemo(
    () =>
      [...orderedMeasurements]
        .reverse()
        .find((measurement) => measurement.loggedAt.slice(0, 10) < today),
    [orderedMeasurements, today]
  )
  const loading =
    bodyMeasurements === undefined ||
    workoutHistory === undefined ||
    foodHistory === undefined ||
    effectiveGoals === undefined ||
    preferences === undefined

  const prepareEntry = useCallback(() => {
    if (todayMeasurement) {
      const displayWeight =
        todayMeasurement.weightKg == null
          ? ""
          : unit === "lbs"
            ? todayMeasurement.weightKg * 2.20462
            : todayMeasurement.weightKg
      setWeight(
        displayWeight === "" ? "" : displayWeight.toFixed(1).replace(/\.0$/, "")
      )
      setBodyFat(
        todayMeasurement.bodyFatPct == null
          ? ""
          : String(todayMeasurement.bodyFatPct)
      )
      setWaist(
        todayMeasurement.waistCm == null ? "" : String(todayMeasurement.waistCm)
      )
      setHips(
        todayMeasurement.hipsCm == null ? "" : String(todayMeasurement.hipsCm)
      )
      setChest(
        todayMeasurement.chestCm == null ? "" : String(todayMeasurement.chestCm)
      )
      setNotes(todayMeasurement.notes ?? "")
      setEntryClientId(todayMeasurement.clientId)
    } else {
      setWeight("")
      setBodyFat("")
      setWaist("")
      setHips("")
      setChest("")
      setNotes("")
      setEntryClientId(null)
    }
    setEntryError("")
    setEntryPrepared(true)
  }, [todayMeasurement, unit])

  function openEntry() {
    if (bodyMeasurements === undefined) {
      setWeight("")
      setBodyFat("")
      setWaist("")
      setHips("")
      setChest("")
      setNotes("")
      setEntryClientId(null)
      setEntryError("")
      setEntryPrepared(false)
    } else {
      prepareEntry()
    }
    setEntryOpen(true)
  }

  function closeEntry() {
    setEntryOpen(false)
    setEntryPrepared(false)
    setEntryError("")
  }

  useEffect(() => {
    if (!entryOpen || entryPrepared || bodyMeasurements === undefined) return
    prepareEntry()
  }, [bodyMeasurements, entryOpen, entryPrepared, prepareEntry])

  async function handleEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parseNumber = (value: string) =>
      value.trim() ? Number(value.trim().replace(",", ".")) : undefined
    const enteredWeight = parseNumber(weight)
    const enteredBodyFat = parseNumber(bodyFat)
    const enteredWaist = parseNumber(waist)
    const enteredHips = parseNumber(hips)
    const enteredChest = parseNumber(chest)
    if (
      enteredWeight === undefined ||
      !Number.isFinite(enteredWeight) ||
      enteredWeight <= 0
    ) {
      setEntryError("Enter a valid weight.")
      return
    }
    if (
      enteredBodyFat !== undefined &&
      (!Number.isFinite(enteredBodyFat) ||
        enteredBodyFat <= 0 ||
        enteredBodyFat > 100)
    ) {
      setEntryError("Body fat must be between 0 and 100%.")
      return
    }
    const circumferences = [enteredWaist, enteredHips, enteredChest].filter(
      (value): value is number => value !== undefined
    )
    if (
      circumferences.some(
        (value) => !Number.isFinite(value) || value <= 0 || value > 300
      )
    ) {
      setEntryError("Body measurements must be between 1 and 300 cm.")
      return
    }
    setSavingEntry(true)
    setEntryError("")
    try {
      await saveMeasurement({
        clientId: entryClientId ?? crypto.randomUUID(),
        loggedAt: new Date().toISOString(),
        weightKg: unit === "lbs" ? enteredWeight / 2.20462 : enteredWeight,
        ...(enteredBodyFat !== undefined ? { bodyFatPct: enteredBodyFat } : {}),
        ...(enteredWaist !== undefined ? { waistCm: enteredWaist } : {}),
        ...(enteredHips !== undefined ? { hipsCm: enteredHips } : {}),
        ...(enteredChest !== undefined ? { chestCm: enteredChest } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(todayMeasurement?.armsCm != null
          ? { armsCm: todayMeasurement.armsCm }
          : {}),
        ...(todayMeasurement?.thighsCm != null
          ? { thighsCm: todayMeasurement.thighsCm }
          : {}),
        ...(todayMeasurement?.calvesCm != null
          ? { calvesCm: todayMeasurement.calvesCm }
          : {}),
        ...(todayMeasurement?.neckCm != null
          ? { neckCm: todayMeasurement.neckCm }
          : {}),
        ...(todayMeasurement?.photoStorageId
          ? {
              photoStorageId: todayMeasurement.photoStorageId as Id<"_storage">,
            }
          : {}),
        ...(todayMeasurement?.photoDataUrl
          ? { photoDataUrl: todayMeasurement.photoDataUrl }
          : {}),
        ...(todayMeasurement?.photoTakenAt != null
          ? { photoTakenAt: todayMeasurement.photoTakenAt }
          : {}),
      })
      hapticMedium()
      toast.success(
        entryClientId ? "Today’s check-in updated" : "Check-in saved"
      )
      setWeight("")
      setBodyFat("")
      setWaist("")
      setHips("")
      setChest("")
      setNotes("")
      setEntryClientId(null)
      setEntryPrepared(false)
      setEntryOpen(false)
    } catch {
      setEntryError("Could not save this measurement. Try again.")
    } finally {
      setSavingEntry(false)
    }
  }

  return (
    <div className="desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <main className="app-page pb-28">
        <header className="app-header">
          <div>
            <p className="app-eyebrow">Last 7 days</p>
            <h1 className="app-title">Progress</h1>
          </div>
          <AppTooltip
            id={APP_TOOLTIP_IDS.progressCheckIn}
            content="Add a consistent body check-in here. Two or more measurements reveal direction; one measurement is only a baseline."
            side="bottom"
            align="end"
          >
            <button
              type="button"
              onClick={openEntry}
              className="native-toolbar-button"
              aria-label="Add body measurement"
            >
              <Plus size={22} weight="bold" />
            </button>
          </AppTooltip>
        </header>

        <div
          className="app-segmented mb-5 grid grid-cols-3"
          aria-label="Progress metric"
        >
          {(["body", "nutrition", "training"] as const).map((item) => (
            <button
              key={item}
              type="button"
              data-active={metric === item}
              aria-pressed={metric === item}
              onClick={() => setMetric(item)}
              className="app-segmented-button capitalize"
            >
              {item}
            </button>
          ))}
        </div>

        {loading ? (
          <ProgressLoading />
        ) : (
          <div className="grid gap-6">
            {metric === "body" && (
              <BodyProgress
                summary={summary}
                measurements={bodyMeasurements}
                unit={unit}
                onAdd={openEntry}
              />
            )}
            {metric === "nutrition" && (
              <NutritionProgress
                summary={summary}
                calorieTarget={calorieTarget}
                proteinTarget={proteinTarget}
                onOpenDiary={() => navigate("/nutrition", { motion: "switch" })}
              />
            )}
            {metric === "training" && (
              <TrainingProgress
                summary={summary}
                onOpenTraining={() =>
                  navigate("/workouts", { motion: "switch" })
                }
              />
            )}

            <GroupedList label="Related history">
              <DisclosureRow
                title="Nutrition diary"
                detail={`${summary.nutrition.loggedDays} of 7 days logged`}
                leading={<ForkKnife size={19} />}
                onClick={() => navigate("/nutrition", { motion: "switch" })}
              />
              <DisclosureRow
                title="Training history"
                detail={`${summary.training.workouts} workouts · ${summary.training.completedSets} sets`}
                leading={<Barbell size={19} />}
                onClick={() => navigate("/workouts", { motion: "switch" })}
              />
            </GroupedList>
          </div>
        )}
      </main>

      {entryOpen && (
        <MobileSheet
          onClose={closeEntry}
          minHeight="0"
          maxHeight="88vh"
          ariaLabel="Today’s check-in"
          panelClassName="!w-[calc(100%_-_1.5rem)] !max-w-[42rem]"
          bottom={
            <div className="border-t border-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
              <PrimaryButton
                type="submit"
                form="today-check-in-form"
                disabled={savingEntry || weight.trim().length === 0}
                aria-busy={savingEntry}
                className="w-full"
              >
                {savingEntry
                  ? "Saving…"
                  : entryClientId
                    ? "Update check-in"
                    : "Complete check-in"}
              </PrimaryButton>
            </div>
          }
        >
          <form
            id="today-check-in-form"
            className="grid gap-6 px-4 pt-1 pb-6 sm:px-6"
            onSubmit={handleEntrySubmit}
          >
            <header className="flex items-start gap-4 border-b border-border pb-5">
              <div className="min-w-0 flex-1">
                <p className="native-supporting">{formatDate(today)}</p>
                <h2 className="mt-0.5 text-[24px] leading-tight font-semibold tracking-tight">
                  Today’s check-in
                </h2>
              </div>
              <ToolbarButton
                type="button"
                onClick={closeEntry}
                aria-label="Close check-in"
              >
                <X size={20} weight="bold" />
              </ToolbarButton>
            </header>

            {(todayMeasurement || previousMeasurement) && (
              <section
                className="border-y border-border py-3"
                aria-label="Check-in context"
              >
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="native-row-title">
                      {todayMeasurement ? "Today’s entry" : "Last entry"}
                    </p>
                    <p className="native-row-detail mt-0.5">
                      {todayMeasurement
                        ? "Already logged · changes update this entry"
                        : formatDate(
                            previousMeasurement?.loggedAt.slice(0, 10) ?? null
                          )}
                    </p>
                  </div>
                  <p className="native-row-value">
                    {formatWeight(
                      (todayMeasurement ?? previousMeasurement)?.weightKg ??
                        null,
                      unit
                    )}
                  </p>
                </div>
              </section>
            )}

            <fieldset>
              <legend className="native-section-title mb-3">Body</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label={`Weight (${unit})`}
                  name="progress-weight"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={weight}
                  onChange={(event) => {
                    setWeight(event.target.value)
                    if (entryError) setEntryError("")
                  }}
                  hint="Required"
                  className="text-[18px] font-semibold tabular-nums"
                  autoFocus
                  required
                />
                <FormField
                  label="Body fat %"
                  name="progress-body-fat"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={bodyFat}
                  onChange={(event) => {
                    setBodyFat(event.target.value)
                    if (entryError) setEntryError("")
                  }}
                  hint="Optional"
                />
              </div>
            </fieldset>

            <fieldset>
              <legend className="native-section-title mb-1">
                Circumference
              </legend>
              <p className="native-row-detail mb-3">Optional · centimeters</p>
              <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
                <FormField
                  label="Waist"
                  name="progress-waist"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={waist}
                  onChange={(event) => {
                    setWaist(event.target.value)
                    if (entryError) setEntryError("")
                  }}
                />
                <FormField
                  label="Hips"
                  name="progress-hips"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={hips}
                  onChange={(event) => {
                    setHips(event.target.value)
                    if (entryError) setEntryError("")
                  }}
                />
                <FormField
                  label="Chest"
                  name="progress-chest"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={chest}
                  onChange={(event) => {
                    setChest(event.target.value)
                    if (entryError) setEntryError("")
                  }}
                />
              </div>
            </fieldset>

            <label className="native-field">
              <span className="native-field-label">Journal note</span>
              <textarea
                name="progress-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Training, sleep, appetite, or anything worth remembering…"
                className="native-input min-h-24 resize-y py-3 leading-6"
              />
              <span className="native-field-hint text-right">
                {notes.length}/500
              </span>
            </label>

            {entryError && (
              <p
                role="alert"
                className="native-field-error border-l-2 border-destructive py-1 pl-3"
              >
                {entryError}
              </p>
            )}
          </form>
        </MobileSheet>
      )}
    </div>
  )
}
