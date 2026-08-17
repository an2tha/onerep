import { useState } from "react"
import { CalendarDots, CaretLeft, CaretRight } from "@phosphor-icons/react"
import { Calendar, Popover, PopoverContent, PopoverTrigger } from "@repo/ui"
import { dateForOffset } from "@/lib/food-log"
import { MIN_DAY_OFFSET } from "./constants"
import { dateKeyToCalendarDate, dayOffsetLabel } from "./helpers"

/**
 * Back a day, forward a day, or pick one off the calendar. Forward is capped at
 * today because there is nothing to log in a day that hasn't happened.
 */
export function DateNav({
  offset,
  timeZone,
  onChange,
}: {
  offset: number
  timeZone: string
  onChange: (o: number) => void
}) {
  const [open, setOpen] = useState(false)

  const todayKey = dateForOffset(0, timeZone)
  const minDateKey = dateForOffset(MIN_DAY_OFFSET, timeZone)
  const selectedDateKey = dateForOffset(offset, timeZone)
  const today = dateKeyToCalendarDate(todayKey)
  const minDate = dateKeyToCalendarDate(minDateKey)
  const selectedDate = dateKeyToCalendarDate(selectedDateKey)

  function handleCalendarSelect(date: Date | undefined) {
    if (!date) return
    const diffMs = date.getTime() - today.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
    const clamped = Math.max(MIN_DAY_OFFSET, Math.min(0, diffDays))
    onChange(clamped)
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(MIN_DAY_OFFSET, offset - 1))}
        disabled={offset <= MIN_DAY_OFFSET}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted/45 active:text-foreground disabled:opacity-25"
        aria-label="Previous day"
      >
        <CaretLeft size={14} weight="bold" />
      </button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="app-icon-button h-10 w-10 bg-transparent text-muted-foreground hover:text-foreground"
            aria-label={`Choose date, ${dayOffsetLabel(offset, timeZone)}`}
          >
            <CalendarDots size={15} weight="bold" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            disabled={(date) => date > today || date < minDate}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <button
        onClick={() => onChange(Math.min(0, offset + 1))}
        disabled={offset >= 0}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted/45 active:text-foreground disabled:opacity-25"
        aria-label="Next day"
      >
        <CaretRight size={14} weight="bold" />
      </button>
    </div>
  )
}
