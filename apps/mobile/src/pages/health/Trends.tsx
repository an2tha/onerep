import { useState } from "react"
import { currentDateKey } from "@/lib/food-log"
import {
  AREA_TONES,
  HealthDetailShell,
  MetricTrend,
  RangeToggle,
  formatCount,
  formatHours,
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
    format: (value) => `${formatCount(value)} kcal`,
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

export default function HealthTrends() {
  const today = currentDateKey()
  const [range, setRange] = useState<RangeKey>("M")

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
            format={chart.format}
            tone={chart.tone}
            range={range}
          />
        ))}
      </div>
    </HealthDetailShell>
  )
}
