import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  Barbell,
  ForkKnife,
  Pill,
  PintGlass,
  Plus,
} from "@phosphor-icons/react"
import { hapticSelection, hapticTap } from "@/lib/haptics"

export type TimelineEntryKind = "food" | "water" | "workout" | "supplement"

export type TimelineEntry = {
  id: string
  time: string
  title: string
  detail: string
  kind: TimelineEntryKind
}

function EntryIcon({ kind, size }: { kind: TimelineEntryKind; size: number }) {
  if (kind === "water") return <PintGlass size={size} weight="bold" />
  if (kind === "workout") return <Barbell size={size} weight="bold" />
  if (kind === "supplement") return <Pill size={size} weight="bold" />
  return <ForkKnife size={size} weight="bold" />
}

// The day, as a picker wheel: a fixed band across the middle of the screen,
// and the day's hours scroll through it rather than the page scrolling past
// a fixed ruler. Rows lean away and fade the farther they sit from that
// band, the way a physical wheel would recede — this is meant to be the
// dashboard's main control, not a read-only chart alongside one.
//
// The band is a tint and the type standing on it, nothing more. It reads
// whatever minute is centered; scroll it near an event and it takes over
// that event's mark and title while the row itself steps aside, so the same
// thing is never on screen twice. The ruler underneath fades out inside the
// lane rather than being hidden behind it — which is why the band can stay
// this quiet and still be the thing you're obviously pointing with. Every
// event dot can also be picked off the line and dragged to a new minute.
//
// Letting go of a scroll always settles on the hour underneath (a light tap
// each time it does), and sliding into an event's morph gets the lighter,
// more distinct "selection changed" buzz — two different feelings for two
// different kinds of snap.

const HOUR_PX = 72
const DAY_HOURS = 24
const DAY_MINUTES = DAY_HOURS * 60
const LINE_LEFT = 64
const DAY_HEIGHT = DAY_HOURS * HOUR_PX
const NEAR_EVENT_MINUTES = 45
const BULGE_HEIGHT = 72

function parseTimeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim())
  if (!match) return 0
  const isPM = /pm/i.test(match[3])
  const hours = (Number(match[1]) % 12) + (isPM ? 12 : 0)
  return hours * 60 + Number(match[2])
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(minutes)))
  const hour24 = Math.floor(clamped / 60)
  const minute = clamped % 60
  const period = hour24 < 12 ? "AM" : "PM"
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`
}

function formatHourLabel(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24
  const period = hour < 12 ? "AM" : "PM"
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour} ${period}`
}

function topForMinutes(minutes: number) {
  return (minutes / 60) * HOUR_PX
}

function nowInMinutes() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

// The wheel's illusion of depth: rows fade and shrink the farther they sit
// from the center band, rather than staying flat and equally weighted.
function wheelDepth(top: number, scrollTop: number, viewportHeight: number) {
  if (!viewportHeight) return { opacity: 1, scale: 1 }
  const distance = Math.abs(top - (scrollTop + viewportHeight / 2))
  const t = Math.min(1, distance / (viewportHeight / 2))
  return { opacity: 1 - t * 0.75, scale: 1 - t * 0.32 }
}

export function DayTimeline({
  entries,
  onEntryTimeChange,
  onAddAtTime,
}: {
  entries: TimelineEntry[]
  onEntryTimeChange?: (id: string, time: string) => void
  /** Log something at whatever minute the band is currently holding. */
  onAddAtTime?: (time: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const lastSnappedHourRef = useRef<number | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [isInteracting, setIsInteracting] = useState(false)
  const interactingTimeoutRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined)
  const halfHourMarks = useMemo(
    () => Array.from({ length: DAY_HOURS * 2 }, (_, i) => i * 30),
    []
  )

  // The ruler is padded top and bottom by half a screen's worth of empty
  // space (below), which is what lets midnight and 11pm reach the center
  // band at all — without it, the scrollable range runs out a half-screen
  // short of either end and those hours can never be centered.
  const padding = viewportHeight / 2

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    setViewportHeight(node.clientHeight)

    const observer = new ResizeObserver(() =>
      setViewportHeight(node.clientHeight)
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Deliberately waits for a real height before jumping to the current hour.
  // Scrolling on mount lands nowhere useful: `padding` is still 0 then, so
  // every row is half a screen higher than its final spot, and the moment
  // the height arrives they all shift down out from under the scroll
  // position — leaving you parked above midnight staring at blank ruler.
  const didInitialScrollRef = useRef(false)
  useEffect(() => {
    const node = scrollRef.current
    if (!node || viewportHeight === 0 || didInitialScrollRef.current) return
    didInitialScrollRef.current = true
    const currentHour = Math.floor(nowInMinutes() / 60) * 60
    node.scrollTop = Math.max(
      0,
      Math.min(DAY_HEIGHT, topForMinutes(currentHour))
    )
    setScrollTop(node.scrollTop)
  }, [viewportHeight])

  // What time sits under the band right now — used both to decide whether
  // it should morph into a nearby event, and to fire the hour-snap haptic.
  // The padding above cancels out here: the band is always at scrollTop
  // plus half the viewport, and every row is offset by that same half
  // viewport, so the center time is just the scroll position itself.
  const centerMinutes = (scrollTop / HOUR_PX) * 60

  const nearestEntry = useMemo(() => {
    if (!viewportHeight || entries.length === 0) return null
    let closest = entries[0]
    let closestDiff = Math.abs(parseTimeToMinutes(closest.time) - centerMinutes)
    for (const entry of entries.slice(1)) {
      const diff = Math.abs(parseTimeToMinutes(entry.time) - centerMinutes)
      if (diff < closestDiff) {
        closest = entry
        closestDiff = diff
      }
    }
    return closestDiff <= NEAR_EVENT_MINUTES ? closest : null
  }, [entries, centerMinutes, viewportHeight])

  // A lighter, more distinct buzz right as the band's morph locks onto an
  // event — separate from the hour-snap tap below, so the two kinds of
  // "arrived somewhere" don't feel identical.
  const prevNearestIdRef = useRef<string | null>(null)
  useEffect(() => {
    const id = nearestEntry?.id ?? null
    if (id && id !== prevNearestIdRef.current) hapticSelection()
    prevNearestIdRef.current = id
  }, [nearestEntry?.id])

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget
    const top = node.scrollTop
    setScrollTop(top)
    setIsInteracting(true)

    // Waiting for scrolling to actually stop (rather than snapping via CSS
    // scroll-snap) is what keeps a fast flick smooth — CSS snap fights the
    // deceleration mid-fling and makes it feel like it's catching on
    // something. This only nudges the rest position once momentum is done.
    if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current)
    snapTimeoutRef.current = setTimeout(() => {
      const settledMinutes = (top / HOUR_PX) * 60
      const closeEntry = entries.find(
        (entry) =>
          Math.abs(parseTimeToMinutes(entry.time) - settledMinutes) <=
          NEAR_EVENT_MINUTES
      )
      const restMinutes = closeEntry
        ? parseTimeToMinutes(closeEntry.time)
        : Math.round(settledMinutes / 60) * 60
      const restTop = topForMinutes(restMinutes)

      if (draggingId === null && Math.abs(restTop - top) > 0.5) {
        node.scrollTo({ top: restTop, behavior: "smooth" })
      }

      const settledHour = Math.round(restMinutes / 60)
      if (settledHour !== lastSnappedHourRef.current) {
        lastSnappedHourRef.current = settledHour
        hapticTap()
      }
    }, 150)

    if (interactingTimeoutRef.current)
      clearTimeout(interactingTimeoutRef.current)
    interactingTimeoutRef.current = setTimeout(
      () => setIsInteracting(false),
      400
    )
  }

  const handleDotPointerDown = (
    entry: TimelineEntry,
    event: ReactPointerEvent<HTMLSpanElement>
  ) => {
    if (!onEntryTimeChange) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingId(entry.id)
  }

  const handleDotPointerMove = (
    entry: TimelineEntry,
    event: ReactPointerEvent<HTMLSpanElement>
  ) => {
    if (draggingId !== entry.id || !onEntryTimeChange) return
    const rect = contentRef.current?.getBoundingClientRect()
    if (!rect) return
    const minutes = ((event.clientY - rect.top - padding) / HOUR_PX) * 60
    onEntryTimeChange(
      entry.id,
      minutesToTime(Math.max(0, Math.min(DAY_MINUTES - 1, minutes)))
    )
  }

  const handleDotPointerUp = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDraggingId(null)
  }

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        className="app-scroll-strip relative h-full overflow-y-auto"
        style={{
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 18%)",
          maskImage: "linear-gradient(to bottom, transparent, black 18%)",
        }}
        onScroll={handleScroll}
      >
        <div
          ref={contentRef}
          className="relative mx-auto w-full max-w-sm -translate-x-6 px-6"
          style={{ height: DAY_HEIGHT + viewportHeight }}
        >
          <span
            className="absolute w-0.5 bg-border"
            style={{ left: LINE_LEFT, top: padding, height: DAY_HEIGHT }}
            aria-hidden="true"
          />

          {/* The band: pinned to the center of the screen for the entire
            scroll range (it has to live inside the full-height ruler, not
            after it, or its resting position is the bottom of the day
            rather than the middle of the viewport). It is a tint and the
            type standing on it — the position is marked by being the only
            thing at full strength, not by a slab sitting on top of the
            page. Over an event it takes that event's mark and title. */}
          <div className="pointer-events-none sticky top-1/2 z-20 h-0">
            <div
              className={`absolute inset-x-3 -translate-y-1/2 transition-transform duration-300 ease-out ${
                nearestEntry ? "scale-[1.03]" : "scale-100"
              }`}
              style={{ height: BULGE_HEIGHT }}
            >
              <div
                className={`day-timeline-bulge absolute inset-0 ${
                  nearestEntry ? "day-timeline-bulge-active" : ""
                }`}
                aria-hidden="true"
              />
              <div className="relative flex h-full items-center">
                <span
                  className="absolute text-foreground transition-opacity duration-300"
                  style={{
                    left: LINE_LEFT - 9,
                    opacity: nearestEntry ? 1 : 0,
                  }}
                >
                  {nearestEntry && (
                    <EntryIcon kind={nearestEntry.kind} size={18} />
                  )}
                </span>
                <span
                  className={`absolute text-[20px] font-semibold tabular-nums transition-colors duration-300 ${
                    isInteracting ? "text-foreground" : "text-foreground/75"
                  }`}
                  style={{
                    left: LINE_LEFT + 25,
                    opacity: nearestEntry ? 0 : 1,
                  }}
                >
                  {minutesToTime(centerMinutes)}
                </span>
                <span
                  className="absolute flex max-w-[74%] min-w-0 flex-col transition-opacity duration-300"
                  style={{
                    left: LINE_LEFT + 25,
                    opacity: nearestEntry ? 1 : 0,
                  }}
                >
                  <span className="truncate text-[21px] leading-tight font-semibold text-foreground">
                    {nearestEntry?.title}
                  </span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {nearestEntry?.time} · {nearestEntry?.detail}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {halfHourMarks.map((minutes) => {
            const isHour = minutes % 60 === 0
            const top = topForMinutes(minutes) + padding
            const depth = wheelDepth(top, scrollTop, viewportHeight)
            // The band no longer covers the ruler, so the ruler gets out of
            // its way: whatever falls inside the lane drops most of the way
            // out, leaving the band's own reading as the only thing at full
            // strength there. Cheaper than an opaque slab and it keeps the
            // hours legible right up to the edge of the lane.
            const underBand =
              Math.abs(top - (scrollTop + viewportHeight / 2)) <
              BULGE_HEIGHT / 2
            const opacity = depth.opacity * (underBand ? 0.15 : 1)
            if (!isHour) {
              return (
                <span
                  key={minutes}
                  className="absolute h-px w-2.5 bg-border transition-opacity duration-200"
                  style={{ left: LINE_LEFT - 5, top, opacity }}
                  aria-hidden="true"
                />
              )
            }
            return (
              <span key={minutes}>
                <span
                  className="absolute text-right text-[13px] font-semibold text-muted-foreground/70 tabular-nums transition-opacity duration-200"
                  style={{
                    left: 0,
                    width: LINE_LEFT - 16,
                    top: top - 8,
                    opacity,
                    transform: `scale(${depth.scale})`,
                    transformOrigin: "right center",
                  }}
                >
                  {formatHourLabel(minutes)}
                </span>
                <span
                  className="absolute size-2.5 rounded-full border-2 border-background bg-muted-foreground/60 transition-opacity duration-200"
                  style={{
                    left: LINE_LEFT - 7,
                    top: top - 7,
                    opacity,
                    transform: `scale(${depth.scale})`,
                  }}
                  aria-hidden="true"
                />
              </span>
            )
          })}

          {entries.map((entry) => {
            const minutes = parseTimeToMinutes(entry.time)
            const top = topForMinutes(minutes) + padding
            const dragging = draggingId === entry.id
            const highlighted = nearestEntry?.id === entry.id
            const depth = wheelDepth(top, scrollTop, viewportHeight)
            const scale = highlighted ? 1.08 : depth.scale
            return (
              <div
                key={entry.id}
                className={`absolute flex gap-5 ${
                  highlighted && !dragging ? "pointer-events-none" : ""
                }`}
                style={{
                  top: top - 9,
                  paddingLeft: LINE_LEFT + 25,
                  // The bulge takes over showing this entry once it's the one
                  // centered under it — leaving both visible doubled the text,
                  // caret over "Breakfast" over "Breakfast".
                  opacity: highlighted ? 0 : depth.opacity,
                  transform: `scale(${scale})`,
                  transformOrigin: "left center",
                  transition: dragging
                    ? "none"
                    : "top 200ms ease, transform 260ms ease, opacity 260ms ease",
                  zIndex: dragging ? 30 : undefined,
                }}
              >
                <span
                  onPointerDown={(event) => handleDotPointerDown(entry, event)}
                  onPointerMove={(event) => handleDotPointerMove(entry, event)}
                  onPointerUp={handleDotPointerUp}
                  className={`absolute top-0 flex touch-none items-center justify-center rounded-full border-[3px] border-background bg-foreground text-background shadow-[0_0_0_1px_var(--border)] transition-transform select-none ${
                    onEntryTimeChange
                      ? dragging
                        ? "scale-125 cursor-grabbing"
                        : "cursor-grab active:scale-110"
                      : ""
                  }`}
                  style={{ left: LINE_LEFT - 13, width: 28, height: 28 }}
                >
                  <EntryIcon kind={entry.kind} size={14} />
                </span>
                <span
                  className={`w-16 shrink-0 pt-1 text-[15px] font-semibold tabular-nums transition-colors ${
                    highlighted ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {entry.time}
                </span>
                <div className="min-w-0">
                  <p className="text-[19px] leading-tight font-semibold text-foreground">
                    {entry.title}
                  </p>
                  <p className="mt-1 text-[14px] text-muted-foreground">
                    {entry.detail}
                  </p>
                </div>
              </div>
            )
          })}

          {/* Nothing logged yet: say so once, next to the current hour, rather
            than leaving twenty-four hours of blank ruler to interpret. */}
          {entries.length === 0 && viewportHeight > 0 && (
            <p
              className="absolute text-[15px] text-muted-foreground"
              style={{
                top: topForMinutes(nowInMinutes()) + padding + 28,
                paddingLeft: LINE_LEFT + 25,
              }}
            >
              Nothing logged today.
            </p>
          )}
        </div>
      </div>

      {/* Same floating button the active workout carries, in the same
          corner: whatever screen you're on, the round black button in the
          bottom right adds the thing that screen is about. Outside the
          scroller on purpose — its mask would clip this straight off. */}
      {onAddAtTime && (
        <button
          type="button"
          onClick={() => {
            hapticTap()
            onAddAtTime(minutesToTime(centerMinutes))
          }}
          aria-label={`Log something at ${minutesToTime(centerMinutes)}`}
          className="motion-tactile fixed right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(var(--app-safe-bottom-lg)+4.75rem)] z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-[0_8px_22px_rgba(0,0,0,0.26)]"
        >
          <Plus size={19} weight="bold" />
        </button>
      )}
    </div>
  )
}
