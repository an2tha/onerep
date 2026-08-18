import { useState } from "react"
import { currentDateKey } from "@/lib/food-log"
import { hapticSelection } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import {
  HealthDetailShell,
  MetricTrend,
  formatCount,
  formatHours,
  type HealthMetricId,
} from "./shared"

/**
 * Every series in one place, grouped the way people ask for them.
 *
 * The tabs are themes rather than metrics because "how is my sleep" is a
 * question about two charts, not one, and making someone visit a picker three
 * times to answer it is the kind of navigation that gets a screen abandoned.
 */
const GROUPS = [
  {
    id: "recovery",
    label: "Recovery",
    charts: [
      { metric: "recovery", title: "Recovery score", kind: "bars", format: formatCount },
      { metric: "sleep", title: "Sleep", kind: "bars", format: formatHours },
    ],
  },
  {
    id: "heart",
    label: "Heart",
    charts: [
      {
        metric: "hrv",
        title: "Heart rate variability",
        kind: "line",
        format: (value: number) => `${formatCount(value)}ms`,
      },
      {
        metric: "restingHeartRate",
        title: "Resting heart rate",
        kind: "line",
        format: (value: number) => `${formatCount(value)}bpm`,
      },
    ],
  },
  {
    id: "activity",
    label: "Activity",
    charts: [
      { metric: "exercise", title: "Exercise minutes", kind: "bars", format: formatHours },
      { metric: "steps", title: "Steps", kind: "bars", format: formatCount },
      {
        metric: "energy",
        title: "Active calories",
        kind: "bars",
        format: (value: number) => `${formatCount(value)} kcal`,
      },
    ],
  },
] as const

export default function HealthTrends() {
  const today = currentDateKey()
  const [group, setGroup] = useState<(typeof GROUPS)[number]["id"]>("recovery")
  const active = GROUPS.find((item) => item.id === group) ?? GROUPS[0]

  return (
    <HealthDetailShell title="Trends" subtitle="Against your own history">
      <div
        className="-mt-1 inline-flex gap-0.5 self-start rounded-full bg-foreground/[0.06] p-0.5"
        role="tablist"
        aria-label="Trend group"
      >
        {GROUPS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={group === item.id}
            onClick={() => {
              hapticSelection()
              setGroup(item.id)
            }}
            className={cn(
              "motion-tactile-subtle min-h-9 rounded-full px-3.5 text-[12px] font-semibold text-muted-foreground transition-colors",
              group === item.id && "bg-foreground text-background"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Keyed on the group so the charts re-enter rather than morphing
          between two unrelated units. */}
      <div key={group} className="dashboard-intelligence-panel grid gap-5">
        {active.charts.map((chart) => (
          <MetricTrend
            key={chart.metric}
            today={today}
            metric={chart.metric as HealthMetricId}
            kind={chart.kind}
            title={chart.title}
            format={chart.format}
          />
        ))}
      </div>
    </HealthDetailShell>
  )
}
