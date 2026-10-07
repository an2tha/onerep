import type { CSSProperties, ReactNode } from "react"
import { tr } from "@repo/ui/i18n"
import { cn } from "@/lib/utils"
import { hapticSelection } from "@/lib/haptics"

// ─── The training hero, as three dials ────────────────────────────────────
// Same instrument as the nutrition hero — one large ring flanked by two
// smaller ones tucked behind its edges — so the two pages read as the same
// app rather than two apps that happen to ship together. Only the centre
// differs: nutrition reports, training asks you to commit.
const DIAL_RADIUS = 44
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS

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
  icon,
  className,
}: {
  name: string
  value: number
  target?: number
  suffix?: string
  color: string
  size: number
  stroke: number
  /** Mirrors the sweep so a flanking dial fills away from the centre one. */
  mirrored?: boolean
  /** Replaces the visible caption while the accessible name remains intact. */
  icon?: ReactNode
  className?: string
}) {
  const reached = target && target > 0 ? Math.min(1, value / target) : 0
  const accessibleValue = target
    ? `${value} of ${target}${suffix}`
    : tr("{{value0}}{{value1}}, no target set", {
        value0: value,
        value1: suffix,
      })
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
      aria-label={tr("{{value0}}: {{value1}}", {
        value0: name,
        value1: accessibleValue,
      })}
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
        {icon ? (
          <span
            className="mt-1 flex items-center justify-center text-muted-foreground"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : (
          <p
            className="mt-0.5 text-[11px] leading-tight text-muted-foreground"
            aria-hidden="true"
          >
            {name}
          </p>
        )}
      </div>
    </div>
  )
}

/** A standard button shared by the training and endurance heroes. */
export function StartWorkoutDial({
  label,
  detail,
  onComplete,
  size,
  stroke,
  color,
  primaryIcon,
  icon,
  className,
}: {
  label: string
  detail?: string
  onComplete: () => void
  size: number
  stroke: number
  color: string
  /** Dominant resting cue; the whole dial remains the interactive target. */
  primaryIcon?: ReactNode
  /** Replaces the resting detail label without changing the button name. */
  icon?: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => {
        hapticSelection()
        onComplete()
      }}
      aria-label={label}
      className={cn(
        "motion-tactile relative shrink-0 rounded-full border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      style={{ width: size, height: size, borderColor: color } as CSSProperties}
    >
      <span
        className="macro-dial-glass"
        style={{ inset: glassInset(stroke) }}
        aria-hidden="true"
      />
      <span className="absolute inset-[12%] flex flex-col items-center justify-center gap-1">
        <span aria-hidden="true">{primaryIcon ?? icon}</span>
        <span className="text-center text-xs leading-tight font-semibold">
          {label}
        </span>
        {detail && (
          <span className="text-center text-[11px] text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
    </button>
  )
}
