import React, { useEffect, useRef, useState } from "react"
import { useParams } from "react-router"
import { usePostHog } from "@posthog/react"
import { useAction, useQuery } from "convex/react"
import { toast } from "sonner"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import {
  ArrowLeft,
  Barbell,
  CaretDown,
  CaretUp,
  DotsSixVertical,
  Fire,
  FloppyDisk,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Timer,
  Wind,
  X,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  resolveExerciseIds,
  searchExercises,
  type Exercise,
  type ExerciseCategory,
} from "@/lib/exercise-catalog"
import { api } from "../../../../convex/_generated/api"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui"
import {
  APP_ACCENT_COLORS,
  CUSTOM_CATEGORY_TONES,
  EXERCISE_CATEGORY_COLORS,
  SET_TYPE_TONES,
} from "@/lib/design-tokens"
import { useAiFeatureGate } from "@/lib/ai-access"

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = ExerciseCategory
type SetType = "working" | "warmup" | "failure" | "myoreps" | "drop"

type WorkoutSet = {
  id: string
  type: SetType
  weight: string
  reps: string
  leftReps: string
  rightReps: string
  rpe: string
  restSeconds: number
}

type ExerciseState = {
  sets: WorkoutSet[]
  trackRpe: boolean
  trackUnilateral: boolean
}

type PresetItem =
  | { kind: "solo"; exerciseId: string }
  | { kind: "superset"; id: string; color: string; exerciseIds: string[] }

type DragInfo = {
  exerciseId: string
  x: number
  y: number
  startX: number
  startY: number
  active: boolean
}

type DropTarget = {
  type: "before" | "after" | "superset"
  targetExId: string
} | null

type AgentPresetMode = "replace" | "append"

type AgentPresetSetDraft = Partial<WorkoutSet>

type AgentPresetExerciseDraft = {
  name: string
  sets?: AgentPresetSetDraft[]
  trackRpe?: boolean
  trackUnilateral?: boolean
}

type AgentPresetDraft = {
  name?: string
  exercises?: AgentPresetExerciseDraft[]
  notes?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<Category, React.FC<any>> = {
  strength: Barbell as React.FC<any>,
  cardio: Fire as React.FC<any>,
  mobility: Wind as React.FC<any>,
  core: Sparkle as React.FC<any>,
}

const CATEGORY_COLOR: Record<Category, string> = {
  strength: EXERCISE_CATEGORY_COLORS.strength,
  cardio: EXERCISE_CATEGORY_COLORS.cardio,
  mobility: EXERCISE_CATEGORY_COLORS.mobility,
  core: EXERCISE_CATEGORY_COLORS.core,
}

const SET_ORDER: SetType[] = ["working", "warmup", "failure", "myoreps", "drop"]

const SET_CFG: Record<SetType, { label: string; color: string; bg: string }> = {
  working: {
    label: "Working",
    color: SET_TYPE_TONES.working.color,
    bg: SET_TYPE_TONES.working.bg,
  },
  warmup: {
    label: "Warm-up",
    color: SET_TYPE_TONES.warmup.color,
    bg: SET_TYPE_TONES.warmup.bg,
  },
  failure: {
    label: "Failure",
    color: SET_TYPE_TONES.failure.color,
    bg: SET_TYPE_TONES.failure.bg,
  },
  myoreps: {
    label: "Myo-reps",
    color: SET_TYPE_TONES.myoreps.color,
    bg: SET_TYPE_TONES.myoreps.bg,
  },
  drop: {
    label: "Drop set",
    color: SET_TYPE_TONES.drop.color,
    bg: SET_TYPE_TONES.drop.bg,
  },
}

const SUPERSET_PALETTE = CUSTOM_CATEGORY_TONES.map((tone) => tone.color)

const REST_OPTS = [0, 30, 60, 90, 120, 150, 180, 240, 300]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2)
}

type WeightUnit = "kg" | "lbs"

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

// Weight stored internally as kg strings; converted for display
function toDisplay(kgStr: string, unit: WeightUnit): string {
  if (!kgStr) return ""
  const kg = parseFloat(kgStr)
  if (isNaN(kg)) return kgStr
  if (unit === "lbs") return String(+(kg * 2.20462).toFixed(1))
  return kgStr
}

function toKg(displayVal: string, unit: WeightUnit): string {
  if (!displayVal) return ""
  const n = parseFloat(displayVal)
  if (isNaN(n)) return displayVal
  if (unit === "lbs") return String(+(n / 2.20462).toFixed(2))
  return displayVal
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
  }
}

function normalizeSet(set: Partial<WorkoutSet> | undefined): WorkoutSet {
  return {
    id: set?.id ?? uid(),
    type: set?.type ?? "working",
    weight: set?.weight ?? "",
    reps: set?.reps ?? "",
    leftReps: set?.leftReps ?? "",
    rightReps: set?.rightReps ?? "",
    rpe: set?.rpe ?? "",
    restSeconds: set?.restSeconds ?? 120,
  }
}

function normalizeExerciseState(
  state: Partial<ExerciseState> | undefined
): ExerciseState {
  return {
    sets: (state?.sets ?? []).map((set) => normalizeSet(set)),
    trackRpe: Boolean(state?.trackRpe),
    trackUnilateral: Boolean(state?.trackUnilateral),
  }
}

function isCardioExercise(exercise: Exercise | undefined | null) {
  return exercise?.category === "cardio"
}

function makeExerciseState(exercise: Exercise): ExerciseState {
  return {
    sets: isCardioExercise(exercise) ? [] : [makeSet()],
    trackRpe: false,
    trackUnilateral: false,
  }
}

function sanitizeExerciseDataForSave(
  items: PresetItem[],
  exData: Record<string, ExerciseState>,
  exerciseLookup: Record<string, Exercise>
) {
  const ids = new Set(
    items.flatMap((item) =>
      item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
    )
  )

  return Object.fromEntries(
    [...ids].map((id) => {
      const normalized = normalizeExerciseState(exData[id])
      if (isCardioExercise(exerciseLookup[id])) {
        return [
          id,
          {
            ...normalized,
            sets: [],
            trackRpe: false,
            trackUnilateral: false,
          },
        ]
      }
      return [id, normalized]
    })
  )
}

function removeExFromItems(items: PresetItem[], exId: string): PresetItem[] {
  return items.flatMap((item): PresetItem[] => {
    if (item.kind === "solo") return item.exerciseId === exId ? [] : [item]
    const rest = item.exerciseIds.filter((id) => id !== exId)
    if (rest.length === 0) return []
    if (rest.length === 1)
      return [{ kind: "solo" as const, exerciseId: rest[0] }]
    return [{ ...item, exerciseIds: rest }]
  })
}

function buildSummary(
  name: string,
  items: PresetItem[],
  exData: Record<string, ExerciseState>,
  exerciseLookup: Record<string, Exercise>
): {
  focus: "strength" | "cardio" | "mobility"
  duration: string
  steps: string[]
} {
  const categoryCounts = new Map<"strength" | "cardio" | "mobility", number>([
    ["strength", 0],
    ["cardio", 0],
    ["mobility", 0],
  ])

  let totalSets = 0
  let totalRestSeconds = 0
  let cardioCount = 0

  const steps = items.flatMap((item) => {
    const ids = item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
    const resolved = ids
      .map((id) => exerciseLookup[id])
      .filter((ex): ex is Exercise => Boolean(ex))

    for (const ex of resolved) {
      categoryCounts.set(
        ex.category as "strength" | "cardio" | "mobility",
        (categoryCounts.get(
          ex.category as "strength" | "cardio" | "mobility"
        ) ?? 0) + 1
      )
    }

    for (const id of ids) {
      if (isCardioExercise(exerciseLookup[id])) {
        cardioCount += 1
        continue
      }
      const state = exData[id]
      totalSets += state?.sets.length ?? 0
      totalRestSeconds +=
        state?.sets.reduce((sum, set) => sum + set.restSeconds, 0) ?? 0
    }

    if (resolved.length === 0) {
      return [item.kind === "solo" ? "Exercise" : "Superset"]
    }

    if (item.kind === "superset") {
      return [`Superset: ${resolved.map((ex) => ex.name).join(" + ")}`]
    }

    return [resolved[0].name]
  })

  const focus =
    [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "strength"
  const minutes = Math.max(
    15,
    Math.round(
      8 +
        items.length * 4 +
        cardioCount * 20 +
        totalSets * 1.2 +
        totalRestSeconds / 180
    )
  )

  return {
    focus,
    duration: `${minutes} min`,
    steps: steps.length > 0 ? steps : [name],
  }
}

function normalizeExerciseNameForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function scoreExerciseMatch(query: string, exercise: Exercise) {
  const q = normalizeExerciseNameForMatch(query)
  const name = normalizeExerciseNameForMatch(exercise.name)
  if (!q || !name) return 0
  if (q === name) return 100
  if (name.includes(q) || q.includes(name)) return 85

  const qTokens = new Set(q.split(" ").filter((token) => token.length > 2))
  const haystack = normalizeExerciseNameForMatch(
    [
      exercise.name,
      exercise.muscle,
      exercise.equipment,
      ...(exercise.primaryMuscles ?? []),
      ...(exercise.secondaryMuscles ?? []),
    ]
      .filter(Boolean)
      .join(" ")
  )
  const matches = [...qTokens].filter((token) => haystack.includes(token))
  return matches.length * 12 - Math.max(0, qTokens.size - matches.length) * 3
}

function pickBestExerciseMatch(query: string, candidates: Exercise[]) {
  const best = candidates
    .map((exercise) => ({
      exercise,
      score: scoreExerciseMatch(query, exercise),
    }))
    .sort((a, b) => b.score - a.score)[0]
  return best && best.score > 0 ? best.exercise : undefined
}

function normalizeAgentSet(set: AgentPresetSetDraft): WorkoutSet {
  const type = SET_ORDER.includes(set.type as SetType)
    ? (set.type as SetType)
    : "working"
  const restSeconds = Number.isFinite(Number(set.restSeconds))
    ? Math.max(0, Math.min(600, Math.round(Number(set.restSeconds))))
    : 120

  return normalizeSet({
    ...set,
    id: uid(),
    type,
    weight: String(set.weight ?? "").trim(),
    reps: String(set.reps ?? "").trim(),
    leftReps: String(set.leftReps ?? "").trim(),
    rightReps: String(set.rightReps ?? "").trim(),
    rpe: String(set.rpe ?? "").trim(),
    restSeconds,
  })
}

function makeExerciseStateFromAgentDraft(
  exercise: Exercise,
  draft: AgentPresetExerciseDraft
): ExerciseState {
  if (isCardioExercise(exercise)) return makeExerciseState(exercise)

  const sets =
    draft.sets && draft.sets.length > 0
      ? draft.sets.slice(0, 8).map((set) => normalizeAgentSet(set))
      : makeExerciseState(exercise).sets

  return {
    sets,
    trackRpe: Boolean(draft.trackRpe) || sets.some((set) => Boolean(set.rpe)),
    trackUnilateral:
      Boolean(draft.trackUnilateral) ||
      sets.some((set) => Boolean(set.leftReps || set.rightReps)),
  }
}

// ─── Rest timer sheet ─────────────────────────────────────────────────────────

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
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-2xl"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <Timer size={14} className="text-muted-foreground" />
            <span className="text-[13px] font-semibold">Rest Timer</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground/60 transition-colors active:bg-muted/60 active:text-foreground"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 p-4">
          {REST_OPTS.map((s) => (
            <button
              key={s}
              onClick={() => onSelect(s)}
              className={cn(
                "h-12 rounded-xl text-[13px] font-semibold tracking-tight transition-all active:scale-[0.985]",
                s === current
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-muted/60 text-foreground/80 active:bg-muted"
              )}
            >
              {formatRest(s)}
            </button>
          ))}
        </div>
        <div className="border-t border-border/50 px-4 pt-3 pb-4">
          <p className="mb-3 text-[10px] font-bold tracking-[0.18em] text-muted-foreground/45 uppercase">
            Custom rest
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
                className="h-11 rounded-xl border border-border/60 bg-background px-3 text-[15px] font-semibold tabular-nums outline-none focus:border-foreground/25"
              />
            </label>
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
                className="h-11 rounded-xl border border-border/60 bg-background px-3 text-[15px] font-semibold tabular-nums outline-none focus:border-foreground/25"
              />
            </label>
            <button
              onClick={() => onSelect(clampRestInput(minutes, secs))}
              className="h-11 shrink-0 rounded-xl bg-foreground px-4 text-[13px] font-semibold text-background transition-opacity active:opacity-80"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Set row ──────────────────────────────────────────────────────────────────

function SetRow({
  set,
  index,
  trackRpe,
  trackUnilateral,
  unit,
  onUpdate,
  onDelete,
  canDelete,
}: {
  set: WorkoutSet
  index: number
  trackRpe: boolean
  trackUnilateral: boolean
  unit: WeightUnit
  onUpdate: (s: WorkoutSet) => void
  onDelete: () => void
  canDelete: boolean
}) {
  const [showRest, setShowRest] = useState(false)
  const cfg = SET_CFG[set.type]

  function cycleType() {
    const i = SET_ORDER.indexOf(set.type)
    onUpdate({ ...set, type: SET_ORDER[(i + 1) % SET_ORDER.length] })
  }

  const fieldCls =
    "h-12 w-full rounded-lg border border-border/50 bg-background/80 text-center text-[16px] font-bold tabular-nums outline-none transition-all placeholder:text-muted-foreground/20 focus:border-foreground/40 focus:bg-background [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
  const repsModeKey = trackUnilateral ? "unilateral" : "bilateral"
  const trackingModeKey = `${repsModeKey}-${trackRpe ? "rpe" : "base"}`

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-3">
        {/* Set number */}
        <span className="w-5 shrink-0 text-center text-[11px] font-black text-muted-foreground/25 tabular-nums select-none">
          {index + 1}
        </span>

        {/* Type — tap to cycle */}
        <button
          onClick={cycleType}
          className="flex h-12 w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-lg px-1.5 transition-all select-none active:scale-[0.985]"
          style={{ backgroundColor: cfg.bg }}
          aria-label={`Set mode: ${cfg.label}. Tap to change.`}
          title={`Set mode: ${cfg.label}`}
        >
          <span
            className="truncate text-[11px] font-black"
            style={{ color: cfg.color }}
          >
            {cfg.label}
          </span>
        </button>

        {/* Weight */}
        <div className="flex flex-1 flex-col gap-0.5">
          <input
            type="number"
            inputMode="decimal"
            value={toDisplay(set.weight, unit)}
            onChange={(e) =>
              onUpdate({ ...set, weight: toKg(e.target.value, unit) })
            }
            placeholder="0"
            className={fieldCls}
          />
          <span className="text-center text-[8px] font-bold tracking-widest text-muted-foreground/30 uppercase">
            {unit}
          </span>
        </div>

        <span className="shrink-0 text-[13px] font-light text-muted-foreground/20 select-none">
          ×
        </span>

        <div
          key={trackingModeKey}
          className={cn(
            "flex min-w-0 flex-1 animate-in items-start gap-2 duration-200 fade-in-0 zoom-in-95 slide-in-from-bottom-1",
            trackUnilateral && "flex-[1.8]"
          )}
        >
          {/* Reps */}
          {trackUnilateral ? (
            <div className="grid min-w-0 flex-[1.5] grid-cols-2 gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <input
                  type="number"
                  inputMode="numeric"
                  value={set.leftReps}
                  onChange={(e) =>
                    onUpdate({ ...set, leftReps: e.target.value })
                  }
                  placeholder="0"
                  className={fieldCls}
                />
                <span className="text-center text-[8px] font-bold tracking-widest text-muted-foreground/30 uppercase">
                  left
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <input
                  type="number"
                  inputMode="numeric"
                  value={set.rightReps}
                  onChange={(e) =>
                    onUpdate({ ...set, rightReps: e.target.value })
                  }
                  placeholder="0"
                  className={fieldCls}
                />
                <span className="text-center text-[8px] font-bold tracking-widest text-muted-foreground/30 uppercase">
                  right
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-0.5">
              <input
                type="number"
                inputMode="numeric"
                value={set.reps}
                onChange={(e) => onUpdate({ ...set, reps: e.target.value })}
                placeholder="0"
                className={fieldCls}
              />
              <span className="text-center text-[8px] font-bold tracking-widest text-muted-foreground/30 uppercase">
                reps
              </span>
            </div>
          )}

          {/* RPE */}
          {trackRpe && (
            <div className="flex flex-1 animate-in flex-col gap-0.5 duration-200 fade-in-0 slide-in-from-right-1">
              <input
                type="number"
                inputMode="decimal"
                value={set.rpe}
                onChange={(e) => onUpdate({ ...set, rpe: e.target.value })}
                placeholder="—"
                min="1"
                max="10"
                step="0.5"
                className={fieldCls}
              />
              <span className="text-center text-[8px] font-bold tracking-widest text-muted-foreground/30 uppercase">
                rpe
              </span>
            </div>
          )}
        </div>

        {/* Rest */}
        <button
          onClick={() => setShowRest(true)}
          className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg border border-border/50 bg-background/80 px-2.5 py-2 transition-all active:scale-[0.985] active:bg-muted"
        >
          <div className="flex items-center gap-1">
            <Timer size={10} className="text-muted-foreground/50" />
            <span className="text-[13px] font-bold text-muted-foreground/70 tabular-nums">
              {formatRest(set.restSeconds)}
            </span>
          </div>
          <span className="text-[8px] font-bold tracking-widest text-muted-foreground/25 uppercase">
            rest
          </span>
        </button>

        {/* Delete */}
        {canDelete && (
          <button
            onClick={onDelete}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground/20 transition-colors active:bg-muted/50 active:text-destructive"
          >
            <X size={11} weight="bold" />
          </button>
        )}
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

// ─── Preset exercise card ─────────────────────────────────────────────────────

function PresetExerciseCard({
  exercise,
  data,
  unit,
  onUpdate,
  onRemove,
  isDragging,
  showLineBefore,
  showLineAfter,
  showSupersetRing,
  inSuperset,
  collapsed,
  onToggleCollapse,
  dragHandlers,
  cardRef,
}: {
  exercise: Exercise
  data: ExerciseState
  unit: WeightUnit
  onUpdate: (d: ExerciseState) => void
  onRemove: () => void
  isDragging: boolean
  showLineBefore: boolean
  showLineAfter: boolean
  showSupersetRing: boolean
  inSuperset?: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  dragHandlers: React.HTMLAttributes<HTMLDivElement>
  cardRef: (el: HTMLDivElement | null) => void
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

  const totalRest = data.sets.reduce((sum, set) => sum + set.restSeconds, 0)
  const isCardio = isCardioExercise(exercise)

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative flex overflow-hidden bg-card transition-all duration-150",
        inSuperset ? "" : "rounded-xl border border-border/60",
        isDragging && "scale-[0.97] opacity-20",
        showSupersetRing &&
          !inSuperset &&
          "ring-2 ring-offset-2 ring-offset-background"
      )}
      style={
        showSupersetRing && !inSuperset
          ? ({
              "--tw-ring-color": exercise.color + "80",
            } as React.CSSProperties)
          : undefined
      }
    >
      {/* Drop indicators */}
      {showLineBefore && (
        <div className="pointer-events-none absolute -top-[5px] right-3 left-3 z-10 h-[2px] rounded-full bg-foreground/60" />
      )}
      {showLineAfter && (
        <div className="pointer-events-none absolute right-3 -bottom-[5px] left-3 z-10 h-[2px] rounded-full bg-foreground/60" />
      )}

      {/* Left accent stripe */}
      <div
        className="w-[4px] shrink-0"
        style={{ backgroundColor: exercise.color }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Header row ──────────────────────────── */}
        <div className="flex items-center gap-2 pt-3 pr-3 pb-2 pl-3">
          {/* Drag handle */}
          <div
            {...dragHandlers}
            className="flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/20 transition-colors select-none active:cursor-grabbing active:text-muted-foreground/50"
          >
            <DotsSixVertical size={13} weight="bold" />
          </div>

          {/* Name & muscle */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] leading-tight font-black tracking-tight">
              {exercise.name}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/50">
              {collapsed
                ? isCardio
                  ? "Cardio"
                  : `${data.sets.length} set${data.sets.length !== 1 ? "s" : ""} · rest ${formatRest(totalRest)}`
                : exercise.muscle}
            </p>
          </div>

          {!isCardio && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-background/70 px-3 text-[10px] font-bold tracking-[0.16em] text-muted-foreground/65 uppercase transition-colors active:bg-muted/60"
                  aria-label={`Tracking options for ${exercise.name}`}
                >
                  Track
                  <span className="text-[9px] tracking-normal text-foreground/55">
                    {[data.trackRpe && "RPE", data.trackUnilateral && "UNI"]
                      .filter(Boolean)
                      .join(" · ") || "Off"}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-[10px] font-semibold tracking-[0.15em] uppercase">
                  ADVANCED TRACKING
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
          )}

          {/* Remove */}
          <button
            onClick={onRemove}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground/25 transition-colors active:bg-muted/50 active:text-destructive"
            aria-label={`Remove ${exercise.name}`}
          >
            <X size={12} weight="bold" />
          </button>

          <button
            onClick={onToggleCollapse}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground/35 transition-colors active:bg-muted/40 active:text-foreground"
            aria-label={
              collapsed
                ? `Expand ${exercise.name}`
                : `Collapse ${exercise.name}`
            }
          >
            {collapsed ? (
              <CaretDown size={12} weight="bold" />
            ) : (
              <CaretUp size={12} weight="bold" />
            )}
          </button>
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
            {isCardio ? (
              <div className="border-t border-border/40 px-3 py-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    "Distance",
                    "Duration",
                    "Pace",
                    "Heart rate",
                    "Zones",
                    "Route/source",
                  ].map((label) => (
                    <div
                      key={label}
                      className="min-w-0 rounded-lg border border-border/40 bg-background/70 px-3 py-2"
                    >
                      <span className="block truncate text-[10px] font-bold tracking-[0.14em] text-muted-foreground/45 uppercase">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* ── Sets ──────────────────────────────────── */}
                <div className="border-t border-border/40">
                  {data.sets.map((s, i) => (
                    <div
                      key={s.id}
                      className={i > 0 ? "border-t border-border/25" : ""}
                    >
                      <SetRow
                        set={s}
                        index={i}
                        trackRpe={data.trackRpe}
                        trackUnilateral={data.trackUnilateral}
                        unit={unit}
                        onUpdate={(updated) => updateSet(i, updated)}
                        onDelete={() => removeSet(i)}
                        canDelete={data.sets.length > 1}
                      />
                    </div>
                  ))}
                </div>

                {/* ── Add set ───────────────────────────────── */}
                <button
                  onClick={addSet}
                  className="flex w-full items-center gap-2 border-t border-border/30 px-4 py-2.5 text-left transition-colors active:bg-muted/30"
                >
                  <Plus
                    size={10}
                    weight="bold"
                    className="text-muted-foreground/40"
                  />
                  <span className="text-[11px] font-bold tracking-widest text-muted-foreground/40 uppercase">
                    Add set
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Search sheet ─────────────────────────────────────────────────────────────

function SearchSheet({
  addedIds,
  onToggle,
  onBodyClick,
  onClose,
}: {
  addedIds: string[]
  onToggle: (ex: Exercise) => void
  onBodyClick: (ex: Exercise) => void
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
      next.has(cat) ? next.delete(cat) : next.add(cat)
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
      className="fixed inset-0 z-40 md:flex md:justify-center md:bg-black/40 md:backdrop-blur-sm"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full flex-col bg-background md:mt-12 md:h-auto md:max-h-[76vh] md:max-w-lg md:self-start md:overflow-hidden md:rounded-2xl md:border md:border-border/60 md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar row */}
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
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
              className="h-11 w-full rounded-xl border border-border/60 bg-muted/40 pr-4 pl-10 text-[14px] transition-all outline-none placeholder:text-muted-foreground/35 focus:border-foreground/20 focus:bg-background"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground/40 active:text-foreground"
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="min-h-10 shrink-0 rounded-lg px-2 text-[13px] font-semibold text-muted-foreground transition-colors active:bg-muted/45 active:text-foreground"
          >
            Done
          </button>
        </div>

        {/* Filter tabs */}
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

        {/* Results */}
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
              {filtered.map((ex) => (
                <SearchExerciseCard
                  key={ex.id}
                  exercise={ex}
                  added={addedIds.includes(ex.id)}
                  onAdd={() => onToggle(ex)}
                  onBodyClick={() => onBodyClick(ex)}
                />
              ))}
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

// ─── Search exercise card ─────────────────────────────────────────────────────

function SearchExerciseCard({
  exercise,
  added,
  onAdd,
  onBodyClick,
}: {
  exercise: Exercise
  added: boolean
  onAdd: () => void
  onBodyClick: () => void
}) {
  return (
    <div className={cn("flex items-stretch", added && "opacity-60")}>
      {/* 3px accent stripe */}
      <div
        className="w-[3px] shrink-0 rounded-l-sm"
        style={{ backgroundColor: exercise.color }}
      />

      <button
        onClick={onBodyClick}
        className="flex min-w-0 flex-1 flex-col justify-center py-3.5 pr-2 pl-4 text-left active:bg-muted/40"
      >
        <p className="truncate text-[14px] leading-snug font-semibold">
          {exercise.name}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/55">
          {exercise.muscle}
        </p>
      </button>

      <button
        onClick={onAdd}
        className="flex items-center pr-4 pl-2 text-muted-foreground/40 transition-colors active:text-foreground"
        aria-label={added ? "Remove" : `Add ${exercise.name}`}
      >
        {added ? (
          <X size={14} weight="bold" className="text-foreground/40" />
        ) : (
          <Plus size={16} weight="bold" />
        )}
      </button>
    </div>
  )
}

// ─── Exercise detail modal ────────────────────────────────────────────────────

function ExerciseModal({
  exercise,
  added,
  onAdd,
  onClose,
}: {
  exercise: Exercise
  added: boolean
  onAdd: () => void
  onClose: () => void
}) {
  const Icon = CATEGORY_ICON[exercise.category]

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        className="sheet-panel w-full max-w-lg overflow-hidden rounded-t-3xl bg-card shadow-2xl"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Color bar */}
        <div
          className="h-1 w-full"
          style={{ backgroundColor: exercise.color }}
        />

        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-border/60" />
        </div>

        <div
          className="mx-5 flex h-32 items-center justify-center rounded-2xl"
          style={{ backgroundColor: exercise.color + "12" }}
        >
          <Icon size={48} weight="duotone" style={{ color: exercise.color }} />
        </div>

        <div className="px-5 pt-4">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] uppercase"
            style={{
              backgroundColor: exercise.color + "15",
              color: exercise.color,
            }}
          >
            <Icon size={9} weight="fill" />
            {exercise.category}
          </span>
          <h2 className="mt-2.5 text-[20px] leading-tight font-bold tracking-tight">
            {exercise.name}
          </h2>
          <p className="mt-1 text-[12px] font-medium text-muted-foreground/70">
            {exercise.muscle}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground/75">
            {exercise.description}
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-3">
            <Timer size={13} className="shrink-0 text-muted-foreground/60" />
            <span className="text-[12px] font-medium text-muted-foreground/70">
              Suggested volume
            </span>
            <span className="ml-auto text-[12px] font-bold tabular-nums">
              {exercise.sets}
            </span>
          </div>

          <button
            onClick={() => {
              onAdd()
              onClose()
            }}
            className={cn(
              "mt-3 h-12 w-full rounded-xl text-[14px] font-bold tracking-tight transition-all active:opacity-75",
              added
                ? "bg-muted text-muted-foreground"
                : "bg-foreground text-background shadow-sm"
            )}
          >
            {added ? "Remove from preset" : "Add to preset"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Paste-to-preset sheet ───────────────────────────────────────────────────

function PastePresetSheet({
  hasExisting,
  loading,
  onGenerate,
  onClose,
}: {
  hasExisting: boolean
  loading: boolean
  onGenerate: (text: string, mode: AgentPresetMode) => void | Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState("")
  const [mode, setMode] = useState<AgentPresetMode>("replace")
  const canGenerate = text.trim().length >= 8 && !loading

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[4px]"
      onClick={loading ? undefined : onClose}
    >
      <div
        className="sheet-panel w-full max-w-lg overflow-hidden rounded-t-3xl bg-card shadow-2xl"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border/60" />
        <div className="px-5 pt-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
              <Sparkle size={17} weight="fill" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black tracking-[0.2em] text-muted-foreground/45 uppercase">
                AI preset builder
              </p>
              <h2 className="mt-1 text-[19px] leading-tight font-black tracking-tight">
                Paste a workout plan
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
                Drop in coach notes, a split from the web, or your own rough
                plan. We'll match exercises and build editable sets.
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors active:bg-muted/60 active:text-foreground disabled:opacity-40"
            >
              <X size={15} weight="bold" />
            </button>
          </div>

          {hasExisting && (
            <div className="mt-5 grid grid-cols-2 rounded-2xl bg-muted/45 p-1 text-[12px] font-bold">
              {(["replace", "append"] as AgentPresetMode[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  disabled={loading}
                  className={cn(
                    "h-10 rounded-xl capitalize transition-all",
                    mode === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground/55 active:text-foreground"
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            placeholder={
              "Upper Body Strength\nBench press 4x6 @ 185 lb, rest 2 min\nPull-up 4xAMRAP\nSeated cable row 3x10\nLateral raise 3x15"
            }
            className="mt-5 min-h-52 w-full resize-none rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/30 focus:border-foreground/20 disabled:opacity-60"
          />

          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={() => void onGenerate(text.trim(), mode)}
              disabled={!canGenerate}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-[14px] font-black tracking-tight text-background transition-opacity active:opacity-80 disabled:opacity-35"
            >
              <Sparkle
                size={15}
                weight="fill"
                className={loading ? "animate-spin" : ""}
              />
              {loading ? "Building preset…" : "Create preset"}
            </button>
            <button
              onClick={onClose}
              disabled={loading}
              className="h-11 w-full rounded-xl bg-muted/55 text-[13px] font-semibold text-muted-foreground transition-colors active:bg-muted active:text-foreground disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewPreset() {
  const { id: presetId } = useParams<{ id?: string }>()
  const navigate = useSmoothNavigate()
  const posthog = usePostHog()
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()

  const presets = useQuery(api.logs.presets.list, {})
  const createPreset = useOfflineMutation(
    api.logs.presets.create,
    "logs.presets.create"
  )
  const updatePreset = useOfflineMutation(
    api.logs.presets.update,
    "logs.presets.update"
  )
  const createPresetDraft = useAction(api.logs.presetAgent.createFromText)

  const [confirming, setConfirming] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [presetName, setPresetName] = useState("")
  const [modalExercise, setModalExercise] = useState<Exercise | null>(null)
  const [items, setItems] = useState<PresetItem[]>([])
  const [exData, setExData] = useState<Record<string, ExerciseState>>({})
  const [exerciseLookup, setExerciseLookup] = useState<
    Record<string, Exercise>
  >({})
  const preferences = useQuery(api.users.users.getPreferences)
  const [unit, setUnit] = useState<WeightUnit>("kg")
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [saving, setSaving] = useState(false)
  const [generatingPreset, setGeneratingPreset] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const dragRef = useRef<DragInfo | null>(null)
  const dropTargetRef = useRef<DropTarget>(null)

  const addedIds = items.flatMap((item) =>
    item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
  )
  const isDirty = addedIds.length > 0 || presetName.trim().length > 0

  useEffect(() => {
    if (preferences?.weightUnit) {
      setUnit(preferences.weightUnit as WeightUnit)
    }
  }, [preferences])

  useEffect(() => {
    dragRef.current = drag
  }, [drag])

  useEffect(() => {
    dropTargetRef.current = dropTarget
  }, [dropTarget])

  useEffect(() => {
    if (!presetId || !presets) return

    const match = presets.find(
      (preset) => (preset.id ?? preset._id) === presetId
    )

    if (match) {
      const loadedItems = (match.items as PresetItem[]) ?? []
      setPresetName(match.name)
      setItems(loadedItems)
      setExData(
        Object.fromEntries(
          Object.entries(
            (match.exerciseData as Record<string, ExerciseState>) ?? {}
          ).map(([exerciseId, state]) => [
            exerciseId,
            normalizeExerciseState(state),
          ])
        )
      )
      // Resolve exercise metadata for all IDs in this preset
      const ids = loadedItems.flatMap((item) =>
        item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
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
  }, [presetId, presets])

  const loadingPreset = presetId !== undefined && presets === undefined

  // ── Save ──────────────────────────────────────────────────

  async function handleSave() {
    const summary = buildSummary(
      presetName.trim() || "Untitled Preset",
      items,
      exData,
      exerciseLookup
    )
    const exerciseData = sanitizeExerciseDataForSave(
      items,
      exData,
      exerciseLookup
    )
    const input = {
      name:
        summary.steps.length > 0
          ? presetName.trim() || "Untitled Preset"
          : "Untitled Preset",
      items,
      exerciseData,
      ...summary,
    }

    setSaving(true)
    try {
      if (presetId) {
        await updatePreset({ id: presetId as any, ...input })
      } else {
        await createPreset(input)
      }
      posthog.capture("workout_preset_saved", {
        preset_name: input.name,
        is_edit: Boolean(presetId),
        exercise_count: items.length,
      })
      navigate(-1)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save preset"
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateFromText(text: string, mode: AgentPresetMode) {
    if (!requireAiAccess()) return
    if (!text.trim()) return

    setGeneratingPreset(true)
    try {
      const draft = (await createPresetDraft({ text })) as AgentPresetDraft
      const draftExercises = (draft.exercises ?? []).filter((exercise) =>
        exercise.name?.trim()
      )

      if (draftExercises.length === 0) {
        throw new Error("I couldn't find any exercises in that text.")
      }

      const resolved = await Promise.all(
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

      const existingIds = new Set(mode === "append" ? addedIds : [])
      const seenIds = new Set<string>()
      const nextItems: PresetItem[] = []
      const nextExerciseData: Record<string, ExerciseState> = {}
      const nextExerciseLookup: Record<string, Exercise> = {}
      const unmatched: string[] = []

      for (const match of resolved) {
        const exercise = match.exercise
        if (!exercise) {
          unmatched.push(match.draftExercise.name)
          continue
        }
        if (seenIds.has(exercise.id) || existingIds.has(exercise.id)) continue

        seenIds.add(exercise.id)
        nextItems.push({ kind: "solo", exerciseId: exercise.id })
        nextExerciseData[exercise.id] = makeExerciseStateFromAgentDraft(
          exercise,
          match.draftExercise
        )
        nextExerciseLookup[exercise.id] = exercise
      }

      if (nextItems.length === 0) {
        throw new Error(
          mode === "append"
            ? "Those exercises are already in this preset."
            : "I couldn't match those exercises to the catalog."
        )
      }

      if (mode === "replace") {
        setItems(nextItems)
        setExData(nextExerciseData)
        setExerciseLookup(nextExerciseLookup)
        setCollapsed({})
      } else {
        setItems((prev) => [...prev, ...nextItems])
        setExData((prev) => ({ ...prev, ...nextExerciseData }))
        setExerciseLookup((prev) => ({ ...prev, ...nextExerciseLookup }))
      }

      const nextName = draft.name?.trim().slice(0, 40)
      if (nextName && (mode === "replace" || !presetName.trim())) {
        setPresetName(nextName)
      }

      posthog.capture("workout_preset_text_imported", {
        mode,
        matched_count: nextItems.length,
        unmatched_count: unmatched.length,
      })

      setPasteOpen(false)
      toast.success(
        unmatched.length > 0
          ? `Added ${nextItems.length} exercises. ${unmatched.length} couldn't be matched.`
          : `Created ${nextItems.length}-exercise preset draft`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create preset"
      )
    } finally {
      setGeneratingPreset(false)
    }
  }

  // ── Add / remove ──────────────────────────────────────────

  function removeExercise(id: string) {
    setItems((prev) => removeExFromItems(prev, id))
    setExData((prev) => {
      const n = { ...prev }
      delete n[id]
      return n
    })
  }

  function toggleAdd(ex: Exercise) {
    const id = ex.id
    if (addedIds.includes(id)) {
      removeExercise(id)
    } else {
      setExerciseLookup((prev) => ({ ...prev, [id]: ex }))
      setItems((prev) => [...prev, { kind: "solo", exerciseId: id }])
      setExData((prev) => ({
        ...prev,
        [id]: makeExerciseState(ex),
      }))
    }
  }

  function updateExData(id: string, data: ExerciseState) {
    setExData((prev) => ({ ...prev, [id]: data }))
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // ── Drag & drop ───────────────────────────────────────────

  function calcDropTarget(x: number, y: number, draggedId: string): DropTarget {
    for (const [exId, el] of cardRefs.current) {
      if (exId === draggedId) continue
      const rect = el.getBoundingClientRect()
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
        continue
      const relY = (y - rect.top) / rect.height
      if (relY < 0.25) return { type: "before", targetExId: exId }
      if (relY > 0.75) return { type: "after", targetExId: exId }
      return { type: "superset", targetExId: exId }
    }
    return null
  }

  useEffect(() => {
    if (!drag) return

    function handlePointerMove(event: PointerEvent) {
      setDrag((prev) => {
        if (!prev) return prev
        const moved =
          prev.active ||
          Math.hypot(event.clientX - prev.startX, event.clientY - prev.startY) >
            6
        const next = {
          ...prev,
          x: event.clientX,
          y: event.clientY,
          active: moved,
        }
        dragRef.current = next
        setDropTarget(
          moved
            ? calcDropTarget(event.clientX, event.clientY, prev.exerciseId)
            : null
        )
        return next
      })
    }

    function handlePointerEnd() {
      const currentDrag = dragRef.current
      if (currentDrag?.active) {
        executeDrop(currentDrag.exerciseId, dropTargetRef.current)
      }
      dragRef.current = null
      dropTargetRef.current = null
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
  }, [drag])

  function makeDragHandlers(
    exerciseId: string
  ): React.HTMLAttributes<HTMLDivElement> {
    return {
      onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
        event.preventDefault()
        event.stopPropagation()
        const nextDrag = {
          exerciseId,
          x: event.clientX,
          y: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
        }
        dragRef.current = nextDrag
        dropTargetRef.current = null
        setDrag(nextDrag)
        setDropTarget(null)
      },
    }
  }

  function executeDrop(draggedId: string, zone: DropTarget) {
    // Null drop: if the exercise was in a superset, eject it to the end as solo
    if (!zone) {
      setItems((prev) => {
        const inSuperset = prev.some(
          (item) =>
            item.kind === "superset" && item.exerciseIds.includes(draggedId)
        )
        if (!inSuperset) return prev
        const cleaned = removeExFromItems(prev, draggedId)
        return [...cleaned, { kind: "solo", exerciseId: draggedId }]
      })
      return
    }
    if (zone.type === "superset") {
      setItems((prev) => {
        const newItems = removeExFromItems(prev, draggedId)
        const tIdx = newItems.findIndex(
          (item) =>
            (item.kind === "solo" && item.exerciseId === zone.targetExId) ||
            (item.kind === "superset" &&
              item.exerciseIds.includes(zone.targetExId))
        )
        if (tIdx === -1) return prev
        const t = newItems[tIdx]
        const updated = [...newItems]
        if (t.kind === "solo") {
          const usedColors = newItems
            .filter(
              (i): i is Extract<PresetItem, { kind: "superset" }> =>
                i.kind === "superset"
            )
            .map((i) => i.color)
          const color =
            SUPERSET_PALETTE.find((c) => !usedColors.includes(c)) ??
            SUPERSET_PALETTE[0]
          updated[tIdx] = {
            kind: "superset",
            id: uid(),
            color,
            exerciseIds: [t.exerciseId, draggedId],
          }
        } else {
          updated[tIdx] = { ...t, exerciseIds: [...t.exerciseIds, draggedId] }
        }
        return updated
      })
    } else {
      setItems((prev) => {
        const newItems = removeExFromItems(prev, draggedId)
        const tIdx = newItems.findIndex(
          (item) =>
            (item.kind === "solo" && item.exerciseId === zone.targetExId) ||
            (item.kind === "superset" &&
              item.exerciseIds.includes(zone.targetExId))
        )
        if (tIdx === -1) return prev
        const insertAt = zone.type === "before" ? tIdx : tIdx + 1
        const solo: PresetItem = { kind: "solo", exerciseId: draggedId }
        return [
          ...newItems.slice(0, insertAt),
          solo,
          ...newItems.slice(insertAt),
        ]
      })
    }
  }

  // ── Render helpers ────────────────────────────────────────

  function cardProps(exId: string, inSuperset = false) {
    const dt = dropTarget
    const isTarget = dt?.targetExId === exId
    if (inSuperset) {
      return {
        showLineBefore: false,
        showLineAfter: false,
        showSupersetRing: isTarget && dt?.type === "superset",
      }
    }
    return {
      showLineBefore: isTarget && dt?.type === "before",
      showLineAfter: isTarget && dt?.type === "after",
      showSupersetRing: isTarget && dt?.type === "superset",
    }
  }

  function renderSoloItem(exerciseId: string) {
    const ex = exerciseLookup[exerciseId]
    if (!ex || !exData[exerciseId]) return null
    return (
      <PresetExerciseCard
        key={exerciseId}
        exercise={ex}
        data={exData[exerciseId]}
        unit={unit}
        onUpdate={(d) => updateExData(exerciseId, d)}
        onRemove={() => removeExercise(exerciseId)}
        isDragging={drag?.exerciseId === exerciseId && drag.active}
        {...cardProps(exerciseId)}
        collapsed={Boolean(collapsed[exerciseId])}
        onToggleCollapse={() => toggleCollapsed(exerciseId)}
        dragHandlers={makeDragHandlers(exerciseId)}
        cardRef={(el) => {
          if (el) cardRefs.current.set(exerciseId, el)
          else cardRefs.current.delete(exerciseId)
        }}
      />
    )
  }

  function renderSupersetItem(item: Extract<PresetItem, { kind: "superset" }>) {
    const dt = dropTarget
    const containerIsTarget = dt && item.exerciseIds.includes(dt.targetExId)
    const showLineBefore = !!(containerIsTarget && dt?.type === "before")
    const showLineAfter = !!(containerIsTarget && dt?.type === "after")

    return (
      <div
        key={item.id}
        className="relative overflow-hidden rounded-xl border border-border/60"
      >
        {showLineBefore && (
          <div className="pointer-events-none absolute -top-[5px] right-3 left-3 z-10 h-[2px] rounded-full bg-foreground/60" />
        )}
        {showLineAfter && (
          <div className="pointer-events-none absolute right-3 -bottom-[5px] left-3 z-10 h-[2px] rounded-full bg-foreground/60" />
        )}

        {/* Superset label bar */}
        <div
          className="flex items-center justify-between border-b border-border/50 py-2 pr-3.5"
          style={{
            paddingLeft: "calc(0.875rem + 4px)",
            borderLeftWidth: 4,
            borderLeftStyle: "solid",
            borderLeftColor: item.color,
          }}
        >
          <span
            className="text-[9px] font-black tracking-[0.22em] uppercase"
            style={{ color: item.color }}
          >
            Superset · {item.exerciseIds.length} exercises
          </span>
          <span className="text-[9px] font-bold tracking-widest text-muted-foreground/40 uppercase">
            drag out to split
          </span>
        </div>

        {/* Exercises — no extra borders, cards have their own left stripes */}
        <div className="flex flex-col gap-px bg-border/20">
          {item.exerciseIds.map((exId) => {
            const ex = exerciseLookup[exId]
            if (!ex || !exData[exId]) return null
            return (
              <PresetExerciseCard
                key={exId}
                exercise={ex}
                data={exData[exId]}
                unit={unit}
                onUpdate={(d) => updateExData(exId, d)}
                onRemove={() => removeExercise(exId)}
                isDragging={drag?.exerciseId === exId && drag.active}
                {...cardProps(exId, true)}
                inSuperset
                collapsed={Boolean(collapsed[exId])}
                onToggleCollapse={() => toggleCollapsed(exId)}
                dragHandlers={makeDragHandlers(exId)}
                cardRef={(el) => {
                  if (el) cardRefs.current.set(exId, el)
                  else cardRefs.current.delete(exId)
                }}
              />
            )
          })}
        </div>
      </div>
    )
  }

  const ghostEx = drag?.active
    ? (exerciseLookup[drag.exerciseId] ?? null)
    : null

  // ─────────────────────────────────────────────────────────

  return (
    <div className="desktop-canvas min-h-svh bg-background">
      <div className="mx-auto w-full max-w-lg pb-[calc(var(--app-safe-bottom-lg)+6.5rem)] md:max-w-3xl md:pb-10">
        {/* ── Navigation bar ──────────────────────────── */}
        <div
          className="flex items-center px-[var(--app-page-x)] md:px-8"
          style={{
            paddingTop: "max(3.25rem, env(safe-area-inset-top, 3.25rem))",
            paddingBottom: "0.75rem",
          }}
        >
          <button
            onClick={() => {
              if (isDirty) setConfirming(true)
              else navigate(-1)
            }}
            className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors active:bg-muted/45 active:text-foreground"
          >
            <ArrowLeft size={14} weight="bold" />
            Back
          </button>

          <button
            onClick={() => void handleSave()}
            disabled={addedIds.length === 0 || saving || loadingPreset}
            className="ml-auto flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-foreground transition-colors active:bg-muted/45 disabled:text-muted-foreground/30"
          >
            <FloppyDisk
              size={14}
              weight="bold"
              className={saving ? "animate-spin" : ""}
            />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {/* ── Hero: Preset name ────────────────────────── */}
        <div className="px-[var(--app-page-x)] pt-3 pb-6 md:px-8">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder={
              loadingPreset ? "Loading preset..." : "Untitled Preset"
            }
            maxLength={40}
            disabled={loadingPreset}
            className="app-display min-h-12 w-full bg-transparent text-[2rem] outline-none placeholder:text-muted-foreground/20"
          />
          <div className="mt-2 flex items-center gap-3">
            {addedIds.length > 0 && (
              <p className="text-[12px] font-medium text-muted-foreground/50">
                {addedIds.length} exercise{addedIds.length !== 1 ? "s" : ""}
              </p>
            )}
            {/* kg / lbs toggle */}
            <div className="app-segmented ml-auto grid grid-cols-2 text-[11px] font-bold">
              {(["kg", "lbs"] as WeightUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={cn(
                    "app-segmented-button min-h-10 min-w-10 px-3 transition-all duration-150",
                    unit === u
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground/60 active:text-foreground"
                  )}
                  data-active={unit === u}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-[var(--app-page-x)] md:px-8">
          {/* ── Exercise list ──────────────────────────── */}
          {items.length > 0 && (
            <div className="flex flex-col gap-3">
              {items.map((item) =>
                item.kind === "solo"
                  ? renderSoloItem(item.exerciseId)
                  : renderSupersetItem(item)
              )}
            </div>
          )}

          {loadingPreset && (
            <div className="app-empty px-4 py-4 text-[13px] text-muted-foreground/60">
              Loading preset...
            </div>
          )}

          {/* ── Add exercise button ───────────────────── */}
          <button
            onClick={() => setSearchOpen(true)}
            className={cn(
              "app-empty flex h-14 w-full items-center gap-3 transition-all active:scale-[0.985]",
              items.length === 0
                ? "border-border bg-card active:bg-muted/40"
                : "border-dashed border-border/60 bg-transparent active:bg-muted/20"
            )}
          >
            <div
              className={cn(
                "ml-4 flex h-10 w-10 items-center justify-center rounded-[8px]",
                items.length === 0
                  ? "bg-foreground text-background"
                  : "border border-dashed border-muted-foreground/40 text-muted-foreground/50"
              )}
            >
              <Plus size={14} weight="bold" />
            </div>
            <span
              className={cn(
                "text-[14px] font-semibold",
                items.length === 0
                  ? "text-foreground"
                  : "text-muted-foreground/50"
              )}
            >
              {items.length === 0 ? "Add exercises" : "Add another exercise"}
            </span>
            {items.length === 0 && (
              <MagnifyingGlass
                size={14}
                className="mr-4 ml-auto text-muted-foreground/40"
              />
            )}
          </button>

          {/* ── Paste workout text button ───────────────── */}
          <button
            onClick={() => {
              if (requireAiAccess()) setPasteOpen(true)
            }}
            disabled={loadingPreset || generatingPreset}
            className="app-empty flex min-h-14 w-full items-center gap-3 border-dashed border-border/60 bg-transparent transition-all active:scale-[0.985] active:bg-muted/20 disabled:opacity-45"
          >
            <div className="ml-4 flex h-10 w-10 items-center justify-center rounded-[8px] bg-muted/70 text-foreground">
              <Sparkle
                size={14}
                weight="fill"
                className={generatingPreset ? "animate-spin" : ""}
              />
            </div>
            <span className="text-left text-[14px] font-semibold text-muted-foreground/65">
              Paste workout text
            </span>
            <span className="mr-4 ml-auto rounded-full bg-foreground px-2 py-1 text-[9px] font-black tracking-widest text-background uppercase">
              AI
            </span>
          </button>
        </div>
      </div>

      {/* ── Drag ghost ────────────────────────────────────── */}
      {ghostEx &&
        drag &&
        (() => {
          const Icon = CATEGORY_ICON[ghostEx.category]
          return (
            <div
              className="pointer-events-none fixed z-[100] flex items-center gap-2.5 rounded-2xl border border-border/80 bg-card px-4 py-2.5 shadow-2xl"
              style={{
                left: drag.x + 16,
                top: drag.y - 22,
                transform: "rotate(2deg)",
                opacity: 0.95,
              }}
            >
              <div
                className="absolute top-0 right-0 left-0 h-[3px] rounded-t-2xl"
                style={{ backgroundColor: ghostEx.color }}
              />
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: ghostEx.color + "18" }}
              >
                <Icon
                  size={13}
                  weight="duotone"
                  style={{ color: ghostEx.color }}
                />
              </div>
              <span className="text-[13px] font-bold tracking-tight">
                {ghostEx.name}
              </span>
            </div>
          )
        })()}

      {/* ── Search sheet ─────────────────────────────────── */}
      {searchOpen && (
        <SearchSheet
          addedIds={addedIds}
          onToggle={toggleAdd}
          onBodyClick={(ex) => setModalExercise(ex)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* ── Paste-to-preset sheet ─────────────────────────── */}
      {pasteOpen && (
        <PastePresetSheet
          hasExisting={addedIds.length > 0}
          loading={generatingPreset}
          onGenerate={handleGenerateFromText}
          onClose={() => setPasteOpen(false)}
        />
      )}

      {/* ── Exercise detail modal ─────────────────────────── */}
      {modalExercise && (
        <ExerciseModal
          exercise={modalExercise}
          added={addedIds.includes(modalExercise.id)}
          onAdd={() => toggleAdd(modalExercise)}
          onClose={() => setModalExercise(null)}
        />
      )}

      {/* ── Discard confirmation ─────────────────────────── */}
      {confirming && (
        <div
          className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[3px]"
          onClick={() => setConfirming(false)}
        >
          <div
            className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-2xl"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-3 mb-5 h-1 w-10 rounded-full bg-border/60" />
            <div className="px-6">
              <h2 className="text-[17px] font-bold tracking-tight">
                Discard preset?
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
                You'll lose all exercises and sets you've added.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  onClick={() => navigate(-1)}
                  className="h-12 w-full rounded-xl text-[14px] font-bold text-white transition-opacity active:opacity-80"
                  style={{ backgroundColor: APP_ACCENT_COLORS.danger }}
                >
                  Discard
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="h-12 w-full rounded-xl bg-muted/60 text-[14px] font-semibold text-foreground/80 transition-colors active:bg-muted"
                >
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {aiAccessModal}
    </div>
  )
}
