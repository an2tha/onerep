import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import { cn } from "@/lib/utils"

/**
 * The coach's computed views, shown to their owner.
 *
 * Everything here already existed server-side — lift verdicts, measured
 * recovery, the six-month ledger — and reached only the model, which made the
 * Sunday review read like an oracle: "your bench has stalled" with nothing
 * the user could point at. This panel is the receipts. It renders nothing at
 * all when there is nothing computed yet, because an empty analysis dressed
 * up as a section is worse than absence.
 */

const STATUS_LABEL: Record<string, string> = {
  progressing: "Climbing",
  stalled: "Flat",
  regressing: "Slipping",
  new: "Too new",
}

const STATUS_CLASS: Record<string, string> = {
  progressing: "text-emerald-600 dark:text-emerald-500",
  stalled: "text-amber-600 dark:text-amber-500",
  regressing: "text-red-600 dark:text-red-500",
  new: "text-muted-foreground",
}

const RECOVERY_LABEL: Record<string, string> = {
  ready: "Recovered",
  steady: "One signal off",
  compromised: "Under-recovered",
}

export function TrainingInsightsPanel() {
  const insights = useQuery(api.progressInsights.training, {
    today: currentDateKey(),
  })

  if (!insights) return null
  const { programming, recovery } = insights
  const lifts = (programming?.lifts ?? []).filter(
    (lift) => lift.status !== "new"
  )
  const showRecovery = recovery && recovery.status !== "unknown"
  if (lifts.length === 0 && !showRecovery && !programming?.deload?.recommended)
    return null

  return (
    <section aria-label="Training analysis" className="mb-4">
      <p className="native-section-title mb-2">What your coach sees</p>

      {programming?.deload?.recommended && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-[13px] font-semibold">A lighter week is due</p>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
            {programming.deload.reason}
          </p>
        </div>
      )}

      {lifts.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {lifts.map((lift, index) => (
            <div
              key={lift.name}
              className={cn(
                "px-4 py-3",
                index > 0 && "border-t border-border/60"
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-[14px] font-medium">
                  {lift.name}
                </p>
                <p
                  className={cn(
                    "shrink-0 text-[12px] font-semibold",
                    STATUS_CLASS[lift.status]
                  )}
                >
                  {STATUS_LABEL[lift.status] ?? lift.status}
                </p>
              </div>
              {lift.suggestion && (
                <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                  {lift.suggestion}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {showRecovery && (
        <div className="mt-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-semibold">Recovery</p>
            <p
              className={cn(
                "text-[12px] font-semibold",
                recovery.status === "compromised"
                  ? "text-red-600 dark:text-red-500"
                  : recovery.status === "steady"
                    ? "text-amber-600 dark:text-amber-500"
                    : "text-emerald-600 dark:text-emerald-500"
              )}
            >
              {RECOVERY_LABEL[recovery.status] ?? recovery.status}
            </p>
          </div>
          {recovery.notes.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-1">
              {recovery.notes.map((note) => (
                <li
                  key={note}
                  className="text-[12px] leading-snug text-muted-foreground"
                >
                  {note}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Sleep and heart rate are sitting on your usual baseline.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
