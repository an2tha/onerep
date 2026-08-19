import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { hapticSelection } from "@/lib/haptics"

// ─── The week, as one nested instrument ───────────────────────────────────
// Nutrition hangs its dials in a row and Training rings them in a crown;
// Progress is a different question — not three things side by side but three
// tracks through the same seven days — so it draws them as one target, read
// from the outside in. Tapping a track opens its tab: the hero is a control,
// not a trophy.
const RING_RADIUS = 44
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export type ProgressTrack = {
  /** Matches the Progress tab this track belongs to. */
  id: string
  name: string
  /** Days of the week this track was honoured. */
  days: number
  total: number
  color: string
  /** Outer diameter, in px. Largest track first. */
  size: number
}

export function ProgressRings({
  tracks,
  headline,
  detail,
  onSelect,
  collapsed = false,
}: {
  tracks: ProgressTrack[]
  headline: string
  detail: string
  onSelect: (id: string) => void
  /** The library doesn't need the week; the instrument folds away for it. */
  collapsed?: boolean
}) {
  const outer = tracks[0]?.size ?? 0
  const inner = tracks[tracks.length - 1]?.size ?? 0
  const stroke = 9

  // Measured rather than expressed in `fr` units or `max-height` guesses: the
  // fold has to land on the exact height of the thing being folded, or the
  // page below it kicks at the end of the animation.
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [bodyHeight, setBodyHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const measure = () => setBodyHeight(body.scrollHeight)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => observer.disconnect()
  }, [])

  // The transition is armed a frame after mount. Without this the rings
  // unfolded from nothing every single time the component mounted — including
  // in the outgoing copy of the page the router keeps alive while it animates
  // away, which is what was making leaving Progress judder.
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      className={`progress-hero-rings overflow-hidden${
        armed ? "is-armed" : ""
      }`}
      style={{
        // Before the first measurement the rings size themselves; a measured
        // pixel height only takes over once there is one to use.
        height: collapsed ? 0 : (bodyHeight ?? "auto"),
        opacity: collapsed ? 0 : 1,
      }}
      aria-hidden={collapsed}
      inert={collapsed ? true : undefined}
    >
      <div ref={bodyRef} className="flex flex-col items-center pt-5">
        <div
          className="relative shrink-0"
          style={{ width: outer, height: outer }}
          role="img"
          aria-label={`${headline} ${detail}. ${tracks
            .map(
              (track) => `${track.name}: ${track.days} of ${track.total} days`
            )
            .join(", ")}.`}
        >
          {/* One pane, in the hole at the middle, rather than one per ring:
            the field carries through the centre and the rings sit on it. */}
          <span
            className="macro-dial-glass"
            style={{ inset: (outer - inner + stroke) / 2 }}
            aria-hidden="true"
          />
          {tracks.map((track, index) => {
            const reached =
              track.total > 0 ? Math.min(1, track.days / track.total) : 0
            const offset = (outer - track.size) / 2
            return (
              <svg
                key={track.id}
                viewBox="0 0 100 100"
                className="absolute"
                style={{
                  width: track.size,
                  height: track.size,
                  left: offset,
                  top: offset,
                  // Alternating the sweep keeps the three ends from stacking up
                  // in one column, which read as a seam straight through them.
                  transform:
                    index % 2 === 1
                      ? "scaleX(-1) rotate(-90deg)"
                      : "rotate(-90deg)",
                }}
                aria-hidden="true"
              >
                <circle
                  cx="50"
                  cy="50"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--foreground)"
                  strokeOpacity={0.08}
                  strokeWidth={(stroke * 100) / track.size}
                />
                <circle
                  cx="50"
                  cy="50"
                  r={RING_RADIUS}
                  fill="none"
                  stroke={track.color}
                  strokeWidth={(stroke * 100) / track.size}
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (1 - reached)}
                  className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
              </svg>
            )
          })}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p
              className="text-[2.1rem] leading-none font-extrabold tracking-tight tabular-nums"
              aria-hidden="true"
            >
              <span
                key={headline}
                className="motion-number-refresh inline-block"
              >
                {headline}
              </span>
            </p>
            <p
              className="mt-1 text-[11px] leading-tight text-muted-foreground"
              aria-hidden="true"
            >
              {detail}
            </p>
          </div>
        </div>

        {/* The key doubles as the tab switcher — three targets worth tapping,
          which the rings themselves are too thin to be. */}
        <div className="mt-4 flex w-full items-stretch justify-center gap-1">
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => {
                hapticSelection()
                onSelect(track.id)
              }}
              className="motion-tactile flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-[14px] px-2 py-1.5 transition-colors active:bg-muted/30"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: track.color }}
                  aria-hidden="true"
                />
                <span className="text-[13px] font-semibold">{track.name}</span>
              </span>
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {track.days} of {track.total} days
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
