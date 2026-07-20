import { useMemo } from "react"
import { MuscleBodySvg, type MuscleRecoveryItem } from "./muscle-body-svg"

type MuscleRecoveryStatus = MuscleRecoveryItem["status"]

const STATUS_LABEL: Record<MuscleRecoveryStatus, string> = {
  trained: "Trained today",
  recovering: "Recovering",
  overdue: "Ready",
}

const STATUS_DOT: Record<MuscleRecoveryStatus, string> = {
  trained: "bg-[var(--accent-workout)]",
  recovering: "bg-[color-mix(in_srgb,var(--accent-workout)_55%,transparent)]",
  overdue: "bg-foreground/20",
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatAge(days: number) {
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return `${days}d ago`
}

function formatSets(sets: number) {
  const value = Number.isInteger(sets) ? String(sets) : sets.toFixed(1)
  return `${value} effective set${sets === 1 ? "" : "s"}`
}

export function MuscleRecoveryHeatmapCard({
  muscleRecovery,
  compact = false,
}: {
  muscleRecovery: MuscleRecoveryItem[]
  compact?: boolean
}) {
  const grouped = useMemo(
    () => ({
      recovering: muscleRecovery.filter((item) => item.status !== "overdue"),
      ready: muscleRecovery.filter((item) => item.status === "overdue"),
    }),
    [muscleRecovery]
  )

  if (muscleRecovery.length === 0) {
    return (
      <section className="rounded-[22px] border border-border/55 bg-card px-5 py-8 text-center shadow-sm">
        <p className="text-[14px] font-medium text-muted-foreground">
          Recovery appears after your first logged workout.
        </p>
      </section>
    )
  }

  const visible = compact ? muscleRecovery.slice(0, 8) : muscleRecovery

  return (
    <section className="overflow-hidden rounded-[24px] border border-border/55 bg-card shadow-[0_10px_32px_rgba(0,0,0,0.055)]">
      {!compact && (
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-5 border-b border-border/45 px-5 py-5">
          <div className="mx-auto flex h-40 w-24 items-center justify-center rounded-[20px] bg-muted/25">
            <MuscleBodySvg
              recovery={muscleRecovery}
              width={76}
              height={140}
              className="text-foreground"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[22px] font-semibold tracking-tight">
              {grouped.ready.length} ready
            </p>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {grouped.recovering.length} recently trained
            </p>
            <div className="mt-4 flex flex-col gap-2 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-workout)]" />
                Recent load
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-foreground/20" />
                Ready to train
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="divide-y divide-border/40 px-4">
        {visible.map((item) => (
          <div
            key={item.muscle}
            className="motion-list-row grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">
                  {titleCase(item.muscle)}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {formatSets(item.effectiveSets)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-semibold">
                {STATUS_LABEL[item.status]}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">
                {formatAge(item.daysSinceLastTrained)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {compact && muscleRecovery.length > visible.length && (
        <p className="border-t border-border/40 px-4 py-3 text-[12px] font-medium text-muted-foreground">
          +{muscleRecovery.length - visible.length} more
        </p>
      )}
    </section>
  )
}
