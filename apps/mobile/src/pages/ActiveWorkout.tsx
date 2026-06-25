import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { usePostHog } from "@posthog/react"
import { useQuery, useMutation } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { toast } from "sonner"
import {
  ArrowLeft,
  Barbell,
  CaretDown,
  CaretUp,
  ChartLine,
  Check,
  ClockCounterClockwise,
  DotsSixVertical,
  Fire,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Timer,
  Wind,
  X,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { sparklinePoints } from "@/lib/progress-metrics"
import {
  resolveExerciseIds,
  searchExercises,
  type Exercise,
  type ExerciseCategory,
} from "@/lib/exercise-catalog"
import { api } from "../../../../convex/_generated/api"
import { todayIso } from "@/lib/workout-sync"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui"

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = ExerciseCategory
type SetType = "working" | "warmup" | "failure" | "myoreps" | "drop"
type WeightUnit = "kg" | "lbs"

type WorkoutSet = {
  id: string
  type: SetType
  weight: string
  reps: string
  leftReps: string
  rightReps: string
  rpe: string
  restSeconds: number
  completed: boolean
}

type PersistedWorkoutSet = Partial<WorkoutSet>

type ExerciseState = {
  sets: WorkoutSet[]
  trackRpe: boolean
  trackUnilateral: boolean
}

type PersistedExerciseState = Partial<Omit<ExerciseState, "sets">> & {
  sets?: PersistedWorkoutSet[]
}

type LoggedWorkoutSet = {
  weight: number
  reps: number
  completed: boolean
  type: string
}

type LastSession = {
  date: string
  sets: LoggedWorkoutSet[]
}

type LoggedWorkoutExercise = {
  id: string
  sets: LoggedWorkoutSet[]
}

type ExerciseCardDropProps = {
  showLineBefore: boolean
  showLineAfter: boolean
}

type WorkoutItem =
  | { kind: "solo"; exerciseId: string }
  | { kind: "superset"; id: string; color: string; exerciseIds: string[] }

type DragInfo = {
  itemKey: string
  x: number
  y: number
  startX: number
  startY: number
  active: boolean
}

type DropTarget = {
  type: "before" | "after"
  targetKey: string
} | null

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<
  Category,
  React.ComponentType<React.ComponentProps<typeof Barbell>>
> = {
  strength: Barbell,
  cardio: Fire,
  mobility: Wind,
  core: Sparkle,
}

const CATEGORY_COLOR: Record<Category, string> = {
  strength: "#57534e",
  cardio: "#ea580c",
  mobility: "#0d9488",
  core: "#0284c7",
}

const SET_ORDER: SetType[] = ["working", "warmup", "failure", "myoreps", "drop"]

const SET_CFG: Record<SetType, { label: string; color: string; bg: string }> = {
  working: {
    label: "Working",
    color: "color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground))",
    bg: "color-mix(in srgb, var(--muted) 58%, transparent)",
  },
  warmup: {
    label: "Warm-up",
    color: "color-mix(in srgb, var(--foreground) 58%, var(--muted-foreground))",
    bg: "color-mix(in srgb, var(--muted) 48%, transparent)",
  },
  failure: {
    label: "Failure",
    color: "color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground))",
    bg: "color-mix(in srgb, var(--muted) 58%, transparent)",
  },
  myoreps: {
    label: "Myo-reps",
    color: "color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground))",
    bg: "color-mix(in srgb, var(--muted) 58%, transparent)",
  },
  drop: {
    label: "Drop set",
    color: "color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground))",
    bg: "color-mix(in srgb, var(--muted) 58%, transparent)",
  },
}

const REST_OPTS = [0, 30, 60, 90, 120, 150, 180, 240, 300]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2)
}

function formatRest(s: number) {
  if (s <= 0) return "Off"
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function splitRest(seconds: number) {
  return {
    minutes: String(Math.floor(seconds / 60)),
    secs: String(seconds % 60).padStart(2, "0"),
  }
}

function clampRestInput(minutes: string, secs: string) {
  const safeMinutes = Math.max(0, Number.parseInt(minutes || "0", 10) || 0)
  const safeSeconds = Math.min(
    59,
    Math.max(0, Number.parseInt(secs || "0", 10) || 0)
  )
  return safeMinutes * 60 + safeSeconds
}

function formatElapsed(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  return `${m}:${String(sec).padStart(2, "0")}`
}

function toDisplay(kgStr: string, unit: WeightUnit): string {
  if (!kgStr) return ""
  const kg = parseFloat(kgStr)
  if (isNaN(kg)) return kgStr
  return unit === "lbs" ? String(+(kg * 2.20462).toFixed(1)) : kgStr
}

function toKg(displayVal: string, unit: WeightUnit): string {
  if (!displayVal) return ""
  const n = parseFloat(displayVal)
  if (isNaN(n)) return displayVal
  return unit === "lbs" ? String(+(n / 2.20462).toFixed(2)) : displayVal
}

function makeSet(): WorkoutSet {
  return {
    id: uid(),
    type: "working",
    weight: "",
    reps: "",
    leftReps: "",
    rightReps: "",
    rpe: "",
    restSeconds: 120,
    completed: false,
  }
}

function removeExFromItems(items: WorkoutItem[], exId: string): WorkoutItem[] {
  return items.flatMap((item): WorkoutItem[] => {
    if (item.kind === "solo") return item.exerciseId === exId ? [] : [item]
    const rest = item.exerciseIds.filter((id) => id !== exId)
    if (rest.length === 0) return []
    if (rest.length === 1)
      return [{ kind: "solo" as const, exerciseId: rest[0] }]
    return [{ ...item, exerciseIds: rest }]
  })
}

function workoutItemKey(item: WorkoutItem) {
  return item.kind === "solo" ? `solo:${item.exerciseId}` : `superset:${item.id}`
}

/**
 * Count total sets and completed sets across the given workout items.
 *
 * @param items - Array of workout items (solo exercises or supersets) to include in the count
 * @param exData - Mapping from exercise ID to its state (including the `sets` array)
 * @returns An object with `total` — the number of sets across all referenced exercises, and `done` — the number of sets whose `completed` flag is `true`
 */
function countSets(
  items: WorkoutItem[],
  exData: Record<string, ExerciseState>
) {
  let total = 0,
    done = 0
  for (const item of items) {
    const ids = item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
    for (const id of ids) {
      const s = exData[id]?.sets ?? []
      total += s.length
      done += s.filter((x) => x.completed).length
    }
  }
  return { total, done }
}

// ─── Next set indicator ───────────────────────────────────────────────────────

type NextTarget = {
  exerciseId: string
  setIndex: number
} | null

function SetNumberField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  inputMode = "numeric",
  min,
  max,
  step,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className: string
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"]
  min?: string
  max?: string
  step?: string
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="px-1 text-[10px] leading-none font-bold tracking-[0.14em] text-muted-foreground/55 uppercase">
        {label}
      </span>
      <input
        type="number"
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        className={className}
      />
    </label>
  )
}

function setGridClass(trackUnilateral: boolean, trackRpe: boolean) {
  if (trackUnilateral && trackRpe) {
    return "md:grid-cols-[2.25rem_7rem_minmax(4.5rem,1fr)_minmax(4rem,1fr)_minmax(4rem,1fr)_4rem_5rem_2.75rem_2.25rem]"
  }
  if (trackUnilateral) {
    return "md:grid-cols-[2.25rem_7rem_minmax(5rem,1fr)_minmax(4.5rem,1fr)_minmax(4.5rem,1fr)_5rem_2.75rem_2.25rem]"
  }
  if (trackRpe) {
    return "md:grid-cols-[2.25rem_7rem_minmax(5rem,1fr)_minmax(5rem,1fr)_4rem_5rem_2.75rem_2.25rem]"
  }
  return "md:grid-cols-[2.25rem_7rem_minmax(5rem,1fr)_minmax(5rem,1fr)_2.75rem]"
}

/**
 * Locate the first incomplete set across the workout items, scanning items in order.
 *
 * @param items - Ordered list of workout items (solo exercises or supersets) to scan
 * @param exData - Mapping from exercise ID to its corresponding ExerciseState
 * @returns A `NextTarget` with `exerciseId` and `setIndex` for the first incomplete set, or `null` if none found
 */
function findNextTarget(
  items: WorkoutItem[],
  exData: Record<string, ExerciseState>
): NextTarget {
  for (const item of items) {
    const exerciseIds =
      item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
    for (const exerciseId of exerciseIds) {
      const data = exData[exerciseId]
      if (!data) continue
      const firstIncomplete = data.sets.findIndex((s) => !s.completed)
      if (firstIncomplete !== -1) {
        return { exerciseId, setIndex: firstIncomplete }
      }
    }
  }
  return null
}

/**
 * Normalize persisted or partial exercise state into a complete ExerciseState with sensible defaults.
 *
 * Converts an incoming (possibly undefined or partial) state object into an ExerciseState:
 * - Ensures `sets` is an array; each set is given an `id` if missing and defaults:
 *   `type` = "working", `weight`/`reps`/`leftReps`/`rightReps`/`rpe` = `""`, `restSeconds` = `120`, `completed` coerced to boolean.
 * - Ensures `trackRpe` and `trackUnilateral` are booleans.
 *
 * @param state - Partial or persisted exercise state (may be undefined or missing fields)
 * @returns A normalized ExerciseState ready for UI usage and persistence
 */
function normalizeExerciseState(state?: PersistedExerciseState): ExerciseState {
  return {
    sets: (state?.sets || []).map((s) => ({
      id: s.id || uid(),
      type: s.type || "working",
      weight: s.weight || "",
      reps: s.reps || "",
      leftReps: s.leftReps || "",
      rightReps: s.rightReps || "",
      rpe: s.rpe || "",
      restSeconds: s.restSeconds || 120,
      completed: !!s.completed,
    })),
    trackRpe: !!state?.trackRpe,
    trackUnilateral: !!state?.trackUnilateral,
  }
}

// ─── Rest timer countdown ─────────────────────────────────────────────────────

function useRestCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  function start(seconds: number) {
    if (ref.current) clearInterval(ref.current)
    setRemaining(seconds)
    ref.current = setInterval(() => {
      setRemaining((r) => {
        if (r === null || r <= 1) {
          if (ref.current) clearInterval(ref.current)
          ref.current = null
          return null
        }
        return r - 1
      })
    }, 1000)
  }

  function dismiss() {
    if (ref.current) {
      clearInterval(ref.current)
      ref.current = null
    }
    setRemaining(null)
  }

  useEffect(
    () => () => {
      if (ref.current) clearInterval(ref.current)
    },
    []
  )

  return { remaining, start, dismiss }
}

/**
 * Tracks seconds elapsed since a given start timestamp.
 *
 * Recalculates every second and also when the document becomes visible again.
 *
 * @param startedAt - Unix epoch milliseconds timestamp marking the start, or `null` if not started
 * @returns The number of whole seconds elapsed since `startedAt`; `0` if `startedAt` is `null`
 */

function useElapsedTimer(startedAt: number | null) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    /**
     * Update the elapsed seconds state based on the `startedAt` timestamp.
     *
     * If `startedAt` is defined, computes the whole seconds elapsed since that timestamp
     * (using floor) and updates the component state via `setElapsed`.
     */
    function updateElapsed() {
      if (startedAt) {
        const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
        setElapsed(elapsedSeconds)
      }
    }

    // Initial calculation
    updateElapsed()

    // Update every second
    const id = setInterval(updateElapsed, 1000)

    /**
     * Recalculates the elapsed workout timer when the document becomes visible.
     *
     * This should be registered on the document's `visibilitychange` event so the elapsed time is updated when the tab or window regains focus.
     */
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        updateElapsed()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [startedAt])

  return elapsed
}

// ─── Rest countdown banner ────────────────────────────────────────────────────

function RestCountdownBanner({
  remaining,
  onDismiss,
}: {
  remaining: number
  onDismiss: () => void
}) {
  const pct = Math.min(remaining / 300, 1)
  const trackColor = "color-mix(in srgb, var(--primary) 58%, var(--foreground))"
  return (
    <div className="pointer-events-none fixed right-0 bottom-0 left-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]">
      <div
        className="pointer-events-auto mx-4 w-full max-w-sm overflow-hidden rounded-[24px] shadow-lg shadow-black/[0.08]"
        style={{
          background: "color-mix(in srgb, var(--card) 92%, transparent)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border:
            "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
        }}
      >
        <div
          className="h-[3px] w-full"
          style={{
            background: "color-mix(in srgb, var(--border) 45%, transparent)",
          }}
        >
          <div
            className="h-full transition-all duration-1000 ease-linear"
            style={{
              width: `${pct * 100}%`,
              backgroundColor: trackColor,
              borderRadius: "0 2px 2px 0",
            }}
          />
        </div>

        <div className="flex items-center gap-4 px-5 py-3.5">
          <div className="flex flex-col items-center gap-0.5">
            <Timer size={14} style={{ color: trackColor }} />
            <span className="text-[8px] font-medium tracking-[0.16em] text-muted-foreground/45 uppercase">
              Rest
            </span>
          </div>
          <span
            className="font-black tracking-tight tabular-nums"
            style={{
              fontSize: "2.6rem",
              lineHeight: 1,
              letterSpacing: "-0.04em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatElapsed(remaining)}
          </span>
          <button
            onClick={onDismiss}
            className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors active:bg-muted/60"
            style={{
              color: "color-mix(in srgb, var(--foreground) 35%, transparent)",
            }}
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Rest timer picker sheet ──────────────────────────────────────────────────

function RestTimerSheet({
  current,
  onSelect,
  onClose,
}: {
  current: number
  onSelect: (s: number) => void
  onClose: () => void
}) {
  const [minutes, setMinutes] = useState(() => splitRest(current).minutes)
  const [secs, setSecs] = useState(() => splitRest(current).secs)

  useEffect(() => {
    const next = splitRest(current)
    setMinutes(next.minutes)
    setSecs(next.secs)
  }, [current])

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[6px]"
      onClick={onClose}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-8px_48px_rgba(0,0,0,0.18)]"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <Timer size={14} className="text-muted-foreground/60" />
            <span className="text-[14px] font-bold tracking-tight">
              Rest Timer
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/60 transition-colors active:bg-muted active:text-foreground"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {REST_OPTS.map((s) => (
            <button
              key={s}
              onClick={() => onSelect(s)}
              className={cn(
                "h-[52px] rounded-[20px] text-[14px] font-black tracking-tight tabular-nums transition-all active:scale-[0.96]",
                s === current
                  ? "bg-foreground text-background"
                  : "bg-muted/50 text-muted-foreground/80 active:bg-muted"
              )}
            >
              {formatRest(s)}
            </button>
          ))}
        </div>
        <div className="border-t border-border/40 px-4 pt-3 pb-2">
          <p className="mb-2.5 text-[9px] font-medium tracking-[0.18em] text-muted-foreground/45 uppercase">
            Custom
          </p>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[9px] font-bold tracking-widest text-muted-foreground/35 uppercase">
                Min
              </span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                className="h-12 [appearance:textfield] rounded-[18px] border border-border/45 bg-muted/25 px-3 text-center text-[18px] font-black tabular-nums outline-none focus:border-primary/35 focus:bg-background/70 [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
            <span className="mb-3 text-[18px] font-light text-muted-foreground/30">
              :
            </span>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[9px] font-bold tracking-widest text-muted-foreground/35 uppercase">
                Sec
              </span>
              <input
                type="number"
                min="0"
                max="59"
                inputMode="numeric"
                value={secs}
                onChange={(event) => setSecs(event.target.value)}
                className="h-12 [appearance:textfield] rounded-[18px] border border-border/45 bg-muted/25 px-3 text-center text-[18px] font-black tabular-nums outline-none focus:border-primary/35 focus:bg-background/70 [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
            <button
              onClick={() => onSelect(clampRestInput(minutes, secs))}
              className="h-12 shrink-0 rounded-[18px] bg-foreground px-5 text-[13px] font-bold text-background transition-opacity active:opacity-80"
            >
              Set
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Render a single active set row allowing the user to edit weight/reps/RPE, toggle completion, pick rest, cycle set type, and delete the set.
 *
 * The row visualizes completion state, optionally highlights the "next" set, and opens a rest-duration sheet when the timer button is tapped.
 *
 * @param set - The WorkoutSet data for this row (weights, reps, rpe, restSeconds, completed, etc.).
 * @param index - Zero-based index of the set within its exercise.
 * @param trackRpe - Whether the UI should show and allow editing of the RPE field.
 * @param trackUnilateral - Whether reps are tracked per limb (shows left/right inputs) instead of a single reps field.
 * @param unit - Display unit for weight (kg or lbs); inputs/outputs are converted via unit helpers.
 * @param onUpdate - Called with an updated WorkoutSet when any editable field changes.
 * @param onDelete - Called when the delete action is triggered for this set.
 * @param canDelete - When true, shows the delete control (disabled/hidden when the set is completed).
 * @param onComplete - Invoked with the set's restSeconds when the set is newly marked completed (used to start the rest countdown).
 * @param isNext - When true and the set is not completed, the row receives visual emphasis indicating it's the next target.
 *
 * @returns A JSX element representing the interactive set row.
 */

function ActiveSetRow({
  set,
  index,
  trackRpe,
  trackUnilateral,
  unit,
  onUpdate,
  onDelete,
  canDelete,
  onComplete,
  isNext,
  lastSet,
}: {
  set: WorkoutSet
  index: number
  trackRpe: boolean
  trackUnilateral: boolean
  unit: WeightUnit
  onUpdate: (s: WorkoutSet) => void
  onDelete: () => void
  canDelete: boolean
  onComplete: (restSeconds: number) => void
  isNext?: boolean
  lastSet?: { weight: number; reps: number } | null
}) {
  const [showRest, setShowRest] = useState(false)
  const [completionPulse, setCompletionPulse] = useState(false)
  const cfg = SET_CFG[set.type]

  useEffect(() => {
    if (!completionPulse) return
    const id = window.setTimeout(() => setCompletionPulse(false), 520)
    return () => window.clearTimeout(id)
  }, [completionPulse])

  function cycleType() {
    const i = SET_ORDER.indexOf(set.type)
    onUpdate({ ...set, type: SET_ORDER[(i + 1) % SET_ORDER.length] })
  }

  function toggleDone() {
    const next = !set.completed
    onUpdate({ ...set, completed: next })
    if (next) setCompletionPulse(true)
    if (next && set.restSeconds > 0) onComplete(set.restSeconds)
  }

  const fieldCls = cn(
    "h-12 w-full rounded-[20px] border px-3 text-center text-[17px] font-semibold tabular-nums transition-all outline-none",
    "placeholder:text-muted-foreground/30",
    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    set.completed
      ? "cursor-default border-border/30 bg-muted/30 text-foreground/55"
      : "border-border/45 bg-muted/20 focus:border-primary/30 focus:bg-card/80 focus:ring-2 focus:ring-primary/10",
    "disabled:pointer-events-none"
  )
  const compactFieldCls = cn(
    "h-10 w-full rounded-[18px] border px-2.5 text-center text-[14px] font-semibold tabular-nums transition-all outline-none",
    "placeholder:text-muted-foreground/25",
    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    set.completed
      ? "cursor-default border-border/30 bg-muted/30 text-foreground/50"
      : "border-border/40 bg-muted/20 focus:border-primary/30 focus:bg-card/80 focus:ring-2 focus:ring-primary/10",
    "disabled:pointer-events-none"
  )
  const repsModeKey = trackUnilateral ? "unilateral" : "bilateral"
  const trackingModeKey = `${repsModeKey}-${trackRpe ? "rpe" : "base"}`
  const fullWidthComplete = trackUnilateral || trackRpe
  const showSecondarySetControls = trackUnilateral || trackRpe
  const desktopGridClass = setGridClass(trackUnilateral, trackRpe)

  return (
    <>
      <div
        className={cn(
          "relative hidden items-center gap-2 px-3.5 py-2 transition-colors md:grid",
          desktopGridClass,
          set.completed && "bg-muted/15",
          isNext && !set.completed && "bg-primary/[0.028]"
        )}
      >
        {isNext && !set.completed && (
          <div className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary/35" />
        )}
        <span className="text-center text-[12px] font-semibold text-muted-foreground/70 tabular-nums">
          {index + 1}
        </span>
        <button
          onClick={cycleType}
          disabled={set.completed}
          aria-label={`Set mode: ${cfg.label}. Tap to change.`}
          title={`Set mode: ${cfg.label}`}
          className="flex h-10 items-center justify-center rounded-[18px] px-2 text-[11px] font-bold transition-colors active:bg-muted disabled:pointer-events-none"
          style={{
            backgroundColor: set.completed
              ? "color-mix(in srgb, var(--muted) 70%, transparent)"
              : cfg.bg,
            color: cfg.color,
          }}
        >
          {set.completed ? <Check size={14} weight="bold" /> : cfg.label}
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={toDisplay(set.weight, unit)}
          onChange={(event) =>
            onUpdate({ ...set, weight: toKg(event.target.value, unit) })
          }
          placeholder={
            lastSet?.weight ? toDisplay(String(lastSet.weight), unit) : "–"
          }
          disabled={set.completed}
          aria-label={`Weight (${unit})`}
          className={compactFieldCls}
        />
        {trackUnilateral ? (
          <>
            <input
              type="number"
              inputMode="numeric"
              value={set.leftReps}
              onChange={(event) =>
                onUpdate({ ...set, leftReps: event.target.value })
              }
              placeholder="–"
              disabled={set.completed}
              aria-label="Left reps"
              className={compactFieldCls}
            />
            <input
              type="number"
              inputMode="numeric"
              value={set.rightReps}
              onChange={(event) =>
                onUpdate({ ...set, rightReps: event.target.value })
              }
              placeholder="–"
              disabled={set.completed}
              aria-label="Right reps"
              className={compactFieldCls}
            />
          </>
        ) : (
          <input
            type="number"
            inputMode="numeric"
            value={set.reps}
            onChange={(event) => onUpdate({ ...set, reps: event.target.value })}
            placeholder={lastSet?.reps ? String(lastSet.reps) : "–"}
            disabled={set.completed}
            aria-label="Reps"
            className={compactFieldCls}
          />
        )}
        {trackRpe && (
          <input
            type="number"
            inputMode="decimal"
            value={set.rpe}
            onChange={(event) => onUpdate({ ...set, rpe: event.target.value })}
            placeholder="–"
            min="1"
            max="10"
            step="0.5"
            disabled={set.completed}
            aria-label="RPE"
            className={compactFieldCls}
          />
        )}
        {showSecondarySetControls && (
          <button
            onClick={() => setShowRest(true)}
            aria-label="Set rest timer"
            className="flex h-10 items-center justify-center gap-1.5 rounded-[18px] border border-border/40 bg-muted/20 px-2 text-[12px] font-semibold text-muted-foreground/75 transition-colors active:bg-muted/50"
          >
            <Timer size={13} />
            <span className="tabular-nums">{formatRest(set.restSeconds)}</span>
          </button>
        )}
        <button
          onClick={toggleDone}
          aria-label={
            set.completed ? "Mark set incomplete" : "Mark set complete"
          }
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-[18px] border transition-colors active:bg-muted/60",
            set.completed
              ? "border-primary/25 bg-primary/[0.10] text-primary"
              : "border-border/40 bg-muted/15 text-muted-foreground/60"
          )}
        >
          <Check size={14} weight="bold" />
        </button>
        {showSecondarySetControls &&
          (canDelete && !set.completed ? (
            <button
              onClick={onDelete}
              aria-label="Delete set"
              className="flex h-10 w-10 items-center justify-center rounded-[18px] text-muted-foreground/45 transition-colors active:bg-muted/50 active:text-foreground"
            >
              <X size={14} weight="bold" />
            </button>
          ) : (
            <div />
          ))}
      </div>
      <div
        className={cn(
          "relative px-3 py-3 transition-[background-color,transform,box-shadow] duration-300 md:hidden",
          set.completed && "bg-muted/15",
          isNext && !set.completed && "bg-primary/[0.028]",
          completionPulse && "scale-[1.01]",
          !set.completed && !isNext && "bg-background"
        )}
        style={
          completionPulse
            ? {
                boxShadow:
                  "inset 0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent)",
              }
            : isNext && !set.completed
              ? {
                  boxShadow:
                    "inset 0 0 0 1px color-mix(in srgb, var(--primary) 22%, transparent)",
                }
              : undefined
        }
      >
        {isNext && !set.completed && (
          <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary/35" />
        )}
        <div className="mb-2 flex items-center gap-2">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold tabular-nums select-none",
              set.completed
                ? "bg-muted/60 text-foreground/65"
                : isNext
                  ? "bg-primary/[0.09] text-primary"
                  : "bg-muted/45 text-muted-foreground/70"
            )}
          >
            {index + 1}
          </span>
          <button
            onClick={cycleType}
            disabled={set.completed}
            aria-label={`Set mode: ${cfg.label}. Tap to change.`}
            title={`Set mode: ${cfg.label}`}
            className={cn(
              "flex h-10 min-w-[6.25rem] shrink-0 items-center justify-center rounded-[20px] px-3 transition-all select-none active:scale-[0.96] disabled:pointer-events-none",
              isNext && !set.completed && "ring-1 ring-primary/15"
            )}
            style={{
              backgroundColor: set.completed
                ? "color-mix(in srgb, var(--muted) 70%, transparent)"
                : cfg.bg,
            }}
          >
            {set.completed ? (
              <Check size={15} weight="bold" className="text-foreground/65" />
            ) : (
              <span
                className="truncate text-[11.5px] font-bold"
                style={{ color: cfg.color }}
              >
                {cfg.label}
              </span>
            )}
          </button>
          {isNext && !set.completed && (
            <span className="rounded-full bg-primary/[0.08] px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-primary/80 uppercase">
              Next
            </span>
          )}
          {showSecondarySetControls && (
            <button
              onClick={() => setShowRest(true)}
              aria-label="Set rest timer"
              className="ml-auto flex h-10 shrink-0 items-center gap-1.5 rounded-[20px] border border-border/40 bg-muted/20 px-3 transition-all active:scale-[0.97] active:bg-muted/50"
            >
              <Timer size={13} className="text-muted-foreground/55" />
              <span className="text-[12px] font-semibold text-foreground/70 tabular-nums">
                {formatRest(set.restSeconds)}
              </span>
            </button>
          )}
          {showSecondarySetControls && canDelete && !set.completed && (
            <button
              onClick={onDelete}
              aria-label="Delete set"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[20px] text-muted-foreground/45 transition-colors active:bg-muted/50 active:text-foreground"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
        <div
          key={trackingModeKey}
          className={cn(
            "grid animate-in gap-2 duration-200 fade-in-0 zoom-in-95 slide-in-from-bottom-1",
            fullWidthComplete
              ? "grid-cols-2"
              : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3rem]"
          )}
        >
          <SetNumberField
            label={`Weight (${unit})`}
            inputMode="decimal"
            value={toDisplay(set.weight, unit)}
            onChange={(value) =>
              onUpdate({ ...set, weight: toKg(value, unit) })
            }
            placeholder={
              lastSet?.weight ? toDisplay(String(lastSet.weight), unit) : "–"
            }
            disabled={set.completed}
            className={fieldCls}
          />
          {trackUnilateral ? (
            <>
              <SetNumberField
                label="Left reps"
                value={set.leftReps}
                onChange={(value) => onUpdate({ ...set, leftReps: value })}
                placeholder="–"
                disabled={set.completed}
                className={fieldCls}
              />
              <SetNumberField
                label="Right reps"
                value={set.rightReps}
                onChange={(value) => onUpdate({ ...set, rightReps: value })}
                placeholder="–"
                disabled={set.completed}
                className={fieldCls}
              />
            </>
          ) : (
            <SetNumberField
              label="Reps"
              value={set.reps}
              onChange={(value) => onUpdate({ ...set, reps: value })}
              placeholder={lastSet?.reps ? String(lastSet.reps) : "–"}
              disabled={set.completed}
              className={fieldCls}
            />
          )}
          {trackRpe && (
            <SetNumberField
              label="RPE"
              inputMode="decimal"
              value={set.rpe}
              onChange={(value) => onUpdate({ ...set, rpe: value })}
              placeholder="–"
              min="1"
              max="10"
              step="0.5"
              disabled={set.completed}
              className={fieldCls}
            />
          )}
          <button
            onClick={toggleDone}
            aria-label={
              set.completed ? "Mark set incomplete" : "Mark set complete"
            }
            className={cn(
              "flex h-12 items-center justify-center rounded-[20px] border text-[13px] font-bold transition-all active:scale-[0.97]",
              fullWidthComplete ? "col-span-2 gap-2" : "w-full",
              set.completed
                ? "border-primary/25 bg-primary/[0.10] text-primary shadow-sm"
                : "border-border/40 bg-muted/15 text-muted-foreground/55 active:border-primary/25 active:bg-primary/[0.05] active:text-primary",
              completionPulse &&
                "animate-[set-complete_520ms_cubic-bezier(0.22,1,0.36,1)]"
            )}
          >
            <Check size={14} weight="bold" />
            {fullWidthComplete && (
              <span>{set.completed ? "Undo" : "Done"}</span>
            )}
          </button>
        </div>
      </div>
      {showRest && (
        <RestTimerSheet
          current={set.restSeconds}
          onSelect={(s) => {
            onUpdate({ ...set, restSeconds: s })
            setShowRest(false)
          }}
          onClose={() => setShowRest(false)}
        />
      )}
    </>
  )
}

/**
 * Render an exercise card containing its sets, controls, and compact history for the active workout UI.
 *
 * Displays exercise metadata, set rows (with editing, completion, and rest controls), tracking toggles (RPE / unilateral),
 * drag handle, collapse toggle, remove button, and an optional last-session summary. Highlights the next incomplete set
 * when `nextSetIndex` is provided.
 *
 * @param exercise - Exercise metadata (name, color, muscle, etc.).
 * @param data - Per-exercise state including the list of sets and tracking flags.
 * @param unit - Weight display unit (`"kg"` or `"lbs"`).
 * @param onUpdate - Called with an updated `ExerciseState` when sets or tracking options change.
 * @param onRemove - Called to remove this exercise from the workout.
 * @param isDragging - Whether this card is currently being dragged (applies visual transform).
 * @param showLineBefore - Render a decorative line above the card when true.
 * @param showLineAfter - Render a decorative line below the card when true.
 * @param inSuperset - True when the card is rendered inside a superset container.
 * @param collapsed - Whether the card's set list is collapsed.
 * @param onToggleCollapse - Toggle collapsed state for this card.
 * @param dragHandlers - Pointer/drag event handlers to attach to the drag handle when reordering is allowed.
 * @param cardRef - Ref callback for the card DOM element (used for hit-testing during drag).
 * @param onStartRest - Called with rest seconds when a set is completed and a rest timer should start.
 * @param lastSession - Optional recent session summary (date and sets) to render a compact history row.
 * @param onShowHistory - Open the full history sheet for this exercise.
 * @param nextSetIndex - Optional index of the next incomplete set to visually emphasize; pass `null` to disable.
 *
 * @returns The rendered React element for the exercise card.
 */
function ActiveExerciseCard({
  exercise,
  data,
  unit,
  onUpdate,
  onRemove,
  isDragging,
  showLineBefore,
  showLineAfter,
  inSuperset,
  collapsed,
  onToggleCollapse,
  dragHandlers,
  cardRef,
  onStartRest,
  lastSession,
  onShowHistory,
  nextSetIndex,
}: {
  exercise: Exercise
  data: ExerciseState
  unit: WeightUnit
  onUpdate: (d: ExerciseState) => void
  onRemove: () => void
  isDragging: boolean
  showLineBefore: boolean
  showLineAfter: boolean
  inSuperset?: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  dragHandlers?: React.HTMLAttributes<HTMLDivElement>
  cardRef: (el: HTMLDivElement | null) => void
  onStartRest: (seconds: number) => void
  lastSession?: {
    date: string
    sets: Array<{
      weight: number
      reps: number
      completed: boolean
      type: string
    }>
  } | null
  onShowHistory: () => void
  nextSetIndex?: number | null
}) {
  function addSet() {
    onUpdate({ ...data, sets: [...data.sets, makeSet()] })
  }
  function updateSet(i: number, s: WorkoutSet) {
    const sets = [...data.sets]
    sets[i] = s
    onUpdate({ ...data, sets })
  }
  function removeSet(i: number) {
    onUpdate({ ...data, sets: data.sets.filter((_, j) => j !== i) })
  }
  const allDone = data.sets.length > 0 && data.sets.every((s) => s.completed)
  const doneSets = data.sets.filter((s) => s.completed).length
  const totalRest = data.sets.reduce((sum, set) => sum + set.restSeconds, 0)
  return (
    <div
      ref={cardRef}
      className={cn(
        "relative flex overflow-hidden transition-[opacity,transform] duration-150",
        inSuperset
          ? "border-t border-border/45 bg-transparent first:border-t-0"
          : "rounded-[20px] border bg-card md:rounded-[22px]",
        !inSuperset && (allDone ? "border-primary/25" : "border-border/55"),
        isDragging && "scale-[0.985] opacity-25"
      )}
    >
      {showLineBefore && (
        <div className="pointer-events-none absolute -top-[5px] right-4 left-4 z-10 h-[2.5px] rounded-full bg-primary/40" />
      )}
      {showLineAfter && (
        <div className="pointer-events-none absolute right-4 -bottom-[5px] left-4 z-10 h-[2.5px] rounded-full bg-primary/40" />
      )}
      {!inSuperset && (
        <div
          className="w-[3px] shrink-0 transition-colors duration-300"
          style={{
            background: allDone
              ? "color-mix(in srgb, var(--primary) 36%, transparent)"
              : "color-mix(in srgb, var(--muted-foreground) 18%, transparent)",
          }}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={cn("px-3 py-3 sm:px-4 md:py-3", inSuperset && "pl-4")}>
          <div className="flex items-start gap-2">
            {dragHandlers && (
              <div
                {...dragHandlers}
                role="button"
                aria-label="Reorder exercise"
                className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground/35 transition-colors select-none active:cursor-grabbing active:bg-muted/50 active:text-muted-foreground/70 md:h-9"
              >
                <DotsSixVertical size={15} weight="bold" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] leading-tight font-semibold tracking-tight md:text-[14.5px]">
                {exercise.name}
              </p>
              <p className="mt-1 truncate text-[11.5px] text-muted-foreground/55 md:text-[11px]">
                {collapsed
                  ? `${doneSets}/${data.sets.length} sets · ${formatRest(totalRest)} rest`
                  : exercise.muscle}
              </p>
            </div>
            <span
              className={cn(
                "mt-0.5 shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-semibold tracking-tight tabular-nums transition-colors",
                allDone
                  ? "bg-primary/[0.10] text-primary"
                  : "bg-muted/45 text-muted-foreground/70"
              )}
            >
              {doneSets}/{data.sets.length}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-border/45 bg-muted/20 px-3 text-[10.5px] font-bold tracking-[0.12em] text-muted-foreground/70 uppercase transition-colors active:bg-muted/50 md:flex-none md:px-3.5">
                  Track
                  <span className="truncate text-[11px] tracking-normal text-foreground/60">
                    {[data.trackRpe && "RPE", data.trackUnilateral && "UNI"]
                      .filter(Boolean)
                      .join(" · ") || "Off"}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-[10px] font-semibold tracking-[0.15em] uppercase">
                  Advanced tracking
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={data.trackRpe}
                  onCheckedChange={(checked) =>
                    onUpdate({ ...data, trackRpe: checked === true })
                  }
                >
                  Track RPE
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={data.trackUnilateral}
                  onCheckedChange={(checked) =>
                    onUpdate({ ...data, trackUnilateral: checked === true })
                  }
                >
                  Track unilateral reps
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={onShowHistory}
              aria-label="Open exercise history"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground/55 transition-colors active:bg-muted/50 active:text-foreground"
            >
              <ChartLine size={16} weight="bold" />
            </button>
            <button
              onClick={onRemove}
              aria-label="Remove exercise"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground/45 transition-colors active:bg-muted/50 active:text-foreground"
            >
              <X size={16} weight="bold" />
            </button>
            <button
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand exercise" : "Collapse exercise"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground/60 transition-colors active:bg-muted/50 active:text-foreground"
            >
              {collapsed ? (
                <CaretDown size={16} weight="bold" />
              ) : (
                <CaretUp size={16} weight="bold" />
              )}
            </button>
          </div>
        </div>
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
            collapsed
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            {lastSession &&
              (() => {
                const completedSets = lastSession.sets.filter(
                  (s) => s.completed !== false
                )
                if (completedSets.length === 0) return null
                const fmtW = (kg: number) =>
                  unit === "lbs" ? `${+(kg * 2.20462).toFixed(1)}` : `${kg}`
                const summary = completedSets
                  .map((s) => `${fmtW(s.weight)}×${s.reps}`)
                  .join("  ")
                return (
                  <div
                    className="flex items-center gap-2 px-4 py-2.5"
                    style={{
                      borderTop:
                        "1px solid color-mix(in srgb, var(--border) 65%, transparent)",
                      background:
                        "color-mix(in srgb, var(--muted) 18%, transparent)",
                    }}
                  >
                    <ClockCounterClockwise
                      size={13}
                      style={{
                        color:
                          "color-mix(in srgb, var(--muted-foreground) 62%, transparent)",
                        flexShrink: 0,
                      }}
                    />
                    <span className="text-[11px] font-medium text-muted-foreground/50">
                      {new Date(
                        `${lastSession.date}T12:00:00Z`
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="min-w-0 truncate text-[11px] text-muted-foreground/60 tabular-nums">
                      {summary}
                    </span>
                  </div>
                )
              })()}
            <div
              style={{
                borderTop:
                  "1px solid color-mix(in srgb, var(--border) 65%, transparent)",
              }}
            >
              <div
                className={cn(
                  "hidden items-center gap-2 border-b border-border/30 bg-muted/15 px-3.5 py-2 text-[10px] font-bold tracking-[0.12em] text-muted-foreground/55 uppercase md:grid",
                  setGridClass(data.trackUnilateral, data.trackRpe)
                )}
              >
                <span className="text-center">Set</span>
                <span>Type</span>
                <span>Weight</span>
                {data.trackUnilateral ? (
                  <>
                    <span>Left</span>
                    <span>Right</span>
                  </>
                ) : (
                  <span>Reps</span>
                )}
                {data.trackRpe && <span>RPE</span>}
                {(data.trackRpe || data.trackUnilateral) && <span>Rest</span>}
                <span className="text-center">Done</span>
                {(data.trackRpe || data.trackUnilateral) && <span />}
              </div>
              {data.sets.map((s, i) => (
                <div
                  key={s.id}
                  style={
                    i > 0
                      ? {
                          borderTop:
                            "1px solid color-mix(in srgb, var(--border) 45%, transparent)",
                        }
                      : undefined
                  }
                >
                  <ActiveSetRow
                    set={s}
                    index={i}
                    trackRpe={data.trackRpe}
                    trackUnilateral={data.trackUnilateral}
                    unit={unit}
                    onUpdate={(updated) => updateSet(i, updated)}
                    onDelete={() => removeSet(i)}
                    canDelete={data.sets.length > 1}
                    onComplete={onStartRest}
                    isNext={nextSetIndex === i}
                    lastSet={lastSession?.sets[i]}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={addSet}
              className="flex h-12 w-full items-center justify-center gap-2 text-muted-foreground/50 transition-colors active:bg-muted/30 active:text-foreground"
              style={{
                borderTop:
                  "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
              }}
            >
              <Plus size={14} weight="bold" />
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase">
                Add set
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { estimate1RM } from "@/lib/one-rm"

// ─── Sparkline helper ─────────────────────────────────────────────────────────

function formatSessionDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

// ─── Exercise history sheet ───────────────────────────────────────────────────

type HistorySession = {
  date: string
  sets: Array<{
    weight: number
    reps: number
    completed: boolean
    type: string
  }>
}

function ExerciseHistorySheet({
  exerciseId,
  exerciseName,
  unit,
  onClose,
}: {
  exerciseId: string
  exerciseName: string
  unit: WeightUnit
  onClose: () => void
}) {
  const history = useQuery(api.logs.workouts.historyForExercise, {
    exerciseId,
  }) as HistorySession[] | undefined

  const completedSessions = useMemo(() => {
    if (!history) return []
    return history
      .map((session) => ({
        ...session,
        sets: session.sets.filter((s) => s.completed !== false),
      }))
      .filter((s) => s.sets.length > 0)
  }, [history])

  const maxWeights = completedSessions.map((s) =>
    Math.max(...s.sets.map((set) => set.weight || 0))
  )

  const chartW = 280
  const chartH = 60
  const points = sparklinePoints(maxWeights, chartW, chartH)

  function fmtWeight(kg: number) {
    if (unit === "lbs") return `${+(kg * 2.20462).toFixed(1)}`
    return `${kg}`
  }

  function fmtSets(sets: HistorySession["sets"]) {
    return sets.map((s) => `${fmtWeight(s.weight)}×${s.reps}`).join(", ")
  }

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={onClose}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3">
          <div className="h-1 w-10 rounded-full bg-foreground/[0.10]" />
        </div>
        <div className="flex items-center gap-3 px-5 pt-4 pb-3">
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-muted/60"
            style={{
              color: "color-mix(in srgb, var(--foreground) 40%, transparent)",
            }}
          >
            <ArrowLeft size={14} weight="bold" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-black tracking-tight">
              {exerciseName}
            </h2>
            <p className="text-[11px] text-muted-foreground/50">
              Strength history
            </p>
          </div>
        </div>

        {history === undefined ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-[13px] text-muted-foreground/40">
              Loading…
            </span>
          </div>
        ) : completedSessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16">
            <ChartLine
              size={28}
              style={{
                color: "color-mix(in srgb, var(--foreground) 18%, transparent)",
              }}
            />
            <p className="text-[13px] font-semibold text-muted-foreground/50">
              No history yet
            </p>
            <p className="text-[11px] text-muted-foreground/30">
              Complete this exercise to start tracking
            </p>
          </div>
        ) : (
          <>
            {completedSessions.length >= 2 && (
              <div className="mx-5 mb-4 overflow-hidden rounded-2xl bg-foreground/[0.04] px-4 py-4">
                <p className="mb-3 text-[9px] font-bold tracking-[0.18em] text-muted-foreground/40 uppercase">
                  Max weight · {unit}
                </p>
                <svg
                  width={chartW}
                  height={chartH}
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="w-full overflow-visible text-foreground/60"
                >
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity="0.45"
                      />
                      <stop offset="100%" stopColor="currentColor" />
                    </linearGradient>
                  </defs>
                  <polyline
                    points={points}
                    fill="none"
                    stroke="url(#chartGrad)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {maxWeights.map((w, i) => {
                    const x =
                      maxWeights.length === 1
                        ? chartW / 2
                        : (i / (maxWeights.length - 1)) * chartW
                    const min = Math.min(...maxWeights)
                    const max = Math.max(...maxWeights)
                    const range = max - min || 1
                    const y = chartH - ((w - min) / range) * (chartH * 0.85)
                    return (
                      <circle key={i} cx={x} cy={y} r="3" fill="currentColor" />
                    )
                  })}
                </svg>
                <div className="mt-2 flex justify-between">
                  <span className="text-[10px] text-muted-foreground/35">
                    {formatSessionDate(completedSessions[0].date)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/35">
                    {formatSessionDate(
                      completedSessions[completedSessions.length - 1].date
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* ── Estimated 1RM ── */}
            {(() => {
              // Find the best working set across all sessions (highest estimated 1RM)
              const bestSet = completedSessions
                .flatMap((s) =>
                  s.sets.filter((set) => set.weight > 0 && set.reps > 0)
                )
                .reduce<{ weight: number; reps: number; est: number } | null>(
                  (best, set) => {
                    const est = estimate1RM(set.weight, set.reps)
                    return !best || est > best.est
                      ? { weight: set.weight, reps: set.reps, est }
                      : best
                  },
                  null
                )
              if (!bestSet) return null
              const orm = bestSet.est
              const fmtW = (kg: number) =>
                unit === "lbs"
                  ? `${+(kg * 2.20462).toFixed(1)}`
                  : `${+kg.toFixed(1)}`
              const pcts = [
                {
                  pct: 100,
                  label: "1RM (est.)",
                  color:
                    "color-mix(in srgb, var(--foreground) 78%, transparent)",
                },
                {
                  pct: 90,
                  label: "Training max",
                  color:
                    "color-mix(in srgb, var(--foreground) 55%, transparent)",
                },
                {
                  pct: 80,
                  label: "Heavy work",
                  color:
                    "color-mix(in srgb, var(--foreground) 45%, transparent)",
                },
                {
                  pct: 70,
                  label: "Moderate",
                  color:
                    "color-mix(in srgb, var(--foreground) 35%, transparent)",
                },
              ]
              return (
                <div
                  className="mx-5 mb-4 overflow-hidden rounded-2xl"
                  style={{
                    border:
                      "1px solid color-mix(in srgb, var(--foreground) 8%, transparent)",
                    background:
                      "color-mix(in srgb, var(--foreground) 3%, var(--card))",
                  }}
                >
                  <div
                    className="flex items-center justify-between px-4 pt-3 pb-2"
                    style={{
                      borderBottom:
                        "1px solid color-mix(in srgb, var(--foreground) 6%, transparent)",
                    }}
                  >
                    <p className="text-[9px] font-bold tracking-[0.18em] text-muted-foreground/40 uppercase">
                      Estimated 1RM
                    </p>
                    <p className="text-[9px] text-muted-foreground/30">
                      from {fmtW(bestSet.weight)} {unit} × {bestSet.reps} reps
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-0">
                    {pcts.map(({ pct, label, color }) => {
                      const val = (orm * pct) / 100
                      return (
                        <div
                          key={pct}
                          className="flex flex-col items-center gap-0.5 px-2 py-3"
                        >
                          <span
                            className="text-[16px] leading-none font-black tracking-tight tabular-nums"
                            style={{ color }}
                          >
                            {fmtW(val)}
                          </span>
                          <span className="mt-0.5 text-[7.5px] font-medium tracking-widest text-muted-foreground/35 uppercase">
                            {unit}
                          </span>
                          <span
                            className="mt-1 text-[9px] font-semibold"
                            style={{ color }}
                          >
                            {pct}%
                          </span>
                          <span className="text-center text-[8.5px] leading-tight text-muted-foreground/35">
                            {label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            <div
              className="mx-5 overflow-hidden rounded-2xl"
              style={{
                border:
                  "1px solid color-mix(in srgb, var(--foreground) 7%, transparent)",
              }}
            >
              <p className="px-4 pt-3 pb-2 text-[9px] font-bold tracking-[0.18em] text-muted-foreground/40 uppercase">
                Sessions
              </p>
              <div className="max-h-[240px] overflow-y-auto">
                {[...completedSessions].reverse().map((session, i) => (
                  <div
                    key={session.date}
                    className="flex items-start gap-3 px-4 py-2.5"
                    style={
                      i > 0
                        ? {
                            borderTop:
                              "1px solid color-mix(in srgb, var(--foreground) 5%, transparent)",
                          }
                        : undefined
                    }
                  >
                    <span className="w-[52px] shrink-0 text-[11px] font-semibold text-muted-foreground/50">
                      {formatSessionDate(session.date)}
                    </span>
                    <span className="min-w-0 flex-1 text-[11px] leading-snug text-foreground/70">
                      {fmtSets(session.sets)}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold text-muted-foreground/40 tabular-nums">
                      {fmtWeight(
                        Math.max(...session.sets.map((s) => s.weight || 0))
                      )}{" "}
                      {unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AddExerciseSheet({
  addedIds,
  onAdd,
  onClose,
}: {
  addedIds: string[]
  onAdd: (ex: Exercise) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [activeFilters, setActiveFilters] = useState<Set<Category>>(new Set())
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle")
  const [remoteExercises, setRemoteExercises] = useState<Exercise[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])
  function toggleFilter(cat: Category) {
    setActiveFilters((s) => {
      const next = new Set(s)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }
  useEffect(() => {
    const q = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    searchSeqRef.current += 1
    const delay = q.length === 0 ? 0 : 280
    debounceRef.current = setTimeout(async () => {
      const requestSeq = ++searchSeqRef.current
      setSearchState("loading")
      try {
        const results = await searchExercises({
          query: q,
          categories: activeFilters.size > 0 ? [...activeFilters] : undefined,
          limit: 25,
        })
        if (requestSeq !== searchSeqRef.current) return
        setRemoteExercises(results as Exercise[])
        setSearchState("done")
      } catch {
        if (requestSeq !== searchSeqRef.current) return
        setRemoteExercises([])
        setSearchState("error")
      }
    }, delay)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [activeFilters, query])
  const filtered = remoteExercises
  const FILTERS: { cat: Category; label: string }[] = [
    { cat: "strength", label: "Strength" },
    { cat: "cardio", label: "Cardio" },
    { cat: "mobility", label: "Mobility" },
    { cat: "core", label: "Core" },
  ]
  return (
    <div
      className="sheet-overlay fixed inset-0 z-40 md:flex md:justify-center md:bg-black/40 md:backdrop-blur-sm"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      onClick={onClose}
    >
      <div
        className="sheet-panel flex h-full w-full flex-col bg-background md:mt-12 md:h-auto md:max-h-[76vh] md:max-w-lg md:self-start md:overflow-hidden md:rounded-[28px] md:border md:border-border/45 md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
          <div className="relative flex-1">
            <MagnifyingGlass
              size={15}
              className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground/40"
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises…"
              className="h-11 w-full rounded-[20px] border border-border/45 bg-muted/35 pr-4 pl-10 text-[14px] transition-all outline-none placeholder:text-muted-foreground/35 focus:border-primary/30 focus:bg-background"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground/40 active:text-foreground"
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-[13px] font-semibold text-muted-foreground transition-colors active:text-foreground"
          >
            Done
          </button>
        </div>
        <div
          className="flex overflow-x-auto border-b border-border/40 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {FILTERS.map(({ cat, label }) => {
            const active = activeFilters.has(cat)
            const Icon = CATEGORY_ICON[cat]
            return (
              <button
                key={cat}
                onClick={() => toggleFilter(cat)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 px-4 py-3 text-[12px] font-semibold transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground/50 active:text-foreground/70"
                )}
              >
                <Icon
                  size={11}
                  weight={active ? "fill" : "regular"}
                  style={active ? { color: CATEGORY_COLOR[cat] } : undefined}
                />
                {label}
                {active && (
                  <span
                    className="absolute right-0 bottom-0 left-0 h-[2px] rounded-t-full"
                    style={{ backgroundColor: CATEGORY_COLOR[cat] }}
                  />
                )}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto">
          {searchState === "loading" ? (
            <div className="flex flex-col items-center gap-2 py-20">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground/70" />
              <p className="text-[13px] font-semibold text-muted-foreground">
                Searching exercises…
              </p>
            </div>
          ) : filtered.length > 0 ? (
            <div className="flex flex-col divide-y divide-border/30">
              {filtered.map((ex) => {
                const already = addedIds.includes(ex.id)
                return (
                  <div
                    key={ex.id}
                    className={cn(
                      "flex items-stretch",
                      already && "opacity-50"
                    )}
                  >
                    <div
                      className="w-[3px] shrink-0 rounded-l-sm"
                      style={{ backgroundColor: ex.color }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col justify-center py-3.5 pr-2 pl-4 text-left">
                      <p className="truncate text-[14px] leading-snug font-semibold">
                        {ex.name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground/55">
                        {ex.muscle}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (!already) {
                          onAdd(ex)
                          onClose()
                        }
                      }}
                      disabled={already}
                      className="flex items-center pr-4 pl-2 text-muted-foreground/40 transition-colors active:text-foreground disabled:pointer-events-none"
                    >
                      {already ? (
                        <Check
                          size={14}
                          weight="bold"
                          className="text-foreground/60"
                        />
                      ) : (
                        <Plus size={16} weight="bold" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : searchState === "done" ? (
            <div className="flex flex-col items-center gap-2 py-20">
              <p className="text-[13px] font-semibold text-muted-foreground">
                No exercises found
              </p>
              <p className="text-[11px] text-muted-foreground/50">
                Try a different search or filter
              </p>
            </div>
          ) : searchState === "error" ? (
            <div className="flex flex-col items-center gap-2 py-20">
              <p className="text-[13px] font-semibold text-muted-foreground">
                Search failed
              </p>
              <p className="text-[11px] text-muted-foreground/50">
                Check your connection and try again
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function FinishSheet({
  elapsed,
  totalSets,
  doneSets,
  onFinish,
  onCancel,
}: {
  elapsed: number
  totalSets: number
  doneSets: number
  onFinish: () => void
  onCancel: () => void
}) {
  const allDone = doneSets >= totalSets
  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={onCancel}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="h-1 w-full transition-colors duration-500"
          style={{
            background: allDone
              ? "color-mix(in srgb, var(--primary) 50%, transparent)"
              : "transparent",
          }}
        />
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-[20px] font-black tracking-tight">
            {allDone ? "Workout complete" : "Finish early?"}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
            {!allDone &&
              `${totalSets - doneSets} set${totalSets - doneSets > 1 ? "s" : ""} still incomplete. `}
            Total time:{" "}
            <span className="font-black text-foreground tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          </p>
          <div className="mt-4 flex gap-3">
            {[
              { label: "Sets done", value: `${doneSets}/${totalSets}` },
              { label: "Duration", value: formatElapsed(elapsed) },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-1 flex-col gap-0.5 rounded-[20px] bg-muted/40 px-3 py-2.5"
              >
                <span className="text-[9px] font-black tracking-[0.18em] text-muted-foreground/50 uppercase">
                  {label}
                </span>
                <span className="text-[18px] font-black tracking-tight tabular-nums">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            onClick={onFinish}
            className="h-[52px] w-full rounded-[20px] bg-foreground text-[15px] font-black tracking-tight text-background transition-opacity active:opacity-80"
          >
            Finish workout
          </button>
          <button
            onClick={onCancel}
            className="h-[52px] w-full rounded-[20px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35 active:text-foreground"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
}

function AbortSheet({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={onCancel}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-10 rounded-full bg-muted/70" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-[20px] font-black tracking-tight">
            Abort workout?
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground/70">
            Your progress won't be saved.
          </p>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            onClick={onConfirm}
            className="h-[52px] w-full rounded-[20px] bg-destructive text-[15px] font-black tracking-tight text-white transition-opacity active:opacity-80"
          >
            Abort workout
          </button>
          <button
            onClick={onCancel}
            className="h-[52px] w-full rounded-[20px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35 active:text-foreground"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
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
  makeDragHandlers: (itemKey: string) => React.HTMLAttributes<HTMLDivElement>,
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  onStartRest: (s: number) => void,
  exerciseLookup: Record<string, Exercise>,
  lastSessionMap: Record<string, LastSession>,
  onShowHistory: (exId: string, name: string) => void,
  nextTarget: NextTarget
) {
  const key = workoutItemKey(item)
  const dt = dropTarget
  const isTarget = dt?.targetKey === key
  const showLineBefore = !!(isTarget && dt?.type === "before")
  const showLineAfter = !!(isTarget && dt?.type === "after")
  const allDone = item.exerciseIds.every((id) =>
    exData[id]?.sets.every((s) => s.completed)
  )
  const groupSets = item.exerciseIds.reduce(
    (acc, id) => {
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
      ref={(el) => {
        if (el) itemRefs.current.set(key, el)
        else itemRefs.current.delete(key)
      }}
      className={cn(
        "relative overflow-hidden rounded-[20px] border bg-card transition-[border-color,opacity,transform] duration-150 md:rounded-[22px]",
        allDone ? "border-primary/25" : "border-border/55",
        drag?.itemKey === key && drag.active && "scale-[0.985] opacity-25"
      )}
    >
      {showLineBefore && (
        <div className="pointer-events-none absolute -top-[5px] right-4 left-4 z-10 h-[2.5px] rounded-full bg-primary/40" />
      )}
      {showLineAfter && (
        <div className="pointer-events-none absolute right-4 -bottom-[5px] left-4 z-10 h-[2.5px] rounded-full bg-primary/40" />
      )}
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          background: allDone
            ? "color-mix(in srgb, var(--primary) 36%, transparent)"
            : "color-mix(in srgb, var(--muted-foreground) 18%, transparent)",
          opacity: 0.85,
        }}
      />
      <div
        className="flex items-center justify-between gap-3 border-b border-border/45 bg-muted/10 px-4 py-3"
        style={{
          paddingLeft: "calc(1rem + 4px)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div
            {...makeDragHandlers(key)}
            role="button"
            aria-label="Reorder superset"
            className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground/35 transition-colors select-none active:cursor-grabbing active:bg-muted/50 active:text-muted-foreground/70"
          >
            <DotsSixVertical size={15} weight="bold" />
          </div>
          <div className="min-w-0">
            <span className="text-[10.5px] font-bold tracking-[0.14em] text-muted-foreground/75 uppercase">
              Superset
            </span>
            <p className="mt-1 truncate text-[12px] text-muted-foreground/55">
              {item.exerciseIds.length} exercises
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-semibold tabular-nums",
            allDone
              ? "bg-primary/[0.10] text-primary"
              : "bg-muted/45 text-muted-foreground/70"
          )}
        >
          {groupSets.done}/{groupSets.total}
        </span>
      </div>
      <div className="flex flex-col pl-[3px]">
        {item.exerciseIds.map((exId) => {
          const ex = exerciseLookup[exId]
          if (!ex || !exData[exId]) return null
          return (
            <ActiveExerciseCard
              key={exId}
              exercise={ex}
              data={exData[exId]}
              unit={unit}
              onUpdate={(d) => updateExData(exId, d)}
              onRemove={() => removeExercise(exId)}
              isDragging={false}
              showLineBefore={false}
              showLineAfter={false}
              inSuperset
              collapsed={Boolean(collapsed[exId])}
              onToggleCollapse={() => toggleCollapsed(exId)}
              cardRef={() => undefined}
              onStartRest={onStartRest}
              lastSession={lastSessionMap[exId] ?? null}
              onShowHistory={() => onShowHistory(exId, ex.name)}
              nextSetIndex={
                nextTarget?.exerciseId === exId ? nextTarget.setIndex : null
              }
            />
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
export default function ActiveWorkout() {
  const { presetId } = useParams<{ presetId?: string }>()
  const navigate = useSmoothNavigate()
  const posthog = usePostHog()
  const [searchParams] = useSearchParams()
  const slot = (Number(searchParams.get("slot") ?? "1") || 1) as 1 | 2

  const presets = useQuery(api.logs.presets.list, {})
  const logCompletion = useOfflineMutation(
    api.logs.workouts.completion,
    "logs.workouts.completion"
  )
  const workoutHistory = useQuery(api.logs.workouts.getHistory)

  // Active workout Convex sync
  const activeWorkout = useQuery(api.logs.activeWorkout.getActive, { slot })
  const createActive = useMutation(api.logs.activeWorkout.createActive)
  const updateActive = useMutation(api.logs.activeWorkout.updateActive)
  const abortActive = useMutation(api.logs.activeWorkout.abortActive)
  const finishActive = useMutation(api.logs.activeWorkout.finishActive)

  const [items, setItems] = useState<WorkoutItem[]>([])
  const [exData, setExData] = useState<Record<string, ExerciseState>>({})
  const [exerciseLookup, setExerciseLookup] = useState<
    Record<string, Exercise>
  >({})
  const preferences = useQuery(api.users.users.getPreferences)
  const [unit, setUnit] = useState<WeightUnit>("kg")
  const [confirmAbort, setConfirmAbort] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [historySheet, setHistorySheet] = useState<{
    exerciseId: string
    name: string
  } | null>(null)
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const elapsed = useElapsedTimer(activeWorkout?.startedAt ?? null)
  const rest = useRestCountdown()

  // Track if we've initialized from Convex to avoid overwriting user's workout data
  const [isInitialized, setIsInitialized] = useState(false)
  // Debounce sync to Convex
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSyncingRef = useRef(false)
  const isDirtyRef = useRef(false)
  // Refs to capture current state for sync
  const itemsRef = useRef(items)
  const exDataRef = useRef(exData)
  const elapsedRef = useRef(elapsed)
  const slotRef = useRef(slot)

  // Keep refs in sync with state
  useEffect(() => {
    itemsRef.current = items
    isDirtyRef.current = true
  }, [items])
  useEffect(() => {
    exDataRef.current = exData
    isDirtyRef.current = true
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
  const { total: totalSets, done: doneSets } = countSets(items, exData)

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

  // Find the next set to highlight
  const nextTarget = useMemo(
    () => findNextTarget(items, exData),
    [items, exData]
  )

  // ── Sync state to Convex (debounced) ──────────────────────────────────────
  const syncToConvex = useCallback(() => {
    if (!isDirtyRef.current) return
    if (isSyncingRef.current) return

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    syncTimeoutRef.current = setTimeout(async () => {
      if (!isDirtyRef.current) return
      isSyncingRef.current = true
      try {
        await updateActive({
          slot: slotRef.current,
          items: itemsRef.current,
          exerciseData: exDataRef.current,
          elapsedSeconds: elapsedRef.current,
        })
        isDirtyRef.current = false
      } catch (err) {
        console.warn("Failed to sync workout to Convex:", err)
      } finally {
        isSyncingRef.current = false
      }
    }, 500) // Debounce 500ms
  }, [updateActive])

  // ── Load from Convex or preset on mount ────────────────────────────────────
  useEffect(() => {
    if (isInitialized) return

    // If there's an active workout in Convex, load it
    if (activeWorkout) {
      setIsInitialized(true)
      const loadedItems = (activeWorkout.items as WorkoutItem[]) ?? []
      const loadedExData =
        (activeWorkout.exerciseData as Record<string, ExerciseState>) ?? {}

      setItems(loadedItems)
      setExData(
        Object.fromEntries(
          Object.entries(loadedExData).map(([exerciseId, state]) => [
            exerciseId,
            normalizeExerciseState(state),
          ])
        )
      )

      // Load exercise details
      const ids = loadedItems.flatMap((i) =>
        i.kind === "solo" ? [i.exerciseId] : i.exerciseIds
      )
      if (ids.length > 0) {
        void resolveExerciseIds(ids).then((lookup) => {
          setExerciseLookup((prev) => ({
            ...prev,
            ...(lookup as Record<string, Exercise>),
          }))
        })
      }
      return
    }

    // If no Convex state, try to load from preset
    if (presetId && presets) {
      const match = presets.find((p) => (p.id ?? p._id) === presetId)
      if (match) {
        setIsInitialized(true)
        const loadedItems = (match.items as WorkoutItem[]) ?? []
        const loadedExData =
          (match.exerciseData as Record<string, ExerciseState>) ?? {}

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
          void resolveExerciseIds(ids).then((lookup) => {
            setExerciseLookup((prev) => ({
              ...prev,
              ...(lookup as Record<string, Exercise>),
            }))
          })
        }
      }
    }
  }, [isInitialized, presetId, presets, activeWorkout])

  // ── Create active workout in Convex when items are loaded ─────────────────
  useEffect(() => {
    if (!isInitialized) return
    if (items.length === 0) return
    if (activeWorkout) return // Already have an active workout

    const ids = items.flatMap((i) =>
      i.kind === "solo" ? [i.exerciseId] : i.exerciseIds
    )
    if (ids.length > 0) {
      void createActive({
        slot,
        presetId: presetId ?? undefined,
        items,
        exerciseData: exData,
      })
    }
  }, [
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
  }, [isInitialized, items, exData])

  // Sync elapsed time every 5 seconds
  useEffect(() => {
    if (!isInitialized) return
    if (elapsed % 5 !== 0) return // Only sync every 5 seconds for elapsed time
    syncToConvex()
  }, [isInitialized, elapsed, syncToConvex])

  useEffect(() => {
    if (preferences?.weightUnit) {
      setUnit(preferences.weightUnit as WeightUnit)
    }
  }, [preferences])

  useEffect(() => {
    if (isInitialized) {
      posthog.capture("workout_started", { preset_id: presetId ?? null })
    }
  }, [isInitialized, presetId, posthog])

  function addExercise(ex: Exercise) {
    const id = ex.id
    setExerciseLookup((prev) => ({ ...prev, [id]: ex }))
    setItems((prev) => [...prev, { kind: "solo", exerciseId: id }])
    setExData((prev) => ({
      ...prev,
      [id]: {
        sets: [makeSet(), makeSet(), makeSet()],
        trackRpe: false,
        trackUnilateral: false,
      },
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
  function updateExData(id: string, data: ExerciseState) {
    setExData((prev) => ({ ...prev, [id]: data }))
  }
  function toggleCollapsed(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }
  function calcDropTarget(x: number, y: number, draggedKey: string): DropTarget {
    for (const [targetKey, el] of itemRefs.current) {
      if (targetKey === draggedKey) continue
      const rect = el.getBoundingClientRect()
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
        continue
      const relY = (y - rect.top) / rect.height
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
  }, [drag, dropTarget])

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

  function executeDrop(draggedKey: string, zone: DropTarget) {
    if (!zone) return

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

      const insertAt = zone.type === "before" ? targetIdx : targetIdx + 1
      return [
        ...nextItems.slice(0, insertAt),
        draggedItem,
        ...nextItems.slice(insertAt),
      ]
    })
  }

  async function handleFinish() {
    const exercises = items.flatMap((item) => {
      const ids = item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
      return ids.flatMap((id) => {
        const ex = exerciseLookup[id]
        const data = exData[id]
        if (!ex || !data) return []
        return [
          {
            id,
            name: ex.name,
            sets: data.sets
              .filter((s) => s.completed)
              .map((s) => ({
                type: "normal",
                weight: parseFloat(String(s.weight)) || 0,
                reps: parseFloat(String(s.reps)) || 0,
                completed: s.completed,
              })),
          },
        ]
      })
    })
    try {
      // Finish the active workout in Convex (this also logs it)
      await finishActive({
        slot,
        exercises,
        durationSeconds: elapsed,
      })
      posthog.capture("workout_completed", {
        preset_id: presetId ?? null,
        duration_seconds: elapsed,
        exercise_count: exercises.length,
        total_sets: exercises.reduce(
          (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
          0
        ),
      })
      navigate(-1)
    } catch (err) {
      console.error("Failed to finish workout:", err)
      // Fallback to old method if Convex fails
      try {
        await logCompletion({
          date: todayIso(),
          exercises,
          durationSeconds: elapsed,
        })
        navigate(-1)
      } catch (fallbackErr) {
        console.error("Failed to log workout as fallback:", fallbackErr)
      }
    }
  }

  function cardProps(itemKey: string, inSuperset = false): ExerciseCardDropProps {
    const dt = dropTarget
    const isTarget = dt?.targetKey === itemKey
    if (inSuperset)
      return {
        showLineBefore: false,
        showLineAfter: false,
      }
    return {
      showLineBefore: isTarget && dt?.type === "before",
      showLineAfter: isTarget && dt?.type === "after",
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto flex max-w-xl flex-col pb-[calc(var(--app-safe-bottom-lg)+7rem)] md:max-w-5xl md:pb-10 xl:max-w-6xl">
        <div className="sticky top-0 z-30 border-b border-border/45 bg-background/95 backdrop-blur-xl">
          <div
            className="flex items-center gap-3 px-4 md:px-6"
            style={{
              paddingTop:
                "max(1rem, calc(env(safe-area-inset-top, 0px) + 0.75rem))",
              paddingBottom: "0.625rem",
            }}
          >
            <button
              onClick={() => setConfirmAbort(true)}
              className="flex h-10 items-center gap-1.5 rounded-[18px] px-3 text-[13px] font-semibold text-muted-foreground/70 transition-colors active:bg-muted/50 active:text-foreground md:h-11 md:rounded-[20px]"
            >
              <X size={15} weight="bold" />
              Abort
            </button>
            <div className="flex flex-1 flex-col items-center">
              <span
                className="text-[27px] leading-none font-black tracking-tight tabular-nums md:text-[30px]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatElapsed(elapsed)}
              </span>
              <span className="mt-1 text-[10px] font-bold tracking-[0.16em] text-muted-foreground/55 uppercase">
                elapsed
              </span>
            </div>
            <button
              onClick={() => setConfirmFinish(true)}
              className="flex h-10 items-center gap-1.5 rounded-[18px] bg-foreground px-4 text-[14px] font-bold text-background shadow-sm shadow-black/[0.06] transition-opacity active:opacity-85 md:h-11 md:rounded-[20px]"
            >
              Finish
              <Check size={16} weight="bold" />
            </button>
          </div>
          <div className="px-4 pb-3 md:px-6 md:pb-2.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold tracking-[0.16em] text-muted-foreground/55 uppercase">
                    Active Workout
                  </span>
                  {slot === 2 && (
                    <span className="rounded-full bg-muted/55 px-2 py-0.5 text-[9px] font-bold text-muted-foreground/80 uppercase">
                      Slot 2
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] font-medium text-muted-foreground/60">
                  {doneSets}/{totalSets} sets complete
                </p>
              </div>
              <div className="ml-auto flex h-11 shrink-0 overflow-hidden rounded-[20px] border border-border/45 bg-muted/35 text-[11px] font-bold">
                {(["kg", "lbs"] as WeightUnit[]).map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnit(u)}
                    className={cn(
                      "min-w-12 px-3 transition-all duration-150",
                      unit === u
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground/65 active:bg-muted/60 active:text-foreground"
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/55">
              <div
                className="h-full rounded-full bg-primary/45 transition-all duration-500 ease-out"
                style={{ width: progressPct }}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 px-4 pt-4 md:px-6">
          <div className="flex flex-col gap-3 md:gap-2.5">
            {items.map((item) => {
              if (item.kind === "solo") {
                const ex = exerciseLookup[item.exerciseId]
                if (!ex) return null
                const key = workoutItemKey(item)
                return (
                  <ActiveExerciseCard
                    key={item.exerciseId}
                    exercise={ex}
                    data={exData[item.exerciseId]}
                    unit={unit}
                    onUpdate={(d) => updateExData(item.exerciseId, d)}
                    onRemove={() => removeExercise(item.exerciseId)}
                    isDragging={drag?.itemKey === key && drag.active}
                    {...cardProps(key)}
                    collapsed={Boolean(collapsed[item.exerciseId])}
                    onToggleCollapse={() => toggleCollapsed(item.exerciseId)}
                    dragHandlers={makeDragHandlers(key)}
                    cardRef={(el) => {
                      if (el) itemRefs.current.set(key, el)
                      else itemRefs.current.delete(key)
                    }}
                    onStartRest={rest.start}
                    lastSession={lastSessionMap[item.exerciseId] ?? null}
                    onShowHistory={() =>
                      setHistorySheet({
                        exerciseId: item.exerciseId,
                        name: ex.name,
                      })
                    }
                    nextSetIndex={
                      nextTarget?.exerciseId === item.exerciseId
                        ? nextTarget.setIndex
                        : null
                    }
                  />
                )
              }
              return renderSupersetItem(
                item,
                exData,
                unit,
                updateExData,
                removeExercise,
                drag,
                dropTarget,
                collapsed,
                toggleCollapsed,
                makeDragHandlers,
                itemRefs,
                rest.start,
                exerciseLookup,
                lastSessionMap,
                (exId, name) => setHistorySheet({ exerciseId: exId, name }),
                nextTarget
              )
            })}
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-[24px] border border-dashed border-border/50 text-[13px] font-medium text-muted-foreground/50 transition-colors active:bg-muted/25 active:text-foreground"
          >
            <Plus size={14} weight="bold" />
            Add exercise
          </button>
        </div>
      </div>
      {rest.remaining !== null && (
        <RestCountdownBanner
          remaining={rest.remaining}
          onDismiss={rest.dismiss}
        />
      )}
      {searchOpen && (
        <AddExerciseSheet
          addedIds={uniqueExerciseIds}
          onAdd={addExercise}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {confirmFinish && (
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
              await abortActive({ slot })
              navigate(-1)
            } catch (err) {
              console.error("Failed to abort workout in Convex:", err)
              // Clear pending sync timer on error
              if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current)
                syncTimeoutRef.current = null
              }
              toast.error("Failed to abort workout. Please try again.")
            }
          }}
          onCancel={() => setConfirmAbort(false)}
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
    </div>
  )
}
