import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { hapticHeavy, hapticSelection, hapticTap } from "@/lib/haptics"

// ─── The training hero, as three dials ────────────────────────────────────
// Same instrument as the nutrition hero — one large ring flanked by two
// smaller ones tucked behind its edges — so the two pages read as the same
// app rather than two apps that happen to ship together. Only the centre
// differs: nutrition reports, training asks you to commit.
const DIAL_RADIUS = 44
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS

/** How long the finger has to stay down. Long enough to be a decision,
    short enough that it never feels like a punishment. */
export const HOLD_TO_START_MS = 2000

function glassInset(stroke: number) {
  return `${50 - (DIAL_RADIUS - stroke / 2)}%`
}

export function TrainingStatDial({
  name,
  value,
  target,
  suffix = "",
  color,
  size,
  stroke,
  mirrored = false,
  className,
}: {
  name: string
  value: number
  target: number
  suffix?: string
  color: string
  size: number
  stroke: number
  /** Mirrors the sweep so a flanking dial fills away from the centre one. */
  mirrored?: boolean
  className?: string
}) {
  const reached = target > 0 ? Math.min(1, value / target) : 0
  return (
    <div
      className={cn(
        // The halo sits a hair outside the drawn ring, so where two dials
        // overlap the front one cuts a clean gap instead of colliding.
        "relative shrink-0 rounded-full shadow-[0_0_0_4px_var(--background)]",
        className
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${name}: ${value} of ${target}${suffix}`}
    >
      <span
        className="macro-dial-glass"
        style={{ inset: glassInset(stroke) }}
        aria-hidden="true"
      />
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full"
        style={{
          transform: mirrored ? "scaleX(-1) rotate(-90deg)" : "rotate(-90deg)",
        }}
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={DIAL_RADIUS}
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity={0.08}
          strokeWidth={stroke}
        />
        <circle
          cx="50"
          cy="50"
          r={DIAL_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={DIAL_CIRCUMFERENCE}
          strokeDashoffset={DIAL_CIRCUMFERENCE * (1 - reached)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-[16%] flex flex-col items-center justify-center overflow-hidden">
        <p
          className={cn(
            "leading-none font-extrabold tabular-nums",
            size < 96 ? "text-[1rem]" : "text-[1.15rem]"
          )}
          aria-hidden="true"
        >
          <span key={value} className="motion-number-refresh inline-block">
            {value}
          </span>
          {suffix && (
            <span className="text-[12px] font-bold" style={{ color }}>
              {suffix}
            </span>
          )}
        </p>
        <p
          className="mt-0.5 text-[11px] leading-tight text-muted-foreground"
          aria-hidden="true"
        >
          {name}
        </p>
      </div>
    </div>
  )
}

/**
 * The centre dial: held, not swiped. Progress climbs for two seconds and the
 * haptics tighten as it goes — the phone counts down in the hand, so the
 * commitment is felt before the screen changes. Let go early and it falls
 * back, which is the whole point of putting it here.
 */
export function HoldToStartDial({
  label,
  detail,
  onComplete,
  size,
  stroke,
  color,
  className,
}: {
  label: string
  detail?: string
  onComplete: () => void
  size: number
  stroke: number
  color: string
  className?: string
}) {
  const [progress, setProgress] = useState(0)
  const [holding, setHolding] = useState(false)
  const frame = useRef<number | null>(null)
  const buzz = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAt = useRef(0)
  const done = useRef(false)

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    if (buzz.current !== null) clearTimeout(buzz.current)
    frame.current = null
    buzz.current = null
  }, [])

  useEffect(() => stop, [stop])

  const cancel = useCallback(() => {
    if (done.current) return
    stop()
    setHolding(false)
    setProgress(0)
  }, [stop])

  const begin = useCallback(() => {
    if (done.current || frame.current !== null) return
    startedAt.current = performance.now()
    setHolding(true)
    setProgress(0)
    hapticSelection()

    const tick = () => {
      const elapsed = performance.now() - startedAt.current
      const next = Math.min(1, elapsed / HOLD_TO_START_MS)
      setProgress(next)
      if (next >= 1) {
        done.current = true
        stop()
        hapticHeavy()
        onComplete()
        // The page normally leaves under us; if it doesn't, the dial should
        // not be dead for the rest of the session.
        setTimeout(() => {
          done.current = false
          setHolding(false)
          setProgress(0)
        }, 900)
        return
      }
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)

    // Haptics on their own clock: a slow pulse that closes to a near-hum by
    // the end, so the last second is unmistakable without a countdown label.
    const pulse = () => {
      const elapsed = performance.now() - startedAt.current
      const ratio = Math.min(1, elapsed / HOLD_TO_START_MS)
      if (ratio > 0.72) hapticTap()
      else hapticSelection()
      buzz.current = setTimeout(pulse, 220 - 175 * ratio)
    }
    buzz.current = setTimeout(pulse, 220)
  }, [onComplete, stop])

  const remaining = Math.max(
    1,
    Math.ceil((1 - progress) * (HOLD_TO_START_MS / 1000))
  )

  return (
    <button
      type="button"
      className={cn(
        "motion-tactile relative shrink-0 touch-none rounded-full shadow-[0_0_0_4px_var(--background)] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      style={
        {
          width: size,
          height: size,
          "--hold-color": color,
        } as CSSProperties
      }
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        begin()
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return
        event.preventDefault()
        begin()
      }}
      onKeyUp={(event) => {
        if (event.key !== " " && event.key !== "Enter") return
        cancel()
      }}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={`${label}. Press and hold for two seconds to start.`}
    >
      <span
        className="macro-dial-glass"
        style={{ inset: glassInset(stroke) }}
        aria-hidden="true"
      />
      <span
        className={cn("hold-dial-charge", holding && "is-holding")}
        style={{ inset: glassInset(stroke) }}
        aria-hidden="true"
      />
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full"
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={DIAL_RADIUS}
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity={0.08}
          strokeWidth={stroke}
        />
        <circle
          cx="50"
          cy="50"
          r={DIAL_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={DIAL_CIRCUMFERENCE}
          strokeDashoffset={DIAL_CIRCUMFERENCE * (1 - progress)}
          className="hold-dial-arc"
          data-holding={holding ? "true" : "false"}
        />
      </svg>
      <span className="absolute inset-[16%] flex flex-col items-center justify-center overflow-hidden">
        <span
          className="text-[1.05rem] leading-tight font-extrabold tracking-tight"
          aria-hidden="true"
        >
          {holding ? remaining : "Hold"}
        </span>
        <span
          className="mt-1 line-clamp-2 px-1 text-center text-[11px] leading-tight text-muted-foreground"
          aria-hidden="true"
        >
          {holding ? "keep holding" : label}
        </span>
        {!holding && detail && (
          <span
            className="mt-0.5 text-[11px] leading-tight text-muted-foreground/80"
            aria-hidden="true"
          >
            {detail}
          </span>
        )}
      </span>
    </button>
  )
}
