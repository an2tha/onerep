import { useState } from "react"
import { ArrowDown, ArrowUp, SlidersHorizontal } from "@phosphor-icons/react"
import { tr } from "../../i18n"
import { ConnectedReview } from "./connected-review"
import {
  SleepDurationChart,
  sleepDate,
  formatHours,
  InsightLink,
  type InsightLinkComponent,
} from "./sleep-analysis"
import type {
  ConnectedReviewData,
  SleepHistory,
  InsightKey,
  TodayInsightSettings,
} from "../../../../models/src/sleep-insights"
import "./today-insights.css"
export type {
  InsightKey,
  TodayInsightSettings,
} from "../../../../models/src/sleep-insights"
export const DEFAULT_INSIGHTS: TodayInsightSettings = {
  order: ["sleep", "training", "nutrition", "checkIn"],
  hidden: ["training", "nutrition", "checkIn"],
}
const labels: Record<InsightKey, string> = {
  sleep: tr("Sleep"),
  training: tr("Training"),
  nutrition: tr("Nutrition"),
  checkIn: tr("Check-in"),
}
export function TodayInsightsView({
  linkComponent: Link = InsightLink,
  today,
  date,
  history,
  review,
  settings,
  save,
}: {
  today?: string
  linkComponent?: InsightLinkComponent
  date: string
  history: SleepHistory
  review: ConnectedReviewData
  settings: TodayInsightSettings
  save: (settings: TodayInsightSettings) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const latest = [...history].reverse().find((day) => day.sleep)?.sleep ?? null
  const visible = settings.order.filter((key) => !settings.hidden.includes(key))
  const move = (index: number, delta: number) => {
    const order = [...draft.order]
    ;[order[index], order[index + delta]] = [
      order[index + delta]!,
      order[index]!,
    ]
    setDraft({ ...draft, order })
  }
  return (
    <section className="today-insights" aria-label={tr("Daily summary")}>
      <div className="today-insights-heading">
        {visible.length > 0 && <h2>{tr("Daily summary")}</h2>}
        <button
          type="button"
          aria-expanded={editing}
          onClick={() => {
            if (!editing) {
              setDraft(settings)
              setError("")
              setSaved(false)
            }
            setEditing(!editing)
          }}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {tr("Customize summary")}
        </button>
      </div>
      {editing && (
        <form
          className="today-insights-editor"
          onSubmit={async (event) => {
            event.preventDefault()
            if (busy) return
            setBusy(true)
            setError("")
            try {
              await save(draft)
              setEditing(false)
              setSaved(true)
            } catch {
              setError(
                tr(
                  "Could not save your summary. Your choices are still here. Try again."
                )
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          <p>
            {tr(
              "Choose what appears on Today. Move a summary to the top to pin it first."
            )}
          </p>
          <fieldset disabled={busy}>
            {draft.order.map((key, index) => (
              <div className="today-insights-option" key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={!draft.hidden.includes(key)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        hidden: event.target.checked
                          ? draft.hidden.filter((value) => value !== key)
                          : [...draft.hidden, key],
                      })
                    }
                  />
                  {labels[key]}
                </label>
                <button
                  type="button"
                  aria-label={tr("Move {{name}} up", { name: labels[key] })}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  aria-label={tr("Move {{name}} down", { name: labels[key] })}
                  disabled={index === draft.order.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={16} />
                </button>
              </div>
            ))}
            <div className="today-insights-editor-actions">
              <button type="submit">
                {busy ? tr("Saving…") : tr("Save summary")}
              </button>
              <button type="button" onClick={() => setEditing(false)}>
                {tr("Cancel")}
              </button>
            </div>
          </fieldset>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      {saved && (
        <p role="status" className="sleep-chart-caption">
          {tr("Daily summary saved.")}
        </p>
      )}
      <div className="today-insights-items">
        {visible.map((key) => (
          <div key={key} className="today-insight-item" data-insight={key}>
            {key === "sleep" ? (
              <>
                <Link
                  className="today-insight-title"
                  to={`/health/sleep?date=${latest?.date ?? date}`}
                >
                  {labels.sleep}
                  <span>
                    {latest ? formatHours(latest.minutes) : tr("No reading")}
                  </span>
                </Link>
                <p>
                  {latest
                    ? tr("{{date}} · Goal {{goal}}", {
                        date: sleepDate(latest.date),
                        goal: formatHours(latest.target),
                      })
                    : tr("Connect a wearable or add sleep in Health.")}
                </p>
                {latest && latest.date !== date && (
                  <p>
                    {tr(
                      "No sleep reading for the selected day. Showing the latest recorded night."
                    )}
                  </p>
                )}
                <SleepDurationChart history={history} compact />
                <p className="today-insight-chart-note">
                  {tr("Last 7 days · Main sleep and dated goals")}
                </p>
              </>
            ) : key === "training" ? (
              <>
                <Link className="today-insight-title" to="/workouts">
                  {labels.training}
                  <span>
                    {tr("{{count}} sessions", { count: review.sessions })}
                  </span>
                </Link>
                <p>
                  {tr("{{minutes}} recorded minutes in the last 7 days", {
                    minutes: review.trainingMinutes,
                  })}
                </p>
              </>
            ) : key === "nutrition" ? (
              <>
                <Link className="today-insight-title" to="/nutrition">
                  {labels.nutrition}
                  <span>
                    {tr("{{count}} of 7 days", { count: review.foodDays })}
                  </span>
                </Link>
                <p>{tr("Days with food recorded. Logs may be incomplete.")}</p>
              </>
            ) : (
              <>
                <Link className="today-insight-title" to="/coach?panel=checkin">
                  {labels.checkIn}
                  <span>
                    {review.checkIn
                      ? tr("Energy {{value}}/5", {
                          value: review.checkIn.energy,
                        })
                      : tr("No check-in")}
                  </span>
                </Link>
                <p>
                  {review.checkIn
                    ? tr(
                        "Sleep quality {{sleep}}/5 · Soreness {{soreness}}/5",
                        {
                          sleep: review.checkIn.sleepQuality,
                          soreness: review.checkIn.soreness,
                        }
                      )
                    : tr("How you feel adds context to your readings.")}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
      {visible.length > 0 && review.signals >= 2 && (
        <ConnectedReview
          review={review}
          compact
          linkComponent={Link}
          today={today}
        />
      )}
    </section>
  )
}
