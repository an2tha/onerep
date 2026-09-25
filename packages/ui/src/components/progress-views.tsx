import { Message, choice, tr, uiLocale } from "@repo/ui/i18n"
import { Barbell, CheckCircle, ForkKnife, Scales } from "@phosphor-icons/react"
import type { ReactNode } from "react"

import { MetricTooltip } from "./app-feedback"
import { PrimaryButton } from "./mobile-ui"
import { energyDisplay, useEnergyUnitLabel } from "../lib/energy-unit"

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
    measurements: ProgressMeasurementView[]
  }
}
export type ProgressMeasurementView = {
  key: string
  label: string
  unit: "kg" | "cm" | "kcal"
  group: "composition" | "tape"
  latest: number
  latestDate: string
  delta: number | null
  readings: number
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
  if (deltaKg == null) return tr("Not enough data")
  const value = unit === "lbs" ? deltaKg * 2.20462 : deltaKg
  const prefix = value > 0 ? "+" : ""
  return `${prefix}${value.toFixed(1)} ${unit}`
}

function formatMeasurement(
  value: number,
  unit: ProgressMeasurementView["unit"],
  weightUnit: ProgressWeightUnit
) {
  if (unit === "kg") return formatProgressWeight(value, weightUnit)
  if (unit === "kcal")
    return `${Math.round(value).toLocaleString(uiLocale())} kcal`
  return `${value.toFixed(1)} cm`
}

function formatMeasurementDelta(
  measurement: ProgressMeasurementView,
  weightUnit: ProgressWeightUnit
) {
  if (measurement.delta == null) {
    return measurement.group === "composition"
      ? tr("One reading so far")
      : tr("One measurement so far")
  }
  const shown =
    measurement.unit === "kg"
      ? formatWeightDelta(measurement.delta, weightUnit)
      : measurement.unit === "kcal"
        ? signed(Math.round(measurement.delta), " kcal")
        : signed(Number(measurement.delta.toFixed(1)), " cm")
  return tr("{{value0}} across {{value1}} readings", {
    value0: shown,
    value1: measurement.readings,
  })
}

export function formatProgressDate(date: string | null) {
  if (!date) return tr("No check-in")
  return new Intl.DateTimeFormat(uiLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`))
}

function signed(value: number, suffix = "") {
  return `${value > 0 ? "+" : ""}${value.toLocaleString(uiLocale())}${suffix}`
}

function comparisonText(value: number, noun: string) {
  if (value === 0)
    return tr("Same {{value0}} as the prior 7 days", { value0: noun })
  return tr("{{value0}} {{value1}} {{value2}} than the prior 7 days", {
    value0: Math.abs(value),
    value1: noun,
    value2: choice(value > 0 ? "more" : "fewer"),
  })
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
      aria-label={tr(
        "Seven-day nutrition chart. Orange bars show calories as a percentage of the daily target. Purple dots mark days reaching at least 90 percent of the protein target."
      )}
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
                  ? tr(
                      "{{value0}}: {{value1}} {{value2}} and {{value3}} g protein",
                      {
                        value0: day.date,
                        value1: energyDisplay(
                          day.nutrition.calories,
                          energyUnit
                        ),
                        value2: energyUnit,
                        value3: Math.round(day.nutrition.protein),
                      }
                    )
                  : tr("{{value0}}: no food logged", { value0: day.date })
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
        {tr(
          "Orange = calories versus target. Purple dot = protein target reached. Empty days are not counted as zero-calorie days."
        )}
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
      aria-label={tr(
        "Seven-day training chart. Purple bar height represents completed sets for each day."
      )}
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
                  ? tr(
                      "{{value0}}: {{value1}} workout{{value2}}, {{value3}} completed sets",
                      {
                        value0: day.date,
                        value1: day.training.workouts,
                        value2: day.training.workouts === 1 ? "" : "s",
                        value3: day.training.completedSets,
                      }
                    )
                  : tr("{{value0}}: no workout logged", { value0: day.date })
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
        {tr(
          "Bar height compares completed sets within this week. It does not compare weight lifted or exercise difficulty."
        )}
      </ChartLegend>
    </div>
  )
}

export function MetricHeading({
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

export function InsightRow({
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

export function Interpretation({ children }: { children: ReactNode }) {
  return (
    <section
      className="progress-tab-enter progress-interpretation border-y border-border bg-muted/25 px-4 py-4"
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
          <h3 className="text-[15px] font-semibold">{tr("What to do next")}</h3>
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
            aria-label={tr(
              "{{value0}} body-weight check-ins from {{value1}} to {{value2}}",
              {
                value0: values.length,
                value1: summary.body.weightPoints[0]?.date,
                value2: summary.body.weightPoints.at(-1)?.date,
              }
            )}
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
            {tr("Add a second check-in to reveal a trend.")}
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
  const composition = summary.body.measurements.filter(
    (measurement) => measurement.group === "composition"
  )
  const tape = summary.body.measurements.filter(
    (measurement) => measurement.group === "tape"
  )
  const guidance =
    summary.body.weightPoints.length === 0
      ? tr(
          "Add a baseline measurement. Progress needs at least two comparable check-ins before it can describe direction."
        )
      : summary.body.weightPoints.length === 1
        ? tr(
            "Add another check-in after several days under similar conditions. One measurement is a baseline, not a trend."
          )
        : daysSinceCheckIn != null && daysSinceCheckIn >= 8
          ? tr(
              "Your latest check-in is {{value0}} days old. Add a current measurement before acting on the trend.",
              { value0: daysSinceCheckIn }
            )
          : tr(
              "Keep check-ins under similar conditions and judge the multi-check-in direction, not a single day’s fluctuation."
            )

  return (
    <div className="grid gap-5">
      <section
        className="progress-tab-enter app-surface px-4 py-4"
        aria-label={tr("Body progress")}
      >
        <MetricHeading
          icon={<Scales size={20} />}
          title={tr("Weight trend")}
          tooltip={tr(
            "The change uses the oldest and newest of your latest 12 valid weight check-ins. Weekly pace normalizes that change by the number of elapsed days."
          )}
        />
        <p className="mt-4 text-[2rem] leading-none font-bold tracking-tight tabular-nums">
          {formatProgressWeight(summary.body.latestWeightKg, unit)}
        </p>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {summary.body.weightDeltaKg == null
            ? tr("Add at least two weight check-ins")
            : tr("{{value0}} across {{value1}} days", {
                value0: formatWeightDelta(summary.body.weightDeltaKg, unit),
                value1: summary.body.weightTrendDays,
              })}
        </p>
        <WeightChart summary={summary} />
      </section>

      <section
        className="progress-tab-enter"
        style={{ animationDelay: "60ms" }}
        aria-label={tr("Body insights")}
      >
        <h2 className="native-section-title mb-1">{tr("Body insights")}</h2>
        <div className="border-y border-border">
          <InsightRow
            label={tr("Weekly pace")}
            value={formatWeightDelta(summary.body.weeklyWeightDeltaKg, unit)}
            detail={tr("Normalized from your check-in trend")}
            tooltip={tr(
              "This is not a prediction. It is the observed change between your oldest and newest displayed check-ins, divided by elapsed time and expressed per seven days."
            )}
          />
          <InsightRow
            label={tr("Body fat")}
            value={
              summary.body.latestBodyFatPct == null
                ? tr("Not logged")
                : `${summary.body.latestBodyFatPct.toFixed(1)}%`
            }
            detail={
              summary.body.bodyFatDeltaPct == null
                ? tr("Two estimates are needed for change")
                : tr("{{value0}} across recorded estimates", {
                    value0: signed(
                      Number(summary.body.bodyFatDeltaPct.toFixed(1)),
                      " pts"
                    ),
                  })
            }
            tooltip={tr(
              "Consumer body-fat estimates can vary with hydration and device. Use the same method and focus on the longer-term direction."
            )}
          />
          <InsightRow
            label={tr("Waist")}
            value={
              summary.body.latestWaistCm == null
                ? tr("Not logged")
                : `${summary.body.latestWaistCm.toFixed(1)} cm`
            }
            detail={
              summary.body.waistDeltaCm == null
                ? tr("Two measurements are needed for change")
                : tr("{{value0}} across recorded measurements", {
                    value0: signed(
                      Number(summary.body.waistDeltaCm.toFixed(1)),
                      " cm"
                    ),
                  })
            }
            tooltip={tr(
              "Measure at the same anatomical point, posture, and time of day. Small differences can be measurement noise."
            )}
          />
          <InsightRow
            label={tr("Latest check-in")}
            value={
              daysSinceCheckIn == null
                ? "—"
                : tr("{{value0}}d ago", { value0: daysSinceCheckIn })
            }
            detail={formatProgressDate(summary.body.latestCheckInDate)}
          />
        </div>
      </section>

      {/* Whatever else has been recorded, and only that. A smart scale that
          reports lean and bone mass gets a section; a tape measure gets the
          other; someone with neither gets no empty rows telling them so. */}
      {composition.length > 0 && (
        <section
          className="progress-tab-enter"
          style={{ animationDelay: "90ms" }}
          aria-label={tr("Body composition")}
        >
          <h2 className="native-section-title mb-1">
            {tr("Body composition")}
          </h2>
          <div className="border-y border-border">
            {composition.map((measurement) => (
              <InsightRow
                key={measurement.key}
                label={measurement.label}
                value={formatMeasurement(
                  measurement.latest,
                  measurement.unit,
                  unit
                )}
                detail={formatMeasurementDelta(measurement, unit)}
                tooltip={
                  measurement.key === "basalMetabolicRateKcal"
                    ? tr(
                        "What your body burns at rest, as your scale estimates it. A useful sanity check on a calorie target, not a number to eat to."
                      )
                    : tr(
                        "Scale estimates of composition move with hydration and the time of day. Read the direction over weeks, not the figure on one morning."
                      )
                }
              />
            ))}
          </div>
        </section>
      )}

      {tape.length > 0 && (
        <section
          className="progress-tab-enter"
          style={{ animationDelay: "100ms" }}
          aria-label={tr("Tape measurements")}
        >
          <h2 className="native-section-title mb-1">{tr("Measurements")}</h2>
          <div className="border-y border-border">
            {tape.map((measurement) => (
              <InsightRow
                key={measurement.key}
                label={measurement.label}
                value={formatMeasurement(
                  measurement.latest,
                  measurement.unit,
                  unit
                )}
                detail={formatMeasurementDelta(measurement, unit)}
              />
            ))}
          </div>
        </section>
      )}

      <Interpretation>{guidance}</Interpretation>

      <PrimaryButton onClick={onAdd} className="w-full">
        {tr("Add measurement")}
      </PrimaryButton>

      {recentMeasurements.length > 0 && (
        <section
          className="progress-tab-enter"
          style={{ animationDelay: "160ms" }}
          aria-label={tr("Recent body check-ins")}
        >
          <h2 className="native-section-title mb-1">
            {tr("Recent check-ins")}
          </h2>
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
                      ? tr("{{value0}}% body fat", {
                          value0: measurement.bodyFatPct.toFixed(1),
                        })
                      : tr("Weight check-in")}
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
      ? tr(
          "Only {{value0}} of 7 days contain food logs. Log at least four representative days before using the averages to change your plan.",
          { value0: logged }
        )
      : summary.nutrition.proteinTargetDays < Math.ceil(logged / 2)
        ? tr(
            "Protein reached at least 90% of target on {{value0}} of {{value1}} logged days. Plan a reliable protein source earlier in the day.",
            { value0: summary.nutrition.proteinTargetDays, value1: logged }
          )
        : summary.nutrition.calorieTargetDays < Math.ceil(logged / 2)
          ? tr(
              "Calories landed within 80–120% of target on {{value0}} of {{value1}} logged days. Review the outlier days before changing the target.",
              { value0: summary.nutrition.calorieTargetDays, value1: logged }
            )
          : tr(
              "Logging coverage and target consistency are strong enough to review alongside your body trend. Keep the plan stable unless the longer-term outcome disagrees."
            )

  return (
    <div className="grid gap-5">
      <section
        className="progress-tab-enter app-surface px-4 py-4"
        aria-label={tr("Nutrition progress")}
      >
        <MetricHeading
          icon={<ForkKnife size={20} />}
          title={tr("Average intake")}
          tooltip={tr(
            "Averages include only days with at least one food entry. Unlogged days are excluded rather than treated as zero intake."
          )}
        />
        <p className="mt-4 text-[2rem] leading-none font-bold tracking-tight tabular-nums">
          {logged > 0
            ? tr("{{value0}} {{value1}}", {
                value0: energyDisplay(
                  summary.nutrition.averageCalories,
                  energyUnit
                ).toLocaleString(uiLocale()),
                value1: energyUnit,
              })
            : tr("No data")}
        </p>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {summary.nutrition.calorieDeltaFromTarget == null
            ? tr("Daily target {{value0}} {{value1}}", {
                value0: energyDisplay(calorieTarget, energyUnit).toLocaleString(
                  uiLocale()
                ),
                value1: energyUnit,
              })
            : tr("{{value0}} versus target on logged days", {
                value0: signed(
                  energyDisplay(
                    summary.nutrition.calorieDeltaFromTarget,
                    energyUnit
                  ),
                  ` ${energyUnit}`
                ),
              })}
        </p>
        <NutritionWeekBars days={summary.days} />
      </section>

      <section
        className="progress-tab-enter"
        style={{ animationDelay: "60ms" }}
        aria-label={tr("Nutrition insights")}
      >
        <h2 className="native-section-title mb-1">
          {tr("Nutrition insights")}
        </h2>
        <div className="border-y border-border">
          <InsightRow
            label={tr("Logging coverage")}
            value={tr("{{value0}}/7 days", { value0: logged })}
            detail={
              logged >= 4
                ? tr("Enough coverage for a directional weekly view")
                : tr("Low coverage; averages may not represent the week")
            }
            tooltip={tr(
              "Four logged days is used here as a practical confidence cue, not a scientific threshold. Include typical weekdays and weekends when possible."
            )}
          />
          <InsightRow
            label={tr("Calorie consistency")}
            value={`${summary.nutrition.calorieTargetDays}/${Math.max(1, logged)}`}
            detail={tr("Logged days within 80–120% of target")}
            tooltip={tr(
              "The range is deliberately broad to identify major outliers. It is not a pass/fail judgment and does not replace goal calibration."
            )}
          />
          <InsightRow
            label={tr("Protein consistency")}
            value={`${summary.nutrition.proteinTargetDays}/${Math.max(1, logged)}`}
            detail={tr("Days reaching at least 90% of {{value0}} g", {
              value0: proteinTarget,
            })}
            tooltip={tr(
              "A day counts when recorded protein reaches at least 90% of the current target. Unlogged days are excluded."
            )}
          />
          <InsightRow
            label={tr("Average macros")}
            value={`${summary.nutrition.averageProtein}P · ${summary.nutrition.averageCarbs}C · ${summary.nutrition.averageFat}F`}
            detail={tr("Grams per logged day")}
          />
          <InsightRow
            label={tr("Prior-week change")}
            value={
              summary.nutrition.averageCalorieChange == null
                ? tr("No comparison")
                : signed(
                    energyDisplay(
                      summary.nutrition.averageCalorieChange,
                      energyUnit
                    ),
                    ` ${energyUnit}`
                  )
            }
            detail={
              summary.nutrition.previousAverageCalories == null
                ? tr("No food was logged in the prior 7 days")
                : tr(
                    "Prior average {{value0}} {{value1}} across {{value2}} logged days",
                    {
                      value0: energyDisplay(
                        summary.nutrition.previousAverageCalories,
                        energyUnit
                      ).toLocaleString(uiLocale()),
                      value1: energyUnit,
                      value2: summary.nutrition.previousLoggedDays,
                    }
                  )
            }
            tooltip={tr(
              "This compares average calories per logged day. Large changes can reflect different logging coverage, so check the day counts before interpreting it."
            )}
          />
        </div>
      </section>

      <Interpretation>{guidance}</Interpretation>
      <PrimaryButton onClick={onOpenDiary} className="w-full">
        {tr("Open nutrition diary")}
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
      ? tr(
          "No workout was completed in the last 7 days. Start the next planned session; a single completed workout is more useful than an arbitrary activity score."
        )
      : summary.training.activeDays === 1
        ? tr(
            "Training is concentrated on one day. If your plan calls for more sessions, schedule the next one now rather than chasing extra sets today."
          )
        : summary.training.completedSetChange > 6
          ? tr(
              "Completed-set volume rose meaningfully from the prior week. Keep recovery and exercise quality stable before increasing it again."
            )
          : tr(
              "Use completed sets and active days to check plan execution. Exercise difficulty and load still matter, so review session history before changing volume."
            )

  return (
    <div className="grid gap-5">
      <section
        className="progress-tab-enter app-surface px-4 py-4"
        aria-label={tr("Training progress")}
      >
        <MetricHeading
          icon={<Barbell size={20} />}
          title={tr("Completed-set volume")}
          tooltip={tr(
            "This counts sets marked complete during the last 7 days. It is a simple consistency proxy and does not account for weight, reps, proximity to failure, or exercise difficulty."
          )}
        />
        <p className="mt-4 text-[2rem] leading-none font-bold tracking-tight tabular-nums">
          <Message
            text={"{{value0}} sets"}
            values={{ value0: summary.training.completedSets }}
          />
        </p>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {comparisonText(summary.training.completedSetChange, "set")}
        </p>
        <TrainingWeekBars days={summary.days} />
      </section>

      <section
        className="progress-tab-enter"
        style={{ animationDelay: "60ms" }}
        aria-label={tr("Training insights")}
      >
        <h2 className="native-section-title mb-1">{tr("Training insights")}</h2>
        <div className="border-y border-border">
          <InsightRow
            label={tr("Sessions")}
            value={`${summary.training.workouts}`}
            detail={comparisonText(summary.training.workoutChange, "session")}
          />
          <InsightRow
            label={tr("Active days")}
            value={`${summary.training.activeDays}/7`}
            detail={tr("Calendar days with at least one completed workout")}
            tooltip={tr(
              "Multiple sessions on one day count as one active day. This helps distinguish training frequency from session count."
            )}
          />
          <InsightRow
            label={tr("Training time")}
            value={`${summary.training.durationMinutes} min`}
            detail={tr("Total recorded session duration")}
            tooltip={tr(
              "This is elapsed workout time, not time under tension. Pauses and incomplete timer data can affect it."
            )}
          />
          <InsightRow
            label={tr("Sets per session")}
            value={`${summary.training.averageSetsPerWorkout}`}
            detail={tr("Completed sets divided by recorded sessions")}
            tooltip={tr(
              "Use this to spot unusually short or dense weeks. It does not indicate whether those sets were appropriate for a specific muscle group."
            )}
          />
        </div>
      </section>

      <Interpretation>{guidance}</Interpretation>
      <PrimaryButton onClick={onOpenTraining} className="w-full">
        {tr("Open training")}
      </PrimaryButton>
    </div>
  )
}

export function ProgressLoading() {
  return (
    <div
      className="grid gap-4"
      aria-busy="true"
      aria-label={tr("Loading progress")}
    >
      <div className="app-surface h-64 animate-pulse bg-muted/50" />
      <div className="h-52 animate-pulse border-y border-border bg-muted/30" />
    </div>
  )
}
