import { Timer, X } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { cn } from "../lib/utils"

export type ExerciseSuggestionItem = {
  id: string
  name: string
  category?: string
  muscle?: string
}

export type ExerciseSuggestionVariant = "chips" | "list"

function ExerciseSuggestionSection<T extends ExerciseSuggestionItem>({
  label,
  suggestions,
  onChoose,
  variant,
}: {
  label: string
  suggestions: readonly T[]
  onChoose: (exercise: T) => void
  variant: ExerciseSuggestionVariant
}) {
  if (suggestions.length === 0) return null

  if (variant === "chips") {
    return (
      <div className="w-full">
        <p className="mb-2 text-[13px] font-medium text-muted-foreground">
          {label}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onChoose(exercise)}
              className="flex min-h-11 items-center border border-border px-3 text-[13px] font-semibold text-foreground transition-colors active:bg-muted"
            >
              {exercise.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <p className="border-b border-border/60 px-1 pb-2 text-[14px] font-semibold text-foreground">
        {label}
      </p>
      <div className="divide-y divide-border/50">
        {suggestions.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            onClick={() => onChoose(exercise)}
            className="flex min-h-[56px] w-full min-w-0 items-center gap-3 px-1 text-left transition-colors active:bg-muted/60"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-foreground">
                {exercise.name}
              </span>
              {(exercise.category || exercise.muscle) && (
                <span className="mt-0.5 block text-[13px] text-muted-foreground capitalize">
                  {[exercise.category, exercise.muscle]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </span>
            <span className="shrink-0 text-[13px] font-medium text-muted-foreground">
              Search
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ExerciseSuggestionGroups<
  TRecent extends ExerciseSuggestionItem,
  TPopular extends ExerciseSuggestionItem,
>({
  recentSuggestions,
  popularSuggestions,
  onChoose,
  recentLabel = "Recent",
  popularLabel = "Popular",
  variant = "list",
}: {
  recentSuggestions: readonly TRecent[]
  popularSuggestions: readonly TPopular[]
  onChoose: (exercise: TRecent | TPopular) => void
  recentLabel?: string
  popularLabel?: string
  variant?: ExerciseSuggestionVariant
}) {
  if (recentSuggestions.length === 0 && popularSuggestions.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col",
        variant === "chips" ? "gap-4" : "gap-6"
      )}
    >
      <ExerciseSuggestionSection
        label={recentLabel}
        suggestions={recentSuggestions}
        onChoose={onChoose}
        variant={variant}
      />
      <ExerciseSuggestionSection
        label={popularLabel}
        suggestions={popularSuggestions}
        onChoose={onChoose}
        variant={variant}
      />
    </div>
  )
}

export const REST_TIMER_OPTIONS = [
  0, 30, 60, 90, 120, 150, 180, 240, 300,
] as const

export function formatRestDuration(seconds: number) {
  if (seconds <= 0) return "Off"
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function splitRestDuration(seconds: number) {
  return {
    minutes: String(Math.floor(seconds / 60)),
    seconds: String(seconds % 60).padStart(2, "0"),
  }
}

function parseRestDuration(minutes: string, seconds: string) {
  const safeMinutes = Math.max(0, Number.parseInt(minutes || "0", 10) || 0)
  const safeSeconds = Math.min(
    59,
    Math.max(0, Number.parseInt(seconds || "0", 10) || 0)
  )
  return safeMinutes * 60 + safeSeconds
}

export function RestTimerSheet({
  current,
  onSelect,
  onClose,
  variant = "workout",
}: {
  current: number
  onSelect: (seconds: number) => void
  onClose: () => void
  variant?: "workout" | "preset"
}) {
  const initial = splitRestDuration(current)
  const [minutes, setMinutes] = useState(initial.minutes)
  const [seconds, setSeconds] = useState(initial.seconds)
  const workout = variant === "workout"

  useEffect(() => {
    const next = splitRestDuration(current)
    setMinutes(next.minutes)
    setSeconds(next.seconds)
  }, [current])

  // Portaled because the sheet opens from inside exercise cards whose enter
  // animations leave a transform behind — a transformed ancestor becomes the
  // containing block for `fixed` and clips the overlay to the card.
  return createPortal(
    <div
      className={cn(
        "sheet-overlay fixed inset-0 z-50 flex items-end justify-center",
        workout
          ? "bg-black/60 backdrop-blur-[6px]"
          : "bg-black/50 backdrop-blur-[3px]"
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "sheet-panel w-full max-w-sm overflow-hidden",
          workout ? "app-sheet-panel" : "rounded-t-3xl bg-card shadow-2xl"
        )}
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {workout && (
          <div className="flex justify-center pt-3 pb-1">
            <div className="app-sheet-handle" />
          </div>
        )}
        <div
          className={cn(
            "flex items-center justify-between px-5",
            workout ? "py-3" : "border-b border-border/60 py-4"
          )}
        >
          <div className="flex items-center gap-2">
            <Timer size={14} className="text-muted-foreground" />
            <span
              className={
                workout ? "text-[14px] font-bold" : "text-[13px] font-semibold"
              }
            >
              Rest timer
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rest timer"
            className={
              workout
                ? "app-icon-button"
                : "flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground/60 transition-colors active:bg-muted/60 active:text-foreground"
            }
          >
            <X size={workout ? 13 : 16} weight="bold" />
          </button>
        </div>
        <div
          className={cn(
            "grid grid-cols-3 gap-2",
            workout ? "px-4 pb-3" : "p-4"
          )}
        >
          {REST_TIMER_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSelect(option)}
              aria-pressed={option === current}
              aria-label={`Set rest to ${formatRestDuration(option)}`}
              className={cn(
                workout
                  ? "h-[52px] rounded-[10px] text-[14px] font-semibold tabular-nums transition-all"
                  : "h-12 rounded-xl text-[13px] font-semibold tracking-tight transition-all active:scale-[0.985]",
                option === current
                  ? "bg-foreground text-background shadow-sm"
                  : workout
                    ? "bg-muted/50 text-muted-foreground/80 active:bg-muted"
                    : "bg-muted/60 text-foreground/80 active:bg-muted"
              )}
            >
              {formatRestDuration(option)}
            </button>
          ))}
        </div>
        <div
          className={cn(
            "border-t border-border/50 px-4 pt-3",
            workout ? "pb-2" : "pb-4"
          )}
        >
          <p
            className={cn(
              "mb-3 text-[13px] text-muted-foreground",
              workout ? "font-medium" : "font-bold tracking-[0.18em] uppercase"
            )}
          >
            {workout ? "Custom" : "Custom rest"}
          </p>
          <div className="flex items-end gap-2">
            <RestTimerInput
              label="Min"
              value={minutes}
              onChange={setMinutes}
              workout={workout}
            />
            {workout && (
              <span className="mb-3 text-[18px] font-light text-muted-foreground">
                :
              </span>
            )}
            <RestTimerInput
              label="Sec"
              value={seconds}
              onChange={setSeconds}
              workout={workout}
              max={59}
            />
            <button
              type="button"
              onClick={() => onSelect(parseRestDuration(minutes, seconds))}
              className={cn(
                "shrink-0 bg-foreground text-[13px] font-bold text-background transition-opacity active:opacity-80",
                workout ? "h-12 rounded-[10px] px-5" : "h-11 rounded-xl px-4"
              )}
            >
              {workout ? "Set" : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function RestTimerInput({
  label,
  value,
  onChange,
  workout,
  max,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  workout: boolean
  max?: number
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span
        className={cn(
          "text-[13px] font-bold text-muted-foreground",
          !workout && "tracking-widest uppercase"
        )}
      >
        {label}
      </span>
      <input
        type="number"
        aria-label={`Custom rest ${label === "Min" ? "minutes" : "seconds"}`}
        min="0"
        max={max}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "outline-none",
          workout
            ? "h-12 [appearance:textfield] rounded-[10px] border border-border/45 bg-muted/25 px-3 text-center text-[18px] font-semibold tabular-nums focus:border-foreground/35 focus:bg-background/70 [&::-webkit-inner-spin-button]:appearance-none"
            : "h-11 rounded-xl border border-border/60 bg-background px-3 text-[15px] font-semibold tabular-nums focus:border-foreground/25"
        )}
      />
    </label>
  )
}
