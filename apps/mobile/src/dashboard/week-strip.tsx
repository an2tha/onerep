/**
 * The week bar under the day wheel — interactive, not a chart.
 *
 * Arrows walk back through previous weeks (and forward again, never past
 * this one), each day shows whether it was trained and fed, and tapping a
 * day asks what to retro-log into it: a meal or a workout. The actual log
 * writing stays with the drawers and pages that own it — this only routes,
 * with the right date attached.
 */

import { useMemo, useState } from "react"
import {
  Barbell,
  CaretLeft,
  CaretRight,
  ForkKnife,
} from "@phosphor-icons/react"
import { MobileSheet } from "@repo/ui"

export type WeekDay = {
  /** YYYY-MM-DD */
  dateKey: string
  label: string
  workout: boolean
  food: boolean
  isToday: boolean
  isFuture: boolean
}

/** Monday of the week containing the given date, at noon (safe arithmetic). */
function startOfWeek(date: Date): Date {
  const copy = new Date(date)
  const shift = (copy.getDay() + 6) % 7 // Mon = 0
  copy.setDate(copy.getDate() - shift)
  return copy
}

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

// How far back the arrows are allowed to go. The history queries behind
// the dots don't reach meaningfully past this anyway.
const MAX_WEEKS_BACK = 12

export function WeekStrip({
  todayKey,
  workoutDates,
  foodDates,
  onLogFoodFor,
  onLogWorkoutFor,
  className,
}: {
  todayKey: string
  workoutDates: Set<string>
  foodDates: Set<string>
  onLogFoodFor: (dateKey: string) => void
  onLogWorkoutFor: (dateKey: string) => void
  className?: string
}) {
  const [weeksAgo, setWeeksAgo] = useState(0)
  const [selectedDay, setSelectedDay] = useState<WeekDay | null>(null)

  const days = useMemo<WeekDay[]>(() => {
    const today = new Date(`${todayKey}T12:00:00`)
    const monday = startOfWeek(today)
    monday.setDate(monday.getDate() - weeksAgo * 7)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + index)
      const key = toDateKey(date)
      return {
        dateKey: key,
        label: date.toLocaleDateString("en-US", { weekday: "narrow" }),
        workout: workoutDates.has(key),
        food: foodDates.has(key),
        isToday: key === todayKey,
        isFuture: key > todayKey,
      }
    })
  }, [todayKey, weeksAgo, workoutDates, foodDates])

  const weekLabel = useMemo(() => {
    if (weeksAgo === 0) return "This week"
    const first = days[0]
    const last = days[6]
    const sameMonth = first.dateKey.slice(0, 7) === last.dateKey.slice(0, 7)
    const fmt = (key: string, withMonth: boolean) =>
      new Date(`${key}T12:00:00`).toLocaleDateString("en-US", {
        month: withMonth ? "short" : undefined,
        day: "numeric",
      })
    return `${fmt(first.dateKey, true)} – ${fmt(last.dateKey, !sameMonth)}`
  }, [weeksAgo, days])

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className ?? ""}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous week"
          disabled={weeksAgo >= MAX_WEEKS_BACK}
          onClick={() => setWeeksAgo((value) => value + 1)}
          className="motion-tactile flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <CaretLeft size={13} weight="bold" />
        </button>
        <span
          className="w-[5.5rem] text-center text-[11px] font-semibold tracking-wide text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {weekLabel}
        </span>
        <button
          type="button"
          aria-label="Next week"
          disabled={weeksAgo === 0}
          onClick={() => setWeeksAgo((value) => Math.max(0, value - 1))}
          className="motion-tactile flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <CaretRight size={13} weight="bold" />
        </button>
      </div>

      <div className="flex items-start justify-center gap-3">
        {days.map((day) => (
          <button
            key={day.dateKey}
            type="button"
            disabled={day.isFuture}
            aria-label={`${day.isToday ? "Today" : day.dateKey} — tap to retro-log`}
            onClick={() => setSelectedDay(day)}
            className={`flex w-9 flex-col items-center gap-1.5 ${
              day.isFuture ? "opacity-35" : ""
            }`}
          >
            <span
              className={`text-[11px] font-semibold tabular-nums ${
                day.isToday ? "text-foreground" : "text-muted-foreground/70"
              }`}
            >
              {day.label}
            </span>
            <span
              className={`flex items-center gap-1 rounded-full border px-2 py-1 ${
                day.isToday ? "border-border bg-card" : "border-transparent"
              }`}
            >
              <DayDot
                on={day.workout}
                icon={<Barbell size={9} weight="bold" />}
                label="workout"
              />
              <DayDot
                on={day.food}
                icon={<ForkKnife size={9} weight="bold" />}
                label="food logged"
              />
            </span>
          </button>
        ))}
      </div>

      {/* The sheet only mounts when a day is tapped — MobileSheet always
        renders its overlay, so leaving it mounted with no selection would
        put a permanent black scrim over the dashboard. */}
      {selectedDay && (
        <MobileSheet
          onClose={() => setSelectedDay(null)}
          ariaLabel={`Retro-log for ${selectedDay.dateKey}`}
        >
          <div className="flex flex-col gap-3 px-5 pt-5 pb-8">
            <header>
              <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
                {selectedDay.isToday
                  ? "Log for today"
                  : `Retro-log ${new Date(
                      `${selectedDay.dateKey}T12:00:00`
                    ).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}`}
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                What goes into this day?
              </p>
            </header>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const key = selectedDay.dateKey
                  setSelectedDay(null)
                  onLogFoodFor(key)
                }}
                className="motion-tactile flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                  <ForkKnife size={16} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-foreground">
                    Food
                  </span>
                  <span className="block text-[13px] text-muted-foreground">
                    Log a meal into this day
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const key = selectedDay.dateKey
                  setSelectedDay(null)
                  onLogWorkoutFor(key)
                }}
                className="motion-tactile flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                  <Barbell size={16} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-foreground">
                    Workout
                  </span>
                  <span className="block text-[13px] text-muted-foreground">
                    Log a session into this day
                  </span>
                </span>
              </button>
            </div>
          </div>
        </MobileSheet>
      )}
    </div>
  )
}

function DayDot({
  on,
  icon,
  label,
}: {
  on: boolean
  icon: React.ReactNode
  label: string
}) {
  return (
    <span
      title={label}
      aria-hidden="true"
      className={`flex size-4 items-center justify-center rounded-full ${
        on ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
      }`}
    >
      {icon}
    </span>
  )
}
