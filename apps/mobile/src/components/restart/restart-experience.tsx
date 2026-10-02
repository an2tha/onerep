import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, ArrowRight, Check, X } from "@phosphor-icons/react"
import { tr } from "@repo/ui/i18n"
import { RestartArt } from "./restart-art"
import {
  actions,
  anchors,
  reasons,
  type RestartChoices,
  type RestartPlan,
} from "./restart-content"
import "./restart.css"

type Props = {
  plan: RestartPlan | null
  today: string
  draftKey?: string
  onSave: (choices: RestartChoices) => Promise<unknown>
  onAdvance: (stage: number) => Promise<unknown>
  onPause: () => Promise<unknown>
  onClose: () => void
  onNavigate: (path: string) => void
  preview?: boolean
}

export function RestartExperience({
  plan,
  today,
  draftKey,
  onSave,
  onAdvance,
  onPause,
  onClose,
  onNavigate,
  preview = false,
}: Props) {
  const initial = () => {
    const base = {
      reason: plan?.reason ?? "starting",
      action: plan?.action ?? "walk",
      anchor: plan?.anchor ?? anchors()[0],
    } satisfies RestartChoices
    if (!draftKey || plan?.status === "active") return base
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) ?? "null")
      if (
        draft &&
        reasons().some((r) => r.id === draft.reason) &&
        actions().some((a) => a.id === draft.action) &&
        typeof draft.anchor === "string"
      )
        return { ...base, ...draft } as RestartChoices
    } catch {
      /* A disabled browser store does not block setup. */
    }
    return base
  }
  const [choices, setChoices] = useState<RestartChoices>(initial)
  const [step, setStep] = useState(
    plan?.status === "active" || plan?.status === "completed" ? 4 : 0,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const heading = useRef<HTMLHeadingElement>(null)
  const lock = useRef(false)
  const reduced = useReducedMotion()
  const selectedAction =
    step === 4 ? (plan?.action ?? choices.action) : choices.action
  const anchor = step === 4 ? (plan?.anchor ?? choices.anchor) : choices.anchor
  const option = actions().find((a) => a.id === selectedAction)!
  const stage = plan?.stage ?? 0
  const completed = step === 4 && plan?.status === "completed"
  const waiting =
    !preview && step === 4 && stage === 2 && plan?.lastActionOn === today
  const titles = [
    tr("A little room to begin again."),
    tr("What's making it hard?"),
    tr("What feels possible?"),
    tr("Give it a place in your day."),
  ]
  const title =
    step < 4
      ? titles[step]
      : completed
        ? tr("You made room for yourself.")
        : waiting
          ? tr("That's enough for today.")
          : stage === 0
            ? option.prep
            : stage === 1
              ? option.task
              : tr("Try that small step again.")

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [step, stage, waiting])
  useEffect(() => {
    if (!draftKey || step === 4) return
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(choices))
    } catch {
      /* Optional draft persistence. */
    }
  }, [choices, draftKey, step])

  async function run(task: () => Promise<unknown>, after?: () => void) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError("")
    try {
      await task()
      after?.()
    } catch {
      setError(
        tr(
          "Your change couldn't be saved. Check your connection and try again. Your choices are still here.",
        ),
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  function changeStep(next: number) {
    setError("")
    setStep(next)
  }
  const progress = step === 4 ? stage : step === 0 ? 0 : step / 3
  return (
    <main
      className="restart-experience"
      data-step={step}
      aria-label={tr("Help me restart")}
    >
      <header className="restart-topbar">
        <span className="restart-wordmark">
          <span className="restart-brand">OneRep / </span>
          {tr("Restart")}
          {preview && (
            <span className="restart-preview-label" role="status">
              {tr("Preview")}
              <span className="sr-only">
                {tr("Your plan and logs won't change.")}
              </span>
            </span>
          )}
        </span>
        <button
          className="restart-icon-button"
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={tr("Close restart")}
        >
          <X size={22} />
        </button>
      </header>
      <div className="restart-layout">
        <aside className="restart-landscape" aria-label={tr("Your path back")}>
          <RestartArt progress={progress} />
          <ol className="restart-path">
            {[tr("Make room"), tr("Take one step"), tr("Find your rhythm")].map(
              (label, i) => (
                <li
                  key={label}
                  aria-current={step === 4 && stage === i ? "step" : undefined}
                  className={stage > i && step === 4 ? "is-done" : ""}
                >
                  <span>
                    {stage > i && step === 4 ? (
                      <Check size={14} weight="bold" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {label}
                </li>
              ),
            )}
          </ol>
          <p className="restart-landscape-note">
            {tr("Your pace. Nothing to catch up on.")}
          </p>
        </aside>
        <div className="restart-main">
          {step > 0 && step < 4 && (
            <div className="restart-step-nav">
              <button
                type="button"
                className="restart-text-button"
                onClick={() => changeStep(step - 1)}
                disabled={busy}
              >
                <ArrowLeft size={16} />
                {tr("Back")}
              </button>
              <span>
                {tr("{{current}} of {{total}}", { current: step, total: 3 })}
              </span>
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={`${step}-${stage}-${waiting}`}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              onAnimationComplete={() =>
                heading.current?.focus({ preventScroll: true })
              }
            >
              <h1 ref={heading} tabIndex={-1}>
                {title}
              </h1>
              {step === 0 && (
                <>
                  <p className="restart-lead">
                    {tr(
                      "You don't need to return to everything at once. Let's find one small thing that fits today.",
                    )}
                  </p>
                  <div className="restart-intro-note">
                    <span className="restart-seed" aria-hidden="true" />
                    <p>
                      {tr(
                        "Three short choices. A plan you can change. No streak to protect.",
                      )}
                    </p>
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <p className="restart-lead">
                    {tr("Pick what feels closest. There's no wrong answer.")}
                  </p>
                  <fieldset className="restart-options">
                    <legend className="sr-only">
                      {tr("What's making it hard?")}
                    </legend>
                    {reasons().map((r) => (
                      <label
                        key={r.id}
                        className="restart-option"
                        data-selected={choices.reason === r.id}
                      >
                        <input
                          type="radio"
                          name="restart-reason"
                          checked={choices.reason === r.id}
                          onChange={() =>
                            setChoices((c) => ({
                              ...c,
                              reason: r.id,
                              action: r.id === "energy" ? "rest" : c.action,
                            }))
                          }
                        />
                        <span>
                          <strong>{r.title}</strong>
                          <small>{r.detail}</small>
                        </span>
                        <span className="restart-radio" aria-hidden="true" />
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              {step === 2 && (
                <>
                  <p className="restart-lead">
                    {choices.reason === "energy"
                      ? tr(
                          "Rest is a valid starting point. Choose what suits your energy.",
                        )
                      : tr(
                          "Choose the smallest version you'd be willing to try. You can stop there.",
                        )}
                  </p>
                  <fieldset className="restart-options">
                    <legend className="sr-only">
                      {tr("Your small action")}
                    </legend>
                    {actions().map((a) => (
                      <label
                        key={a.id}
                        className="restart-option"
                        data-selected={choices.action === a.id}
                      >
                        <input
                          type="radio"
                          name="restart-action"
                          checked={choices.action === a.id}
                          onChange={() =>
                            setChoices((c) => ({ ...c, action: a.id }))
                          }
                        />
                        <span>
                          <strong>{a.title}</strong>
                          <small>{a.detail}</small>
                        </span>
                        <span className="restart-radio" aria-hidden="true" />
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              {step === 3 && (
                <>
                  <p className="restart-lead">
                    {tr(
                      "Attach your first step to something that already happens.",
                    )}
                  </p>
                  <div
                    className="restart-anchor-options"
                    aria-label={tr("Suggested daily anchors")}
                  >
                    {anchors().map((anchor) => (
                      <button
                        type="button"
                        key={anchor}
                        disabled={busy}
                        aria-pressed={choices.anchor === anchor}
                        onClick={() => setChoices((c) => ({ ...c, anchor }))}
                      >
                        {anchor}
                      </button>
                    ))}
                  </div>
                  <label
                    className="restart-anchor-label"
                    htmlFor="restart-anchor"
                  >
                    {tr("Your daily anchor")}
                  </label>
                  <input
                    className="restart-anchor-input"
                    id="restart-anchor"
                    disabled={busy}
                    value={choices.anchor}
                    maxLength={100}
                    onChange={(e) =>
                      setChoices((c) => ({ ...c, anchor: e.target.value }))
                    }
                  />
                  <div className="restart-plan-preview">
                    <span>
                      {choices.anchor.trim() || tr("At your chosen moment")}
                    </span>
                    <strong>{option.prep}.</strong>
                    <p>
                      {tr("Then, when you're ready: {{action}}.", {
                        action: option.task,
                      })}
                    </p>
                  </div>
                  <p className="restart-fine">
                    {tr(
                      "This saves your restart plan. It won't schedule notifications or change your workouts.",
                    )}
                  </p>
                </>
              )}
              {step === 4 && !completed && (
                <>
                  <p className="restart-lead">
                    {waiting
                      ? tr(
                          "Come back another day and try your small action once more. There's no deadline.",
                        )
                      : stage === 0
                        ? tr(
                            "{{anchor}}. Just prepare for your small action. You don't have to do it all right now.",
                            { anchor },
                          )
                        : option.instruction}
                  </p>
                  <div className="restart-today">
                    <span>
                      {waiting ? tr("Next time") : tr("Your small commitment")}
                    </span>
                    <strong>{option.task}</strong>
                    <p>{anchor}</p>
                    {(selectedAction === "gym" ||
                      selectedAction === "home") && (
                      <p>
                        {tr(
                          "Logged workouts update this plan. Coach knows your small commitment.",
                        )}
                      </p>
                    )}
                    {selectedAction === "rest" && (
                      <p>
                        {tr(
                          "Completing this step marks today as rest in Training.",
                        )}
                      </p>
                    )}
                  </div>
                  {stage > 0 &&
                    !waiting &&
                    (selectedAction === "gym" || selectedAction === "home") && (
                      <button
                        type="button"
                        className="restart-text-button"
                        onClick={() => onNavigate("/workouts")}
                      >
                        {tr("Open my workouts")}
                        <ArrowRight size={16} />
                      </button>
                    )}
                  {stage > 0 && !waiting && selectedAction === "rest" && (
                    <button
                      type="button"
                      className="restart-text-button"
                      onClick={() => onNavigate("/journal")}
                    >
                      {tr("Open my journal")}
                      <ArrowRight size={16} />
                    </button>
                  )}
                </>
              )}
              {completed && (
                <>
                  <p className="restart-lead">
                    {tr(
                      "You prepared, took a small step, and came back to it. Keep this pace for as long as it helps.",
                    )}
                  </p>
                  <div className="restart-today">
                    <span>{tr("Take this with you")}</span>
                    <strong>{option.task}</strong>
                    <p>{anchor}</p>
                  </div>
                  <p className="restart-fine">
                    {tr(
                      "You can start another restart from Coach whenever you need one.",
                    )}
                  </p>
                </>
              )}
            </motion.section>
          </AnimatePresence>
          {error && (
            <p className="restart-error" role="alert">
              {error}
            </p>
          )}
          <footer className="restart-footer">
            {step < 3 && (
              <button
                type="button"
                className="restart-primary"
                onClick={() => changeStep(step + 1)}
              >
                {step === 0 ? tr("Help me restart") : tr("Continue")}
                <ArrowRight size={18} />
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                className="restart-primary"
                disabled={busy || !choices.anchor.trim()}
                aria-busy={busy}
                onClick={() =>
                  void run(
                    () => onSave(choices),
                    () => {
                      if (draftKey) {
                        try {
                          sessionStorage.removeItem(draftKey)
                        } catch {
                          /* Optional store. */
                        }
                      }
                      changeStep(4)
                    },
                  )
                }
              >
                {busy ? tr("Saving…") : tr("Save my small plan")}
                <ArrowRight size={18} />
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                className="restart-primary"
                disabled={busy}
                aria-busy={busy}
                onClick={() =>
                  completed || waiting
                    ? onClose()
                    : void run(() => onAdvance(stage))
                }
              >
                {busy
                  ? tr("Saving…")
                  : completed || waiting
                    ? tr("Back to Today")
                    : stage === 0
                      ? tr("I'm ready for my small step")
                      : tr("I did my small action")}
                <Check size={18} />
              </button>
            )}
            {step === 0 && (
              <button
                type="button"
                className="restart-secondary"
                onClick={onClose}
              >
                {tr("Another time")}
              </button>
            )}
            {completed && (
              <button
                type="button"
                className="restart-secondary"
                onClick={() => changeStep(0)}
              >
                {tr("Start another small plan")}
              </button>
            )}
            {step === 4 && !completed && (
              <div className="restart-footer-links">
                <button
                  type="button"
                  className="restart-text-button"
                  disabled={busy}
                  onClick={() => {
                    setChoices({
                      reason: plan?.reason ?? choices.reason,
                      action: selectedAction,
                      anchor,
                    })
                    changeStep(2)
                  }}
                >
                  {tr("Make it easier")}
                </button>
                <button
                  type="button"
                  className="restart-text-button"
                  disabled={busy}
                  onClick={() => void run(onPause, onClose)}
                >
                  {tr("Pause this plan")}
                </button>
              </div>
            )}
          </footer>
        </div>
      </div>
    </main>
  )
}
