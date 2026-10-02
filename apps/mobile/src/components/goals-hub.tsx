import { GoalsAssessment } from "@/components/goals-assessment"
import type { GoalAssessment } from "../../../../convex/lib/goalAssessment"
import { BookOpen, PencilSimple, ArrowUpRight } from "@phosphor-icons/react"
import { GoalsDisclosure } from "@/components/goals-disclosure"
import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { tr } from "@repo/ui/i18n"
import { api } from "../../../../convex/_generated/api"
import { MobileSheet } from "@/components/mobile-sheet"
import { GoalsArt } from "@/components/goals-art"
import {
  DEFAULT_GOAL_PLAN,
  type GoalFocus,
  type GoalPlan,
} from "@/lib/goal-plan"
import {
  toWorkoutLogRecords,
  type WorkoutHistoryLog,
} from "@/lib/exercise-history"
import { resolveExerciseIds } from "@/lib/exercise-catalog"
import {
  computeMuscleVolume,
  weekStart,
  type ExerciseMeta,
} from "@/lib/muscle-volume"
import { useSmoothNavigate } from "@/lib/navigation"
import "./goals.css"

const FOCUSES: { id: GoalFocus; title: string; detail: string }[] = [
  {
    id: "hypertrophy",
    title: tr("Build muscle"),
    detail: tr("Track weekly sets and strength gains."),
  },
  {
    id: "deficit",
    title: tr("Lose fat"),
    detail: tr("Reduce body fat while maintaining strength."),
  },
  {
    id: "recomp",
    title: tr("Recomposition"),
    detail: tr("Build muscle while losing fat."),
  },
  {
    id: "endurance",
    title: tr("Build endurance"),
    detail: tr("Track training for your sport."),
  },
]
const GUIDES: Record<GoalFocus, { title: string; steps: [string, string][] }> =
  {
    hypertrophy: {
      title: tr("Training for muscle growth"),
      steps: [
        [
          tr("Set a weekly target"),
          tr(
            "Spread your chosen weekly sets across sessions you can keep. Beginners may grow with fewer sets. Log reps, load and, when possible, reps in reserve."
          ),
        ],
        [
          tr("Choose how hard to train"),
          tr(
            "Finish most working sets with about 1 to 3 good reps left. Failure is optional. Add reps or a little load as the same effort becomes easier."
          ),
        ],
        [
          tr("When to change your training"),
          tr(
            "After several comparable sessions, look at performance, soreness and sleep together. If you are progressing, keep going. If fatigue persists, try a lighter week and reassess."
          ),
        ],
      ],
    },
    deficit: {
      title: tr("Training during a calorie deficit"),
      steps: [
        [
          tr("Set your calorie target"),
          tr(
            "Use Nutrition to set a gradual programme. Judge the trend across several weeks, not a single weigh-in. Larger deficits make gaining lean mass harder."
          ),
        ],
        [
          tr("Keep lifting"),
          tr(
            "Continue resistance training and eat enough protein. Maintaining performance during a cut can be a good outcome; a new personal best is not required every week."
          ),
        ],
        [
          tr("Check your rate of weight loss"),
          tr(
            "If weight is dropping rapidly alongside persistent fatigue, hunger or declining performance, review food intake and training demands. Avoid automatically adding more exercise."
          ),
        ],
      ],
    },
    recomp: {
      title: tr("Tracking recomposition"),
      steps: [
        [
          tr("Keep training and protein consistent"),
          tr(
            "Keep resistance training and protein consistent. Recomp is possible, but the size and speed of change vary with training experience and starting point."
          ),
        ],
        [
          tr("Take comparable measurements"),
          tr(
            "Track weight trends and waist under similar conditions. Compare performance at similar effort over several weeks."
          ),
        ],
        [
          tr("Compare several weeks"),
          tr(
            "Stable weight, a smaller waist and improving lifts are consistent with recomp, but do not prove muscle gain. Smart-scale lean mass also changes with hydration."
          ),
        ],
      ],
    },
    endurance: {
      title: tr("Planning endurance training"),
      steps: [
        [
          tr("Log distance and duration"),
          tr(
            "Use Endurance to track distance and duration. Build repeatable easy training around the demands of your event; no single intensity split suits everyone."
          ),
        ],
        [
          tr("Eat enough for longer sessions"),
          tr(
            "Match food and carbohydrate availability to session demands. Avoid combining aggressive restriction with a growing endurance load."
          ),
        ],
        [
          tr("Check performance and fatigue"),
          tr(
            "Review pace or power at comparable effort and conditions. Persistent fatigue, recurring injury or menstrual changes warrant a fueling review and qualified support."
          ),
        ],
      ],
    },
  }
const HANDBOOK = [
  {
    title: tr("How many sets?"),
    body: tr(
      "More weekly sets generally produce more muscle growth, with smaller benefits from each added set. There is no established upper limit that applies to everyone. The app suggests 8 to 12 direct sets as a starting point. Beginners may need fewer; experienced lifters may benefit from more."
    ),
    link: "https://pubmed.ncbi.nlm.nih.gov/41343037/",
    source: tr("Pelland et al., 2026 · dose-response meta-regression"),
  },
  {
    title: tr("How close to failure?"),
    body: tr(
      "For most working sets, aim to finish with about 1 to 3 good reps left. This is a practical guideline, not a strict cutoff. You can build muscle with a range of loads, and you do not need to take every set to failure. Log how many reps you had left to make future comparisons useful."
    ),
    link: "https://pubmed.ncbi.nlm.nih.gov/38393985/",
    source: tr("Refalo et al., 2024 · resistance-training trial"),
  },
  {
    title: tr("How much protein?"),
    body: tr(
      "For healthy adults who lift weights, about 1.6 to 2.2 g of protein per kg of body weight per day is a useful starting range. Eating too little overall can limit muscle gain even if your strength improves."
    ),
    link: "https://pubmed.ncbi.nlm.nih.gov/28698222/",
    source: tr("Morton et al., 2018 · systematic review and meta-analysis"),
  },
  {
    title: tr("Sleep and recovery"),
    body: tr(
      "Keep a regular sleep schedule and allow enough time to feel rested. If fatigue persists, look at sleep alongside your training performance. A poor night or an HRV reading cannot tell you exactly how many sets to do or how much muscle growth you have lost."
    ),
    link: "https://bjsm.bmj.com/content/55/7/356",
    source: tr("Walsh et al., 2021 · athlete sleep consensus"),
  },
  {
    title: tr("Calorie deficits and recomp"),
    body: tr(
      "Continue resistance training and eat enough protein during a deficit. Studies find that deficits reduce lean-mass gains on average, although strength can still improve. Weight, waist measurements and lifting performance can help you follow recomp, but they cannot confirm how much muscle you have gained."
    ),
    link: "https://pubmed.ncbi.nlm.nih.gov/34623696/",
    source: tr("Murphy & Koehler, 2022 · meta-analysis and meta-regression"),
  },
  {
    title: tr("Fueling endurance training"),
    body: tr(
      "Eating too little for your training load can affect both health and performance. Persistent fatigue, recurring injuries or menstrual changes are reasons to review your intake with a qualified professional. No single energy-availability threshold reliably identifies a problem in every athlete."
    ),
    link: "https://doi.org/10.1136/bjsports-2023-106994",
    source: tr("Mountjoy et al., 2023 · IOC REDs consensus"),
  },
]

function GoalSetup({
  plan,
  onChange,
  muscles,
}: {
  plan: GoalPlan
  onChange: (plan: GoalPlan) => void
  muscles: string[]
}) {
  return (
    <div className="goals-setup">
      <fieldset>
        <legend>{tr("What is your focus?")}</legend>
        <div className="goals-choices">
          {FOCUSES.map((focus) => (
            <label key={focus.id} data-selected={plan.focus === focus.id}>
              <input
                type="radio"
                name="goal-focus"
                checked={plan.focus === focus.id}
                onChange={() => onChange({ ...plan, focus: focus.id })}
              />
              <span>
                <strong>{tr(focus.title)}</strong>
                <small>{tr(focus.detail)}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {plan.focus !== "endurance" && (
        <>
          <label className="goals-field">
            {tr("Muscle with a custom set range")}
            <select
              value={plan.muscle}
              onChange={(event) =>
                onChange({ ...plan, muscle: event.target.value })
              }
            >
              {muscles.map((muscle) => (
                <option key={muscle} value={muscle}>
                  {tr(muscle)}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>{tr("Weekly direct working sets")}</legend>
            <div className="goals-bounds">
              <label className="goals-field">
                {tr("Lower bound")}
                <input
                  type="number"
                  min="1"
                  max="29"
                  value={plan.minimumSets || ""}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      minimumSets: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="goals-field">
                {tr("Upper bound")}
                <input
                  type="number"
                  min="2"
                  max="30"
                  value={plan.maximumSets || ""}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      maximumSets: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          </fieldset>
          <p className="goals-caption">
            {tr(
              "We suggest 8 to 12 direct sets to start. Adjust this to your current routine; beginners may need fewer. Sets that work the muscle indirectly are counted separately."
            )}
          </p>
        </>
      )}
      <p className="goals-caption">
        {tr(
          "Nutrition programmes suggest targets for this goal. Review them in Nutrition before applying changes. Edit workout routines in Training."
        )}
      </p>
    </div>
  )
}

type GoalsHubProps = {
  preferences:
    { goalPlan?: GoalPlan; goalsIntroducedAt?: number } | null | undefined
  history: WorkoutHistoryLog[] | undefined
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
  history,
  today,
  save,
  assessment,
}: GoalsHubProps & {
  save: (args: { plan?: GoalPlan }) => Promise<unknown>
}) {
  const navigate = useSmoothNavigate()
  const [dialog, setDialog] = useState<"tour" | "edit" | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<GoalPlan>(DEFAULT_GOAL_PLAN)
  const [saving, setSaving] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const [error, setError] = useState("")
  const [catalog, setCatalog] = useState<Map<string, ExerciseMeta> | null>(null)
  const records = useMemo(() => toWorkoutLogRecords(history ?? []), [history])
  const idsKey = useMemo(
    () =>
      JSON.stringify(
        [
          ...new Set(
            records.flatMap((log) => log.exercises.map((ex) => ex.id))
          ),
        ].sort()
      ),
    [records]
  )
  useEffect(() => {
    let active = true
    setCatalog(null)
    const ids = JSON.parse(idsKey) as string[]
    // Bounded batches resolve every logged exercise, including less common movements.
    void Promise.all(
      Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
        resolveExerciseIds(ids.slice(index * 100, index * 100 + 100))
      )
    )
      .then((results) => {
        if (active)
          setCatalog(
            new Map(
              results.flatMap((result) =>
                Object.entries(result).map(
                  ([id, exercise]) => [id, { ...exercise, id }] as const
                )
              )
            )
          )
      })
      .catch(() => {
        if (active) setCatalog(new Map())
      })
    return () => {
      active = false
    }
  }, [idsKey])
  const plan = preferences?.goalPlan
  const from = weekStart(today)
  const volume = useMemo(
    () => (catalog ? computeMuscleVolume(records, catalog, from, today) : []),
    [catalog, records, from, today]
  )
  const muscles = useMemo(
    () =>
      [
        ...new Set([
          "chest",
          "quadriceps",
          "hamstrings",
          "glutes",
          "lats",
          "shoulders",
          "biceps",
          "triceps",
          "calves",
          draft.muscle,
          ...volume.map((item) => item.muscle),
        ]),
      ].sort(),
    [volume, draft.muscle]
  )
  const activeDialog =
    dialog ??
    (preferences !== undefined && !preferences?.goalsIntroducedAt && !dismissed
      ? "tour"
      : null)
  useEffect(() => {
    if (activeDialog || !opener.current) return
    const frame = requestAnimationFrame(() =>
      opener.current?.focus({ preventScroll: true })
    )
    return () => cancelAnimationFrame(frame)
  }, [activeDialog])
  function open(kind: "tour" | "edit") {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setDraft(plan ?? DEFAULT_GOAL_PLAN)
    setStep(0)
    setError("")
    setDialog(kind)
  }
  async function persist(skip = false) {
    if (saving) return
    if (
      !skip &&
      (!Number.isInteger(draft.minimumSets) ||
        !Number.isInteger(draft.maximumSets) ||
        draft.minimumSets < 1 ||
        draft.maximumSets > 30 ||
        draft.minimumSets >= draft.maximumSets)
    ) {
      setError(
        tr(
          "Choose a range from 1 to 30 sets, with the upper bound above the lower bound."
        )
      )
      return
    }
    setSaving(true)
    setError("")
    try {
      await save(skip ? {} : { plan: draft })
      setDismissed(true)
      setDialog(null)
    } catch {
      setError(
        tr("Your goal could not be saved. Check your connection and try again.")
      )
    } finally {
      setSaving(false)
    }
  }
  const guide = GUIDES[plan?.focus ?? "hypertrophy"]
  return (
    <section className="goals-hub" aria-label={tr("Your goals")}>
      <div className="goals-heading goals-main-heading">
        <div className="goals-focus-title">
          <div>
            <h2>
              {plan
                ? tr(FOCUSES.find((focus) => focus.id === plan.focus)!.title)
                : tr("Choose a goal")}
            </h2>
          </div>
        </div>
        <button
          className="goals-text-button goals-edit"
          onClick={() => open(plan ? "edit" : "tour")}
        >
          <PencilSimple size={16} aria-hidden="true" />
          {plan ? tr("Edit goal") : tr("Set a goal")}
        </button>
      </div>
      {preferences === undefined ? (
        <p role="status">{tr("Loading your goal…")}</p>
      ) : !plan ? (
        <div className="goals-empty">
          <GoalsArt />
          <p>
            {tr(
              "Choose muscle gain, fat loss, recomp or endurance to see the relevant training advice."
            )}
          </p>
        </div>
      ) : (
        <GoalsAssessment assessment={assessment} />
      )}
      <div className="goals-resources">
        <div className="goals-guide">
          <h3>{tr(guide.title)}</h3>
          <ol>
            {guide.steps.map(([title, body]) => (
              <li key={title}>
                <strong>{tr(title)}</strong>
                <p>{tr(body)}</p>
              </li>
            ))}
          </ol>
          <div className="goals-actions">
            <button
              className="goals-primary"
              onClick={() =>
                navigate(
                  plan?.focus === "endurance" ? "/endurance" : "/workouts"
                )
              }
            >
              {tr("Plan your training")}
            </button>
            <button
              className="goals-text-button"
              onClick={() => navigate("/nutrition?programme=setup")}
            >
              {tr("Nutrition programmes ↗")}
            </button>
          </div>
        </div>
        <div className="goals-handbook">
          <div className="goals-heading">
            <BookOpen
              className="goals-book-icon"
              size={28}
              weight="duotone"
              aria-hidden="true"
            />
            <div>
              <h3>{tr("Hypertrophy handbook")}</h3>
            </div>
          </div>
          <p className="goals-caption">
            {tr("Training and nutrition advice, with links to the research.")}
          </p>
          {HANDBOOK.map((item) => (
            <GoalsDisclosure key={item.title} title={tr(item.title)}>
              <p>{tr(item.body)}</p>
              <a href={item.link} target="_blank" rel="noreferrer">
                {tr(item.source)} <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </GoalsDisclosure>
          ))}
          <button
            className="goals-text-button goals-replay"
            onClick={() => open("tour")}
          >
            {tr("Replay the Goals introduction")}
          </button>
        </div>
      </div>
      {activeDialog && (
        <MobileSheet
          ariaLabel={
            activeDialog === "edit"
              ? tr("Edit your goal")
              : tr("Welcome to Goals")
          }
          showHandle={false}
          closeOnBackdrop={false}
          dismissible={!saving}
          maxHeight="92dvh"
          panelClassName="goals-dialog"
          onClose={() => {
            if (!saving) {
              setDismissed(true)
              setDialog(null)
              setError("")
            }
          }}
        >
          <div className="goals-tour">
            <div className="goals-tour-top">
              <span>
                {activeDialog === "edit"
                  ? tr("Edit goal")
                  : tr("Step {{step}} of 4", { step: step + 1 })}
              </span>
              <button
                aria-label={tr("Close Goals introduction")}
                disabled={saving}
                onClick={() => {
                  setDismissed(true)
                  setDialog(null)
                }}
              >
                ×
              </button>
            </div>
            {activeDialog === "edit" || step === 3 ? (
              <>
                <h2>{tr("Set your goal")}</h2>
                <p>
                  {tr(
                    "Choose a goal and a reference range for one muscle. The assessment also reviews all mapped muscle groups and your health readings."
                  )}
                </p>
                <GoalSetup plan={draft} onChange={setDraft} muscles={muscles} />
              </>
            ) : (
              <div key={step} className="goals-tour-page" aria-live="polite">
                <GoalsArt
                  kind={step === 0 ? "welcome" : step === 1 ? "range" : "adapt"}
                />
                <h2>
                  {tr(
                    [
                      tr("Welcome to Goals."),
                      tr("Training and recovery together"),
                      tr("When to adjust your plan"),
                    ][step]
                  )}
                </h2>
                <p>
                  {tr(
                    [
                      tr(
                        "Goals combines your training history with sleep, recovery readings and daily activity. It reviews every mapped muscle group and suggests what to change next."
                      ),
                      tr(
                        "More sets are not always the useful next step. The assessment reviews volume, spacing between sessions, sleep, personal heart-rate trends and lift performance together."
                      ),
                      tr(
                        "Compare several sessions at a similar effort. If you can lift more and recover between workouts, keep your plan. If performance falls and you stay tired, check your sleep and food intake, and consider reducing training for a week."
                      ),
                    ][step]
                  )}
                </p>
                {step === 1 && (
                  <div className="goals-tour-fact">
                    <strong>{tr("Reading the assessment")}</strong>
                    <p>
                      {tr(
                        "The assessment compares logged sets with your chosen range or previous training. Sleep and recovery readings affect the overall score and suggestions, without pretending to measure muscle recovery."
                      )}
                    </p>
                  </div>
                )}
                {step === 2 && (
                  <ul className="goals-tour-list">
                    <li>
                      {tr(
                        "Log reps, weight and effort for each completed working set."
                      )}
                    </li>
                    <li>
                      {tr(
                        "Sync health readings to include sleep, steps, HRV and resting heart rate."
                      )}
                    </li>
                    <li>
                      {tr(
                        "Check the suggested changes and the explanation of each score."
                      )}
                    </li>
                  </ul>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="goals-error">
                {error}
              </p>
            )}
            <div className="goals-tour-footer">
              {activeDialog === "tour" && step > 0 ? (
                <button
                  className="goals-text-button"
                  disabled={saving}
                  onClick={() => {
                    setStep((value) => value - 1)
                    setError("")
                  }}
                >
                  {tr("Back")}
                </button>
              ) : (
                <button
                  className="goals-text-button"
                  disabled={saving}
                  onClick={() => void persist(true)}
                >
                  {tr("Skip for now")}
                </button>
              )}
              <button
                className="goals-primary"
                disabled={saving}
                onClick={() =>
                  activeDialog === "edit" || step === 3
                    ? void persist()
                    : setStep((value) => value + 1)
                }
              >
                {saving
                  ? tr("Saving…")
                  : activeDialog === "edit" || step === 3
                    ? tr("Save goal")
                    : tr("Continue")}
              </button>
            </div>
          </div>
        </MobileSheet>
      )}
    </section>
  )
}
