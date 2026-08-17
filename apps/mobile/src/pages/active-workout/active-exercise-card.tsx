/**
 * One exercise in the active session: header, action row, last-session line,
 * and the set grid (or the cardio panel).
 *
 * The exercise name is a real link — it opens the catalog page with photos
 * and instructions. Removing an exercise is only *requested* here; the page
 * confirms it first.
 */

import { useMemo } from "react"
import {
  ArrowsClockwise,
  ArrowsOutSimple,
  CaretDown,
  CaretRight,
  CaretUp,
  ChartLine,
  ClockCounterClockwise,
  DotsSixVertical,
  Plus,
  Sparkle,
  TrendUp,
  VideoCamera,
  X,
} from "@phosphor-icons/react"
import {
  ExerciseDropIndicator,
  formatRestDuration as formatRest,
} from "@repo/ui"
import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/haptics"
import { startFormCoachDraft } from "@/lib/form-coach-clips"
import { useFormCoachSupport } from "@/lib/form-coach"
import { suggestDoubleProgression } from "@/lib/workout-progression"
import type { Exercise } from "@/lib/exercise-catalog"
import {
  cardioDetailsFromState,
  fillDownSetField,
  hasCardioStateDetails,
  makeSet,
  normalizeBarType,
} from "@/lib/workout-logging"
import { compactCardioSummary } from "@/lib/workout-sync"
import type {
  ExerciseState,
  WeightUnit,
  WorkoutSet,
} from "@/lib/workout-logging"
import { ActiveSetRow, SetListHeader } from "./set-rows"
import type { WeightSelectorChange } from "./weight-selector-sheet"
import { CardioDetailsPanel } from "./cardio-details-panel"

export function ActiveExerciseCard({
  exercise,
  data,
  unit,
  onUpdate,
  onRemove,
  isDragging,
  dropActive,
  dropPosition,
  supersetDropActive,
  inSuperset,
  collapsed,
  onToggleCollapse,
  dragHandlers,
  cardRef,
  onStartRest,
  lastSession,
  onShowHistory,
  onOpenDetail,
  onAiChange,
  onSwap,
  onBreakOut,
  nextSetIndex,
  isNextCardio,
  reorderControls,
  defaultSetCompleted = false,
}: {
  exercise: Exercise
  data: ExerciseState
  unit: WeightUnit
  onUpdate: (d: ExerciseState) => void
  onRemove: () => void
  isDragging: boolean
  dropActive: boolean
  dropPosition?: "before" | "after"
  supersetDropActive?: boolean
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
  onOpenDetail?: () => void
  onAiChange?: () => void
  onSwap?: () => void
  onBreakOut?: () => void
  nextSetIndex?: number | null
  isNextCardio?: boolean
  reorderControls?: React.ReactNode
  /** Retro mode records sets that already happened, so they start ticked. */
  defaultSetCompleted?: boolean
}) {
  const formCoachMovement = useFormCoachSupport(exercise.name)

  function addSet() {
    // A set added mid-exercise is almost always another of the same thing, so
    // it starts from the last set rather than blank.
    const previous = data.sets[data.sets.length - 1]
    const next = makeSet(defaultSetCompleted)
    onUpdate({
      ...data,
      sets: [
        ...data.sets,
        previous
          ? {
              ...next,
              weight: previous.weight,
              reps: previous.reps,
              restSeconds: previous.restSeconds,
            }
          : next,
      ],
    })
  }
  function updateSet(i: number, s: WorkoutSet) {
    const sets = [...data.sets]
    sets[i] = s
    onUpdate({ ...data, sets })
  }
  function updateSetField(i: number, field: "weight" | "reps", value: string) {
    onUpdate({ ...data, sets: fillDownSetField(data.sets, i, field, value) })
  }
  function updateWeightConfig(i: number, change: WeightSelectorChange) {
    const sets =
      change.weight !== undefined
        ? fillDownSetField(data.sets, i, "weight", change.weight)
        : [...data.sets]
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
  const isCardio = exercise.category === "cardio"
  const cardioLogged = hasCardioStateDetails(data.cardio)
  const isActive = nextSetIndex != null || Boolean(isNextCardio)
  const allDone = isCardio
    ? cardioLogged
    : data.sets.length > 0 && data.sets.every((s) => s.completed)
  const doneSets = data.sets.filter((s) => s.completed).length
  const totalRest = data.sets.reduce((sum, set) => sum + set.restSeconds, 0)
  const selectedBarType = normalizeBarType(data.barType, data.barWeight)
  const progression = useMemo(
    () =>
      lastSession
        ? suggestDoubleProgression(lastSession.sets, data.sets.length)
        : null,
    [data.sets.length, lastSession]
  )

  function applyProgression() {
    if (!progression) return
    onUpdate({
      ...data,
      sets: data.sets.map((set, index) => {
        const target = progression.targets[index]
        return target
          ? { ...set, weight: String(target.weight), reps: String(target.reps) }
          : set
      }),
    })
  }

  const iconActionCls =
    "flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted active:text-foreground"

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      className={cn(
        "active-workout-exercise relative flex scroll-mt-56 overflow-hidden transition-[border-color,background-color,box-shadow,opacity] duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        inSuperset
          ? "border-t border-border/20 bg-card first:border-t-0"
          : "rounded-[24px] border border-border/55 bg-card shadow-[0_10px_32px_rgba(0,0,0,0.055)]",
        !inSuperset && allDone && "border-border/30 bg-muted/[0.12]",
        isActive &&
          "active-workout-exercise-current border-foreground/25 bg-card shadow-[0_12px_36px_rgba(0,0,0,0.09)]",
        !inSuperset && dropActive && "border-foreground/35",
        !inSuperset &&
          supersetDropActive &&
          "border-foreground/70 bg-foreground/[0.035] shadow-[0_0_0_3px_color-mix(in_srgb,var(--foreground)_22%,transparent)] ring-2 ring-foreground/65 ring-offset-2 ring-offset-background",
        isDragging && "opacity-25"
      )}
    >
      {supersetDropActive && !inSuperset && (
        <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-md border border-dashed border-foreground/55 bg-background/55 backdrop-blur-[1px]">
          <span className="rounded-full bg-foreground px-3 py-1.5 text-[13px] font-semibold tracking-tight text-background shadow-lg">
            drop to superset
          </span>
        </div>
      )}
      {dropPosition && !inSuperset && (
        <ExerciseDropIndicator position={dropPosition} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={cn("px-3 py-3 md:px-4", inSuperset && "pl-4")}>
          <div className="flex items-center gap-2.5">
            {dragHandlers && (
              <div
                {...dragHandlers}
                role="button"
                aria-label="Reorder exercise"
                className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground transition-colors select-none active:cursor-grabbing active:text-foreground"
              >
                <DotsSixVertical size={13} weight="bold" />
              </div>
            )}
            {onOpenDetail ? (
              <button
                type="button"
                onClick={onOpenDetail}
                aria-label={`Open ${exercise.name} instructions`}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-[15px] leading-tight font-semibold tracking-tight">
                    {exercise.name}
                  </p>
                  <CaretRight
                    size={11}
                    weight="bold"
                    className="shrink-0 text-muted-foreground"
                  />
                  {isActive && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-primary"
                      aria-label="Active"
                    />
                  )}
                </div>
                <p className="mt-0.5 truncate text-[12px] leading-tight text-muted-foreground">
                  {collapsed
                    ? isCardio
                      ? compactCardioSummary(
                          cardioDetailsFromState(data.cardio),
                          data.cardio.distanceUnit
                        )
                      : `${doneSets}/${data.sets.length} sets · ${formatRest(totalRest)} rest`
                    : exercise.muscle}
                </p>
              </button>
            ) : (
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-[15px] leading-tight font-semibold tracking-tight">
                    {exercise.name}
                  </p>
                  {isActive && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-primary"
                      aria-label="Active"
                    />
                  )}
                </div>
                <p className="mt-0.5 truncate text-[12px] leading-tight text-muted-foreground">
                  {collapsed
                    ? isCardio
                      ? compactCardioSummary(
                          cardioDetailsFromState(data.cardio),
                          data.cardio.distanceUnit
                        )
                      : `${doneSets}/${data.sets.length} sets · ${formatRest(totalRest)} rest`
                    : exercise.muscle}
                </p>
              </div>
            )}
            <span
              className={cn(
                "shrink-0 text-[13px] font-medium tabular-nums transition-colors",
                allDone ? "text-primary" : "text-muted-foreground"
              )}
            >
              {isCardio
                ? cardioLogged
                  ? "Logged"
                  : "Open"
                : `${doneSets}/${data.sets.length}`}
            </span>
            {reorderControls}
            {inSuperset && onBreakOut && (
              <button
                type="button"
                onClick={onBreakOut}
                aria-label={`Move ${exercise.name} out of superset`}
                title="Move out of superset"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted active:text-foreground"
              >
                <ArrowsOutSimple size={15} weight="bold" />
              </button>
            )}
            <button
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand exercise" : "Collapse exercise"}
              className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors active:bg-muted/30 active:text-foreground"
            >
              {collapsed ? (
                <CaretDown size={14} weight="bold" />
              ) : (
                <CaretUp size={14} weight="bold" />
              )}
            </button>
          </div>
        </div>
        <div
          className={cn(
            "items-center gap-1 px-3 pb-2 text-[13px] font-medium",
            collapsed ? "hidden" : "flex"
          )}
        >
          {!isCardio && formCoachMovement && (
            <button
              type="button"
              onClick={() => {
                void hapticTap()
                startFormCoachDraft({
                  exerciseId: exercise.id,
                  exerciseName: exercise.name,
                  slug: formCoachMovement.slug,
                })
              }}
              aria-label="Coach me on my form"
              title="Coach me on my form"
              className={cn(iconActionCls, "text-primary active:bg-primary/10")}
            >
              <VideoCamera size={16} weight="fill" />
            </button>
          )}
          {!isCardio && (
            <button
              onClick={onShowHistory}
              className={iconActionCls}
              aria-label="Exercise history"
            >
              <ChartLine size={16} weight="bold" />
            </button>
          )}
          {onAiChange && (
            <button
              onClick={onAiChange}
              className={iconActionCls}
              aria-label="Ask Coach to change exercise"
            >
              <Sparkle size={15} weight="fill" />
            </button>
          )}
          {onSwap && (
            <button
              onClick={onSwap}
              className={iconActionCls}
              aria-label={`Swap ${exercise.name} for another exercise`}
              title="Swap exercise"
            >
              <ArrowsClockwise size={15} weight="bold" />
            </button>
          )}
          <button
            onClick={onRemove}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground active:bg-destructive/10 active:text-destructive"
            aria-label={`Remove ${exercise.name}`}
          >
            <X size={16} weight="bold" />
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
            {!isCardio &&
              lastSession &&
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
                    className="flex items-center gap-2 px-3 py-2"
                    style={{
                      borderTop:
                        "1px solid color-mix(in srgb, var(--border) 45%, transparent)",
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
                    <span className="text-[13px] font-medium text-muted-foreground">
                      {new Date(
                        `${lastSession.date}T12:00:00Z`
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground tabular-nums">
                      {summary}
                    </span>
                    {progression && doneSets === 0 && (
                      <button
                        type="button"
                        onClick={applyProgression}
                        aria-label={`Apply progression: ${progression.label}`}
                        className="flex min-h-11 shrink-0 items-center gap-1 px-3 text-[13px] font-semibold text-foreground transition-colors active:bg-muted"
                      >
                        <TrendUp size={11} weight="bold" />
                        {progression.label}
                      </button>
                    )}
                  </div>
                )
              })()}
            {isCardio ? (
              <CardioDetailsPanel
                cardio={data.cardio}
                onUpdate={(cardio) => onUpdate({ ...data, cardio })}
                isNext={isNextCardio}
              />
            ) : (
              <>
                <SetListHeader unit={unit} />
                {data.sets.map((s, i) => (
                  <ActiveSetRow
                    key={s.id}
                    set={s}
                    index={i}
                    unit={unit}
                    onUpdate={(updated) => updateSet(i, updated)}
                    onRepsChange={(value) => updateSetField(i, "reps", value)}
                    onDelete={() => removeSet(i)}
                    canDelete={data.sets.length > 1}
                    onComplete={onStartRest}
                    isNext={nextSetIndex === i}
                    lastSet={lastSession?.sets[i]}
                    barWeight={data.barWeight}
                    barType={selectedBarType}
                    onWeightConfigChange={(change) =>
                      updateWeightConfig(i, change)
                    }
                  />
                ))}
                <button
                  onClick={addSet}
                  className="flex h-11 w-full items-center justify-center gap-2 text-muted-foreground/70 transition-colors active:bg-muted/25 active:text-foreground"
                  style={{
                    borderTop:
                      "1px solid color-mix(in srgb, var(--border) 45%, transparent)",
                  }}
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
