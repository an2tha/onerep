import { useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import { useEnergyUnit } from "@/lib/use-energy-unit"
import { healthProviderLabel } from "@/lib/health-provider"
import { platformMetric } from "../../../../../convex/lib/platformHealthMetrics"
import {
  HEALTH_DIALS,
  HEALTH_DIAL_BY_KEY,
  healthDialForCustomMetric,
} from "../../../../../convex/lib/healthMetricCatalog"
import {
  AREA_TONES,
  CustomMetricTrend,
  HealthDetailShell,
  MetricTrend,
  RangeToggle,
  buildCustomMetricSeries,
  formatCount,
  formatHours,
  type CustomMetricDefinition,
  type HealthMetricId,
  type RangeKey,
} from "./shared"

/**
 * Every series, over one window.
 *
 * The tabs are gone. They split seven charts across three panels, which meant
 * two taps to answer "did my sleep and my resting heart rate move together"
 * — the one question a trends screen exists for, and the one the old layout
 * made hardest. One range control drives all of them, because comparing
 * signals over different windows is not a comparison.
 *
 * It is also the complete inventory. Every other Health screen hides a metric
 * with nothing in it; this one does not, because a list of what you are not
 * measuring is the only reading some of these will ever give you.
 */
const CHARTS: Array<{
  metric: HealthMetricId
  title: string
  kind: "bars" | "line"
  format: (value: number) => string
  tone: string
}> = [
  {
    metric: "recovery",
    title: "Recovery score",
    kind: "bars",
    format: formatCount,
    tone: AREA_TONES.recovery,
  },
  {
    metric: "sleep",
    title: "Sleep",
    kind: "bars",
    format: formatHours,
    tone: AREA_TONES.sleep,
  },
  {
    metric: "hrv",
    title: "Heart rate variability",
    kind: "line",
    format: (value) => `${formatCount(value)}ms`,
    tone: AREA_TONES.heart,
  },
  {
    metric: "restingHeartRate",
    title: "Resting heart rate",
    kind: "line",
    format: (value) => `${formatCount(value)}bpm`,
    tone: AREA_TONES.heart,
  },
  {
    metric: "exercise",
    title: "Exercise minutes",
    kind: "bars",
    format: formatHours,
    tone: AREA_TONES.activity,
  },
  {
    metric: "steps",
    title: "Steps",
    kind: "bars",
    format: formatCount,
    tone: AREA_TONES.activity,
  },
  {
    metric: "energy",
    title: "Active calories",
    kind: "bars",
    // Unitless here on purpose: the unit label is a per-user preference, so
    // the render site appends it where the hook can be called.
    format: formatCount,
    tone: AREA_TONES.activity,
  },
  {
    metric: "weight",
    title: "Weight",
    kind: "line",
    format: (value) => `${value.toFixed(1)}kg`,
    tone: AREA_TONES.recovery,
  },
  {
    metric: "bodyFat",
    title: "Body fat",
    kind: "line",
    format: (value) => `${value.toFixed(1)}%`,
    tone: AREA_TONES.activity,
  },
]

const RANGE_CAPTION: Record<RangeKey, string> = {
  W: "the last seven days, one bar a day",
  M: "the last thirty days, one bar a day",
  Y: "the last year, averaged by week",
}

/**
 * Entries per metric, not in total.
 *
 * The ceiling on the underlying query is 90, and asking for it costs nothing
 * over the thirty the other screens take: these rows are two numbers and a
 * date. A year window with more than 90 logged days will draw the most recent
 * 90 of them, which is a limit of `customProgressMetrics.list` rather than
 * something worth a second query to work around.
 */
const ENTRY_DAYS = 90

export default function HealthTrends() {
  const today = currentDateKey()
  const energyUnit = useEnergyUnit()
  const [range, setRange] = useState<RangeKey>("M")
  const custom = useQuery(api.customProgressMetrics.list, { days: ENTRY_DAYS })

  const { measured, dataless } = useMemo(() => {
    const measured: CustomMetricDefinition[] = []
    const dataless: CustomMetricDefinition[] = []
    for (const row of custom ?? []) {
      const metric: CustomMetricDefinition = {
        id: row._id,
        title: row.title,
        unit: row.unit,
        kind: row.kind,
        accent: row.accent,
        healthMetricKey: row.healthMetricKey,
        tab: row.tab,
        entries: row.entries.map((entry) => ({
          date: entry.date,
          value: entry.value,
        })),
      }
      // Split on the window rather than on "has ever been logged". A metric
      // someone kept for a fortnight in March has no bearing on this week, and
      // charting its flat nothing next to a live series reads as a fault.
      const series = buildCustomMetricSeries({
        entries: metric.entries,
        today,
        range,
      })
      if (series) measured.push(metric)
      else dataless.push(metric)
    }
    return { measured, dataless }
  }, [custom, today, range])

  return (
    <HealthDetailShell title="Trends" subtitle="Against your own history">
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-1 py-4">
        <p className="text-[13px] text-muted-foreground">
          {RANGE_CAPTION[range]}
        </p>
        <RangeToggle range={range} onChange={setRange} />
      </div>

      {/* Keyed on the range so the charts re-enter together rather than each
          animating its own width change. */}
      <div key={range} className="grid gap-5 lg:block lg:columns-2 lg:gap-8">
        {CHARTS.map((chart) => (
          <MetricTrend
            key={chart.metric}
            today={today}
            metric={chart.metric}
            kind={chart.kind}
            title={chart.title}
            format={
              chart.metric === "energy"
                ? (value: number) => `${chart.format(value)} ${energyUnit}`
                : chart.format
            }
            tone={chart.tone}
            range={range}
          />
        ))}
        {measured.map((metric) => (
          <CustomMetricTrend
            key={metric.id}
            metric={metric}
            today={today}
            range={range}
          />
        ))}
      </div>

      {dataless.length > 0 && <DatalessMetrics metrics={dataless} />}
    </HealthDetailShell>
  )
}

/**
 * The metrics you are keeping but not filling.
 *
 * A list rather than a run of empty charts. Twelve cards each holding a title,
 * a range switch and one line of apology is most of a screen spent saying
 * nothing twelve times, and it makes the page look broken rather than honest.
 * Compressed to a name and a reason, the same absence fits in a glance — which
 * is the point, because the fix for every row here is an action, not a chart.
 */
function DatalessMetrics({ metrics }: { metrics: CustomMetricDefinition[] }) {
  // Filed under the dial each one would live on if it ever had a reading, in
  // the dial order the Health page uses. A flat alphabet of twenty names tells
  // you what is empty but not where to go and fill it. "Unfiled" catches
  // metrics whose tab maps to no dial — they exist, and this page is the only
  // one that will ever admit it.
  const groups = new Map<string, CustomMetricDefinition[]>()
  for (const metric of metrics) {
    const key = healthDialForCustomMetric(metric) ?? "unfiled"
    const held = groups.get(key)
    if (held) held.push(metric)
    else groups.set(key, [metric])
  }
  const order = [...HEALTH_DIALS.map((dial) => dial.key), "unfiled"]
  const sections = order
    .filter((key) => groups.has(key))
    .map((key) => ({
      key,
      label: HEALTH_DIAL_BY_KEY.get(key)?.label ?? "Unfiled",
      metrics: groups.get(key) as CustomMetricDefinition[],
    }))

  return (
    <section
      className="progress-tab-enter mt-1 border-t border-border py-5"
      aria-label="Metrics with no readings"
    >
      <p className="app-section-title px-1">Nothing recorded</p>
      <p className="mt-1.5 max-w-[62ch] px-1 text-[13px] leading-[1.55] text-muted-foreground">
        Tracked, but with no readings in this window. They stay off their dials
        until there is something to draw.
      </p>
      <div className="mt-5 grid gap-6 px-1 sm:grid-cols-2 sm:gap-x-12">
        {sections.map((section) => (
          <div key={section.key} className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground">
              {section.label}
            </p>
            <ul className="mt-2.5 grid gap-3">
              {section.metrics.map((metric) => (
                <li
                  key={metric.id}
                  className="flex min-w-0 items-baseline gap-2.5"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[-2px] size-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--accent-${metric.accent}) 45%, transparent)`,
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">
                      {metric.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-[1.45] text-muted-foreground">
                      {fillHint(metric)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

/** What would put a number here, said in one line and no more. */
function fillHint(metric: CustomMetricDefinition) {
  if (metric.healthMetricKey) {
    const platform = platformMetric(metric.healthMetricKey)
    const label = platform?.label ?? "the reading it is bound to"
    return `Fills from ${healthProviderLabel()} once ${label.toLowerCase()} is shared.`
  }
  if (metric.kind === "toggle") return "Fills when you mark a day done."
  return metric.unit
    ? `Fills when you log a figure in ${metric.unit}.`
    : "Fills when you log a figure."
}
