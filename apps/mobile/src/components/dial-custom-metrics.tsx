import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import {
  type ChartPoint,
  MetricBars,
  MetricLine,
} from "@/pages/health/shared"

/**
 * Custom metrics, filed under the dial they belong to.
 *
 * They used to live on Progress, under a tab the user picked at creation time,
 * which meant a blood glucose metric bound to the health store sat next to a
 * body-weight photo log and nowhere near the Health page that already knew how
 * to draw it.
 *
 * The scores come off `dashboard.customDials` and nothing here recomputes
 * them. An earlier draft of this file averaged target ratios in the browser and
 * got a different number to the one the server put on the ring, because
 * `customMetricScoring.ts` also grades against a person's own baseline when
 * they set no target. Two scoring rules for one metric is a bug that only ever
 * shows up as a user asking which of the two figures is real.
 *
 * The second query is for the charts alone: `customDials` carries a score and a
 * latest reading, not a series, and there is no drawing a trend without one.
 */

export type CustomMetricRow = {
  id: string
  title: string
  unit: string
  kind: "counter" | "number" | "toggle"
  target: number | null
  score: number | null
  basis: "target" | "baseline" | null
  latest: { date: string; value: number } | null
  /** Oldest first. Empty when the window held nothing worth drawing. */
  points: ChartPoint[]
}

type RawMetric = {
  _id: string
  kind: "counter" | "number" | "toggle"
  entries: { date: string; value: number }[]
}

/** Typed values carry decimals; a step count should not wear ".0". */
export function formatCustomValue(value: number, unit: string) {
  const rounded =
    Math.abs(value) >= 100 || Number.isInteger(value)
      ? Math.round(value).toLocaleString()
      : value.toFixed(1)
  return unit ? `${rounded} ${unit}` : rounded
}

/**
 * Every custom metric with a reading, grouped by dial.
 *
 * Metrics the window held nothing for are dropped rather than listed empty.
 * A dial screen stacked with "nothing recorded" lines is a worse answer than a
 * short screen, and Trends keeps the full list precisely because there the
 * absence is the comparison being made.
 */
export function useCustomMetricsByDial(): {
  loading: boolean
  scores: Record<string, number | null>
  byDial: Record<string, CustomMetricRow[]>
} {
  const today = currentDateKey()
  const dashboard = useQuery(api.logs.healthMetrics.dashboard, { today })
  const definitions = useQuery(api.customProgressMetrics.list, {}) as
    | RawMetric[]
    | undefined

  return useMemo(() => {
    const byDial: Record<string, CustomMetricRow[]> = {}
    const scores: Record<string, number | null> = {}
    const pointsById = new Map<string, ChartPoint[]>()

    for (const metric of definitions ?? []) {
      pointsById.set(
        metric._id,
        [...metric.entries]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((entry) => ({ date: entry.date, span: 1, value: entry.value }))
      )
    }

    for (const dial of dashboard?.customDials ?? []) {
      if (!dial.hasData) continue
      scores[dial.dial] = dial.score
      byDial[dial.dial] = dial.metrics
        .filter((metric) => metric.hasData)
        .map((metric) => {
          const raw = (definitions ?? []).find(
            (entry) => entry._id === metric.metricId
          )
          return {
            id: metric.metricId,
            title: metric.title,
            unit: metric.unit,
            kind: raw?.kind ?? "number",
            target: metric.target,
            score: metric.score,
            basis: metric.basis,
            latest: metric.latest,
            points: pointsById.get(metric.metricId) ?? [],
          }
        })
    }

    return { loading: dashboard === undefined, scores, byDial }
  }, [dashboard, definitions])
}

/** The one-line caption a dial wears when custom metrics are all it has. */
export function customMetricCaption(rows: CustomMetricRow[]): string {
  if (rows.length === 0) return "nothing recorded"
  if (rows.length === 1) {
    const row = rows[0]
    return row.latest
      ? formatCustomValue(row.latest.value, row.unit)
      : "nothing yet"
  }
  return `${rows.length} metrics tracked`
}

/**
 * The custom metrics section on an area screen.
 *
 * Renders nothing when the dial has none, rather than an empty heading — most
 * people will have nothing under most dials, and a stack of empty sections is
 * how a page stops being read at all.
 */
export function DialCustomMetrics({
  dial,
  tone,
}: {
  dial: string
  tone: string
}) {
  const { loading, byDial } = useCustomMetricsByDial()
  const rows = byDial[dial] ?? []
  if (loading || rows.length === 0) return null

  return (
    <section aria-label="Your own metrics">
      <p className="app-section-title mb-2">Your own metrics</p>
      <div className="divide-y divide-border border-t border-border">
        {rows.map((row, index) => (
          <article
            key={row.id}
            className="progress-tab-enter px-1 py-4"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-[15px] leading-5 font-semibold">
                {row.title}
              </p>
              <p className="shrink-0 text-[15px] font-bold tabular-nums">
                {row.latest
                  ? formatCustomValue(row.latest.value, row.unit)
                  : "no reading"}
              </p>
            </div>
            {/*
              What the score was measured against, said out loud. A ring at 78
              means two different things depending on whether the user set a
              target or the app fell back to their own median, and leaving the
              reader to work out which is how a number stops being trusted.
            */}
            <p className="mt-0.5 text-[13px] leading-[1.45] text-muted-foreground tabular-nums">
              {row.basis === "target" && row.target !== null
                ? `Against your target of ${formatCustomValue(row.target, row.unit)}`
                : row.basis === "baseline"
                  ? "Against your own usual reading"
                  : "Not scored — set a target, or log a few more days"}
            </p>
            {/*
              Two points is a segment, not a trend. Drawing one made every
              metric someone had logged twice look like a discovery.
            */}
            {row.points.length >= 3 && (
              <div className="mt-3">
                {row.kind === "counter" ? (
                  <MetricBars
                    points={row.points}
                    height={104}
                    tone={tone}
                    format={(value) => formatCustomValue(value, row.unit)}
                  />
                ) : (
                  <MetricLine
                    points={row.points}
                    height={104}
                    tone={tone}
                    format={(value) => formatCustomValue(value, row.unit)}
                  />
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
