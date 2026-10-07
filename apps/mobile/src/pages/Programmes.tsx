import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import { ArrowLeft, ArrowRight, Plus } from "@phosphor-icons/react"
import { tr, translateError } from "@repo/ui/i18n"
import { toast } from "@repo/ui"
import type {
  ProgrammePlan,
  ProgrammeSession,
  ProgrammeTrack,
} from "@repo/models"
import { api } from "../../../../convex/_generated/api"
import type { Doc, Id } from "../../../../convex/_generated/dataModel"
import {
  localProgrammeTime,
  programmeDay,
} from "../../../../convex/lib/nutritionProgramme"
import { useAiFeatureGate } from "@/lib/ai-access"
import { useSmoothNavigate } from "@/lib/navigation"
import { useAppAuth } from "@/lib/auth-client"
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeLocalStorageRemove,
} from "@/lib/utils"
import {
  ProgrammeSetup,
  newSetupDraft,
  type SetupDraft,
  type ProgrammeTrackChoice,
} from "@/components/programmes/setup"
import {
  ProgrammePlanView,
  type LibraryRecipe,
} from "@/components/programmes/plan"
import { ProgrammeField } from "@/components/programmes/fields"
import {
  ProgrammeAccordion,
  ProgrammeTransition,
} from "@/components/programmes/motion"
import "@/components/programmes/programmes.css"

type Programme = Doc<"guidedProgrammes">
const errorMessage = (error: unknown) =>
  translateError(
    error instanceof Error
      ? error.message
      : tr(
          "Something went wrong. Your changes are still here. Please try again.",
        ),
  )
function emptyPlan(track: ProgrammeTrack, weeks: number): ProgrammePlan {
  return track === "nutrition"
    ? { summary: "", nutrition: { recipes: [], meals: [] } }
    : {
        summary: "",
        training: {
          mesocycles: [
            {
              id: crypto.randomUUID(),
              name: tr("Build consistency"),
              startWeek: 1,
              endWeek: weeks,
              objective: "",
              progression: "",
              deload: false,
            },
          ],
          sessions: [],
        },
      }
}
function isTrack(value: string | null): value is ProgrammeTrackChoice {
  return value === "nutrition" || value === "training" || value === "both"
}

export default function Programmes() {
  const navigate = useSmoothNavigate()
  const [params, setParams] = useSearchParams()
  const { userId } = useAppAuth()
  const programmes = useQuery(api.guidedProgrammes.list, {})
  const legacyNutrition = useQuery(api.nutritionProgrammes.getCurrent, {})
  const preferences = useQuery(api.users.onboarding.get, {})
  const calorieEstimate = useQuery(api.logs.calories.getGoals, {})
  const recommendation = useQuery(
    api.nutritionProgrammes.getGoalRecommendation,
    {},
  )
  const library = useQuery(api.logs.recipes.list, {})
  const catalog = useQuery(api.exercises.catalog, {})
  const saveDraft = useMutation(api.guidedProgrammes.saveDraft)
  const generate = useAction(api.ai.guidedProgramme.generate)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  const [setup, setSetup] = useState<SetupDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const generationLock = useRef(false)
  const storageKey = `onerep:programme-setup:v1:${userId ?? "guest"}`
  const requested = params.get("setup") === "1"
  const selectedId = params.get("programme") as Id<"guidedProgrammes"> | null
  const trackFilter = params.get("track")
  const legacyNutritionActive =
    !!legacyNutrition &&
    !programmes?.some(
      (row) => row.nutritionProgrammeId === legacyNutrition._id,
    ) &&
    programmeDay(
      legacyNutrition,
      localProgrammeTime(legacyNutrition.timezone).date,
    ).active
  const persistDraft = useCallback(
    (draft: SetupDraft) => {
      safeLocalStorageSet(storageKey, JSON.stringify(draft))
    },
    [storageKey],
  )
  useEffect(() => {
    if (
      !requested ||
      setup ||
      preferences === undefined ||
      recommendation === undefined ||
      calorieEstimate === undefined
    )
      return
    const queryTrack = params.get("track")
    const draft = newSetupDraft(
      isTrack(queryTrack) ? queryTrack : "nutrition",
      params.get("mode") === "manual" ? "manual" : "guided",
    )
    try {
      const saved = JSON.parse(
        safeLocalStorageGet(storageKey) ?? "null",
      ) as SetupDraft | null
      if (
        saved?.settings &&
        isTrack(saved.track) &&
        Number.isInteger(saved.step) &&
        (!isTrack(queryTrack) || saved.track === queryTrack) &&
        (!params.has("mode") || saved.settings.mode === params.get("mode"))
      ) {
        Object.assign(draft, saved, {
          settings: { ...draft.settings, ...saved.settings },
        })
      } else {
        draft.settings.experience = preferences?.experienceLevel ?? "beginner"
        draft.settings.diet = preferences?.dietType || draft.settings.diet
        draft.settings.allergies = preferences?.allergies ?? []
        draft.settings.mealsPerDay = Math.max(
          1,
          Math.min(6, preferences?.mealFrequency ?? draft.settings.mealsPerDay),
        )
        draft.settings.budget =
          preferences?.budget === "low"
            ? "Budget-friendly"
            : preferences?.budget === "flexible"
              ? "Flexible"
              : "Moderate"
        draft.targetsSource =
          calorieEstimate || recommendation?.baselineCalories
            ? "profile"
            : "default"
        if (calorieEstimate)
          Object.assign(draft.settings, {
            baselineCalories: Math.round(calorieEstimate.tdee),
            protein: calorieEstimate.protein,
            fat: calorieEstimate.fat,
          })
        draft.settings.goal =
          preferences?.goal === "build"
            ? tr("Build muscle")
            : preferences?.goal === "lose"
              ? tr("Lose fat and build consistency")
              : preferences?.goal === "performance"
                ? tr("Improve performance")
                : tr("Build a consistent routine")
        if (recommendation)
          Object.assign(draft.settings, {
            baselineCalories:
              recommendation.baselineCalories ??
              draft.settings.baselineCalories,
            protein: recommendation.protein,
            fat: recommendation.fat,
            nutritionGoal: recommendation.goal,
            changePercent: recommendation.changePercent,
          })
      }
    } catch {
      /* An unreadable local draft starts a fresh setup. */
    }
    if (params.has("mode") && params.has("track") && draft.step === 0)
      draft.step = 2
    setSetup(draft)
  }, [
    requested,
    setup,
    preferences,
    recommendation,
    calorieEstimate,
    params,
    storageKey,
  ])
  const openSetup = () => {
    setError("")
    setParams({
      setup: "1",
      ...(isTrack(trackFilter) ? { track: trackFilter } : {}),
    })
  }
  const closeSetup = () => {
    setSetup(null)
    setParams({})
  }
  async function completeSetup(draft: SetupDraft) {
    if (generationLock.current) return
    if (!programmes) {
      setError(
        tr(
          "Your saved programmes are still loading. Please try again in a moment.",
        ),
      )
      return
    }
    const running = programmes.find(
      (row) =>
        Object.values(draft.ids ?? {}).includes(row._id) &&
        row.generationStatus === "running",
    )
    if (running) {
      setSetup(null)
      setParams({ programme: running._id })
      toast.message(
        tr(
          "Your programme is already being prepared. No additional tokens were used.",
        ),
      )
      return
    }
    const tracks: ProgrammeTrack[] =
      draft.track === "both" ? ["nutrition", "training"] : [draft.track]
    const sameSettings =
      draft.generationSignature === JSON.stringify(draft.settings)
    const existing = tracks.map((track) =>
      sameSettings
        ? programmes?.find((row) => row._id === draft.ids?.[track])
        : undefined,
    )
    const remaining = tracks.filter(
      (track, index) =>
        !existing[index]?.plan &&
        !(sameSettings && draft.completedTracks?.includes(track)),
    )
    if (
      draft.settings.mode === "guided" &&
      remaining.length &&
      !requireAiAccess(5 * remaining.length, "guided_programme")
    )
      return
    generationLock.current = true
    setBusy(true)
    setError("")
    const working: SetupDraft = {
      ...draft,
      ids: sameSettings ? { ...draft.ids } : {},
      requestIds: sameSettings ? { ...draft.requestIds } : {},
      completedTracks: sameSettings ? [...(draft.completedTracks ?? [])] : [],
      generationSignature: JSON.stringify(draft.settings),
    }
    try {
      for (const track of tracks) {
        const prior = programmes?.find(
          (row) => row._id === working.ids?.[track],
        )
        if (prior?.plan || working.completedTracks?.includes(track)) continue
        const programmeId = await saveDraft({
          ...(working.ids?.[track]
            ? { id: working.ids[track] as Id<"guidedProgrammes"> }
            : {}),
          track,
          settings: working.settings,
          ...(working.settings.mode === "manual"
            ? { plan: emptyPlan(track, working.settings.weeks) }
            : {}),
        })
        working.ids![track] = programmeId
        working.requestIds![track] ??= crypto.randomUUID()
        persistDraft(working)
        if (working.settings.mode === "guided")
          await generate({
            id: programmeId,
            requestId: working.requestIds![track]!,
          })
        working.completedTracks!.push(track)
        persistDraft(working)
      }
      safeLocalStorageRemove(storageKey)
      setSetup(null)
      setParams({
        programme: working.ids![tracks[0]!]!,
        ...(working.settings.mode === "manual" ? { edit: "1" } : {}),
      })
      toast.success(tr("Your programme is ready to review"))
    } catch (cause) {
      persistDraft(working)
      setError(errorMessage(cause))
      setSetup(working)
    } finally {
      generationLock.current = false
      setBusy(false)
    }
  }
  const recipes: LibraryRecipe[] = (library ?? []).map((recipe) => ({
    id: String(recipe._id),
    recipeId: String(recipe._id),
    name: recipe.name,
    category: recipe.category ?? "Lunch",
    servings: recipe.servings ?? 1,
    prepMinutes: recipe.prepMinutes ?? 0,
    cookMinutes: recipe.cookMinutes ?? 0,
    ingredients: recipe.ingredients.map(
      ({
        name,
        grams,
        caloriesPer100,
        proteinPer100,
        carbsPer100,
        fatPer100,
      }) => ({
        name,
        grams,
        caloriesPer100,
        proteinPer100,
        carbsPer100,
        fatPer100,
      }),
    ),
    steps: recipe.steps?.length
      ? recipe.steps
      : [tr("Prepare your saved recipe.")],
  }))
  if (setup && requested)
    return (
      <>
        <ProgrammeSetup
          key={JSON.stringify([setup.ids, setup.completedTracks])}
          initial={setup}
          busy={busy}
          error={error}
          onSaveDraft={persistDraft}
          onComplete={completeSetup}
          onClose={closeSetup}
        />
        {aiAccessModal}
      </>
    )
  return (
    <main
      className="programmes-screen"
      data-view={selectedId ? "detail" : "hub"}
    >
      <div className="programmes-backdrop" aria-hidden="true" />
      <header>
        <button
          className="programmes-link"
          onClick={() => (selectedId ? setParams({}) : navigate("/"))}
        >
          <ArrowLeft size={18} />
          {selectedId ? tr("Programmes") : tr("Home")}
        </button>
        <button className="programmes-link" onClick={openSetup}>
          <Plus size={16} />
          {tr("New programme")}
        </button>
      </header>
      <ProgrammeTransition viewKey={selectedId ?? "hub"}>
        {selectedId ? (
          <ProgrammeDetail
            key={selectedId}
            id={selectedId}
            initiallyEditing={params.get("edit") === "1"}
            legacyNutritionActive={legacyNutritionActive}
            programmes={programmes ?? []}
            library={recipes}
            exercises={(catalog ?? []).map((exercise) => ({
              ...exercise,
              equipment: exercise.equipment ?? undefined,
            }))}
            onClose={() => setParams({})}
          />
        ) : (
          <section className="programmes-hub">
            <h1>{tr("Programmes")}</h1>
            {legacyNutrition &&
              !programmes?.some(
                (row) => row.nutritionProgrammeId === legacyNutrition._id,
              ) &&
              programmeDay(
                legacyNutrition,
                localProgrammeTime(legacyNutrition.timezone).date,
              ).active && (
                <section className="programmes-track">
                  <span className="programmes-kicker">
                    {tr("Nutrition · Following")}
                  </span>
                  <h2>{tr("Your current nutrition programme")}</h2>

                  <button
                    className="programmes-link"
                    onClick={() => navigate("/nutrition")}
                  >
                    {tr("Manage nutrition programme")} <ArrowRight size={16} />
                  </button>
                </section>
              )}
            {programmes === undefined || requested ? (
              <p role="status">{tr("Loading your programmes…")}</p>
            ) : (
              <>
                {!!safeLocalStorageGet(storageKey) && (
                  <div className="programmes-notice">
                    <button className="programmes-link" onClick={openSetup}>
                      {tr("Continue setup")} <ArrowRight size={16} />
                    </button>
                  </div>
                )}
                {!programmes.length ? (
                  <div className="programmes-empty">
                    <h2>{tr("Nutrition, training, or both.")}</h2>
                    <button className="programmes-link" onClick={openSetup}>
                      {tr("Create programme")} <ArrowRight size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    {programmes
                      .filter(
                        (row) =>
                          row.status !== "ended" &&
                          (!isTrack(trackFilter) ||
                            trackFilter === "both" ||
                            row.track === trackFilter),
                      )
                      .map((row) => (
                        <ProgrammeOverview
                          key={row._id}
                          programme={row}
                          onOpen={() => setParams({ programme: row._id })}
                        />
                      ))}
                    {!programmes.some(
                      (row) =>
                        row.status !== "ended" &&
                        (!isTrack(trackFilter) ||
                          trackFilter === "both" ||
                          row.track === trackFilter),
                    ) && (
                      <div className="programmes-empty">
                        <h2>
                          {tr(
                            trackFilter === "training"
                              ? "Your training programme starts here."
                              : trackFilter === "nutrition"
                                ? "Your nutrition programme starts here."
                                : "Ready for your next programme?",
                          )}
                        </h2>

                        <button className="programmes-link" onClick={openSetup}>
                          {tr("New programme")} <ArrowRight size={16} />
                        </button>
                      </div>
                    )}
                    {programmes.some((row) => row.status === "ended") && (
                      <ProgrammeAccordion title={tr("Previous programmes")}>
                        {programmes
                          .filter((row) => row.status === "ended")
                          .map((row) => (
                            <ProgrammeOverview
                              key={row._id}
                              programme={row}
                              onOpen={() => setParams({ programme: row._id })}
                            />
                          ))}
                      </ProgrammeAccordion>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        )}
      </ProgrammeTransition>
      {aiAccessModal}
    </main>
  )
}

function programmeWeek(programme: Programme) {
  const today = localProgrammeTime(
    programme.settings.timezone,
    programme.status === "paused" && programme.pausedAt
      ? new Date(programme.pausedAt)
      : new Date(),
  ).date
  return programme.startDate
    ? Math.max(
        1,
        Math.min(
          programme.settings.weeks,
          Math.floor(
            (Date.parse(today) - Date.parse(programme.startDate)) / 604800000,
          ) + 1,
        ),
      )
    : 1
}
function ProgrammeOverview({
  programme,
  onOpen,
}: {
  programme: Programme
  onOpen: () => void
}) {
  const day = new Date(
    `${localProgrammeTime(programme.settings.timezone).date}T12:00:00`,
  ).getDay()
  const week = programmeWeek(programme)
  const block = programme.plan?.training?.mesocycles.find(
    (item) => item.startWeek <= week && item.endWeek >= week,
  )
  const session = programme.plan?.training?.sessions.find(
    (item) =>
      item.dayOfWeek === day && (!item.blockId || item.blockId === block?.id),
  )
  const meals = programme.plan?.nutrition?.meals.filter(
    (item) => item.day === day,
  )
  return (
    <section className="programmes-overview">
      <ProgrammeAccordion
        title={
          <>
            <span className="programmes-kicker">
              {tr(programme.track === "nutrition" ? "Nutrition" : "Training")}
              {programme.status !== "active" && (
                <>
                  {" "}
                  ·{" "}
                  {tr(
                    programme.status === "paused"
                      ? "Paused"
                      : programme.status === "draft"
                        ? "Draft"
                        : "Ended",
                  )}
                </>
              )}
            </span>
            <span className="programmes-overview-name">
              {programme.settings.name || programme.settings.goal}
            </span>
            {programme.status !== "draft" && (
              <span className="programmes-muted">
                {tr("Week {{week}} of {{weeks}}", {
                  week,
                  weeks: programme.settings.weeks,
                })}
              </span>
            )}
          </>
        }
      >
        {programme.status === "active" && (
          <p className="programmes-muted">
            {programme.track === "training"
              ? (session?.name ?? tr("Rest day"))
              : meals?.length === 1
                ? tr("1 meal planned today")
                : tr("{{count}} meals planned today", {
                    count: meals?.length ?? 0,
                  })}
          </p>
        )}
        <button className="programmes-link" onClick={onOpen}>
          {tr(
            programme.generationStatus === "running"
              ? "Preparing your programme…"
              : programme.status === "draft"
                ? "Review programme"
                : "Open programme",
          )}
          <ArrowRight size={16} />
        </button>
      </ProgrammeAccordion>
    </section>
  )
}

function ProgrammeDetail({
  id,
  initiallyEditing,
  legacyNutritionActive,
  programmes,
  library,
  exercises,
  onClose,
}: {
  id: Id<"guidedProgrammes">
  initiallyEditing?: boolean
  legacyNutritionActive: boolean
  programmes: Programme[]
  library: LibraryRecipe[]
  exercises: { id: string; name: string; equipment?: string }[]
  onClose: () => void
}) {
  const programme = useQuery(api.guidedProgrammes.get, { id })
  const updatePlan = useMutation(api.guidedProgrammes.updatePlan)
  const activate = useMutation(api.guidedProgrammes.activate)
  const setStatus = useMutation(api.guidedProgrammes.setStatus)
  const logMeal = useMutation(api.guidedProgrammes.logMeal)
  const checkIn = useMutation(api.guidedProgrammes.checkIn)
  const reviewCheckIn = useMutation(api.guidedProgrammes.reviewCheckIn)
  const generate = useAction(api.ai.guidedProgramme.generate)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  const navigate = useSmoothNavigate()
  const [editing, setEditing] = useState<ProgrammePlan | null>(null)
  const [editVersion, setEditVersion] = useState<number | undefined>()
  const [undo, setUndo] = useState<{
    plan: ProgrammePlan
    version: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const operationLock = useRef(false)
  const [error, setError] = useState("")
  const [confirmation, setConfirmation] = useState<"start" | "end" | null>(null)
  const [checking, setChecking] = useState(false)
  const [logged, setLogged] = useState<string[]>([])
  const requestId = useRef(crypto.randomUUID())
  const didOpenBuilder = useRef(false)
  useEffect(() => {
    if (initiallyEditing && programme?.plan && !didOpenBuilder.current) {
      didOpenBuilder.current = true
      setEditVersion(programme.updatedAt)
      setEditing(structuredClone(programme.plan))
    }
  }, [initiallyEditing, programme])
  async function run(action: () => Promise<unknown>, message?: string) {
    if (operationLock.current) return
    operationLock.current = true
    setBusy(true)
    setError("")
    try {
      await action()
      if (message) toast.success(message)
      return true
    } catch (cause) {
      setError(errorMessage(cause))
      return false
    } finally {
      operationLock.current = false
      setBusy(false)
    }
  }
  if (programme === undefined)
    return (
      <div className="programmes-hub" role="status">
        {tr("Loading your programme…")}
      </div>
    )
  if (!programme)
    return (
      <div className="programmes-hub">
        <h1>{tr("Programme unavailable")}</h1>
        <button className="programmes-link" onClick={onClose}>
          {tr("Back to programmes")}
        </button>
      </div>
    )
  const current = programme
  const other =
    (current.track === "nutrition" && legacyNutritionActive) ||
    programmes.find(
      (row) =>
        row._id !== id &&
        row.track === current.track &&
        (row.status === "active" || row.status === "paused"),
    )
  const date = localProgrammeTime(current.settings.timezone).date
  const plan = editing ?? current.plan
  const canEdit =
    current.status !== "ended" && current.generationStatus !== "running"
  async function saveChanges() {
    if (!editing) return
    const previous = current.plan
    let committedVersion: number | undefined
    if (
      await run(async () => {
        const result = await updatePlan({
          id,
          plan: editing,
          expectedUpdatedAt: editVersion,
        })
        committedVersion = result.updatedAt
      }, tr("Your upcoming plan is updated"))
    ) {
      setUndo(
        previous && committedVersion !== undefined
          ? { plan: previous, version: committedVersion }
          : null,
      )
      setEditing(null)
    }
  }
  function startSession(session: ProgrammeSession) {
    navigate(`/workout/active/${encodeURIComponent(session.presetId!)}`)
  }
  return (
    <section className="programmes-hub">
      <span className="programmes-kicker">
        {tr(current.track === "nutrition" ? "Nutrition" : "Training")} ·{" "}
        {tr(
          current.status === "draft"
            ? "Your preview"
            : current.status === "active"
              ? "Following"
              : current.status === "paused"
                ? "Paused"
                : "Ended",
        )}
      </span>
      <h1>{current.settings.name || current.settings.goal}</h1>
      <p className="programmes-muted">
        {tr("{{weeks}} weeks", { weeks: current.settings.weeks })}
        {current.startDate
          ? ` · ${tr("Week {{week}}", { week: programmeWeek(current) })}`
          : ""}
      </p>
      {current.generationStatus === "running" && (
        <p role="status" className="programmes-notice">
          {tr("Preparing your programme. Come back anytime.")}
        </p>
      )}
      {current.generationStatus === "failed" && (
        <p className="programmes-error" role="alert">
          {current.generationError ||
            tr("Generation did not complete. Your tokens were returned.")}
        </p>
      )}
      {!plan && current.generationStatus !== "running" && (
        <div className="programmes-actions">
          <button
            className="programmes-link"
            disabled={busy}
            onClick={() => {
              if (requireAiAccess(5, "guided_programme"))
                void run(
                  () => generate({ id, requestId: requestId.current }),
                  tr("Your programme is ready"),
                )
            }}
          >
            {tr("Generate programme · 5 AI tokens")}
          </button>
          <button
            className="programmes-link"
            disabled={busy}
            onClick={() => {
              setEditVersion(current.updatedAt)
              setEditing(emptyPlan(current.track, current.settings.weeks))
            }}
          >
            {tr("Build it myself")}
          </button>
        </div>
      )}
      {plan && (
        <>
          <ProgrammeAccordion
            title={tr("Manage programme")}
            defaultOpen={current.status === "draft"}
          >
            <div className="programmes-actions">
              {canEdit && !editing && (
                <button
                  className="programmes-link"
                  onClick={() => {
                    setEditVersion(current.updatedAt)
                    setEditing(structuredClone(plan))
                  }}
                >
                  {tr(
                    current.status === "draft"
                      ? "Edit programme"
                      : "Edit upcoming plan",
                  )}
                </button>
              )}
              {current.status === "draft" && !editing && (
                <button
                  className="programmes-link"
                  disabled={busy}
                  onClick={() => setConfirmation("start")}
                >
                  {tr("Start programme")} <ArrowRight size={16} />
                </button>
              )}
              {(current.status === "active" || current.status === "paused") &&
                !editing && (
                  <>
                    <button
                      className="programmes-link"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            setStatus({
                              id,
                              status:
                                current.status === "active"
                                  ? "paused"
                                  : "active",
                            }),
                          tr(
                            current.status === "active"
                              ? "Programme paused"
                              : "Programme resumed",
                          ),
                        )
                      }
                    >
                      {tr(current.status === "active" ? "Pause" : "Resume")}
                    </button>
                    <button
                      className="programmes-link"
                      disabled={busy}
                      onClick={() => setChecking(!checking)}
                    >
                      {tr("Weekly check-in")}
                    </button>
                    <button
                      className="programmes-link"
                      disabled={busy}
                      onClick={() => setConfirmation("end")}
                    >
                      {tr("End programme")}
                    </button>
                  </>
                )}
            </div>
            {current.track === "nutrition" && (
              <p className="programmes-muted">
                {current.settings.baselineCalories} {tr("starting kcal/day")} ·{" "}
                {current.settings.protein}g {tr("protein")} ·{" "}
                {current.settings.fat}g {tr("fat")}
              </p>
            )}
          </ProgrammeAccordion>
          {editing && (
            <p className="programmes-notice">
              {tr("Preview changes. Your history stays unchanged.")}
            </p>
          )}
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            <ProgrammePlanView
              plan={plan}
              track={current.track}
              today={date}
              currentWeek={programmeWeek(current)}
              loggedMealIds={logged}
              editable={!!editing}
              library={library}
              exercises={exercises}
              onChange={setEditing}
              active={current.status === "active"}
              busy={busy}
              onStartSession={startSession}
              onLogMeal={(mealId) => {
                if (logged.includes(mealId)) {
                  toast.message(tr("This meal is already logged today"))
                  return
                }
                void run(
                  () => logMeal({ id, mealId, date }),
                  tr("Meal logged for today"),
                ).then((success) => {
                  if (success) setLogged((previous) => [...previous, mealId])
                })
              }}
            />
          </fieldset>
          {editing && (
            <div className="programmes-actions">
              <button
                className="programmes-link"
                disabled={busy}
                onClick={() => void saveChanges()}
              >
                {busy ? tr("Saving…") : tr("Save changes")}
              </button>
              <button
                className="programmes-link"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                {tr("Discard changes")}
              </button>
            </div>
          )}
          {undo && undo.version === current.updatedAt && !editing && (
            <div className="programmes-actions">
              <span className="programmes-muted">{tr("Plan updated.")}</span>
              <button
                className="programmes-link"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      updatePlan({
                        id,
                        plan: undo.plan,
                        expectedUpdatedAt: undo.version,
                      }),
                    tr("Previous plan restored"),
                  ).then((success) => {
                    if (success) setUndo(null)
                  })
                }
              >
                {tr("Undo")}
              </button>
            </div>
          )}
        </>
      )}
      {confirmation && (
        <section
          role="region"
          aria-label={tr("Confirm programme change")}
          className="programmes-inline-editor"
        >
          <h2>
            {tr(
              confirmation === "end"
                ? "End this programme?"
                : other
                  ? "Replace your current programme?"
                  : "Ready to begin?",
            )}
          </h2>
          <p className="programmes-muted">
            {confirmation === "end"
              ? tr(
                  "Your meals, recipes and completed workouts stay saved. Programme targets return to your usual settings.",
                )
              : other
                ? tr(
                    "Your active {{track}} programme will end and this one starts today. Earlier logs stay saved.",
                    {
                      track: tr(
                        current.track === "nutrition"
                          ? "nutrition"
                          : "training",
                      ),
                    },
                  )
                : tr(
                    "This plan starts today. You can pause or adjust it whenever you need.",
                  )}
          </p>
          <div className="programmes-actions">
            <button
              className="programmes-link"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    confirmation === "end"
                      ? setStatus({ id, status: "ended" })
                      : activate({ id, replaceExisting: !!other }),
                  tr(
                    confirmation === "end"
                      ? "Programme ended"
                      : "Your programme starts today",
                  ),
                ).then((success) => {
                  if (success) setConfirmation(null)
                })
              }
            >
              {tr(
                confirmation === "end"
                  ? "End programme"
                  : other
                    ? "Replace and start"
                    : "Start today",
              )}
            </button>
            <button
              className="programmes-link"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              {tr("Cancel")}
            </button>
          </div>
        </section>
      )}
      {checking && (
        <CheckInForm
          busy={busy}
          onSave={(answers) =>
            run(() => checkIn({ id, ...answers })).then((success) => {
              if (success) setChecking(false)
            })
          }
          onCancel={() => setChecking(false)}
        />
      )}
      {current.checkIns
        .filter((item) => item.status === "pending")
        .map((item) => (
          <section className="programmes-inline-editor" key={item._id}>
            <span className="programmes-kicker">
              {tr("Check-in suggestion")}
            </span>
            <h3>{tr(item.suggestion.title)}</h3>
            <p className="programmes-muted">{tr(item.suggestion.reason)}</p>
            <div className="programmes-actions">
              <button
                className="programmes-link"
                disabled={busy || !!editing}
                onClick={() => {
                  const before = current.plan
                  let committedVersion: number | undefined
                  void run(async () => {
                    const result = await reviewCheckIn({
                      checkInId: item._id,
                      accept: true,
                    })
                    committedVersion = result.updatedAt
                  }, tr("Suggestion applied")).then((success) => {
                    if (success)
                      setUndo(
                        before && committedVersion !== undefined
                          ? { plan: before, version: committedVersion }
                          : null,
                      )
                  })
                }}
              >
                {tr(
                  item.suggestion.kind === "keep"
                    ? "Keep this plan"
                    : "Apply this change",
                )}
              </button>
              <button
                className="programmes-link"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    reviewCheckIn({ checkInId: item._id, accept: false }),
                  )
                }
              >
                {tr("Dismiss")}
              </button>
            </div>
          </section>
        ))}
      {error && (
        <p className="programmes-error" role="alert">
          {error}
        </p>
      )}
      {aiAccessModal}
    </section>
  )
}

function CheckInForm({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean
  onSave: (values: {
    adherence: number
    difficulty: number
    enjoyment: number
    scheduleFits: boolean
    notes: string
  }) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState({
    adherence: 3,
    difficulty: 3,
    enjoyment: 3,
    scheduleFits: true,
    notes: "",
  })
  return (
    <form
      className="programmes-inline-editor programmes-fields"
      onSubmit={(event) => {
        event.preventDefault()
        void onSave(values)
      }}
    >
      <h2>{tr("How did this week feel?")}</h2>
      {(
        [
          [
            "adherence",
            "How much of your plan did you follow?",
            "Very little",
            "Most of it",
          ],
          [
            "difficulty",
            "How demanding was it?",
            "Very easy",
            "Very difficult",
          ],
          ["enjoyment", "How much did you enjoy it?", "Not much", "A lot"],
        ] as const
      ).map(([field, label, low, high]) => (
        <ProgrammeField key={field} label={label}>
          <select
            value={values[field]}
            onChange={(e) =>
              setValues({ ...values, [field]: Number(e.target.value) })
            }
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
                {value === 1
                  ? ` · ${tr(low)}`
                  : value === 5
                    ? ` · ${tr(high)}`
                    : ""}
              </option>
            ))}
          </select>
        </ProgrammeField>
      ))}
      <label className="programmes-check">
        <input
          type="checkbox"
          checked={values.scheduleFits}
          onChange={(e) =>
            setValues({ ...values, scheduleFits: e.target.checked })
          }
        />
        {tr("The schedule still fits my week")}
      </label>
      <ProgrammeField label="Anything else?">
        <textarea
          maxLength={2000}
          value={values.notes}
          onChange={(e) => setValues({ ...values, notes: e.target.value })}
        />
      </ProgrammeField>
      <p className="programmes-muted">
        {tr(
          "Your answers suggest a simple adjustment for you to review. This check-in uses no AI tokens.",
        )}
      </p>
      <div className="programmes-actions">
        <button className="programmes-link" disabled={busy} type="submit">
          {tr("Review suggestion")}
        </button>
        <button
          className="programmes-link"
          disabled={busy}
          type="button"
          onClick={onCancel}
        >
          {tr("Cancel")}
        </button>
      </div>
    </form>
  )
}
