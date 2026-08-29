import { Heartbeat } from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
  EmptyState,
  InsightRow,
  Interpretation,
  MetricHeading,
  PrimaryButton,
} from "@repo/ui"
import { formatHours } from "@/pages/health/shared"
import { isHealthSyncSupportedPlatform } from "@/lib/health-provider"

/**
 * Health, as the fourth track of the week.
 *
 * Progress reported on what you ate, what you lifted and what you weighed,
 * and said nothing about the seven nights of sleep and the hundred thousand
 * steps the phone had been quietly filing the whole time. The Health page
 * owns the detail — the dials, the trends, the advice — so this stays a
 * week-in-review of the same numbers: the score, what carried it, and what
 * moved against the week before.
 *
 * Nothing is scored here. `dashboard` computes the score and the pillars and
 * `series` computes the week-over-week comparison; recomputing either in the
 * browser is how two pages end up disagreeing about one number.
 */

export type HealthDashboard = NonNullable<
  ReturnType<typeof useQuery<typeof api.logs.healthMetrics.dashboard>>
>
export type HealthWeekSeries = NonNullable<
  ReturnType<typeof useQuery<typeof api.logs.healthMetrics.series>>
>

type WeekMetric = HealthWeekSeries["metrics"][keyof HealthWeekSeries["metrics"]]

const BAND_COPY: Record<HealthDashboard["band"], string> = {
  excellent: "Excellent",
  solid: "Solid",
  fair: "Fair",
  poor: "Needs work",
  unknown: "No reading",
}

const RECOVERY_COPY: Record<HealthDashboard["recovery"]["status"], string> = {
  ready: "Ready to train",
  steady: "Steady",
  compromised: "Under-recovered",
  unknown: "No baseline yet",
}

/** The rows on the comparison list, in the order a coach would read them. */
const WEEK_ROWS: Array<{
  id: string & keyof HealthWeekSeries["metrics"]
  tooltip?: string
}> = [
  {
    id: "sleep",
    tooltip:
      "Time asleep, not time in bed, credited to the day you woke up. The comparison is against your average for the seven days before.",
  },
  { id: "steps" },
  {
    id: "exercise",
    tooltip:
      "Minutes of recorded sessions from your health store, so runs and classes logged elsewhere count too.",
  },
  { id: "energy" },
  {
    id: "restingHeartRate",
    tooltip:
      "Lower is usually better. A resting rate creeping up over a week is one of the earlier signs of under-recovery or coming down with something.",
  },
  {
    id: "hrv",
    tooltip:
      "Heart rate variability, in your phone's own statistic. Only compare it against your own history — the number is not comparable between devices.",
  },
  {
    id: "recovery",
    tooltip:
      "A daily readiness score from sleep, resting heart rate and HRV against your own 28-day baseline.",
  },
]

export function formatWeekValue(metric: WeekMetric) {
  if (metric.average === null) return "—"
  if (metric.id === "sleep" || metric.id === "exercise") {
    return formatHours(metric.average)
  }
  const rounded = Math.round(metric.average).toLocaleString("en-US")
  return metric.unit ? `${rounded} ${metric.unit}` : rounded
}

/**
 * "+12% vs prior 7 days", or the reason there is no comparison.
 *
 * The sign carries the direction and nothing colours it: a resting heart rate
 * that fell 4% is good news and a step count that fell 4% is not, and a delta
 * chip that pretends to know which is which is wrong for the person in a
 * gaining phase.
 */
export function formatWeekChange(metric: WeekMetric) {
  if (metric.average === null) return "Nothing recorded this week"
  if (metric.previousAverage === null || metric.deltaPercent === null) {
    return "No prior week to compare"
  }
  const rounded = Math.round(metric.deltaPercent)
  if (rounded === 0) return "Level with the prior 7 days"
  return `${rounded > 0 ? "+" : ""}${rounded}% vs prior 7 days`
}

export function HealthProgress({
  dashboard,
  series,
  onOpenHealth,
  onOpenSettings,
}: {
  dashboard: HealthDashboard | null
  series: HealthWeekSeries | null
  onOpenHealth: () => void
  onOpenSettings: () => void
}) {
  if (!dashboard || dashboard.score === null || !series) {
    return (
      <EmptyState
        icon={Heartbeat}
        title="Nothing to read yet"
        detail={
          isHealthSyncSupportedPlatform()
            ? "Connect Apple Health or Health Connect and give it a few days. The week needs readings before it has anything to compare."
            : "This tab reads the health store on your phone. Open OneRep on iOS or Android with health sync on and the numbers will follow."
        }
        action={
          <PrimaryButton onClick={onOpenSettings}>
            Open health settings
          </PrimaryButton>
        }
      />
    )
  }

  const recovery = dashboard.recovery
  const recommendation = dashboard.recommendations[0]
  const guidance = recommendation
    ? `${recommendation.title.replace(/[.!]?$/, ".")} ${recommendation.detail}`
    : (dashboard.narrative?.body ??
      "Keep the sync running. A week of readings is the minimum before any of this means anything.")

  return (
    <div className="grid gap-5">
      <section
        className="progress-tab-enter app-surface px-4 py-4"
        aria-label="Health score"
      >
        <MetricHeading
          icon={<Heartbeat size={20} />}
          title="Health score"
          tooltip="Sleep, steps, exercise minutes, active energy and cardio fitness, each graded against a target and weighted into one number over the last seven days. Pillars with no readings are left out rather than scored as zero."
        />
        <p className="mt-4 text-[2rem] leading-none font-bold tracking-tight tabular-nums">
          {dashboard.score}
          <span className="ml-1.5 text-[15px] font-semibold text-muted-foreground">
            / 100
          </span>
        </p>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {BAND_COPY[dashboard.band]}
          {dashboard.narrative ? ` · ${dashboard.narrative.headline}` : ""}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
          {dashboard.measuredDays} of {dashboard.windowDays} days measured
        </p>
      </section>

      <section
        className="progress-tab-enter"
        style={{ animationDelay: "60ms" }}
        aria-label="Health this week"
      >
        <h2 className="native-section-title mb-1">This week</h2>
        <div className="border-y border-border">
          {WEEK_ROWS.map((row) => {
            const metric = series.metrics[row.id]
            return (
              <InsightRow
                key={row.id}
                label={metric.label}
                value={formatWeekValue(metric)}
                detail={formatWeekChange(metric)}
                tooltip={row.tooltip}
              />
            )
          })}
          {/* The row above is the week's average; this one is this morning.
              Same instrument, different day, and the label has to say so. */}
          <InsightRow
            label="Recovery today"
            value={
              dashboard.recoveryScore === null
                ? "—"
                : String(dashboard.recoveryScore)
            }
            detail={
              recovery.notes[0] ??
              `${RECOVERY_COPY[recovery.status]} · ${recovery.days} of ${recovery.windowDays} baseline days`
            }
            tooltip="Today's readiness against your own 28-day baseline. It needs about a week of sleep and heart readings before it says anything."
          />
        </div>
      </section>

      <Interpretation>{guidance}</Interpretation>

      <PrimaryButton onClick={onOpenHealth} className="w-full">
        Open health
      </PrimaryButton>
    </div>
  )
}
