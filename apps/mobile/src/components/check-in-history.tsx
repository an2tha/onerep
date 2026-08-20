import { useState } from "react"
import { PencilSimple, Trash } from "@phosphor-icons/react"
import { formatProgressDate, formatProgressWeight } from "@repo/ui"
import type { BodyMeasurementEntry } from "@/lib/body-progress"
import type { WeightUnit } from "@/lib/health-goals"
import { hapticSelection } from "@/lib/haptics"

/**
 * The check-in history, once.
 *
 * There were briefly two of these on Progress — the read-only list inside
 * `BodyProgress` and an editable one further down — same heading, same rows,
 * different affordances, twenty lines apart. This is the read-only list's
 * layout with the editable list's actions folded in, and it is the only one
 * the page renders: `BodyProgress` is handed an empty array.
 */

/** Five is the glance. Everything older is a deliberate ask. */
const GLANCE = 5

export function CheckInHistory({
  measurements,
  unit,
  onEdit,
  onDelete,
}: {
  measurements: BodyMeasurementEntry[]
  unit: WeightUnit
  /** Opens the check-in form on that day. Takes a `YYYY-MM-DD` local day key. */
  onEdit: (date: string) => void
  onDelete: (clientId: string, date: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (measurements.length === 0) return null

  const newestFirst = [...measurements].sort((a, b) =>
    b.loggedAt.localeCompare(a.loggedAt)
  )
  const shown = expanded ? newestFirst : newestFirst.slice(0, GLANCE)
  const hidden = newestFirst.length - shown.length

  return (
    <section
      className="progress-tab-enter"
      style={{ animationDelay: "160ms" }}
      aria-label="Recent check-ins"
    >
      <h2 className="native-section-title mb-1">Recent check-ins</h2>
      <p className="mb-1 text-[13px] text-muted-foreground">
        Tap one to correct it
      </p>
      <div className="border-y border-border">
        {shown.map((measurement) => {
          const date = measurement.loggedAt.slice(0, 10)
          return (
            <div
              key={measurement.clientId}
              className="flex min-h-14 items-center gap-2 border-b border-border last:border-b-0"
            >
              <button
                type="button"
                onClick={() => onEdit(date)}
                className="motion-tactile flex min-w-0 flex-1 items-center justify-between gap-4 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium">
                    {formatProgressDate(date)}
                  </span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {measurement.bodyFatPct != null
                      ? `${measurement.bodyFatPct.toFixed(1)}% body fat`
                      : "Weight check-in"}
                    {measurement.source === "health" && " · Synced"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[15px] font-semibold tabular-nums">
                    {formatProgressWeight(measurement.weightKg ?? null, unit)}
                  </span>
                  <PencilSimple
                    size={16}
                    className="text-muted-foreground"
                    aria-hidden
                  />
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(measurement.clientId, date)}
                aria-label={`Delete check-in for ${formatProgressDate(date)}`}
                className="motion-tactile -mr-1 flex size-11 shrink-0 items-center justify-center text-muted-foreground active:text-destructive"
              >
                <Trash size={16} />
              </button>
            </div>
          )
        })}
      </div>
      {/* Expanding in place rather than in a sheet: the rest of this page
          discloses downward, and a sheet over a list you are correcting takes
          you away from the chart the correction is meant to fix. */}
      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => {
            hapticSelection()
            setExpanded(!expanded)
          }}
          className="motion-tactile min-h-11 px-1 text-[13px] font-semibold text-muted-foreground"
        >
          {expanded ? "Show fewer" : `Show all ${newestFirst.length}`}
        </button>
      )}
    </section>
  )
}
