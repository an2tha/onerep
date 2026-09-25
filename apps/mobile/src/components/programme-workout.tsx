import { Message, tr, translateError } from "@repo/ui/i18n"
import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
  localProgrammeTime,
  plannedWorkoutStrain,
  programmeCompatibility,
  programmeDay,
  PROGRAMME_NAMES,
} from "../../../../convex/lib/nutritionProgramme"
import { dampenWorkout, boundedAiDampening } from "@/lib/programme-workout"
import type { ExerciseState } from "@/lib/workout-logging"
import { CoachSheet } from "@/components/coach-sheet"
import { MobileSheet } from "@/components/mobile-sheet"
import { toast } from "@repo/ui"
import "@/styles/nutrition-programme.css"

export function ProgrammeWorkout({
  data,
  names,
  onApply,
}: {
  data: Record<string, ExerciseState>
  names: Record<string, string>
  onApply: (data: Record<string, ExerciseState>) => void
}) {
  const programme = useQuery(api.nutritionProgrammes.getCurrent, {})
  const activeFast = useQuery(api.logs.fasting.getActive, {})
  const [now, setNow] = useState(() => new Date())
  const [coach, setCoach] = useState(false)
  const [proposal, setProposal] = useState<{
    before: string
    after: Record<string, ExerciseState>
    source: string
  } | null>(null)
  const [undo, setUndo] = useState<{
    before: Record<string, ExerciseState>
    after: string
  } | null>(null)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  if (!programme || programme.requiresCare) return null
  const time = localProgrammeTime(programme.timezone, now)
  if (!programmeDay(programme, time.date).active) return null
  const strain = plannedWorkoutStrain(data)
  const check = programmeCompatibility(
    programme,
    time.date,
    time.minute,
    strain,
    !!activeFast
  )
  const summary = JSON.stringify(
    Object.entries(data).map(([id, state]) => ({
      name: names[id] ?? id,
      remainingSets: state.sets.filter((s) => !s.completed),
    }))
  )
  return (
    <section
      className="programme-workout"
      aria-label={tr("Programme workout compatibility")}
    >
      <h2>
        {check.status === "too_demanding"
          ? tr("A lighter session fits today")
          : check.status === "watch"
            ? tr("Keep recovery in view")
            : tr("Training with your programme")}
      </h2>
      <p>
        <Message
          text={"{{value0}} · Estimated strain {{value1}}/100"}
          values={{
            value0: PROGRAMME_NAMES[programme.goal],
            value1: strain ?? "—",
          }}
        />
      </p>
      <p>{check.reason}</p>
      {check.status === "too_demanding" && (
        <div className="programme-actions">
          <button
            className="programme-primary"
            onClick={() => {
              const next = dampenWorkout(data, check.ceiling)
              if (!next) {
                toast.error(
                  translateError(
                    tr(
                      "Completed work or cardio already exceeds this ceiling. Consider ending the session."
                    )
                  )
                )
                return
              }
              setProposal({
                before: JSON.stringify(data),
                after: next,
                source: "Quick adjustment",
              })
            }}
          >
            {tr("Adjust workout")}
          </button>
          <button
            className="programme-secondary"
            onClick={() => setCoach(true)}
          >
            {tr("Ask AI to lighten it")}
          </button>
        </div>
      )}
      {undo && JSON.stringify(data) === undo.after && (
        <button
          className="programme-secondary"
          onClick={() => {
            onApply(undo.before)
            setUndo(null)
          }}
        >
          {tr("Undo adjustment")}
        </button>
      )}
      {coach && (
        <CoachSheet
          onClose={() => setCoach(false)}
          initialInput={tr(
            "Lighten my remaining workout for {{value0}}. {{value1}} Current estimated strain: {{value2}}/100. Keep exercise names, return only remaining sets, reduce set count or effort, and do not increase weights or reps. Aim below {{value3}}/100 using load = sum(RPE × 6), score = round(100 × (1 − exp(−load/500))). Completed work stays unchanged.",
            {
              value0: PROGRAMME_NAMES[programme.goal],
              value1: check.reason,
              value2: strain,
              value3: check.ceiling,
            }
          )}
          activeWorkout={{
            summary,
            applying: false,
            onApply: (draft) => {
              try {
                const after = boundedAiDampening(
                  data,
                  names,
                  draft,
                  check.ceiling
                )
                setProposal({
                  before: JSON.stringify(data),
                  after,
                  source: "AI adjustment",
                })
                setCoach(false)
              } catch (e) {
                toast.error(
                  translateError(
                    e instanceof Error
                      ? e.message
                      : tr("Couldn't validate the adjustment.")
                  )
                )
                throw e
              }
            },
          }}
        />
      )}
      {proposal && (
        <MobileSheet
          ariaLabel={tr("Review workout adjustment")}
          onClose={() => setProposal(null)}
        >
          <div className="programme-setup">
            <h2>{tr("A lighter version of today")}</h2>
            <p>
              <Message
                text={
                  "{{value0}} · Estimated strain {{value1}} → {{value2}}/100"
                }
                values={{
                  value0: proposal.source,
                  value1: strain,
                  value2: plannedWorkoutStrain(proposal.after) ?? 0,
                }}
              />
            </p>
            <ul className="programme-review">
              {Object.entries(proposal.after)
                .filter(
                  ([id, state]) =>
                    JSON.stringify(state) !== JSON.stringify(data[id])
                )
                .map(([id, state]) => (
                  <li key={id}>
                    <strong>{names[id] ?? id}</strong>
                    <span>
                      <Message
                        text={"{{value0}} → {{value1}} remaining sets"}
                        values={{
                          value0: data[id]?.sets.filter((s) => !s.completed)
                            .length,
                          value1: state.sets.filter((s) => !s.completed).length,
                        }}
                      />
                    </span>
                  </li>
                ))}
            </ul>
            <p>
              {tr(
                "Completed sets stay unchanged. This adjustment applies to today's session; your routine template stays saved."
              )}
            </p>
            <div className="programme-actions">
              <button
                className="programme-secondary"
                onClick={() => setProposal(null)}
              >
                {tr("Cancel")}
              </button>
              <button
                className="programme-primary"
                onClick={() => {
                  const currentTime = localProgrammeTime(programme.timezone)
                  const fresh = programmeCompatibility(
                    programme,
                    currentTime.date,
                    currentTime.minute,
                    plannedWorkoutStrain(proposal.after),
                    !!activeFast
                  )
                  if (
                    proposal.before !== JSON.stringify(data) ||
                    fresh.status === "too_demanding" ||
                    !programmeDay(programme, currentTime.date).active
                  ) {
                    setProposal(null)
                    toast.error(
                      translateError(
                        tr(
                          "Your workout or programme changed. Request a fresh adjustment."
                        )
                      )
                    )
                    return
                  }
                  setUndo({
                    before: structuredClone(data),
                    after: JSON.stringify(proposal.after),
                  })
                  onApply(proposal.after)
                  setProposal(null)
                  toast.success(tr("Workout adjusted for your programme"))
                }}
              >
                {tr("Use this workout")}
              </button>
            </div>
          </div>
        </MobileSheet>
      )}
    </section>
  )
}
