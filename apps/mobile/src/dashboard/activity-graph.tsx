import { useState } from "react"
import { Card, CardTitle } from "@repo/ui"
import { cn } from "@/lib/utils"
import type { ActivityCell } from "@/lib/training-consistency"

/** Widest a square is allowed to get, and the gutter between them. */
const CELL_PX = 12
const GAP_PX = 3

/**
 * Ink at four strengths, over whatever the surface happens to be. The ramp is
 * plain foreground alpha: on the hero wash that means the wash stays visible
 * through the quiet days instead of being papered over with opaque tiles —
 * mixing toward `--background` painted every rest day as a solid dark square
 * and the whole grid read as a black slab. An untrained day is barely a mark;
 * only work earns ink.
 */
const LEVEL_INK = [7, 28, 50, 72, 95] as const

function cellStyle(level: number): { backgroundColor: string } {
  return {
    backgroundColor: `color-mix(in srgb, var(--foreground) ${
      LEVEL_INK[level] ?? LEVEL_INK[0]
    }%, transparent)`,
  }
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

/** "Apr 3" — the whole caption, and it fits where the sublabel already was. */
function shortDate(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
}

/**
 * The training quarter as a field of squares, in the manner of a certain code
 * host. It replaces the streak, and the point of the replacement is that this
 * one cannot be broken: a missed Tuesday is a pale square among darker ones,
 * not a counter reset to zero and a reason to stop opening the app.
 *
 * Tapping a day swaps the reading beside the grid for that day's sets, which
 * is why there is no separate caption line to push everything else down.
 */
export function ActivityGraph({
  cells,
  weeks,
  sessions,
  windowDays,
  translucent = false,
}: {
  cells: ActivityCell[]
  weeks: number
  /** Days trained in the trailing window — the headline number. */
  sessions: number
  windowDays: number
  /** On the hero field the tile drops its surface and lets the wash through. */
  translucent?: boolean
}) {
  const [selected, setSelected] = useState<ActivityCell | null>(null)

  const reading = selected ? selected.sets : sessions
  const label = selected
    ? `${selected.sets === 1 ? "set" : "sets"} · ${shortDate(selected.date)}`
    : `${sessions === 1 ? "day" : "days"} in ${windowDays}`

  const body = (
    <div className="flex items-center gap-5">
      <div
        className="grid max-w-full shrink grid-flow-col gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
          // Seven explicit rows, or `grid-flow-col` invents 126 implicit
          // columns and every one of them resolves to nothing. The rows are
          // `auto` so each takes its height from the square in it.
          gridTemplateRows: "repeat(7, auto)",
          // An explicit width, not `flex-1`: as a flex child with no floor the
          // grid gets sized to its min-content, which for 126 squares that all
          // derive their width from the column is zero, and the whole thing
          // disappears. `max-w-full` still lets it shrink on a phone.
          width: weeks * (CELL_PX + GAP_PX) - GAP_PX,
        }}
      >
        {cells.map((cell) =>
          cell.future ? (
            <span
              key={cell.date}
              className="aspect-square"
              aria-hidden="true"
            />
          ) : (
            <button
              key={cell.date}
              type="button"
              onClick={() =>
                setSelected((current) =>
                  current?.date === cell.date ? null : cell
                )
              }
              aria-label={`${shortDate(cell.date)}, ${cell.sets} sets`}
              aria-pressed={selected?.date === cell.date}
              className={cn(
                "aspect-square rounded-[2.5px]",
                selected?.date === cell.date &&
                  "ring-1 ring-foreground/50 ring-offset-1 ring-offset-background"
              )}
              style={cellStyle(cell.level)}
            />
          )
        )}
      </div>

      <div className="shrink-0" role="status">
        <span className="text-[22px] leading-none font-bold tracking-tight tabular-nums">
          {reading}
        </span>
        <p className="mt-1 text-[11.5px] font-medium whitespace-nowrap text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  )

  if (translucent) return body

  return (
    <Card className="dashboard-tile">
      <div className="px-3.5 py-2.5">
        <CardTitle className="mb-2 text-sm font-semibold">Activity</CardTitle>
        {body}
      </div>
    </Card>
  )
}
