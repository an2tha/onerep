import { Card } from "./ui/card"
import { MuscleBodySvg, type MuscleRecoveryItem } from "./muscle-body-svg"

export type DashboardBodyMeasurementView = {
  weightKg?: number
  bodyFatPct?: number
  waistCm?: number
  chestCm?: number
  armsCm?: number
  thighsCm?: number
}

function sparklinePoints(values: number[], width: number, height: number) {
  if (values.length === 0) return ""
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values
    .map((value, index) => {
      const x =
        values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
      const y = height - ((value - min) / range) * (height * 0.85)
      return `${x},${y}`
    })
    .join(" ")
}

export type TrendMetric =
  "bodyFatPct" | "waistCm" | "chestCm" | "armsCm" | "thighsCm"

const METRICS: Array<{ id: TrendMetric; label: string; unit: string }> = [
  { id: "bodyFatPct", label: "Body fat", unit: "%" },
  { id: "waistCm", label: "Waist", unit: "cm" },
  { id: "chestCm", label: "Chest", unit: "cm" },
  { id: "armsCm", label: "Arms", unit: "cm" },
  { id: "thighsCm", label: "Thighs", unit: "cm" },
]

function TrendChart({
  values,
  label,
  unit,
}: {
  values: number[]
  label: string
  unit: string
}) {
  const recent = values.slice(-14)
  const first = recent[0]
  const latest = recent.at(-1)
  const change =
    first === undefined || latest === undefined ? null : latest - first
  const points = sparklinePoints(recent, 260, 58)

  return (
    <div className="mt-3">
      {recent.length > 0 ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <p className="text-[1.55rem] leading-none font-extrabold tabular-nums">
              {latest?.toFixed(1)}{" "}
              <span className="text-[13px] text-muted-foreground">{unit}</span>
            </p>
            {change !== null && recent.length > 1 && (
              <p className="text-[13px] font-semibold text-muted-foreground tabular-nums">
                {change > 0 ? "+" : ""}
                {change.toFixed(1)} {unit}
              </p>
            )}
          </div>
          <svg
            viewBox="0 0 260 64"
            className="mt-2 h-16 w-full"
            role="img"
            aria-label={`${label} trend`}
          >
            <path d="M0 61H260" stroke="currentColor" strokeOpacity="0.08" />
            <polyline
              points={points}
              fill="none"
              stroke="var(--accent-progress)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {recent.map((_, index) => {
              const [x, y] = points.split(" ")[index].split(",")
              return (
                <circle
                  key={`${x}-${y}`}
                  cx={x}
                  cy={y}
                  r="2.4"
                  fill="var(--accent-progress)"
                />
              )
            })}
          </svg>
        </>
      ) : (
        <p className="py-7 text-center text-[13px] text-muted-foreground">
          Log {label.toLowerCase()} in Progress to start this trend.
        </p>
      )}
    </div>
  )
}

function BudgetChart({
  maintenance,
  budget,
}: {
  maintenance: number
  budget: number
}) {
  const deficit = Math.max(0, Math.round(maintenance - budget))

  return (
    <div
      className="mt-5"
      role="img"
      aria-label={`${Math.round(maintenance).toLocaleString()} maintenance calories minus ${deficit.toLocaleString()} planned deficit calories equals a ${Math.round(budget).toLocaleString()} calorie daily budget`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="flex min-h-20 min-w-0 flex-col items-center justify-center rounded-full border border-border bg-muted/55 px-2 text-center">
          <span className="text-[13px] font-semibold text-muted-foreground">
            Maintain
          </span>
          <strong className="mt-0.5 text-[15px] font-bold text-foreground tabular-nums">
            {Math.round(maintenance).toLocaleString()}
          </strong>
        </div>
        <span className="text-[18px] text-muted-foreground" aria-hidden="true">
          −
        </span>
        <div className="flex min-h-20 min-w-0 flex-col items-center justify-center rounded-full border border-[var(--accent-food)]/35 bg-[var(--accent-food-bg)] px-2 text-center">
          <span className="text-[13px] font-semibold text-muted-foreground">
            Deficit
          </span>
          <strong className="mt-0.5 text-[15px] font-bold text-foreground tabular-nums">
            {deficit.toLocaleString()}
          </strong>
        </div>
        <span className="text-[18px] text-muted-foreground" aria-hidden="true">
          =
        </span>
        <div className="flex min-h-20 min-w-0 flex-col items-center justify-center rounded-full bg-foreground px-2 text-center text-background">
          <span className="text-[13px] font-semibold text-background/80">
            Daily
          </span>
          <strong className="mt-0.5 text-[15px] font-bold tabular-nums">
            {Math.round(budget).toLocaleString()}
          </strong>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
        Values are daily kcal. Your budget is maintenance minus the planned
        deficit.
      </p>
    </div>
  )
}

function RecoveryChart({
  trained,
  recovering,
  ready,
}: {
  trained: number
  recovering: number
  ready: number
}) {
  const total = Math.max(1, trained + recovering + ready)
  const bars = [
    { label: "Trained", value: trained, opacity: 1 },
    { label: "Recovering", value: recovering, opacity: 0.55 },
    { label: "Ready", value: ready, opacity: 0.2 },
  ]

  return (
    <div
      className="mt-4 grid grid-cols-3 items-end gap-3"
      role="img"
      aria-label="Muscle recovery distribution"
    >
      {bars.map((bar) => (
        <div key={bar.label} className="text-center">
          <div className="flex h-20 items-end justify-center rounded-lg bg-foreground/[0.035] px-3 pt-2">
            <div
              className="w-full min-w-6 rounded-t-md bg-[var(--accent-workout)] transition-[height]"
              style={{
                height: `${bar.value === 0 ? 4 : Math.max(16, (bar.value / total) * 72)}px`,
                opacity: bar.opacity,
              }}
            />
          </div>
          <p className="mt-2 text-[13px] font-medium text-muted-foreground">
            {bar.label}
          </p>
          <p className="text-[13px] font-extrabold tabular-nums">{bar.value}</p>
        </div>
      ))}
    </div>
  )
}

export function DashboardProgressPanels({
  measurements,
  metric,
  onMetricChange,
  tdee,
  calorieTarget,
  muscleRecovery,
  weightUnit,
}: {
  measurements: DashboardBodyMeasurementView[]
  metric: TrendMetric
  onMetricChange: (metric: TrendMetric) => void
  tdee: number
  calorieTarget: number
  muscleRecovery?: MuscleRecoveryItem[]
  weightUnit: "kg" | "lbs"
}) {
  const selected = METRICS.find((item) => item.id === metric) ?? METRICS[0]
  const weightValues = measurements.flatMap((entry) =>
    typeof entry.weightKg === "number"
      ? [weightUnit === "lbs" ? entry.weightKg * 2.20462 : entry.weightKg]
      : []
  )
  const metricValues = measurements.flatMap((entry) => {
    const value = entry[metric]
    return typeof value === "number" ? [value] : []
  })
  const deficit = Math.max(0, Math.round(tdee - calorieTarget))
  const recoveryCounts = (muscleRecovery ?? []).reduce(
    (counts, item) => ({ ...counts, [item.status]: counts[item.status] + 1 }),
    { trained: 0, recovering: 0, overdue: 0 }
  )

  return (
    <section
      className="mx-[var(--app-page-x)] mt-4 md:mx-8"
      aria-label="Progress snapshot"
    >
      <Card className="overflow-hidden p-0">
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3.5">
          <div>
            <p className="app-eyebrow">Progress snapshot</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Last 14 check-ins
            </p>
          </div>
          <div className="text-right">
            <p className="text-[13px] font-bold tabular-nums">
              {calorieTarget.toLocaleString()} kcal
            </p>
            <p className="text-[11px] text-muted-foreground">
              daily target{deficit > 0 ? ` · ${deficit} deficit` : ""}
            </p>
          </div>
        </header>

        <div className="grid md:grid-cols-2 md:divide-x md:divide-y-0 divide-border">
          <div className="border-b border-border px-4 pt-4 pb-2 md:border-b-0">
            <p className="text-[13px] font-semibold text-muted-foreground">
              Weight
            </p>
            <TrendChart values={weightValues} label="Weight" unit={weightUnit} />
          </div>

          <div className="px-4 pt-3 pb-2 md:pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-muted-foreground">
                {selected.label}
              </p>
              <label>
                <span className="sr-only">Choose dashboard metric</span>
                <select
                  value={metric}
                  onChange={(event) =>
                    onMetricChange(event.target.value as TrendMetric)
                  }
                  className="h-9 rounded-md border-0 bg-muted px-2 text-[12px] font-semibold"
                >
                  {METRICS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <TrendChart
              values={metricValues}
              label={selected.label}
              unit={selected.unit}
            />
          </div>
        </div>
      </Card>

      {muscleRecovery && (
        <Card className="h-full p-4">
          <div>
            <p className="app-eyebrow">Muscle recovery</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Recovery distribution across tracked muscle groups
            </p>
          </div>
          {muscleRecovery.length > 0 ? (
            <div className="mt-2 grid grid-cols-[5.5rem_1fr] items-center gap-4">
              <MuscleBodySvg
                recovery={muscleRecovery}
                className="h-36 w-full text-foreground"
              />
              <RecoveryChart
                trained={recoveryCounts.trained}
                recovering={recoveryCounts.recovering}
                ready={recoveryCounts.overdue}
              />
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-muted-foreground">
              Finish a workout to start the recovery chart.
            </p>
          )}
        </Card>
      )}
    </section>
  )
}
