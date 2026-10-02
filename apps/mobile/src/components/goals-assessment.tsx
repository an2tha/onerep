import { useState } from "react"
import { tr } from "@repo/ui/i18n"
import { ArrowUpRight } from "@phosphor-icons/react"
import type {
  GoalAssessment,
  AssessmentSignal,
} from "../../../../convex/lib/goalAssessment"
import { GoalsDisclosure } from "@/components/goals-disclosure"
import { useSmoothNavigate } from "@/lib/navigation"

const FACTORS: Record<string, string> = {
  training: "Training volume",
  spacing: "Muscle spacing",
  sleep: "Sleep",
  recovery: "Recovery readings",
  activity: "Daily activity",
  performance: "Lift performance",
}
function minutes(value: number | null) {
  if (value === null) return tr("Not enough readings")
  const rounded = Math.round(value)
  return tr("{{hours}}h {{minutes}}m", {
    hours: Math.floor(rounded / 60),
    minutes: rounded % 60,
  })
}
function Sensor({
  title,
  signal,
  unit,
  sleep = false,
}: {
  title: string
  signal: AssessmentSignal
  unit: string
  sleep?: boolean
}) {
  return (
    <div className="goal-sensor">
      <h4>{title}</h4>
      <strong>
        {signal.recent === null
          ? tr("Not enough readings")
          : sleep
            ? minutes(signal.recent)
            : `${Math.round(signal.recent).toLocaleString()} ${unit}`}
      </strong>
      <p>
        {signal.baseline === null
          ? tr("Building your baseline")
          : tr("Usual: {{value}}", {
              value: sleep
                ? minutes(signal.baseline)
                : `${Math.round(signal.baseline).toLocaleString()} ${unit}`,
            })}
      </p>
      <small>
        {signal.latestDate
          ? tr("Last reading: {{date}}", { date: signal.latestDate })
          : tr("No readings synced")}
      </small>
    </div>
  )
}
export function GoalsAssessment({
  assessment,
}: {
  assessment: GoalAssessment | null | undefined
}) {
  const navigate = useSmoothNavigate()
  const [reviewOnly, setReviewOnly] = useState(false)
  if (assessment === undefined)
    return (
      <div className="goal-assessment-loading" role="status">
        {tr("Checking training, sleep and recovery…")}
      </div>
    )
  if (!assessment)
    return (
      <p className="goals-caption">
        {tr("Save a goal to see your whole-body assessment.")}
      </p>
    )
  const a = assessment
  const scored = a.factors.filter((f) => f.score !== null)
  const muscles = reviewOnly
    ? a.muscles.filter(
        (m) => (m.score !== null && m.score < 75) || m.closeSpacing
      )
    : a.muscles
  return (
    <div className="goal-assessment">
      <section
        className="goal-score-panel"
        aria-label={tr("Whole-body assessment")}
      >
        <div className="goal-score-heading">
          <h3>{tr("Training support")}</h3>
          <span>
            {a.from} · {a.to}
          </span>
        </div>
        <div className="goal-score-overview">
          <div
            className="goal-score-number"
            aria-label={
              a.score === null
                ? tr("Overall score unavailable")
                : tr("Training support score: {{score}} out of 100", {
                    score: a.score,
                  })
            }
          >
            <strong>{a.score ?? "··"}</strong>
            <span>
              {a.score === null ? tr("Not scored") : tr("out of 100")}
            </span>
          </div>
          <div>
            <h4>
              {a.paused
                ? tr("Scoring paused")
                : a.caution
                  ? tr("Recovery needs attention")
                  : a.score === null
                    ? tr("More data needed")
                    : a.score >= 80
                      ? tr("Most measured factors are on track")
                      : tr("Some areas need a review")}
            </h4>
            <p>
              {a.paused
                ? tr(
                    "Follow your current recovery or care plan before increasing training."
                  )
                : tr(
                    "{{coverage}}% of scoring inputs available. {{count}} of 6 areas assessed.",
                    { coverage: a.coverage, count: scored.length }
                  )}
            </p>
            <p className="goals-caption">
              {tr(
                "A planning score from your logs, not a measurement of muscle growth or a guarantee that you are ready to train."
              )}
            </p>
          </div>
        </div>
        <p className="goals-caption">
          {tr(
            "{{assessed}} of {{total}} muscle groups have enough data for a range comparison.",
            { assessed: a.context.assessedMuscles, total: a.muscles.length }
          )}
        </p>
        <div className="goal-factor-grid">
          {a.factors.map((f) => (
            <div className="goal-factor" key={f.id}>
              <div>
                <span>{tr(FACTORS[f.id])}</span>
                <strong>
                  {f.score === null ? tr("Unknown") : `${f.score}/100`}
                </strong>
              </div>
              <div className="goal-factor-track" aria-hidden="true">
                <span style={{ width: `${f.score ?? 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section
        className="goal-suggestions"
        aria-label={tr("Suggested changes")}
      >
        <h3>{tr("What to do next")}</h3>
        {a.suggestions.slice(0, 3).map((s) => (
          <article key={s.id}>
            <h4>{tr(s.title, s.values)}</h4>
            <p>{tr(s.detail, s.values)}</p>
            <button
              className="goals-text-button"
              onClick={() => navigate(s.destination)}
            >
              {tr("Review")} <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </article>
        ))}
        {a.suggestions.length > 3 && (
          <GoalsDisclosure title={tr("More suggestions")}>
            {a.suggestions.slice(3).map((s) => (
              <article key={s.id}>
                <h4>{tr(s.title, s.values)}</h4>
                <p>{tr(s.detail, s.values)}</p>
                <button
                  className="goals-text-button"
                  onClick={() => navigate(s.destination)}
                >
                  {tr("Review")} <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              </article>
            ))}
          </GoalsDisclosure>
        )}
      </section>
      <section
        className="goal-sensors"
        aria-label={tr("Sleep and health readings")}
      >
        <Sensor title={tr("Sleep")} signal={a.signals.sleep} unit="" sleep />
        <Sensor
          title={tr("Resting heart rate")}
          signal={a.signals.rhr}
          unit={tr("bpm")}
        />
        <Sensor
          title={tr("Heart rate variability")}
          signal={a.signals.hrv}
          unit={tr("ms")}
        />
        <Sensor
          title={tr("Steps per day")}
          signal={a.signals.steps}
          unit={tr("steps")}
        />
      </section>
      <div className="goal-muscles">
        <GoalsDisclosure
          title={tr("All muscle groups · {{count}}", {
            count: a.muscles.length,
          })}
          defaultOpen
        >
          <p>
            {tr(
              "The last seven days, including today. Indirect sets count as half a set when comparing with your previous three weeks. Your selected muscle uses its chosen direct-set range. Other ranges describe your usual workload, not an established optimum."
            )}
          </p>
          <button
            className="goal-muscle-filter"
            aria-pressed={reviewOnly}
            onClick={() => setReviewOnly((value) => !value)}
          >
            {tr("Show only areas to review")}
          </button>
          <div className="goal-muscle-grid">
            {muscles.map((m) => (
              <div className="goal-muscle-row" key={m.muscle}>
                <div className="goal-muscle-name">
                  <h5>{tr(m.muscle)}</h5>
                  <strong>
                    {m.score === null ? tr("Not scored") : `${m.score}/100`}
                  </strong>
                </div>
                <p>
                  {tr("{{direct}} direct · {{indirect}} indirect sets", {
                    direct: m.direct,
                    indirect: m.indirect,
                  })}
                </p>
                <div className="goal-muscle-range" aria-hidden="true">
                  <span style={{ width: `${m.score ?? 0}%` }} />
                </div>
                <small>
                  {m.min === null
                    ? tr("Not enough history for a range")
                    : m.basis === "chosen"
                      ? tr("Chosen range: {{min}} to {{max}} direct sets", {
                          min: m.min,
                          max: m.max!,
                        })
                      : tr("Usual range: {{min}} to {{max}} weighted sets", {
                          min: m.min,
                          max: m.max!,
                        })}
                </small>
                <small>
                  {m.lastDate === null
                    ? tr("No mapped work in 28 days")
                    : tr("Last logged work: {{days}} calendar days ago", {
                        days: m.daysSince!,
                      })}
                </small>
                {m.closeSpacing && (
                  <small className="goal-spacing-note">
                    {tr("Substantial work on consecutive dates")}
                  </small>
                )}
                {m.effortReadings > 0 && (
                  <small>
                    {tr(
                      "{{hard}} of {{logged}} effort-rated sets ended within 1 rep of failure",
                      { hard: m.hardSets, logged: m.effortReadings }
                    )}
                  </small>
                )}
              </div>
            ))}
          </div>
          {muscles.length === 0 && (
            <p>{tr("No muscle groups meet this filter.")}</p>
          )}
          <p>
            {tr(
              "No recent log does not mean a muscle was neglected. Time since logged work is not a recovery measurement. Muscle scores describe range matching, not muscle health."
            )}
          </p>
        </GoalsDisclosure>
      </div>
      <GoalsDisclosure title={tr("Nutrition, activity and body trends")}>
        <dl className="goal-context">
          <div>
            <dt>{tr("Recorded exercise")}</dt>
            <dd>
              {tr("{{minutes}} min · previous 7 days: {{previous}} min", {
                minutes: a.context.minutes,
                previous: a.context.previousMinutes,
              })}
            </dd>
          </div>
          <div>
            <dt>{tr("Logged protein")}</dt>
            <dd>
              {a.context.protein === null
                ? tr("No recent food logs")
                : tr("{{protein}} g/day across {{days}} logged days", {
                    protein: a.context.protein,
                    days: a.context.foodDays,
                  })}
            </dd>
          </div>
          <div>
            <dt>{tr("Logged calories")}</dt>
            <dd>
              {a.context.calories === null
                ? tr("No recent food logs")
                : tr("{{calories}} kcal/day", { calories: a.context.calories })}
            </dd>
          </div>
          <div>
            <dt>{tr("Weight trend")}</dt>
            <dd>
              {a.context.weightChange === null
                ? tr("Needs 3 weigh-ins in each of two weeks")
                : tr("{{change}} kg between weekly averages", {
                    change: a.context.weightChange,
                  })}
            </dd>
          </div>
          <div>
            <dt>{tr("Journal")}</dt>
            <dd>
              {tr(
                "{{days}} days logged · {{alcohol}} days with alcohol recorded",
                { days: a.context.journalDays, alcohol: a.context.alcoholDays }
              )}
            </dd>
          </div>
          <div>
            <dt>{tr("Wearable sleep stages")}</dt>
            <dd>
              {tr("Deep: {{deep}} · REM: {{rem}}", {
                deep: minutes(a.context.deepSleep),
                rem: minutes(a.context.remSleep),
              })}
            </dd>
          </div>
        </dl>
        <p>
          {tr(
            "Food logs may be incomplete, so low logged intake prompts a review rather than lowering the score. Weight changes do not identify muscle gain. Sleep-stage estimates and journal entries provide context and are not graded."
          )}
        </p>
        <button
          className="goals-text-button"
          onClick={() => navigate("/nutrition?programme=setup")}
        >
          {tr("Review nutrition programme")}
        </button>
      </GoalsDisclosure>
      <GoalsDisclosure title={tr("How this score is calculated")}>
        <p>
          {tr(
            "Version {{version}}. An unvalidated planning model: training volume 35%, muscle spacing 10%, sleep 20%, recovery readings 20%, daily activity 5%, lift performance 10%.",
            { version: a.version }
          )}
        </p>
        <p>
          {tr(
            "Training coverage depends on how many muscle groups can be assessed. Missing factors are excluded and the remaining weights are rescaled. The overall score is withheld below 70% coverage or without training plus sleep or recovery data. Scores are rounded to 5 points. Poor sleep or several adverse recovery signals cap the score and suppress suggestions to add training."
          )}
        </p>
        {a.factors.map((f) => (
          <div className="goal-method-factor" key={f.id}>
            <strong>{tr(FACTORS[f.id])}</strong>
            <p>{tr(f.reason)}</p>
          </div>
        ))}
        <p>
          {tr(
            "Recovery compares at least two recent readings with at least seven earlier readings from the same provider. HRV from different platforms is not pooled. Steps exclude today. Linked imported workouts are excluded from exercise minutes to avoid counting them twice."
          )}
        </p>
        {a.context.truncated && (
          <p>
            {tr(
              "This account exceeds the assessment’s data limit. Training factors are withheld until a complete window can be analysed."
            )}
          </p>
        )}
        <p>
          {tr(
            "The weights, 5% resting-heart-rate rise, 10% HRV drop and workload review thresholds are product heuristics, not medical or physiological cutoffs. Do not train through pain or illness to improve a score."
          )}
        </p>
        <a
          href="https://pubmed.ncbi.nlm.nih.gov/26423706/"
          target="_blank"
          rel="noreferrer"
        >
          {tr("Research on athlete monitoring")} ↗
        </a>
        <br />
        <a
          href="https://bjsm.bmj.com/content/55/7/356"
          target="_blank"
          rel="noreferrer"
        >
          {tr("Athlete sleep consensus")} ↗
        </a>
      </GoalsDisclosure>
    </div>
  )
}
