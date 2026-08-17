import React, { useEffect, useRef, useState } from "react"
import { Play } from "@phosphor-icons/react"
import { Card } from "@repo/ui"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { CAUTION_COLOR, COMPLETE_COLOR } from "./constants"
import { offsetIsoDate } from "./helpers"

const HOLD_DURATION = 650 // ms to fill the ring
const RING_R = 18
const RING_C = 2 * Math.PI * RING_R

/**
 * Starting a workout by accident is worse than starting one slowly, so the
 * ring makes you mean it for two thirds of a second.
 */
export function HoldToStartRing({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0)
  const holdingRef = useRef(false)
  const startRef = useRef(0)
  const rafRef = useRef<number>(0)

  function haptic(pattern: number | number[]) {
    navigator.vibrate?.(pattern)
  }

  function startHold(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    holdingRef.current = true
    startRef.current = Date.now()
    haptic(8)

    function tick() {
      if (!holdingRef.current) return
      const pct = Math.min(1, (Date.now() - startRef.current) / HOLD_DURATION)
      setProgress(pct)
      if (pct >= 1) {
        haptic([15, 40, 25])
        holdingRef.current = false
        onComplete()
      } else {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function cancelHold() {
    if (!holdingRef.current) return
    holdingRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setProgress(0)
  }

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  const offset = RING_C * (1 - progress)
  const active = progress > 0

  return (
    <button
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      className="relative flex h-12 w-12 touch-none items-center justify-center rounded-full transition-transform select-none active:scale-[0.985]"
      aria-label="Hold to start workout"
    >
      {/* ring */}
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        className="absolute inset-0"
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* track */}
        <circle
          cx="24"
          cy="24"
          r={RING_R}
          fill="none"
          strokeWidth="2.5"
          className="stroke-foreground/10"
        />
        {/* fill */}
        <circle
          cx="24"
          cy="24"
          r={RING_R}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={offset}
          className="stroke-foreground/70"
          style={{
            transition: active
              ? "none"
              : "stroke-dashoffset var(--motion-medium) var(--motion-ease-out)",
          }}
        />
      </svg>
      {/* play icon */}
      <Play
        size={14}
        weight="fill"
        className={cn(
          "relative transition-opacity",
          active ? "text-foreground/80" : "text-muted-foreground/40"
        )}
      />
    </button>
  )
}

/** The half-width workout tile: today's session, its state, and a way in. */
export function WorkoutSmall({
  done,
  workoutName,
  isRestDay,
}: {
  done: boolean
  workoutName: string
  isRestDay: boolean
}) {
  const navigate = useSmoothNavigate()
  return (
    <Card className="dashboard-tile h-full">
      <div className="flex h-full flex-col justify-between px-3.5 py-3">
        <p className="text-[10px] font-semibold text-muted-foreground/50">
          Workout
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] leading-snug font-semibold tracking-tight">
              {isRestDay ? "Rest day" : workoutName}
            </p>
            <div className="mt-1 flex items-center gap-1">
              <div
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isRestDay && "bg-muted-foreground/20"
                )}
                style={
                  done
                    ? { backgroundColor: COMPLETE_COLOR }
                    : !isRestDay
                      ? { backgroundColor: CAUTION_COLOR }
                      : undefined
                }
              />
              <span className="text-[9px] text-muted-foreground/40">
                {done ? "Done" : isRestDay ? "Rest" : "Hold to start"}
              </span>
            </div>
          </div>
          {!done && !isRestDay && (
            <HoldToStartRing onComplete={() => navigate("/workout/active")} />
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            // Hands off to the Workouts page so this button opens the same
            // "describe it or pick a preset" sheet every other entry point does.
            navigate(`/workouts?logPast=${offsetIsoDate(-1)}`, {
              motion: "forward",
            })
          }
          className="motion-tactile mt-1 h-9 w-full rounded-xl text-[12px] font-semibold text-muted-foreground/70 transition-colors active:bg-muted/25 active:text-foreground"
        >
          Log a past workout
        </button>
      </div>
    </Card>
  )
}
