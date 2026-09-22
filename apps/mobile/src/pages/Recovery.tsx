import { toast } from "@repo/ui"
import { useState } from "react"
import { useMutation } from "convex/react"
import { CaretLeft } from "@phosphor-icons/react"
import { api } from "../../../../convex/_generated/api"
import type { Doc } from "../../../../convex/_generated/dataModel"
import { useRecovery, useRecoveryToday } from "@/lib/use-recovery"
import { useSmoothNavigate } from "@/lib/navigation"
import { NudgeIllustration } from "@repo/ui/mobile"

type Options = Pick<
  Doc<"recoveryEpisodes">,
  "deferTraining" | "quietTraining" | "simpleFood" | "checkInFrequency"
>
function editableOptions(episode: Options): Options {
  return {
    deferTraining: episode.deferTraining,
    quietTraining: episode.quietTraining,
    simpleFood: episode.simpleFood,
    checkInFrequency: episode.checkInFrequency,
  }
}
const defaults: Options = {
  deferTraining: true,
  quietTraining: true,
  simpleFood: true,
  checkInFrequency: "daily",
}
function OptionsForm({
  value,
  onChange,
}: {
  value: Options
  onChange: (next: Options) => void
}) {
  return (
    <fieldset className="recovery-options">
      <legend>Make the plan yours</legend>
      {(
        [
          [
            "deferTraining",
            "Defer scheduled training",
            "Keep your routine. Resume with upcoming sessions, without a catch-up backlog.",
          ],
          [
            "quietTraining",
            "Pause training reminders",
            "Quiet training-lapse nudges and workout reminders.",
          ],
          [
            "simpleFood",
            "Keep food logging optional",
            "Pause meal-log prompts and use a simpler nutrition view. Targets stay unchanged.",
          ],
        ] as const
      ).map(([key, label, detail]) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
          />
          <span>
            <strong>{label}</strong>
            <small>{detail}</small>
          </span>
        </label>
      ))}
      <label className="recovery-frequency">
        <span>
          <strong>Recovery check-ins</strong>
          <small>A gentle prompt when you open your plan.</small>
        </span>
        <select
          value={value.checkInFrequency}
          onChange={(e) =>
            onChange({
              ...value,
              checkInFrequency: e.target.value as Options["checkInFrequency"],
            })
          }
        >
          <option value="daily">Daily</option>
          <option value="every_other_day">Every other day</option>
          <option value="off">Only when I choose</option>
        </select>
      </label>
    </fieldset>
  )
}
function SafetyNote({ urgent = false }: { urgent?: boolean }) {
  return (
    <aside className="recovery-safety" role={urgent ? "alert" : undefined}>
      <strong>
        {urgent ? "Get medical help now" : "When to get more support"}
      </strong>
      <p>
        {urgent
          ? "Trouble breathing, chest pain, confusion or severe dehydration need urgent medical attention. Contact your local emergency service. A recovery plan cannot assess or treat these symptoms."
          : "Get medical advice if symptoms worsen, persist, or you are at higher risk of serious illness. Trouble breathing, chest pain, confusion or severe dehydration need urgent medical help."}
      </p>
      <a
        href="https://www.cdc.gov/respiratory-viruses/about/index.html"
        target="_blank"
        rel="noreferrer"
      >
        Read the warning signs
      </a>
    </aside>
  )
}
export default function Recovery() {
  const data = useRecovery()
  const navigate = useSmoothNavigate()
  return (
    <main className="app-page recovery-page">
      <header className="app-header">
        <button
          type="button"
          className="app-icon-button"
          aria-label="Back to today"
          onClick={() => navigate("/")}
        >
          <CaretLeft size={20} />
        </button>
        <h1>Recovery</h1>
      </header>
      {data === undefined ? (
        <p role="status">Loading your recovery plan…</p>
      ) : data.active ? (
        <ActiveRecovery
          key={data.active._id}
          episode={data.active}
          checkIns={data.checkIns}
        />
      ) : (
        <Setup />
      )}
    </main>
  )
}
function Setup() {
  const today = useRecoveryToday()
  const start = useMutation(api.recovery.start)
  const [step, setStep] = useState<"details" | "preview">("details")
  const [startedOn, setStartedOn] = useState(today)
  const [symptoms, setSymptoms] = useState("")
  const [energy, setEnergy] = useState<"low" | "okay" | "good">("low")
  const [manageable, setManageable] = useState("")
  const [safety, setSafety] = useState("")
  const [options, setOptions] = useState(defaults)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function activate() {
    setBusy(true)
    setError("")
    try {
      await start({ startedOn, symptoms, energy, manageable, ...options })
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not start recovery. Please try again."
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="recovery-content">
      <NudgeIllustration scene="rest" className="recovery-hero-art" />
      <h2>
        {step === "details"
          ? "A little room to recover"
          : "Here’s what will change"}
      </h2>
      <p className="recovery-intro">
        {step === "details"
          ? "Your goals still matter. Today’s plan can change. Share only what helps us make it comfortable."
          : "Review your choices before starting. Your long-term goals, routine and logged results stay intact."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (step === "details") {
            if (safety === "no") setStep("preview")
          } else void activate()
        }}
      >
        <fieldset disabled={busy}>
          {step === "details" ? (
            <>
              <label className="recovery-field">
                When did you start feeling unwell?
                <input
                  type="date"
                  value={startedOn}
                  max={today}
                  required
                  onChange={(e) => setStartedOn(e.target.value)}
                />
              </label>
              <label className="recovery-field">
                What’s bothering you? <span>Optional</span>
                <textarea
                  maxLength={600}
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="A sore throat, tiredness, an upset stomach…"
                />
              </label>
              <label className="recovery-field">
                Energy today
                <select
                  value={energy}
                  onChange={(e) => setEnergy(e.target.value as typeof energy)}
                >
                  <option value="low">Low — I need rest</option>
                  <option value="okay">Some energy</option>
                  <option value="good">Mostly myself</option>
                </select>
              </label>
              <label className="recovery-field">
                What feels manageable? <span>Optional</span>
                <textarea
                  maxLength={600}
                  value={manageable}
                  onChange={(e) => setManageable(e.target.value)}
                  placeholder="Easy meals, fewer reminders, help planning…"
                />
              </label>
              <label className="recovery-field">
                Any trouble breathing, chest pain, confusion or severe
                dehydration?
                <select
                  required
                  value={safety}
                  onChange={(e) => setSafety(e.target.value)}
                >
                  <option value="" disabled>
                    Choose an answer
                  </option>
                  <option value="no">No</option>
                  <option value="yes">Yes, or I’m unsure</option>
                </select>
              </label>
              {safety === "yes" ? (
                <SafetyNote urgent />
              ) : (
                <button
                  className="recovery-primary"
                  type="submit"
                  disabled={safety !== "no"}
                >
                  Review my plan
                </button>
              )}
            </>
          ) : (
            <>
              <OptionsForm value={options} onChange={setOptions} />
              <p className="recovery-footnote">
                Start in resting mode. Nothing expires automatically, and you
                can change any choice.
              </p>
              <button className="recovery-primary" type="submit">
                {busy ? "Starting…" : "Start recovery mode"}
              </button>
              <button
                type="button"
                className="recovery-secondary"
                onClick={() => setStep("details")}
              >
                Back to my check-in
              </button>
            </>
          )}
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="recovery-error">
          {error}
        </p>
      )}
    </div>
  )
}
function ActiveRecovery({
  episode,
  checkIns,
}: {
  episode: Doc<"recoveryEpisodes">
  checkIns: Doc<"recoveryCheckIns">[]
}) {
  const update = useMutation(api.recovery.update)
  const checkIn = useMutation(api.recovery.checkIn)
  const finish = useMutation(api.recovery.finish)
  const navigate = useSmoothNavigate()
  const [view, setView] = useState<
    "plan" | "checkin" | "settings" | "return" | "finish"
  >("plan")
  const [options, setOptions] = useState<Options>(() =>
    editableOptions(episode)
  )
  const [symptoms, setSymptoms] = useState(episode.symptoms)
  const [energy, setEnergy] = useState(episode.energy)
  const [manageable, setManageable] = useState(episode.manageable)
  const [trend, setTrend] = useState<"better" | "same" | "worse">("same")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const resting = episode.phase === "resting"
  const today = useRecoveryToday()
  const elapsed = episode.lastCheckInOn
    ? Math.round(
        (Date.parse(today) - Date.parse(episode.lastCheckInOn)) / 86400000
      )
    : Infinity
  const due =
    episode.checkInFrequency !== "off" &&
    elapsed >= (episode.checkInFrequency === "daily" ? 1 : 2)
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await action()
      setView("plan")
      setMessage(success)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save. Please try again."
      )
    } finally {
      setBusy(false)
    }
  }
  function changePhase(phase: "resting" | "easing_back") {
    return run(
      () =>
        update({
          episodeId: episode._id,
          phase,
          deferTraining: episode.deferTraining,
          quietTraining: episode.quietTraining,
          simpleFood: episode.simpleFood,
          checkInFrequency: episode.checkInFrequency,
        }),
      phase === "resting"
        ? "Back to resting. Take the time you need."
        : "Your plan now supports easing back."
    )
  }
  return (
    <div className="recovery-content">
      <NudgeIllustration
        scene={resting ? "rest" : "return"}
        className="recovery-hero-art"
      />
      <h2>
        {view === "finish"
          ? "Ready to finish recovery?"
          : view === "return"
            ? "A gentle return"
            : view === "checkin"
              ? "How are you feeling?"
              : view === "settings"
                ? "Make this easier"
                : resting
                  ? "Today, keep it simple"
                  : "Ease back at your pace"}
      </h2>
      <p className="recovery-intro">
        {resting ? "Resting" : "Easing back"} · Since {episode.startedOn}. There
        is no deadline.
      </p>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="recovery-error">
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        {view === "plan" && (
          <>
            <div className="recovery-daily-plan">
              <article>
                <h3>
                  {resting
                    ? "Make space for rest"
                    : "Start with what feels easy"}
                </h3>
                <p>
                  {resting
                    ? "Give yourself permission to rest. Training is not today’s obligation."
                    : "Review a shorter, easier session with Coach. Stop if symptoms return or worsen; resting is always available."}
                </p>
              </article>
              <article>
                <h3>Food and fluids, comfortably</h3>
                <p>
                  Choose food you can tolerate and drink regularly. Logging is a
                  tool you can use when it helps.
                </p>
                <button type="button" onClick={() => navigate("/nutrition")}>
                  Open food & water
                </button>
              </article>
              {episode.manageable && (
                <article>
                  <h3>Your priorities</h3>
                  <p>{episode.manageable}</p>
                </article>
              )}
            </div>
            <button
              type="button"
              className="recovery-primary"
              onClick={() => {
                setSymptoms(episode.symptoms)
                setEnergy(episode.energy)
                setManageable(episode.manageable)
                setView("checkin")
              }}
            >
              {due ? "A gentle check-in" : "Check in when you want"}
            </button>
            <div className="recovery-actions">
              <button
                type="button"
                onClick={() => {
                  setOptions(editableOptions(episode))
                  setView("settings")
                }}
              >
                This feels like too much
              </button>
              <button
                type="button"
                onClick={() => {
                  setOptions(editableOptions(episode))
                  setView("settings")
                }}
              >
                Adjust my plan
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate("/coach", {
                    state: {
                      initialInput:
                        "Help me with my recovery plan using my current symptoms, energy and preferences.",
                      autoSend: true,
                    },
                  })
                }
              >
                Talk it through with Coach
              </button>
            </div>
            <button
              type="button"
              className="recovery-secondary"
              onClick={() =>
                resting ? setView("return") : void changePhase("resting")
              }
            >
              {resting ? "Explore easing back" : "I need to rest again"}
            </button>
            <button
              type="button"
              className="recovery-secondary"
              onClick={() => setView("finish")}
            >
              Finish recovery mode
            </button>
            {episode.lastTrend === "worse" && (
              <p className="recovery-safety">
                You reported feeling worse. Seek medical advice before
                increasing activity.
              </p>
            )}
            <SafetyNote />
            {checkIns.length > 0 && (
              <section className="recovery-history">
                <h3>Your recent check-ins</h3>
                {checkIns.slice(0, 7).map((entry) => (
                  <p key={entry._id}>
                    {entry.date}
                    <span>
                      {entry.trend === "same"
                        ? "About the same"
                        : entry.trend === "better"
                          ? "Feeling better"
                          : "Feeling worse"}{" "}
                      · {entry.energy} energy
                    </span>
                  </p>
                ))}
              </section>
            )}
            <p className="recovery-footnote">
              Practical support, without promises about recovery speed or muscle
              loss.{" "}
              <a
                href="https://www.nhs.uk/conditions/common-cold/"
                target="_blank"
                rel="noreferrer"
              >
                Self-care guidance
              </a>
            </p>
          </>
        )}
        {view === "settings" && (
          <>
            <OptionsForm value={options} onChange={setOptions} />
            <button
              className="recovery-primary"
              type="button"
              onClick={() =>
                void run(
                  () =>
                    update({
                      ...options,
                      episodeId: episode._id,
                      phase: episode.phase,
                    }),
                  "Your recovery preferences are saved."
                )
              }
            >
              Save adjustments
            </button>
          </>
        )}
        {view === "checkin" && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void run(
                () =>
                  checkIn({
                    episodeId: episode._id,
                    date: today,
                    trend,
                    energy,
                    symptoms,
                    manageable,
                  }),
                "Check-in saved. Your coach has the latest context."
              )
            }}
          >
            <label className="recovery-field">
              Compared with your last check-in
              <select
                value={trend}
                onChange={(e) => setTrend(e.target.value as typeof trend)}
              >
                <option value="better">Better</option>
                <option value="same">About the same</option>
                <option value="worse">Worse</option>
              </select>
            </label>
            <label className="recovery-field">
              Energy
              <select
                value={energy}
                onChange={(e) => setEnergy(e.target.value as typeof energy)}
              >
                <option value="low">Low — I need rest</option>
                <option value="okay">Some energy</option>
                <option value="good">Mostly myself</option>
              </select>
            </label>
            <label className="recovery-field">
              Symptoms or changes
              <textarea
                maxLength={600}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
              />
            </label>
            <label className="recovery-field">
              What feels manageable now?
              <textarea
                maxLength={600}
                value={manageable}
                onChange={(e) => setManageable(e.target.value)}
              />
            </label>
            {trend === "worse" && <SafetyNote />}
            <button className="recovery-primary" type="submit">
              Save check-in
            </button>
          </form>
        )}
        {view === "return" && (
          <>
            <p>
              Improvement is a reason to reassess, not automatic clearance to
              train. If you still have fever, chest symptoms or feel generally
              unwell, keep resting and seek medical advice as needed.
            </p>
            <ol className="recovery-return">
              <li>Choose a short, easy activity only when you feel ready.</li>
              <li>
                Review the first workout with Coach before starting. Avoid
                maximal efforts and catch-up sessions.
              </li>
              <li>
                Reassess how you feel during and afterward. Return to resting if
                symptoms worsen.
              </li>
            </ol>
            <p>
              Reminders and deferred training keep your current settings until
              you change them.
            </p>
            <button
              type="button"
              className="recovery-primary"
              onClick={() => void changePhase("easing_back")}
            >
              Use the easing-back plan
            </button>
            <button
              type="button"
              className="recovery-secondary"
              onClick={() =>
                navigate("/coach", {
                  state: {
                    initialInput:
                      "Help me review a gentle first session after illness. Check my recovery symptoms and readiness before suggesting training.",
                    autoSend: true,
                  },
                })
              }
            >
              Review my first session with Coach
            </button>
          </>
        )}
        {view === "finish" && (
          <>
            <p>
              Your normal dashboard and saved reminder preferences will return.
              Your routine resumes with upcoming sessions; recovery days remain
              in your history and create no catch-up backlog.
            </p>
            <p>You can start Recovery mode again whenever you need it.</p>
            <button
              type="button"
              className="recovery-primary"
              onClick={() =>
                void run(async () => {
                  await finish({ episodeId: episode._id, endedOn: today })
                  toast.success(
                    "Recovery finished. Your usual plan is restored."
                  )
                  navigate("/")
                }, "Recovery finished.")
              }
            >
              Finish and restore my usual plan
            </button>
          </>
        )}
        {view !== "plan" && (
          <button
            type="button"
            className="recovery-secondary"
            onClick={() => setView("plan")}
          >
            Keep my current plan
          </button>
        )}
      </fieldset>
    </div>
  )
}
