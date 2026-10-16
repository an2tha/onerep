import { safeLocalStorageGet } from "@/lib/utils"
import modelCatalog from "../../../../../convex/ai/models.json"
import { Orb } from "@repo/ui/coach"
import "./results.css"
import { ProgressChart } from "@repo/ui/coach"
import { useState } from "react"
import { useLocation } from "react-router"
import { useAction, useQuery } from "convex/react"
import { ArrowClockwise, ChatCircleDots } from "@phosphor-icons/react"
import { Button } from "@repo/ui/components/ui/button"
import { Textarea } from "@repo/ui/components/ui/textarea"
import { AnimatedAccordion } from "@repo/ui/components/animated-accordion"
import { tr, uiLocale } from "@repo/ui/i18n"
import { useAiFeatureGate } from "@/lib/ai-access"
import { coachErrorMessage } from "@/lib/coach-error"
import { currentDateKey, detectTimeZone } from "@/lib/food-log"
import { api } from "../../../../../convex/_generated/api"
import type {
  CoachCenterKind,
  CoachCenterResult,
} from "../../../../../packages/models/src/coach-center"

export const resultTitles = {
  review: "Weekly review",
  progress: "Your progress",
  plan: "Training plan",
  meals: "Meal ideas",
}
export function resultTitle(kind: CoachCenterKind) {
  switch (kind) {
    case "review":
      return tr("Weekly review")
    case "progress":
      return tr("Your progress")
    case "plan":
      return tr("Training plan")
    case "meals":
      return tr("Meal ideas")
  }
}
export function CenterResult({
  kind,
  onDiscuss,
}: {
  kind: CoachCenterKind
  onDiscuss: (text: string, kind?: CoachCenterKind) => void
}) {
  const previous = useQuery(api.ai.coachCenterState.latest, { kind })
  const generate = useAction(api.ai.coachCenter.generate)
  const { requireAiAccess, aiAccessModal, aiAccessLoading } = useAiFeatureGate()
  const location = useLocation()
  const [preferences, setPreferences] = useState(() =>
    typeof location.state?.preferences === "string"
      ? location.state.preferences.slice(0, 1200)
      : "",
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fresh, setFresh] = useState<CoachCenterResult | null>(null)
  const result =
    previous && previous.createdAt >= (fresh?.createdAt ?? 0)
      ? previous
      : (fresh ?? previous)
  async function run() {
    if (busy || !requireAiAccess(1, "coach_center")) return
    setBusy(true)
    setError("")
    try {
      setFresh(
        await generate({
          kind,
          today: currentDateKey(detectTimeZone()),
          preferences,
          model: modelCatalog.find(
            (m) => m.id === safeLocalStorageGet("onerep:coach-model:v1"),
          )?.id,
        }),
      )
    } catch (e) {
      setError(coachErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="center-result">
      {!result && (
        <div className="center-result-intro">
          <Orb small />
          <h2>{resultTitle(kind)}</h2>
        </div>
      )}
      {result && (
        <ResultBody
          key={result.createdAt}
          result={result}
          onDiscuss={onDiscuss}
        />
      )}
      <details
        className="center-request-options"
        open={
          !result ||
          Boolean(location.state?.preferences) ||
          busy ||
          Boolean(error) ||
          undefined
        }
      >
        <summary>
          {result ? tr("Generate again") : tr("Generate with Coach")}
        </summary>
        <form
          className="center-request"
          onSubmit={(e) => {
            e.preventDefault()
            void run()
          }}
        >
          <label htmlFor="center-preferences">
            {kind === "plan"
              ? tr("Days available, equipment, and session length")
              : kind === "meals"
                ? tr("Dietary needs, ingredients, and cooking time")
                : tr("Anything you want Coach to focus on?")}
          </label>
          <Textarea
            id="center-preferences"
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            maxLength={1200}
            rows={2}
          />
          <Button
            type="submit"
            disabled={busy || aiAccessLoading || previous === undefined}
          >
            {busy ? (
              tr("Preparing your result…")
            ) : result ? (
              <>
                <ArrowClockwise size={16} />
                {tr("Generate again")}
              </>
            ) : (
              tr("Generate with Coach")
            )}
          </Button>
        </form>
      </details>
      {error && (
        <div className="center-error" role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => void run()} disabled={busy}>
            {tr("Retry")}
          </Button>
        </div>
      )}
      {busy && (
        <p role="status">{tr("Reviewing your logs and preferences…")}</p>
      )}
      {previous === undefined && !fresh && (
        <p role="status">{tr("Loading your latest result…")}</p>
      )}
      {previous === null && !fresh && !busy && (
        <p className="center-muted">
          {tr(
            "Generate a saved suggestion from your OneRep data. Your routine and food log stay unchanged.",
          )}
        </p>
      )}
      {aiAccessModal}
    </section>
  )
}
export function ResultBody({
  result,
  onDiscuss,
}: {
  result: CoachCenterResult
  onDiscuss: (text: string, kind?: CoachCenterKind) => void
}) {
  const { content, kind } = result
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const ingredients = [...new Set(content.meals.flatMap((m) => m.ingredients))]
  return (
    <article className="center-result-body">
      <header className="center-result-heading">
        <div>
          <div className="center-result-meta">
            {tr("Saved")} ·{" "}
            {new Date(result.createdAt).toLocaleString(uiLocale(), {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
          <h2 className="center-result-title">{content.title}</h2>
          <ResultSummary text={content.summary} />
        </div>
        <Orb small />
      </header>
      {(kind === "review" || kind === "progress") &&
        result.activity.length > 0 && (
          <figure className="center-activity">
            <figcaption>{tr("Logged sessions, last 7 days")}</figcaption>
            <div
              className="center-bars"
              role="img"
              aria-label={result.activity
                .map((d) => `${d.date}: ${d.sessions}`)
                .join(", ")}
            >
              {result.activity.map((d) => (
                <div key={d.date}>
                  <span>{d.sessions}</span>
                  <i
                    style={{
                      height: Math.max(
                        2,
                        (d.sessions /
                          Math.max(
                            1,
                            ...result.activity.map((d) => d.sessions),
                          )) *
                          100,
                      ),
                    }}
                  />
                  <small>
                    {new Date(d.date + "T12:00:00").toLocaleDateString(
                      uiLocale(),
                      { weekday: "short" },
                    )}
                  </small>
                </div>
              ))}
            </div>
            <p>{tr("Counts reflect saved workouts, not all activity.")}</p>
          </figure>
        )}
      {kind === "progress" && result.series && (
        <ProgressChart series={result.series} />
      )}
      {content.sessions.map((session, i) => (
        <AnimatedAccordion
          key={i}
          className="center-accordion"
          summary={
            <>
              <span className="center-session-heading">
                <span>
                  <small>{session.day}</small>
                  <strong>{session.title}</strong>
                </span>
                <span className="center-session-duration">
                  {session.durationMinutes} {tr("min")}
                </span>
              </span>
              <span className="center-session-meter" aria-hidden="true">
                <i
                  style={{
                    width: `${(session.durationMinutes / Math.max(...content.sessions.map((s) => s.durationMinutes))) * 100}%`,
                  }}
                />
              </span>
            </>
          }
        >
          <ol className="center-exercises">
            {session.exercises.map((exercise, j) => (
              <li key={j}>
                <strong>{exercise.name}</strong>
                <span>
                  {exercise.sets} × {exercise.reps} · {exercise.restSeconds}s{" "}
                  {tr("rest")}
                </span>
                <p>{exercise.note}</p>
              </li>
            ))}
          </ol>
        </AnimatedAccordion>
      ))}
      {content.meals.map((meal, i) => (
        <AnimatedAccordion
          key={i}
          className="center-accordion"
          summary={
            <>
              <strong>{meal.name}</strong>
              <small>
                {meal.meal} · {meal.minutes} {tr("min")}
              </small>
            </>
          }
        >
          <h4>{tr("Ingredients")}</h4>
          <ul>
            {meal.ingredients.map((ingredient, j) => (
              <li key={j}>{ingredient}</li>
            ))}
          </ul>
          <h4>{tr("Method")}</h4>
          <ol>
            {meal.steps.map((step, j) => (
              <li key={j}>{step}</li>
            ))}
          </ol>
        </AnimatedAccordion>
      ))}
      {ingredients.length > 0 && (
        <AnimatedAccordion
          className="center-accordion"
          summary={tr("Shopping checklist")}
        >
          <p className="center-muted">
            {tr("Check what you have. Quantities are listed per meal.")}
          </p>
          {ingredients.map((ingredient, i) => (
            <label className="center-check" key={ingredient}>
              <input
                type="checkbox"
                checked={checked.has(i)}
                onChange={() =>
                  setChecked((prev) => {
                    const next = new Set(prev)
                    next.has(i) ? next.delete(i) : next.add(i)
                    return next
                  })
                }
              />
              <span>{ingredient}</span>
            </label>
          ))}
        </AnimatedAccordion>
      )}
      {content.nextSteps.length > 0 && (
        <section className="center-next-steps">
          <h3>{tr("Next steps")}</h3>
          <ol>
            {content.nextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}
      {content.observations.length > 0 && (
        <div className="center-observations">
          {content.observations.map((item, i) => (
            <AnimatedAccordion
              key={i}
              className="center-accordion"
              summary={item.title}
            >
              <p>{item.detail}</p>
            </AnimatedAccordion>
          ))}
        </div>
      )}
      {content.limitations.length > 0 && (
        <section className="center-limitations">
          <h3>{tr("What remains uncertain")}</h3>
          <ul>
            {content.limitations.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      <Button
        variant="secondary"
        className="center-discuss"
        onClick={() =>
          onDiscuss(
            `I want to discuss my saved ${resultTitles[kind]} from ${result.today}: ${content.title}. Ask what I want to explore before applying anything.`,
            kind,
          )
        }
      >
        <ChatCircleDots size={18} />
        {tr("Discuss with Coach")}
      </Button>
    </article>
  )
}

function ResultSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  if (text.length <= 280) return <p className="center-result-summary">{text}</p>
  // The full saved text stays available, including older, more verbose results.
  const sentence = text.match(/^.{40,240}?[.!?](?:\s|$)/s)?.[0]?.trim()
  const preview = sentence ?? text.slice(0, 240).replace(/\s+\S*$/, "") + "…"
  return (
    <div className="center-result-summary">
      <p>{expanded ? text : preview}</p>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? tr("Show less") : tr("More details")}
      </button>
    </div>
  )
}
