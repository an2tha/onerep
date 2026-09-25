import { Message, tr } from "@repo/ui/i18n"
import {
  ArrowCounterClockwise,
  CaretDown,
  Check,
  Timer,
  X,
} from "@phosphor-icons/react"
import { cn } from "../lib/utils"

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
  typeLabel?: string
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
  onCycleType?: () => void
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
    "h-11 w-28 bg-transparent text-right text-[16px] font-semibold tabular-nums outline-none",
    "placeholder:text-muted-foreground/60",
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
        "relative transition-colors duration-200",
        completionPulse && "bg-muted/20"
      )}
    >
      <div
        className={cn(
          "border-b border-border",
          isNext && !completed && "bg-primary/[0.04]"
        )}
      >
        <div className="flex min-h-12 items-center justify-between gap-3 px-3">
          <div className="min-w-0 flex-1">
            {!typeLabel ? (
              <div className="flex min-h-11 items-center">
                <span className="text-[13px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                  <Message
                    text={"Set {{value0}}"}
                    values={{ value0: index + 1 }}
                  />
                </span>
              </div>
            ) : typeOptions && typeValue && onTypeChange ? (
              <label className="relative inline-flex max-w-full items-center">
                <span className="sr-only">{tr("Set type")}</span>
                <select
                  value={typeValue}
                  onChange={(event) => onTypeChange(event.target.value)}
                  disabled={disabled}
                  className="h-11 max-w-full appearance-none bg-transparent pr-7 text-[15px] font-semibold text-foreground outline-none active:bg-muted/35 disabled:pointer-events-none disabled:opacity-45"
                  aria-label={tr("Set {{value0}} type", { value0: index + 1 })}
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
                  className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
                />
              </label>
            ) : (
              <button
                type="button"
                onClick={onCycleType}
                disabled={disabled}
                aria-label={tr("Set mode: {{value0}}. Tap to change.", {
                  value0: typeLabel,
                })}
                className="inline-flex h-11 max-w-full items-center bg-transparent pr-2 text-left text-[15px] font-semibold text-foreground transition-colors active:bg-muted/35 disabled:pointer-events-none disabled:opacity-45"
              >
                <span className="truncate">{typeLabel}</span>
                <CaretDown
                  size={12}
                  weight="bold"
                  className="ml-2 shrink-0 text-muted-foreground"
                />
              </button>
            )}
            {isNext && !completed && (
              <span className="block text-[13px] font-medium text-muted-foreground">
                {tr("Next set")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {!onToggleComplete && (
              <span className="text-[13px] font-medium text-muted-foreground">
                <Message
                  text={"Set {{value0}}"}
                  values={{ value0: index + 1 }}
                />
              </span>
            )}
            {canDelete && !completed && (
              <button
                type="button"
                onClick={onDelete}
                aria-label={tr("Delete set {{value0}}", { value0: index + 1 })}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-destructive transition-colors active:bg-destructive/10"
              >
                <X size={12} weight="bold" />
              </button>
            )}
            {onToggleComplete && (
              <button
                type="button"
                onClick={onToggleComplete}
                aria-label={
                  completed
                    ? tr("Mark set incomplete")
                    : tr("Mark set complete")
                }
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
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
          <div className="flex min-h-12 items-stretch border-t border-border">
            <button
              type="button"
              onClick={onWeightClick}
              disabled={disabled}
              aria-label={tr("Select weight in {{value0}}", { value0: unit })}
              className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 px-3 text-left transition-colors active:bg-muted/25 disabled:pointer-events-none"
            >
              <span className="text-[15px] font-medium text-foreground">
                {tr("Weight")}
              </span>
              <span className="text-[15px] font-semibold text-muted-foreground tabular-nums">
                {weightLabel} {unit}
              </span>
            </button>
            {weightActionLabel && (
              <button
                type="button"
                onClick={onWeightActionClick}
                disabled={disabled}
                className="min-h-12 border-l border-border px-3 text-[13px] font-semibold text-muted-foreground active:bg-muted active:text-foreground"
              >
                {weightActionLabel}
              </button>
            )}
          </div>
        ) : (
          <div className="flex min-h-12 items-center justify-between gap-3 border-t border-border px-3">
            <span className="text-[15px] font-medium text-foreground">
              {tr("Weight")}
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                name={`set-${index + 1}-weight`}
                aria-label={tr("Set {{value0}} weight in {{value1}}", {
                  value0: index + 1,
                  value1: unit,
                })}
                inputMode="decimal"
                value={weightValue}
                onChange={(event) => onWeightChange?.(event.target.value)}
                placeholder={weightPlaceholder}
                className={fieldCls}
              />
              <span className="text-[13px] font-medium text-muted-foreground">
                {unit}
              </span>
            </div>
          </div>
        )}

        <div className="flex min-h-12 items-center justify-between gap-3 border-t border-border px-3">
          <span className="text-[15px] font-medium text-foreground">
            {tr("Reps")}
          </span>
          <input
            type="number"
            name={`set-${index + 1}-reps`}
            aria-label={tr("Set {{value0}} reps", { value0: index + 1 })}
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
          aria-label={tr("Set {{value0}} rest time", { value0: index + 1 })}
          className="flex min-h-12 w-full items-center justify-between gap-3 border-t border-border px-3 text-left transition-colors active:bg-muted/25"
        >
          <span className="text-[15px] font-medium text-foreground">
            {tr("Rest")}
          </span>
          <span className="flex items-center gap-1.5 text-[15px] font-semibold text-muted-foreground tabular-nums">
            <Timer size={12} className="text-muted-foreground" />
            {restLabel}
          </span>
        </button>
      </div>
    </div>
  )
}
