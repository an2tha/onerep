import React from "react"
import {
  ArrowCounterClockwise,
  CaretDown,
  Check,
  Timer,
  X,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

export function AppleFitnessSetRow({
  index,
  typeLabel,
  unit,
  weightValue,
  weightPlaceholder = "0",
  repsValue,
  repsPlaceholder = "0",
  restLabel,
  canDelete,
  disabled,
  completed,
  completionPulse,
  isNext,
  onCycleType,
  typeValue,
  typeOptions,
  onTypeChange,
  onDelete,
  onToggleComplete,
  onWeightClick,
  weightActionLabel,
  onWeightActionClick,
  onWeightChange,
  onRepsChange,
  onRestClick,
}: {
  index: number
  typeLabel: string
  unit: string
  weightValue: string
  weightPlaceholder?: string
  repsValue: string
  repsPlaceholder?: string
  restLabel: string
  canDelete: boolean
  disabled?: boolean
  completed?: boolean
  completionPulse?: boolean
  isNext?: boolean
  onCycleType: () => void
  typeValue?: string
  typeOptions?: Array<{ value: string; label: string }>
  onTypeChange?: (value: string) => void
  onDelete: () => void
  onToggleComplete?: () => void
  onWeightClick?: () => void
  weightActionLabel?: string
  onWeightActionClick?: () => void
  onWeightChange?: (value: string) => void
  onRepsChange: (value: string) => void
  onRestClick: () => void
}) {
  const fieldCls = cn(
    "h-7 w-24 bg-transparent text-right text-[13px] font-bold tabular-nums transition-all outline-none",
    "placeholder:text-muted-foreground/30",
    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    completed
      ? "cursor-default text-foreground/55"
      : "text-foreground focus:text-foreground",
    "disabled:pointer-events-none"
  )
  const weightLabel = weightValue || weightPlaceholder

  return (
    <div
      className={cn(
        "relative px-2 py-1.5 transition-[background-color,transform,box-shadow] duration-300 md:px-2.5",
        completionPulse && "bg-muted/20"
      )}
    >
      <div
        className={cn(
          "overflow-hidden rounded-[0.7rem] border bg-background/45 transition-colors",
          isNext && !completed ? "border-white/55" : "border-border/14"
        )}
      >
        <div className="flex min-h-9 items-center justify-between gap-3 px-3">
          <div className="min-w-0 flex-1">
            {typeOptions && typeValue && onTypeChange ? (
              <label className="relative inline-flex max-w-full items-center">
                <span className="sr-only">Set type</span>
                <select
                  value={typeValue}
                  onChange={(event) => onTypeChange(event.target.value)}
                  disabled={disabled}
                  className="h-7 max-w-full appearance-none rounded-md bg-transparent pr-7 text-[13.5px] font-bold text-foreground outline-none transition-colors active:bg-muted/35 disabled:pointer-events-none disabled:opacity-45"
                  aria-label={`Set ${index + 1} type`}
                >
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <CaretDown
                  size={12}
                  weight="bold"
                  className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground/55"
                />
              </label>
            ) : (
              <button
                type="button"
                onClick={onCycleType}
                disabled={disabled}
                aria-label={`Set mode: ${typeLabel}. Tap to change.`}
                title={`Set mode: ${typeLabel}`}
                className="inline-flex h-7 max-w-full items-center rounded-md bg-transparent pr-2 text-left text-[13.5px] font-bold text-foreground transition-colors active:bg-muted/35 disabled:pointer-events-none disabled:opacity-45"
              >
                <span className="truncate">{typeLabel}</span>
                <CaretDown
                  size={12}
                  weight="bold"
                  className="ml-2 shrink-0 text-muted-foreground/55"
                />
              </button>
            )}
            {isNext && !completed && (
              <span className="block text-[10px] font-semibold text-muted-foreground/50">
                Next
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {!onToggleComplete && (
              <span className="text-[11.5px] font-bold text-muted-foreground/48">
                Set {index + 1}
              </span>
            )}
            {canDelete && !completed && (
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Delete set ${index + 1}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/30 transition-colors active:bg-muted/45 active:text-foreground"
              >
                <X size={12} weight="bold" />
              </button>
            )}
            {onToggleComplete && (
              <button
                type="button"
                onClick={onToggleComplete}
                aria-label={
                  completed ? "Mark set incomplete" : "Mark set complete"
                }
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                  completed
                    ? "bg-muted text-foreground/70 active:bg-muted/80"
                    : "bg-white text-black active:bg-white/85",
                  completionPulse && "motion-set-complete"
                )}
              >
                {completed ? (
                  <ArrowCounterClockwise size={14} weight="bold" />
                ) : (
                  <Check size={15} weight="bold" />
                )}
              </button>
            )}
          </div>
        </div>

        {onWeightClick ? (
          <button
            type="button"
            onClick={onWeightClick}
            disabled={disabled}
            aria-label={`Select weight in ${unit}`}
            className="flex min-h-9 w-full items-center justify-between gap-3 border-t border-border/14 px-3 text-left transition-colors active:bg-muted/25 disabled:pointer-events-none"
          >
            <span className="text-[12.5px] font-semibold text-foreground/75">
              Weight
            </span>
            <span className="flex min-w-0 items-center gap-2">
              {weightActionLabel && (
                <span
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  onClick={(event) => {
                    event.stopPropagation()
                    onWeightActionClick?.()
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    event.stopPropagation()
                    onWeightActionClick?.()
                  }}
                  className="shrink-0 rounded-md border border-border/20 bg-muted/15 px-2 py-0.5 text-[10px] font-bold tracking-tight text-muted-foreground/70 transition-colors active:bg-muted/45 active:text-foreground"
                >
                  {weightActionLabel}
                </span>
              )}
              <span className="text-[12.5px] font-bold text-muted-foreground/65 tabular-nums">
                {weightLabel} {unit}
              </span>
            </span>
          </button>
        ) : (
          <div className="flex min-h-9 items-center justify-between gap-3 border-t border-border/14 px-3">
            <span className="text-[12.5px] font-semibold text-foreground/75">
              Weight
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                name={`set-${index + 1}-weight`}
                aria-label={`Set ${index + 1} weight in ${unit}`}
                inputMode="decimal"
                value={weightValue}
                onChange={(event) => onWeightChange?.(event.target.value)}
                placeholder={weightPlaceholder}
                className={fieldCls}
              />
              <span className="text-[11px] font-bold text-muted-foreground/48">
                {unit}
              </span>
            </div>
          </div>
        )}

        <div className="flex min-h-9 items-center justify-between gap-3 border-t border-border/14 px-3">
          <span className="text-[12.5px] font-semibold text-foreground/75">
            Reps
          </span>
          <input
            type="number"
            name={`set-${index + 1}-reps`}
            aria-label={`Set ${index + 1} reps`}
            inputMode="numeric"
            value={repsValue}
            onChange={(event) => onRepsChange(event.target.value)}
            placeholder={repsPlaceholder}
            disabled={disabled}
            className={fieldCls}
          />
        </div>

        <button
          type="button"
          onClick={onRestClick}
          aria-label={`Set ${index + 1} rest time`}
          className="flex min-h-9 w-full items-center justify-between gap-3 border-t border-border/14 px-3 text-left transition-colors active:bg-muted/25"
        >
          <span className="text-[12.5px] font-semibold text-foreground/75">
            Rest
          </span>
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-muted-foreground/65 tabular-nums">
            <Timer size={12} className="text-muted-foreground/55" />
            {restLabel}
          </span>
        </button>
      </div>
    </div>
  )
}
