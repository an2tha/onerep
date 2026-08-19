import { useEffect, useState, type ReactNode } from "react"
import { cn } from "../lib/utils"

/**
 * The app's dial, as a shared primitive.
 *
 * The same ring the nutrition hero has always drawn: a 44-unit radius in a
 * 100-unit box, a faint track, a rounded arc sweeping from twelve o'clock, and
 * a blurred pane filling the middle so whatever wash is behind it carries on
 * through the ring rather than stopping at it.
 *
 * The colour is an identity, not a reading. Nutrition gives protein, carbs and
 * fat one fixed colour each; the value is the length of the arc. A dial that
 * changes hue as its number falls is a traffic light, and a page of them reads
 * as a page of warnings.
 */
export function AppDial({
  value,
  target = 100,
  color,
  size,
  stroke = 8,
  mirrored = false,
  halo = false,
  className,
  children,
}: {
  value: number | null
  target?: number
  color: string
  size: number
  stroke?: number
  /**
   * Mirrors the sweep so a flanking dial fills away from the centre one.
   * Without it the arc runs straight under its neighbour and comes out the far
   * side as a floating sliver.
   */
  mirrored?: boolean
  /** A background-coloured ring, so overlapping dials cut a clean gap. */
  halo?: boolean
  className?: string
  children?: ReactNode
}) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const radius = 44
  const circumference = 2 * Math.PI * radius
  const reached =
    value === null || target <= 0 ? 0 : Math.min(1, Math.max(0, value / target))
  // The pane fills the ring exactly: the track's inner edge is the radius
  // minus half its own stroke, in the same 100-unit space the svg uses.
  const glassInset = `${50 - (radius - stroke / 2)}%`

  return (
    <div
      className={cn(
        "relative shrink",
        halo && "rounded-full shadow-[0_0_0_4px_var(--background)]",
        className
      )}
      style={{
        width: size,
        maxWidth: "100%",
        aspectRatio: "1",
        // Everything inside scales with the rendered width rather than the
        // requested one, so a dial squeezed by a narrow row stays in proportion.
        containerType: "inline-size",
      }}
    >
      <span className="macro-dial-glass" style={{ inset: glassInset }} />
      <svg
        viewBox="0 0 100 100"
        className="relative h-full w-full"
        style={{
          transform: mirrored ? "scaleX(-1) rotate(-90deg)" : "rotate(-90deg)",
        }}
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity={0.08}
          strokeWidth={stroke}
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={
            drawn ? circumference * (1 - reached) : circumference
          }
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-[18%] flex flex-col items-center justify-center overflow-hidden text-center">
        {children}
      </div>
    </div>
  )
}
