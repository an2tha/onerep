import { useEffect, useId, useState } from "react"
import { ConvexError } from "convex/values"
import { useAction, useMutation, useQuery } from "convex/react"
import { ArrowRight, CaretDown, Check, Leaf, Sparkle, X } from "@phosphor-icons/react"
import { api } from "../../../../convex/_generated/api"
import {
  PROGRAMME_NAMES,
  localProgrammeTime,
  programmeDay,
  type ProgrammeGoal,
} from "../../../../convex/lib/nutritionProgramme"
import { MobileSheet } from "@/components/mobile-sheet"
import { toast } from "@repo/ui"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { useAiFeatureGate } from "@/lib/ai-access"
import "@/styles/nutrition-programme.css"

// Extend the nutrition surface with warm glass, shared typography and native controls.
// The active phase leads; setup uses focused steps; an animated disclosure carries detail.
export function NutritionProgramme({
  date,
  baseline,
  protein,
  fat,
  placement = "primary",
}: {
  date: string
  baseline: number
  protein: number
  fat: number
  placement?: "primary" | "secondary"
}) {
  const programme = useQuery(api.nutritionProgrammes.getCurrent, {})
  const recommendations = useQuery(
    api.logs.recipes.recommendedForProgramme,
    programme ? { date, limit: 3 } : "skip"
  )
  const end = useMutation(api.nutritionProgrammes.end)
  const generateRecipe = useAction(api.ai.programmeRecipe.generateForProgramme)
  const navigate = useSmoothNavigate()
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  const [setup, setSetup] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [ending, setEnding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recipeBusy, setRecipeBusy] = useState(false)
  const [dismissed, setDismissed] = useState(
    () =>
      safeLocalStorageGet("nutrition-programme-invitation-dismissed") === "true"
  )
  const [invitationOpen, setInvitationOpen] = useState(false)
  const invitationId = useId()
  if (programme === undefined)
    return placement === "secondary" ? null : (
      <div className="programme-loading" role="status">
        Loading your programme…
      </div>
    )
  const day = programme ? programmeDay(programme, date) : null
  const active = programme && !programme.requiresCare && day?.active
  if (placement === "secondary" && day?.active) return null
  if (placement === "primary" && !day?.active && dismissed) return null
  const invitation = (
    <div className="programme-intro">
      <div>
        {placement === "primary" && (
          <h2>
            {programme?.requiresCare && day?.active
              ? "Programme guidance paused"
              : programme && day && day.day >= programme.weeks * 7
                ? "Programme complete"
                : "Nutrition, with a plan"}
          </h2>
        )}
        <p>
          {programme?.requiresCare && day?.active
            ? "Your updated profile needs an individual nutrition plan. Programme targets and workout suggestions are paused."
            : "A few weeks of guidance. Built around how you train."}
        </p>
      </div>
      <button
        className="programme-primary"
        onClick={() =>
          programme?.requiresCare && day?.active
            ? setEnding(true)
            : setSetup(true)
        }
      >
        {programme?.requiresCare && day?.active
          ? "End programme"
          : "Choose a programme"}{" "}
        <ArrowRight aria-hidden="true" />
      </button>
    </div>
  )
  return (
    <>
      <section
        className={`nutrition-programme ${active ? "is-active" : ""} ${placement === "secondary" ? "programme-secondary-slot" : ""}`}
        aria-label="Nutrition programme"
      >
        {active ? (
          <>
            <div className="programme-heading">
              <div>
                <h2>{PROGRAMME_NAMES[programme.goal]}</h2>
                <p>
                  Following your programme · Week {day.week} of{" "}
                  {programme.weeks}
                </p>
              </div>
              <Leaf size={28} aria-hidden="true" />
            </div>
            <div className="programme-phase">
              <strong>{day.phase}</strong>
              <span>
                {Math.max(0, programme.weeks * 7 - day.day - 1)} days remaining
              </span>
            </div>
            <progress
              aria-label="Programme progress"
              max={1}
              value={day.progress}
            />
            <p className="programme-focus">
              {day.phase === "Settle in"
                ? "Find your rhythm. Start with your baseline intake."
                : day.phase === "Stabilise"
                  ? "Hold your targets and build a routine you can carry forward."
                  : programme.goal === "step_down"
                    ? "A gradual reduction, with training and recovery in view."
                    : programme.goal === "step_up"
                      ? "Build your intake gradually to support your training."
                      : "Consistent nourishment. Room to focus on your training."}
            </p>
            <div className="programme-stats">
              <span>
                <strong>{day.targets.calories}</strong> kcal today
              </span>
              <span>
                <strong>{programme.fastingHours || "No"}</strong>{" "}
                {programme.fastingHours ? "hour fast" : "fasting"}
              </span>
            </div>
            <button
              className="programme-disclosure"
              aria-expanded={expanded}
              aria-controls="programme-details"
              onClick={() => setExpanded(!expanded)}
            >
              Your programme in detail
              <CaretDown className={expanded ? "rotate-180" : ""} />
            </button>
            <div
              id="programme-details"
              className="programme-details"
              inert={!expanded}
              data-open={expanded}
            >
              <div>
                <div className="programme-details-content">
                  <p>
                    Today's nutrition targets follow this phase. Your usual
                    targets return when the programme ends.
                  </p>
                  <dl>
                    <div>
                      <dt>Daily baseline</dt>
                      <dd>{programme.baselineCalories} kcal</dd>
                    </div>
                    <div>
                      <dt>Total progression</dt>
                      <dd>
                        {programme.goal === "maintain"
                          ? "Stable intake"
                          : `${programme.goal === "step_down" ? "−" : "+"}${programme.changePercent}%`}
                      </dd>
                    </div>
                    <div>
                      <dt>Protein / fat</dt>
                      <dd>
                        {day.targets.protein} g / {day.targets.fat} g
                      </dd>
                    </div>
                    {programme.fastingHours > 0 && (
                      <div>
                        <dt>Eating window starts</dt>
                        <dd>
                          {programme.eatingStart} · {programme.timezone}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <ol className="programme-weeks">
                    {Array.from({ length: programme.weeks }, (_, i) => {
                      const date = new Date(`${programme.startDate}T12:00:00Z`)
                      date.setUTCDate(date.getUTCDate() + i * 7)
                      const phase = programmeDay(
                        programme,
                        date.toISOString().slice(0, 10)
                      )
                      return (
                        <li
                          key={i}
                          aria-current={i + 1 === day.week ? "step" : undefined}
                        >
                          <span>
                            Week {i + 1} · {phase.phase}
                          </span>
                          <strong>{phase.targets.calories} kcal</strong>
                        </li>
                      )
                    })}
                  </ol>
                  <section className="programme-recipes" aria-labelledby="programme-recipes-title">
                    <div className="programme-recipes-heading">
                      <div>
                        <h3 id="programme-recipes-title">Recipes for this phase</h3>
                        <p>From your library and the OneRep community, matched to today’s targets.</p>
                      </div>
                    </div>
                    {recommendations === undefined ? (
                      <p role="status">Finding a few good fits…</p>
                    ) : recommendations.length > 0 ? (
                      <ul className="programme-recipe-list">
                        {recommendations.map((recipe) => (
                          <li key={recipe.id}>
                            <button onClick={() => navigate(`/foods/recipe/${recipe.id}`)}>
                              <span>
                                <strong>{recipe.name}</strong>
                                <small>{recipe.calories} kcal · {recipe.protein} g protein{recipe.minutes ? ` · ${recipe.minutes} min` : ""}</small>
                              </span>
                              <ArrowRight aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No library recipes fit this phase yet. Generate one below.</p>
                    )}
                    <button
                      className="programme-ai-recipe"
                      disabled={recipeBusy}
                      onClick={async () => {
                        if (!requireAiAccess(1, "programme_recipe")) return
                        setRecipeBusy(true)
                        try {
                          const result = await generateRecipe({ date })
                          toast.success(`${result.name} added to your recipes.`)
                          navigate(`/foods/recipe/${result.recipeId}`)
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Couldn’t generate a recipe.")
                        } finally {
                          setRecipeBusy(false)
                        }
                      }}
                    >
                      <Sparkle aria-hidden="true" />
                      {recipeBusy ? "Creating your recipe…" : "Generate a recipe with AI"}
                      <span>Uses 1 AI request</span>
                    </button>
                  </section>
                  <p>
                    Workout strain is checked against your phase and fasting
                    window. If a session is too demanding, adjust it from the
                    workout screen. Strain is a planning estimate, not medical
                    clearance.
                  </p>
                  <button
                    className="programme-secondary"
                    onClick={() => setEnding(true)}
                  >
                    End programme
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : placement === "secondary" ? (
          <>
            <button
              className="programme-disclosure"
              aria-expanded={invitationOpen}
              aria-controls={invitationId}
              onClick={() => setInvitationOpen(!invitationOpen)}
            >
              Nutrition programmes{" "}
              <CaretDown
                className={invitationOpen ? "rotate-180" : ""}
                aria-hidden="true"
              />
            </button>
            <div
              id={invitationId}
              className="programme-details"
              data-open={invitationOpen}
              inert={!invitationOpen}
            >
              <div>{invitation}</div>
            </div>
          </>
        ) : (
          <>
            {!day?.active && (
              <button
                className="programme-dismiss"
                aria-label="Dismiss programme invitation"
                onClick={() => {
                  safeLocalStorageSet(
                    "nutrition-programme-invitation-dismissed",
                    "true"
                  )
                  setDismissed(true)
                }}
              >
                <X size={20} aria-hidden="true" />
              </button>
            )}
            {invitation}
          </>
        )}
      </section>
      {setup && (
        <ProgrammeSetup
          baseline={baseline}
          protein={protein}
          fat={fat}
          onClose={() => setSetup(false)}
        />
      )}
      {ending && programme && (
        <MobileSheet
          ariaLabel="End programme"
          onClose={() => !busy && setEnding(false)}
        >
          <div className="programme-setup">
            <h2>End this programme?</h2>
            <p>
              Your usual nutrition targets will return today. Your food logs and
              workouts stay saved.
            </p>
            <button
              className="programme-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await end({ id: programme._id })
                  setEnding(false)
                } catch (e) {
                  toast.error(
                    e instanceof Error
                      ? e.message
                      : "Couldn't end the programme."
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? "Ending…" : "End programme"}
            </button>
            <button
              className="programme-secondary"
              disabled={busy}
              onClick={() => setEnding(false)}
            >
              Keep following
            </button>
          </div>
        </MobileSheet>
      )}
      {aiAccessModal}
    </>
  )
}

function ProgrammeSetup({
  baseline,
  protein,
  fat,
  onClose,
}: {
  baseline: number
  protein: number
  fat: number
  onClose: () => void
}) {
  const start = useMutation(api.nutritionProgrammes.start)
  const eligibility = useQuery(api.nutritionProgrammes.getEligibility, {})
  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState<ProgrammeGoal>("maintain")
  const [weeks, setWeeks] = useState(6)
  const [calories, setCalories] = useState(Math.round(baseline))
  const [change, setChange] = useState(10)
  const [fast, setFast] = useState(0)
  const [eatingStart, setEatingStart] = useState("09:00")
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    document.getElementById("programme-setup-title")?.focus()
  }, [step])
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const candidate = {
    goal,
    weeks,
    baselineCalories: calories,
    changePercent: goal === "maintain" ? 0 : change,
    protein,
    fat,
    fastingHours: fast,
    eatingStart,
    timezone,
    startDate: localProgrammeTime(timezone).date,
  }
  const endCalories = Math.round(
    calories *
      (1 +
        ((goal === "step_down" ? -1 : goal === "step_up" ? 1 : 0) *
          candidate.changePercent) /
          100)
  )
  const endingMinute =
    (Number(eatingStart.slice(0, 2)) * 60 +
      Number(eatingStart.slice(3)) +
      (24 - fast) * 60) %
    1440
  const eatingEnd = `${Math.floor(endingMinute / 60)
    .toString()
    .padStart(2, "0")}:${(endingMinute % 60).toString().padStart(2, "0")}`
  if (!eligibility?.eligible)
    return (
      <MobileSheet
        ariaLabel="Programme eligibility"
        onClose={onClose}
        panelClassName="programme-glass-sheet"
      >
        <div className="programme-setup">
          <h2>
            {eligibility
              ? "Review your nutrition profile"
              : "Checking your profile…"}
          </h2>
          <p role="status">
            {eligibility?.reason ??
              "Checking your saved nutrition preferences before setup."}
          </p>
          <div className="programme-actions">
            <button className="programme-secondary" onClick={onClose}>
              Close
            </button>
            {eligibility && (
              <a className="programme-primary" href="/settings">
                Review profile settings
              </a>
            )}
          </div>
        </div>
      </MobileSheet>
    )
  return (
    <MobileSheet
      ariaLabel="Start a nutrition programme"
      onClose={() => !busy && onClose()}
      panelClassName="programme-glass-sheet"
    >
      <form
        className="programme-setup"
        onSubmit={async (e) => {
          e.preventDefault()
          setError("")
          if (step < 2) {
            setStep(step + 1)
            return
          }
          setBusy(true)
          try {
            const { startDate: _, ...args } = candidate
            await start({ ...args, screeningConfirmed: confirmed })
            onClose()
            toast.success("Your programme starts today")
          } catch (e) {
            setError(
              e instanceof ConvexError && typeof e.data === "string"
                ? e.data
                : "Couldn't start. Please try again."
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="programme-setup-top">
          <span>Programme setup · {step + 1} of 3</span>
          <button
            type="button"
            aria-label="Close programme setup"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="programme-setup-title" tabIndex={-1}>
          {
            ["Find your rhythm", "Make it fit your day", "Your next few weeks"][
              step
            ]
          }
        </h2>
        {step === 0 && (
          <>
            <p>Choose a direction. We’ll guide the progression week by week.</p>
            <fieldset className="programme-choices">
              <legend>Programme goal</legend>
              {(
                Object.entries(PROGRAMME_NAMES) as [ProgrammeGoal, string][]
              ).map(([key, name]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={goal === key}
                  onClick={() => setGoal(key)}
                >
                  <span>
                    <strong>{name}</strong>
                    <small>
                      {key === "maintain"
                        ? "Hold your intake. Build consistency."
                        : key === "step_down"
                          ? "Lower calories in gradual weekly steps."
                          : "Increase calories to support your training."}
                    </small>
                  </span>
                  {goal === key && <Check aria-hidden="true" />}
                </button>
              ))}
            </fieldset>
            <label>
              Duration
              <select
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
              >
                {[4, 6, 8, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} weeks
                  </option>
                ))}
              </select>
            </label>
            <p>
              Clinical renutrition needs an individual care plan and isn’t
              available as a self-serve programme.
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <p>
              Start from your current intake. The first week holds steady before
              any changes.
            </p>
            <label>
              Baseline calories · kcal/day
              <input
                type="number"
                min={1600}
                max={5000}
                required
                value={calories}
                onChange={(e) => setCalories(Number(e.target.value))}
              />
            </label>
            {goal !== "maintain" && (
              <label>
                Total {goal === "step_down" ? "decrease" : "increase"}
                <select
                  value={change}
                  onChange={(e) => setChange(Number(e.target.value))}
                >
                  {[5, 10, 15].map((n) => (
                    <option key={n} value={n}>
                      {n}% over the programme
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Daily fasting window
              <select
                value={fast}
                onChange={(e) => setFast(Number(e.target.value))}
              >
                <option value={0}>No fasting schedule</option>
                {[12, 14, 16].map((n) => (
                  <option key={n} value={n}>
                    {n} hours fasting · {24 - n} hours eating
                  </option>
                ))}
              </select>
            </label>
            {fast > 0 && (
              <>
                <label>
                  Start eating at
                  <input
                    type="time"
                    required
                    value={eatingStart}
                    onChange={(e) => setEatingStart(e.target.value)}
                  />
                </label>
                <div className="programme-window">
                  <span>
                    Eating {eatingStart}–{eatingEnd}
                  </span>
                  <span>{fast}h fasting</span>
                </div>
                <p>
                  Schedule uses {timezone}. Actual fasts are logged separately
                  in your fasting tracker.
                </p>
              </>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <p>
              {PROGRAMME_NAMES[goal]} · {weeks} weeks, starting today.
            </p>
            <ol className="programme-review">
              <li>
                <strong>Week 1 · Settle in</strong>
                <span>{calories} kcal/day</span>
              </li>
              <li>
                <strong>Weeks 2–{weeks - 1} · Progress</strong>
                <span>
                  {goal === "maintain"
                    ? "Keep a consistent intake"
                    : `Gradually move to ${endCalories} kcal/day`}
                </span>
              </li>
              <li>
                <strong>Week {weeks} · Stabilise</strong>
                <span>
                  Hold your final target, then return to your usual goals.
                </span>
              </li>
            </ol>
            <p>
              Your workouts get a phase-aware strain check and a quick
              adjustment when needed.
            </p>
            <label className="programme-consent">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
              />
              <span>
                I’m 18 or older, and I’m not pregnant or breastfeeding,
                recovering from undernutrition or an eating disorder, or
                managing a condition or medication that needs a supervised
                nutrition plan.
              </span>
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="programme-actions">
          {step > 0 && (
            <button
              className="programme-secondary"
              type="button"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          )}
          <button
            className="programme-primary"
            disabled={busy || (step === 2 && !confirmed)}
          >
            {busy
              ? "Starting…"
              : step === 2
                ? "Start my programme"
                : "Continue"}
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </form>
    </MobileSheet>
  )
}
