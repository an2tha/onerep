import { ProgrammeEntry } from "@/components/programme-entry"
import { useEffect, useRef, useState } from "react"
import { PencilSimple, X } from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { tr } from "@repo/ui/i18n"
import { api } from "../../../../convex/_generated/api"
import type { GoalAssessment } from "../../../../convex/lib/goalAssessment"
import { MobileSheet } from "@/components/mobile-sheet"
import { GoalsAssessment } from "@/components/goals-assessment"
import { type GoalFocus, type GoalPlan } from "@/lib/goal-plan"
import "./goals.css"

const FOCUSES: { id: GoalFocus; title: string }[] = [
  { id: "hypertrophy", title: "Build muscle" },
  { id: "deficit", title: "Lose fat" },
  { id: "recomp", title: "Recomposition" },
  { id: "endurance", title: "Build endurance" },
]

type GoalsHubProps = {
  preferences:
    { goalPlan?: GoalPlan; goalsIntroducedAt?: number } | null | undefined
  today: string
  assessment?: GoalAssessment | null
}

export function GoalsHub(props: GoalsHubProps) {
  const save = useMutation(api.users.users.saveGoalPlan)
  const assessment = useQuery(api.progressInsights.goals, {
    today: props.today,
  })
  return <GoalsHubView {...props} save={save} assessment={assessment} />
}

export function GoalsHubView({
  preferences,
  save,
  assessment,
}: GoalsHubProps & {
  save: (args: { plan?: GoalPlan }) => Promise<unknown>
}) {
  const plan = preferences?.goalPlan
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<GoalPlan | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const opener = useRef<HTMLElement | null>(null)
  const sheetOpen = open

  useEffect(() => {
    if (sheetOpen || !opener.current) return
    const frame = requestAnimationFrame(() =>
      opener.current?.focus({ preventScroll: true })
    )
    return () => cancelAnimationFrame(frame)
  }, [sheetOpen])

  function edit() {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setDraft(plan ? { focus: plan.focus } : null)
    setError("")
    setOpen(true)
  }

  async function persist(skip = false) {
    if (saving || (!skip && !draft)) return
    setSaving(true)
    setError("")
    try {
      await save(skip ? {} : { plan: { focus: draft!.focus } })
      setOpen(false)
    } catch {
      setError(tr("Could not save your goal. Try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="goals-hub" aria-label={tr("Your goals")}>
      <div className="goals-heading goals-main-heading">
        <h2>
          {plan
            ? tr(
                FOCUSES.find((focus) => focus.id === plan.focus)?.title ??
                  "Goals"
              )
            : tr("Choose a goal")}
        </h2>
        <button className="goals-text-button goals-edit" onClick={edit}>
          <PencilSimple size={16} aria-hidden="true" />
          {plan ? tr("Edit goal") : tr("Set a goal")}
        </button>
      </div>
      {preferences === undefined ? (
        <p role="status" className="goal-assessment-loading">
          {tr("Loading your goal…")}
        </p>
      ) : plan ? (
        <GoalsAssessment assessment={assessment} />
      ) : (
        <div className="goals-empty">
          <p>
            {tr(
              "Choose what you are working toward. Your zone will combine training, sleep, recovery and activity."
            )}
          </p>
          <button className="goals-primary" onClick={edit}>
            {tr("Set a goal")}
          </button>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {tr(
          "Optional: choose a training focus to guide your progress. Your nutrition goal stays separate."
        )}
      </p>
      <ProgrammeEntry />
      {sheetOpen && (
        <MobileSheet
          ariaLabel={tr("Set your goal")}
          showHandle={false}
          dismissible={!saving}
          maxHeight="90dvh"
          panelClassName="goals-dialog"
          onClose={() => {
            if (!saving) {
              setOpen(false)
              setError("")
            }
          }}
        >
          <div className="goals-tour">
            <div className="goals-tour-top">
              <h2>{tr("Your goal")}</h2>
              <button
                type="button"
                aria-label={tr("Close goal setup")}
                disabled={saving}
                onClick={() => {
                  setOpen(false)
                }}
              >
                <X size={20} />
              </button>
            </div>
            <p>
              {tr(
                "Choose a focus. Your zone uses your logged training and health signals."
              )}
            </p>
            <fieldset className="goals-setup">
              <legend className="sr-only">{tr("Goal focus")}</legend>
              <div className="goals-choices">
                {FOCUSES.map((focus) => (
                  <label
                    key={focus.id}
                    data-selected={draft?.focus === focus.id}
                  >
                    <input
                      type="radio"
                      name="goal-focus"
                      checked={draft?.focus === focus.id}
                      onChange={() => setDraft({ focus: focus.id })}
                    />
                    <strong>{tr(focus.title)}</strong>
                  </label>
                ))}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="goals-error">
                {error}
              </p>
            )}
            <div className="goals-tour-footer">
              <button
                className="goals-text-button"
                disabled={saving}
                onClick={() => void persist(true)}
              >
                {tr("Skip for now")}
              </button>
              <button
                className="goals-primary"
                disabled={saving || !draft}
                onClick={() => void persist()}
              >
                {saving ? tr("Saving…") : tr("Save goal")}
              </button>
            </div>
          </div>
        </MobileSheet>
      )}
    </section>
  )
}
