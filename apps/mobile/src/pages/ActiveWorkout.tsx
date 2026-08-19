import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { usePostHog } from "@posthog/react"
import { captureFeatureUsage, durationBucket } from "@/lib/analytics"
import { useAction, useQuery, useMutation } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import {
  ExerciseDropIndicator,
  ExerciseMoveControls,
  ExerciseReorderToolbar,
  moveArrayItemByStep,
  useFlipReorderAnimation,
  toast,
  WorkoutCoachMenu,
} from "@repo/ui"
import {
  Brain,
  CaretDown,
  CaretUp,
  CheckCircle,
  DotsSixVertical,
  Plus,
  Rows,
  Sparkle,
  Square,
  X,
} from "@phosphor-icons/react"
import {
  cn,
  createClientId,
  logDevError,
  logDevWarn,
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeSessionStorageRemove,
  safeSessionStorageSet,
} from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { findNextWorkoutSequenceTarget } from "@/lib/workout-sequencing"
import {
  resolveExerciseIds,
  searchExercises,
  type Exercise,
} from "@/lib/exercise-catalog"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { hapticMedium, hapticSelection, hapticTap } from "@/lib/haptics"
import { FORM_COACH_AI_COST } from "@/lib/form-coach"
import {
  clearFormCoachDraft,
  startFormCoachDraft,
  useFormCoachDraft,
} from "@/lib/form-coach-clips"
import { useFormCoachSupport } from "@/lib/form-coach"
import { InWorkoutCoach } from "@/components/in-workout-coach"
import { CoachSheet } from "@/components/coach-sheet"
import { FormCoachRecorder } from "@/components/form-coach-recorder"
import { FormCoachReviewSheet } from "@/components/form-coach-review-sheet"
import { FormCoachPoseConfirm } from "@/components/form-coach-pose-confirm"
import type { Id } from "../../../../convex/_generated/dataModel"
import { celebrateAchievement } from "@/lib/workout-celebration"
import { api } from "../../../../convex/_generated/api"
import { todayIso } from "@/lib/workout-sync"
import { saveWorkoutToHealth } from "@/lib/health-provider"
import { useAiFeatureGate } from "@/lib/ai-access"
import { useCoachContext } from "@/lib/coach-context"
import {
  endWorkoutLiveActivity,
  startWorkoutLiveActivity,
  supportsLiveWorkoutStatusSetting,
  updateWorkoutLiveActivity,
} from "@/lib/workout-live-activity"
import {
  REST_TIMER_PREFIX,
  cardioLogFromState,
  clearActiveWorkoutDraft,
  countWorkoutProgress,
  estimateRetroDurationSeconds,
  exerciseStateFromLoggedExercise,
  formatElapsed,
  hasCardioStateDetails,
  makeDefaultExerciseState,
  makeExerciseStateFromAgentDraft,
  normalizeExerciseState,
  pickBestExerciseMatch,
  readActiveWorkoutDraft,
  removeExFromItems,
  replaceExerciseInItems,
  makeSet,
  restTimerKey,
  retroWorkoutDraftKey,
  uid,
  useElapsedTimer,
  useRestCountdown,
  workoutDragLabel,
  workoutItemKey,
  writeActiveWorkoutDraft,
} from "@/lib/workout-logging"
import type {
  AgentWorkoutDraft,
  AgentWorkoutExerciseDraft,
  CoachWorkoutProposal,
  ExerciseState,
  LastSession,
  LocalActiveWorkoutDraft,
  LoggedWorkoutExercise,
  WeightUnit,
  WorkoutItem,
  WorkoutSet,
} from "@/lib/workout-logging"
import { ActiveExerciseCard } from "./active-workout/active-exercise-card"
import { NotchRestTimer } from "./active-workout/notch-rest-timer"
import { FocusWorkoutView } from "./active-workout/focus-view"
import { AddExerciseSheet } from "./active-workout/add-exercise-sheet"
import { ExerciseHistorySheet } from "./active-workout/exercise-history-sheet"
import { ExerciseInfoSheet } from "./active-workout/exercise-info-sheet"
import {
  AbortSheet,
  AiWorkoutSheet,
  BrainDumpSheet,
  FinishSheet,
  RemoveExerciseSheet,
  ResumeWorkoutSheet,
  RetroSaveSheet,
  formatRetroDateLabel,
  type AiWorkoutSheetTarget,
} from "./active-workout/session-sheets"

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkoutSyncStatus = "idle" | "pending" | "saving" | "saved" | "error"

type ExerciseCardDropProps = {
  dropActive: boolean
  dropPosition?: "before" | "after"
  supersetDropActive?: boolean
}

type ResumePromptState = {
  source: "convex" | "local"
  draft?: LocalActiveWorkoutDraft
} | null

type DragInfo = {
  itemKey: string
  x: number
  y: number
  startX: number
  startY: number
  active: boolean
}

type DropTarget = {
  type: "before" | "after" | "superset"
  targetKey: string
} | null

// ─── Constants ────────────────────────────────────────────────────────────────

const ABORTED_WORKOUT_SLOT_KEY = "onerep:aborted-workout-slot"

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Next set indicator ───────────────────────────────────────────────────────

type NextTarget =
  | {
      kind: "set"
      exerciseId: string
      setIndex: number
    }
  | {
      kind: "cardio"
      exerciseId: string
    }
  | null

/**
 * Locate the next incomplete set across the workout items.
 *
 * Solo exercises advance set-by-set. Supersets advance round-by-round so set
 * one of each member is completed before set two of the first member.
 *
 * @param items - Ordered list of workout items (solo exercises or supersets) to scan
 * @param exData - Mapping from exercise ID to its corresponding ExerciseState
 * @returns A `NextTarget` with `exerciseId` and `setIndex` for the first incomplete set, or `null` if none found
 */
function findNextTarget(
  items: WorkoutItem[],
  exData: Record<string, ExerciseState>,
  exerciseLookup: Record<string, Exercise>
): NextTarget {
  return findNextWorkoutSequenceTarget(items, (exerciseId) => {
    const data = exData[exerciseId]
    if (!data) return undefined
    return exerciseLookup[exerciseId]?.category === "cardio"
      ? { kind: "cardio", complete: hasCardioStateDetails(data.cardio) }
      : { kind: "sets", completed: data.sets.map((set) => set.completed) }
  })
}

/**
 * Renders a superset container with its member exercises as ActiveExerciseCard entries.
 *
 * Renders visual superset chrome (colored side band, header, connecting lines), maps each exercise ID
 * to an ActiveExerciseCard with drag handlers, collapse state, history link, rest control, and next-set highlighting.
 *
 * @param item - The superset workout item containing `exerciseIds`, `color`, and `id`.
 * @param exData - Map of exercise state keyed by exercise ID.
 * @param unit - Current weight unit (`kg` or `lbs`) for display/conversion.
 * @param updateExData - Callback to replace an exercise's ExerciseState.
 * @param removeExercise - Callback to remove an exercise from the workout.
 * @param drag - Current drag state or null.
 * @param dropTarget - Current drop target information used to render before/after indicators.
 * @param collapsed - Map of exerciseId to collapsed boolean.
 * @param toggleCollapsed - Toggles collapsed state for a given exercise ID.
 * @param makeDragHandlers - Factory that returns pointer/drag handlers for a given exercise ID.
 * @param itemRefs - Mutable ref map from top-level item key to the item DOM element (used for hit-testing).
 * @param onStartRest - Invoked with rest seconds to start the rest countdown for a set.
 * @param exerciseLookup - Map of exercise metadata keyed by exercise ID.
 * @param lastSessionMap - Map of exerciseId to last completed session summary (date and sets) or undefined.
 * @param onShowHistory - Callback invoked to open the exercise history sheet (exerciseId, name).
 * @param nextTarget - Optional next-set target identifying which exercise and set index should be highlighted.
 *
 * @returns A JSX element representing the superset block and its exercise cards.
 */
function renderSupersetItem(
  item: Extract<WorkoutItem, { kind: "superset" }>,
  exData: Record<string, ExerciseState>,
  unit: WeightUnit,
  updateExData: (id: string, d: ExerciseState) => void,
  removeExercise: (id: string) => void,
  drag: DragInfo | null,
  dropTarget: DropTarget,
  collapsed: Record<string, boolean>,
  toggleCollapsed: (id: string) => void,
  toggleGroupCollapsed: (ids: string[]) => void,
  makeDragHandlers: (itemKey: string) => React.HTMLAttributes<HTMLDivElement>,
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  onStartRest: (s: number) => void,
  exerciseLookup: Record<string, Exercise>,
  lastSessionMap: Record<string, LastSession>,
  onShowHistory: (exId: string, name: string) => void,
  onAiChange: (exId: string, name: string) => void,
  onSwap: (exId: string) => void,
  onOpenDetail: (exId: string) => void,
  onBreakOut: (exId: string) => void,
  nextTarget: NextTarget,
  reorderMode: boolean,
  itemIndex: number,
  itemCount: number,
  onMoveItem: (itemKey: string, direction: -1 | 1) => void,
  defaultSetCompleted = false
) {
  const key = workoutItemKey(item)
  const dt = dropTarget
  const isTarget = dt?.targetKey === key
  const dropActive = Boolean(
    isTarget && (dt?.type === "before" || dt?.type === "after")
  )
  const supersetDropActive = Boolean(isTarget && dt?.type === "superset")
  const groupCollapsed = item.exerciseIds.every((id) => collapsed[id])
  const allDone = item.exerciseIds.every((id) => {
    const exercise = exerciseLookup[id]
    const data = exData[id]
    if (!data) return false
    if (exercise?.category === "cardio")
      return hasCardioStateDetails(data.cardio)
    return data.sets.every((s) => s.completed)
  })
  const groupSets = item.exerciseIds.reduce(
    (acc, id) => {
      if (exerciseLookup[id]?.category === "cardio") {
        const data = exData[id]
        return {
          done: acc.done + (data && hasCardioStateDetails(data.cardio) ? 1 : 0),
          total: acc.total + 1,
        }
      }
      const sets = exData[id]?.sets ?? []
      return {
        done: acc.done + sets.filter((set) => set.completed).length,
        total: acc.total + sets.length,
      }
    },
    { done: 0, total: 0 }
  )

  return (
    <div
      key={item.id}
      tabIndex={-1}
      ref={(el) => {
        if (el) itemRefs.current.set(key, el)
        else itemRefs.current.delete(key)
      }}
      className={cn(
        "relative scroll-mt-56 overflow-hidden rounded-[26px] border border-border/55 bg-card shadow-[0_10px_32px_rgba(0,0,0,0.055)] transition-[border-color,opacity,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        allDone && "bg-muted/[0.06]",
        dropActive && "border-foreground/35",
        supersetDropActive &&
          "border-foreground/70 bg-foreground/[0.035] ring-2 ring-foreground/65 ring-offset-2 ring-offset-background",
        drag?.itemKey === key && drag.active && "scale-[0.985] opacity-25"
      )}
    >
      {supersetDropActive && (
        <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-md border border-dashed border-foreground/55 bg-background/55 backdrop-blur-[1px]">
          <span className="rounded-full bg-foreground px-3 py-1.5 text-[13px] font-semibold tracking-tight text-background shadow-lg">
            drop to superset
          </span>
        </div>
      )}
      {dt?.type !== "superset" && isTarget && (
        <ExerciseDropIndicator position={dt.type} />
      )}
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border/45 px-3">
        <div className="flex min-w-0 items-center">
          <div
            {...makeDragHandlers(key)}
            role="button"
            aria-label="Reorder superset"
            className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground transition-colors select-none active:cursor-grabbing active:text-foreground"
          >
            <DotsSixVertical size={15} weight="bold" />
          </div>
          <span className="ml-1 truncate text-[13px] font-semibold">
            Superset
          </span>
        </div>
        <div className="flex shrink-0 items-center">
          <span
            className={cn(
              "px-2 text-[13px] font-semibold tabular-nums",
              allDone ? "text-primary" : "text-muted-foreground"
            )}
          >
            {groupSets.done}/{groupSets.total}
          </span>
          <button
            type="button"
            onClick={() => toggleGroupCollapsed(item.exerciseIds)}
            aria-label={
              groupCollapsed ? "Expand superset" : "Collapse superset"
            }
            aria-expanded={!groupCollapsed}
            className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors active:bg-muted active:text-foreground"
          >
            {groupCollapsed ? (
              <CaretDown size={14} weight="bold" />
            ) : (
              <CaretUp size={14} weight="bold" />
            )}
          </button>
        </div>
      </div>
      {reorderMode && (
        <div className="flex justify-end border-b border-border/45 px-3 py-2">
          <ExerciseMoveControls
            label="superset"
            canMoveUp={itemIndex > 0}
            canMoveDown={itemIndex < itemCount - 1}
            onMoveUp={() => onMoveItem(key, -1)}
            onMoveDown={() => onMoveItem(key, 1)}
          />
        </div>
      )}
      <div>
        {item.exerciseIds.map((exId) => {
          const ex = exerciseLookup[exId]
          if (!ex || !exData[exId]) return null
          return (
            <div
              key={exId}
              className="border-t border-border/35 first:border-t-0"
            >
              <ActiveExerciseCard
                exercise={ex}
                data={exData[exId]}
                unit={unit}
                onUpdate={(d) => updateExData(exId, d)}
                onRemove={() => removeExercise(exId)}
                isDragging={false}
                dropActive={false}
                inSuperset
                collapsed={Boolean(collapsed[exId])}
                onToggleCollapse={() => toggleCollapsed(exId)}
                cardRef={() => undefined}
                onStartRest={onStartRest}
                defaultSetCompleted={defaultSetCompleted}
                lastSession={lastSessionMap[exId] ?? null}
                onShowHistory={() => onShowHistory(exId, ex.name)}
                onAiChange={() => onAiChange(exId, ex.name)}
                onSwap={() => onSwap(exId)}
                onOpenDetail={() => onOpenDetail(exId)}
                onBreakOut={() => onBreakOut(exId)}
                nextSetIndex={
                  nextTarget?.kind === "set" && nextTarget.exerciseId === exId
                    ? nextTarget.setIndex
                    : null
                }
                isNextCardio={
                  nextTarget?.kind === "cardio" &&
                  nextTarget.exerciseId === exId
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
/**
 * Renders and manages the Active Workout page, including UI for editing/performing sets and exercises, timers, drag-and-drop reordering, and sheets for adding exercises, viewing history, finishing, or aborting a workout.
 *
 * This component initializes from a Convex active workout or a preset, maintains local workout state (items, per-exercise sets and tracking options, UI collapse/drag state, and elapsed/rest timers), and debounces syncing updates back to Convex. It also handles creating the active workout record, finishing (with Convex primary and legacy fallback logging), aborting, and analytics events.
 *
 * @returns The React element for the Active Workout page.
 */
// Two ways to run a session: the simple view keeps one exercise on screen with
// the next one peeking beneath, the expanded view is the full scrollable list.
// The choice sticks per device.
const SIMPLE_VIEW_KEY = "onerep:active-workout-simple-view"

// The simple view never folds the one card it shows, superset partners included.
const EMPTY_COLLAPSED: Record<string, boolean> = {}

export default function ActiveWorkout() {
  const routeParams = useParams<{ presetId?: string; date?: string }>()
  const navigate = useSmoothNavigate()
  const posthog = usePostHog()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Retro mode ────────────────────────────────────────────────────────────
  // `/workout/log/:date` reconstructs a session that already happened. The
  // set-entry UI is identical; what changes is that nothing here is live —
  // there is no clock, no rest timer, and above all no `activeWorkouts` row,
  // which is keyed by slot alone and would clobber a workout running right now.
  const retroDateParam = routeParams.date
  const isRetro = Boolean(retroDateParam)
  const healthWorkoutParam = searchParams.get("health")
  const editSessionIdParam = searchParams.get("sessionId")
  const presetId =
    routeParams.presetId ?? searchParams.get("preset") ?? undefined

  const [retroDate, setRetroDate] = useState(retroDateParam ?? "")
  const [retroDuration, setRetroDuration] = useState<number | null>(null)
  const [retroCompletedAt, setRetroCompletedAt] = useState<number | null>(null)
  const retroSessionIdRef = useRef<string | null>(null)
  // `?describe=1` arrives from the "Describe it" choice in the log-a-past-workout
  // sheet, so that path opens straight into dictation instead of an empty logger.
  const [brainDumpOpen, setBrainDumpOpen] = useState(
    () => searchParams.get("describe") === "1"
  )
  const [brainDumpPending, setBrainDumpPending] = useState(false)

  const healthWorkout = useQuery(
    api.logs.healthWorkouts.getById,
    isRetro && healthWorkoutParam
      ? { id: healthWorkoutParam as Id<"healthWorkouts"> }
      : "skip"
  )
  const retroDayLogs = useQuery(
    api.logs.workouts.getLog,
    isRetro && retroDate ? { date: retroDate } : "skip"
  )

  // Health handoff reuses the namespace `linkToTrainingLog` writes, so a
  // re-sync and a repeat save land on the same row instead of duplicating.
  if (isRetro && retroSessionIdRef.current === null) {
    retroSessionIdRef.current =
      editSessionIdParam ??
      (healthWorkoutParam ? null : `retro:${createClientId()}`)
  }
  if (
    isRetro &&
    retroSessionIdRef.current === null &&
    healthWorkout !== undefined
  ) {
    // `null` means the recorded workout is gone or belongs to someone else.
    // Fall back to a fresh session rather than leaving the page unable to save.
    retroSessionIdRef.current =
      healthWorkout?.sessionId ?? `retro:${createClientId()}`
  }
  const retroSessionId = retroSessionIdRef.current ?? ""

  const retroFreeSlot = useQuery(
    api.logs.workouts.freeSlot,
    isRetro && retroDate && retroSessionId
      ? { date: retroDate, sessionId: retroSessionId }
      : "skip"
  )
  const attachHealthWorkout = useMutation(api.logs.healthWorkouts.attachToLog)
  const retroDraftKey =
    isRetro && retroDate && retroSessionId
      ? retroWorkoutDraftKey(retroDate, retroSessionId)
      : null
  // Read inside the debounced sync closure, which cannot see fresh props.
  const isRetroRef = useRef(isRetro)
  useEffect(() => {
    isRetroRef.current = isRetro
  }, [isRetro])

  const editingLog = useMemo(
    () => retroDayLogs?.find((log) => log.sessionId === retroSessionId) ?? null,
    [retroDayLogs, retroSessionId]
  )
  const retroMode: "create" | "edit" = editingLog ? "edit" : "create"

  const slot = isRetro
    ? ((editingLog?.slot ?? retroFreeSlot ?? 1) as 1 | 2)
    : ((Number(searchParams.get("slot") ?? "1") || 1) as 1 | 2)
  const { requireAiAccess, aiAccessLoading, aiAccessModal } = useAiFeatureGate()
  const { context: coachContext, loading: coachContextLoading } =
    useCoachContext()

  // A form analysis spends more than one AI request, so affordability is
  // checked as the camera opens rather than at send time — being told the
  // coach cannot be paid for after filming would waste the take.
  const formCoachDraft = useFormCoachDraft()
  const formCoachOpening =
    formCoachDraft?.phase === "recording" && formCoachDraft.clips.length === 0
  useEffect(() => {
    if (!formCoachOpening || aiAccessLoading) return
    if (!requireAiAccess(FORM_COACH_AI_COST, "form_coach")) clearFormCoachDraft()
  }, [formCoachOpening, aiAccessLoading, requireAiAccess])

  const presets = useQuery(api.logs.presets.list, {})
  const logCompletion = useOfflineMutation(
    api.logs.workouts.completion,
    "logs.workouts.completion"
  )
  const workoutHistory = useQuery(api.logs.workouts.getHistory)
  const schedule = useQuery(api.users.schedules.get, {})

  // Active workout Convex sync
  const activeWorkout = useQuery(
    api.logs.activeWorkout.getActive,
    isRetro ? "skip" : { slot }
  )
  const createActive = useMutation(api.logs.activeWorkout.createActive)
  const updateActive = useMutation(api.logs.activeWorkout.updateActive)
  const abortActive = useMutation(api.logs.activeWorkout.abortActive)
  const finishActive = useMutation(api.logs.activeWorkout.finishActive)
  const generateCoachPlan = useAction(
    api.ai.metricGeneration.generateCoachChatMessage
  )
  const draftLogFromText = useAction(api.logs.logAgent.draftLogFromText)

  const [items, setItems] = useState<WorkoutItem[]>([])
  const [exData, setExData] = useState<Record<string, ExerciseState>>({})
  const [exerciseLookup, setExerciseLookup] = useState<
    Record<string, Exercise>
  >({})
  const preferences = useQuery(api.users.users.getPreferences)
  const liveWorkoutStatusEnabled = preferences?.liveWorkoutStatusEnabled ?? true
  const healthWriteEnabled = preferences?.healthSync?.writeEnabled ?? false
  const [unit, setUnit] = useState<WeightUnit>("kg")
  const [confirmAbort, setConfirmAbort] = useState(false)
  const [coachSheetOpen, setCoachSheetOpen] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [aiSheetTarget, setAiSheetTarget] = useState<AiWorkoutSheetTarget>(null)
  const [aiUpdating, setAiUpdating] = useState(false)
  // Removing an exercise throws away typed sets, so it asks first.
  const [confirmRemove, setConfirmRemove] = useState<{
    exerciseId: string
    name: string
  } | null>(null)
  // When set, the exercise picker replaces this exercise instead of adding.
  const [swapTarget, setSwapTarget] = useState<string | null>(null)
  // Photos and instructions, shown in place so the session is not left behind.
  const [infoSheet, setInfoSheet] = useState<{
    exerciseId: string
    name: string
  } | null>(null)
  const [historySheet, setHistorySheet] = useState<{
    exerciseId: string
    name: string
  } | null>(null)
  const [workoutSyncStatus, setWorkoutSyncStatus] =
    useState<WorkoutSyncStatus>("idle")
  const [workoutSyncError, setWorkoutSyncError] = useState("")
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [reorderMode, setReorderMode] = useState(false)
  const [showSupersetTip, setShowSupersetTip] = useState(() => {
    if (typeof window === "undefined") return true
    return (
      window.localStorage.getItem("onerep:active-superset-tip-hidden") !== "1"
    )
  })
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [localStartedAt, setLocalStartedAt] = useState<number | null>(null)
  const [resumePrompt, setResumePrompt] = useState<ResumePromptState>(null)
  const [resumeDecision, setResumeDecision] = useState<
    "pending" | "resume" | "discard"
  >("pending")
  const [completedPulseKey, setCompletedPulseKey] = useState<string | null>(
    null
  )
  const [simpleView, setSimpleView] = useState(
    () => safeLocalStorageGet(SIMPLE_VIEW_KEY) !== "false"
  )
  const [restDuration, setRestDuration] = useState<number | null>(null)
  const [restEndAt, setRestEndAt] = useState<number | null>(null)
  const [coachMenuOpen, setCoachMenuOpen] = useState(false)
  const [coachChatOpen, setCoachChatOpen] = useState(false)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const captureReorderPositions = useFlipReorderAnimation(
    items.map(workoutItemKey),
    itemRefs
  )
  const liveElapsed = useElapsedTimer(
    isRetro ? null : (activeWorkout?.startedAt ?? localStartedAt)
  )
  // A reconstructed session has no clock to read, so `elapsed` becomes the
  // duration the user confirms in the save sheet.
  const elapsed = isRetro ? (retroDuration ?? 0) : liveElapsed
  // The hook still runs (hooks cannot be conditional) but is pointed at a key
  // no live session uses, so it never resumes someone else's rest timer.
  const rest = useRestCountdown(
    isRetro ? `${REST_TIMER_PREFIX}retro` : restTimerKey(slot)
  )
  // Rest is a live-workout concept; in retro mode starting one is a no-op.
  const startRest = useCallback(
    (seconds: number) => {
      if (isRetro) return
      rest.start(seconds)
      setRestDuration(seconds)
    },
    [isRetro, rest]
  )
  // The notch pill's ring needs the full duration. A countdown resumed from
  // storage only knows what's left, so the first observed value becomes the
  // total; when the rest ends the duration resets with it.
  useEffect(() => {
    const remaining = rest.remaining
    if (remaining === null) {
      setRestDuration(null)
      setRestEndAt(null)
      return
    }
    setRestDuration((current) =>
      current === null || remaining > current ? remaining : current
    )
    // Reading the clock belongs in an effect, not in render. The end stamp only
    // moves when it drifts, so the Live Activity is not rewritten every tick.
    const endAt = Date.now() + remaining * 1000
    setRestEndAt((current) =>
      current === null || Math.abs(current - endAt) > 1500 ? endAt : current
    )
  }, [rest.remaining])

  // Track if we've initialized from Convex to avoid overwriting user's workout data
  const [isInitialized, setIsInitialized] = useState(false)
  // Debounce sync to Convex
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSyncingRef = useRef(false)
  const isDirtyRef = useRef(false)
  const dirtyVersionRef = useRef(0)
  const abortingRef = useRef(false)
  const aiUpdatingRef = useRef(false)
  const liveActivityStartedRef = useRef(false)
  const completedExerciseTargetsRef = useRef<Set<string> | null>(null)
  const [achievementMessage, setAchievementMessage] = useState<string | null>(
    null
  )
  // Refs to capture current state for sync
  const itemsRef = useRef(items)
  const exDataRef = useRef(exData)
  const elapsedRef = useRef(elapsed)
  const slotRef = useRef(slot)

  // Keep refs in sync with state
  useEffect(() => {
    itemsRef.current = items
    if (!abortingRef.current) {
      isDirtyRef.current = true
      dirtyVersionRef.current += 1
    }
  }, [items])
  useEffect(() => {
    exDataRef.current = exData
    if (!abortingRef.current) {
      isDirtyRef.current = true
      dirtyVersionRef.current += 1
    }
  }, [exData])
  useEffect(() => {
    elapsedRef.current = elapsed
  }, [elapsed])
  useEffect(() => {
    slotRef.current = slot
  }, [slot])

  const allExIds = items.flatMap((i) =>
    i.kind === "solo" ? [i.exerciseId] : i.exerciseIds
  )
  const uniqueExerciseIds = [...new Set(allExIds)]
  const uniqueExerciseKey = uniqueExerciseIds.join("|")
  const { total: totalSets, done: doneSets } = countWorkoutProgress(
    items,
    exData,
    exerciseLookup
  )
  const dragLabel = drag?.active
    ? workoutDragLabel(drag.itemKey, items, exerciseLookup)
    : ""

  // Celebrate an exercise target once, when its final programmed set is hit.
  useEffect(() => {
    if (!isInitialized) return
    const completed = new Set(
      uniqueExerciseIds.filter((id) => {
        const exercise = exerciseLookup[id]
        const data = exData[id]
        return Boolean(
          exercise &&
          exercise.category !== "cardio" &&
          data?.sets.length &&
          data.sets.every((set) => set.completed)
        )
      })
    )
    const previous = completedExerciseTargetsRef.current
    if (previous) {
      const newlyHitId = [...completed].find((id) => !previous.has(id))
      if (newlyHitId) {
        celebrateAchievement("target")
        setAchievementMessage(
          `${exerciseLookup[newlyHitId]?.name ?? "Exercise"} complete`
        )
      }
    }
    completedExerciseTargetsRef.current = completed
  }, [exData, exerciseLookup, isInitialized, uniqueExerciseKey])

  useEffect(() => {
    if (!achievementMessage) return
    const timer = window.setTimeout(() => setAchievementMessage(null), 1800)
    return () => window.clearTimeout(timer)
  }, [achievementMessage])

  const lastSessionMap = useMemo(() => {
    if (!workoutHistory)
      return {} as Record<
        string,
        {
          date: string
          sets: Array<{
            weight: number
            reps: number
            completed: boolean
            type: string
          }>
        }
      >
    const today = todayIso()
    const map: Record<string, LastSession> = {}
    for (const log of workoutHistory) {
      if (log.date >= today) continue
      for (const ex of log.exercises as unknown as LoggedWorkoutExercise[]) {
        if (!map[ex.id]) map[ex.id] = { date: log.date, sets: ex.sets }
      }
    }
    return map
  }, [workoutHistory])
  const progressPct =
    totalSets > 0 ? `${Math.round((doneSets / totalSets) * 100)}%` : "0%"
  const workoutSyncLabel =
    workoutSyncStatus === "pending"
      ? "Save pending"
      : workoutSyncStatus === "saving"
        ? "Saving workout"
        : workoutSyncStatus === "saved"
          ? "Workout saved"
          : workoutSyncStatus === "error"
            ? "Workout not saved"
            : ""

  // Find the next set to highlight
  const nextTarget = useMemo(
    () => findNextTarget(items, exData, exerciseLookup),
    [items, exData, exerciseLookup]
  )
  const nextExercise = nextTarget
    ? exerciseLookup[nextTarget.exerciseId]
    : undefined
  const nextSetLabel = nextTarget
    ? nextTarget.kind === "cardio"
      ? `${nextExercise?.name ?? "Cardio"} · details`
      : `${nextExercise?.name ?? "Next exercise"} · set ${nextTarget.setIndex + 1}`
    : totalSets > 0
      ? "Ready to finish"
      : "Add an exercise"
  const activeExerciseIndex = nextTarget
    ? Math.max(0, uniqueExerciseIds.indexOf(nextTarget.exerciseId)) + 1
    : Math.min(uniqueExerciseIds.length, uniqueExerciseIds.length || 1)
  const activeExerciseName =
    nextExercise?.name ?? (totalSets > 0 ? "Workout" : "No exercise yet")
  const activeSetNumber =
    nextTarget?.kind === "set" ? nextTarget.setIndex + 1 : doneSets + 1
  const liveActivityState = useMemo(
    () => ({
      exerciseName: nextExercise?.name ?? "OneRep workout",
      setLabel: nextTarget
        ? nextTarget.kind === "set"
          ? `Set ${nextTarget.setIndex + 1}`
          : "Log cardio"
        : "Ready to finish",
      completedSets: doneSets,
      totalSets,
      isResting: rest.remaining !== null,
      restEndAt: restEndAt ?? undefined,
      slot,
      // Android's ongoing notification counts up from this; iOS carries its own
      // startedAt on the activity attributes.
      startedAt: activeWorkout?.startedAt ?? localStartedAt ?? undefined,
    }),
    [
      activeWorkout?.startedAt,
      doneSets,
      localStartedAt,
      nextExercise?.name,
      nextTarget,
      rest.remaining,
      restEndAt,
      slot,
      totalSets,
    ]
  )
  const activeWorkoutItem = nextTarget
    ? items.find((item) =>
        item.kind === "solo"
          ? item.exerciseId === nextTarget.exerciseId
          : item.exerciseIds.includes(nextTarget.exerciseId)
      )
    : undefined
  const activeSupersetPosition =
    activeWorkoutItem?.kind === "superset" && nextTarget
      ? activeWorkoutItem.exerciseIds.indexOf(nextTarget.exerciseId) + 1
      : 0
  const activeSetContext =
    activeWorkoutItem?.kind === "superset"
      ? `Superset · exercise ${activeSupersetPosition} of ${activeWorkoutItem.exerciseIds.length}${nextTarget?.kind === "set" ? ` · round ${activeSetNumber}` : ""}`
      : `Exercise ${activeExerciseIndex} of ${uniqueExerciseIds.length}`

  // The simple view keeps a single exercise on screen. Everything else in the
  // session is still one tap away through the "next up" card beneath it.
  const simpleViewActive = simpleView && !isRetro && Boolean(activeWorkoutItem)
  const visibleItems =
    simpleViewActive && activeWorkoutItem ? [activeWorkoutItem] : items
  const activeItemIndex = activeWorkoutItem
    ? items.indexOf(activeWorkoutItem)
    : -1
  const upcomingItem =
    activeItemIndex >= 0 ? items[activeItemIndex + 1] : undefined
  const upcomingExerciseId =
    upcomingItem?.kind === "solo"
      ? upcomingItem.exerciseId
      : upcomingItem?.exerciseIds[0]
  const upcomingExercise = upcomingExerciseId
    ? exerciseLookup[upcomingExerciseId]
    : undefined
  const focusExerciseId = nextTarget?.exerciseId ?? null
  const focusState = focusExerciseId ? exData[focusExerciseId] : undefined
  const focusSet =
    nextTarget?.kind === "set" && focusState
      ? (focusState.sets[nextTarget.setIndex] ?? null)
      : null
  function updateFocusSet(updated: WorkoutSet) {
    if (!focusExerciseId || !focusState || nextTarget?.kind !== "set") return
    updateExData(focusExerciseId, {
      ...focusState,
      sets: focusState.sets.map((set, index) =>
        index === nextTarget.setIndex ? updated : set
      ),
    })
  }
  // What only this device knows: the session as it actually stands right now.
  const liveSessionSummary = useMemo(() => {
    const exercises = uniqueExerciseIds.map((exerciseId) => {
      const exercise = exerciseLookup[exerciseId]
      const state = exData[exerciseId]
      return {
        name: exercise?.name ?? exerciseId,
        completedSets: state?.sets.filter((set) => set.completed).length ?? 0,
        sets: state?.sets ?? [],
      }
    })
    return `${Math.round(elapsed / 60)} minutes in, ${doneSets} of ${totalSets} sets done. The session so far: ${JSON.stringify(exercises)}`
  }, [uniqueExerciseIds, exerciseLookup, exData, elapsed, doneSets, totalSets])

  // Form Coach only knows a fixed catalogue of movements; the menu greys the
  // option out rather than opening a camera that cannot score anything.
  const focusMovement = useFormCoachSupport(activeExerciseName)
  function skipFocusSet() {
    if (!focusExerciseId || !focusState || nextTarget?.kind !== "set") return
    hapticSelection()
    updateExData(focusExerciseId, {
      ...focusState,
      sets: focusState.sets.filter((_, index) => index !== nextTarget.setIndex),
    })
  }
  function addFocusSet() {
    if (!focusExerciseId || !focusState) return
    const template = focusState.sets[focusState.sets.length - 1]
    updateExData(focusExerciseId, {
      ...focusState,
      sets: [
        ...focusState.sets,
        template ? { ...template, id: uid(), completed: false } : makeSet(),
      ],
    })
  }

  const upcomingDetail = (() => {
    if (!upcomingItem || !upcomingExerciseId) return ""
    if (upcomingItem.kind === "superset") {
      return `Superset · ${upcomingItem.exerciseIds.length} exercises`
    }
    const data = exData[upcomingExerciseId]
    if (!data) return ""
    if (exerciseLookup[upcomingExerciseId]?.category === "cardio") {
      return "Cardio · log details"
    }
    return `${data.sets.length} set${data.sets.length === 1 ? "" : "s"}`
  })()

  // In the expanded view the list still opens with only the active exercise
  // unfolded, and a finished exercise folds away once the active set moves past
  // it. Manual toggles are left alone otherwise; a superset partner that is not
  // done yet never gets folded mid-round.
  const activeFocusExerciseId = nextTarget?.exerciseId ?? null
  const previousFocusExerciseRef = useRef<string | null>(null)
  useEffect(() => {
    if (isRetro || simpleView || !isInitialized || !activeFocusExerciseId)
      return
    const previous = previousFocusExerciseRef.current
    if (previous === activeFocusExerciseId) return
    previousFocusExerciseRef.current = activeFocusExerciseId
    setCollapsed((current) => {
      if (previous === null) {
        const next: Record<string, boolean> = {}
        for (const id of uniqueExerciseIds) {
          next[id] = id !== activeFocusExerciseId
        }
        return next
      }
      const previousData = exData[previous]
      const previousDone = previousData
        ? exerciseLookup[previous]?.category === "cardio"
          ? hasCardioStateDetails(previousData.cardio)
          : previousData.sets.length > 0 &&
            previousData.sets.every((set) => set.completed)
        : false
      return {
        ...current,
        ...(previousDone ? { [previous]: true } : {}),
        [activeFocusExerciseId]: false,
      }
    })
    // exData/exerciseLookup/uniqueExerciseIds are read inside for the one-shot
    // fold-away only; re-running on their every change would fight the user's
    // own expand/collapse taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFocusExerciseId, isRetro, simpleView, isInitialized])

  // ── Sync state to Convex (debounced) ──────────────────────────────────────
  const syncToConvex = useCallback(
    (options: { immediate?: boolean } = {}) => {
      // Retro sessions are never mirrored into `activeWorkouts`.
      if (isRetroRef.current) return
      if (abortingRef.current) return
      if (!isDirtyRef.current) return
      if (isSyncingRef.current) return

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
      setWorkoutSyncStatus("pending")

      syncTimeoutRef.current = setTimeout(
        async () => {
          if (abortingRef.current) return
          if (!isDirtyRef.current) return
          isSyncingRef.current = true
          syncTimeoutRef.current = null
          try {
            while (!abortingRef.current && isDirtyRef.current) {
              const syncVersion = dirtyVersionRef.current
              setWorkoutSyncStatus("saving")
              await updateActive({
                slot: slotRef.current,
                items: itemsRef.current,
                exerciseData: exDataRef.current,
                elapsedSeconds: elapsedRef.current,
              })
              if (dirtyVersionRef.current === syncVersion) {
                isDirtyRef.current = false
                setWorkoutSyncError("")
                setWorkoutSyncStatus("saved")
              } else {
                setWorkoutSyncStatus("pending")
              }
            }
          } catch (err) {
            logDevWarn("Failed to sync workout to Convex:", err)
            setWorkoutSyncError(
              "Your latest sets have not been saved yet. Check your connection and try again."
            )
            setWorkoutSyncStatus("error")
          } finally {
            isSyncingRef.current = false
          }
        },
        options.immediate ? 0 : 500
      ) // Debounce 500ms
    },
    [updateActive]
  )

  // ── Load from Convex or preset on mount ────────────────────────────────────
  useEffect(() => {
    if (isInitialized) return

    const loadWorkoutState = (
      loadedItems: WorkoutItem[],
      loadedExData: Record<string, ExerciseState>,
      startedAt?: number | null
    ) => {
      setIsInitialized(true)
      if (startedAt) setLocalStartedAt(startedAt)
      setItems(loadedItems)
      setExData(
        Object.fromEntries(
          Object.entries(loadedExData).map(([exerciseId, state]) => [
            exerciseId,
            normalizeExerciseState(state),
          ])
        )
      )

      const ids = loadedItems.flatMap((i) =>
        i.kind === "solo" ? [i.exerciseId] : i.exerciseIds
      )
      if (ids.length > 0) {
        void resolveExerciseIds(ids)
          .then((lookup) => {
            setExerciseLookup((prev) => ({
              ...prev,
              ...(lookup as Record<string, Exercise>),
            }))
          })
          .catch((error) => {
            logDevWarn("Failed to resolve active workout exercises", error)
          })
      }
    }

    // Reconstructing a past session: never read or resume live state.
    if (isRetro) {
      if (!retroDate || !retroSessionId) return
      // Wait for the day's logs so an edit hydrates rather than starting blank.
      if (retroDayLogs === undefined) return
      if (healthWorkoutParam && healthWorkout === undefined) return

      if (editingLog) {
        const loadedItems: WorkoutItem[] = []
        const loadedExData: Record<string, ExerciseState> = {}
        for (const logged of editingLog.exercises as LoggedWorkoutExercise[]) {
          loadedItems.push({ kind: "solo", exerciseId: logged.id })
          loadedExData[logged.id] = exerciseStateFromLoggedExercise(
            logged as Parameters<typeof exerciseStateFromLoggedExercise>[0]
          )
        }
        setRetroDuration(editingLog.durationSeconds ?? 0)
        setRetroCompletedAt(editingLog.completedAt ?? null)
        loadWorkoutState(loadedItems, loadedExData, null)
        return
      }

      // A local draft outranks the preset it came from: it is either work this
      // session already did and lost to a reload, or the numbers the abridged
      // preset logger collected before handing over.
      const retroDraft = retroDraftKey
        ? readActiveWorkoutDraft(slot, retroDraftKey)
        : null
      if (retroDraft && retroDraft.items.length > 0) {
        setRetroDuration(retroDraft.elapsedSeconds)
        loadWorkoutState(retroDraft.items, retroDraft.exerciseData, null)
        return
      }

      if (presetId && presets) {
        const match = presets.find((p) => (p.id ?? p._id) === presetId)
        if (match) {
          const presetItems = (match.items as WorkoutItem[]) ?? []
          const presetExData =
            (match.exerciseData as Record<string, ExerciseState>) ?? {}
          // The plan is the shape of the session; every set in it was done.
          loadWorkoutState(
            presetItems,
            Object.fromEntries(
              Object.entries(presetExData).map(([id, state]) => [
                id,
                {
                  ...state,
                  sets: (state.sets ?? []).map((set) => ({
                    ...set,
                    completed: true,
                  })),
                },
              ])
            ),
            null
          )
          return
        }
        if (presets === undefined) return
      }

      loadWorkoutState([], {}, null)
      return
    }

    // If there's an active workout in Convex, load it
    if (activeWorkout) {
      if (resumeDecision === "pending") {
        setResumePrompt({ source: "convex" })
        return
      }
      if (resumeDecision === "discard") return

      const loadedItems = (activeWorkout.items as WorkoutItem[]) ?? []
      const loadedExData =
        (activeWorkout.exerciseData as Record<string, ExerciseState>) ?? {}
      loadWorkoutState(loadedItems, loadedExData, activeWorkout.startedAt)
      return
    }

    const localDraft = readActiveWorkoutDraft(slot)
    if (localDraft && localDraft.items.length > 0) {
      if (resumeDecision === "pending") {
        setResumePrompt({ source: "local", draft: localDraft })
        return
      }
      if (resumeDecision === "resume") {
        loadWorkoutState(
          localDraft.items,
          localDraft.exerciseData,
          localDraft.startedAt
        )
        return
      }
    }

    // If no Convex state, try to load from preset
    if (presetId && presets) {
      const match = presets.find((p) => (p.id ?? p._id) === presetId)
      if (match) {
        const loadedItems = (match.items as WorkoutItem[]) ?? []
        const loadedExData =
          (match.exerciseData as Record<string, ExerciseState>) ?? {}
        loadWorkoutState(loadedItems, loadedExData, Date.now())
      }
    }
  }, [
    activeWorkout,
    editingLog,
    healthWorkout,
    healthWorkoutParam,
    isInitialized,
    isRetro,
    presetId,
    presets,
    resumeDecision,
    retroDate,
    retroDayLogs,
    retroDraftKey,
    retroSessionId,
    slot,
  ])

  // Seed the duration from the recorded session, then from an estimate. Both
  // are only a starting value — the save sheet shows it as an editable field
  // rather than letting the app quietly invent how long someone trained.
  useEffect(() => {
    if (!isRetro || !isInitialized) return
    if (retroDuration !== null) return
    if (healthWorkout?.durationSeconds) {
      setRetroDuration(Math.round(healthWorkout.durationSeconds))
      return
    }
    if (items.length > 0) {
      setRetroDuration(estimateRetroDurationSeconds(items, exData))
    }
  }, [isRetro, isInitialized, retroDuration, healthWorkout, items, exData])

  // Apple Health knows exactly when the session ended; otherwise midday on the
  // chosen date, which reads as "that day" without claiming a false clock time.
  useEffect(() => {
    if (!isRetro || retroCompletedAt !== null || !retroDate) return
    if (healthWorkoutParam && healthWorkout === undefined) return
    if (healthWorkout?.endedAt) {
      setRetroCompletedAt(healthWorkout.endedAt)
      return
    }
    setRetroCompletedAt(new Date(`${retroDate}T12:00:00`).getTime())
  }, [isRetro, retroCompletedAt, retroDate, healthWorkout, healthWorkoutParam])

  // ── Create active workout in Convex when items are loaded ─────────────────
  useEffect(() => {
    if (isRetro) return
    if (!isInitialized) return
    if (abortingRef.current) return
    if (items.length === 0) return
    if (activeWorkout) return // Already have an active workout

    const ids = items.flatMap((i) =>
      i.kind === "solo" ? [i.exerciseId] : i.exerciseIds
    )
    if (ids.length > 0) {
      safeSessionStorageRemove(ABORTED_WORKOUT_SLOT_KEY)
      void createActive({
        slot,
        presetId: presetId ?? undefined,
        items,
        exerciseData: exData,
      }).catch(reportOfflineMutationError)
    }
  }, [
    isRetro,
    isInitialized,
    items.length,
    activeWorkout,
    createActive,
    slot,
    presetId,
    items,
    exData,
  ])

  // ── Sync to Convex when state changes ─────────────────────────────────────
  useEffect(() => {
    if (!isInitialized) return
    syncToConvex()
  }, [isInitialized, items, exData, syncToConvex])

  // Sync elapsed time every 5 seconds
  useEffect(() => {
    if (!isInitialized) return
    if (elapsed % 5 !== 0) return // Only sync every 5 seconds for elapsed time
    syncToConvex()
  }, [isInitialized, elapsed, syncToConvex])

  useEffect(() => {
    if (isRetro) return
    // Gating on `isInitialized` as well used to mean an open workout built by
    // hand never got live status at all: nothing sets isInitialized when there
    // is no Convex row, local draft, or preset to load from. `items.length > 0`
    // is the condition that actually matters — it is only reachable after the
    // load effect ran or the user added an exercise themselves, so a session
    // still waiting on a resume decision (items still empty) is unaffected.
    if (items.length === 0) return
    // Android's ongoing notification is opt-out; iOS has no such setting, so
    // supportsLiveWorkoutStatusSetting() keeps the preference from suppressing
    // the Live Activity there.
    if (supportsLiveWorkoutStatusSetting() && !liveWorkoutStatusEnabled) {
      if (liveActivityStartedRef.current) {
        liveActivityStartedRef.current = false
        void endWorkoutLiveActivity(liveActivityState).catch(() => {})
      }
      return
    }
    if (!liveActivityStartedRef.current) {
      liveActivityStartedRef.current = true
      void startWorkoutLiveActivity(liveActivityState).catch((error) =>
        logDevWarn("Failed to start workout status", error)
      )
      return
    }
    void updateWorkoutLiveActivity(liveActivityState).catch((error) =>
      logDevWarn("Failed to update workout status", error)
    )
  }, [isRetro, items.length, liveActivityState, liveWorkoutStatusEnabled])

  useEffect(() => {
    if (!isInitialized) return
    const action = searchParams.get("liveAction")
    if (action === "complete") completeNextSet()
    if (action === "skipRest") rest.dismiss()
    if (action) {
      const next = new URLSearchParams(searchParams)
      next.delete("liveAction")
      setSearchParams(next, { replace: true })
    }
  }, [isInitialized, searchParams, setSearchParams])

  useEffect(() => {
    if (preferences?.weightUnit) {
      setUnit(preferences.weightUnit as WeightUnit)
    }
  }, [preferences])

  useEffect(() => {
    if (!isInitialized || abortingRef.current || items.length === 0) return
    const startedAt = activeWorkout?.startedAt ?? localStartedAt ?? Date.now()
    if (!localStartedAt && !activeWorkout?.startedAt) {
      setLocalStartedAt(startedAt)
    }
    writeActiveWorkoutDraft(
      {
        elapsedSeconds: elapsed,
        exerciseData: exData,
        items,
        presetId,
        savedAt: Date.now(),
        slot,
        startedAt,
      },
      retroDraftKey ?? undefined
    )
  }, [
    retroDraftKey,
    activeWorkout?.startedAt,
    elapsed,
    exData,
    isInitialized,
    items,
    localStartedAt,
    presetId,
    slot,
  ])

  useEffect(() => {
    if (isInitialized && !isRetro) {
      captureFeatureUsage(posthog, "workout_started", {
        has_preset: Boolean(presetId),
      })
    }
  }, [isInitialized, isRetro, presetId, posthog])

  /**
   * Turns a spoken or typed recap into exercises appended to the session.
   *
   * The action returns names, never catalog ids, so each one is resolved here
   * and anything unmatched is reported rather than dropped — a silently missing
   * exercise is worse than being told to add it by hand.
   */
  async function handleBrainDump(text: string) {
    if (brainDumpPending) return
    setBrainDumpPending(true)
    try {
      const draft = await draftLogFromText({ text, unit })
      if (draft.exercises.length === 0) {
        toast.error(draft.notes ?? "Nothing recognisable in that description.")
        return
      }

      const resolved = await Promise.all(
        draft.exercises.map(async (drafted) => {
          const candidates = await searchExercises({
            query: drafted.name,
            limit: 6,
          })
          return {
            drafted,
            exercise: pickBestExerciseMatch(drafted.name, candidates),
          }
        })
      )

      const matched = resolved.filter((entry) => entry.exercise)
      const unmatched = resolved
        .filter((entry) => !entry.exercise)
        .map((entry) => entry.drafted.name)

      if (matched.length > 0) {
        const nextLookup: Record<string, Exercise> = {}
        const nextData: Record<string, ExerciseState> = {}
        const nextItems: WorkoutItem[] = []
        for (const { drafted, exercise } of matched) {
          if (!exercise) continue
          nextLookup[exercise.id] = exercise
          nextData[exercise.id] = {
            ...makeDefaultExerciseState(exercise, true),
            sets: drafted.sets.map((set) => ({
              id: createClientId(),
              type: set.type,
              weight: set.weightKg > 0 ? String(set.weightKg) : "",
              reps: set.reps > 0 ? String(set.reps) : "",
              restSeconds: 120,
              completed: true,
            })),
          }
          nextItems.push({ kind: "solo", exerciseId: exercise.id })
        }
        setExerciseLookup((prev) => ({ ...prev, ...nextLookup }))
        setExData((prev) => ({ ...prev, ...nextData }))
        setItems((prev) => [
          ...prev,
          ...nextItems.filter(
            (item) =>
              item.kind === "solo" &&
              !prev.some(
                (existing) =>
                  existing.kind === "solo" &&
                  existing.exerciseId === item.exerciseId
              )
          ),
        ])
      }

      if (draft.durationMinutes && retroDuration === null) {
        setRetroDuration(draft.durationMinutes * 60)
      }

      if (unmatched.length > 0) {
        toast.error(
          `Could not find ${unmatched.join(", ")}. Add ${
            unmatched.length > 1 ? "them" : "it"
          } by hand.`
        )
      }
      if (matched.length > 0) setBrainDumpOpen(false)
    } catch (error) {
      logDevError("Failed to draft workout from text", error)
      toast.error(
        error instanceof Error && error.message.includes("limit")
          ? error.message
          : "Could not read that description. Try again or add sets by hand."
      )
    } finally {
      setBrainDumpPending(false)
    }
  }

  function openAiWorkoutSheet(target: AiWorkoutSheetTarget) {
    if (requireAiAccess(1, "workout_ai_sheet")) setAiSheetTarget(target)
  }

  async function resolveAiDraftExercises(
    draftExercises: AgentWorkoutExerciseDraft[]
  ) {
    return await Promise.all(
      draftExercises.map(async (draftExercise) => {
        const candidates = await searchExercises({
          query: draftExercise.name,
          limit: 6,
        })
        return {
          draftExercise,
          exercise: pickBestExerciseMatch(draftExercise.name, candidates),
        }
      })
    )
  }

  async function handleAskCoachForWorkout(
    text: string
  ): Promise<CoachWorkoutProposal> {
    if (!requireAiAccess(1, "workout_coach_ask")) throw new Error("Coach access is required.")
    if (!text.trim()) throw new Error("Tell Coach what you need first.")
    if (aiUpdatingRef.current || aiUpdating) {
      throw new Error("Coach is already working on your plan.")
    }

    aiUpdatingRef.current = true
    setAiUpdating(true)
    try {
      const activeExercises = uniqueExerciseIds.map((exerciseId) => {
        const exercise = exerciseLookup[exerciseId]
        const state = exData[exerciseId]
        return {
          id: exerciseId,
          name: exercise?.name ?? exerciseId,
          completedSets: state?.sets.filter((set) => set.completed).length ?? 0,
          sets: state?.sets ?? [],
        }
      })
      const result = await generateCoachPlan({
        context: coachContext,
        message: [
          "You are helping from the active-workout Ask Coach sheet.",
          `The user's request is: ${text.trim()}`,
          aiSheetTarget?.exerciseName
            ? `They opened Coach from ${aiSheetTarget.exerciseName}, so adapt that exercise while preserving a coherent session.`
            : "Build or adapt the full active session based on this request.",
          "Treat completed sets in the active workout as fixed work that must be preserved; only plan the remaining work around them.",
          // The server-built workspace covers everything durable; the live
          // session state below is the one thing only this device knows.
          `The active session so far (${Math.round(elapsed / 60)} minutes in): ${JSON.stringify(activeExercises)}`,
          "Use the same judgment, safety rules, memories, recovery check-ins, training history, goals, and routine context available in the main Coach.",
          "Return exactly one create_workout_preset operation containing the COMPLETE session that should replace the active workout after your recommendation. Do not schedule or save it as a preset. Keep the spoken reply concise and explain the main coaching decision.",
        ].join("\n"),
        history: [],
      })
      const response = result as { reply?: unknown; operations?: unknown }
      const operation = Array.isArray(response.operations)
        ? response.operations.find(
            (candidate) =>
              candidate &&
              typeof candidate === "object" &&
              "type" in candidate &&
              candidate.type === "create_workout_preset"
          )
        : undefined
      if (!operation || typeof operation !== "object") {
        throw new Error(
          "Coach needs a little more detail to turn that into a workout plan."
        )
      }

      const raw = operation as {
        name?: unknown
        exercises?: unknown
      }
      const draft: AgentWorkoutDraft = {
        name:
          typeof raw.name === "string" && raw.name.trim()
            ? raw.name.trim()
            : "Coach's workout",
        exercises: Array.isArray(raw.exercises)
          ? raw.exercises.filter(
              (exercise): exercise is AgentWorkoutExerciseDraft =>
                Boolean(
                  exercise &&
                  typeof exercise === "object" &&
                  "name" in exercise &&
                  typeof exercise.name === "string" &&
                  exercise.name.trim()
                )
            )
          : [],
      }

      if (!draft.exercises?.length) {
        throw new Error("Coach couldn't turn that into a usable exercise plan.")
      }

      captureFeatureUsage(posthog, "active_workout_coach_asked", {
        exercise_count: draft.exercises.length,
        has_active_workout: uniqueExerciseIds.length > 0,
        has_source_exercise: Boolean(aiSheetTarget?.exerciseName),
      })

      return {
        reply:
          typeof response.reply === "string" && response.reply.trim()
            ? response.reply.trim()
            : "I built this around your recent training and recovery. Review it before replacing the active session.",
        draft,
        mode: "replace",
      }
    } finally {
      aiUpdatingRef.current = false
      setAiUpdating(false)
    }
  }

  async function handleAiWorkoutChange(
    proposal: CoachWorkoutProposal
  ): Promise<void> {
    if (!requireAiAccess(1, "workout_ai_apply")) return
    if (aiUpdatingRef.current || aiUpdating) return

    aiUpdatingRef.current = true
    setAiUpdating(true)
    try {
      const { draft, mode } = proposal
      const draftExercises = (draft.exercises ?? []).filter((exercise) =>
        exercise.name?.trim()
      )

      if (draftExercises.length === 0) {
        throw new Error("I couldn't find any exercises in that request.")
      }

      const resolved = await resolveAiDraftExercises(draftExercises)
      const unmatched: string[] = []

      if (mode === "swap") {
        const targetId = aiSheetTarget?.exerciseId
        if (!targetId) throw new Error("Pick an exercise to change first.")

        const match = resolved.find((item) => item.exercise)
        if (!match?.exercise) {
          throw new Error("I couldn't match that swap to the exercise catalog.")
        }

        const exercise = match.exercise
        const duplicateIds = new Set(
          uniqueExerciseIds.filter((id) => id !== targetId)
        )
        if (duplicateIds.has(exercise.id)) {
          throw new Error(`${exercise.name} is already in this workout.`)
        }

        const nextState = makeExerciseStateFromAgentDraft(
          exercise,
          match.draftExercise
        )

        setExerciseLookup((prev) => ({ ...prev, [exercise.id]: exercise }))
        setItems((prev) => replaceExerciseInItems(prev, targetId, exercise.id))
        setExData((prev) => {
          const next = { ...prev }
          if (exercise.id !== targetId) delete next[targetId]
          next[exercise.id] = nextState
          return next
        })
        setCollapsed((prev) => {
          if (exercise.id === targetId) return prev
          const next = { ...prev }
          delete next[targetId]
          return next
        })

        captureFeatureUsage(posthog, "active_workout_ai_changed", {
          mode,
          matched_count: 1,
          unmatched_count: resolved.length - 1,
        })
        toast.success(`Changed to ${exercise.name}`)
        return
      }

      const existingIds = new Set(mode === "append" ? uniqueExerciseIds : [])
      const seenIds = new Set<string>()
      const nextItems: WorkoutItem[] = []
      const nextExerciseData: Record<string, ExerciseState> = {}
      const nextExerciseLookup: Record<string, Exercise> = {}

      for (const match of resolved) {
        const exercise = match.exercise
        if (!exercise) {
          unmatched.push(match.draftExercise.name)
          continue
        }
        if (seenIds.has(exercise.id) || existingIds.has(exercise.id)) continue

        seenIds.add(exercise.id)
        nextItems.push({ kind: "solo", exerciseId: exercise.id })
        const generatedState = makeExerciseStateFromAgentDraft(
          exercise,
          match.draftExercise
        )
        const currentState =
          mode === "replace" ? exData[exercise.id] : undefined
        const completedSets = currentState?.sets.filter((set) => set.completed)
        nextExerciseData[exercise.id] =
          completedSets && completedSets.length > 0
            ? {
                ...generatedState,
                sets: [
                  ...completedSets,
                  ...generatedState.sets.slice(completedSets.length),
                ],
              }
            : generatedState
        nextExerciseLookup[exercise.id] = exercise
      }

      if (mode === "replace") {
        const completedExerciseIds = uniqueExerciseIds.filter((exerciseId) => {
          const exercise = exerciseLookup[exerciseId]
          const state = exData[exerciseId]
          return exercise?.category === "cardio"
            ? Boolean(state && hasCardioStateDetails(state.cardio))
            : Boolean(state?.sets.some((set) => set.completed))
        })
        const missingCompletedIds = completedExerciseIds.filter(
          (exerciseId) => !seenIds.has(exerciseId)
        )
        if (missingCompletedIds.length > 0) {
          nextItems.unshift(
            ...missingCompletedIds.map((exerciseId): WorkoutItem => ({
              kind: "solo",
              exerciseId,
            }))
          )
          for (const exerciseId of missingCompletedIds) {
            nextExerciseData[exerciseId] = exData[exerciseId]
            nextExerciseLookup[exerciseId] = exerciseLookup[exerciseId]
          }
        }
      }

      if (nextItems.length === 0) {
        throw new Error(
          mode === "append"
            ? "Those exercises are already in this workout."
            : "I couldn't match those exercises to the catalog."
        )
      }

      if (mode === "replace") {
        setItems(nextItems)
        setExData(nextExerciseData)
        setExerciseLookup(nextExerciseLookup)
        setCollapsed({})
        rest.dismiss()
      } else {
        setItems((prev) => [...prev, ...nextItems])
        setExData((prev) => ({ ...prev, ...nextExerciseData }))
        setExerciseLookup((prev) => ({ ...prev, ...nextExerciseLookup }))
      }

      captureFeatureUsage(posthog, "active_workout_ai_changed", {
        mode,
        matched_count: nextItems.length,
        unmatched_count: unmatched.length,
      })

      toast.success(
        unmatched.length > 0
          ? `Added ${nextItems.length} exercises. ${unmatched.length} couldn't be matched.`
          : mode === "replace"
            ? `Rebuilt workout with ${nextItems.length} exercises`
            : `Added ${nextItems.length} exercises`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update workout"
      )
    } finally {
      aiUpdatingRef.current = false
      setAiUpdating(false)
    }
  }

  function addExercise(ex: Exercise) {
    const id = ex.id
    setExerciseLookup((prev) => ({ ...prev, [id]: ex }))
    setItems((prev) => [...prev, { kind: "solo", exerciseId: id }])
    setExData((prev) => ({
      ...prev,
      [id]: makeDefaultExerciseState(ex, isRetro),
    }))
  }
  function removeExercise(id: string) {
    setItems((prev) => removeExFromItems(prev, id))
    setExData((prev) => {
      const n = { ...prev }
      delete n[id]
      return n
    })
  }
  function requestRemoveExercise(id: string) {
    setConfirmRemove({
      exerciseId: id,
      name: exerciseLookup[id]?.name ?? "this exercise",
    })
  }
  function openExerciseDetail(id: string) {
    hapticSelection()
    setInfoSheet({
      exerciseId: id,
      name: exerciseLookup[id]?.name ?? "Exercise",
    })
  }
  /** Manual counterpart to the AI swap: same slot, fresh sets. */
  function swapExercise(targetId: string, ex: Exercise) {
    if (ex.id !== targetId && uniqueExerciseIds.includes(ex.id)) {
      toast.error(`${ex.name} is already in this workout.`)
      return
    }
    setExerciseLookup((prev) => ({ ...prev, [ex.id]: ex }))
    setItems((prev) => replaceExerciseInItems(prev, targetId, ex.id))
    setExData((prev) => {
      const next = { ...prev }
      if (ex.id !== targetId) delete next[targetId]
      next[ex.id] = makeDefaultExerciseState(ex, isRetro)
      return next
    })
    setCollapsed((prev) => {
      if (ex.id === targetId) return prev
      const next = { ...prev }
      delete next[targetId]
      return next
    })
    setSwapTarget(null)
    toast.success(`Swapped to ${ex.name}`)
  }
  function updateExData(id: string, data: ExerciseState) {
    setExData((prev) => ({ ...prev, [id]: data }))
  }
  function toggleCollapsed(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }
  function moveItemByStep(itemKey: string, direction: -1 | 1) {
    captureReorderPositions()
    setItems((previous) => {
      const from = previous.findIndex(
        (item) => workoutItemKey(item) === itemKey
      )
      return moveArrayItemByStep(previous, from, direction)
    })
    hapticSelection()
  }
  function calcDropTarget(
    x: number,
    y: number,
    draggedKey: string
  ): DropTarget {
    for (const [targetKey, el] of itemRefs.current) {
      if (targetKey === draggedKey) continue
      const rect = el.getBoundingClientRect()
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
        continue
      const relY = (y - rect.top) / rect.height
      if (relY >= 0.28 && relY <= 0.72) {
        return { type: "superset", targetKey }
      }
      return relY < 0.5
        ? { type: "before", targetKey }
        : { type: "after", targetKey }
    }
    return null
  }
  useEffect(() => {
    if (!drag) return
    const currentDrag = drag
    function handlePointerMove(event: PointerEvent) {
      setDrag((prev) => {
        if (!prev) return prev
        const moved =
          prev.active ||
          Math.hypot(event.clientX - prev.startX, event.clientY - prev.startY) >
            6
        return {
          ...prev,
          x: event.clientX,
          y: event.clientY,
          active: moved,
        }
      })
      const movedX = event.clientX
      const movedY = event.clientY
      setDropTarget(calcDropTarget(movedX, movedY, currentDrag.itemKey))
    }
    function handlePointerEnd() {
      if (currentDrag.active && dropTarget) {
        executeDrop(currentDrag.itemKey, dropTarget)
      }
      setDrag(null)
      setDropTarget(null)
    }
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerEnd)
    window.addEventListener("pointercancel", handlePointerEnd)
    document.body.style.userSelect = "none"
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerEnd)
      window.removeEventListener("pointercancel", handlePointerEnd)
      document.body.style.userSelect = ""
    }
    // executeDrop is intentionally refreshed as drag/drop state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureReorderPositions, drag, dropTarget])

  function makeDragHandlers(
    itemKey: string
  ): React.HTMLAttributes<HTMLDivElement> {
    return {
      onPointerDown(event) {
        event.preventDefault()
        event.stopPropagation()
        setDrag({
          itemKey,
          x: event.clientX,
          y: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
        })
      },
    }
  }

  function breakOutExercise(exerciseId: string) {
    captureReorderPositions()
    setItems((previous) => [
      ...removeExFromItems(previous, exerciseId),
      { kind: "solo" as const, exerciseId },
    ])
    hapticSelection()
  }

  function executeDrop(draggedKey: string, zone: DropTarget) {
    if (!zone) return

    captureReorderPositions()
    setItems((prev) => {
      const fromIdx = prev.findIndex(
        (item) => workoutItemKey(item) === draggedKey
      )
      if (fromIdx === -1) return prev

      const draggedItem = prev[fromIdx]
      const nextItems = prev.filter((_, index) => index !== fromIdx)
      const targetIdx = nextItems.findIndex(
        (item) => workoutItemKey(item) === zone.targetKey
      )
      if (targetIdx === -1) return prev

      if (zone.type === "superset") {
        const targetItem = nextItems[targetIdx]
        const draggedIds =
          draggedItem.kind === "solo"
            ? [draggedItem.exerciseId]
            : draggedItem.exerciseIds
        const targetIds =
          targetItem.kind === "solo"
            ? [targetItem.exerciseId]
            : targetItem.exerciseIds
        const merged: WorkoutItem = {
          kind: "superset",
          id: targetItem.kind === "superset" ? targetItem.id : uid(),
          color: targetItem.kind === "superset" ? targetItem.color : "#ffffff",
          exerciseIds: [...targetIds, ...draggedIds],
        }
        return [
          ...nextItems.slice(0, targetIdx),
          merged,
          ...nextItems.slice(targetIdx + 1),
        ]
      }

      const insertAt = zone.type === "before" ? targetIdx : targetIdx + 1
      return [
        ...nextItems.slice(0, insertAt),
        draggedItem,
        ...nextItems.slice(insertAt),
      ]
    })
  }

  /**
   * Mirrors the finished session into Apple Health / Health Connect.
   *
   * Strictly best-effort and opt-in: a refused or failed health write must
   * never surface to someone who has just finished a workout, and the training
   * log is already saved by the time this runs.
   */
  async function writeSessionToHealth(exerciseCount: number) {
    if (!healthWriteEnabled) return
    const startedAt = activeWorkout?.startedAt ?? localStartedAt
    if (!startedAt) return
    const endedAt = Date.now()
    if (endedAt <= startedAt) return

    try {
      await saveWorkoutToHealth({
        startedAt,
        endedAt,
        title:
          exerciseCount > 0
            ? `OneRep · ${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}`
            : "OneRep workout",
      })
    } catch (error) {
      logDevWarn("Failed to save the workout to the health store", error)
    }
  }

  async function handleFinish() {
    // Retain this ID across the direct attempt and offline fallback. If the
    // network resolves late, Convex will upsert the same session instead of
    // creating a duplicate completion.
    const completionSessionId = activeWorkout?._id
      ? String(activeWorkout._id)
      : `local:${slot}:${localStartedAt ?? Date.now()}`
    const exercises = items.flatMap((item) => {
      const ids = item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
      return ids.flatMap((id) => {
        const ex = exerciseLookup[id]
        const data = exData[id]
        if (!ex || !data) return []
        const isCardio = ex.category === "cardio"
        const cardio = isCardio ? cardioLogFromState(data.cardio) : null
        const sets = isCardio
          ? []
          : data.sets
              .filter((s) => s.completed)
              .map((s) => ({
                type: "normal",
                weight: parseFloat(String(s.weight)) || 0,
                reps: parseFloat(String(s.reps)) || 0,
                completed: s.completed,
              }))
        return [
          {
            id,
            name: ex.name,
            category: ex.category,
            sets,
            ...(cardio ? { cardio } : {}),
          },
        ]
      })
    })
    // A reconstructed session is written straight to the log. `finishActive`
    // derives the date server-side in UTC, which would silently misfile it.
    if (isRetro) {
      try {
        await logCompletion({
          date: retroDate,
          sessionId: retroSessionId,
          slot,
          exercises,
          durationSeconds: elapsed,
          ...(retroCompletedAt === null
            ? {}
            : { completedAt: retroCompletedAt }),
        })
        if (healthWorkout && !healthWorkout.linked) {
          // Best effort: the log is already saved, and a missing link only
          // means the nudge offers this session again.
          await attachHealthWorkout({
            id: healthWorkout._id,
            sessionId: retroSessionId,
            date: retroDate,
          }).catch(reportOfflineMutationError)
        }
        captureFeatureUsage(posthog, "workout_logged_retro", {
          mode: retroMode,
          source: healthWorkoutParam
            ? "apple_health"
            : presetId
              ? "preset"
              : "manual",
          item_count: exercises.length,
        })
        if (retroDraftKey) clearActiveWorkoutDraft(slot, retroDraftKey)
        celebrateAchievement("workout")
        window.setTimeout(() => navigate(-1), 450)
      } catch (err) {
        logDevError("Failed to log past workout:", err)
        toast.error(
          err instanceof Error && err.message.includes("two sessions")
            ? "Two sessions are already logged that day. Edit one instead."
            : "Could not save that workout. Please try again."
        )
        throw err
      }
      return
    }

    try {
      // Finish the active workout in Convex (this also logs it)
      await finishActive({
        slot,
        exercises,
        durationSeconds: elapsed,
      })
      captureFeatureUsage(posthog, "workout_completed", {
        has_preset: Boolean(presetId),
        duration_bucket: durationBucket(elapsed),
        item_count: exercises.length,
      })
      clearActiveWorkoutDraft(slot)
      void endWorkoutLiveActivity(liveActivityState)
      void writeSessionToHealth(exercises.length)
      celebrateAchievement("workout")
      window.setTimeout(() => navigate(-1), 450)
    } catch (err) {
      logDevError("Failed to finish workout:", err)
      // Fallback to old method if Convex fails
      try {
        await logCompletion({
          date: todayIso(),
          sessionId: completionSessionId,
          slot,
          exercises,
          durationSeconds: elapsed,
        })
        clearActiveWorkoutDraft(slot)
        void endWorkoutLiveActivity(liveActivityState)
        void writeSessionToHealth(exercises.length)
        celebrateAchievement("workout")
        window.setTimeout(() => navigate(-1), 450)
      } catch (fallbackErr) {
        logDevError("Failed to log workout as fallback:", fallbackErr)
        toast.error("Failed to finish workout. Please try again.")
        throw fallbackErr
      }
    }
  }

  function cardProps(
    itemKey: string,
    inSuperset = false
  ): ExerciseCardDropProps {
    const dt = dropTarget
    const isTarget = dt?.targetKey === itemKey
    if (inSuperset)
      return {
        dropActive: false,
        supersetDropActive: false,
      }
    return {
      dropActive: Boolean(
        isTarget && (dt?.type === "before" || dt?.type === "after")
      ),
      dropPosition:
        isTarget && (dt?.type === "before" || dt?.type === "after")
          ? dt.type
          : undefined,
      supersetDropActive: Boolean(isTarget && dt?.type === "superset"),
    }
  }

  function completeNextSet() {
    if (nextTarget?.kind !== "set") {
      hapticSelection()
      if (totalSets > 0) setConfirmFinish(true)
      else setSearchOpen(true)
      return
    }

    const currentData = exData[nextTarget.exerciseId]
    const currentSet = currentData?.sets[nextTarget.setIndex]
    if (!currentData || !currentSet) return

    updateExData(nextTarget.exerciseId, {
      ...currentData,
      sets: currentData.sets.map((set, index) =>
        index === nextTarget.setIndex ? { ...set, completed: true } : set
      ),
    })
    const pulseKey = `${nextTarget.exerciseId}:${nextTarget.setIndex}`
    setCompletedPulseKey(pulseKey)
    window.setTimeout(() => {
      setCompletedPulseKey((current) => (current === pulseKey ? null : current))
    }, 520)
    hapticMedium()
    if (!currentSet.completed && currentSet.restSeconds > 0) {
      startRest(currentSet.restSeconds)
    }
  }

  function goToActiveSet() {
    if (!nextTarget || !activeWorkoutItem) return
    setCollapsed((previous) => ({
      ...previous,
      [nextTarget.exerciseId]: false,
    }))
    const itemKey = workoutItemKey(activeWorkoutItem)
    const element = itemRefs.current.get(itemKey)
    if (!element) return
    hapticSelection()
    element.scrollIntoView({ behavior: "smooth", block: "center" })
    window.requestAnimationFrame(() => element.focus({ preventScroll: true }))
  }

  function dismissSupersetTip() {
    setShowSupersetTip(false)
    window.localStorage.setItem("onerep:active-superset-tip-hidden", "1")
  }

  // Two sessions is the cap a date can hold, and `getLog` only ever reads two.
  // Reaching this state means every entry point should have offered "edit"
  // instead of "create", so say so and offer the real options rather than
  // letting the user build a workout that cannot be saved.
  if (isRetro && retroMode === "create" && retroFreeSlot === null) {
    return (
      <div className="desktop-canvas flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-8 text-center">
        <h1 className="text-[20px] font-semibold tracking-tight">
          {formatRetroDateLabel(retroDate)} is full
        </h1>
        <p className="max-w-xs text-[14px] leading-relaxed text-muted-foreground">
          Two sessions are already logged that day. Open one to add what you
          did.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2">
          {(retroDayLogs ?? []).map((log, index) => (
            <button
              key={log._id}
              type="button"
              onClick={() =>
                navigate(
                  `/workout/log/${retroDate}?sessionId=${encodeURIComponent(
                    log.sessionId ?? ""
                  )}`,
                  { motion: "forward", replace: true }
                )
              }
              className="motion-tactile h-[52px] w-full rounded-[20px] bg-muted/60 text-[15px] font-semibold transition-opacity active:opacity-80"
            >
              Edit workout {log.slot ?? index + 1}
            </button>
          ))}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="motion-tactile h-[52px] w-full rounded-[20px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="desktop-canvas min-h-svh bg-background [scrollbar-gutter:stable] md:px-8"
      style={{ viewTransitionName: "active-workout" }}
    >
      {achievementMessage && (
        <div
          className="workout-achievement-pill"
          role="status"
          aria-live="polite"
        >
          <CheckCircle size={18} weight="fill" aria-hidden="true" />
          {achievementMessage}
        </div>
      )}
      <div className="mx-auto flex w-full max-w-2xl flex-col pb-[calc(var(--app-safe-bottom-lg)+7rem)] md:pb-12">
        {!simpleViewActive && (
        <header className="active-workout-header-enter workout-live-header sticky top-0 z-30 border-b border-border bg-background/95 px-[var(--app-page-x)] backdrop-blur-xl md:px-0">
          <div
            className="flex items-center gap-2"
            style={{
              paddingTop:
                "max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))",
              paddingBottom: "0.65rem",
            }}
          >
            <button
              type="button"
              aria-label="Discard or leave workout"
              onClick={() => setConfirmAbort(true)}
              className="motion-tactile inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-transparent text-muted-foreground active:text-foreground"
            >
              <X size={22} weight="bold" />
            </button>
            {!isRetro && (
              <button
                type="button"
                aria-label={
                  simpleView
                    ? "Switch to expanded view"
                    : "Switch to simple view"
                }
                aria-pressed={simpleView}
                onClick={() => {
                  hapticSelection()
                  const next = !simpleView
                  setSimpleView(next)
                  safeLocalStorageSet(SIMPLE_VIEW_KEY, String(next))
                }}
                className="motion-tactile inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-transparent text-muted-foreground active:text-foreground"
              >
                {simpleView ? (
                  <Rows size={20} weight="bold" />
                ) : (
                  <Square size={20} weight="bold" />
                )}
              </button>
            )}
            <div
              className={cn(
                "min-w-0 flex-1 text-center transition-opacity duration-300",
                // The notch pill floats exactly here while resting; the header
                // readout yields rather than showing through behind it.
                !isRetro &&
                  simpleView &&
                  rest.remaining !== null &&
                  "opacity-0"
              )}
            >
              <p className="text-[12px] font-semibold text-muted-foreground">
                {isRetro
                  ? retroMode === "edit"
                    ? "Editing"
                    : "Logging"
                  : simpleView
                    ? "Elapsed"
                    : rest.remaining !== null
                      ? "Rest"
                      : "Elapsed"}
              </p>
              <p
                key={
                  isRetro
                    ? "retro"
                    : !simpleView && rest.remaining !== null
                      ? "rest"
                      : "workout"
                }
                className={cn(
                  "active-workout-timer-mode mt-1 leading-none font-semibold tracking-tight tabular-nums",
                  isRetro
                    ? "text-[1.5rem] md:text-[1.75rem]"
                    : "text-[2rem] md:text-[2.25rem]"
                )}
              >
                {isRetro
                  ? formatRetroDateLabel(retroDate)
                  : simpleView && rest.remaining !== null
                    ? formatElapsed(elapsed)
                    : formatElapsed(rest.remaining ?? elapsed)}
              </p>
            </div>
            {isRetro ? (
              <button
                type="button"
                onClick={() => setBrainDumpOpen(true)}
                aria-label="Describe your workout"
                className="motion-tactile inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-muted px-3 text-[13px] font-semibold text-foreground"
              >
                <Sparkle size={16} weight="bold" />
                Describe
              </button>
            ) : !simpleView && rest.remaining !== null ? (
              <button
                onClick={rest.dismiss}
                className="motion-tactile h-11 shrink-0 rounded-xl bg-muted px-4 text-[13px] font-extrabold text-foreground"
              >
                Skip
              </button>
            ) : (
              <button
                onClick={completeNextSet}
                className={cn(
                  "motion-tactile min-h-11 shrink-0 rounded-xl px-4 text-[13px] font-semibold transition-colors",
                  nextTarget?.kind === "set"
                    ? "border border-border bg-card text-foreground"
                    : totalSets > 0
                      ? "bg-foreground text-background"
                      : "border border-border bg-card text-foreground"
                )}
              >
                {nextTarget?.kind === "set"
                  ? "Complete set"
                  : totalSets > 0
                    ? "Finish"
                    : "Add"}
              </button>
            )}
            <div
              className="flex h-11 shrink-0 overflow-hidden rounded-lg border border-border text-[13px] font-semibold"
              role="group"
              aria-label="Weight unit"
            >
              {(["kg", "lbs"] as WeightUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  aria-pressed={unit === u}
                  className={cn(
                    "motion-tactile min-w-10 px-2.5 md:min-w-12 md:px-3",
                    unit === u
                      ? "bg-foreground text-background"
                      : "text-muted-foreground active:bg-muted active:text-foreground"
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <section
            className={cn(
              "border-t border-border/60 py-3",
              completedPulseKey && "motion-success-pop"
            )}
          >
            <div className="flex items-center gap-3">
              {workoutSyncStatus === "error" && (
                <button
                  type="button"
                  onClick={() => syncToConvex({ immediate: true })}
                  className="motion-tactile min-h-11 shrink-0 rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 text-[13px] font-extrabold text-destructive"
                  aria-label="Save workout again"
                >
                  Retry
                </button>
              )}
              <div
                className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Workout completion"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0
                }
              >
                <div
                  className="motion-progress-fill h-full rounded-full bg-primary/55"
                  style={{ width: progressPct }}
                />
              </div>
              <span className="shrink-0 text-[13px] font-medium text-muted-foreground tabular-nums">
                {progressPct}
              </span>
            </div>
            <div className="mt-2 flex min-w-0 items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground">
              <button
                type="button"
                onClick={goToActiveSet}
                disabled={!nextTarget}
                aria-label={
                  nextTarget
                    ? `Go to active set: ${activeExerciseName}, ${activeSetContext}`
                    : undefined
                }
                className="min-w-0 truncate active:text-foreground disabled:pointer-events-none"
              >
                {uniqueExerciseIds.length > 0
                  ? `${activeExerciseIndex}/${uniqueExerciseIds.length} · ${nextSetLabel}`
                  : "Active workout"}
              </button>
              {slot === 2 && (
                <span className="shrink-0 text-[13px] text-muted-foreground">
                  Second workout
                </span>
              )}
              {workoutSyncStatus !== "idle" && (
                <span
                  role="status"
                  aria-live="polite"
                  title={workoutSyncError || undefined}
                  className={cn(
                    "shrink-0 text-[13px]",
                    workoutSyncStatus === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {workoutSyncLabel}
                </span>
              )}
            </div>
          </section>
        </header>
        )}

        {!isRetro && (
          <NotchRestTimer
            remaining={simpleViewActive ? null : rest.remaining}
            duration={restDuration}
            onSkip={rest.dismiss}
          />
        )}
        {/* The coach between sets, live sessions only. The retro logger is
            bookkeeping about the past and gets no spotter. */}
        {!isRetro && (
          <>
            <button
              type="button"
              aria-label={coachMenuOpen ? "Close coach menu" : "Ask your coach"}
              aria-expanded={coachMenuOpen}
              aria-busy={aiUpdating}
              data-open={coachMenuOpen ? "true" : "false"}
              onClick={() => {
                hapticSelection()
                setCoachMenuOpen((value) => !value)
              }}
              className="coach-fab-trigger motion-tactile fixed right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(var(--app-safe-bottom-lg)+4.75rem)] z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-[0_8px_22px_rgba(0,0,0,0.26)]"
            >
              {coachMenuOpen ? (
                <X size={17} weight="bold" />
              ) : (
                <Sparkle size={19} weight="fill" />
              )}
            </button>
            {coachMenuOpen && (
              <WorkoutCoachMenu
                formCoachLabel={
                  focusMovement && activeExerciseName ? activeExerciseName : null
                }
                onClose={() => setCoachMenuOpen(false)}
                onChoose={(choice) => {
                  setCoachMenuOpen(false)
                  if (choice === "form") {
                    if (!focusMovement || !focusExerciseId) return
                    void hapticTap()
                    startFormCoachDraft({
                      exerciseId: focusExerciseId,
                      exerciseName: activeExerciseName,
                      slug: focusMovement.slug,
                    })
                    return
                  }
                  setCoachChatOpen(true)
                }}
              />
            )}
            {coachChatOpen && (
              <CoachSheet
                onClose={() => setCoachChatOpen(false)}
                activeWorkout={{
                  summary: liveSessionSummary,
                  applying: aiUpdating,
                  onApply: async (draft) => {
                    await handleAiWorkoutChange({
                      reply: "",
                      draft,
                      mode: "replace",
                    })
                  },
                }}
              />
            )}
            <InWorkoutCoach
              open={coachSheetOpen}
              onClose={() => setCoachSheetOpen(false)}
              slot={slot}
            />
          </>
        )}
        {simpleViewActive ? (
          <FocusWorkoutView
            exerciseName={activeExerciseName}
            set={focusSet}
            allSets={focusState?.sets}
            setNumber={activeSetNumber}
            setCount={focusState?.sets.length ?? 0}
            unit={unit}
            barWeight={focusState?.barWeight ?? ""}
            barType={focusState?.barType ?? "olympic"}
            isCardio={nextTarget?.kind === "cardio"}
            isResting={rest.remaining !== null}
            restRemaining={rest.remaining ?? 0}
            restDuration={restDuration ?? 0}
            doneSets={doneSets}
            totalSets={totalSets}
            nextExerciseName={upcomingExercise?.name ?? ""}
            lastSession={
              focusExerciseId ? (lastSessionMap[focusExerciseId] ?? null) : null
            }
            onUpdateSet={updateFocusSet}
            onCompleteSet={completeNextSet}
            onSkipRest={rest.dismiss}
            onAddSet={addFocusSet}
            onSkipSet={skipFocusSet}
            onExpand={() => {
              hapticSelection()
              setSimpleView(false)
              safeLocalStorageSet(SIMPLE_VIEW_KEY, "false")
            }}
            onEnd={() => setConfirmAbort(true)}
          />
        ) : (
        <main className="flex flex-col gap-5 px-[var(--app-page-x)] pt-5 md:px-0 md:pt-7">
          <div className="active-workout-list-enter flex flex-col gap-5 md:gap-6">
            {items.length > 0 && !simpleViewActive && (
              <ExerciseReorderToolbar
                active={reorderMode}
                count={uniqueExerciseIds.length}
                onToggle={() => setReorderMode((value) => !value)}
              />
            )}
            {showSupersetTip && !simpleViewActive && uniqueExerciseIds.length > 1 && (
              <div className="flex items-center gap-2 rounded-xl border border-border/55 bg-card px-3 py-2.5 text-muted-foreground/70 shadow-sm">
                <DotsSixVertical
                  size={15}
                  weight="bold"
                  className="shrink-0 text-foreground/65"
                />
                <p className="min-w-0 flex-1 text-[13px] leading-5 font-medium">
                  Drag one exercise onto another to make a superset.
                </p>
                <button
                  type="button"
                  onClick={dismissSupersetTip}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors active:bg-muted active:text-foreground"
                  aria-label="Hide superset tip"
                >
                  <X size={12} weight="bold" />
                </button>
              </div>
            )}
            {visibleItems.map((item, itemIndex) => {
              if (item.kind === "solo") {
                const ex = exerciseLookup[item.exerciseId]
                if (!ex || !exData[item.exerciseId]) return null
                const key = workoutItemKey(item)
                return (
                  <ActiveExerciseCard
                    key={item.exerciseId}
                    exercise={ex}
                    data={exData[item.exerciseId]}
                    unit={unit}
                    onUpdate={(d) => updateExData(item.exerciseId, d)}
                    onRemove={() => requestRemoveExercise(item.exerciseId)}
                    onSwap={() => setSwapTarget(item.exerciseId)}
                    onOpenDetail={() => openExerciseDetail(item.exerciseId)}
                    isDragging={drag?.itemKey === key && drag.active}
                    {...cardProps(key)}
                    collapsed={
                      simpleViewActive
                        ? false
                        : Boolean(collapsed[item.exerciseId])
                    }
                    onToggleCollapse={() => toggleCollapsed(item.exerciseId)}
                    dragHandlers={makeDragHandlers(key)}
                    cardRef={(el) => {
                      if (el) itemRefs.current.set(key, el)
                      else itemRefs.current.delete(key)
                    }}
                    onStartRest={startRest}
                    defaultSetCompleted={isRetro}
                    lastSession={lastSessionMap[item.exerciseId] ?? null}
                    onShowHistory={() =>
                      setHistorySheet({
                        exerciseId: item.exerciseId,
                        name: ex.name,
                      })
                    }
                    onAiChange={() =>
                      openAiWorkoutSheet({
                        exerciseId: item.exerciseId,
                        exerciseName: ex.name,
                      })
                    }
                    nextSetIndex={
                      nextTarget?.kind === "set" &&
                      nextTarget.exerciseId === item.exerciseId
                        ? nextTarget.setIndex
                        : null
                    }
                    isNextCardio={
                      nextTarget?.kind === "cardio" &&
                      nextTarget.exerciseId === item.exerciseId
                    }
                    reorderControls={
                      reorderMode ? (
                        <ExerciseMoveControls
                          label={ex.name}
                          canMoveUp={itemIndex > 0}
                          canMoveDown={itemIndex < items.length - 1}
                          onMoveUp={() => moveItemByStep(key, -1)}
                          onMoveDown={() => moveItemByStep(key, 1)}
                        />
                      ) : undefined
                    }
                  />
                )
              }
              return renderSupersetItem(
                item,
                exData,
                unit,
                updateExData,
                requestRemoveExercise,
                drag,
                dropTarget,
                simpleViewActive ? EMPTY_COLLAPSED : collapsed,
                toggleCollapsed,
                (exerciseIds) => {
                  const shouldCollapse = !exerciseIds.every(
                    (exerciseId) =>
                      simpleViewActive ? false : collapsed[exerciseId]
                  )
                  setCollapsed((previous) => ({
                    ...previous,
                    ...Object.fromEntries(
                      exerciseIds.map((exerciseId) => [
                        exerciseId,
                        shouldCollapse,
                      ])
                    ),
                  }))
                },
                makeDragHandlers,
                itemRefs,
                startRest,
                exerciseLookup,
                lastSessionMap,
                (exId, name) => setHistorySheet({ exerciseId: exId, name }),
                (exId, name) =>
                  openAiWorkoutSheet({ exerciseId: exId, exerciseName: name }),
                (exId) => setSwapTarget(exId),
                openExerciseDetail,
                breakOutExercise,
                nextTarget,
                reorderMode,
                itemIndex,
                items.length,
                moveItemByStep,
                isRetro
              )
            })}
            {simpleViewActive &&
              (upcomingItem && upcomingExercise ? (
                <button
                  type="button"
                  onClick={() => {
                    hapticSelection()
                    setSimpleView(false)
                    safeLocalStorageSet(SIMPLE_VIEW_KEY, "false")
                  }}
                  aria-label={`Next up: ${upcomingExercise.name}. Show the whole workout`}
                  className="motion-tactile -mt-2 flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card/45 px-4 py-3.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-muted-foreground">
                      Next up
                    </p>
                    <p className="mt-0.5 truncate text-[15px] font-semibold">
                      {upcomingExercise.name}
                    </p>
                  </div>
                  {upcomingDetail && (
                    <span className="shrink-0 text-[13px] text-muted-foreground">
                      {upcomingDetail}
                    </span>
                  )}
                  <CaretDown
                    size={14}
                    weight="bold"
                    className="shrink-0 text-muted-foreground"
                  />
                </button>
              ) : (
                uniqueExerciseIds.length > 1 && (
                  <p className="-mt-1 text-center text-[13px] text-muted-foreground">
                    Last exercise of the session.
                  </p>
                )
              ))}
          </div>
          {items.length === 0 ? (
            <section className="border-y border-border py-8 text-center">
              <h2 className="text-[18px] font-semibold">Build this workout</h2>
              <p className="mx-auto mt-2 max-w-sm text-[15px] leading-6 text-muted-foreground">
                Add an exercise to start logging sets, weight, reps, and rest.
              </p>
              <button
                onClick={() => setSearchOpen(true)}
                className="app-button app-button-primary mt-5 min-h-12 w-full"
              >
                <Plus size={16} weight="bold" />
                Add first exercise
              </button>
            </section>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="app-button app-button-secondary min-h-12 w-full"
            >
              <Plus size={15} weight="bold" />
              Add exercise
            </button>
          )}
        </main>
        )}
      </div>
      {drag?.active && dragLabel && (
        <div
          className="pointer-events-none fixed z-[100] rounded-full border border-border/70 bg-card px-3.5 py-2 shadow-2xl"
          style={{
            left: drag.x + 16,
            top: drag.y - 22,
            opacity: 0.95,
          }}
        >
          <span className="text-[13px] font-semibold tracking-tight text-foreground">
            {dragLabel}
          </span>
        </div>
      )}
      {searchOpen && (
        <AddExerciseSheet
          addedIds={uniqueExerciseIds}
          onAdd={addExercise}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {swapTarget !== null && (
        <AddExerciseSheet
          addedIds={uniqueExerciseIds}
          onAdd={(ex) => swapExercise(swapTarget, ex)}
          onClose={() => setSwapTarget(null)}
        />
      )}
      {confirmRemove && (
        <RemoveExerciseSheet
          exerciseName={confirmRemove.name}
          onConfirm={() => {
            hapticMedium()
            removeExercise(confirmRemove.exerciseId)
            setConfirmRemove(null)
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
      {aiSheetTarget !== null && (
        <AiWorkoutSheet
          target={aiSheetTarget}
          loading={aiUpdating}
          contextReady={
            !coachContextLoading &&
            presets !== undefined &&
            workoutHistory !== undefined &&
            schedule !== undefined
          }
          contextSummary={`${coachContext.workoutDays7} recent session${coachContext.workoutDays7 === 1 ? "" : "s"}, ${coachContext.hardSets7} completed sets, recovery check-ins, goals, routine, and saved preferences.`}
          onAsk={handleAskCoachForWorkout}
          onApply={handleAiWorkoutChange}
          onClose={() => setAiSheetTarget(null)}
        />
      )}
      {brainDumpOpen && (
        <BrainDumpSheet
          unit={unit}
          pending={brainDumpPending}
          onClose={() => setBrainDumpOpen(false)}
          onSubmit={handleBrainDump}
        />
      )}
      {confirmFinish && isRetro && (
        <RetroSaveSheet
          date={retroDate}
          onDateChange={setRetroDate}
          durationSeconds={retroDuration ?? 0}
          onDurationChange={setRetroDuration}
          completedAt={retroCompletedAt}
          onCompletedAtChange={setRetroCompletedAt}
          totalSets={totalSets}
          doneSets={doneSets}
          mode={retroMode}
          onSave={handleFinish}
          onCancel={() => setConfirmFinish(false)}
        />
      )}
      {confirmFinish && !isRetro && (
        <FinishSheet
          elapsed={elapsed}
          totalSets={totalSets}
          doneSets={doneSets}
          onFinish={handleFinish}
          onCancel={() => setConfirmFinish(false)}
        />
      )}
      {confirmAbort && (
        <AbortSheet
          onConfirm={async () => {
            try {
              abortingRef.current = true
              isDirtyRef.current = false
              if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current)
                syncTimeoutRef.current = null
              }
              if (!isRetro) await abortActive({ slot })
              clearActiveWorkoutDraft(slot, retroDraftKey ?? undefined)
              safeSessionStorageSet(ABORTED_WORKOUT_SLOT_KEY, String(slot))
              void endWorkoutLiveActivity(liveActivityState)
              navigate(-1)
            } catch (err) {
              abortingRef.current = false
              logDevError("Failed to abort workout in Convex:", err)
              // Clear pending sync timer on error
              if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current)
                syncTimeoutRef.current = null
              }
              toast.error("Failed to abort workout. Please try again.")
              throw err
            }
          }}
          onCancel={() => setConfirmAbort(false)}
        />
      )}
      {resumePrompt && (
        <ResumeWorkoutSheet
          source={resumePrompt.source}
          savedAt={
            resumePrompt.source === "local"
              ? resumePrompt.draft?.savedAt
              : activeWorkout?._creationTime
          }
          onResume={() => {
            hapticSelection()
            setResumeDecision("resume")
            setResumePrompt(null)
          }}
          onDiscard={async () => {
            hapticMedium()
            clearActiveWorkoutDraft(slot)
            setResumeDecision("discard")
            setResumePrompt(null)
            if (resumePrompt.source === "convex") {
              abortingRef.current = true
              isDirtyRef.current = false
              if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current)
                syncTimeoutRef.current = null
              }
              await abortActive({ slot })
              safeSessionStorageSet(ABORTED_WORKOUT_SLOT_KEY, String(slot))
              abortingRef.current = false
            }
            if (!presetId) {
              setLocalStartedAt(Date.now())
              setIsInitialized(true)
            }
          }}
        />
      )}
      {infoSheet && (
        <ExerciseInfoSheet
          exerciseId={infoSheet.exerciseId}
          exerciseName={infoSheet.name}
          onClose={() => setInfoSheet(null)}
        />
      )}
      {historySheet && (
        <ExerciseHistorySheet
          exerciseId={historySheet.exerciseId}
          exerciseName={historySheet.name}
          unit={unit}
          onClose={() => setHistorySheet(null)}
        />
      )}

      <FormCoachRecorder />
      <FormCoachReviewSheet />
      <FormCoachPoseConfirm />

      {aiAccessModal}
    </div>
  )
}
