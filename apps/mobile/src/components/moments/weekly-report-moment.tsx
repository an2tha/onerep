import { useState } from "react"
import { useMutation } from "convex/react"
import { Minus, Plus } from "@phosphor-icons/react"
import {
  MomentPrimaryAction,
  MomentScreen,
  MomentSecondaryAction,
  WeekStrip,
  toast,
} from "@repo/ui"
import { api } from "../../../../../convex/_generated/api"
import { useSmoothNavigate } from "@/lib/navigation"
import { hapticMedium, hapticSelection } from "@/lib/haptics"
import { logDevWarn } from "@/lib/utils"
import { formatWeightDelta, type WeeklyReport } from "@/lib/moments"
import { useWeightUnit } from "@/lib/use-weight-unit"
import type { FullScreenEventOutcome } from "@/lib/full-screen-events"

/** The range a weekly session target is allowed to be. Matches the mutation. */
const MIN_TARGET = 1
const MAX_TARGET = 12

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[19px] leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-[12px] text-muted-foreground">{label}</div>
    </div>
  )
}

function trendWord(workouts: number, previous: number) {
  const delta = workouts - previous
  if (delta === 0) return "level with the week before"
  return `${delta > 0 ? "up" : "down"} ${Math.abs(delta)} on the week before`
}

/**
 * The week, once, on Sunday evening.
 *
 * Structured the way it gets read: the verdict first, because that is the only
 * part most people take in; the shape of the week under it; the numbers after
 * that for whoever is still here. It ends by asking for next week's number
 * rather than linking to a graph — a report that closes a loop is worth
 * opening, and one that just recites is a receipt.
 */
export function WeeklyReportMoment({
  report,
  nextWeekKey,
  existingNextTarget,
  onClose,
}: {
  report: WeeklyReport
  /** The week the commitment applies to — the one starting now. */
  nextWeekKey: string
  existingNextTarget: number | null
  onClose: (outcome: FullScreenEventOutcome) => void
}) {
  const navigate = useSmoothNavigate()
  const setWeeklyTarget = useMutation(api.users.weeklyTargets.set)
  const { training, nutrition, body } = report
  const weightUnit = useWeightUnit()

  // Seeded from what they aimed at last time, or what they actually managed,
  // because the honest default for next week is the week they just had.
  const [target, setTarget] = useState(() =>
    Math.min(
      MAX_TARGET,
      Math.max(
        MIN_TARGET,
        existingNextTarget ?? report.target ?? training.workouts ?? 3
      )
    )
  )
  const [busy, setBusy] = useState(false)

  function nudge(delta: number) {
    hapticSelection()
    setTarget((current) =>
      Math.min(MAX_TARGET, Math.max(MIN_TARGET, current + delta))
    )
  }

  async function commit() {
    if (busy) return
    setBusy(true)
    try {
      await setWeeklyTarget({ weekKey: nextWeekKey, sessions: target })
      hapticMedium()
      onClose("resolved")
      toast.success(`${target} sessions this week. Noted.`)
    } catch (error) {
      logDevWarn("Failed to set a weekly target", error)
      toast.error("Couldn't save that. Try again.")
      setBusy(false)
    }
  }

  return (
    <MomentScreen
      title={`Your week: ${report.rangeLabel}`}
      subtitle={report.headline}
      onClose={() => onClose("dismissed")}
      showClose={false}
      actions={
        <>
          <MomentPrimaryAction onClick={() => void commit()}>
            {busy ? "Saving…" : `Commit to ${target} this week`}
          </MomentPrimaryAction>
          <MomentSecondaryAction
            onClick={() => {
              hapticSelection()
              onClose("resolved")
              navigate("/progress", { motion: "forward" })
            }}
            className="bg-transparent text-muted-foreground active:bg-muted/40"
          >
            Skip it, show me the detail
          </MomentSecondaryAction>
        </>
      }
    >
      <div className="app-surface px-4 py-4">
        <WeekStrip days={report.days} />
      </div>

      <div className="app-surface mt-2 grid grid-cols-3 gap-3 px-4 py-4">
        <Stat
          value={String(training.workouts)}
          label={training.workouts === 1 ? "session" : "sessions"}
        />
        <Stat value={String(training.completedSets)} label="sets" />
        <Stat value={`${training.minutes}m`} label="under load" />
        <Stat value={`${nutrition.loggedDays}/7`} label="days logged" />
        <Stat
          value={
            nutrition.averageCalories === null
              ? "—"
              : String(nutrition.averageCalories)
          }
          label="avg calories"
        />
        <Stat
          value={
            nutrition.averageProtein === null
              ? "—"
              : `${nutrition.averageProtein}g`
          }
          label="avg protein"
        />
      </div>

      <p className="mt-3 px-1 text-[13px] leading-snug text-muted-foreground">
        {trendWord(training.workouts, training.previousWorkouts)}
        {nutrition.loggedDays > 0 &&
          ` · ${nutrition.onTargetDays} of ${nutrition.loggedDays} logged days within 10% of target`}
        {body.weightDeltaKg !== null &&
          body.weightDeltaKg !== 0 &&
          ` · weight ${formatWeightDelta(body.weightDeltaKg, weightUnit)}`}
        .
      </p>

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

      <div className="app-surface mt-4 px-4 py-4">
        <p className="text-[15px] font-semibold tracking-tight">
          Next week, then.
        </p>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          Pick a number now and this screen will hold you to it on Sunday.
        </p>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            aria-label="One fewer session"
            disabled={target <= MIN_TARGET}
            onClick={() => nudge(-1)}
            className="app-icon-button h-11 w-11 bg-muted/55 text-muted-foreground disabled:opacity-40"
          >
            <Minus size={15} weight="bold" />
          </button>
          <div className="text-center">
            <div className="text-[32px] leading-none font-semibold tabular-nums">
              {target}
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              {target === 1 ? "session" : "sessions"}
            </div>
          </div>
          <button
            type="button"
            aria-label="One more session"
            disabled={target >= MAX_TARGET}
            onClick={() => nudge(1)}
            className="app-icon-button h-11 w-11 bg-muted/55 text-muted-foreground disabled:opacity-40"
          >
            <Plus size={15} weight="bold" />
          </button>
        </div>
      </div>
    </MomentScreen>
  )
}
