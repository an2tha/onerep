import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import {
  Barbell,
  CheckCircle,
  ForkKnife,
  Minus,
  Plus,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react"
import { useAction, useMutation, useQuery } from "convex/react"
import { useSearchParams } from "react-router"
import { flushSync } from "react-dom"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { currentDateKey, type FoodLogDaySnapshot } from "@/lib/food-log"
import type { BodyMeasurementEntry } from "@/lib/body-progress"
import type { EffectiveGoalsResult, WeightUnit } from "@/lib/health-goals"
import { useSmoothNavigate } from "@/lib/navigation"
import { buildProgressSummary } from "@/lib/progress-summary"
import type { CachedWorkoutLog } from "@/lib/workout-sync"
import {
  DisclosureRow,
  FormField,
  GroupedList,
  ListRow,
  PrimaryButton,
  ToolbarButton,
} from "@repo/ui"
import { MobileSheet } from "@/components/mobile-sheet"
import { TrainingInsightsPanel } from "@/components/training-insights-panel"
import { hapticMedium, hapticSelection } from "@/lib/haptics"
import { toast } from "@repo/ui"
import { TourAnchor, useTourAnchor } from "@/components/walkthrough/tour-anchor"
import { FormCoachPinnedCards } from "@/components/form-coach-card"
import { ExerciseLibrary } from "@/components/exercise-library"

import {
  BodyProgress,
  NutritionProgress,
  ProgressLoading,
  TrainingProgress,
  formatProgressDate,
  formatProgressWeight,
} from "@repo/ui"

/**
 * The library is a tab here rather than a bottom-bar destination: browsing
 * movements is something you do while looking at your own numbers, not a
 * fifth place to live.
 */
type ProgressTab = "body" | "nutrition" | "training" | "exercises"

/** Tabs that own a custom-metric surface. The library has nothing to chart. */
type MetricTab = Exclude<ProgressTab, "exercises">

function formatWeightValue(value: number) {
  return value.toFixed(1).replace(/\.0$/, "")
}

export default function Progress() {
  const navigate = useSmoothNavigate()
  const progressHeaderRef = useTourAnchor("progress-header")
  const progressTabsRef = useTourAnchor("progress-tabs")
  const [searchParams] = useSearchParams()
  const [metric, setMetric] = useState<ProgressTab>(() =>
    searchParams.get("tab") === "exercises" ? "exercises" : "body"
  )
  const [entryOpen, setEntryOpen] = useState(
    () => searchParams.get("checkIn") === "1"
  )
  const [weight, setWeight] = useState("")
  const [bodyFat, setBodyFat] = useState("")
  const [waist, setWaist] = useState("")
  const [hips, setHips] = useState("")
  const [chest, setChest] = useState("")
  const [notes, setNotes] = useState("")
  const [showMeasurements, setShowMeasurements] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [entryClientId, setEntryClientId] = useState<string | null>(null)
  const [entryPrepared, setEntryPrepared] = useState(false)
  const [savingEntry, setSavingEntry] = useState(false)
  const [entryError, setEntryError] = useState("")
  const [checkInCelebration, setCheckInCelebration] = useState(false)
  const [metricBuilderOpen, setMetricBuilderOpen] = useState(false)
  const [metricRequest, setMetricRequest] = useState("")
  const [generatingMetric, setGeneratingMetric] = useState(false)
  const [metricBuilderError, setMetricBuilderError] = useState("")
  const saveMeasurement = useMutation(api.bodyProgress.save)
  const generateCustomMetric = useAction(
    api.ai.metricGeneration.generateCustomProgressMetric
  )
  const saveCustomMetric = useMutation(api.customProgressMetrics.saveDefinition)
  const setCustomMetricValue = useMutation(api.customProgressMetrics.setValue)
  const removeCustomMetric = useMutation(api.customProgressMetrics.remove)
  const today = currentDateKey()
  const metricTab: MetricTab = metric === "exercises" ? "body" : metric
  const customMetrics = useQuery(api.customProgressMetrics.list, {
    tab: metricTab,
    days: 30,
  })
  const bodyMeasurements = useQuery(api.bodyProgress.list) as
    BodyMeasurementEntry[] | undefined
  const workoutHistory = useQuery(api.logs.workouts.getHistory) as
    CachedWorkoutLog[] | undefined
  const foodHistory = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: today,
    limit: 30,
  }) as FoodLogDaySnapshot[] | undefined
  const effectiveGoals = useQuery(api.users.users.getEffectiveGoals, {}) as
    EffectiveGoalsResult | null | undefined
  const preferences = useQuery(api.users.users.getPreferences, {})
  const calorieTarget = effectiveGoals?.effective.calories ?? 2000
  const proteinTarget = effectiveGoals?.effective.protein ?? 150

  const summary = useMemo(
    () =>
      buildProgressSummary({
        today,
        foodLogs: foodHistory ?? [],
        workoutLogs: workoutHistory ?? [],
        bodyMeasurements: bodyMeasurements ?? [],
        caloriesTarget: calorieTarget,
        proteinTarget,
      }),
    [
      bodyMeasurements,
      calorieTarget,
      foodHistory,
      proteinTarget,
      today,
      workoutHistory,
    ]
  )
  const unit: WeightUnit = preferences?.weightUnit === "lbs" ? "lbs" : "kg"
  const orderedMeasurements = useMemo(
    () =>
      [...(bodyMeasurements ?? [])].sort((a, b) =>
        a.loggedAt.localeCompare(b.loggedAt)
      ),
    [bodyMeasurements]
  )
  const todayMeasurement = useMemo(
    () =>
      [...orderedMeasurements]
        .reverse()
        .find((measurement) => measurement.loggedAt.slice(0, 10) === today),
    [orderedMeasurements, today]
  )
  const previousMeasurement = useMemo(
    () =>
      [...orderedMeasurements]
        .reverse()
        .find((measurement) => measurement.loggedAt.slice(0, 10) < today),
    [orderedMeasurements, today]
  )
  const loading =
    bodyMeasurements === undefined ||
    workoutHistory === undefined ||
    foodHistory === undefined ||
    effectiveGoals === undefined ||
    preferences === undefined ||
    customMetrics === undefined

  const prepareEntry = useCallback(() => {
    const toDisplayWeight = (weightKg: number | null | undefined) =>
      weightKg == null
        ? ""
        : formatWeightValue(unit === "lbs" ? weightKg * 2.20462 : weightKg)
    if (todayMeasurement) {
      setWeight(toDisplayWeight(todayMeasurement.weightKg))
      setBodyFat(
        todayMeasurement.bodyFatPct == null
          ? ""
          : String(todayMeasurement.bodyFatPct)
      )
      setWaist(
        todayMeasurement.waistCm == null ? "" : String(todayMeasurement.waistCm)
      )
      setHips(
        todayMeasurement.hipsCm == null ? "" : String(todayMeasurement.hipsCm)
      )
      setChest(
        todayMeasurement.chestCm == null ? "" : String(todayMeasurement.chestCm)
      )
      setNotes(todayMeasurement.notes ?? "")
      setShowMeasurements(
        todayMeasurement.bodyFatPct != null ||
          todayMeasurement.waistCm != null ||
          todayMeasurement.hipsCm != null ||
          todayMeasurement.chestCm != null
      )
      setShowNote(Boolean(todayMeasurement.notes))
      setEntryClientId(todayMeasurement.clientId)
    } else {
      // Start from the last known weight so a normal day is confirm-and-done
      // rather than typing the same number again.
      setWeight(toDisplayWeight(previousMeasurement?.weightKg))
      setBodyFat("")
      setWaist("")
      setHips("")
      setChest("")
      setNotes("")
      setShowMeasurements(false)
      setShowNote(false)
      setEntryClientId(null)
    }
    setEntryError("")
    setEntryPrepared(true)
  }, [previousMeasurement, todayMeasurement, unit])

  function selectMetric(nextMetric: ProgressTab) {
    if (nextMetric === metric) return
    hapticSelection()
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => { finished: Promise<void> }
    }
    if (!transitionDocument.startViewTransition) {
      setMetric(nextMetric)
      return
    }
    transitionDocument.startViewTransition(() => {
      flushSync(() => setMetric(nextMetric))
    })
  }

  async function createCustomMetric() {
    const request = metricRequest.trim()
    if (request.length < 3 || generatingMetric) {
      setMetricBuilderError("Describe what you want to track.")
      return
    }
    setGeneratingMetric(true)
    setMetricBuilderError("")
    try {
      const generated = await generateCustomMetric({
        tab: metricTab,
        request,
      })
      await saveCustomMetric({
        title: generated.title,
        description: generated.description,
        tab: generated.tab,
        kind: generated.kind,
        unit: generated.unit,
        step: generated.step,
        ...(generated.target == null ? {} : { target: generated.target }),
        accent: generated.accent,
      })
      hapticMedium()
      toast.success(`${generated.title} added to Progress`)
      setMetricRequest("")
      setMetricBuilderOpen(false)
    } catch (error) {
      setMetricBuilderError(
        error instanceof Error
          ? error.message
          : "Coach could not create that metric."
      )
    } finally {
      setGeneratingMetric(false)
    }
  }

  function openEntry() {
    hapticSelection()
    if (bodyMeasurements === undefined) {
      setWeight("")
      setBodyFat("")
      setWaist("")
      setHips("")
      setChest("")
      setNotes("")
      setShowMeasurements(false)
      setShowNote(false)
      setEntryClientId(null)
      setEntryError("")
      setEntryPrepared(false)
    } else {
      prepareEntry()
    }
    setEntryOpen(true)
  }

  function nudgeWeight(direction: 1 | -1) {
    hapticSelection()
    const parsed = Number(weight.trim().replace(",", "."))
    const hasValue = weight.trim().length > 0 && Number.isFinite(parsed)
    const next = hasValue
      ? Math.max(1, Math.round((parsed + direction * 0.1) * 10) / 10)
      : unit === "lbs"
        ? 150
        : 70
    setWeight(formatWeightValue(next))
    if (entryError) setEntryError("")
  }

  function closeEntry() {
    setEntryOpen(false)
    setEntryPrepared(false)
    setEntryError("")
  }

  useEffect(() => {
    if (!entryOpen || entryPrepared || bodyMeasurements === undefined) return
    prepareEntry()
  }, [bodyMeasurements, entryOpen, entryPrepared, prepareEntry])

  async function handleEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parseNumber = (value: string) =>
      value.trim() ? Number(value.trim().replace(",", ".")) : undefined
    const enteredWeight = parseNumber(weight)
    const enteredBodyFat = parseNumber(bodyFat)
    const enteredWaist = parseNumber(waist)
    const enteredHips = parseNumber(hips)
    const enteredChest = parseNumber(chest)
    if (
      enteredWeight === undefined ||
      !Number.isFinite(enteredWeight) ||
      enteredWeight <= 0
    ) {
      setEntryError("Enter a valid weight.")
      return
    }
    if (
      enteredBodyFat !== undefined &&
      (!Number.isFinite(enteredBodyFat) ||
        enteredBodyFat <= 0 ||
        enteredBodyFat > 100)
    ) {
      setEntryError("Body fat must be between 0 and 100%.")
      return
    }
    const circumferences = [enteredWaist, enteredHips, enteredChest].filter(
      (value): value is number => value !== undefined
    )
    if (
      circumferences.some(
        (value) => !Number.isFinite(value) || value <= 0 || value > 300
      )
    ) {
      setEntryError("Body measurements must be between 1 and 300 cm.")
      return
    }
    setSavingEntry(true)
    setEntryError("")
    try {
      await saveMeasurement({
        clientId: entryClientId ?? crypto.randomUUID(),
        loggedAt: new Date().toISOString(),
        weightKg: unit === "lbs" ? enteredWeight / 2.20462 : enteredWeight,
        ...(enteredBodyFat !== undefined ? { bodyFatPct: enteredBodyFat } : {}),
        ...(enteredWaist !== undefined ? { waistCm: enteredWaist } : {}),
        ...(enteredHips !== undefined ? { hipsCm: enteredHips } : {}),
        ...(enteredChest !== undefined ? { chestCm: enteredChest } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(todayMeasurement?.armsCm != null
          ? { armsCm: todayMeasurement.armsCm }
          : {}),
        ...(todayMeasurement?.thighsCm != null
          ? { thighsCm: todayMeasurement.thighsCm }
          : {}),
        ...(todayMeasurement?.calvesCm != null
          ? { calvesCm: todayMeasurement.calvesCm }
          : {}),
        ...(todayMeasurement?.neckCm != null
          ? { neckCm: todayMeasurement.neckCm }
          : {}),
        ...(todayMeasurement?.photoUploadId
          ? {
              photoUploadId:
                todayMeasurement.photoUploadId as Id<"fileUploads">,
            }
          : {}),
        ...(todayMeasurement?.photoTakenAt != null
          ? { photoTakenAt: todayMeasurement.photoTakenAt }
          : {}),
      })
      hapticMedium()
      toast.success(
        entryClientId ? "Today’s check-in updated" : "Check-in saved"
      )
      if (!entryClientId) setCheckInCelebration(true)
      setWeight("")
      setBodyFat("")
      setWaist("")
      setHips("")
      setChest("")
      setNotes("")
      setShowMeasurements(false)
      setShowNote(false)
      setEntryClientId(null)
      setEntryPrepared(false)
      setEntryOpen(false)
    } catch {
      setEntryError("Could not save this measurement. Try again.")
    } finally {
      setSavingEntry(false)
    }
  }

  useEffect(() => {
    if (!checkInCelebration) return
    const timer = window.setTimeout(() => setCheckInCelebration(false), 1500)
    return () => window.clearTimeout(timer)
  }, [checkInCelebration])

  return (
    <div className="desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <main className="app-page pb-28">
        <header className="app-header" ref={progressHeaderRef}>
          <h1 className="app-title">Progress</h1>
          <div
            className="flex items-center gap-1"
            hidden={metric === "exercises"}
          >
            <button
              type="button"
              onClick={() => {
                hapticSelection()
                setMetricBuilderError("")
                setMetricBuilderOpen(true)
              }}
              className="native-toolbar-button"
              aria-label={`Ask Coach to create a ${metricTab} metric`}
            >
              <Sparkle size={20} weight="bold" />
            </button>
            <TourAnchor anchor="progress-check-in">
              <button
                type="button"
                onClick={openEntry}
                className="native-toolbar-button"
                aria-label="Add body measurement"
              >
                <Plus size={22} weight="bold" />
              </button>
            </TourAnchor>
          </div>
        </header>

        <div
          ref={progressTabsRef}
          className="app-segmented mb-5 grid grid-cols-4"
          aria-label="Progress metric"
        >
          {(["body", "nutrition", "training", "exercises"] as const).map(
            (item) => (
              <button
                key={item}
                type="button"
                data-active={metric === item}
                aria-pressed={metric === item}
                onClick={() => selectMetric(item)}
                className="app-segmented-button capitalize"
              >
                {item}
              </button>
            )
          )}
        </div>

        {metric === "exercises" ? (
          <ExerciseLibrary />
        ) : loading ? (
          <ProgressLoading />
        ) : (
          <div className="progress-tab-content grid gap-6">
            {metric === "body" && (
              <BodyProgress
                summary={summary}
                measurements={bodyMeasurements}
                unit={unit}
                onAdd={openEntry}
              />
            )}
            {metric === "nutrition" && (
              <NutritionProgress
                summary={summary}
                calorieTarget={calorieTarget}
                proteinTarget={proteinTarget}
                onOpenDiary={() => navigate("/nutrition", { motion: "switch" })}
              />
            )}
            {metric === "training" && (
              <>
                <TrainingProgress
                  summary={summary}
                  onOpenTraining={() =>
                    navigate("/workouts", { motion: "switch" })
                  }
                />
                <TrainingInsightsPanel />
              </>
            )}

            {customMetrics.length > 0 && (
              <section aria-label={`Custom ${metricTab} metrics`}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="native-section-title">Your metrics</p>
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      setMetricBuilderOpen(true)
                    }}
                    className="motion-tactile min-h-11 px-2 text-[12px] font-semibold text-muted-foreground"
                  >
                    Add metric
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {customMetrics.map((customMetric, metricIndex) => {
                    const todayEntry = customMetric.entries.find(
                      (entry) => entry.date === today
                    )
                    const value = todayEntry?.value ?? 0
                    const maxValue = Math.max(
                      customMetric.target ?? 0,
                      value,
                      ...customMetric.entries.map((entry) => entry.value),
                      1
                    )
                    const ordered = [...customMetric.entries]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .slice(-14)
                    const setValue = (next: number) => {
                      hapticSelection()
                      void setCustomMetricValue({
                        metricId: customMetric._id,
                        date: today,
                        value: Math.max(0, next),
                      })
                    }
                    return (
                      <article
                        key={customMetric._id}
                        className="custom-metric-card overflow-hidden rounded-xl border border-border bg-card p-4"
                        style={{ animationDelay: `${metricIndex * 60}ms` }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[15px] font-semibold">
                              {customMetric.title}
                            </p>
                            <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">
                              {customMetric.description}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(`Remove ${customMetric.title}?`)
                              )
                                void removeCustomMetric({
                                  metricId: customMetric._id,
                                })
                            }}
                            aria-label={`Remove ${customMetric.title}`}
                            className="motion-tactile -mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 active:bg-muted"
                          >
                            <Trash size={15} />
                          </button>
                        </div>

                        <div className="mt-4 flex items-end justify-between gap-4">
                          <p className="text-[26px] leading-none font-bold tabular-nums">
                            {customMetric.kind === "toggle"
                              ? value > 0
                                ? "Done"
                                : "Not yet"
                              : value.toLocaleString()}
                            {customMetric.kind !== "toggle" &&
                              customMetric.unit && (
                                <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                                  {customMetric.unit}
                                </span>
                              )}
                          </p>
                          {customMetric.kind === "toggle" ? (
                            <button
                              type="button"
                              aria-pressed={value > 0}
                              onClick={() => setValue(value > 0 ? 0 : 1)}
                              className="motion-tactile min-h-10 rounded-xl bg-foreground px-4 text-[11px] font-bold text-background"
                            >
                              {value > 0 ? "Undo" : "Mark done"}
                            </button>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setValue(value - customMetric.step)
                                }
                                aria-label={`Decrease ${customMetric.title}`}
                                className="motion-tactile flex size-10 items-center justify-center rounded-full border border-border"
                              >
                                <Minus size={14} weight="bold" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setValue(value + customMetric.step)
                                }
                                aria-label={`Increase ${customMetric.title}`}
                                className="motion-tactile flex size-10 items-center justify-center rounded-full bg-foreground text-background"
                              >
                                <Plus size={14} weight="bold" />
                              </button>
                            </div>
                          )}
                        </div>

                        {ordered.length > 0 && (
                          <div
                            className="mt-4 flex h-10 items-end gap-1"
                            role="img"
                            aria-label={`${customMetric.title} recent trend`}
                          >
                            {ordered.map((entry, entryIndex) => (
                              <span
                                key={entry._id}
                                className={`custom-metric-bar min-h-1 flex-1 rounded-t-sm bg-[var(--accent-progress)] ${
                                  entry.date === today ? "" : "opacity-55"
                                }`}
                                style={{
                                  height: `${Math.max(8, (entry.value / maxValue) * 100)}%`,
                                  animationDelay: `${entryIndex * 30}ms`,
                                }}
                              />
                            ))}
                          </div>
                        )}
                        {customMetric.target != null && (
                          <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
                            Daily guide: {customMetric.target}{" "}
                            {customMetric.unit}
                          </p>
                        )}
                      </article>
                    )
                  })}
                </div>
              </section>
            )}

            <GroupedList label="Related history">
              <DisclosureRow
                title="Nutrition diary"
                detail={`${summary.nutrition.loggedDays} of 7 days logged`}
                leading={<ForkKnife size={19} />}
                onClick={() => navigate("/nutrition", { motion: "switch" })}
              />
              <DisclosureRow
                title="Training history"
                detail={`${summary.training.workouts} workout${summary.training.workouts === 1 ? "" : "s"} · ${summary.training.completedSets} set${summary.training.completedSets === 1 ? "" : "s"}`}
                leading={<Barbell size={19} />}
                onClick={() => navigate("/workouts", { motion: "switch" })}
              />
            </GroupedList>

            {/* At the foot of the page, where it reads as a footnote rather
                than competing with the metrics above. */}
            <FormCoachPinnedCards surface="progress" />
          </div>
        )}
      </main>

      {metricBuilderOpen && (
        <MobileSheet
          onClose={() => {
            if (!generatingMetric) setMetricBuilderOpen(false)
          }}
          overlayClassName="bg-black/45"
          panelClassName="sheet-panel mx-auto w-full max-w-md rounded-t-2xl border-t border-border bg-card"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void createCustomMetric()
            }}
            className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-[20px] font-bold">
                Track something new in {metric}
              </h2>
              <button
                type="button"
                disabled={generatingMetric}
                onClick={() => setMetricBuilderOpen(false)}
                aria-label="Close metric builder"
                className="native-toolbar-button -mt-1 -mr-2 px-0"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
              Coach will choose the controls, unit, target, and visualization.
              Try caffeine, stretching, sleep, steps, or a training habit.
            </p>
            <label className="mt-5 block">
              <span className="sr-only">Describe a custom progress metric</span>
              <textarea
                autoFocus
                rows={4}
                value={metricRequest}
                onChange={(event) => setMetricRequest(event.target.value)}
                placeholder="For example: Track caffeine in 50 mg increments with a 400 mg daily limit"
                className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-[14px] leading-5 outline-none focus:border-foreground/35"
              />
            </label>
            {metricBuilderError && (
              <p className="mt-2 text-[11px] text-destructive" role="alert">
                {metricBuilderError}
              </p>
            )}
            <button
              type="submit"
              disabled={generatingMetric || metricRequest.trim().length < 3}
              className="motion-tactile mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-[13px] font-bold text-background disabled:opacity-35"
            >
              <Sparkle
                size={16}
                weight="fill"
                className={generatingMetric ? "animate-pulse" : undefined}
              />
              {generatingMetric ? "Coach is designing it…" : "Generate metric"}
            </button>
          </form>
        </MobileSheet>
      )}

      {checkInCelebration && (
        <div
          className="progress-checkin-celebration"
          role="status"
          aria-live="polite"
        >
          <span className="progress-checkin-rings" aria-hidden="true" />
          <CheckCircle size={34} weight="fill" aria-hidden="true" />
          <span>Check-in complete</span>
        </div>
      )}

      {entryOpen && (
        <MobileSheet
          onClose={closeEntry}
          minHeight="0"
          maxHeight="88vh"
          ariaLabel="Today’s check-in"
          panelClassName="!w-[calc(100%_-_1.5rem)] !max-w-[26rem]"
          bottom={
            <div className="border-t border-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
              <PrimaryButton
                type="submit"
                form="today-check-in-form"
                disabled={savingEntry || weight.trim().length === 0}
                aria-busy={savingEntry}
                className="w-full"
              >
                {savingEntry
                  ? "Saving…"
                  : entryClientId
                    ? "Update check-in"
                    : "Complete check-in"}
              </PrimaryButton>
            </div>
          }
        >
          <form
            id="today-check-in-form"
            className="grid gap-5 px-4 pt-1 pb-6 sm:px-6"
            onSubmit={handleEntrySubmit}
          >
            <header className="flex items-center justify-between gap-4">
              <h2 className="text-[22px] leading-tight font-semibold tracking-tight">
                Today’s check-in
              </h2>
              <ToolbarButton
                type="button"
                onClick={closeEntry}
                aria-label="Close check-in"
              >
                <X size={20} weight="bold" />
              </ToolbarButton>
            </header>

            <section
              aria-label="Weight"
              className="flex flex-col items-center gap-3 py-3"
            >
              <div className="flex w-full items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => nudgeWeight(-1)}
                  aria-label="Decrease weight"
                  className="onboarding-stepper-button"
                >
                  <Minus size={16} weight="bold" />
                </button>
                <div className="flex min-w-0 items-baseline justify-center gap-1.5">
                  <input
                    name="progress-weight"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    autoComplete="off"
                    value={weight}
                    onChange={(event) => {
                      setWeight(event.target.value)
                      if (entryError) setEntryError("")
                    }}
                    onFocus={(event) => event.currentTarget.select()}
                    placeholder="0"
                    aria-label={`Weight (${unit})`}
                    required
                    className="w-32 border-b-2 border-transparent bg-transparent text-center text-[44px] leading-none font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/40 focus-visible:border-foreground/40"
                  />
                  <span className="text-[15px] font-semibold text-muted-foreground">
                    {unit}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => nudgeWeight(1)}
                  aria-label="Increase weight"
                  className="onboarding-stepper-button"
                >
                  <Plus size={16} weight="bold" />
                </button>
              </div>
              <p className="native-row-detail text-center">
                {todayMeasurement
                  ? "Logged today · saving updates this entry"
                  : previousMeasurement
                    ? `Last check-in ${formatProgressWeight(previousMeasurement.weightKg, unit)} · ${formatProgressDate(previousMeasurement.loggedAt.slice(0, 10))}`
                    : "Your first check-in"}
              </p>
            </section>

            {showMeasurements && (
              <fieldset>
                <legend className="native-field-label mb-3">
                  Measurements
                </legend>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="Body fat %"
                    name="progress-body-fat"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={bodyFat}
                    onChange={(event) => {
                      setBodyFat(event.target.value)
                      if (entryError) setEntryError("")
                    }}
                  />
                  <FormField
                    label="Waist (cm)"
                    name="progress-waist"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={waist}
                    onChange={(event) => {
                      setWaist(event.target.value)
                      if (entryError) setEntryError("")
                    }}
                  />
                  <FormField
                    label="Hips (cm)"
                    name="progress-hips"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={hips}
                    onChange={(event) => {
                      setHips(event.target.value)
                      if (entryError) setEntryError("")
                    }}
                  />
                  <FormField
                    label="Chest (cm)"
                    name="progress-chest"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={chest}
                    onChange={(event) => {
                      setChest(event.target.value)
                      if (entryError) setEntryError("")
                    }}
                  />
                </div>
              </fieldset>
            )}

            {showNote && (
              <label className="native-field">
                <span className="native-field-label">Journal note</span>
                <textarea
                  name="progress-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Training, sleep, appetite, or anything worth remembering…"
                  className="native-input min-h-24 resize-y py-3 leading-6"
                />
              </label>
            )}

            {(!showMeasurements || !showNote) && (
              <GroupedList label="Optional details">
                {!showMeasurements && (
                  <ListRow
                    title="Add measurements"
                    detail="Body fat, waist, hips, chest"
                    onClick={() => setShowMeasurements(true)}
                    trailing={
                      <Plus
                        size={16}
                        weight="bold"
                        className="text-muted-foreground"
                        aria-hidden
                      />
                    }
                  />
                )}
                {!showNote && (
                  <ListRow
                    title="Add a note"
                    detail="Training, sleep, appetite"
                    onClick={() => setShowNote(true)}
                    trailing={
                      <Plus
                        size={16}
                        weight="bold"
                        className="text-muted-foreground"
                        aria-hidden
                      />
                    }
                  />
                )}
              </GroupedList>
            )}

            {entryError && (
              <p
                role="alert"
                className="native-field-error border-l-2 border-destructive py-1 pl-3"
              >
                {entryError}
              </p>
            )}
          </form>
        </MobileSheet>
      )}
    </div>
  )
}
