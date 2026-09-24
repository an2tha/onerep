import { useState } from "react"
import { PencilSimple, X } from "@phosphor-icons/react"
import { MobileSheet } from "@/components/mobile-sheet"
import type { JournalMetric } from "./tracker-studio"
import { metricValue, shiftDay } from "./trackers"

export function summarizeReadings(
  metric: JournalMetric,
  date: string,
  days: number
) {
  const start = shiftDay(date, 1 - days)
  const entries = metric.entries.filter(
    (entry) => entry.date >= start && entry.date <= date
  )
  const total = entries.reduce((sum, entry) => sum + entry.value, 0)
  return {
    count: entries.length,
    value: entries.length
      ? metric.kind === "number"
        ? total / entries.length
        : total
      : undefined,
    yes: entries.filter((entry) => entry.value === 1).length,
  }
}

export function TrackerHistory({
  metric,
  date,
  onClose,
  onEdit,
}: {
  metric: JournalMetric
  date: string
  onClose: () => void
  onEdit: (date: string) => void
}) {
  const [days, setDays] = useState(7)
  const summary = summarizeReadings(metric, date, days)
  const dates = Array.from({ length: days }, (_, i) => shiftDay(date, -i))
  return (
    <MobileSheet ariaLabel={`${metric.title} history`} onClose={onClose}>
      <div className="journal-form journal-history-panel">
        <div className="journal-section-heading">
          <h2>{metric.title}</h2>
          <button type="button" aria-label="Close history" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        <p className="journal-caption">
          History through{" "}
          {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
            dateStyle: "medium",
          })}
        </p>
        <div
          className="journal-filters"
          role="group"
          aria-label="History period"
        >
          {[7, 28].map((period) => (
            <button
              key={period}
              aria-pressed={days === period}
              onClick={() => setDays(period)}
            >
              Last {period} days
            </button>
          ))}
        </div>
        <dl className="journal-history-summary">
          <div>
            <dt>Days logged</dt>
            <dd>
              {summary.count} / {days}
            </dd>
          </div>
          <div>
            <dt>
              {metric.kind === "number"
                ? "Average reading"
                : metric.kind === "toggle"
                  ? "Days marked yes"
                  : "Total logged"}
            </dt>
            <dd>
              {metric.kind === "toggle"
                ? `${summary.yes} / ${summary.count}`
                : metricValue(summary.value, metric.kind, metric.unit)}
            </dd>
          </div>
        </dl>
        <p className="journal-caption">
          Missing days are excluded from summaries. Tap a day to add or correct
          its reading.
        </p>
        <div className="journal-history-rows">
          {dates.map((day) => {
            const value = metric.entries.find(
              (entry) => entry.date === day
            )?.value
            return (
              <button
                key={day}
                onClick={() => onEdit(day)}
                aria-label={`Edit ${metric.title} on ${day}`}
              >
                <span>
                  {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <strong data-empty={value === undefined}>
                  {metricValue(value, metric.kind, metric.unit)}
                </strong>
                <PencilSimple size={16} />
              </button>
            )
          })}
        </div>
      </div>
    </MobileSheet>
  )
}
