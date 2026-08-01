import { ChartLineUp, Minus, Plus, X } from "@phosphor-icons/react"
import { cn } from "../../lib/utils"

export type CoachDashboardWidgetData = {
  _id: string
  title: string
  description: string
  kind: "stat" | "counter" | "progress" | "sparkline" | "decay"
  sourceMetricId: string
  metricStep: number
  unit: string
  accent: "food" | "water" | "workout" | "progress"
  target?: number
  halfLifeHours?: number
  sourceMetricTitle: string
  entries: Array<{ date: string; value: number }>
}

const accentClasses: Record<CoachDashboardWidgetData["accent"], string> = {
  food: "border-l-[var(--accent-food)]",
  water: "border-l-[var(--accent-water)]",
  workout: "border-l-[var(--accent-workout)]",
  progress: "border-l-[var(--accent-progress)]",
}

function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value < 10 ? 1 : 0,
    notation: value >= 10_000 ? "compact" : "standard",
  }).format(value)
}

function linePath(values: number[], width = 120, height = 34) {
  if (values.length === 0) return ""
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = Math.max(max - min, 1)
  return values
    .map((value, index) => {
      const x =
        values.length === 1 ? width : (index / (values.length - 1)) * width
      const y = height - ((value - min) / span) * (height - 4) - 2
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")
}

function WidgetGraph({ widget }: { widget: CoachDashboardWidgetData }) {
  const current = widget.entries[0]?.value ?? 0
  const values =
    widget.kind === "decay"
      ? Array.from(
          { length: 7 },
          (_, index) =>
            current * Math.pow(0.5, (index * 2) / (widget.halfLifeHours ?? 5))
        )
      : [...widget.entries].reverse().map((entry) => entry.value)
  const path = linePath(values)

  return (
    <svg
      viewBox="0 0 120 36"
      className="h-9 w-full overflow-visible text-foreground"
      role="img"
      aria-label={
        widget.kind === "decay"
          ? `Estimated ${widget.sourceMetricTitle} remaining over 12 hours`
          : `${widget.sourceMetricTitle} recent trend`
      }
    >
      <path d="M0 34 H120" stroke="currentColor" strokeOpacity="0.1" />
      {path ? (
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  )
}

export function CoachDashboardWidgets({
  widgets,
  onRemove,
  onSetValue,
  className,
}: {
  widgets: CoachDashboardWidgetData[]
  onRemove: (widgetId: string) => void
  onSetValue: (metricId: string, value: number) => void
  className?: string
}) {
  if (widgets.length === 0) return null

  return (
    <div
      className={cn(
        "mx-[var(--app-page-x)] grid gap-2 md:mx-8 md:grid-cols-2",
        className
      )}
      aria-label="Coach highlights"
    >
      {widgets.map((widget) => {
        const current = widget.entries[0]?.value ?? 0
        const target = widget.target ?? 0
        const percentage =
          target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0
        const remainingAtSixHours =
          widget.kind === "decay"
            ? current * Math.pow(0.5, 6 / (widget.halfLifeHours ?? 5))
            : null

        return (
          <article
            key={widget._id}
            className={cn(
              "group relative min-h-28 border border-l-2 border-border bg-card px-3.5 py-3",
              accentClasses[widget.accent]
            )}
          >
            <button
              type="button"
              onClick={() => onRemove(widget._id)}
              className="absolute top-1.5 right-1.5 grid size-8 place-items-center text-muted-foreground/45 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
              aria-label={`Remove ${widget.title} from dashboard`}
            >
              <X size={12} weight="bold" />
            </button>

            <div className="pr-7">
              <p className="truncate text-[9px] font-bold tracking-[0.11em] text-muted-foreground/55 uppercase">
                {widget.title}
              </p>
            </div>

            {widget.kind === "counter" ? (
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[23px] leading-none font-bold tabular-nums">
                  {compactNumber(current)}
                  <span className="ml-1 text-[9px] font-semibold text-muted-foreground">
                    {widget.unit}
                  </span>
                </p>
                <div className="flex border border-border/60">
                  <button
                    type="button"
                    disabled={current <= 0}
                    onClick={() =>
                      onSetValue(
                        widget.sourceMetricId,
                        Math.max(0, current - widget.metricStep)
                      )
                    }
                    className="motion-tactile grid size-8 place-items-center disabled:opacity-25"
                    aria-label={`Subtract ${widget.metricStep} ${widget.unit} from ${widget.title}`}
                  >
                    <Minus size={11} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSetValue(
                        widget.sourceMetricId,
                        current + widget.metricStep
                      )
                    }
                    className="motion-tactile grid size-8 place-items-center border-l border-border/60"
                    aria-label={`Add ${widget.metricStep} ${widget.unit} to ${widget.title}`}
                  >
                    <Plus size={11} weight="bold" />
                  </button>
                </div>
              </div>
            ) : widget.kind === "stat" ? (
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-[25px] leading-none font-bold tabular-nums">
                  {compactNumber(current)}
                  <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                    {widget.unit}
                  </span>
                </p>
                <ChartLineUp size={16} className="text-muted-foreground/35" />
              </div>
            ) : widget.kind === "progress" ? (
              <div className="mt-2.5">
                <div className="flex items-end justify-between gap-3">
                  <p className="text-[20px] leading-none font-bold tabular-nums">
                    {compactNumber(current)}
                    <span className="ml-1 text-[9px] text-muted-foreground">
                      {widget.unit}
                    </span>
                  </p>
                  <p className="text-[9px] text-muted-foreground tabular-nums">
                    {target > 0
                      ? `${Math.round(percentage)}% of ${compactNumber(target)}`
                      : "No target"}
                  </p>
                </div>
                <div
                  className="mt-2 h-1 overflow-hidden bg-foreground/10"
                  role="progressbar"
                  aria-label={widget.title}
                  aria-valuenow={current}
                  aria-valuemin={0}
                  aria-valuemax={target || undefined}
                >
                  <span
                    className="block h-full bg-foreground transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-3">
                <WidgetGraph widget={widget} />
                <div className="text-right">
                  <p className="text-[17px] leading-none font-bold tabular-nums">
                    {compactNumber(current)}
                    <span className="ml-0.5 text-[8px] text-muted-foreground">
                      {widget.unit}
                    </span>
                  </p>
                  <p className="mt-1 text-[8px] leading-tight text-muted-foreground/60">
                    {remainingAtSixHours == null
                      ? `${widget.entries.length}-day view`
                      : `~${compactNumber(remainingAtSixHours)} ${widget.unit} in 6h`}
                  </p>
                </div>
              </div>
            )}

            <p className="mt-2 truncate text-[8.5px] text-muted-foreground/55">
              {widget.kind === "decay"
                ? `Estimate · ${widget.halfLifeHours ?? 5}h half-life`
                : widget.description}
            </p>
          </article>
        )
      })}
    </div>
  )
}
