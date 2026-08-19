import { useMemo } from "react"
import {
  MUSCLE_HEAT_FILL,
  MuscleBodySvg,
  type MuscleRecoveryItem,
} from "./muscle-body-svg"

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatAge(days: number) {
  if (days === 0) return "today"
  if (days === 1) return "1d"
  return `${days}d`
}

export function MuscleRecoveryPanel({
  muscleRecovery,
}: {
  muscleRecovery: MuscleRecoveryItem[]
}) {
  // The body already says which muscles are lit. The only things worth
  // spelling out are what is still under load and what has gone stalest —
  // the other ten rows of sets-and-days were a table nobody reads.
  const { underLoad, ready, stalest } = useMemo(() => {
    const loaded = muscleRecovery
      .filter((item) => item.status !== "overdue")
      .sort((a, b) => a.daysSinceLastTrained - b.daysSinceLastTrained)
    const rested = muscleRecovery.filter((item) => item.status === "overdue")
    return {
      underLoad: loaded,
      ready: rested,
      stalest: rested.reduce<MuscleRecoveryItem | null>(
        (worst, item) =>
          !worst || item.daysSinceLastTrained > worst.daysSinceLastTrained
            ? item
            : worst,
        null
      ),
    }
  }, [muscleRecovery])

  if (muscleRecovery.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-muted-foreground">
        Recovery appears after your first logged workout.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
      <MuscleBodySvg
        recovery={muscleRecovery}
        className="mx-auto h-auto w-[8rem] shrink-0 text-foreground sm:w-[10.5rem]"
      />

      <div className="min-w-[17rem] flex-1 space-y-3">
        <p className="text-[15px] font-semibold">
          {ready.length} of {muscleRecovery.length} muscles ready
        </p>

        {underLoad.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {underLoad.map((item) => (
              <li
                key={item.muscle}
                className="flex items-center gap-1.5 rounded-full bg-muted/45 py-1 pr-2.5 pl-2 text-[12px]"
              >
                <span
                  className="size-[7px] rounded-full"
                  style={{ background: MUSCLE_HEAT_FILL[item.status] }}
                  aria-hidden="true"
                />
                {titleCase(item.muscle)}
                <span className="text-muted-foreground tabular-nums">
                  {formatAge(item.daysSinceLastTrained)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[12px] text-muted-foreground">
          {underLoad.length === 0
            ? "Nothing is carrying load right now."
            : `${underLoad.length} still under load.`}
          {stalest
            ? ` Longest untouched: ${titleCase(stalest.muscle)}, ${formatAge(
                stalest.daysSinceLastTrained
              )}.`
            : ""}
        </p>
      </div>
    </div>
  )
}
