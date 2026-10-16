import { useId, useState } from "react"
import { NativeSelect } from "../ui/native-select"
import { AnimatedAccordion } from "../animated-accordion"
import { tr, uiLocale } from "../../i18n"
import type { CoachCenterResult } from "@repo/models/coach-center"

export function ProgressChart({
  series,
}: {
  series: NonNullable<CoachCenterResult["series"]>
}) {
  const [selected, setSelected] = useState(0)
  const id = useId()
  const metric = series[selected] ?? series[0]
  if (!metric) return null
  const values = metric.points.map((p) => p.value)
  const low = Math.min(...values),
    high = Math.max(...values)
  const padding = Math.max((high - low) * 0.15, Math.abs(high) * 0.01, 0.1)
  const min = low - padding,
    max = high + padding
  const times = metric.points.map((p) => Date.parse(p.date))
  const first = Math.min(...times),
    last = Math.max(...times)
  const x = (time: number) =>
    last === first ? 260 : 64 + ((time - first) / (last - first)) * 416
  const y = (value: number) => 190 - ((value - min) / (max - min)) * 150
  const format = (value: number) =>
    value.toLocaleString(uiLocale(), { maximumFractionDigits: 2 })
  const date = (value: string) =>
    new Date(value + "T12:00:00").toLocaleDateString(uiLocale(), {
      month: "short",
      day: "numeric",
    })
  return (
    <section className="center-progress-chart">
      <label htmlFor={id}>{tr("Progress metric")}</label>
      <NativeSelect
        id={id}
        value={selected}
        onChange={(e) => setSelected(Number(e.target.value))}
      >
        {series.map((m, i) => (
          <option key={i} value={i}>
            {m.title} ({m.unit})
          </option>
        ))}
      </NativeSelect>
      <svg
        viewBox="0 0 520 240"
        role="img"
        aria-label={`${metric.title}: ${metric.points.map((p) => `${p.date}: ${format(p.value)} ${metric.unit}`).join("; ")}`}
      >
        <text x="64" y="20" fill="currentColor" fontSize="12">
          {metric.unit}
        </text>
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}>
            <line
              x1="64"
              x2="480"
              y1={y(v)}
              y2={y(v)}
              stroke="var(--divider)"
            />
            <text
              x="52"
              y={y(v) + 4}
              textAnchor="end"
              fill="var(--muted-foreground)"
              fontSize="12"
            >
              {format(v)}
            </text>
          </g>
        ))}
        {metric.points.map((p, i) => (
          <circle
            key={i}
            cx={x(times[i])}
            cy={y(p.value)}
            r="4"
            fill="var(--accent-progress)"
          >
            <title>
              {p.date}: {format(p.value)} {metric.unit}
            </title>
          </circle>
        ))}
        <text x="64" y="220" fill="var(--muted-foreground)" fontSize="12">
          {date(metric.points[0].date)}
        </text>
        <text
          x="480"
          y="220"
          textAnchor="end"
          fill="var(--muted-foreground)"
          fontSize="12"
        >
          {date(metric.points.at(-1)!.date)}
        </text>
      </svg>
      <p className="center-muted">
        {tr(
          "Recorded measurements only. The vertical axis is cropped to the observed range; missing days are not estimated.",
        )}
      </p>
      <AnimatedAccordion summary={tr("View measurements")}>
        <table>
          <thead>
            <tr>
              <th>{tr("Date")}</th>
              <th>{metric.unit}</th>
            </tr>
          </thead>
          <tbody>
            {metric.points.map((p, i) => (
              <tr key={i}>
                <td>{p.date}</td>
                <td>{format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AnimatedAccordion>
    </section>
  )
}
