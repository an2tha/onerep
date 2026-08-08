import type * as React from "react"
import { useMemo, useState } from "react"
import {
  Barbell,
  CaretLeft,
  CaretRight,
  Fire,
  Heart,
  Sparkle,
  X,
} from "@phosphor-icons/react"
import { MobileSheet } from "@/components/mobile-sheet"
import { cn } from "@/lib/utils"
import { hapticSelection } from "@/lib/haptics"
import { offsetDateKey } from "@/lib/food-log"
import type { WorkoutFocus, WorkoutPresetCard } from "@/lib/workout-sync"

const FOCUS_ICON: Record<
  WorkoutFocus,
  React.ComponentType<React.ComponentProps<typeof Barbell>>
> = {
  strength: Barbell,
  cardio: Fire,
  mobility: Heart,
}

/** How far back the day strip reaches. Two weeks covers "I forgot to log it". */
const DAY_CHOICES = 14

function chipLabels(dateKey: string) {
  // Parsed as local noon so a UTC offset can't roll the weekday over a day.
  const at = new Date(`${dateKey}T12:00:00`)
  return {
    weekday: at.toLocaleDateString(undefined, { weekday: "short" }),
    day: String(at.getDate()),
  }
}

export function fullDateLabel(dateKey: string, todayKey: string) {
  if (dateKey === todayKey) return "Today"
  if (dateKey === offsetDateKey(todayKey, -1)) return "Yesterday"
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

/**
 * The horizontal run of recent days, newest first.
 *
 * Exported because the check-in moment asks the same question from a full
 * screen instead of a sheet, and two strips that drift apart is two strips
 * too many.
 */
export function DayStrip({
  todayKey,
  value,
  onChange,
  days = DAY_CHOICES,
  className,
}: {
  todayKey: string
  value: string
  onChange: (date: string) => void
  days?: number
  className?: string
}) {
  const dayKeys = useMemo(
    () =>
      Array.from({ length: days }, (_, index) =>
        offsetDateKey(todayKey, -index)
      ),
    [days, todayKey]
  )

  return (
    <div
      className={cn("flex gap-1.5 overflow-x-auto", className)}
      style={{ scrollbarWidth: "none" }}
    >
      {dayKeys.map((dayKey) => {
        const { weekday, day } = chipLabels(dayKey)
        const selected = dayKey === value
        return (
          <button
            key={dayKey}
            type="button"
            aria-pressed={selected}
            aria-label={fullDateLabel(dayKey, todayKey)}
            onClick={() => {
              hapticSelection()
              onChange(dayKey)
            }}
            className={cn(
              "motion-tactile flex h-[58px] w-[46px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px] transition-colors",
              selected
                ? "bg-foreground text-background"
                : "bg-muted/40 text-muted-foreground active:bg-muted/70"
            )}
          >
            <span className="text-[11px] font-medium">{weekday}</span>
            <span className="text-[16px] leading-none font-semibold tabular-nums">
              {day}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The single funnel into retro logging: what day, and which way in.
 *
 * The day strip lives here rather than behind the page's calendar button so the
 * whole decision — when, and how — is one sheet instead of a picker followed by
 * a second tap on a date the user has already chosen.
 */
export function LogPastWorkoutSheet({
  todayKey,
  initialDate,
  presets,
  onDescribe,
  onPickPreset,
  onClose,
}: {
  todayKey: string
  initialDate: string
  presets: WorkoutPresetCard[]
  onDescribe: (date: string) => void
  onPickPreset: (date: string, presetId: string) => void
  onClose: () => void
}) {
  const [date, setDate] = useState(initialDate)
  const [step, setStep] = useState<"choose" | "preset">("choose")

  return (
    <MobileSheet
      onClose={onClose}
      ariaLabel="Log a past workout"
      overlayClassName="bg-black/50 backdrop-blur-[8px]"
      panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-[24px] bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
      panelStyle={{
        paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
      }}
      maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
    >
      <div className="px-5 pt-1 pb-2">
        <div className="flex items-center gap-2">
          {step === "preset" && (
            <button
              type="button"
              aria-label="Back"
              onClick={() => {
                hapticSelection()
                setStep("choose")
              }}
              className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted/60"
            >
              <CaretLeft size={16} weight="bold" />
            </button>
          )}
          <h2 className="min-w-0 flex-1 text-[20px] font-semibold tracking-tight">
            {step === "choose" ? "Log a past workout" : "Pick a preset"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors active:bg-muted"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      </div>

      {step === "choose" ? (
        <>
          <DayStrip
            todayKey={todayKey}
            value={date}
            onChange={setDate}
            className="px-5 pb-1.5"
          />
          <p className="px-5 pt-2 text-[13px] text-muted-foreground">
            {fullDateLabel(date, todayKey)}
          </p>

          <div className="px-4 pt-4 pb-4">
            <div className="app-surface overflow-hidden">
              <button
                type="button"
                onClick={() => onDescribe(date)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors active:bg-muted/40"
              >
                <span className="app-icon-button pointer-events-none h-9 w-9 shrink-0 bg-muted/55 text-muted-foreground/70">
                  <Sparkle size={16} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">
                    Describe it
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                    Say what you did and your coach fills in the sets.
                  </span>
                </span>
                <CaretRight
                  size={11}
                  className="shrink-0 text-muted-foreground"
                />
              </button>
              <div className="mx-4 h-px bg-border/50" />
              <button
                type="button"
                disabled={presets.length === 0}
                onClick={() => {
                  hapticSelection()
                  setStep("preset")
                }}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors active:bg-muted/40 disabled:opacity-45"
              >
                <span className="app-icon-button pointer-events-none h-9 w-9 shrink-0 bg-muted/55 text-muted-foreground/70">
                  <Barbell size={16} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">
                    Use a preset
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                    {presets.length === 0
                      ? "You haven't saved a preset yet."
                      : "Start from a saved plan and fill in the numbers."}
                  </span>
                </span>
                <CaretRight
                  size={11}
                  className="shrink-0 text-muted-foreground"
                />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5 px-4 pt-2 pb-4">
          {presets.map((preset) => {
            const Icon = FOCUS_ICON[preset.focus]
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPickPreset(date, preset.id)}
                className="flex items-center gap-3 rounded-2xl bg-muted/40 px-4 py-3.5 text-left transition-colors active:bg-muted/70"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/70">
                  <Icon
                    size={14}
                    weight="duotone"
                    className="text-foreground/60"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">
                    {preset.name}
                  </span>
                  <span className="block text-[13px] text-muted-foreground">
                    {preset.steps.length} exercises · {preset.duration}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </MobileSheet>
  )
}
