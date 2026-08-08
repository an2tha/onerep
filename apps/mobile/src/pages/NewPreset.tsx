import React, { useEffect, useRef, useState } from "react"
import { useParams } from "react-router"
import { usePostHog } from "@posthog/react"
import { captureFeatureUsage } from "@/lib/analytics"
import { useAction, useQuery } from "convex/react"
import {
  ExerciseSuggestionGroups,
  ExerciseDropIndicator,
  ExerciseMoveControls,
  ExerciseReorderToolbar,
  moveArrayItemByStep,
  useFlipReorderAnimation,
  RestTimerSheet,
  formatRestDuration as formatRest,
  toast,
} from "@repo/ui"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import {
  ArrowLeft,
  ArrowsOutSimple,
  Barbell,
  CaretDown,
  CaretUp,
  DotsSixVertical,
  FloppyDisk,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Sparkle,
  Timer,
  X,
} from "@phosphor-icons/react"
import { cn, createClientId, logDevWarn } from "@/lib/utils"
import { hapticSelection } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  resolveExerciseIds,
  searchExercises,
  visiblePopularExerciseSearches,
  type Exercise,
} from "@/lib/exercise-catalog"
import {
  readRecentExerciseSearches,
  rememberRecentExerciseSearch,
  visibleRecentExerciseSearches,
  type RecentExerciseSearch,
} from "@/lib/exercise-search-recents"
import {
  CreateExerciseButton,
  CustomExerciseSheet,
} from "@/components/custom-exercise-sheet"
import {
  CUSTOM_EXERCISE_ID_PREFIX,
  customExerciseDraftFromExercise,
  emptyCustomExerciseDraft,
  type CustomExerciseDraft,
} from "@/lib/custom-exercises"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  APP_ACCENT_COLORS,
  CUSTOM_CATEGORY_TONES,
  SET_TYPE_TONES,
} from "@repo/ui"
import { useAiFeatureGate } from "@/lib/ai-access"
import { AppleFitnessSetRow } from "@repo/ui"
import { WeightSelectorSheet, type WeightSelectorChange } from "./ActiveWorkout"
import type { BarType } from "@/lib/workout-logging"

// ─── Types ────────────────────────────────────────────────────────────────────

type SetType = "working" | "warmup" | "failure" | "myoreps" | "drop"

type WorkoutSet = {
  id: string
  type: SetType
  weight: string
  reps: string
  restSeconds: number
}

type ExerciseState = {
  sets: WorkoutSet[]
  trackRpe: boolean
  trackUnilateral: boolean
  barWeight: string
  barType: BarType
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return createClientId()
}

type WeightUnit = "kg" | "lbs"

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
    restSeconds: 120,
  }
}

function normalizeSet(set: Partial<WorkoutSet> | undefined): WorkoutSet {
  return {
    id: set?.id ?? uid(),
    type: set?.type ?? "working",
    weight: set?.weight ?? "",
    reps: set?.reps ?? "",
    restSeconds: set?.restSeconds ?? 120,
  }
}

function normalizeExerciseState(
  state: Partial<ExerciseState> | undefined
): ExerciseState {
  return {
    sets: (state?.sets ?? []).map((set) => normalizeSet(set)),
    trackRpe: false,
    trackUnilateral: false,
    barWeight: state?.barWeight ?? "",
    barType: state?.barType ?? "olympic",
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
    barWeight: "",
    barType: "olympic",
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
      return [item.kind === "solo" ? "exercise" : "superset"]
    }

    if (item.kind === "superset") {
      return [`superset: ${resolved.map((ex) => ex.name).join(" + ")}`]
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
    trackRpe: false,
    trackUnilateral: false,
    barWeight: "",
    barType: "olympic",
  }
}

// ─── Rest timer sheet ─────────────────────────────────────────────────────────

// ─── Set row ──────────────────────────────────────────────────────────────────

function SetRow({
  set,
  index,
  unit,
  barWeight,
  barType,
  onUpdate,
  onDelete,
  onWeightConfigChange,
  onToggleBar,
  canDelete,
}: {
  set: WorkoutSet
  index: number
  unit: WeightUnit
  barWeight: string
  barType: BarType
  onUpdate: (s: WorkoutSet) => void
  onDelete: () => void
  onWeightConfigChange: (change: WeightSelectorChange) => void
  onToggleBar: () => void
  canDelete: boolean
}) {
  const [showRest, setShowRest] = useState(false)
  const [showWeight, setShowWeight] = useState(false)
  const cfg = SET_CFG[set.type]

  function cycleType() {
    const i = SET_ORDER.indexOf(set.type)
    onUpdate({ ...set, type: SET_ORDER[(i + 1) % SET_ORDER.length] })
  }

  return (
    <>
      <AppleFitnessSetRow
        index={index}
        typeLabel={cfg.label}
        unit={unit}
        weightValue={toDisplay(set.weight, unit)}
        repsValue={set.reps}
        restLabel={formatRest(set.restSeconds)}
        canDelete={canDelete}
        onCycleType={cycleType}
        typeValue={set.type}
        typeOptions={SET_ORDER.map((type) => ({
          value: type,
          label: SET_CFG[type].label,
        }))}
        onTypeChange={(value) => onUpdate({ ...set, type: value as SetType })}
        onDelete={onDelete}
        onWeightClick={() => setShowWeight(true)}
        weightActionLabel={
          Number.parseFloat(barWeight || "0") > 0 ? undefined : "Add bar"
        }
        onWeightActionClick={onToggleBar}
        onRepsChange={(value) => onUpdate({ ...set, reps: value })}
        onRestClick={() => setShowRest(true)}
      />

      {showRest && (
        <RestTimerSheet
          variant="preset"
          current={set.restSeconds}
          onSelect={(s) => {
            onUpdate({ ...set, restSeconds: s })
            setShowRest(false)
          }}
          onClose={() => setShowRest(false)}
        />
      )}
      {showWeight && (
        <WeightSelectorSheet
          currentWeight={set.weight}
          barWeight={barWeight}
          barType={barType}
          unit={unit}
          lastSet={null}
          onChange={onWeightConfigChange}
          onClose={() => setShowWeight(false)}
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
  onBreakOut,
  dragHandlers,
  cardRef,
  reorderControls,
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
  onBreakOut?: () => void
  dragHandlers: React.HTMLAttributes<HTMLDivElement>
  cardRef: (el: HTMLDivElement | null) => void
  reorderControls?: React.ReactNode
}) {
  function addSet() {
    onUpdate({ ...data, sets: [...data.sets, makeSet()] })
  }

  function updateSet(i: number, s: WorkoutSet) {
    const sets = [...data.sets]
    sets[i] = s
    onUpdate({ ...data, sets })
  }

  function updateWeightConfig(i: number, change: WeightSelectorChange) {
    const sets = [...data.sets]
    if (change.weight !== undefined) {
      sets[i] = { ...sets[i], weight: change.weight }
    }
    onUpdate({
      ...data,
      sets,
      barWeight:
        change.barWeight !== undefined ? change.barWeight : data.barWeight,
      barType: change.barType ?? data.barType,
    })
  }

  function removeSet(i: number) {
    onUpdate({ ...data, sets: data.sets.filter((_, j) => j !== i) })
  }

  const totalRest = data.sets.reduce((sum, set) => sum + set.restSeconds, 0)
  const isCardio = isCardioExercise(exercise)
  const hasBarWeight = Number.parseFloat(data.barWeight || "0") > 0

  function toggleBarWeight() {
    onUpdate({
      ...data,
      barType: data.barType ?? "olympic",
      barWeight: hasBarWeight ? "" : "20",
    })
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative flex overflow-hidden transition-[border-color,box-shadow,opacity] duration-150",
        inSuperset
          ? "border-t border-border/25 bg-card first:border-t-0"
          : "rounded-[24px] border border-border/55 bg-card shadow-[0_8px_28px_rgba(0,0,0,0.05)]",
        isDragging && "opacity-20",
        showSupersetRing &&
          !inSuperset &&
          "border-foreground/70 bg-foreground/[0.035] shadow-[0_0_0_3px_color-mix(in_srgb,var(--foreground)_22%,transparent)] ring-2 ring-foreground/65 ring-offset-2 ring-offset-background"
      )}
    >
      {showSupersetRing && !inSuperset && (
        <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-md border border-dashed border-foreground/55 bg-background/55 backdrop-blur-[1px]">
          <span className="bg-foreground px-3 py-2 text-[13px] font-semibold text-background">
            Drop to create a superset
          </span>
        </div>
      )}

      {/* Drop indicators */}
      {showLineBefore && <ExerciseDropIndicator position="before" />}
      {showLineAfter && <ExerciseDropIndicator position="after" />}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Header row ──────────────────────────── */}
        <div className={cn("px-3 py-3.5 md:px-4", inSuperset && "pl-4")}>
          <div className="flex items-center gap-2.5">
            {/* Drag handle */}
            <div
              {...dragHandlers}
              className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground transition-colors select-none active:cursor-grabbing active:text-foreground"
            >
              <DotsSixVertical size={14} weight="bold" />
            </div>

            {/* Name & muscle */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] leading-tight font-semibold tracking-tight">
                {exercise.name}
              </p>
              <p className="mt-1 truncate text-[13px] text-muted-foreground">
                {collapsed
                  ? isCardio
                    ? "Cardio"
                    : `${data.sets.length} set${data.sets.length !== 1 ? "s" : ""} · ${formatRest(totalRest)} rest`
                  : exercise.muscle}
              </p>
            </div>

            {reorderControls}
            {inSuperset && onBreakOut && (
              <button
                type="button"
                onClick={onBreakOut}
                aria-label={`Move ${exercise.name} out of superset`}
                title="Move out of superset"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted active:text-foreground"
              >
                <ArrowsOutSimple size={15} weight="bold" />
              </button>
            )}
            <button
              onClick={onRemove}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-destructive/10 active:text-destructive"
              aria-label={`Remove ${exercise.name}`}
            >
              <X size={15} weight="bold" />
            </button>
            <button
              onClick={onToggleCollapse}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted active:text-foreground"
              aria-label={
                collapsed
                  ? `Expand ${exercise.name}`
                  : `Collapse ${exercise.name}`
              }
            >
              {collapsed ? (
                <CaretDown size={15} weight="bold" />
              ) : (
                <CaretUp size={15} weight="bold" />
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
                      className="min-w-0 border-b border-border px-1 py-3"
                    >
                      <span className="block truncate text-[13px] font-medium text-muted-foreground">
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
                        unit={unit}
                        barWeight={data.barWeight}
                        barType={data.barType}
                        onUpdate={(updated) => updateSet(i, updated)}
                        onDelete={() => removeSet(i)}
                        onWeightConfigChange={(change) =>
                          updateWeightConfig(i, change)
                        }
                        onToggleBar={toggleBarWeight}
                        canDelete={data.sets.length > 1}
                      />
                    </div>
                  ))}
                </div>

                {/* ── Add set ───────────────────────────────── */}
                <button
                  onClick={addSet}
                  className="flex w-full items-center justify-center gap-2 border-t border-border/30 px-4 py-3 text-left text-muted-foreground/70 transition-colors active:bg-muted/30 active:text-foreground"
                >
                  <Plus size={14} weight="bold" />
                  <span className="text-[13px] font-bold">Add set</span>
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
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle")
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [remoteExercises, setRemoteExercises] = useState<Exercise[]>([])
  const [recentExercises, setRecentExercises] = useState(() =>
    readRecentExerciseSearches()
  )
  const [closing, setClosing] = useState(false)
  const [editorDraft, setEditorDraft] = useState<CustomExerciseDraft | null>(
    null
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

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
  }, [query, searchAttempt])

  const filtered = remoteExercises
  const recentSuggestions = visibleRecentExerciseSearches(
    addedIds,
    recentExercises
  )
  const recentSuggestionIds = new Set(
    recentSuggestions.map((exercise) => exercise.id)
  )
  const popularSuggestions = visiblePopularExerciseSearches(addedIds).filter(
    (exercise) => !recentSuggestionIds.has(exercise.id)
  )

  function chooseSuggestion(exercise: ExerciseSearchSuggestion) {
    setQuery(exercise.name)
    inputRef.current?.focus()
  }

  function retrySearch() {
    setSearchAttempt((current) => current + 1)
  }

  function handleToggle(exercise: Exercise) {
    const alreadyAdded = addedIds.includes(exercise.id)
    onToggle(exercise)
    if (!alreadyAdded) {
      setRecentExercises(rememberRecentExerciseSearch(exercise))
    }
  }

  function requestClose() {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 340)
  }

  function openExerciseCreator() {
    setEditorDraft(emptyCustomExerciseDraft({ name: query.trim() }))
  }

  function handleCustomExerciseSaved(exercise: Exercise) {
    setEditorDraft(null)
    setRemoteExercises((current) => [
      exercise,
      ...current.filter((item) => item.id !== exercise.id),
    ])
    if (!addedIds.includes(exercise.id)) handleToggle(exercise)
  }

  function handleCustomExerciseDeleted(docId: string) {
    const id = `${CUSTOM_EXERCISE_ID_PREFIX}${docId}`
    setEditorDraft(null)
    setRemoteExercises((current) => current.filter((item) => item.id !== id))
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 bg-background md:flex md:justify-center md:bg-black/40 md:backdrop-blur-sm",
        closing ? "sheet-backdrop-exit" : "sheet-backdrop-enter"
      )}
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      onClick={requestClose}
    >
      <div
        className={cn(
          "sheet-panel sheet-panel-fullscreen flex h-full w-full flex-col bg-background md:mt-12 md:h-auto md:max-h-[76vh] md:max-w-lg md:self-start md:overflow-hidden md:rounded-2xl md:border md:border-border/60 md:shadow-2xl",
          closing ? "sheet-panel-exit" : "sheet-panel-enter"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar row */}
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="relative flex-1">
            <MagnifyingGlass
              size={15}
              className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              ref={inputRef}
              type="search"
              name="preset-exercise-search"
              aria-label="Search exercises"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises…"
              className="h-11 w-full rounded-xl border border-border/60 bg-muted/40 pr-4 pl-10 text-[14px] transition-all outline-none placeholder:text-muted-foreground focus:border-foreground/20 focus:bg-background"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear exercise search"
                className="absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground active:text-foreground"
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="min-h-11 shrink-0 px-2 text-[15px] font-semibold text-muted-foreground transition-colors active:bg-muted/45 active:text-foreground"
          >
            Done
          </button>
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
                  onAdd={() => handleToggle(ex)}
                  onBodyClick={() => onBodyClick(ex)}
                  onEdit={
                    ex.custom
                      ? () =>
                          setEditorDraft(customExerciseDraftFromExercise(ex))
                      : undefined
                  }
                />
              ))}
              <div className="px-4 py-4">
                <CreateExerciseButton
                  query={query}
                  onClick={openExerciseCreator}
                />
              </div>
            </div>
          ) : searchState === "done" ? (
            <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
              <div className="flex flex-col items-center gap-2">
                <p className="text-[13px] font-semibold text-muted-foreground">
                  No exercises found
                </p>
                <p className="text-[15px] text-muted-foreground">
                  Try a broader exercise or muscle name.
                </p>
              </div>
              <CreateExerciseButton
                query={query}
                onClick={openExerciseCreator}
              />
              <ExerciseSuggestionGroups
                variant="chips"
                popularLabel="Try instead"
                recentSuggestions={recentSuggestions}
                popularSuggestions={popularSuggestions}
                onChoose={chooseSuggestion}
              />
            </div>
          ) : searchState === "error" ? (
            <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
              <div className="flex flex-col items-center gap-2">
                <p className="text-[13px] font-semibold text-muted-foreground">
                  Search failed
                </p>
                <p className="text-[15px] text-muted-foreground">
                  Check your connection, then retry the search.
                </p>
                <button
                  type="button"
                  onClick={retrySearch}
                  className="app-button app-button-primary mt-1 min-h-11 px-4"
                >
                  Retry search
                </button>
              </div>
              <ExerciseSuggestionGroups
                variant="chips"
                popularLabel="Try instead"
                recentSuggestions={recentSuggestions}
                popularSuggestions={popularSuggestions}
                onChoose={chooseSuggestion}
              />
            </div>
          ) : null}
        </div>
      </div>
      {editorDraft && (
        // Stops the editor's own backdrop click from bubbling out and closing
        // the search sheet underneath it too.
        <div onClick={(event) => event.stopPropagation()}>
          <CustomExerciseSheet
            initialDraft={editorDraft}
            onClose={() => setEditorDraft(null)}
            onSaved={handleCustomExerciseSaved}
            onDeleted={handleCustomExerciseDeleted}
          />
        </div>
      )}
    </div>
  )
}

type ExerciseSearchSuggestion = Exercise | RecentExerciseSearch

// ─── Search exercise card ─────────────────────────────────────────────────────

function SearchExerciseCard({
  exercise,
  added,
  onAdd,
  onBodyClick,
  onEdit,
}: {
  exercise: Exercise
  added: boolean
  onAdd: () => void
  onBodyClick: () => void
  onEdit?: () => void
}) {
  return (
    <div className={cn("flex items-stretch", added && "opacity-60")}>
      <button
        onClick={onBodyClick}
        className="flex min-w-0 flex-1 flex-col justify-center py-3.5 pr-4 pl-4 text-left active:bg-muted/40"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-[15px] leading-snug font-semibold">
            {exercise.name}
          </p>
          {exercise.custom && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] leading-none font-semibold text-muted-foreground">
              Yours
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-[13px] text-muted-foreground">
          {exercise.muscle}
        </p>
        {added && (
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">
            Already in preset
          </p>
        )}
      </button>

      {onEdit && (
        <button
          onClick={onEdit}
          className="flex min-h-11 min-w-11 items-center justify-center px-2 text-muted-foreground transition-colors active:text-foreground"
          aria-label={`Edit ${exercise.name}`}
        >
          <PencilSimple size={15} weight="bold" />
        </button>
      )}

      <button
        onClick={onAdd}
        className="flex min-h-11 min-w-11 items-center justify-center px-3 text-muted-foreground transition-colors active:text-foreground"
        aria-label={added ? `Remove ${exercise.name}` : `Add ${exercise.name}`}
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
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-border/60" />
        </div>

        <div className="px-5 pt-4">
          <span className="inline-flex items-center rounded-full bg-muted/55 px-2.5 py-1 text-[13px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
            {exercise.category}
          </span>
          <h2 className="mt-2.5 text-[20px] leading-tight font-bold tracking-tight">
            {exercise.name}
          </h2>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground/70">
            {exercise.muscle}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground/75">
            {exercise.description}
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-3">
            <Timer size={13} className="shrink-0 text-muted-foreground/60" />
            <span className="text-[13px] font-medium text-muted-foreground/70">
              Suggested volume
            </span>
            <span className="ml-auto text-[13px] font-bold tabular-nums">
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
              <p className="text-[13px] font-black tracking-[0.2em] text-muted-foreground uppercase">
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
              aria-label="Close AI preset builder"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted/60 active:text-foreground disabled:opacity-40"
            >
              <X size={15} weight="bold" />
            </button>
          </div>

          {hasExisting && (
            <div className="mt-5 grid grid-cols-2 rounded-2xl bg-muted/45 p-1 text-[13px] font-bold">
              {(["replace", "append"] as AgentPresetMode[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  disabled={loading}
                  className={cn(
                    "h-10 rounded-xl capitalize transition-all",
                    mode === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground active:text-foreground"
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          )}

          <textarea
            name="preset-import-text"
            aria-label="Workout plan text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            placeholder={
              "Upper Body Strength\nBench press 4x6 @ 185 lb, rest 2 min\nPull-up 4xAMRAP\nSeated cable row 3x10\nLateral raise 3x15"
            }
            className="mt-5 min-h-52 w-full resize-none rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground focus:border-foreground/20 disabled:opacity-60"
          />

          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={() => void onGenerate(text.trim(), mode)}
              disabled={!canGenerate}
              aria-busy={loading}
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
  const onboarding = useQuery(api.users.onboarding.get, {})
  const [unit, setUnit] = useState<WeightUnit>("kg")
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [saving, setSaving] = useState(false)
  const [generatingPreset, setGeneratingPreset] = useState(false)
  const [showSupersetTip, setShowSupersetTip] = useState(() => {
    if (typeof window === "undefined") return true
    return (
      window.localStorage.getItem("onerep:preset-superset-tip-hidden") !== "1"
    )
  })
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [reorderMode, setReorderMode] = useState(false)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const topLevelItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const captureReorderPositions = useFlipReorderAnimation(
    items.map(presetItemKey),
    topLevelItemRefs
  )
  const dragRef = useRef<DragInfo | null>(null)
  const dropTargetRef = useRef<DropTarget>(null)
  const loadedPresetIdRef = useRef<string | undefined>(undefined)
  const savingRef = useRef(false)
  const generatingPresetRef = useRef(false)

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
      // The presets query re-emits on every reactive update; seed the builder
      // once per preset so in-progress edits are not clobbered.
      if (loadedPresetIdRef.current === presetId) return
      loadedPresetIdRef.current = presetId
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
        void resolveExerciseIds(ids)
          .then((lookup) => {
            setExerciseLookup((prev) => ({
              ...prev,
              ...(lookup as Record<string, Exercise>),
            }))
          })
          .catch((error) => {
            logDevWarn("Failed to resolve preset exercises", error)
          })
      }
    }
  }, [presetId, presets])

  const loadingPreset = presetId !== undefined && presets === undefined

  // ── Save ──────────────────────────────────────────────────

  async function handleSave() {
    if (savingRef.current || saving || loadingPreset || addedIds.length === 0) {
      return
    }
    savingRef.current = true
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
        await updatePreset({ id: presetId as Id<"presets">, ...input })
      } else {
        await createPreset(input)
      }
      captureFeatureUsage(posthog, "workout_preset_saved", {
        is_edit: Boolean(presetId),
        item_count: items.length,
      })
      navigate(-1)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save preset"
      )
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function handleGenerateFromText(text: string, mode: AgentPresetMode) {
    if (!requireAiAccess(1, "preset_from_text")) return
    if (!text.trim()) return
    if (generatingPresetRef.current || generatingPreset) return

    generatingPresetRef.current = true
    setGeneratingPreset(true)
    try {
      const draft = (await createPresetDraft({
        text,
        experienceLevel: onboarding?.experienceLevel,
        safetyMode: onboarding?.safetyMode,
        safetyFlags: onboarding?.safetyFlags,
      })) as AgentPresetDraft
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

      captureFeatureUsage(posthog, "workout_preset_text_imported", {
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
      generatingPresetRef.current = false
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
      rememberRecentExerciseSearch(ex)
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

  function presetItemKey(item: PresetItem) {
    return item.kind === "solo" ? item.exerciseId : item.id
  }

  function moveItemByStep(itemKey: string, direction: -1 | 1) {
    captureReorderPositions()
    setItems((previous) => {
      const from = previous.findIndex((item) => presetItemKey(item) === itemKey)
      return moveArrayItemByStep(previous, from, direction)
    })
    hapticSelection()
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
    // executeDrop is intentionally refreshed as drag state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureReorderPositions, drag])

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

  function breakOutExercise(exerciseId: string) {
    captureReorderPositions()
    setItems((previous) => [
      ...removeExFromItems(previous, exerciseId),
      { kind: "solo" as const, exerciseId },
    ])
    hapticSelection()
  }

  function executeDrop(draggedId: string, zone: DropTarget) {
    if (
      zone ||
      items.some(
        (item) =>
          item.kind === "superset" && item.exerciseIds.includes(draggedId)
      )
    ) {
      captureReorderPositions()
    }
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

  function renderSoloItem(exerciseId: string, itemIndex: number) {
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
          if (el) {
            cardRefs.current.set(exerciseId, el)
            topLevelItemRefs.current.set(exerciseId, el)
          } else {
            cardRefs.current.delete(exerciseId)
            topLevelItemRefs.current.delete(exerciseId)
          }
        }}
        reorderControls={
          reorderMode ? (
            <ExerciseMoveControls
              label={ex.name}
              canMoveUp={itemIndex > 0}
              canMoveDown={itemIndex < items.length - 1}
              onMoveUp={() => moveItemByStep(exerciseId, -1)}
              onMoveDown={() => moveItemByStep(exerciseId, 1)}
            />
          ) : undefined
        }
      />
    )
  }

  function renderSupersetItem(
    item: Extract<PresetItem, { kind: "superset" }>,
    itemIndex: number
  ) {
    const dt = dropTarget
    const containerIsTarget = dt && item.exerciseIds.includes(dt.targetExId)
    const showLineBefore = !!(containerIsTarget && dt?.type === "before")
    const showLineAfter = !!(containerIsTarget && dt?.type === "after")

    return (
      <div
        key={item.id}
        ref={(element) => {
          if (element) topLevelItemRefs.current.set(item.id, element)
          else topLevelItemRefs.current.delete(item.id)
        }}
        className="relative overflow-hidden rounded-[26px] border border-foreground/25 bg-card shadow-[0_8px_28px_rgba(0,0,0,0.05)]"
      >
        {showLineBefore && <ExerciseDropIndicator position="before" />}
        {showLineAfter && <ExerciseDropIndicator position="after" />}

        {/* Superset label bar */}
        <div
          className="flex min-h-12 items-center justify-between border-b border-border py-2 pr-3.5"
          style={{
            paddingLeft: "calc(0.875rem + 4px)",
          }}
        >
          <span className="text-[13px] font-bold tracking-[0.08em] text-foreground uppercase">
            Superset · {item.exerciseIds.length}
          </span>
        </div>

        {reorderMode && (
          <div className="flex justify-end border-b border-border px-3 py-2">
            <ExerciseMoveControls
              label="superset"
              canMoveUp={itemIndex > 0}
              canMoveDown={itemIndex < items.length - 1}
              onMoveUp={() => moveItemByStep(item.id, -1)}
              onMoveDown={() => moveItemByStep(item.id, 1)}
            />
          </div>
        )}

        {/* Exercises — no extra borders, cards have their own left stripes */}
        <div className="flex flex-col">
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
                onBreakOut={() => breakOutExercise(exId)}
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

  function dismissSupersetTip() {
    setShowSupersetTip(false)
    window.localStorage.setItem("onerep:preset-superset-tip-hidden", "1")
  }

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
            className="flex min-h-11 items-center gap-1.5 px-2 text-[15px] font-medium text-muted-foreground transition-colors active:bg-muted/45 active:text-foreground"
          >
            <ArrowLeft size={14} weight="bold" />
            Back
          </button>

          <button
            onClick={() => void handleSave()}
            disabled={addedIds.length === 0 || saving || loadingPreset}
            aria-busy={saving}
            className="ml-auto flex min-h-11 items-center gap-1.5 px-3 text-[15px] font-semibold text-foreground transition-colors active:bg-muted/45 disabled:text-muted-foreground"
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
          <label
            htmlFor="preset-name"
            className="text-[13px] font-medium text-muted-foreground"
          >
            Workout name
          </label>
          <input
            id="preset-name"
            name="preset-name"
            aria-label="Preset name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder={
              loadingPreset ? "Loading preset..." : "Untitled Preset"
            }
            maxLength={40}
            disabled={loadingPreset}
            className="mt-2 min-h-14 w-full rounded-[20px] border border-border/55 bg-card px-4 text-[1.6rem] font-semibold shadow-sm outline-none placeholder:text-muted-foreground focus:border-foreground/35"
          />
          <div className="mt-2 flex items-center gap-3">
            {addedIds.length > 0 && (
              <p className="text-[13px] font-medium text-muted-foreground">
                {addedIds.length} exercise{addedIds.length !== 1 ? "s" : ""}
              </p>
            )}
            {/* kg / lbs toggle */}
            <div
              className="ml-auto grid grid-cols-2 border border-border text-[13px] font-semibold"
              aria-label="Weight unit"
            >
              {(["kg", "lbs"] as WeightUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={cn(
                    "min-h-11 min-w-11 px-3 transition-colors",
                    unit === u
                      ? "bg-foreground text-background"
                      : "text-muted-foreground active:text-foreground"
                  )}
                  data-active={unit === u}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5 px-[var(--app-page-x)] md:px-8">
          {/* ── Exercise list ──────────────────────────── */}
          {items.length > 0 && (
            <div className="flex flex-col gap-5">
              <ExerciseReorderToolbar
                active={reorderMode}
                count={addedIds.length}
                onToggle={() => setReorderMode((value) => !value)}
              />
              {showSupersetTip && addedIds.length > 1 && (
                <div className="flex items-center gap-2 border-y border-border py-2.5 text-muted-foreground">
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
              {items.map((item, itemIndex) =>
                item.kind === "solo"
                  ? renderSoloItem(item.exerciseId, itemIndex)
                  : renderSupersetItem(item, itemIndex)
              )}
            </div>
          )}

          {loadingPreset && (
            <div
              className="border-y border-border px-4 py-6 text-[15px] text-muted-foreground"
              role="status"
            >
              Loading workout…
            </div>
          )}

          {/* ── Add exercise button ───────────────────── */}
          <button
            onClick={() => setSearchOpen(true)}
            className={cn(
              "app-button min-h-12 w-full",
              items.length === 0 ? "app-button-primary" : "app-button-secondary"
            )}
          >
            <Plus size={items.length === 0 ? 17 : 16} weight="bold" />
            <span
              className={items.length === 0 ? "text-[14.5px]" : "text-[14px]"}
            >
              {items.length === 0 ? "Add exercises" : "Add another exercise"}
            </span>
          </button>

          {/* ── Paste workout text button ───────────────── */}
          {items.length === 0 && (
            <button
              onClick={() => {
                if (requireAiAccess(1, "preset_paste")) setPasteOpen(true)
              }}
              disabled={loadingPreset || generatingPreset}
              aria-busy={generatingPreset}
              className="app-button app-button-secondary min-h-12 w-full disabled:opacity-45"
            >
              <Sparkle
                size={14}
                weight="fill"
                className={generatingPreset ? "animate-spin" : ""}
              />
              Import workout from text
            </button>
          )}
        </div>
      </div>

      {/* ── Drag ghost ────────────────────────────────────── */}
      {ghostEx &&
        drag &&
        (() => {
          return (
            <div
              className="pointer-events-none fixed z-[100] rounded-full border border-border/70 bg-card px-3.5 py-2 shadow-2xl"
              style={{
                left: drag.x + 16,
                top: drag.y - 22,
                opacity: 0.95,
              }}
            >
              <span className="text-[13px] font-semibold tracking-tight text-foreground">
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
