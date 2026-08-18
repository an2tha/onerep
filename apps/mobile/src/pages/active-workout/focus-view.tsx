/**
 * The minimal way to run a session: one dial, one number, one button. The
 * whole workout collapses to the set in front of you — the ring counts the
 * sets of the current exercise, or the rest between them, and everything else
 * (reordering, history, the full set table) waits in the expanded view.
 */

import { useState } from "react"
import {
  ArrowsOut,
  CheckCircle,
  Minus,
  Plus,
  X,
} from "@phosphor-icons/react"
import { RestTimerSheet, formatRestDuration as formatRest } from "@repo/ui"
import { cn } from "@/lib/utils"
import { formatElapsed, toDisplay } from "@/lib/workout-logging"
import type {
  BarType,
  LastSession,
  WeightUnit,
  WorkoutSet,
} from "@/lib/workout-logging"
import {
  WeightSelectorSheet,
  type WeightSelectorChange,
} from "./weight-selector-sheet"

const DIAL = 212
const CENTER = DIAL / 2
const RING_RADIUS = 88
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const TICK_COUNT = 60

function DialTicks({ fraction }: { fraction: number }) {
  return (
    <g>
      {Array.from({ length: TICK_COUNT }, (_, index) => {
        const lit = index / TICK_COUNT < fraction
        const angle = (index / TICK_COUNT) * 2 * Math.PI - Math.PI / 2
        const outer = RING_RADIUS + 9
        const inner = RING_RADIUS + (lit ? 1 : 4)
        return (
          <line
            key={index}
            x1={CENTER + Math.cos(angle) * inner}
            y1={CENTER + Math.sin(angle) * inner}
            x2={CENTER + Math.cos(angle) * outer}
            y2={CENTER + Math.sin(angle) * outer}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            className={lit ? "text-foreground/45" : "text-foreground/10"}
          />
        )
      })}
    </g>
  )
}

export function FocusWorkoutView({
  exerciseName,
  set,
  allSets,
  setNumber,
  setCount,
  unit,
  barWeight,
  barType,
  isCardio,
  isResting,
  restRemaining,
  restDuration,
  doneSets,
  totalSets,
  nextExerciseName,
  lastSession,
  onUpdateSet,
  onCompleteSet,
  onSkipRest,
  onAddSet,
  onSkipSet,
  onExpand,
  onEnd,
}: {
  exerciseName: string
  set: WorkoutSet | null
  allSets?: WorkoutSet[]
  setNumber: number
  setCount: number
  unit: WeightUnit
  barWeight: string
  barType: BarType
  isCardio: boolean
  isResting: boolean
  restRemaining: number
  restDuration: number
  doneSets: number
  totalSets: number
  nextExerciseName: string
  lastSession?: LastSession | null
  onUpdateSet: (set: WorkoutSet) => void
  onCompleteSet: () => void
  onSkipRest: () => void
  onAddSet: () => void
  onSkipSet: () => void
  onExpand: () => void
  onEnd: () => void
}) {
  const [showWeight, setShowWeight] = useState(false)
  // The weight sheet offers "same as last time" from the matching set index.
  const lastSet =
    lastSession?.sets[Math.max(0, setNumber - 1)] ??
    lastSession?.sets[lastSession.sets.length - 1] ??
    null
  const [showRest, setShowRest] = useState(false)

  const restTotal = restDuration > 0 ? restDuration : Math.max(restRemaining, 1)
  // Resting drains the ring; lifting fills it as the sets of this exercise land.
  const fraction = isResting
    ? Math.max(0, Math.min(1, restRemaining / restTotal))
    : setCount > 0
      ? Math.max(0, Math.min(1, (setNumber - 1) / setCount))
      : 0
  const reps = Number(set?.reps ?? "") || 0
  const sets = allSets ?? []

  function stepReps(delta: number) {
    if (!set) return
    onUpdateSet({ ...set, reps: String(Math.max(0, reps + delta)) })
  }

  return (
    <section
      className="mx-auto flex w-full max-w-md flex-col items-center px-[var(--app-page-x)] text-center"
      style={{ paddingTop: "calc(var(--app-safe-top) + 0.5rem)" }}
    >
      <div className="flex w-full items-center justify-between">
        <button
          type="button"
          onClick={onEnd}
          aria-label="Discard or leave workout"
          className="motion-tactile inline-flex min-h-11 items-center gap-1.5 rounded-full bg-muted/60 px-4 text-[14px] font-semibold text-muted-foreground active:text-foreground"
        >
          <X size={15} weight="bold" />
          End
        </button>
        <button
          type="button"
          onClick={onExpand}
          aria-label="Switch to expanded view"
          className="motion-tactile inline-flex min-h-11 items-center gap-1.5 rounded-full bg-muted/60 px-4 text-[14px] font-semibold text-muted-foreground active:text-foreground"
        >
          <ArrowsOut size={15} weight="bold" />
          All sets
        </button>
      </div>

      <h2 className="mt-8 flex h-[4.4rem] items-center justify-center line-clamp-2 max-w-[20ch] text-[1.6rem] leading-tight font-semibold tracking-tight">
        {exerciseName}
      </h2>

      <div
        className="relative mt-6 shrink-0"
        style={{ width: DIAL, height: DIAL }}
      >
        <svg
          viewBox={`0 0 ${DIAL} ${DIAL}`}
          className="h-full w-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={13}
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--accent-workout)"
            strokeWidth={13}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
            className={cn(
              "transition-[stroke-dashoffset]",
              isResting ? "duration-1000 ease-linear" : "duration-500 ease-out"
            )}
          />
          <DialTicks fraction={fraction} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isResting ? (
            <>
              <p className="text-[2.6rem] leading-none font-semibold tracking-tight tabular-nums">
                {formatElapsed(restRemaining)}
              </p>
              <p className="mt-2 text-[14px] text-muted-foreground">resting</p>
            </>
          ) : isCardio ? (
            <>
              <p className="text-[1.75rem] leading-tight font-semibold">Cardio</p>
              <p className="mt-2 max-w-[9rem] text-[14px] text-muted-foreground">
                Log your details
              </p>
            </>
          ) : (
            <>
              <p className="text-[3.25rem] leading-none font-semibold tabular-nums">
                {setNumber}
              </p>
              <p className="mt-2 text-[14px] text-muted-foreground">
                {setCount > 0 ? `of ${setCount} sets` : "set"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* The active workout card, shrunk to what fits under a dial: every set
          of this exercise, with the one you are on opened up for editing. */}
      <div className="mt-6 w-full rounded-2xl border border-border/60 bg-card/40 p-2">
        {isCardio ? (
          <p className="px-2 py-3 text-[14px] text-muted-foreground">
            Cardio details live in the expanded view.
          </p>
        ) : sets.length === 0 ? (
          <p className="px-2 py-3 text-[14px] text-muted-foreground">
            No sets yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {sets.map((row, index) => {
              const isActive = index === setNumber - 1 && !isResting
              return (
                <li
                  key={row.id}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-xl px-2",
                    isActive && "bg-muted/60"
                  )}
                >
                  <span
                    className={cn(
                      "w-5 shrink-0 text-left text-[13px] tabular-nums",
                      row.completed
                        ? "text-muted-foreground line-through"
                        : "text-muted-foreground"
                    )}
                  >
                    {index + 1}
                  </span>
                  {isActive ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowWeight(true)}
                        aria-label={`Weight: ${toDisplay(row.weight, unit) || "not set"} ${unit}. Change it`}
                        className="motion-tactile min-h-10 flex-1 rounded-lg bg-background/70 px-3 text-[15px] font-semibold tabular-nums active:bg-background"
                      >
                        {toDisplay(row.weight, unit) || "—"}
                        <span className="ml-1 text-[13px] font-medium text-muted-foreground">
                          {unit}
                        </span>
                      </button>
                      <div className="flex min-h-10 flex-1 items-center justify-between rounded-lg bg-background/70">
                        <button
                          type="button"
                          onClick={() => stepReps(-1)}
                          aria-label="One rep fewer"
                          className="motion-tactile flex h-10 w-9 items-center justify-center text-muted-foreground active:text-foreground"
                        >
                          <Minus size={13} weight="bold" />
                        </button>
                        <span className="text-[15px] font-semibold tabular-nums">
                          {reps || "—"}
                          <span className="ml-1 text-[13px] font-medium text-muted-foreground">
                            reps
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => stepReps(1)}
                          aria-label="One rep more"
                          className="motion-tactile flex h-10 w-9 items-center justify-center text-muted-foreground active:text-foreground"
                        >
                          <Plus size={13} weight="bold" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <span
                      className={cn(
                        "flex-1 text-left text-[14px] tabular-nums",
                        row.completed
                          ? "text-muted-foreground"
                          : "text-foreground/80"
                      )}
                    >
                      {toDisplay(row.weight, unit) || "—"} {unit} ×{" "}
                      {row.reps || "—"}
                    </span>
                  )}
                  {row.completed && (
                    <CheckCircle
                      size={16}
                      weight="fill"
                      className="shrink-0 text-[var(--accent-workout)]"
                      aria-label="Completed"
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={
          isResting ? onSkipRest : setCount === 0 ? onAddSet : onCompleteSet
        }
        className="motion-tactile mt-5 min-h-14 w-full rounded-full bg-foreground px-8 text-[16px] font-semibold text-background"
      >
        {isResting
          ? "Skip rest"
          : isCardio
            ? "Log cardio"
            : setCount === 0
              ? "Add a set"
              : "Complete set"}
      </button>

      {/* Fixed height: swapping between resting and lifting must not shunt the
          dial up and down the screen. */}
      <div className="flex h-12 w-full items-center justify-center gap-1">
        {!isResting && set && (
          <>
            <button
              type="button"
              onClick={onSkipSet}
              aria-label={`Skip set ${setNumber}`}
              className="motion-tactile min-h-11 rounded-full px-3 text-[14px] text-muted-foreground active:text-foreground"
            >
              Skip set
            </button>
            <span className="text-muted-foreground/50" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={() => setShowRest(true)}
              aria-label={`Rest after this set: ${formatRest(set.restSeconds)}. Change it`}
              className="motion-tactile min-h-11 rounded-full px-3 text-[14px] text-muted-foreground active:text-foreground"
            >
              {formatRest(set.restSeconds)} rest after
            </button>
          </>
        )}
      </div>

      <p className="mt-2 min-h-10 text-[14px] text-muted-foreground">
        {doneSets} of {totalSets} sets done
        {nextExerciseName ? ` · next ${nextExerciseName}` : ""}
      </p>


      {showWeight && set && (
        <WeightSelectorSheet
          currentWeight={set.weight}
          barWeight={barWeight}
          barType={barType}
          unit={unit}
          lastSet={lastSet}
          onChange={(change: WeightSelectorChange) => {
            if (change.weight !== undefined) {
              onUpdateSet({ ...set, weight: change.weight })
            }
          }}
          onClose={() => setShowWeight(false)}
        />
      )}
      {showRest && set && (
        <RestTimerSheet
          current={set.restSeconds}
          onSelect={(seconds: number) => {
            onUpdateSet({ ...set, restSeconds: seconds })
            setShowRest(false)
          }}
          onClose={() => setShowRest(false)}
        />
      )}
    </section>
  )
}
