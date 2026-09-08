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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Barbell,
  CalendarBlank,
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

/** The phone needs one date door, not a second navigation rail above the
 * persistent app tabs. Keep the native picker, but open it from a real button
 * so taps do not depend on an invisible input overlay. */
export function MobileDateSelector({
  todayKey,
  selectedKey,
  onSelectDay,
}: {
  todayKey: string
  selectedKey: string
  onSelectDay: (dateKey: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const label =
    selectedKey === todayKey
      ? "Today"
      : new Date(`${selectedKey}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })

  const openPicker = () => {
    const input = inputRef.current
    if (!input) return

    input.focus({ preventScroll: true })
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker()
        return
      }
    } catch {
      // Some embedded WebViews expose showPicker but reject it. The click
      // fallback remains inside the original user gesture.
    }
    input.click()
  }

  return (
    <span className="relative flex size-11 items-center justify-center">
      <button
        type="button"
        aria-label={`Choose dashboard date. ${label} selected`}
        title={`Choose date — ${label}`}
        onClick={openPicker}
        className="motion-tactile flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/70"
      >
        <CalendarBlank size={22} weight="regular" aria-hidden="true" />
      </button>
      <input
        ref={inputRef}
        type="date"
        value={selectedKey}
        max={todayKey}
        tabIndex={-1}
        aria-label="Dashboard date"
        onChange={(event) => {
          const next = event.currentTarget.value
          if (next && next <= todayKey) onSelectDay(next)
        }}
        className="pointer-events-none absolute right-0 bottom-0 size-px opacity-0"
      />
    </span>
  )
}

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
  const rootRef = useRef<HTMLDivElement>(null)
  const previousSelectedKey = useRef(selectedKey)
  const slideAnimation = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    if (previousSelectedKey.current === selectedKey) return
    previousSelectedKey.current = selectedKey

    const node = rootRef.current
    if (!node || typeof node.animate !== "function") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return

    let fromTransform = "translate3d(0, 1.25rem, 0)"
    if (slideAnimation.current?.playState === "running") {
      fromTransform = window.getComputedStyle(node).transform
    }
    slideAnimation.current?.cancel()
    slideAnimation.current = node.animate(
      [
        { transform: fromTransform },
        { transform: "translate3d(0, 0, 0)" },
      ],
      {
        duration: 1200,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }
    )
  }, [selectedKey])

  useEffect(
    () => () => {
      slideAnimation.current?.cancel()
    },
    []
  )

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
    <div
      ref={rootRef}
      className={`flex flex-col items-center gap-1.5 ${className ?? ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous week"
          disabled={weeksAgo >= MAX_WEEKS_BACK}
          onClick={() => setWeeksAgo((value) => value + 1)}
          className="motion-tactile flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <CaretLeft size={13} weight="bold" />
        </button>
        <span
          className="w-[6.5rem] text-center text-[12px] font-medium text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {weekLabel}
        </span>
        <button
          type="button"
          aria-label="Next week"
          disabled={weeksAgo === 0}
          onClick={() => setWeeksAgo((value) => Math.max(0, value - 1))}
          className="motion-tactile flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <CaretRight size={13} weight="bold" />
        </button>
      </div>

      {/* Seven columns of two dots is the whole width of a small phone if
          each gets a gutter. Tight here, roomier on the desk. */}
      <div className="flex w-full items-start justify-between gap-1">
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
              className={`flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1.5 ${
                day.isFuture ? "opacity-35" : ""
              }`}
            >
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  selected || day.isToday
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {day.label}
              </span>
              {/* Selection inverts rather than tinting a border. Today and
                the open day were a border-color apart, which at this size is
                no difference at all. */}
              <span
                className={`flex items-center gap-0.5 rounded-full border px-1.5 py-1 transition-colors lg:gap-1 lg:px-2 ${
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

      {/* Reserve the return action's row even while today is selected. Its
          conditional height used to resize the wheel and kick the centered
          timeline pill up or down whenever the open day changed. */}
      <div className="flex min-h-7 items-center justify-center">
        {selectedKey !== todayKey && (
          // The way back. Without it the only route home is finding today in
          // the grid, which is a puzzle three weeks out.
          <button
            type="button"
            onClick={() => onSelectDay(todayKey)}
            className="motion-tactile motion-content-in flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors active:text-foreground"
          >
            Back to today
            <CaretRight size={10} weight="bold" />
          </button>
        )}
      </div>
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
