import { createPortal } from "react-dom"
import { formatElapsed } from "@/lib/workout-logging"

const RING_RADIUS = 8.5
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * The rest countdown as a dark pill hugging the notch, dynamic-island style.
 * It floats above everything so the timer survives scrolling through the
 * exercise list. Tapping it skips the rest — the pill is one big button.
 */
export function NotchRestTimer({
  remaining,
  duration,
  onSkip,
}: {
  remaining: number | null
  duration: number | null
  onSkip: () => void
}) {
  if (remaining === null || typeof document === "undefined") return null
  const total = duration && duration > 0 ? duration : Math.max(remaining, 1)
  const fraction = Math.max(0, Math.min(1, remaining / total))
  return createPortal(
    <button
      type="button"
      onClick={onSkip}
      aria-label={`Resting, ${formatElapsed(remaining)} left. Skip rest`}
      className="motion-tactile fixed left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/15 bg-neutral-950/95 py-2 pr-4 pl-3 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl"
      style={{
        top: "max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.4rem))",
      }}
    >
      <svg
        viewBox="0 0 22 22"
        className="h-[22px] w-[22px] -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="11"
          cy="11"
          r={RING_RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="2.5"
        />
        <circle
          cx="11"
          cy="11"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className="text-[15px] font-bold tracking-tight tabular-nums">
        {formatElapsed(remaining)}
      </span>
      <span className="text-[12px] font-semibold text-white/65">Skip</span>
    </button>,
    document.body
  )
}
