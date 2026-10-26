import { tr } from "../../i18n"
import type { ConnectedReviewData } from "../../../../models/src/sleep-insights"
import {
  sleepDate,
  InsightLink,
  type InsightLinkComponent,
} from "./sleep-analysis"
import "./today-insights.css"

export type { ConnectedReviewData } from "../../../../models/src/sleep-insights"
export function reviewLead(review: ConnectedReviewData) {
  return review.focus === "checkIn"
    ? tr("Your check-in is worth considering with your plan.")
    : review.focus === "sleep"
      ? tr("Two shorter nights are worth a closer look.")
      : review.focus === "review"
        ? tr("Your week, together.")
        : tr("Build a picture of your week.")
}
export function ConnectedReview({
  linkComponent: Link = InsightLink,
  today,
  review,
  compact = false,
}: {
  today?: string
  linkComponent?: InsightLinkComponent
  review: ConnectedReviewData
  compact?: boolean
}) {
  const historical = today !== undefined && review.date < today
  return (
    <section
      className={
        compact ? "connected-review" : "connected-review sleep-section"
      }
      aria-label={tr("Connected review")}
    >
      <h2>{reviewLead(review)}</h2>
      <p className="sleep-chart-caption">
        {tr("Recorded observations from {{start}} to {{end}}", {
          start: sleepDate(review.since),
          end: sleepDate(review.date),
        })}
      </p>
      <p>
        {historical
          ? tr(
              "These observations describe the selected period. Use current readings and how you feel now when reviewing today’s plan."
            )
          : review.focus === "checkIn"
            ? tr(
                "You reported low energy or substantial soreness. Review how you feel alongside your recent training and sleep before deciding what to change."
              )
            : review.shortNights
              ? tr(
                  "Main sleep was over 30 minutes below its dated goal on each of the last two nights. Consider your sleep plan and how you feel when reviewing your next session."
                )
              : review.signals >= 2
                ? tr(
                    "These observations put your logs in context. They do not establish what caused a change or require a change to your plan."
                  )
                : tr(
                    "Add readings or logs when useful. Missing entries do not mean you slept poorly, skipped training, or ate too little."
                  )}
      </p>
      <details className="sleep-disclosure">
        <summary>{tr("See the observations")}</summary>
        <ul className="connected-evidence">
          <li>
            {tr(
              "Sleep: {{count}} of 7 nights recorded; {{below}} below the goal for that night.",
              { count: review.sleepNights, below: review.belowGoalNights }
            )}
          </li>
          <li>
            {review.sessions
              ? tr(
                  "Training: {{sessions}} recorded sessions on {{days}} days, totaling {{minutes}} minutes.",
                  {
                    sessions: review.sessions,
                    days: review.trainingDays,
                    minutes: review.trainingMinutes,
                  }
                )
              : tr("Training: no sessions recorded in this period.")}
          </li>
          {review.lastSession && (
            <li>
              {tr("Latest session: {{name}} on {{date}}.", {
                name: review.lastSession.name,
                date: sleepDate(review.lastSession.date),
              })}
            </li>
          )}
          {review.trainingIncomplete && (
            <li>
              {tr(
                "Training history reached the reading limit. Session totals may be incomplete."
              )}
            </li>
          )}
          <li>
            {tr(
              "Nutrition: food recorded on {{count}} of 7 days. Logged days may be incomplete.",
              { count: review.foodDays }
            )}
          </li>
          <li>
            {review.checkIn
              ? tr(
                  "Check-in for this day: energy {{energy}}/5, sleep quality {{sleep}}/5, soreness {{soreness}}/5.",
                  {
                    energy: review.checkIn.energy,
                    sleep: review.checkIn.sleepQuality,
                    soreness: review.checkIn.soreness,
                  }
                )
              : tr("No check-in for this day. How you feel remains unknown.")}
          </li>
        </ul>
      </details>
      <div className="connected-actions">
        <Link to={`/health/sleep?date=${review.date}`}>
          {tr("Review sleep")}
        </Link>
        <Link to="/workouts">{tr("Review training plan")}</Link>
        <Link to={`/nutrition?date=${review.date}`}>
          {tr("Review food log")}
        </Link>
        <Link to="/coach?panel=checkin">{tr("Open check-in")}</Link>
      </div>
    </section>
  )
}
