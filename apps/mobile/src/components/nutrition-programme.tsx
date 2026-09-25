import { Message, choice, tr, translateError } from "@repo/ui/i18n"
import { useEffect, useId, useState } from "react"
import { ConvexError } from "convex/values"
import { useAction, useMutation, useQuery } from "convex/react"
import {
  ArrowRight,
  CaretDown,
  Check,
  Leaf,
  Sparkle,
  X,
} from "@phosphor-icons/react"
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
        {tr("Loading your programme…")}
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
              ? tr("Programme guidance paused")
              : programme && day && day.day >= programme.weeks * 7
                ? tr("Programme complete")
                : tr("Nutrition, with a plan")}
          </h2>
        )}
        <p>
          {programme?.requiresCare && day?.active
            ? tr(
                "Your updated profile needs an individual nutrition plan. Programme targets and workout suggestions are paused."
              )
            : tr("A few weeks of guidance. Built around how you train.")}
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
          ? tr("End programme")
          : tr("Choose a programme")}{" "}
        <ArrowRight aria-hidden="true" />
      </button>
    </div>
  )
  return (
    <>
      <section
        className={`nutrition-programme ${active ? "is-active" : ""} ${placement === "secondary" ? "programme-secondary-slot" : ""}`}
        aria-label={tr("Nutrition programme")}
      >
        {active ? (
          <>
            <div className="programme-heading">
              <div>
                <h2>{PROGRAMME_NAMES[programme.goal]}</h2>
                <p>
                  <Message
                    text={
                      "Following your programme · Week {{value0}} of {{value1}}"
                    }
                    values={{ value0: day.week, value1: programme.weeks }}
                  />
                </p>
              </div>
              <Leaf size={28} aria-hidden="true" />
            </div>
            <div className="programme-phase">
              <strong>{day.phase}</strong>
              <span>
                <Message
                  text={"{{value0}} days remaining"}
                  values={{
                    value0: Math.max(0, programme.weeks * 7 - day.day - 1),
                  }}
                />
              </span>
            </div>
            <progress
              aria-label={tr("Programme progress")}
              max={1}
              value={day.progress}
            />
            <p className="programme-focus">
              {day.phase === "Settle in"
                ? tr("Find your rhythm. Start with your baseline intake.")
                : day.phase === "Stabilise"
                  ? tr(
                      "Hold your targets and build a routine you can carry forward."
                    )
                  : programme.goal === "step_down"
                    ? tr(
                        "A gradual reduction, with training and recovery in view."
                      )
                    : programme.goal === "step_up"
                      ? tr(
                          "Build your intake gradually to support your training."
                        )
                      : tr(
                          "Consistent nourishment. Room to focus on your training."
                        )}
            </p>
            <div className="programme-stats">
              <span>
                <Message
                  text={"{{value0}} kcal today"}
                  values={{ value0: <strong>{day.targets.calories}</strong> }}
                />
              </span>
              <span>
                <strong>{programme.fastingHours || tr("No")}</strong>{" "}
                {programme.fastingHours ? tr("hour fast") : tr("fasting")}
              </span>
            </div>
            <button
              className="programme-disclosure"
              aria-expanded={expanded}
              aria-controls="programme-details"
              onClick={() => setExpanded(!expanded)}
            >
              <Message
                text={"Your programme in detail{{value0}}"}
                values={{
                  value0: (
                    <CaretDown className={expanded ? "rotate-180" : ""} />
                  ),
                }}
              />
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
                    {tr(
                      "Today's nutrition targets follow this phase. Your usual targets return when the programme ends."
                    )}
                  </p>
                  <dl>
                    <div>
                      <dt>{tr("Daily baseline")}</dt>
                      <dd>
                        <Message
                          text={"{{value0}} kcal"}
                          values={{ value0: programme.baselineCalories }}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>{tr("Total progression")}</dt>
                      <dd>
                        {programme.goal === "maintain"
                          ? tr("Stable intake")
                          : tr("{{value0}}{{value1}}%", {
                              value0: choice(
                                programme.goal === "step_down" ? "−" : "+"
                              ),
                              value1: programme.changePercent,
                            })}
                      </dd>
                    </div>
                    <div>
                      <dt>{tr("Protein / fat")}</dt>
                      <dd>
                        <Message
                          text={"{{value0}} g / {{value1}} g"}
                          values={{
                            value0: day.targets.protein,
                            value1: day.targets.fat,
                          }}
                        />
                      </dd>
                    </div>
                    {programme.fastingHours > 0 && (
                      <div>
                        <dt>{tr("Eating window starts")}</dt>
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
                            <Message
                              text={"Week {{value0}} · {{value1}}"}
                              values={{ value0: i + 1, value1: phase.phase }}
                            />
                          </span>
                          <strong>
                            <Message
                              text={"{{value0}} kcal"}
                              values={{ value0: phase.targets.calories }}
                            />
                          </strong>
                        </li>
                      )
                    })}
                  </ol>
                  <section
                    className="programme-recipes"
                    aria-labelledby="programme-recipes-title"
                  >
                    <div className="programme-recipes-heading">
                      <div>
                        <h3 id="programme-recipes-title">
                          {tr("Recipes for this phase")}
                        </h3>
                        <p>
                          {tr(
                            "From your library and the OneRep community, matched to today’s targets."
                          )}
                        </p>
                      </div>
                    </div>
                    {recommendations === undefined ? (
                      <p role="status">{tr("Finding a few good fits…")}</p>
                    ) : recommendations.length > 0 ? (
                      <ul className="programme-recipe-list">
                        {recommendations.map((recipe) => (
                          <li key={recipe.id}>
                            <button
                              onClick={() =>
                                navigate(`/foods/recipe/${recipe.id}`)
                              }
                            >
                              <span>
                                <strong>{recipe.name}</strong>
                                <small>
                                  <Message
                                    text={
                                      "{{value0}} kcal · {{value1}} g protein{{value2}}"
                                    }
                                    values={{
                                      value0: recipe.calories,
                                      value1: recipe.protein,
                                      value2: recipe.minutes
                                        ? tr(" · {{value0}} min", {
                                            value0: recipe.minutes,
                                          })
                                        : "",
                                    }}
                                  />
                                </small>
                              </span>
                              <ArrowRight aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        {tr(
                          "No library recipes fit this phase yet. Generate one below."
                        )}
                      </p>
                    )}
                    <button
                      className="programme-ai-recipe"
                      disabled={recipeBusy}
                      onClick={async () => {
                        if (!requireAiAccess(1, "programme_recipe")) return
                        setRecipeBusy(true)
                        try {
                          const result = await generateRecipe({ date })
                          toast.success(
                            tr("{{value0}} added to your recipes.", {
                              value0: result.name,
                            })
                          )
                          navigate(`/foods/recipe/${result.recipeId}`)
                        } catch (error) {
                          toast.error(
                            translateError(
                              error instanceof Error
                                ? error.message
                                : tr("Couldn’t generate a recipe.")
                            )
                          )
                        } finally {
                          setRecipeBusy(false)
                        }
                      }}
                    >
                      <Sparkle aria-hidden="true" />
                      {recipeBusy
                        ? tr("Creating your recipe…")
                        : tr("Generate a recipe with AI")}
                      <span>{tr("Uses 1 AI request")}</span>
                    </button>
                  </section>
                  <p>
                    {tr(
                      "Workout strain is checked against your phase and fasting window. If a session is too demanding, adjust it from the workout screen. Strain is a planning estimate, not medical clearance."
                    )}
                  </p>
                  <button
                    className="programme-secondary"
                    onClick={() => setEnding(true)}
                  >
                    {tr("End programme")}
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
              <Message
                text={"Nutrition programmes {{value0}}"}
                values={{
                  value0: (
                    <CaretDown
                      className={invitationOpen ? "rotate-180" : ""}
                      aria-hidden="true"
                    />
                  ),
                }}
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
                aria-label={tr("Dismiss programme invitation")}
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
          ariaLabel={tr("End programme")}
          onClose={() => !busy && setEnding(false)}
        >
          <div className="programme-setup">
            <h2>{tr("End this programme?")}</h2>
            <p>
              {tr(
                "Your usual nutrition targets will return today. Your food logs and workouts stay saved."
              )}
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
                    translateError(
                      e instanceof Error
                        ? e.message
                        : tr("Couldn't end the programme.")
                    )
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? tr("Ending…") : tr("End programme")}
            </button>
            <button
              className="programme-secondary"
              disabled={busy}
              onClick={() => setEnding(false)}
            >
              {tr("Keep following")}
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
        ariaLabel={tr("Programme eligibility")}
        onClose={onClose}
        panelClassName="programme-glass-sheet"
      >
        <div className="programme-setup">
          <h2>
            {eligibility
              ? tr("Review your nutrition profile")
              : tr("Checking your profile…")}
          </h2>
          <p role="status">
            {eligibility?.reason ??
              tr("Checking your saved nutrition preferences before setup.")}
          </p>
          <div className="programme-actions">
            <button className="programme-secondary" onClick={onClose}>
              {tr("Close")}
            </button>
            {eligibility && (
              <a className="programme-primary" href="/settings">
                {tr("Review profile settings")}
              </a>
            )}
          </div>
        </div>
      </MobileSheet>
    )
  return (
    <MobileSheet
      ariaLabel={tr("Start a nutrition programme")}
      onClose={() => !busy && onClose()}
      panelClassName="programme-glass-sheet"
    >
      <form
        className="programme-setup"
        onSubmit={async (e) => {
          e.preventDefault()
          setError(translateError(""))
          if (step < 2) {
            setStep(step + 1)
            return
          }
          setBusy(true)
          try {
            const { startDate: _, ...args } = candidate
            await start({ ...args, screeningConfirmed: confirmed })
            onClose()
            toast.success(tr("Your programme starts today"))
          } catch (e) {
            setError(
              translateError(
                e instanceof ConvexError && typeof e.data === "string"
                  ? e.data
                  : tr("Couldn't start. Please try again.")
              )
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="programme-setup-top">
          <span>
            <Message
              text={"Programme setup · {{value0}} of 3"}
              values={{ value0: step + 1 }}
            />
          </span>
          <button
            type="button"
            aria-label={tr("Close programme setup")}
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="programme-setup-title" tabIndex={-1}>
          {
            [
              tr("Find your rhythm"),
              tr("Make it fit your day"),
              tr("Your next few weeks"),
            ][step]
          }
        </h2>
        {step === 0 && (
          <>
            <p>
              {tr(
                "Choose a direction. We’ll guide the progression week by week."
              )}
            </p>
            <fieldset className="programme-choices">
              <legend>{tr("Programme goal")}</legend>
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
                        ? tr("Hold your intake. Build consistency.")
                        : key === "step_down"
                          ? tr("Lower calories in gradual weekly steps.")
                          : tr("Increase calories to support your training.")}
                    </small>
                  </span>
                  {goal === key && <Check aria-hidden="true" />}
                </button>
              ))}
            </fieldset>
            <label>
              <Message
                text={"Duration{{value0}}"}
                values={{
                  value0: (
                    <select
                      value={weeks}
                      onChange={(e) => setWeeks(Number(e.target.value))}
                    >
                      {[4, 6, 8, 12].map((n) => (
                        <option key={n} value={n}>
                          <Message
                            text={"{{value0}} weeks"}
                            values={{ value0: n }}
                          />
                        </option>
                      ))}
                    </select>
                  ),
                }}
              />
            </label>
            <p>
              {tr(
                "Clinical renutrition needs an individual care plan and isn’t available as a self-serve programme."
              )}
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <p>
              {tr(
                "Start from your current intake. The first week holds steady before any changes."
              )}
            </p>
            <label>
              <Message
                text={"Baseline calories · kcal/day{{value0}}"}
                values={{
                  value0: (
                    <input
                      type="number"
                      min={1600}
                      max={5000}
                      required
                      value={calories}
                      onChange={(e) => setCalories(Number(e.target.value))}
                    />
                  ),
                }}
              />
            </label>
            {goal !== "maintain" && (
              <label>
                <Message
                  text={"Total {{value0}}{{value1}}"}
                  values={{
                    value0: choice(
                      goal === "step_down" ? "decrease" : "increase"
                    ),
                    value1: (
                      <select
                        value={change}
                        onChange={(e) => setChange(Number(e.target.value))}
                      >
                        {[5, 10, 15].map((n) => (
                          <option key={n} value={n}>
                            <Message
                              text={"{{value0}}% over the programme"}
                              values={{ value0: n }}
                            />
                          </option>
                        ))}
                      </select>
                    ),
                  }}
                />
              </label>
            )}
            <label>
              <Message
                text={"Daily fasting window{{value0}}"}
                values={{
                  value0: (
                    <select
                      value={fast}
                      onChange={(e) => setFast(Number(e.target.value))}
                    >
                      <option value={0}>{tr("No fasting schedule")}</option>
                      {[12, 14, 16].map((n) => (
                        <option key={n} value={n}>
                          <Message
                            text={
                              "{{value0}} hours fasting · {{value1}} hours eating"
                            }
                            values={{ value0: n, value1: 24 - n }}
                          />
                        </option>
                      ))}
                    </select>
                  ),
                }}
              />
            </label>
            {fast > 0 && (
              <>
                <label>
                  <Message
                    text={"Start eating at{{value0}}"}
                    values={{
                      value0: (
                        <input
                          type="time"
                          required
                          value={eatingStart}
                          onChange={(e) => setEatingStart(e.target.value)}
                        />
                      ),
                    }}
                  />
                </label>
                <div className="programme-window">
                  <span>
                    <Message
                      text={"Eating {{value0}}–{{value1}}"}
                      values={{ value0: eatingStart, value1: eatingEnd }}
                    />
                  </span>
                  <span>
                    <Message
                      text={"{{value0}}h fasting"}
                      values={{ value0: fast }}
                    />
                  </span>
                </div>
                <p>
                  <Message
                    text={
                      "Schedule uses {{value0}}. Actual fasts are logged separately in your fasting tracker."
                    }
                    values={{ value0: timezone }}
                  />
                </p>
              </>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <p>
              <Message
                text={"{{value0}} · {{value1}} weeks, starting today."}
                values={{ value0: PROGRAMME_NAMES[goal], value1: weeks }}
              />
            </p>
            <ol className="programme-review">
              <li>
                <strong>{tr("Week 1 · Settle in")}</strong>
                <span>
                  <Message
                    text={"{{value0}} kcal/day"}
                    values={{ value0: calories }}
                  />
                </span>
              </li>
              <li>
                <strong>
                  <Message
                    text={"Weeks 2–{{value0}} · Progress"}
                    values={{ value0: weeks - 1 }}
                  />
                </strong>
                <span>
                  {goal === "maintain"
                    ? tr("Keep a consistent intake")
                    : tr("Gradually move to {{value0}} kcal/day", {
                        value0: endCalories,
                      })}
                </span>
              </li>
              <li>
                <strong>
                  <Message
                    text={"Week {{value0}} · Stabilise"}
                    values={{ value0: weeks }}
                  />
                </strong>
                <span>
                  {tr(
                    "Hold your final target, then return to your usual goals."
                  )}
                </span>
              </li>
            </ol>
            <p>
              {tr(
                "Your workouts get a phase-aware strain check and a quick adjustment when needed."
              )}
            </p>
            <label className="programme-consent">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
              />
              <span>
                {tr(
                  "I’m 18 or older, and I’m not pregnant or breastfeeding, recovering from undernutrition or an eating disorder, or managing a condition or medication that needs a supervised nutrition plan."
                )}
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
              {tr("Back")}
            </button>
          )}
          <button
            className="programme-primary"
            disabled={busy || (step === 2 && !confirmed)}
          >
            {busy
              ? tr("Starting…")
              : step === 2
                ? tr("Start my programme")
                : tr("Continue")}
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </form>
    </MobileSheet>
  )
}
