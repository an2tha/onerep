import type { CSSProperties } from "react"
import { cn } from "../../lib/utils"

export type BurstVariant = "rain" | "rise" | "spark"

type ParticleBurstProps = {
  /** Bump via `useReplayKey` to replay. `0` renders nothing. */
  replayKey: number
  variant?: BurstVariant
  count?: number
  /** Any CSS colour; defaults to the surface's accent. */
  color?: string
  className?: string
}

/**
 * Deterministic scatter — a seeded pattern rather than Math.random, so the
 * burst looks identical across replays and never reflows differently between
 * renders.
 */
export function ParticleBurst({
  replayKey,
  variant = "rain",
  count = 9,
  color,
  className,
}: ParticleBurstProps) {
  if (replayKey === 0) return null

  return (
    <span
      key={replayKey}
      aria-hidden
      className={cn("motion-burst", `motion-burst-${variant}`, className)}
      style={color ? ({ "--burst-color": color } as CSSProperties) : undefined}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          style={{
            left: `${(index * 37) % 101}%`,
            animationDelay: `${(index * 43) % 260}ms`,
            animationDuration: `${620 + ((index * 67) % 420)}ms`,
          }}
        />
      ))}
    </span>
  )
}
