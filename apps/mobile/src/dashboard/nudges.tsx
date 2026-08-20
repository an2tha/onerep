import { useRef, useState } from "react"
import { Barbell, ForkKnife, Sparkle, X } from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { Card } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { useSmoothNavigate } from "@/lib/navigation"
import type { WorkoutPresetCard } from "@/lib/workout-sync"
import { formatNudgeDate } from "./helpers"

/** Matches the collapse in the shared CSS. */
const WELCOME_EXIT_MS = 280

/**
 * The first thing shown each day: what the plan asks for, how the week is
 * going, and the three places a session usually starts. Dismissing it keeps
 * it gone until tomorrow.
 *
 * It leaves on its own terms rather than being unmounted out from under the
 * page: the card fades and lifts while its own height closes, so the diary
 * below rises into the gap instead of jumping into it. The height is measured
 * first — nothing interpolates from `auto`.
 */
export function WelcomeNudge({
  scheduledWorkout,
  workoutLogged,
  workoutsThisWeek,
  daysLast28,
  onDismiss,
}: {
  scheduledWorkout: WorkoutPresetCard | null
  workoutLogged: boolean
  workoutsThisWeek: number
  /** Days trained in the trailing four weeks — the graph's headline number. */
  daysLast28: number
  onDismiss: () => void
}) {
  const navigate = useSmoothNavigate()
  const shellRef = useRef<HTMLDivElement>(null)
  const [collapsedTo, setCollapsedTo] = useState<number | null>(null)
  const [leaving, setLeaving] = useState(false)

  function dismiss() {
    const shell = shellRef.current
    if (!shell || leaving) return
    // Freeze the height it currently has, then close it on the next frame.
    // Doing both in one go gives the transition nothing to run between.
    setCollapsedTo(shell.offsetHeight)
    requestAnimationFrame(() => setLeaving(true))
    setTimeout(onDismiss, WELCOME_EXIT_MS)
  }

  const hour = new Date().getHours()
  const greeting =
    hour < 5
      ? "Up early"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening"
  const planLine = workoutLogged
    ? "Today's workout is already logged."
    : scheduledWorkout
      ? `On the plan: ${scheduledWorkout.name} · ${scheduledWorkout.duration}`
      : "Rest day — nothing scheduled."
  const weekLine = `${
    workoutsThisWeek === 0
      ? "No workouts yet"
      : workoutsThisWeek === 1
        ? "1 workout"
        : `${workoutsThisWeek} workouts`
  } this week${daysLast28 > 0 ? ` · ${daysLast28} days in 4 weeks` : ""}`

  const actionCls =
    "motion-tactile flex h-9 items-center gap-1.5 rounded-xl bg-muted/40 px-3 text-[12px] font-semibold text-foreground/80 transition-colors active:bg-muted/70"

  return (
    <div
      ref={shellRef}
      data-leaving={leaving ? "true" : "false"}
      style={
        collapsedTo == null ? undefined : { height: leaving ? 0 : collapsedTo }
      }
      className="welcome-nudge-shell mb-4"
    >
      <Card className="dashboard-tile">
        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold tracking-tight">
                {greeting}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {planLine}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground/60 tabular-nums">
                {weekLine}
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss welcome for today"
              onClick={dismiss}
              className="app-icon-button h-9 w-9 shrink-0 bg-transparent text-muted-foreground/60"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {!workoutLogged && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    scheduledWorkout
                      ? `/workout/active/${scheduledWorkout.id}`
                      : "/workout/active",
                    { motion: "forward" }
                  )
                }
                className="motion-tactile flex h-9 items-center gap-1.5 rounded-xl bg-foreground px-3 text-[12px] font-semibold text-background transition-opacity active:opacity-80"
              >
                <Barbell size={13} weight="bold" />
                Start workout
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/nutrition")}
              className={actionCls}
            >
              <ForkKnife size={13} weight="bold" />
              Log food
            </button>
            <button
              type="button"
              onClick={() => navigate("/coach", { motion: "switch" })}
              className={actionCls}
            >
              <Sparkle size={13} weight="bold" />
              Ask Coach
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}

/**
 * "You trained Tuesday — what did you do?"
 *
 * Apple Health records that a lifting session happened and how long it lasted,
 * but carries no exercises, so it cannot be promoted into the log automatically
 * the way a run can. Surfacing it here turns a dead record into the one prompt
 * that actually knows the user trained.
 */
export function UnloggedWorkoutNudge() {
  const navigate = useSmoothNavigate()
  const unlogged = useQuery(api.logs.healthWorkouts.unlogged, { limit: 2 })
  const dismiss = useMutation(api.logs.healthWorkouts.dismiss)

  if (!unlogged || unlogged.length === 0) return null

  return (
    <>
      {unlogged.map((workout) => (
        <Card key={workout._id} className="dashboard-tile">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60">
              <Barbell size={16} weight="bold" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">
                {formatNudgeDate(workout.date)} · {workout.activityName}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {Math.round(workout.durationSeconds / 60)} min recorded, not
                logged
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                navigate(`/workout/log/${workout.date}?health=${workout._id}`, {
                  motion: "forward",
                })
              }
              className="motion-tactile h-9 shrink-0 rounded-xl bg-foreground px-3 text-[12px] font-semibold text-background transition-opacity active:opacity-80"
            >
              Add
            </button>
            <button
              type="button"
              aria-label={`Dismiss ${workout.activityName} on ${workout.date}`}
              onClick={() => void dismiss({ id: workout._id })}
              className="app-icon-button h-9 w-9 shrink-0 bg-transparent text-muted-foreground/60"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        </Card>
      ))}
    </>
  )
}
