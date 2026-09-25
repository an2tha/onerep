import { Message, tr, uiLocale } from "@repo/ui/i18n"
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
    <MobileSheet
      ariaLabel={tr("{{value0}} history", { value0: metric.title })}
      onClose={onClose}
    >
      <div className="journal-form journal-history-panel">
        <div className="journal-section-heading">
          <h2>{metric.title}</h2>
          <button
            type="button"
            aria-label={tr("Close history")}
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
        <p className="journal-caption">
          <Message
            text={"History through {{value0}}"}
            values={{
              value0: new Date(`${date}T12:00:00`).toLocaleDateString(
                uiLocale(),
                {
                  dateStyle: "medium",
                }
              ),
            }}
          />
        </p>
        <div
          className="journal-filters"
          role="group"
          aria-label={tr("History period")}
        >
          {[7, 28].map((period) => (
            <button
              key={period}
              aria-pressed={days === period}
              onClick={() => setDays(period)}
            >
              <Message
                text={"Last {{value0}} days"}
                values={{ value0: period }}
              />
            </button>
          ))}
        </div>
        <dl className="journal-history-summary">
          <div>
            <dt>{tr("Days logged")}</dt>
            <dd>
              {summary.count} / {days}
            </dd>
          </div>
          <div>
            <dt>
              {metric.kind === "number"
                ? tr("Average reading")
                : metric.kind === "toggle"
                  ? tr("Days marked yes")
                  : tr("Total logged")}
            </dt>
            <dd>
              {metric.kind === "toggle"
                ? tr("{{value0}} / {{value1}}", {
                    value0: summary.yes,
                    value1: summary.count,
                  })
                : metricValue(summary.value, metric.kind, metric.unit)}
            </dd>
          </div>
        </dl>
        <p className="journal-caption">
          {tr(
            "Missing days are excluded from summaries. Tap a day to add or correct its reading."
          )}
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
                aria-label={tr("Edit {{value0}} on {{value1}}", {
                  value0: metric.title,
                  value1: day,
                })}
              >
                <span>
                  {new Date(`${day}T12:00:00`).toLocaleDateString(uiLocale(), {
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
