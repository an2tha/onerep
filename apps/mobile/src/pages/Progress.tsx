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
  PrimaryButton,
  ToolbarButton,
} from "@repo/ui"
import { MobileSheet } from "@/components/mobile-sheet"
import { hapticMedium, hapticSelection } from "@/lib/haptics"
import { toast } from "@repo/ui"
import { AppTooltip, APP_TOOLTIP_IDS } from "@/components/tooltips"

import {
  BodyProgress,
  NutritionProgress,
  ProgressLoading,
  TrainingProgress,
  formatProgressDate,
  formatProgressWeight,
} from "@repo/ui"

export default function Progress() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const [metric, setMetric] = useState<"body" | "nutrition" | "training">(
    "body"
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
  const customMetrics = useQuery(api.customProgressMetrics.list, {
    tab: metric,
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
    if (todayMeasurement) {
      const displayWeight =
        todayMeasurement.weightKg == null
          ? ""
          : unit === "lbs"
            ? todayMeasurement.weightKg * 2.20462
            : todayMeasurement.weightKg
      setWeight(
        displayWeight === "" ? "" : displayWeight.toFixed(1).replace(/\.0$/, "")
      )
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
      setEntryClientId(todayMeasurement.clientId)
    } else {
      setWeight("")
      setBodyFat("")
      setWaist("")
      setHips("")
      setChest("")
      setNotes("")
      setEntryClientId(null)
    }
    setEntryError("")
    setEntryPrepared(true)
  }, [todayMeasurement, unit])

  function selectMetric(nextMetric: "body" | "nutrition" | "training") {
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
      const generated = await generateCustomMetric({ tab: metric, request })
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
      setEntryClientId(null)
      setEntryError("")
      setEntryPrepared(false)
    } else {
      prepareEntry()
    }
    setEntryOpen(true)
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
        ...(todayMeasurement?.photoStorageId
          ? {
              photoStorageId: todayMeasurement.photoStorageId as Id<"_storage">,
            }
          : {}),
        ...(todayMeasurement?.photoDataUrl
          ? { photoDataUrl: todayMeasurement.photoDataUrl }
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
        <header className="app-header">
          <div>
            <p className="app-eyebrow">Last 7 days</p>
            <h1 className="app-title">Progress</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                hapticSelection()
                setMetricBuilderError("")
                setMetricBuilderOpen(true)
              }}
              className="native-toolbar-button"
              aria-label={`Ask Coach to create a ${metric} metric`}
            >
              <Sparkle size={20} weight="bold" />
            </button>
            <AppTooltip
              id={APP_TOOLTIP_IDS.progressCheckIn}
              content="Add a consistent body check-in here. Two or more measurements reveal direction; one measurement is only a baseline."
              side="bottom"
              align="end"
            >
              <button
                type="button"
                onClick={openEntry}
                className="native-toolbar-button"
                aria-label="Add body measurement"
              >
                <Plus size={22} weight="bold" />
              </button>
            </AppTooltip>
          </div>
        </header>

        <div
          className="app-segmented mb-5 grid grid-cols-3"
          aria-label="Progress metric"
        >
          {(["body", "nutrition", "training"] as const).map((item) => (
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
          ))}
        </div>

        {loading ? (
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
              <TrainingProgress
                summary={summary}
                onOpenTraining={() =>
                  navigate("/workouts", { motion: "switch" })
                }
              />
            )}

            {customMetrics.length > 0 && (
              <section aria-label={`Custom ${metric} metrics`}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="native-section-title">Made with Coach</p>
                  <button
                    type="button"
                    onClick={() => setMetricBuilderOpen(true)}
                    className="min-h-11 text-[11px] font-semibold text-muted-foreground"
                  >
                    Create another
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {customMetrics.map((customMetric) => {
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
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[15px] font-semibold">
                              {customMetric.title}
                            </p>
                            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
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
                            className="motion-tactile flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
                          >
                            <Trash size={14} />
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
                            {ordered.map((entry) => (
                              <span
                                key={entry._id}
                                className="custom-metric-bar min-h-1 flex-1 rounded-t-sm bg-[var(--accent-progress)]"
                                style={{
                                  height: `${Math.max(8, (entry.value / maxValue) * 100)}%`,
                                }}
                              />
                            ))}
                          </div>
                        )}
                        {customMetric.target != null && (
                          <p className="mt-2 text-[9px] text-muted-foreground tabular-nums">
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
              <div>
                <p className="app-eyebrow">Coach metric builder</p>
                <h2 className="mt-1 text-[20px] font-bold">
                  What should appear in {metric}?
                </h2>
              </div>
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
          panelClassName="!w-[calc(100%_-_1.5rem)] !max-w-[42rem]"
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
            className="grid gap-6 px-4 pt-1 pb-6 sm:px-6"
            onSubmit={handleEntrySubmit}
          >
            <header className="flex items-start gap-4 border-b border-border pb-5">
              <div className="min-w-0 flex-1">
                <p className="native-supporting">{formatProgressDate(today)}</p>
                <h2 className="mt-0.5 text-[24px] leading-tight font-semibold tracking-tight">
                  Today’s check-in
                </h2>
              </div>
              <ToolbarButton
                type="button"
                onClick={closeEntry}
                aria-label="Close check-in"
              >
                <X size={20} weight="bold" />
              </ToolbarButton>
            </header>

            {(todayMeasurement || previousMeasurement) && (
              <section
                className="border-y border-border py-3"
                aria-label="Check-in context"
              >
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="native-row-title">
                      {todayMeasurement ? "Today’s entry" : "Last entry"}
                    </p>
                    <p className="native-row-detail mt-0.5">
                      {todayMeasurement
                        ? "Already logged · changes update this entry"
                        : formatProgressDate(
                            previousMeasurement?.loggedAt.slice(0, 10) ?? null
                          )}
                    </p>
                  </div>
                  <p className="native-row-value">
                    {formatProgressWeight(
                      (todayMeasurement ?? previousMeasurement)?.weightKg ??
                        null,
                      unit
                    )}
                  </p>
                </div>
              </section>
            )}

            <fieldset>
              <legend className="native-section-title mb-3">Body</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label={`Weight (${unit})`}
                  name="progress-weight"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={weight}
                  onChange={(event) => {
                    setWeight(event.target.value)
                    if (entryError) setEntryError("")
                  }}
                  hint="Required"
                  className="text-[18px] font-semibold tabular-nums"
                  autoFocus
                  required
                />
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
                  hint="Optional"
                />
              </div>
            </fieldset>

            <fieldset>
              <legend className="native-section-title mb-1">
                Circumference
              </legend>
              <p className="native-row-detail mb-3">Optional · centimeters</p>
              <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
                <FormField
                  label="Waist"
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
                  label="Hips"
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
                  label="Chest"
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
              <span className="native-field-hint text-right">
                {notes.length}/500
              </span>
            </label>

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
