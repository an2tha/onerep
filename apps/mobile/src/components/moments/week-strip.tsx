import type { WeeklyReportDay } from "@/lib/moments"

/**
 * The week, seven columns wide.
 *
 * Two measures, so two rows rather than one plot with two scales: sets per day
 * as bars against a shared maximum, and whether food was logged as a filled or
 * hollow dot beneath. Both draw in the app's ink at controlled opacity — a
 * single series needs no palette and no legend, and the heading above already
 * names what the bars are.
 *
 * Only the best day is labelled. A number over every bar is noise on a screen
 * nobody asked to see.
 */
export function WeekStrip({ days }: { days: WeeklyReportDay[] }) {
  const peak = Math.max(...days.map((day) => day.sets), 0)
  const peakIndex = peak > 0 ? days.findIndex((day) => day.sets === peak) : -1

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex items-baseline justify-between px-0.5">
        <span className="text-[13px] font-semibold">Sets per day</span>
        <span className="text-[12px] text-muted-foreground">
          {peak > 0 ? `peak ${peak}` : "nothing logged"}
        </span>
      </figcaption>

      <div className="flex items-end gap-1.5">
        {days.map((day, index) => {
          const ratio = peak > 0 ? day.sets / peak : 0
          return (
            <div
              key={day.date}
              className="flex min-w-0 flex-1 flex-col items-center"
            >
              <span
                className={
                  index === peakIndex
                    ? "mb-1 text-[11px] font-semibold tabular-nums"
                    : "mb-1 text-[11px] text-transparent tabular-nums"
                }
                aria-hidden={index === peakIndex ? undefined : true}
              >
                {day.sets}
              </span>

              {/* The track keeps empty days visible as days, not as gaps. */}
              <div
                className="relative flex h-[72px] w-full items-end overflow-hidden rounded-[4px] bg-muted/40"
                role="img"
                aria-label={`${day.label}: ${day.sets} sets, ${
                  day.loggedFood ? "food logged" : "no food logged"
                }`}
              >
                {day.sets > 0 && (
                  <div
                    className="w-full rounded-[4px] bg-foreground/85"
                    style={{ height: `${Math.max(6, ratio * 100)}%` }}
                  />
                )}
              </div>

              <span
                aria-hidden
                className={
                  day.loggedFood
                    ? "mt-2 h-[7px] w-[7px] rounded-full bg-foreground/70"
                    : "mt-2 h-[7px] w-[7px] rounded-full border border-muted-foreground/40"
                }
              />
              <span className="mt-1.5 text-[11px] text-muted-foreground">
                {day.label}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-2 px-0.5 text-[12px] text-muted-foreground">
        Filled dot: food logged that day.
      </p>
    </figure>
  )
}
