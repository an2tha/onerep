import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CaretRight,
} from "@phosphor-icons/react"
import { AppDial, NavigationBar, ToolbarButton } from "@repo/ui"
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

export type HealthMetricId =
  | "sleep"
  | "recovery"
  | "steps"
  | "energy"
  | "hrv"
  | "restingHeartRate"
  | "exercise"

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
 * One fixed colour per area, never varying with the score.
 *
 * Borrowed straight from how the nutrition dials work: protein is always the
 * same colour whether you hit the target or missed it by half, and the arc
 * length carries the reading. Hue that tracks the value turns a measurement
 * into a verdict.
 */
export const AREA_TONES: Record<string, string> = {
  recovery: "var(--accent-progress)",
  sleep: "var(--accent-water)",
  activity: "var(--accent-workout)",
  heart: "var(--accent-health)",
}

/** The app's dial, wearing a health score. */
export function ScoreDial({
  score,
  caption,
  size = 158,
  tone = "var(--accent-health)",
  showScale = true,
}: {
  score: number | null
  caption?: string
  size?: number
  tone?: string
  /** The 0 and 100 end labels, for the larger sizes that have room for them. */
  showScale?: boolean
}) {
  return (
    <div className="relative shrink" style={{ width: size, maxWidth: "100%" }}>
      <AppDial
        value={score}
        color={tone}
        size={size}
        stroke={size < 120 ? 9 : 8}
      >
        <span
          className="leading-none font-extrabold tracking-tight tabular-nums"
          style={{ fontSize: "26cqw" }}
        >
          {score ?? "—"}
        </span>
        {caption && (
          <span
            className="mt-[3cqw] leading-tight font-semibold text-muted-foreground"
            style={{ fontSize: "8cqw" }}
          >
            {caption}
          </span>
        )}
      </AppDial>

      {showScale && (
        <>
          <span className="absolute -bottom-[9%] left-[4%] text-[11px] font-medium text-muted-foreground tabular-nums">
            0
          </span>
          <span className="absolute right-[4%] -bottom-[9%] text-[11px] font-medium text-muted-foreground tabular-nums">
            100
          </span>
        </>
      )}
    </div>
  )
}

/**
 * A dial that is also a button.
 *
 * These take the place of the three macro dials in the Nutrition hero, in the
 * same row. They do not overlap the way those three do: that trick works
 * because the centre dial is half again the size of its neighbours and clearly
 * leads them, and four equal rings tucked into each other just read as a chain.
 * The control is the reading itself rather than an icon standing in for one.
 */
export function DialButton({
  score,
  label,
  detail,
  to,
  tone,
  size = 104,
  index = 0,
  lift = 0,
  className,
}: {
  score: number | null
  label: string
  detail: string
  to: string
  tone: string
  size?: number
  index?: number
  /**
   * Where this dial sits on the arc, 0 at the trough and 1 at the ends.
   * Applied as a bottom margin rather than a transform, because the button
   * already spends its transform on the hover lift and the press.
   */
  lift?: number
  className?: string
}) {
  const navigate = useSmoothNavigate()
  return (
    <button
      type="button"
      onClick={() => {
        hapticSelection()
        navigate(to, { motion: "forward" })
      }}
      aria-label={`${label}: ${detail}`}
      className={cn(
        "health-dial-button motion-tactile progress-tab-enter flex min-w-0 shrink flex-col items-center gap-2",
        className
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/*
        The arc lives on the dial, not on the button: with an `items-end` row
        the extra space below each dial pushes it up while every label stays on
        one baseline. Curving the labels too makes the row read as ragged
        rather than as an arc.
      */}
      <span
        className="relative flex w-full justify-center"
        style={{ marginBottom: `calc(var(--dial-arc, 0px) * ${lift})` }}
      >
        <ScoreDial score={score} size={size} tone={tone} showScale={false} />
        {/*
          The one cue you read rather than feel. It sits in the gap the dial
          already leaves at the bottom of its sweep, so it costs no space and
          collides with no ticks.
        */}
        <span
          className="health-dial-button-cue app-translucent absolute bottom-0 left-1/2 flex size-[19px] -translate-x-1/2 items-center justify-center rounded-full text-muted-foreground"
          aria-hidden="true"
        >
          <CaretRight size={10} weight="bold" />
        </span>
      </span>
      <span className="block truncate text-[13px] leading-none font-semibold">
        {label}
      </span>
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
        "grid gap-4 border-t border-border px-1 py-4 sm:border-t-0 sm:py-0",
        columns === 2 ? "grid-cols-2" : "grid-cols-3"
      )}
    >
      {children}
    </div>
  )
}

/**
 * The change against the previous period.
 *
 * Not a badge. A filled pill in warning amber turns "you walked 3% less than
 * last month" into an alert, and the direction is already carried by the arrow
 * — colouring it too is the same claim made twice, in a voice that suits a
 * fire alarm rather than a step count. Direction reads from the glyph, size
 * from the number, and neither of them shouts.
 */
export function DeltaChip({
  deltaPercent,
  betterWhen,
  suffix,
}: {
  deltaPercent: number | null
  betterWhen: "higher" | "lower"
  suffix: string
}) {
  if (deltaPercent === null) {
    return (
      <span className="text-[12px] text-muted-foreground">
        no earlier {suffix.replace("past ", "")} to compare
      </span>
    )
  }

  if (Math.abs(deltaPercent) < 1) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <ArrowRight size={12} weight="bold" aria-hidden="true" />
        level on the {suffix.replace("past ", "")} before
      </span>
    )
  }

  const rising = deltaPercent > 0
  const Arrow = rising ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <Arrow
        size={12}
        weight="bold"
        aria-hidden="true"
        className={
          // The one place direction earns emphasis: the arrow, not the words.
          betterWhen === "higher"
            ? rising
              ? "text-foreground"
              : undefined
            : rising
              ? undefined
              : "text-foreground"
        }
      />
      <span className="font-semibold text-foreground tabular-nums">
        {Math.abs(Math.round(deltaPercent))}%
      </span>
      {rising ? "up on" : "down on"} the {suffix.replace("past ", "")} before
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
  tone = "var(--accent-health)",
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
    // heart rates all sit near 55, and a zero baseline would render a week of
    // them as identical full-height bars with no visible variation.
    const span = highest - lowest
    // A perfectly flat series has no spread to anchor against, so it falls
    // back to a zero baseline and draws as one even row. Anchoring it the
    // usual way would collapse every bar to the 4% minimum and read as a
    // catastrophe rather than as consistency.
    if (span === 0) return { max: highest, floor: 0 }
    return { max: highest, floor: Math.max(0, lowest - span * 0.6) }
  }, [points])

  const active = selected !== null ? points[selected] : undefined

  return (
    <div>
      <div
        className="relative flex items-end gap-[3px] rounded-xl bg-foreground/[0.035] p-3"
        style={{ height }}
        role="group"
        aria-label="Daily readings"
      >
        {points.map((point, index) => {
          const isSelected = selected === index
          const ratio =
            point.value === null
              ? 0
              : Math.max(0.04, (point.value - floor) / Math.max(1, max - floor))
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
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <span
                className="w-full max-w-[26px] rounded-[3px] transition-all duration-500 ease-out"
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
            <p className="mt-1 text-[11px] leading-none font-medium text-background/80">
              {active.span > 1
                ? `week of ${formatShortDate(active.date)}`
                : formatLongDate(active.date)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between px-1 text-[11px] font-medium text-muted-foreground">
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
  const span = max - min

  const width = 100
  const x = (index: number) =>
    points.length <= 1 ? width / 2 : (index / (points.length - 1)) * width
  // A flat series is drawn down the middle rather than pinned to the floor,
  // which is where dividing by a zero span would otherwise put it.
  const y = (value: number) =>
    span === 0 ? 50 : 92 - ((value - min) / span) * 84

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
    current.push(
      `${current.length === 0 ? "M" : "L"}${x(point.index).toFixed(2)},${y(point.value).toFixed(2)}`
    )
  }
  if (current.length > 0) segments.push(current.join(" "))

  const active = selected !== null ? points[selected] : undefined

  return (
    <div>
      <div
        className="relative rounded-xl bg-foreground/[0.035] p-3"
        style={{ height }}
      >
        <div className="absolute inset-3">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
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
          </svg>

          {/*
            The dots are positioned rather than drawn, because the svg above
            stretches its viewBox non-uniformly to fill the card — a <circle>
            inside it comes out as an oval. Percentages put them on the same
            geometry without inheriting the distortion, and it lets an isolated
            reading between two gaps still show up as a mark of its own.
          */}
          {measured.map((point) => {
            const isSelected = selected === point.index
            return (
              <span
                key={point.date}
                aria-hidden="true"
                className="absolute rounded-full transition-all duration-300"
                style={{
                  left: `${x(point.index)}%`,
                  top: `${y(point.value as number)}%`,
                  width: isSelected ? 9 : 5,
                  height: isSelected ? 9 : 5,
                  marginLeft: isSelected ? -4.5 : -2.5,
                  marginTop: isSelected ? -4.5 : -2.5,
                  backgroundColor: tone,
                  boxShadow: isSelected
                    ? "0 0 0 3px color-mix(in srgb, var(--card) 70%, transparent)"
                    : undefined,
                }}
              />
            )
          })}
        </div>

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
            <p className="mt-1 text-[11px] leading-none font-medium text-background/80">
              {formatLongDate(active.date)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between px-1 text-[11px] font-medium text-muted-foreground">
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

/**
 * The chrome every Health detail page wears.
 *
 * Carries the same wash as the hub, tinted by whatever score that page is
 * about, so moving between them feels like walking through one room rather
 * than opening five documents.
 */
export function HealthDetailShell({
  title,
  subtitle,
  heroFill,
  children,
  charts,
  about,
}: {
  title: string
  subtitle?: string
  /** 0–100, drives the depth of the wash. Omit for pages with no score. */
  heroFill?: number | null
  children: ReactNode
  /**
   * The trend charts. Split out because on a wide canvas they belong beside
   * the summary rather than under it — `app-page` runs to 76rem, and a bar
   * chart given that much room stops being a chart and becomes a fence.
   */
  charts?: ReactNode
  /**
   * The explanations. Full width under both columns rather than inside one:
   * the charts column is always the taller of the two, and definitions squeezed
   * into the remainder of the shorter one wrap to four words a line.
   */
  about?: ReactNode
}) {
  const navigate = useSmoothNavigate()
  return (
    <div
      className={cn(
        "desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72",
        heroFill != null && "app-hero"
      )}
      style={
        heroFill != null
          ? ({
              "--hero-fill": heroFill,
              "--hero-accent": "var(--accent-health)",
            } as CSSProperties)
          : undefined
      }
    >
      {heroFill != null && (
        <span className="app-hero-wash" aria-hidden="true" />
      )}
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
        {/*
          One full-width band per kind of thing, rather than two columns of
          wildly different heights. The summary is short and the charts are
          many, so side by side left a column of nothing taller than most
          screens — and `position: sticky` cannot rescue that, because
          `.desktop-canvas` and `.app-route-shell` both set `overflow-x: clip`,
          which disables sticky for everything inside them.
        */}
        <div className="grid gap-5">{children}</div>
        {/*
          Columns rather than a grid: a metric with no readings collapses to
          one line, and in a grid its row would still stand as tall as the full
          chart beside it. Column flow packs them by height instead.
        */}
        {charts && (
          <div className="mt-5 grid gap-5 lg:block lg:columns-2 lg:gap-8">
            {charts}
          </div>
        )}
        {about}
      </main>
    </div>
  )
}

/**
 * The paragraph a detail page opens with — one recommendation, in prose.
 *
 * Ruled rather than boxed, matching the rest of the page.
 */
export function AdviceBlock({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <section className="progress-tab-enter border-t border-border px-1 py-4">
      <p className="text-[15px] leading-5 font-semibold">{title}</p>
      <p className="mt-2 max-w-[62ch] text-[13px] leading-[1.55] text-muted-foreground">
        {detail}
      </p>
    </section>
  )
}

/** A detail page's hero dial, centred and captioned. */
export function DialHero({
  score,
  caption,
  tone,
  children,
}: {
  score: number | null
  caption: string
  tone: string
  /** The stats that sit beside the dial once there is room for them. */
  children?: ReactNode
}) {
  return (
    <div className="progress-tab-enter sm:flex sm:items-center sm:gap-7 lg:gap-10">
      <div className="flex shrink-0 justify-center pt-1 pb-1">
        <ScoreDial score={score} caption={caption} tone={tone} size={150} />
      </div>
      {children && <div className="min-w-0 flex-1">{children}</div>}
    </div>
  )
}

/**
 * What the numbers on this page actually mean.
 *
 * Every claim here has to survive contact with someone who knows the field,
 * because a health app that is confidently wrong about SDNN is worse than one
 * that says nothing. Where a figure is a convention rather than a finding —
 * the step target, the sleep target — this says so.
 */
export function MetricAbout({
  items,
}: {
  items: Array<{ term: string; detail: string }>
}) {
  return (
    <section
      className="progress-tab-enter mt-6 border-t border-border py-7"
      aria-label="About these numbers"
    >
      <p className="app-section-title px-1">About these numbers</p>
      {/* Two columns at the widest. Four made every definition a 26-character
          ribbon, which is a column of hyphenation rather than an explanation. */}
      <dl className="mt-5 grid gap-x-14 gap-y-7 px-1 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.term} className="min-w-0">
            <dt className="text-[14px] font-semibold">{item.term}</dt>
            <dd className="mt-1.5 max-w-[62ch] text-[13px] leading-[1.6] text-muted-foreground">
              {item.detail}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * The line-art marks that tell one action card from another.
 *
 * Deliberately abstract: concentric arcs, a dot field, a hatch, a pair of
 * rings. None of them illustrates the metric — an icon of a shoe on the step
 * card would be a fourth way of saying "steps" on a card that already says it
 * twice. These are here to make four cards distinguishable at a glance, and
 * nothing else.
 */
export function ActionMotif({ variant }: { variant: number }) {
  const shape = variant % 4
  return (
    <svg
      className="health-action-motif"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      {shape === 0 &&
        [26, 40, 54, 68].map((r) => (
          <circle
            key={r}
            cx="50"
            cy="50"
            r={r}
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${r * 2.6} ${r * 6}`}
            strokeLinecap="round"
          />
        ))}

      {shape === 1 &&
        Array.from({ length: 6 }, (_, row) =>
          Array.from({ length: 6 }, (_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={14 + col * 15}
              cy={14 + row * 15}
              r={2.4}
              fill="currentColor"
            />
          ))
        )}

      {shape === 2 &&
        Array.from({ length: 7 }, (_, index) => (
          <line
            key={index}
            x1={-10 + index * 20}
            y1="104"
            x2={34 + index * 20}
            y2="-4"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))}

      {shape === 3 && (
        <>
          <circle
            cx="38"
            cy="56"
            r="30"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <circle
            cx="66"
            cy="42"
            r="30"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <circle
            cx="52"
            cy="70"
            r="30"
            stroke="currentColor"
            strokeWidth="2.5"
          />
        </>
      )}
    </svg>
  )
}

/** The one-line "nothing to draw yet" every detail page needs. */
export function NoReadings({ detail }: { detail: string }) {
  return (
    <p className="px-1 py-4 text-[13px] leading-5 text-muted-foreground">
      {detail}
    </p>
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
  range: controlledRange,
}: {
  today: string
  metric: HealthMetricId
  kind?: "bars" | "line"
  title?: string
  tone?: string
  format: (value: number) => string
  initialRange?: RangeKey
  /**
   * Set to drive the range from outside, which also hides the per-chart
   * switch. Trends does this: comparing seven signals is only meaningful over
   * one window, and seven switches invites a reading nobody intended.
   */
  range?: RangeKey
}) {
  const [ownRange, setRange] = useState<RangeKey>(initialRange)
  const range = controlledRange ?? ownRange
  const data = useQuery(api.logs.healthMetrics.series, { today, range })
  const series = data?.metrics?.[metric]
  const suffix =
    range === "W" ? "past week" : range === "M" ? "past month" : "past year"
  const empty = data !== undefined && (!series || series.average === null)

  return (
    <section
      className="progress-tab-enter break-inside-avoid border-t border-border py-4 lg:mb-5"
      aria-label={title ?? series?.label ?? "Trend"}
    >
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          {title && <p className="app-section-title">{title}</p>}
          {/*
            An empty range gets the title, the range switch and one line —
            nothing else. A dash where the average goes, a chip reading "level"
            against nothing, and a chart-sized hole is three ways of saying the
            same "no data" and takes a third of a screen to say it.
          */}
          {empty ? (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Nothing recorded {suffix.replace("past ", "this ")}.
            </p>
          ) : (
            <>
              <p className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-[1.7rem] leading-none font-extrabold tracking-tight tabular-nums">
                  {series?.average == null ? "—" : format(series.average)}
                </span>
                <span className="text-[13px] font-semibold text-muted-foreground">
                  {range === "W"
                    ? "weekly"
                    : range === "M"
                      ? "monthly"
                      : "yearly"}{" "}
                  average
                </span>
              </p>
              {series && (
                <p className="mt-1.5">
                  <DeltaChip
                    deltaPercent={series.deltaPercent}
                    betterWhen={series.betterWhen}
                    suffix={suffix}
                  />
                </p>
              )}
            </>
          )}
        </div>
        {!controlledRange && <RangeToggle range={range} onChange={setRange} />}
      </div>

      {data === undefined ? (
        <div
          className="mx-1 h-[132px] animate-pulse rounded-xl bg-muted"
          data-route-loading="true"
        />
      ) : empty ? null : (
        <>
          <div className="px-1">
            {kind === "line" ? (
              <MetricLine
                points={series.points}
                format={format}
                tone={tone ?? "var(--accent-water)"}
              />
            ) : (
              <MetricBars
                points={series.points}
                format={format}
                tone={tone ?? "var(--accent-health)"}
              />
            )}
          </div>

          {series.min !== null && series.max !== null && (
            <div className="mt-3 flex gap-5 px-1">
              <p className="text-[12px] text-muted-foreground">
                Low{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {format(series.min)}
                </span>
              </p>
              <p className="text-[12px] text-muted-foreground">
                High{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {format(series.max)}
                </span>
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
