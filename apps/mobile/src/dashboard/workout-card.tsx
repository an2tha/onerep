import { useEffect, useRef, useState } from "react"
import { Barbell, CaretDown, Trash } from "@phosphor-icons/react"
import { Card, CardTitle, SwipeToStart, tint } from "@repo/ui"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  compactCardioSummary,
  hasCardioDetails,
  type CachedWorkoutLog,
  type WorkoutPresetCard,
} from "@/lib/workout-sync"
import { getLoggedExerciseId } from "@/lib/exercise-history"
import {
  COMPLETE_BG,
  COMPLETE_COLOR,
  COMPLETE_SOFT_BG,
  DASHBOARD_EMPTY_ICON_CLASS,
  WORKOUTS,
  type DashboardSettings,
} from "./constants"
import { dayOffsetLabel } from "./helpers"

/** The finished session, read back on Today: what got done, and how much. */
export function HomeWorkoutSummary({
  log,
  slot,
}: {
  log: CachedWorkoutLog
  slot: 1 | 2
}) {
  const completedExercises = log.exercises.filter(
    (e) => hasCardioDetails(e.cardio) || (e.sets ?? []).some((s) => s.completed)
  )
  const totalSets = log.exercises.reduce(
    (acc, e) => acc + (e.sets ?? []).filter((s) => s.completed).length,
    0
  )
  const cardioCount = completedExercises.filter((e) =>
    hasCardioDetails(e.cardio)
  ).length
  const durationMin = Math.floor(log.durationSeconds / 60)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[9.5px] font-bold tracking-widest uppercase"
          style={{ backgroundColor: COMPLETE_BG, color: COMPLETE_COLOR }}
        >
          Done
        </span>
        <span className="text-[11px] text-muted-foreground/60">
          Workout {slot} · {durationMin} min
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {completedExercises.map((ex) => {
          const isCardio = hasCardioDetails(ex.cardio)
          const id = getLoggedExerciseId(ex) ?? ex.name
          return (
            <div
              key={id}
              className="flex items-center gap-2.5 rounded-lg px-3 py-1.5"
              style={{ backgroundColor: COMPLETE_SOFT_BG }}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
                style={{
                  backgroundColor: tint(COMPLETE_COLOR, 20),
                  color: COMPLETE_COLOR,
                }}
              >
                ✓
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[12.5px] font-medium"
                style={{ color: COMPLETE_COLOR }}
              >
                {ex.name}
              </span>
              <span
                className="max-w-[8.5rem] shrink truncate text-right text-[10.5px] tabular-nums"
                style={{
                  color: `color-mix(in srgb, ${COMPLETE_COLOR} 54%, transparent)`,
                }}
              >
                {isCardio
                  ? compactCardioSummary(ex.cardio, ex.cardio?.distanceUnit)
                  : `${(ex.sets ?? []).filter((s) => s.completed).length}/${ex.sets?.length ?? 0}`}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[9.5px] text-muted-foreground/40">
        <span>
          {completedExercises.length} exercises · {totalSets} sets
          {cardioCount > 0 ? ` · ${cardioCount} cardio` : ""}
        </span>
        <span>
          {new Date(log.completedAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  )
}

/**
 * Today's training, in whichever of its three states applies: nothing yet, one
 * session logged, or two — the last of which gets a swipeable carousel rather
 * than a wall of exercises.
 */
export function WorkoutCard({
  settings,
  dayOffset,
  scheduledWorkout,
  timeZone,
  workoutLogs,
  collapsed,
  onToggleCollapse,
  onDeleteSlot,
}: {
  settings: DashboardSettings
  dayOffset: number
  scheduledWorkout: WorkoutPresetCard | null
  timeZone: string
  workoutLogs: CachedWorkoutLog[]
  collapsed: boolean
  onToggleCollapse: () => void
  onDeleteSlot: (slot: 1 | 2) => void
}) {
  const navigate = useSmoothNavigate()
  const isToday = dayOffset === 0
  const focus = settings.workoutFocus
  const fallbackWorkout = WORKOUTS[focus]
  const workout = scheduledWorkout ?? fallbackWorkout
  const done = isToday && workoutLogs.length > 0
  const isRestDay = scheduledWorkout === null

  const title = isToday
    ? "Today's workout"
    : `${dayOffsetLabel(dayOffset, timeZone)}'s workout`

  // Slide state for dual-workout carousel
  const [slide, setSlide] = useState(0)
  const touchStartX = useRef(0)

  // Reset slide when logs change
  useEffect(() => {
    setSlide(0)
  }, [workoutLogs.length])

  if (isRestDay && workoutLogs.length === 0) {
    return (
      <Card
        className="dashboard-tile"
        style={{ viewTransitionName: "active-workout" }}
      >
        <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <p className="text-[13px] text-muted-foreground">Rest day</p>
        </div>
      </Card>
    )
  }

  return (
    <Card
      className="dashboard-tile"
      style={{ viewTransitionName: "active-workout" }}
    >
      <div className="px-4 py-2.5">
        {/* ── Header ── */}
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            {done && workoutLogs.length === 1 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase"
                style={{ backgroundColor: COMPLETE_BG, color: COMPLETE_COLOR }}
              >
                Done
              </span>
            )}
            {done && workoutLogs.length === 2 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase"
                style={{ backgroundColor: COMPLETE_BG, color: COMPLETE_COLOR }}
              >
                2× Done
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isToday && done && (
              <button
                onClick={() => onDeleteSlot(workoutLogs.length === 2 ? 2 : 1)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors active:bg-destructive/10 active:text-destructive"
                aria-label="Delete workout"
              >
                <Trash size={15} />
              </button>
            )}
            {isToday && (
              <button
                onClick={onToggleCollapse}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/45 transition-colors active:bg-muted/40 active:text-foreground"
                aria-label={collapsed ? "Expand" : "Collapse"}
              >
                <CaretDown
                  size={15}
                  className={cn(
                    "transition-transform duration-300",
                    !collapsed && "rotate-180"
                  )}
                />
              </button>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
            collapsed
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            {isToday && workoutLogs.length === 2 ? (
              /* ── Two workouts done — animated carousel ── */
              <div className="pt-1">
                <div
                  className="overflow-hidden rounded-xl"
                  onTouchStart={(e) => {
                    touchStartX.current = e.touches[0].clientX
                  }}
                  onTouchEnd={(e) => {
                    const delta =
                      touchStartX.current - e.changedTouches[0].clientX
                    if (Math.abs(delta) > 40) setSlide(delta > 0 ? 1 : 0)
                  }}
                >
                  <div
                    className="flex"
                    style={{
                      transform: `translateX(-${slide * 100}%)`,
                      transition:
                        "transform var(--motion-panel) var(--motion-ease-out)",
                    }}
                  >
                    {workoutLogs.map((log, i) => (
                      <div key={i} className="w-full shrink-0">
                        <HomeWorkoutSummary log={log} slot={(i + 1) as 1 | 2} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Dot indicators */}
                <div className="mt-3 flex items-center justify-center gap-1.5">
                  {workoutLogs.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlide(i)}
                      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-muted/45"
                      aria-label={`Workout ${i + 1}`}
                    >
                      <span
                        className={cn(
                          "rounded-full transition-all duration-300",
                          slide === i
                            ? "h-1.5 w-4 bg-foreground/50"
                            : "h-1.5 w-1.5 bg-foreground/20"
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : isToday && workoutLogs.length === 1 ? (
              /* ── One workout done ── */
              <div className="pt-1">
                <HomeWorkoutSummary log={workoutLogs[0]} slot={1} />
              </div>
            ) : (
              /* ── Upcoming workout ── */
              <>
                {isRestDay ? (
                  <div className="flex flex-col items-center gap-2 py-5 text-center">
                    <Barbell
                      size={28}
                      className={cn(
                        DASHBOARD_EMPTY_ICON_CLASS,
                        "text-muted-foreground/20"
                      )}
                    />
                    <p className="text-[16px] font-semibold tracking-tight">
                      Rest day
                    </p>
                    <p className="max-w-[18rem] text-[12.5px] text-muted-foreground/55">
                      No workout is scheduled for this day in your routine.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-baseline justify-between pt-1">
                      <p className="text-[17px] font-semibold tracking-tight">
                        {"title" in workout ? workout.title : workout.name}
                      </p>
                      <span className="text-[11px] text-muted-foreground/50">
                        {workout.duration}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {workout.steps.map((step, i) => (
                        <div
                          key={step}
                          className="flex items-center gap-2.5 rounded-lg bg-muted/30 px-3 py-1.5 text-[12.5px] active:bg-muted/60"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-[9.5px] font-semibold text-muted-foreground/60">
                            {i + 1}
                          </span>
                          <span className="font-medium">{step}</span>
                        </div>
                      ))}
                    </div>
                    {isToday && (
                      <div className="mt-3">
                        <SwipeToStart
                          onComplete={() =>
                            navigate(
                              scheduledWorkout
                                ? `/workout/active/${scheduledWorkout.id}`
                                : "/workout/active"
                            )
                          }
                          label="Start workout"
                          variant="default"
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
