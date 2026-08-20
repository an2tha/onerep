import { cn } from "../lib/utils"
import { Calendar } from "./ui/calendar"

/**
 * A month grid that speaks the only date type this app actually stores:
 * `YYYY-MM-DD`, meaning the local day, not an instant.
 *
 * `Calendar` deals in `Date`, and every call site that wanted a date key from
 * it has so far done its own conversion by hand — the dashboard's date nav
 * subtracts two timestamps and rounds the milliseconds into days. That works
 * until someone reaches for the obvious shortcut instead, `toISOString()`
 * sliced to ten characters, which returns the UTC day and files a Monday
 * evening in Chicago against Tuesday. That exact bug shipped and was fixed
 * here. So the conversion is written once, in this file, and nowhere else.
 *
 * Both ends of the range are inclusive and are date keys too, so a caller
 * never has to build a boundary `Date` to say "not before this day".
 */

/**
 * Noon, deliberately. Midnight local is one DST hop away from being the
 * previous day, and every renderer here only ever reads the calendar fields.
 */
export function dateKeyToLocalNoon(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`)
}

/** The reverse, taken off the local calendar fields rather than the epoch. */
export function localDateToDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function DateKeyCalendar({
  value,
  min,
  max,
  onSelect,
  className,
}: {
  /** The day currently chosen, as a date key. */
  value: string
  /** Oldest pickable day, inclusive. */
  min: string
  /** Newest pickable day, inclusive. */
  max: string
  onSelect: (dateKey: string) => void
  className?: string
}) {
  const selected = dateKeyToLocalNoon(value)

  return (
    <Calendar
      mode="single"
      selected={selected}
      defaultMonth={selected}
      startMonth={dateKeyToLocalNoon(min)}
      endMonth={dateKeyToLocalNoon(max)}
      // Compared as keys rather than as Dates: string order on `YYYY-MM-DD` is
      // day order, and it cannot be knocked sideways by a clock hour.
      disabled={(date) => {
        const key = localDateToDateKey(date)
        return key < min || key > max
      }}
      onSelect={(date) => {
        if (date) onSelect(localDateToDateKey(date))
      }}
      // Days from the neighbouring months are almost all out of range on a
      // seven-day window, and a row of greyed-out numbers reads as broken.
      showOutsideDays={false}
      className={cn("w-full p-0 [--cell-size:--spacing(9)]", className)}
      classNames={{ month: "flex w-full flex-col gap-3" }}
    />
  )
}
