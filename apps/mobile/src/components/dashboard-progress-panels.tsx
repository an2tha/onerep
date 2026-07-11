import { Card } from "@repo/ui"
import { sparklinePoints } from "@/lib/progress-metrics"
import type { BodyMeasurementEntry } from "@/lib/body-progress"
import type { MuscleRecovery } from "@/lib/muscle-volume"
import { MuscleBodySvg } from "@/components/muscle-body-svg"

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
              <span className="text-[11px] text-muted-foreground/55">
                {unit}
              </span>
            </p>
            {change !== null && recent.length > 1 && (
              <p className="text-[10px] font-bold text-muted-foreground/60 tabular-nums">
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
        <p className="py-7 text-center text-[11px] font-semibold text-muted-foreground/45">
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
  const safeMaintenance = Math.max(maintenance, budget, 1)
  const budgetWidth = Math.min(100, (budget / safeMaintenance) * 100)

  return (
    <div
      className="mt-4"
      role="img"
      aria-label="Calorie budget compared with maintenance"
    >
      <div className="relative h-12 overflow-hidden rounded-xl bg-foreground/[0.045]">
        <div
          className="h-full rounded-xl bg-[var(--accent-food)] opacity-80"
          style={{ width: `${budgetWidth}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-between px-3 text-[9px] font-bold">
          <span className="text-background">Daily budget</span>
          <span className="text-muted-foreground/55">Maintenance</span>
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-bold text-muted-foreground/55 tabular-nums">
        <span>{budget.toLocaleString()} kcal</span>
        <span>{maintenance.toLocaleString()} kcal</span>
      </div>
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
          <p className="mt-2 text-[10px] font-bold text-muted-foreground/55">
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
  measurements: BodyMeasurementEntry[]
  metric: TrendMetric
  onMetricChange: (metric: TrendMetric) => void
  tdee: number
  calorieTarget: number
  muscleRecovery: MuscleRecovery[]
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
  const weeklyKg = (deficit * 7) / 7700
  const recoveryCounts = muscleRecovery.reduce(
    (counts, item) => ({ ...counts, [item.status]: counts[item.status] + 1 }),
    { trained: 0, recovering: 0, overdue: 0 }
  )

  return (
    <section
      className="mx-[var(--app-page-x)] mt-3 grid gap-3 md:mx-8 md:grid-cols-2"
      aria-label="Progress trends"
    >
      <Card className="p-4">
        <div>
          <p className="app-eyebrow">Calorie budget</p>
          <p className="mt-1 text-[1.55rem] leading-none font-extrabold tabular-nums">
            {calorieTarget.toLocaleString()} kcal
          </p>
        </div>
        <BudgetChart
          maintenance={tdee || calorieTarget}
          budget={calorieTarget}
        />
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 rounded-xl bg-foreground/[0.035] p-3 text-center">
          <div>
            <p className="text-[9px] font-bold text-muted-foreground/50">
              Maintain
            </p>
            <p className="text-[13px] font-extrabold tabular-nums">
              {tdee || calorieTarget}
            </p>
          </div>
          <span className="text-muted-foreground/35">−</span>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground/50">
              Deficit
            </p>
            <p className="text-[13px] font-extrabold tabular-nums">{deficit}</p>
          </div>
          <span className="text-muted-foreground/35">=</span>
          <div>
            <p className="text-[9px] font-bold text-muted-foreground/50">
              Budget
            </p>
            <p className="text-[13px] font-extrabold tabular-nums">
              {calorieTarget}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[10px] font-semibold text-muted-foreground/52">
          {deficit > 0
            ? `About ${weeklyKg.toFixed(2)} kg/week at the estimated rate.`
            : "Maintenance budget — no planned deficit."}
        </p>
      </Card>

      <Card className="h-full p-4">
        <div>
          <p className="app-eyebrow">Weight trend</p>
          <p className="text-[11px] font-semibold text-muted-foreground/50">
            Last 14 check-ins
          </p>
        </div>
        <TrendChart values={weightValues} label="Weight" unit={weightUnit} />
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="app-eyebrow">Other metric</p>
            <p className="text-[11px] font-semibold text-muted-foreground/50">
              Choose what appears here
            </p>
          </div>
          <label>
            <span className="sr-only">Choose dashboard metric</span>
            <select
              value={metric}
              onChange={(event) =>
                onMetricChange(event.target.value as TrendMetric)
              }
              className="h-9 rounded-lg border border-border/60 bg-background px-3 py-0 text-[11px] font-bold"
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
      </Card>

      <Card className="h-full p-4">
        <div>
          <p className="app-eyebrow">Muscle recovery</p>
          <p className="mt-1 text-[11px] font-semibold text-muted-foreground/50">
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
          <p className="py-10 text-center text-[11px] font-semibold text-muted-foreground/45">
            Finish a workout to start the recovery chart.
          </p>
        )}
      </Card>
    </section>
  )
}
