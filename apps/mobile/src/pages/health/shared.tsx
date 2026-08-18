import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowLeft, CaretRight } from "@phosphor-icons/react"
import { NavigationBar, ToolbarButton } from "@repo/ui"
import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { useSmoothNavigate } from "@/lib/navigation"
import { hapticSelection } from "@/lib/haptics"
import { cn } from "@/lib/utils"

/**
 * The pieces every Health screen is built from.
 *
 * Kept in one module rather than in `@repo/ui` because all of it is bound to
 * the shape of the health queries — a ring that only knows how to colour
 * itself by health band is not a general-purpose ring, and pretending
 * otherwise is how design systems fill up with things nobody can reuse.
 */

/**
 * Score colour, in three bands rather than a continuous ramp.
 *
 * A hue gradient reads as precision this data does not have — the difference
 * between a 71 and a 74 is noise, and colouring them differently invites
 * people to chase it.
 */
export type HealthMetricId =
  | "sleep"
  | "recovery"
  | "steps"
  | "energy"
  | "hrv"
  | "restingHeartRate"
  | "exercise"

export function toneVar(score: number | null) {
  if (score === null) return "var(--muted-foreground)"
  if (score >= 70) return "var(--status-success)"
  if (score >= 50) return "var(--status-caution)"
  return "var(--status-danger)"
}

export function formatHours(minutes: number) {
  const whole = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (whole === 0) return `${rest}m`
  return rest === 0 ? `${whole}h` : `${whole}h ${rest}m`
}

export function formatCount(value: number) {
  return Math.round(value).toLocaleString()
}

/** "Tue 2" — short enough for an axis, unambiguous inside a tooltip. */
export function formatShortDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function formatLongDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** Renders a metric in its own unit. Sleep is the only one that is not a number. */
export function formatMetricValue(
  value: number | null,
  unit: string,
  metricId?: string
) {
  if (value === null) return "—"
  if (metricId === "sleep" || metricId === "exercise") return formatHours(value)
  if (unit === "") return formatCount(value)
  return `${formatCount(value)}${unit === "kcal" ? "" : ""}`
}

/**
 * The hero dial, drawn as discrete ticks rather than a swept arc.
 *
 * Ticks because these numbers are averages of noisy sensors: a smooth arc
 * implies a continuous reading, while a ring of marks reads as what it is —
 * a count of things that went well out of things measured.
 */
export function ScoreDial({
  score,
  caption,
  size = 208,
  ticks = 56,
}: {
  score: number | null
  caption: string
  size?: number
  ticks?: number
}) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const tone = toneVar(score)
  // A 280° sweep, leaving the bottom open for the 0 and 100 end labels.
  const sweep = 280
  const start = 130
  const centre = size / 2
  const outer = centre - 10
  const inner = outer - size * 0.077
  const filled = Math.round((ticks * (score ?? 0)) / 100)

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {Array.from({ length: ticks }, (_, index) => {
          const angle = ((start + (sweep / (ticks - 1)) * index) * Math.PI) / 180
          const lit = index < filled
          return (
            <line
              key={index}
              x1={centre + Math.cos(angle) * inner}
              y1={centre + Math.sin(angle) * inner}
              x2={centre + Math.cos(angle) * outer}
              y2={centre + Math.sin(angle) * outer}
              strokeWidth={3}
              strokeLinecap="round"
              stroke={lit ? tone : "var(--border)"}
              style={{
                opacity: drawn ? (lit ? 1 : 0.55) : 0.15,
                transition: `opacity 420ms var(--motion-ease-out, ease-out) ${index * 9}ms`,
              }}
            />
          )
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-bold tracking-tight tabular-nums"
          style={{
            fontSize: size * 0.25,
            lineHeight: 1,
            color: score === null ? undefined : tone,
          }}
        >
          {score ?? "—"}
        </span>
        <span
          className="mt-1.5 text-[13px] font-semibold"
          style={{ color: tone }}
        >
          {caption}
        </span>
      </div>

      {/* End labels, so the number has a scale rather than floating free. */}
      <span className="absolute bottom-[6%] left-[12%] text-[11px] font-medium text-muted-foreground tabular-nums">
        0
      </span>
      <span className="absolute right-[12%] bottom-[6%] text-[11px] font-medium text-muted-foreground tabular-nums">
        100
      </span>
    </div>
  )
}

/** The small ring that fronts a score row. */
export function MiniRing({
  score,
  size = 44,
}: {
  score: number | null
  size?: number
}) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const radius = size / 2 - 4
  const circumference = 2 * Math.PI * radius
  const swept = circumference * ((score ?? 0) / 100)
  const tone = toneVar(score)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          className="stroke-foreground/[0.08]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={drawn ? circumference - swept : circumference}
          style={{
            stroke: tone,
            transition:
              "stroke-dashoffset 700ms var(--motion-ease-out, ease-out)",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span
          className="text-[13px] font-bold tabular-nums"
          style={{ color: tone }}
        >
          {score ?? "—"}
        </span>
      </div>
    </div>
  )
}

/** A tappable row: ring, name, one line of why, chevron. */
export function ScoreRow({
  score,
  label,
  detail,
  to,
  index = 0,
}: {
  score: number | null
  label: string
  detail: string
  to: string
  index?: number
}) {
  const navigate = useSmoothNavigate()
  return (
    <button
      type="button"
      onClick={() => {
        hapticSelection()
        navigate(to, { motion: "forward" })
      }}
      className="motion-tactile dashboard-record-in flex w-full items-center gap-3.5 rounded-xl border border-border bg-card p-3.5 text-left"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <MiniRing score={score} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-4 text-muted-foreground">
          {detail}
        </span>
      </span>
      <CaretRight
        size={15}
        weight="bold"
        className="shrink-0 text-muted-foreground/70"
        aria-hidden="true"
      />
    </button>
  )
}

/** One headline number with its label above it, as on the Sleep reference. */
export function StatCell({
  label,
  value,
  caption,
  tone,
}: {
  label: string
  value: string
  caption?: string
  tone?: string
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-[21px] leading-none font-bold tracking-tight tabular-nums">
        {value}
      </p>
      {caption && (
        <p
          className="mt-1.5 truncate text-[11px] font-medium"
          style={{ color: tone ?? "var(--muted-foreground)" }}
        >
          {caption}
        </p>
      )}
    </div>
  )
}

export function StatGrid({
  children,
  columns = 3,
}: {
  children: ReactNode
  columns?: 2 | 3
}) {
  return (
    <div
      className={cn(
        "grid gap-4 rounded-xl border border-border bg-card p-4",
        columns === 2 ? "grid-cols-2" : "grid-cols-3"
      )}
    >
      {children}
    </div>
  )
}

/** The signed change against the previous period, coloured by meaning. */
export function DeltaChip({
  deltaPercent,
  betterWhen,
  suffix,
}: {
  deltaPercent: number | null
  betterWhen: "higher" | "lower"
  suffix: string
}) {
  if (deltaPercent === null || Math.abs(deltaPercent) < 1) {
    return (
      <span className="text-[11px] font-semibold text-muted-foreground">
        level {suffix}
      </span>
    )
  }
  const rising = deltaPercent > 0
  const good = betterWhen === "higher" ? rising : !rising
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold tabular-nums"
      style={{
        backgroundColor: good
          ? "var(--status-complete-bg)"
          : "var(--status-caution-bg)",
        color: good ? "var(--status-success)" : "var(--status-caution)",
      }}
    >
      {rising ? "▲" : "▼"} {Math.abs(Math.round(deltaPercent))}% {suffix}
    </span>
  )
}

export type ChartPoint = {
  date: string
  span: number
  value: number | null
}

/**
 * A bar chart you can prod.
 *
 * Selection rather than hover, because this is a phone first: tapping a bar
 * pins a callout above it. Null values render as nothing at all rather than
 * as a zero-height bar, so a week with the watch on the charger reads as a
 * gap instead of as a collapse.
 */
export function MetricBars({
  points,
  format,
  tone = "var(--accent-progress)",
  height = 132,
}: {
  points: ChartPoint[]
  format: (value: number) => string
  tone?: string
  height?: number
}) {
  const [selected, setSelected] = useState<number | null>(null)

  const { max, floor } = useMemo(() => {
    const values = points
      .map((point) => point.value)
      .filter((value): value is number => value !== null)
    if (values.length === 0) return { max: 1, floor: 0 }
    const highest = Math.max(...values)
    const lowest = Math.min(...values)
    // Bars are anchored below the lowest reading rather than at zero: resting
    // heart rates all sit near 55, and a zero baseline would render every week
    // as five identical full-height bars.
    const span = highest - lowest
    return { max: highest, floor: Math.max(0, lowest - span * 0.6) }
  }, [points])

  const active = selected !== null ? points[selected] : undefined

  return (
    <div>
      <div
        className="relative flex items-end gap-[3px] rounded-xl bg-foreground/[0.04] p-3"
        style={{ height }}
        role="group"
        aria-label="Daily readings"
      >
        {points.map((point, index) => {
          const isSelected = selected === index
          const ratio =
            point.value === null
              ? 0
              : Math.max(
                  0.04,
                  (point.value - floor) / Math.max(1, max - floor)
                )
          return (
            <button
              key={point.date}
              type="button"
              aria-label={`${formatShortDate(point.date)}: ${
                point.value === null ? "no reading" : format(point.value)
              }`}
              aria-pressed={isSelected}
              onClick={() => {
                hapticSelection()
                setSelected(isSelected ? null : index)
              }}
              className="group relative flex h-full flex-1 items-end"
            >
              <span
                className="w-full rounded-[3px] transition-all duration-500 ease-out"
                style={{
                  height: `${ratio * 100}%`,
                  backgroundColor:
                    point.value === null
                      ? "transparent"
                      : isSelected
                        ? tone
                        : `color-mix(in srgb, ${tone} ${selected === null ? 42 : 18}%, transparent)`,
                }}
              />
            </button>
          )
        })}

        {active && (
          <div
            className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-center"
            role="status"
          >
            <p className="text-[13px] leading-none font-bold text-background tabular-nums">
              {active.value === null ? "No reading" : format(active.value)}
            </p>
            <p className="mt-1 text-[10px] leading-none font-medium text-background/70">
              {active.span > 1
                ? `week of ${formatShortDate(active.date)}`
                : formatLongDate(active.date)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between px-1 text-[10px] font-medium text-muted-foreground">
        <span>{formatShortDate(points[0]?.date ?? "")}</span>
        <span>{formatShortDate(points[points.length - 1]?.date ?? "")}</span>
      </div>
    </div>
  )
}

/**
 * The same data as a line, for signals that are a level rather than a total.
 *
 * HRV and resting heart rate are readings you take, not things you accumulate,
 * and drawing them as bars implies a quantity that was collected.
 */
export function MetricLine({
  points,
  format,
  tone = "var(--accent-water)",
  height = 132,
}: {
  points: ChartPoint[]
  format: (value: number) => string
  tone?: string
  height?: number
}) {
  const [selected, setSelected] = useState<number | null>(null)

  const measured = points
    .map((point, index) => ({ ...point, index }))
    .filter((point) => point.value !== null)

  const values = measured.map((point) => point.value as number)
  const max = values.length > 0 ? Math.max(...values) : 1
  const min = values.length > 0 ? Math.min(...values) : 0
  const span = Math.max(1, max - min)

  const width = 100
  const x = (index: number) =>
    points.length <= 1 ? width / 2 : (index / (points.length - 1)) * width
  const y = (value: number) => 92 - ((value - min) / span) * 84

  // Gaps break the line rather than being interpolated across: a straight
  // segment over three missing days is a claim about days nobody measured.
  const segments: string[] = []
  let current: string[] = []
  for (const point of points.map((point, index) => ({ ...point, index }))) {
    if (point.value === null) {
      if (current.length > 0) segments.push(current.join(" "))
      current = []
      continue
    }
    current.push(`${current.length === 0 ? "M" : "L"}${x(point.index).toFixed(2)},${y(point.value).toFixed(2)}`)
  }
  if (current.length > 0) segments.push(current.join(" "))

  const active = selected !== null ? points[selected] : undefined

  return (
    <div>
      <div
        className="relative rounded-xl bg-foreground/[0.04] p-3"
        style={{ height }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden="true"
        >
          {segments.map((segment, index) => (
            <path
              key={index}
              d={segment}
              fill="none"
              stroke={tone}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {measured.map((point) => (
            <circle
              key={point.date}
              cx={x(point.index)}
              cy={y(point.value as number)}
              r={selected === point.index ? 2.6 : 1.4}
              fill={tone}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Hit targets sit above the svg so the line can stay hairline-thin. */}
        <div className="absolute inset-0 flex">
          {points.map((point, index) => (
            <button
              key={point.date}
              type="button"
              aria-label={`${formatShortDate(point.date)}: ${
                point.value === null ? "no reading" : format(point.value)
              }`}
              aria-pressed={selected === index}
              onClick={() => {
                hapticSelection()
                setSelected(selected === index ? null : index)
              }}
              className="h-full flex-1"
            />
          ))}
        </div>

        {active && (
          <div
            className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-center"
            role="status"
          >
            <p className="text-[13px] leading-none font-bold text-background tabular-nums">
              {active.value === null ? "No reading" : format(active.value)}
            </p>
            <p className="mt-1 text-[10px] leading-none font-medium text-background/70">
              {formatLongDate(active.date)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between px-1 text-[10px] font-medium text-muted-foreground">
        <span>{formatShortDate(points[0]?.date ?? "")}</span>
        <span>{formatShortDate(points[points.length - 1]?.date ?? "")}</span>
      </div>
    </div>
  )
}

export const RANGE_LABELS = { W: "W", M: "M", Y: "Y" } as const
export type RangeKey = keyof typeof RANGE_LABELS

export function RangeToggle({
  range,
  onChange,
}: {
  range: RangeKey
  onChange: (range: RangeKey) => void
}) {
  return (
    <div
      className="inline-flex shrink-0 gap-0.5 rounded-full bg-foreground/[0.06] p-0.5"
      role="group"
      aria-label="Time range"
    >
      {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={range === key}
          onClick={() => {
            hapticSelection()
            onChange(key)
          }}
          className={cn(
            "motion-tactile-subtle min-h-8 min-w-8 rounded-full px-2.5 text-[12px] font-semibold text-muted-foreground transition-colors",
            range === key && "bg-foreground text-background"
          )}
        >
          {RANGE_LABELS[key]}
        </button>
      ))}
    </div>
  )
}

/** The chrome every Health detail page wears. */
export function HealthDetailShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const navigate = useSmoothNavigate()
  return (
    <div className="desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <main className="app-page pb-28">
        <NavigationBar
          title={title}
          subtitle={subtitle}
          large={false}
          leading={
            <ToolbarButton
              onClick={() => navigate(-1)}
              aria-label="Back to health"
              className="-ml-2 px-0 text-muted-foreground"
            >
              <ArrowLeft size={19} weight="bold" />
            </ToolbarButton>
          }
        />
        <div className="grid gap-5">{children}</div>
      </main>
    </div>
  )
}

/** The one-line "nothing to draw yet" every detail page needs. */
export function NoReadings({ detail }: { detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-5 text-center">
      <p className="text-[13px] text-muted-foreground">{detail}</p>
    </div>
  )
}

/**
 * A titled chart that owns its own range.
 *
 * Each of these runs its own `series` subscription. That is deliberate: the
 * ranges are independent — someone reading sleep by week and heart rate by
 * year is the normal case — and a single shared range would force one of the
 * two to redraw every time the other was touched.
 */
export function MetricTrend({
  today,
  metric,
  kind = "bars",
  title,
  tone,
  format,
  initialRange = "M",
}: {
  today: string
  metric: HealthMetricId
  kind?: "bars" | "line"
  title?: string
  tone?: string
  format: (value: number) => string
  initialRange?: RangeKey
}) {
  const [range, setRange] = useState<RangeKey>(initialRange)
  const data = useQuery(api.logs.healthMetrics.series, { today, range })
  const series = data?.metrics?.[metric]
  const suffix =
    range === "W" ? "past week" : range === "M" ? "past month" : "past year"

  return (
    <section aria-label={title ?? series?.label ?? "Trend"}>
      {title && <p className="app-section-title mb-2">{title}</p>}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {range === "W" ? "Weekly" : range === "M" ? "Monthly" : "Yearly"}{" "}
              average
            </p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
              <p className="text-[26px] leading-none font-bold tracking-tight tabular-nums">
                {series?.average == null ? "—" : format(series.average)}
              </p>
              {series && (
                <DeltaChip
                  deltaPercent={series.deltaPercent}
                  betterWhen={series.betterWhen}
                  suffix={suffix}
                />
              )}
            </div>
          </div>
          <RangeToggle range={range} onChange={setRange} />
        </div>

        <div className="mt-4">
          {data === undefined ? (
            <div
              className="h-[132px] animate-pulse rounded-xl bg-muted"
              data-route-loading="true"
            />
          ) : !series || series.average === null ? (
            <NoReadings detail="Nothing recorded in this range." />
          ) : kind === "line" ? (
            <MetricLine
              points={series.points}
              format={format}
              tone={tone ?? "var(--accent-water)"}
            />
          ) : (
            <MetricBars
              points={series.points}
              format={format}
              tone={tone ?? "var(--accent-progress)"}
            />
          )}
        </div>

        {series && series.min !== null && series.max !== null && (
          <div className="mt-3 flex gap-5 border-t border-border/60 pt-3">
            <p className="text-[11px] text-muted-foreground">
              Low{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {format(series.min)}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              High{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {format(series.max)}
              </span>
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
