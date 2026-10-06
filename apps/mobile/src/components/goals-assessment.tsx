import { tr } from "@repo/ui/i18n"
import type {
  GoalAssessment,
  AssessmentFactor,
} from "../../../../convex/lib/goalAssessment"
import { GoalsDisclosure } from "@/components/goals-disclosure"
import { useSmoothNavigate } from "@/lib/navigation"

const CATEGORIES = [
  {
    id: "training",
    label: "Training",
    factors: ["training", "spacing", "performance"],
  },
  { id: "sleep", label: "Sleep", factors: ["sleep"] },
  { id: "recovery", label: "Recovery (HRV)", factors: ["recovery"] },
  { id: "activity", label: "Activity", factors: ["activity"] },
] as const

function categoryScore(factors: AssessmentFactor[], ids: readonly string[]) {
  const available = factors.filter(
    (factor) => ids.includes(factor.id) && factor.score !== null,
  )
  if (!available.length) return null
  const weight = available.reduce((sum, factor) => sum + factor.weight, 0)
  return Math.round(
    available.reduce((sum, factor) => sum + factor.score! * factor.weight, 0) /
      weight,
  )
}

function actionLabel(destination: string) {
  if (destination.startsWith("/health")) return tr("Open health")
  if (destination.startsWith("/nutrition")) return tr("Open nutrition")
  if (destination.startsWith("/journal")) return tr("Open journal")
  return tr("Open training")
}

export function GoalsAssessment({
  assessment,
}: {
  assessment: GoalAssessment | null | undefined
}) {
  const navigate = useSmoothNavigate()
  if (assessment === undefined)
    return (
      <p role="status" className="goal-assessment-loading">
        {tr("Checking your signals…")}
      </p>
    )
  if (!assessment) return null

  const a = assessment
  const categories = CATEGORIES.map((category) => ({
    ...category,
    score: categoryScore(a.factors, category.factors),
  }))
  const hasTraining = categories[0].score !== null
  const hasHealth = categories[1].score !== null || categories[2].score !== null
  const missingStep = !hasTraining
    ? "training"
    : !hasHealth
      ? "health"
      : "training-detail"
  const next = a.suggestions[0]
  const scoreLabel = a.paused
    ? tr("Paused")
    : a.caution
      ? tr("Ease back")
      : a.score === null
        ? tr("Build your baseline")
        : a.score >= 80
          ? tr("In your zone")
          : tr("Adjust your plan")

  return (
    <div className="goal-assessment">
      <section className="goal-zone" aria-label={tr("Whole-body assessment")}>
        <div className="goal-zone-heading">
          <h3>{tr("Your zone")}</h3>
          <span>{tr("Last 7 days")}</span>
        </div>
        <div className="goal-zone-result">
          <strong
            aria-label={
              a.score === null
                ? tr("Overall score unavailable")
                : tr("Training support score: {{score}} out of 100", {
                    score: a.score,
                  })
            }
          >
            {a.score ?? "—"}
          </strong>
          <div>
            <h4>{scoreLabel}</h4>
            <span>
              {a.score === null
                ? tr("No score yet")
                : tr("Training support · out of 100")}
            </span>
          </div>
        </div>
        <div
          className="goal-zone-scale"
          aria-label={tr("Optimal zone starts at 80 out of 100")}
        >
          <span className="goal-zone-optimal" />
          {a.score !== null && (
            <span
              className="goal-zone-marker"
              style={{ left: `${a.score}%` }}
            />
          )}
        </div>
        <div className="goal-zone-scale-labels">
          <span>0</span>
          <span>{tr("Optimal zone · 80–100")}</span>
        </div>
        {categories.every((category) => category.score === null) ? (
          <p className="goal-empty-signals">
            {tr("Training · Sleep · Recovery · Activity")}
          </p>
        ) : (
          <div
            className="goal-category-grid"
            aria-label={tr("Category breakdown")}
          >
            {categories.map((category) => (
              <div className="goal-category" key={category.id}>
                <div>
                  <span>{tr(category.label)}</span>
                  <strong>
                    {category.score === null ? tr("No data") : category.score}
                  </strong>
                </div>
                <div className="goal-category-track" aria-hidden="true">
                  <span style={{ width: `${category.score ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {a.score === null && !a.paused && !a.caution ? (
        <section className="goal-next" aria-label={tr("Next step")}>
          <h3>{tr("Next step")}</h3>
          <p>
            {missingStep === "health"
              ? tr("Connect health to complete your zone.")
              : missingStep === "training-detail"
                ? tr("Log more complete workouts to build your baseline.")
                : tr("Log a workout to start your zone.")}
          </p>
          <div className="goal-next-actions">
            <button
              className="goals-primary"
              onClick={() =>
                navigate(missingStep === "health" ? "/health" : "/workouts")
              }
            >
              {missingStep === "health"
                ? tr("Connect health")
                : tr("Log a workout")}
            </button>
            {!hasHealth && !hasTraining && (
              <button
                className="goals-text-button"
                onClick={() => navigate("/health")}
              >
                {tr("Connect health")}
              </button>
            )}
          </div>
        </section>
      ) : next ? (
        <section className="goal-next" aria-label={tr("Next step")}>
          <h3>{tr("Next step")}</h3>
          <p>{tr(next.title, next.values)}</p>
          <button
            className="goals-primary"
            onClick={() => navigate(next.destination)}
          >
            {actionLabel(next.destination)}
          </button>
        </section>
      ) : null}

      <GoalsDisclosure title={tr("How this works")}>
        <p>
          {tr(
            "This is a planning score from your logs, not a measure of muscle growth or medical readiness. The highlighted zone starts at 80. Missing data is never counted as zero.",
          )}
        </p>
        {next && <p>{tr(next.detail, next.values)}</p>}
        {a.factors.map((factor) => (
          <p key={factor.id}>
            <strong>
              {tr(
                factor.id === "training"
                  ? "Training"
                  : factor.id === "spacing"
                    ? "Workout spacing"
                    : factor.id === "performance"
                      ? "Performance"
                      : factor.id === "recovery"
                        ? "HRV and resting heart rate"
                        : factor.id === "activity"
                          ? "Activity"
                          : "Sleep",
              )}
              :{" "}
            </strong>
            {tr(factor.reason)}
          </p>
        ))}
        <p>
          {tr(
            "Sleep uses recent readings. Recovery compares HRV and resting heart rate with your own earlier readings. Training compares logged work with your recent history.",
          )}
        </p>
      </GoalsDisclosure>
    </div>
  )
}
