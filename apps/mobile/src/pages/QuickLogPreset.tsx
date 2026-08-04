import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { useQuery } from "convex/react"
import { ArrowLeft, ArrowsOutSimple } from "@phosphor-icons/react"
import { toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { cn, createClientId, logDevWarn } from "@/lib/utils"
import { hapticMedium, hapticSelection } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { resolveExerciseIds, type Exercise } from "@/lib/exercise-catalog"
import { todayIso } from "@/lib/workout-sync"
import {
  cardioLogFromState,
  estimateRetroDurationSeconds,
  isCardioExercise,
  makeSet,
  normalizeExerciseState,
  retroWorkoutDraftKey,
  toDisplay,
  toKg,
  writeActiveWorkoutDraft,
  type ExerciseState,
  type WeightUnit,
  type WorkoutItem,
} from "@/lib/workout-logging"

/** One abridged row: the whole exercise collapsed to three numbers. */
type QuickRow = {
  exerciseId: string
  setCount: string
  reps: string
  weight: string
}

function formatRetroDateLabel(date: string, todayKey: string) {
  if (date === todayKey) return "Today"
  const at = new Date(`${date}T12:00:00`)
  return at.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

/** Every exercise in the preset, in order, with supersets flattened. */
function flattenItems(items: WorkoutItem[]): string[] {
  return items.flatMap((item) =>
    item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
  )
}

/**
 * Collapses a planned exercise into "N sets of R at W".
 *
 * The first set carries the row because a preset's later sets are usually
 * copies of it; where they aren't, the user has the full logger one tap away.
 */
function rowFromState(
  exerciseId: string,
  state: ExerciseState,
  unit: WeightUnit
): QuickRow {
  const first = state.sets[0]
  return {
    exerciseId,
    setCount: state.sets.length > 0 ? String(state.sets.length) : "3",
    reps: first?.reps ?? "",
    weight: first ? toDisplay(first.weight, unit) : "",
  }
}

/**
 * A compact way to record a session that followed a saved plan.
 *
 * The plan already answers which exercises and roughly how many sets, so this
 * screen only asks for what actually changes week to week. Anything finer —
 * a set that went differently, RPE, a bar change — is one tap away in the full
 * retro logger, which this hands off to through the same local draft the
 * logger autosaves into.
 */
export default function QuickLogPreset() {
  const routeParams = useParams<{ date: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useSmoothNavigate()

  const date = routeParams.date ?? ""
  const presetId = searchParams.get("preset") ?? ""
  const todayKey = todayIso()

  // Stable for the life of the screen so a retried save is idempotent and the
  // handoff draft lands on the session the logger will open.
  const sessionIdRef = useRef<string | null>(null)
  if (sessionIdRef.current === null) {
    sessionIdRef.current = `retro:${createClientId()}`
  }
  const sessionId = sessionIdRef.current

  const preferences = useQuery(api.users.users.getPreferences)
  const presets = useQuery(api.logs.presets.list)
  const freeSlot = useQuery(
    api.logs.workouts.freeSlot,
    date ? { date, sessionId } : "skip"
  )
  const logCompletion = useOfflineMutation(
    api.logs.workouts.completion,
    "logs.workouts.completion"
  )

  const unit: WeightUnit =
    (preferences?.weightUnit as WeightUnit | undefined) ?? "kg"

  const preset = useMemo(() => {
    if (!presets) return null
    return presets.find((p) => (p.id ?? p._id) === presetId) ?? null
  }, [presets, presetId])

  const items = useMemo(
    () => (preset?.items as WorkoutItem[] | undefined) ?? [],
    [preset]
  )
  const presetExerciseData = useMemo(
    () =>
      (preset?.exerciseData as Record<string, ExerciseState> | undefined) ?? {},
    [preset]
  )

  const [rows, setRows] = useState<QuickRow[] | null>(null)
  const [lookup, setLookup] = useState<Record<string, Exercise>>({})
  const [saving, setSaving] = useState(false)

  // Seed once the preset lands. `rows === null` is "not seeded yet", which keeps
  // a late-arriving query from overwriting numbers already typed. Preferences
  // are waited on too: seeding at the default kg would show pound users their
  // planned weights converted from the wrong unit.
  useEffect(() => {
    if (!preset || preferences === undefined || rows !== null) return
    setRows(
      flattenItems(items).map((id) =>
        rowFromState(id, normalizeExerciseState(presetExerciseData[id]), unit)
      )
    )
  }, [preset, preferences, rows, items, presetExerciseData, unit])

  useEffect(() => {
    const ids = flattenItems(items)
    if (ids.length === 0) return
    void resolveExerciseIds(ids)
      .then((resolved) => setLookup(resolved))
      .catch((error) => {
        logDevWarn("Failed to resolve preset exercises", error)
      })
  }, [items])

  const setRow = useCallback((exerciseId: string, patch: Partial<QuickRow>) => {
    setRows((prev) =>
      (prev ?? []).map((row) =>
        row.exerciseId === exerciseId ? { ...row, ...patch } : row
      )
    )
  }, [])

  /**
   * Expands the abridged rows back into per-set state.
   *
   * Both the save and the handoff to the full logger go through here, so what
   * gets written and what the user then sees can never disagree.
   */
  const expandToExerciseData = useCallback((): Record<
    string,
    ExerciseState
  > => {
    const expanded: Record<string, ExerciseState> = {}
    for (const row of rows ?? []) {
      const base = normalizeExerciseState(presetExerciseData[row.exerciseId])
      const exercise = lookup[row.exerciseId]
      if (exercise && isCardioExercise(exercise)) {
        expanded[row.exerciseId] = base
        continue
      }
      const count = Math.min(Math.max(parseInt(row.setCount, 10) || 0, 0), 20)
      const weightKg = toKg(row.weight, unit)
      expanded[row.exerciseId] = {
        ...base,
        sets: Array.from({ length: count }, (_, index) => ({
          ...makeSet(true),
          id: base.sets[index]?.id ?? createClientId(),
          restSeconds: base.sets[index]?.restSeconds ?? 120,
          reps: row.reps,
          weight: weightKg,
        })),
      }
    }
    return expanded
  }, [rows, presetExerciseData, lookup, unit])

  // Cardio is told apart from lifting by the catalog entry, so neither saving
  // nor handing off is safe until every exercise has resolved.
  const catalogReady = useMemo(
    () => flattenItems(items).every((id) => Boolean(lookup[id])),
    [items, lookup]
  )

  const totalSets = useMemo(
    () =>
      (rows ?? []).reduce(
        (sum, row) => sum + (parseInt(row.setCount, 10) || 0),
        0
      ),
    [rows]
  )

  /** Hands the numbers entered here to the full retro logger and steps aside. */
  function openFullLogger() {
    if (!catalogReady) return
    hapticSelection()
    const exerciseData = expandToExerciseData()
    writeActiveWorkoutDraft(
      {
        elapsedSeconds: estimateRetroDurationSeconds(items, exerciseData),
        exerciseData,
        items,
        presetId,
        savedAt: Date.now(),
        slot: (freeSlot ?? 1) as 1 | 2,
        startedAt: Date.now(),
      },
      retroWorkoutDraftKey(date, sessionId)
    )
    navigate(
      `/workout/log/${date}?sessionId=${encodeURIComponent(sessionId)}`,
      { motion: "forward", replace: true }
    )
  }

  async function handleSave() {
    if (saving) return
    const exerciseData = expandToExerciseData()
    const exercises = flattenItems(items).flatMap((id) => {
      const exercise = lookup[id]
      if (!exercise) return []
      const data = exerciseData[id]
      if (!data) return []
      const cardio = isCardioExercise(exercise)
        ? cardioLogFromState(data.cardio)
        : null
      const sets = isCardioExercise(exercise)
        ? []
        : data.sets.map((set) => ({
            type: "normal",
            weight: parseFloat(String(set.weight)) || 0,
            reps: parseFloat(String(set.reps)) || 0,
            completed: true,
          }))
      if (sets.length === 0 && !cardio) return []
      return [
        {
          id,
          name: exercise.name,
          category: exercise.category,
          sets,
          ...(cardio ? { cardio } : {}),
        },
      ]
    })

    if (exercises.length === 0) {
      toast.error("Add at least one set before logging this workout.")
      return
    }

    setSaving(true)
    try {
      await logCompletion({
        date,
        sessionId,
        slot: (freeSlot ?? 1) as 1 | 2,
        exercises,
        durationSeconds: estimateRetroDurationSeconds(items, exerciseData),
        completedAt: new Date(`${date}T12:00:00`).getTime(),
      })
      hapticMedium()
      navigate("/workouts", { motion: "back", replace: true })
    } catch (error) {
      logDevWarn("Failed to log preset workout", error)
      toast.error("Couldn't log that workout. Try again.")
    } finally {
      setSaving(false)
    }
  }

  if (presets !== undefined && !preset) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-8 text-center">
        <p className="text-[15px] text-muted-foreground">
          That preset isn't around any more.
        </p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="motion-tactile h-[52px] w-full max-w-xs rounded-[20px] bg-muted/60 text-[15px] font-semibold"
        >
          Go back
        </button>
      </div>
    )
  }

  if (freeSlot === null) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-8 text-center">
        <p className="text-[15px] text-muted-foreground">
          You already have two sessions logged that day. Edit one instead.
        </p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="motion-tactile h-[52px] w-full max-w-xs rounded-[20px] bg-muted/60 text-[15px] font-semibold"
        >
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="desktop-canvas min-h-svh bg-background md:px-8">
      <div
        className="flex items-center px-[var(--app-page-x)] md:px-8"
        style={{
          paddingTop: "max(3.25rem, env(safe-area-inset-top, 3.25rem))",
          paddingBottom: "0.75rem",
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex min-h-11 items-center gap-1.5 px-2 text-[15px] font-medium text-muted-foreground transition-colors active:bg-muted/45 active:text-foreground"
        >
          <ArrowLeft size={14} weight="bold" />
          Back
        </button>
        <button
          type="button"
          onClick={openFullLogger}
          disabled={!catalogReady}
          className="ml-auto flex min-h-11 items-center gap-1.5 px-3 text-[15px] font-medium text-muted-foreground transition-colors active:bg-muted/45 active:text-foreground disabled:opacity-45"
        >
          <ArrowsOutSimple size={14} weight="bold" />
          Customize
        </button>
      </div>

      <div className="px-[var(--app-page-x)] pb-40 md:px-8">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
          {preset?.name ?? "Loading…"}
        </h1>
        <p className="mt-1.5 text-[15px] leading-6 text-muted-foreground">
          {formatRetroDateLabel(date, todayKey)} · fill in what you actually
          did.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {(rows ?? []).map((row) => {
            const exercise = lookup[row.exerciseId]
            const cardio = exercise ? isCardioExercise(exercise) : false
            return (
              <div key={row.exerciseId} className="app-surface px-4 py-3.5">
                <p className="truncate text-[15px] font-semibold tracking-tight">
                  {exercise?.name ?? "…"}
                </p>
                {cardio ? (
                  <p className="mt-1.5 text-[13px] text-muted-foreground">
                    Cardio — tap Customize to add distance and time.
                  </p>
                ) : (
                  <div className="mt-2.5 flex items-center gap-2">
                    <QuickField
                      label="Sets"
                      value={row.setCount}
                      inputMode="numeric"
                      className="w-[62px] shrink-0"
                      onChange={(value) =>
                        setRow(row.exerciseId, { setCount: value })
                      }
                    />
                    <span className="pt-5 text-[13px] text-muted-foreground">
                      ×
                    </span>
                    <QuickField
                      label="Reps"
                      value={row.reps}
                      inputMode="numeric"
                      className="w-[62px] shrink-0"
                      onChange={(value) =>
                        setRow(row.exerciseId, { reps: value })
                      }
                    />
                    <QuickField
                      label={unit === "lbs" ? "Weight (lb)" : "Weight (kg)"}
                      value={row.weight}
                      inputMode="decimal"
                      className="min-w-0 flex-1"
                      onChange={(value) =>
                        setRow(row.exerciseId, { weight: value })
                      }
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-[var(--app-page-x)] pt-3 backdrop-blur md:px-8"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
      >
        <div className="desktop-canvas mx-auto">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={
              saving || totalSets === 0 || rows === null || !catalogReady
            }
            aria-busy={saving}
            className="motion-tactile h-[52px] w-full rounded-[20px] bg-foreground text-[15px] font-semibold tracking-tight text-background transition-opacity active:opacity-80 disabled:opacity-50"
          >
            {saving ? "Logging…" : "Log workout"}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuickField({
  label,
  value,
  inputMode,
  className,
  onChange,
}: {
  label: string
  value: string
  inputMode: "numeric" | "decimal"
  className?: string
  onChange: (value: string) => void
}) {
  return (
    <label className={className}>
      <span className="block text-[12px] text-muted-foreground">{label}</span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder="—"
        className={cn(
          "mt-1 h-11 w-full rounded-[14px] bg-muted/40 px-3 text-[16px] font-semibold tabular-nums outline-none",
          "focus:ring-2 focus:ring-primary/40"
        )}
      />
    </label>
  )
}
