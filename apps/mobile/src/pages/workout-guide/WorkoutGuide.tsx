import { guideErrorMessage } from "./errors"
import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  PencilSimple,
  X,
} from "@phosphor-icons/react"
import { tr } from "@repo/ui/i18n"
import { hapticSelection } from "@/lib/haptics"
import {
  CORE_GUIDE_IDS,
  GUIDE_QUESTIONS,
  validateGuideAnswers,
  selectFollowups,
  selectedMuscles,
  MUSCLE_GROUPS,
  MAX_GUIDE_QUESTIONS,
  eligibleFollowups,
  type GuideAnswers,
  type GuideQuestionId,
  type GuidedDraft,
} from "../../../../../convex/lib/workoutGuide"
import { StudioScene } from "./studio-scene"
import { guideCopy } from "./copy"
import "./workout-guide.css"

/* THESIS: Walk through one continuous dark gym as the session takes shape.
   OWN-WORLD: Blender-authored metric room, graphite equipment, warm practicals.
   STORY: One question, one choice, a camera glide to the next training station.
   FIRST VIEWPORT: Full-bleed room, large foreground question, bottom answers.
   FORM: User-pinned immersive replacement of the text-heavy studio screen.
   FINISH: Validate camera continuity, minimal text, loading and full handoff. */
type Props = {
  editing: boolean
  storageKey: string
  existingName?: string
  onClose: () => void
  onPlan: (answers: GuideAnswers) => Promise<GuideQuestionId[]>
  onGenerate: (answers: GuideAnswers, notes: string) => Promise<GuidedDraft>
  onApply: (draft: GuidedDraft) => Promise<void>
}
type Session = {
  answers: GuideAnswers
  followups: GuideQuestionId[]
  step: number
  notes: string
  draft: GuidedDraft | null
}
const empty = (): Session => ({
  answers: {},
  followups: [],
  step: 0,
  notes: "",
  draft: null,
})
function restore(key: string): Session {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw || raw.length > 60000) return empty()
    const saved = JSON.parse(raw)
    const answers = validateGuideAnswers(saved.answers ?? {})
    const eligible = eligibleFollowups(answers)
    const followups = Array.isArray(saved.followups)
      ? saved.followups
          .filter((id: GuideQuestionId) => eligible.includes(id))
          .slice(0, 2)
      : []
    // Restore the brief, not a stale generated plan. It can be regenerated.
    return {
      answers,
      followups,
      step: Math.min(
        Math.max(Number(saved.step) || 0, 0),
        6 + followups.length
      ),
      notes: String(saved.notes ?? "").slice(0, 500),
      draft: null,
    }
  } catch {
    return empty()
  }
}
export function WorkoutGuide({
  editing,
  storageKey,
  existingName,
  onClose,
  onPlan,
  onGenerate,
  onApply,
}: Props) {
  const [session, setSession] = useState(() => restore(storageKey))
  const [busy, setBusy] = useState<
    "planning" | "generating" | "applying" | null
  >(null)
  const [error, setError] = useState("")
  const [customQuestion, setCustomQuestion] = useState<GuideQuestionId | null>(
    null
  )
  const lock = useRef(false)
  const alive = useRef(true)
  const heading = useRef<HTMLHeadingElement>(null)
  const root = useRef<HTMLElement>(null)
  const foreground = useRef<HTMLDivElement>(null)
  const customField = useRef<HTMLTextAreaElement>(null)
  const [moving, setMoving] = useState(false)
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transitionAnimation = useRef<Animation | null>(null)
  const copy = guideCopy()
  const ids: GuideQuestionId[] = [
    "focus",
    editing ? "change" : "goal",
    ...CORE_GUIDE_IDS.filter((id) => id !== "focus"),
    ...session.followups,
  ]
  const OptionsContainer = ids[session.step] === "focus" ? "details" : "div"
  const question = GUIDE_QUESTIONS.find((q) => q.id === ids[session.step])
  const review = !question
  const { answers, draft } = session
  const muscles = selectedMuscles(answers.focus)
  const totalQuestions = Math.min(MAX_GUIDE_QUESTIONS, 9)
  const progress =
    draft || busy === "generating" || busy === "applying"
      ? 1
      : Math.min(
          1,
          (ids.filter((id) => answers[id]).length +
            (session.notes.trim() ? 1 : 0)) /
            totalQuestions
        )
  const custom =
    question &&
    (customQuestion === question.id ||
      answers[question.id]?.startsWith("Custom: "))
  const displayAnswer = (value: string) =>
    value.startsWith("Custom: ")
      ? value.slice(8)
      : value.startsWith("Muscles: ")
        ? selectedMuscles(value)
            .map((muscle) => copy[muscle] ?? muscle)
            .join(", ")
        : (copy[value] ?? value)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (transitionTimer.current) clearTimeout(transitionTimer.current)
      transitionAnimation.current?.cancel()
    }
  }, [])
  useEffect(() => {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ ...session, draft: null })
      )
    } catch {
      /* Storage is optional. */
    }
  }, [session, storageKey])
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [session.step, Boolean(draft)])
  useEffect(() => {
    if (custom) customField.current?.focus({ preventScroll: true })
  }, [Boolean(custom), question?.id])
  function travel(update: (current: Session) => Session) {
    if (moving || !alive.current) return
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    transitionAnimation.current?.cancel()
    if (reduced) {
      setSession(update)
      return
    }
    const startOpacity = foreground.current
      ? Number(getComputedStyle(foreground.current).opacity)
      : 1
    setMoving(true)
    transitionAnimation.current =
      foreground.current?.animate([{ opacity: startOpacity }, { opacity: 0 }], {
        duration: 160,
        fill: "forwards",
        easing: "ease-out",
      }) ?? null
    transitionTimer.current = setTimeout(() => {
      if (!alive.current) return
      setSession(update)
      transitionAnimation.current?.cancel()
      transitionAnimation.current =
        foreground.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 400,
          fill: "both",
          easing: "cubic-bezier(.16,1,.3,1)",
        }) ?? null
      transitionTimer.current = setTimeout(() => {
        transitionAnimation.current?.cancel()
        transitionAnimation.current = null
        if (alive.current) setMoving(false)
      }, 400)
    }, 160)
  }
  function answer(value: string) {
    if (!question || busy || moving) return
    hapticSelection()
    setError("")
    setSession((current) => {
      const next = { ...current.answers, [question.id]: value }
      if (!value) delete next[question.id]
      const changed = current.answers[question.id] !== value
      if (changed && current.step < 6)
        for (const id of current.followups) delete next[id]
      return {
        ...current,
        answers: next,
        followups:
          changed && current.step < 6 && current.followups.length
            ? selectFollowups(current.followups, next)
            : current.followups,
        draft: null,
      }
    })
  }
  async function run(
    kind: NonNullable<typeof busy>,
    task: () => Promise<void>
  ) {
    if (lock.current) return
    lock.current = true
    setBusy(kind)
    setError("")
    try {
      await task()
    } catch (reason) {
      if (alive.current)
        setError(guideErrorMessage(reason))
    } finally {
      lock.current = false
      if (alive.current) setBusy(null)
    }
  }
  async function next() {
    if (!question || !answers[question.id]) return
    if (session.step === 5 && session.followups.length === 0) {
      await run("planning", async () => {
        const followups = selectFollowups(await onPlan(answers), answers)
        if (alive.current)
          travel((current) => ({
            ...current,
            followups,
            step: current.step + 1,
          }))
      })
    } else travel((current) => ({ ...current, step: current.step + 1 }))
  }
  const specific = answers.constraints === "I have specific restrictions"
  return (
    <main className="workout-guide" ref={root}>
      <StudioScene
        question={question?.id}
        answers={answers}
        busy={Boolean(busy)}
        review={review || Boolean(draft)}
        progress={progress}
      />
      <div className="studio-scrim" />
      <header className="guide-header">
        <button
          className="guide-quiet"
          aria-label={tr("Close guide")}
          onClick={onClose}
          disabled={busy === "applying"}
        >
          <X size={22} />
        </button>
      </header>
      <section
        className={`guide-workspace ${review || draft ? "is-review" : ""} ${busy ? "is-busy" : ""}`}
        aria-busy={Boolean(busy)}
      >
        {!draft && (
          <span className="sr-only" aria-live="polite">
            {tr("Question {{number}} of {{total}}", {
              number: Math.min(session.step + 1, totalQuestions),
              total: totalQuestions,
            })}
          </span>
        )}
        <div
          className="guide-foreground"
          ref={foreground}
          aria-hidden={Boolean(busy)}
          inert={Boolean(busy)}
          data-moving={moving}
        >
          {draft ? (
            <>
              <h1 ref={heading} tabIndex={-1}>
                {draft.name}
              </h1>
              {draft.notes && (
                <details className="guide-rationale">
                  <summary>{tr("Why this workout?")}</summary>
                  <p>{draft.notes}</p>
                </details>
              )}
              <ol className="guide-exercise-preview">
                {draft.exercises.map((exercise, index) => (
                  <li key={`${exercise.name}-${index}`}>
                    <span className="guide-exercise-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h2>{exercise.name}</h2>
                      <p>
                        {tr("{{sets}} sets", {
                          sets: exercise.sets?.length ?? 0,
                        })}{" "}
                        <span>·</span>{" "}
                        {exercise.sets?.map((set) => set.reps).join(" / ")}{" "}
                        {tr("reps")} <span>·</span>{" "}
                        {tr("{{seconds}}s rest", {
                          seconds: exercise.sets?.[0]?.restSeconds ?? 90,
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="guide-description">
                {editing
                  ? tr(
                      "Applying replaces the exercises in your editor. Your saved workout changes only when you save."
                    )
                  : tr(
                      "Review exercises, sets and rest in the editor before saving."
                    )}
              </p>
            </>
          ) : review ? (
            <>
              <h1 ref={heading} tabIndex={-1}>
                {tr("Any additional notes?")}
              </h1>
              <label className="guide-notes-label" htmlFor="guide-notes">
                {specific
                  ? tr("Which movements should we avoid?")
                  : tr("Optional")}
              </label>
              <textarea
                id="guide-notes"
                aria-label={tr("Any additional notes?")}
                required={specific}
                maxLength={500}
                rows={3}
                value={session.notes}
                disabled={Boolean(busy) || moving}
                onChange={(event) =>
                  setSession((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder={tr("Anything else to include?")}
                aria-describedby="guide-notes-help"
              />
              <p id="guide-notes-help" className="guide-field-help">
                {specific && !session.notes.trim()
                  ? tr("Add the movements to avoid before continuing.")
                  : ""}
              </p>
              <details className="guide-rationale">
                <summary>{tr("Review answers")}</summary>
                <div className="guide-review">
                  {ids.map((id, index) => (
                    <button
                      key={id}
                      disabled={Boolean(busy) || moving}
                      aria-label={`${copy[GUIDE_QUESTIONS.find((q) => q.id === id)!.title]} ${displayAnswer(answers[id] ?? "")}`}
                      onClick={() => {
                        setError("")
                        travel((current) => ({ ...current, step: index }))
                      }}
                    >
                      <span>
                        <strong>{displayAnswer(answers[id] ?? "")}</strong>
                      </span>
                      <PencilSimple size={18} />
                    </button>
                  ))}
                </div>
              </details>
            </>
          ) : (
            question && (
              <>
                <h1 ref={heading} tabIndex={-1} id="guide-question">
                  {copy[question.title]}
                </h1>

                <div
                  className={`guide-choices ${question.id === "focus" ? "is-muscles" : ""}`}
                  role="group"
                  aria-labelledby="guide-question"
                >
                  <div className="guide-option-surface">
                    {question.id === "focus" && (
                      <div className="guide-muscle-picker">
                        {Object.entries(MUSCLE_GROUPS).map(
                          ([group, choices], index) => (
                            <details key={group} open={index === 0}>
                              <summary>
                                {copy[group] ?? group}
                                <span>
                                  {choices.filter((muscle) =>
                                    muscles.includes(muscle)
                                  ).length || ""}
                                </span>
                              </summary>
                              <div className="guide-muscle-grid">
                                {choices.map((muscle) => (
                                  <button
                                    key={muscle}
                                    className="guide-muscle"
                                    aria-pressed={muscles.includes(muscle)}
                                    disabled={Boolean(busy) || moving}
                                    onClick={() => {
                                      setCustomQuestion(null)
                                      const next = muscles.includes(muscle)
                                        ? muscles.filter(
                                            (name) => name !== muscle
                                          )
                                        : [...muscles, muscle]
                                      answer(
                                        next.length
                                          ? `Muscles: ${next.join(", ")}`
                                          : ""
                                      )
                                    }}
                                  >
                                    <span>{copy[muscle] ?? muscle}</span>
                                    <span className="guide-muscle-check">
                                      {muscles.includes(muscle) && (
                                        <Check size={13} weight="bold" />
                                      )}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </details>
                          )
                        )}
                      </div>
                    )}
                    <OptionsContainer className="guide-regions">
                      {question.id === "focus" && (
                        <summary>{tr("Whole regions")}</summary>
                      )}
                      {(question.id === "focus"
                        ? ["Full body", "Upper body", "Lower body"]
                        : question.options
                      ).map((option) => (
                        <button
                          key={option}
                          className="guide-choice"
                          aria-pressed={answers[question.id] === option}
                          onClick={() => {
                            setCustomQuestion(null)
                            answer(option)
                          }}
                          disabled={Boolean(busy) || moving}
                        >
                          <span>{copy[option]}</span>
                          <span className="guide-choice-mark">
                            {answers[question.id] === option ? (
                              <Check size={20} weight="bold" />
                            ) : (
                              <span className="guide-radio" />
                            )}
                          </span>
                        </button>
                      ))}
                    </OptionsContainer>
                    <button
                      className="guide-choice"
                      aria-pressed={Boolean(custom)}
                      disabled={Boolean(busy) || moving}
                      onClick={() => {
                        setCustomQuestion(question.id)
                        if (!custom) answer("")
                      }}
                    >
                      <span>{tr("Custom answer")}</span>
                      <span className="guide-choice-mark">
                        {custom ? (
                          <Check size={20} weight="bold" />
                        ) : (
                          <span className="guide-radio" />
                        )}
                      </span>
                    </button>
                  </div>
                  <div
                    className="guide-custom-reveal"
                    data-open={Boolean(custom)}
                    aria-hidden={!custom}
                    inert={!custom}
                  >
                    <div>
                      <textarea
                        ref={customField}
                        className="guide-custom-answer"
                        aria-label={tr("Your answer")}
                        maxLength={300}
                        rows={2}
                        disabled={Boolean(busy) || moving}
                        value={
                          answers[question.id]?.startsWith("Custom: ")
                            ? answers[question.id]!.slice(8)
                            : ""
                        }
                        onChange={(event) =>
                          answer(
                            event.target.value.trim()
                              ? `Custom: ${event.target.value}`
                              : ""
                          )
                        }
                        placeholder={
                          question.id === "focus"
                            ? tr("For example, chest, triceps and calves")
                            : tr("Enter your answer")
                        }
                      />
                    </div>
                  </div>
                </div>
              </>
            )
          )}
          {error && (
            <p className="guide-error" role="alert">
              {error}
            </p>
          )}
        </div>
        {busy && (
          <div className="guide-loading" role="status">
            <h2>
              {busy === "planning"
                ? tr("Finding your rhythm.")
                : busy === "generating"
                  ? tr("Building your workout.")
                  : tr("Getting things ready.")}
            </h2>
          </div>
        )}
        <footer className="guide-actions">
          <button
            className="guide-quiet"
            aria-label={tr("Back")}
            title={tr("Back")}
            disabled={Boolean(busy) || moving || (!draft && session.step === 0)}
            onClick={() => {
              setError("")
              travel((current) => ({
                ...current,
                draft: null,
                step: draft ? current.step : Math.max(0, current.step - 1),
              }))
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <button
            className="guide-primary"
            aria-label={
              draft
                ? tr("Open in editor")
                : review
                  ? tr("Build with AI")
                  : error
                    ? tr("Try again")
                    : tr("Continue")
            }
            title={
              draft
                ? tr("Open in editor")
                : review
                  ? tr("Build with AI")
                  : error
                    ? tr("Try again")
                    : tr("Continue")
            }
            disabled={
              Boolean(busy) ||
              moving ||
              (!draft && !review && !answers[question!.id]) ||
              (!draft &&
                review &&
                specific &&
                session.notes.trim().length === 0)
            }
            onClick={() => {
              if (draft)
                void run("applying", async () => {
                  await onApply(draft)
                  try {
                    sessionStorage.removeItem(storageKey)
                  } catch {
                    /* optional storage */
                  }
                })
              else if (review)
                void run("generating", async () => {
                  const result = await onGenerate(answers, session.notes)
                  if (alive.current)
                    travel((current) => ({ ...current, draft: result }))
                })
              else void next()
            }}
          >
            <ArrowRight size={20} />
          </button>
        </footer>
        {!draft && (
          <p className="guide-cost">
            {tr("Uses 2 AI requests. Rebuilding uses 1 more.")}
          </p>
        )}
      </section>
    </main>
  )
}
