/**
 * One set, one row. The old layout spent four full-width rows on every set
 * (label, weight, reps, rest); three sets of it and the card no longer fit on
 * a screen. This grid puts a whole set on a single line and names the columns
 * once per exercise.
 */

import { useEffect, useState } from "react"
import { ArrowCounterClockwise, Check, Timer, X } from "@phosphor-icons/react"
import { RestTimerSheet, formatRestDuration as formatRest } from "@repo/ui"
import { cn } from "@/lib/utils"
import { toDisplay } from "@/lib/workout-logging"
import type { BarType, WeightUnit, WorkoutSet } from "@/lib/workout-logging"
import {
  WeightSelectorSheet,
  type WeightSelectorChange,
} from "./weight-selector-sheet"

const SET_GRID =
  "grid grid-cols-[1.9rem_minmax(0,1.15fr)_minmax(0,0.85fr)_3.4rem_2.25rem_2.75rem] items-center gap-1.5 px-3"

export function SetListHeader({ unit }: { unit: WeightUnit }) {
  return (
    <div
      className={cn(SET_GRID, "py-1.5")}
      style={{
        borderTop: "1px solid color-mix(in srgb, var(--border) 45%, transparent)",
      }}
      aria-hidden="true"
    >
      {["Set", unit, "Reps", "Rest", "", ""].map((label, column) => (
        <span
          key={column}
          className="text-center text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
        >
          {label}
        </span>
      ))}
    </div>
  )
}

export function ActiveSetRow({
  set,
  index,
  unit,
  onUpdate,
  onRepsChange,
  onDelete,
  canDelete,
  onComplete,
  isNext,
  lastSet,
  barWeight,
  barType,
  onWeightConfigChange,
}: {
  set: WorkoutSet
  index: number
  unit: WeightUnit
  onUpdate: (s: WorkoutSet) => void
  onRepsChange: (value: string) => void
  onDelete: () => void
  canDelete: boolean
  onComplete: (restSeconds: number) => void
  isNext?: boolean
  lastSet?: { weight: number; reps: number } | null
  barWeight: string
  barType: BarType
  onWeightConfigChange: (change: WeightSelectorChange) => void
}) {
  const [showRest, setShowRest] = useState(false)
  const [showWeight, setShowWeight] = useState(false)
  const [completionPulse, setCompletionPulse] = useState(false)

  useEffect(() => {
    if (!completionPulse) return
    const id = window.setTimeout(() => setCompletionPulse(false), 520)
    return () => window.clearTimeout(id)
  }, [completionPulse])

  function toggleDone() {
    const next = !set.completed
    onUpdate({ ...set, completed: next })
    if (next) setCompletionPulse(true)
    if (next && set.restSeconds > 0) onComplete(set.restSeconds)
  }

  const weightDisplay = toDisplay(set.weight, unit)
  const weightPlaceholder = lastSet?.weight
    ? toDisplay(String(lastSet.weight), unit)
    : "–"
  const fieldCls = cn(
    "flex h-11 w-full min-w-0 items-center justify-center rounded-[14px] border text-[15px] font-semibold tabular-nums transition-colors outline-none",
    set.completed
      ? "border-transparent bg-transparent text-foreground/55"
      : "border-border/45 bg-muted/20 text-foreground"
  )

  return (
    <div
      className={cn(
        "transition-colors duration-200",
        completionPulse && "bg-muted/20",
        isNext && !set.completed && "bg-primary/[0.04]"
      )}
      style={{
        borderTop: "1px solid color-mix(in srgb, var(--border) 45%, transparent)",
      }}
    >
      <div className={cn(SET_GRID, "py-1.5")}>
        <span
          className={cn(
            "text-center text-[13px] font-bold tabular-nums",
            isNext && !set.completed ? "text-primary" : "text-muted-foreground"
          )}
        >
          {index + 1}
        </span>
        <button
          type="button"
          onClick={() => setShowWeight(true)}
          disabled={set.completed}
          aria-label={`Set ${index + 1} weight in ${unit}`}
          className={cn(fieldCls, "disabled:pointer-events-none")}
        >
          <span className="truncate">{weightDisplay || weightPlaceholder}</span>
        </button>
        <input
          type="number"
          name={`set-${index + 1}-reps`}
          aria-label={`Set ${index + 1} reps`}
          inputMode="numeric"
          value={set.reps}
          onChange={(event) => onRepsChange(event.target.value)}
          placeholder={lastSet?.reps ? String(lastSet.reps) : "–"}
          disabled={set.completed}
          className={cn(
            fieldCls,
            "text-center [appearance:textfield] placeholder:text-muted-foreground/60 focus:border-foreground/30 disabled:pointer-events-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          )}
        />
        <button
          type="button"
          onClick={() => setShowRest(true)}
          aria-label={`Set ${index + 1} rest time`}
          className="flex h-11 items-center justify-center gap-1 text-[13px] font-semibold text-muted-foreground tabular-nums transition-colors active:text-foreground"
        >
          <Timer size={11} />
          {formatRest(set.restSeconds)}
        </button>
        {canDelete && !set.completed ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete set ${index + 1}`}
            className="flex h-11 w-full items-center justify-center text-destructive transition-colors active:bg-destructive/10"
          >
            <X size={12} weight="bold" />
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={toggleDone}
          aria-label={set.completed ? "Mark set incomplete" : "Mark set complete"}
          className={cn(
            "mx-auto flex h-9 w-9 items-center justify-center rounded-full transition-colors",
            set.completed
              ? "bg-muted text-foreground/70 active:bg-muted/80"
              : "bg-white text-black active:bg-white/85",
            completionPulse && "motion-set-complete"
          )}
        >
          {set.completed ? (
            <ArrowCounterClockwise size={13} weight="bold" />
          ) : (
            <Check size={14} weight="bold" />
          )}
        </button>
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
      {showWeight && (
        <WeightSelectorSheet
          currentWeight={set.weight}
          barWeight={barWeight}
          barType={barType}
          unit={unit}
          lastSet={lastSet}
          onChange={onWeightConfigChange}
          onClose={() => setShowWeight(false)}
        />
      )}
    </div>
  )
}
