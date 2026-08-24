/**
 * The week bar under the day wheel — interactive, not a chart.
 *
 * Arrows walk back through previous weeks (and forward again, never past
 * this one), each day shows whether it was trained and fed, and tapping a
 * day opens it on the wheel above: its meals, water, supplements and
 * sessions on the same ruler today uses.
 *
 * It used to answer a tap with a sheet asking what to retro-log into that
 * day, which meant the one thing you could not do with a past day was look
 * at it. Adding to it still works — the wheel's own + writes into whichever
 * day it is showing — and now you can see what is already there first.
 */

import { useMemo, useState } from "react"
import {
  Barbell,
  CaretLeft,
  CaretRight,
  ForkKnife,
} from "@phosphor-icons/react"

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
  selectedKey,
  onSelectDay,
  workoutDates,
  foodDates,
  className,
}: {
  todayKey: string
  /** The day the wheel above is showing. */
  selectedKey: string
  onSelectDay: (dateKey: string) => void
  workoutDates: Set<string>
  foodDates: Set<string>
  className?: string
}) {
  const [weeksAgo, setWeeksAgo] = useState(0)

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
        {days.map((day) => {
          const selected = day.dateKey === selectedKey
          return (
            <button
              key={day.dateKey}
              type="button"
              disabled={day.isFuture}
              aria-current={selected ? "date" : undefined}
              aria-label={`${
                day.isToday ? "Today" : day.dateKey
              } — open this day`}
              onClick={() => onSelectDay(day.dateKey)}
              className={`flex w-9 flex-col items-center gap-1.5 ${
                day.isFuture ? "opacity-35" : ""
              }`}
            >
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  selected || day.isToday
                    ? "text-foreground"
                    : "text-muted-foreground/70"
                }`}
              >
                {day.label}
              </span>
              {/* Selection inverts rather than tinting a border. Today and
                the open day were a border-color apart, which at this size is
                no difference at all. */}
              <span
                className={`flex items-center gap-1 rounded-full border px-2 py-1 transition-colors ${
                  selected
                    ? "border-foreground bg-foreground"
                    : day.isToday
                      ? "border-border bg-card"
                      : "border-transparent"
                }`}
              >
                <DayDot
                  on={day.workout}
                  inverted={selected}
                  icon={<Barbell size={9} weight="bold" />}
                  label="workout"
                />
                <DayDot
                  on={day.food}
                  inverted={selected}
                  icon={<ForkKnife size={9} weight="bold" />}
                  label="food logged"
                />
              </span>
            </button>
          )
        })}
      </div>

      {selectedKey !== todayKey && (
        // The way back. Without it the only route home is finding today in
        // the grid, which is a puzzle three weeks out.
        <button
          type="button"
          onClick={() => onSelectDay(todayKey)}
          className="motion-tactile motion-content-in mt-0.5 flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors active:text-foreground"
        >
          Back to today
          <CaretRight size={10} weight="bold" />
        </button>
      )}
    </div>
  )
}

function DayDot({
  on,
  inverted = false,
  icon,
  label,
}: {
  on: boolean
  /** Sitting on the selected day's filled pill, where the usual fills vanish. */
  inverted?: boolean
  icon: React.ReactNode
  label: string
}) {
  return (
    <span
      title={label}
      aria-hidden="true"
      className={`flex size-4 items-center justify-center rounded-full ${
        inverted
          ? on
            ? "bg-background text-foreground"
            : "bg-background/25 text-background/70"
          : on
            ? "bg-foreground text-background"
            : "bg-muted text-muted-foreground"
      }`}
    >
      {icon}
    </span>
  )
}
