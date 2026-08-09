import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowClockwise,
  Barbell,
  CaretLeft,
  CaretRight,
  Plus,
} from "@phosphor-icons/react"
import { MomentRow, MomentScreen, MomentSecondaryAction, toast } from "@repo/ui"
import { api } from "../../../../../convex/_generated/api"
import { useSmoothNavigate } from "@/lib/navigation"
import { hapticMedium, hapticSelection } from "@/lib/haptics"
import { createClientId, logDevWarn } from "@/lib/utils"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { isBrowserOnline } from "@/lib/offline-queue"
import { resolveExerciseIds, type Exercise } from "@/lib/exercise-catalog"
import {
  estimateRetroDurationSeconds,
  type ExerciseState,
  type WeightUnit,
  type WorkoutItem,
} from "@/lib/workout-logging"
import {
  buildCompletionExercises,
  describePresetPlan,
  expandToExerciseData,
  flattenItems,
  rowsFromPreset,
} from "@/lib/preset-quick-log"
import {
  buildQuickLogCandidates,
  type QuickLogCandidate,
  type SourceWorkoutLog,
} from "@/lib/moment-quick-log"
import { DayStrip, fullDateLabel } from "@/components/log-past-workout-sheet"
import type { FullScreenEventOutcome } from "@/lib/full-screen-events"

/**
 * What both sources hand the writer. Deliberately structural: a repeated log
 * and an expanded preset arrive from different code paths and only have to
 * agree on the shape the mutation validates.
 */
type CompletionExercise = {
  id: string
  name: string
  category?: string
  sets: Array<{
    type: string
    weight: number
    reps: number
    completed: boolean
  }>
  cardio?: unknown
}

type PresetRow = {
  id: string
  name: string
  detail: string
  items: WorkoutItem[]
  exerciseData: Record<string, ExerciseState>
}

/** "today", "yesterday", or a weekday — for a toast that reads as a sentence. */
function dayWord(date: string, todayKey: string) {
  const label = fullDateLabel(date, todayKey)
  if (label === "Today" || label === "Yesterday") return label.toLowerCase()
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
  })
}

/**
 * Pick a day, then log the session in one tap.
 *
 * Two sources, in the order they are likely to be right: sessions the user
 * has actually done recently, then the plans they have saved. Both write a
 * real row and close, with undo in the toast — a moment that ends in another
 * screen has not saved anybody any time.
 */
export function QuickLogStep({
  todayKey,
  workoutLogs,
  onBack,
  onClose,
}: {
  todayKey: string
  workoutLogs: SourceWorkoutLog[]
  onBack: () => void
  onClose: (outcome: FullScreenEventOutcome) => void
}) {
  const navigate = useSmoothNavigate()
  const [date, setDate] = useState(todayKey)
  const [busy, setBusy] = useState(false)
  const [lookup, setLookup] = useState<Record<string, Exercise>>({})

  // One id for the screen. A retried save lands on the same session rather
  // than a second one, and `freeSlot` can exclude it when it answers.
  const sessionIdRef = useRef<string | null>(null)
  if (sessionIdRef.current === null) {
    sessionIdRef.current = `moment:${createClientId()}`
  }
  const sessionId = sessionIdRef.current

  const preferences = useQuery(api.users.users.getPreferences)
  const presets = useQuery(api.logs.presets.list)
  const freeSlot = useQuery(api.logs.workouts.freeSlot, { date, sessionId }) as
    1 | 2 | null | undefined

  const logCompletion = useOfflineMutation(
    api.logs.workouts.completion,
    "logs.workouts.completion"
  )
  const removeBySlot = useMutation(api.logs.workouts.removeBySlot)

  const unit: WeightUnit =
    (preferences?.weightUnit as WeightUnit | undefined) ?? "kg"

  const presetRows = useMemo<PresetRow[]>(() => {
    if (!presets || preferences === undefined) return []
    return presets.slice(0, 4).map((preset) => {
      const items = (preset.items as WorkoutItem[] | undefined) ?? []
      const exerciseData =
        (preset.exerciseData as Record<string, ExerciseState> | undefined) ?? {}
      return {
        id: String(preset.id ?? preset._id),
        name: String(preset.name ?? "Preset"),
        detail: describePresetPlan(rowsFromPreset(items, exerciseData, unit)),
        items,
        exerciseData,
      }
    })
  }, [preferences, presets, unit])

  // Cardio is told apart from lifting by the catalog entry, so a preset is not
  // safe to write until every exercise in it has resolved.
  useEffect(() => {
    const ids = [
      ...new Set(presetRows.flatMap((row) => flattenItems(row.items))),
    ]
    if (ids.length === 0) return
    void resolveExerciseIds(ids)
      .then(setLookup)
      .catch((error) => logDevWarn("Failed to resolve preset exercises", error))
  }, [presetRows])

  const candidates = useMemo(
    () => buildQuickLogCandidates({ workoutLogs, targetDate: date, todayKey }),
    [date, todayKey, workoutLogs]
  )

  const dayFull = freeSlot === null

  /** One writer for both sources, so both get the same undo and the same slot. */
  async function write({
    exercises,
    durationSeconds,
    label,
  }: {
    exercises: CompletionExercise[]
    durationSeconds: number
    label: string
  }) {
    if (busy) return
    if (exercises.length === 0) {
      toast.error("That one has no sets to log.")
      return
    }

    const slot = (freeSlot ?? 1) as 1 | 2
    // Offline the write is queued rather than performed, and there is no row
    // to take back yet. Offering undo would be a button that only errors.
    const undoable = isBrowserOnline()
    setBusy(true)
    try {
      await logCompletion({
        date,
        sessionId,
        slot,
        exercises,
        durationSeconds,
        completedAt: new Date(`${date}T12:00:00`).getTime(),
      })
      hapticMedium()
      onClose("resolved")
      toast.success(
        undoable
          ? `Logged ${label} on ${dayWord(date, todayKey)}`
          : `Saved for ${dayWord(date, todayKey)} — syncs when you're back online`,
        undoable
          ? {
              action: {
                label: "Undo",
                onClick: () => {
                  void removeBySlot({ date, slot }).catch(() => {
                    toast.error("Couldn't undo that")
                  })
                },
              },
            }
          : undefined
      )
    } catch (error) {
      logDevWarn("Failed to log a session from a moment", error)
      toast.error("Couldn't log that workout. Try again.")
      setBusy(false)
    }
  }

  /**
   * A stored log is already the exact payload the mutation takes, so repeating
   * one needs no catalog, no expansion and nothing typed.
   */
  function repeatSession(candidate: QuickLogCandidate) {
    void write({
      exercises: candidate.exercises,
      durationSeconds: candidate.durationSeconds,
      label: candidate.title,
    })
  }

  /** A plan becomes a session at its planned numbers, editable afterwards. */
  function logPreset(row: PresetRow) {
    const exerciseIds = flattenItems(row.items)
    if (!exerciseIds.every((id) => lookup[id])) {
      toast.error("Still loading that preset. One second.")
      return
    }

    const exerciseData = expandToExerciseData({
      rows: rowsFromPreset(row.items, row.exerciseData, unit),
      presetExerciseData: row.exerciseData,
      lookup,
      unit,
    })

    void write({
      exercises: buildCompletionExercises({
        exerciseIds,
        exerciseData,
        lookup,
      }),
      durationSeconds: estimateRetroDurationSeconds(row.items, exerciseData),
      label: row.name,
    })
  }

  /**
   * Anything the lists above cannot express — a one-off, a session that went
   * nothing like the plan, an exercise this account has never done.
   *
   * Goes straight to the logger for the chosen day rather than back through
   * the Workouts page's sheet: the day has already been picked here, and
   * asking for it a second time is the detour this screen exists to remove.
   */
  function openBlankLogger() {
    hapticSelection()
    onClose("resolved")
    navigate(`/workout/log/${date}`, { motion: "forward" })
  }

  const loading = presets === undefined || preferences === undefined
  const hasOneTapOptions = candidates.length > 0 || presetRows.length > 0

  return (
    <MomentScreen
      title="Which day?"
      subtitle={
        hasOneTapOptions
          ? "Pick the day, then the session. Numbers come from the last time you did it."
          : "Pick the day, then add the exercises you did."
      }
      onClose={() => {
        hapticSelection()
        onClose("dismissed")
      }}
      actions={
        <>
          <MomentSecondaryAction onClick={openBlankLogger}>
            <Plus size={14} weight="bold" className="mr-1.5" />
            {hasOneTapOptions ? "Another exercise" : "Add exercises"}
          </MomentSecondaryAction>
          <MomentSecondaryAction
            onClick={() => {
              hapticSelection()
              onBack()
            }}
            className="bg-transparent text-muted-foreground active:bg-muted/40"
          >
            <CaretLeft size={13} weight="bold" className="mr-1.5" />
            Back
          </MomentSecondaryAction>
        </>
      }
    >
      <DayStrip todayKey={todayKey} value={date} onChange={setDate} days={7} />
      <p className="mt-3 text-[13px] text-muted-foreground">
        {fullDateLabel(date, todayKey)}
        {dayFull && " · two sessions already logged"}
      </p>

      {candidates.length > 0 && (
        <div className="app-surface mt-4 overflow-hidden">
          {candidates.map((candidate, index) => (
            <div key={candidate.id}>
              {index > 0 && <div className="mx-4 h-px bg-border/50" />}
              <MomentRow
                icon={<ArrowClockwise size={16} weight="bold" />}
                title={candidate.title}
                detail={candidate.detail}
                disabled={busy || dayFull}
                onClick={() => repeatSession(candidate)}
              />
            </div>
          ))}
        </div>
      )}

      {presetRows.length > 0 && (
        <>
          <p className="mt-5 mb-2 px-1 text-[13px] text-muted-foreground">
            {candidates.length > 0
              ? "Or one of your plans, as written"
              : "Your plans, as written"}
          </p>
          <div className="app-surface overflow-hidden">
            {presetRows.map((row, index) => (
              <div key={row.id}>
                {index > 0 && <div className="mx-4 h-px bg-border/50" />}
                <MomentRow
                  icon={<Barbell size={16} weight="bold" />}
                  title={row.name}
                  detail={row.detail}
                  disabled={busy || dayFull}
                  onClick={() => logPreset(row)}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/*
        A blank screen with one button that leaves is the worst version of
        this. Say why there is nothing to tap, and point at the thing that
        would put something here next time.
      */}
      {!loading && !hasOneTapOptions && (
        <div className="app-surface mt-4 px-4 py-5">
          <p className="text-[14px] font-semibold">Nothing to repeat yet.</p>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
            Once you have saved a routine or logged a session, both show up here
            as one tap. For now, add the exercises you did.
          </p>
          <button
            type="button"
            onClick={() => {
              hapticSelection()
              onClose("resolved")
              navigate("/routines", { motion: "forward" })
            }}
            className="mt-3 inline-flex min-h-11 items-center text-[14px] font-semibold text-muted-foreground transition-colors active:text-foreground"
          >
            Build a routine
            <CaretRight size={11} weight="bold" className="ml-1.5" />
          </button>
        </div>
      )}
    </MomentScreen>
  )
}
