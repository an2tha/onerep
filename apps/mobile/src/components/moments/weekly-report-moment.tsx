import { useSmoothNavigate } from "@/lib/navigation"
import { hapticSelection } from "@/lib/haptics"
import type { WeeklyReport } from "@/lib/moments"
import type { FullScreenEventOutcome } from "@/lib/full-screen-events"
import {
  MomentPrimaryAction,
  MomentScreen,
  MomentSecondaryAction,
} from "@/components/moments/moment-screen"

function Stat({
  value,
  label,
  trend,
}: {
  value: string
  label: string
  trend?: string
}) {
  return (
    <div className="rounded-2xl bg-muted/40 px-4 py-3.5">
      <div className="text-[24px] leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 text-[12px] text-muted-foreground">{label}</div>
      {trend && (
        <div className="mt-0.5 text-[12px] text-muted-foreground/80">
          {trend}
        </div>
      )}
    </div>
  )
}

function workoutTrend(workouts: number, previous: number) {
  const delta = workouts - previous
  if (delta === 0) return "level with last week"
  return `${delta > 0 ? "+" : ""}${delta} vs last week`
}

/**
 * The week, once, on Sunday evening.
 *
 * Four numbers and a verdict. Anything longer gets skimmed and then resented,
 * and the Progress page is one tap away for whoever actually wants the graphs.
 */
export function WeeklyReportMoment({
  report,
  onClose,
}: {
  report: WeeklyReport
  onClose: (outcome: FullScreenEventOutcome) => void
}) {
  const navigate = useSmoothNavigate()
  const { training, nutrition, body } = report

  return (
    <MomentScreen
      title={`Your week: ${report.rangeLabel}`}
      subtitle={report.headline}
      onClose={() => onClose("dismissed")}
      showClose={false}
      actions={
        <>
          <MomentPrimaryAction
            onClick={() => {
              hapticSelection()
              onClose("resolved")
              navigate("/progress", { motion: "forward" })
            }}
          >
            See the detail
          </MomentPrimaryAction>
          <MomentSecondaryAction
            onClick={() => onClose("resolved")}
            className="bg-transparent text-muted-foreground active:bg-muted/40"
          >
            Start the next one
          </MomentSecondaryAction>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Stat
          value={String(training.workouts)}
          label={training.workouts === 1 ? "session" : "sessions"}
          trend={workoutTrend(training.workouts, training.previousWorkouts)}
        />
        <Stat
          value={String(training.completedSets)}
          label="sets completed"
          trend={`${training.minutes} min training`}
        />
        <Stat
          value={`${nutrition.loggedDays}/7`}
          label="days logged"
          trend={
            nutrition.loggedDays > 0
              ? `${nutrition.onTargetDays} on target`
              : "nothing to go on"
          }
        />
        <Stat
          value={
            nutrition.averageCalories === null
              ? "—"
              : String(nutrition.averageCalories)
          }
          label="avg calories"
          trend={
            nutrition.averageProtein === null
              ? `${nutrition.calorieTarget} target`
              : `${nutrition.averageProtein}g protein`
          }
        />
      </div>

      {report.highlights.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {report.highlights.map((line) => (
            <li
              key={line}
              className="rounded-2xl bg-muted/30 px-4 py-3 text-[13px] leading-snug text-muted-foreground"
            >
              {line}
            </li>
          ))}
        </ul>
      )}

      {body.latestWeightKg !== null && (
        <p className="mt-4 text-[13px] text-muted-foreground">
          Last weigh-in: {body.latestWeightKg.toFixed(1)}kg
          {body.weightDeltaKg !== null && body.weightDeltaKg !== 0
            ? ` (${body.weightDeltaKg > 0 ? "+" : ""}${body.weightDeltaKg} across the week)`
            : ""}
          .
        </p>
      )}
    </MomentScreen>
  )
}
