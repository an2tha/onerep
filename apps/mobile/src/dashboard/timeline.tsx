import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  Barbell,
  CaretDown,
  CaretUp,
  Clock,
  ForkKnife,
  PencilSimple,
  Pill,
  PintGlass,
  Plus,
  Stack,
  Trash,
} from "@phosphor-icons/react"
import { hapticSelection, hapticTap } from "@/lib/haptics"

export type TimelineEntryKind = "food" | "water" | "workout" | "supplement"

export type TimelineFact = { label: string; value: string }

export type TimelineEntry = {
  id: string
  time: string
  title: string
  detail: string
  kind: TimelineEntryKind
  /** Extra numbers the row reveals near the anchor and the card shows in
   * full — calories, macros, volume, whatever the entry has. */
  facts?: TimelineFact[]
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
// The band is the scroll anchor. At rest it shrinks to a quiet readout of
// the minute; scrolling wakes it to full size; and over an event it grows
// into an outlined card holding that entry's full numbers, so selecting
// something on the wheel and reading it are the same gesture. The ruler underneath fades out inside the
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
// Entries closer together than this share one row: below roughly half a
// row height of ruler pitch, separate rows physically overlap and stop
// reading as separate things.
const MERGE_MINUTES = 25
const BULGE_HEIGHT = 72
// The card the anchor grows into over a selected event: one row on one
// slab — icon, entry, actions.
const CARD_HEIGHT = 72
const ICON_BOX = 36
// The icon surface is centred on the axis, where the row's dot was. The
// 8 is the band's own inset from the strip.
const ICON_LEFT = LINE_LEFT - 8 - ICON_BOX / 2
const ENTRY_LEFT = ICON_LEFT + ICON_BOX + 15
// The stack that drops out of a shared minute. Nothing here scrolls, so
// these two are what the lift has to make room for.
const STACK_ITEM_HEIGHT = 46
const STACK_GAP = 6
// How close a row has to sit to the band before its own numbers start
// showing, in px from the band's center.
const FACT_REVEAL_PX = 150

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
  sleepWindow,
  onEditEntry,
  onDeleteEntry,
  onAddEntry,
  onQuickLog,
  isToday = true,
  loading = false,
}: {
  entries: TimelineEntry[]
  /**
   * Whether the wheel is showing today.
   *
   * A past day has no "now" to mark and nothing to schedule ahead into, and
   * parking it on the current hour opens it at whatever o'clock it happens
   * to be rather than where the day's entries are.
   */
  isToday?: boolean
  /**
   * The day's logs are still in flight.
   *
   * Switching days empties the wheel for as long as the queries take, and an
   * empty wheel that says "nothing logged" during that gap is stating
   * something false about the day — briefly, but it is the first thing the
   * screen says about it.
   */
  loading?: boolean
  onEntryTimeChange?: (id: string, time: string) => void
  /** The user's night, in minutes from midnight — may wrap past 24h into
   * the small hours. Null when there is no sleep data to back it. */
  sleepWindow?: { start: number; end: number } | null
  /** Open the page that owns an entry (its "edit" surface). */
  onEditEntry?: (entry: TimelineEntry) => void
  /** Remove an entry from its log for real. */
  onDeleteEntry?: (entry: TimelineEntry) => void
  /** Start logging something of this kind (opens the matching drawer). */
  onAddEntry?: (kind: TimelineEntryKind) => void
  /** The always-visible pair of + buttons on the anchor's edges: one for
   * logging into the past, one for scheduling ahead. Reports which edge
   * and the minute the wheel is holding. */
  onQuickLog?: (phase: "past" | "future", minutes: number) => void
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
  // The clock, read on an interval rather than during render — the line
  // creeps down the ruler as the day does without re-render impurity.
  const [nowMinutes, setNowMinutes] = useState(() => nowInMinutes())
  useEffect(() => {
    const timer = window.setInterval(
      () => setNowMinutes(nowInMinutes()),
      30_000
    )
    return () => window.clearInterval(timer)
  }, [])
  useEffect(
    () => () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    },
    []
  )
  const [isInteracting, setIsInteracting] = useState(false)
  // Whether the card is showing every entry of a shared minute. Scoped to
  // the group under the band, so scrolling to the next one closes it
  // rather than dumping you into someone else's list already open.
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [stackClosing, setStackClosing] = useState(false)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
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
    // Today opens on the current hour; a past day opens on its first entry,
    // and an empty one on the morning rather than on midnight.
    const openAt = isToday
      ? nowMinutes
      : entries.length > 0
        ? Math.min(...entries.map((entry) => parseTimeToMinutes(entry.time)))
        : 8 * 60
    const openHour = Math.floor(openAt / 60) * 60
    node.scrollTop = Math.max(0, Math.min(DAY_HEIGHT, topForMinutes(openHour)))
    setScrollTop(node.scrollTop)
    // The ref guard makes re-running on the clock harmless: only the very
    // first real height gets to park the wheel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportHeight, nowMinutes, isToday])

  // What time sits under the band right now — used both to decide whether
  // it should morph into a nearby event, and to fire the hour-snap haptic.
  // The padding above cancels out here: the band is always at scrollTop
  // plus half the viewport, and every row is offset by that same half
  // viewport, so the center time is just the scroll position itself.
  const centerMinutes = (scrollTop / HOUR_PX) * 60

  // The wheel reads chronologically no matter what order callers hand over.
  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
      ),
    [entries]
  )

  // Entries that land within MERGE_MINUTES of each other share one row:
  // the wheel's vertical pitch can't keep them apart visually, so they
  // travel and get read as one — the card lists them individually.
  type EntryGroup = { key: string; minutes: number; members: TimelineEntry[] }
  const displayGroups = useMemo<EntryGroup[]>(() => {
    const groups: EntryGroup[] = []
    for (const entry of sortedEntries) {
      const minutes = parseTimeToMinutes(entry.time)
      const last = groups[groups.length - 1]
      if (last && minutes - last.minutes <= MERGE_MINUTES) {
        last.members.push(entry)
      } else {
        groups.push({ key: entry.id, minutes, members: [entry] })
      }
    }
    return groups
  }, [sortedEntries])

  const nearestGroup = useMemo(() => {
    if (!viewportHeight || displayGroups.length === 0) return null
    let closest = displayGroups[0]
    let closestDiff = Math.abs(closest.minutes - centerMinutes)
    for (const group of displayGroups.slice(1)) {
      const diff = Math.abs(group.minutes - centerMinutes)
      if (diff < closestDiff) {
        closest = group
        closestDiff = diff
      }
    }
    return closestDiff <= NEAR_EVENT_MINUTES ? closest : null
  }, [displayGroups, centerMinutes, viewportHeight])

  // A lighter, more distinct buzz right as the band's morph locks onto an
  // event — separate from the hour-snap tap below, so the two kinds of
  // "arrived somewhere" don't feel identical.
  const prevNearestIdRef = useRef<string | null>(null)
  useEffect(() => {
    const id = nearestGroup?.key ?? null
    if (id !== prevNearestIdRef.current) {
      if (id) hapticSelection()
      // A list left open belongs to the group you just scrolled off.
      setExpandedKey(null)
      setStackClosing(false)
    }
    prevNearestIdRef.current = id
  }, [nearestGroup?.key])

  const single = nearestGroup?.members.length === 1
  const expanded = !single && !!nearestGroup && expandedKey === nearestGroup.key
  // The stack outlives its own dismissal by one animation: the items fold
  // away farthest-first, and unmounting them on the tap would skip that.
  const stackGroup = expanded ? nearestGroup : null
  const actionsWidth = single ? 104 : 44

  const toggleStack = () => {
    hapticTap()
    if (!nearestGroup) return
    if (expandedKey === nearestGroup.key) {
      setStackClosing(true)
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = setTimeout(() => {
        setExpandedKey(null)
        setStackClosing(false)
      }, 260)
      return
    }
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    setStackClosing(false)
    setExpandedKey(nearestGroup.key)
  }

  // How far the band has to ride up for the whole stack to land on screen —
  // never past the top of the strip, and never further than the list needs.
  const lift = (() => {
    if (!stackGroup || stackClosing || !viewportHeight) return 0
    const needed =
      stackGroup.members.length * (STACK_ITEM_HEIGHT + STACK_GAP) + 12
    const room = viewportHeight / 2 - CARD_HEIGHT / 2 - 20
    return Math.max(0, Math.min(needed - room, room - 8))
  })()

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
      const closeEntry = sortedEntries.find(
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
    // Settles on mount and on every day change — the parent keys this on the
    // date, so switching days is one authored moment rather than a swap.
    <div className="motion-content-in relative mx-auto h-full w-full max-w-sm">
      {/* A day with nothing in it is an empty ruler, which on today reads as
        an invitation and on a past day reads as a fault. Say which it is —
        and make the sentence the way out of it, since an empty day is
        precisely when the wheel's own + is hardest to notice. */}
      {!isToday && !loading && entries.length === 0 && (
        <div className="motion-content-in absolute inset-x-0 top-[30%] z-30 flex flex-col items-center gap-2.5">
          <p className="text-[13px] text-muted-foreground">
            Nothing logged this day.
          </p>
          <button
            type="button"
            onClick={() => onQuickLog?.("past", Math.round(centerMinutes))}
            className="motion-tactile flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-foreground"
          >
            <Plus size={11} weight="bold" />
            Add to this day
          </button>
        </div>
      )}
      <div
        ref={scrollRef}
        className="app-scroll-strip relative h-full overflow-x-hidden overflow-y-auto"
        style={{
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 18%)",
          maskImage: "linear-gradient(to bottom, transparent, black 18%)",
        }}
        onScroll={handleScroll}
      >
        <div
          ref={contentRef}
          // No negative shift, no horizontal padding: the hour labels are
          // absolutely positioned from this box's left edge, and any offset
          // here pushes them past it — they were losing their first
          // character off the left side of the strip.
          className="relative mx-auto w-full max-w-sm"
          style={{ height: DAY_HEIGHT + viewportHeight }}
        >
          {/* The night: hours nobody should be awake for, dimmed behind the
            ruler. The window comes from the user's own health data — their
            average nightly sleep, centred on the middle of the night — and
            when there is no data there is no shading, because guessing
            someone's bedtime would be worse than admitting ignorance. */}
          {(sleepWindow
            ? sleepWindow.start > sleepWindow.end
              ? [
                  [sleepWindow.start, DAY_MINUTES],
                  [0, sleepWindow.end],
                ]
              : [[sleepWindow.start, sleepWindow.end]]
            : []
          ).map(([from, to]) => (
            <span
              key={`night-${from}`}
              // Square edges, flush to the lane: rounding this turns a
              // two-hour sliver into a floating circle, which reads as
              // decoration instead of shading.
              className="absolute inset-x-0 bg-foreground/[0.05]"
              style={{
                left: LINE_LEFT - 16,
                top: topForMinutes(from) + padding,
                height: topForMinutes(to - from),
              }}
              aria-hidden="true"
            />
          ))}
          <span
            className="absolute w-0.5 bg-border"
            style={{ left: LINE_LEFT, top: padding, height: DAY_HEIGHT }}
            aria-hidden="true"
          />

          {/* Now. The one mark on the ruler that isn't data: where this
            minute actually sits. A hairline across the lane and a solid
            bead on the axis — deliberately quieter than any event dot,
            because unlike them it moves on its own. A past day has no such
            minute, and drawing today's on it would be a lie about when
            anything happened. */}
          {isToday && (
            <span
              className="absolute"
              style={{
                top: topForMinutes(nowMinutes) + padding,
                left: 0,
                right: 0,
              }}
            >
              <span
                className="absolute h-px bg-foreground/25"
                style={{ left: LINE_LEFT, right: 0 }}
                aria-hidden="true"
              />
              <span
                className="absolute size-2 rounded-full bg-foreground shadow-[0_0_0_2px_var(--background)]"
                style={{ left: LINE_LEFT - 4, top: -3.5 }}
                aria-hidden="true"
              />
              {/* The word sits on the hairline, right of the axis, not in
                the hour column — there it landed on top of whichever hour
                label the minute happened to be near. */}
              <span
                className="absolute rounded-full bg-background px-1.5 text-[10px] leading-4 font-bold tracking-[0.08em] text-foreground/55 uppercase"
                style={{ left: LINE_LEFT + 10, top: -8 }}
              >
                Now
              </span>
            </span>
          )}

          {/* The anchor: pinned to the center of the strip for the entire
            scroll range (it has to live inside the full-height ruler, not
            after it, or its resting position is the bottom of the day
            rather than the middle of the viewport). Three states, each one
            quiet: at rest a single row — the minute, plus two small +
            buttons on the right; scrolling wakes the band; over an event
            the band becomes the card, which is also the only place an
            entry's actions live. */}
          <div className="pointer-events-none sticky top-1/2 z-20 h-0">
            {/* The lift. An open stack needs the bottom half of the screen,
              and the band is parked in the middle of it — so the band and
              its stack ride up together, which reads as the view panning
              down onto the list. Collapsing puts them back. The ruler
              underneath never moves: the card stays over its own dot. */}
            <div
              className="absolute inset-x-2 top-0 h-0"
              style={{
                transform: `translateY(${-lift}px)`,
                transition: "transform 420ms var(--motion-ease-emphasized)",
              }}
            >
              <div
                className={`absolute inset-x-0 -translate-y-1/2 transition-all duration-300 ease-out ${
                  nearestGroup
                    ? "scale-100"
                    : isInteracting
                      ? "scale-[0.94]"
                      : "scale-[0.84]"
                }`}
                style={{ height: nearestGroup ? CARD_HEIGHT : BULGE_HEIGHT }}
              >
                <div
                  className={`day-timeline-bulge absolute inset-0 ${
                    nearestGroup ? "day-timeline-bulge-active" : ""
                  }`}
                  aria-hidden="true"
                />
                {/* Resting readout — one row, nothing floating: the minute on
                  the left, the quick-log pair tucked on the right. */}
                <div
                  className="absolute inset-0 flex h-full items-center transition-opacity duration-200"
                  style={{ opacity: nearestGroup ? 0 : 1 }}
                >
                  <span
                    className={`absolute text-[19px] font-semibold tabular-nums transition-colors duration-300 ${
                      isInteracting ? "text-foreground" : "text-foreground/70"
                    }`}
                    style={{ left: LINE_LEFT + 25 }}
                  >
                    {minutesToTime(centerMinutes)}
                  </span>
                  <div
                    className="absolute right-3 flex items-center gap-1"
                    style={{ pointerEvents: nearestGroup ? "none" : "auto" }}
                  >
                    {[
                      {
                        phase: "past" as const,
                        label: isToday
                          ? "Log something earlier today"
                          : "Log something into this day",
                        icon: Plus,
                      },
                      // Nothing can be scheduled into a day that has already
                      // happened, so the clock goes rather than sitting there
                      // taking taps that cannot mean anything.
                      ...(isToday
                        ? [
                            {
                              phase: "future" as const,
                              label: "Schedule something ahead",
                              icon: Clock,
                            },
                          ]
                        : []),
                    ].map((button) => (
                      <button
                        key={button.phase}
                        type="button"
                        aria-label={button.label}
                        title={button.label}
                        onClick={() =>
                          onQuickLog?.(button.phase, Math.round(centerMinutes))
                        }
                        className="motion-tactile flex size-7 items-center justify-center rounded-full border bg-card/80"
                        style={{
                          borderColor:
                            "color-mix(in srgb, var(--foreground) 40%, transparent)",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        <button.icon size={13} weight="bold" />
                      </button>
                    ))}
                  </div>
                </div>
                {/* The card. Its icon sits on the axis, exactly where the
                  row's dot was, or the whole thing looks like it slides in
                  sideways every time you scroll onto an entry. */}
                <div
                  className={`${
                    nearestGroup ? "pointer-events-auto" : "pointer-events-none"
                  } absolute inset-0 transition-opacity duration-200`}
                  style={{ opacity: nearestGroup ? 1 : 0 }}
                  aria-hidden={!nearestGroup}
                >
                  {nearestGroup && (
                    <>
                      <span
                        className="absolute flex items-center justify-center rounded-full bg-foreground text-background"
                        style={{
                          left: ICON_LEFT,
                          top: (CARD_HEIGHT - ICON_BOX) / 2,
                          width: ICON_BOX,
                          height: ICON_BOX,
                        }}
                      >
                        {single ? (
                          <EntryIcon
                            kind={nearestGroup.members[0].kind}
                            size={16}
                          />
                        ) : (
                          <Stack size={16} weight="bold" />
                        )}
                      </span>
                      <div
                        className="absolute inset-y-0 flex flex-col justify-center"
                        style={{
                          left: ENTRY_LEFT,
                          right: actionsWidth + 8,
                        }}
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="min-w-0 truncate text-[16px] leading-tight font-semibold text-foreground">
                            {single
                              ? nearestGroup.members[0].title
                              : `${nearestGroup.members.length} logged items`}
                          </span>
                          <span className="shrink-0 text-[12px] font-medium text-muted-foreground tabular-nums">
                            {single
                              ? nearestGroup.members[0].time
                              : `${nearestGroup.members[0].time} – ${
                                  nearestGroup.members[
                                    nearestGroup.members.length - 1
                                  ].time
                                }`}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          {single
                            ? [
                                nearestGroup.members[0].detail,
                                ...(nearestGroup.members[0].facts ?? []).map(
                                  (fact) => `${fact.label} ${fact.value}`
                                ),
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : nearestGroup.members
                                .map((member) => member.title)
                                .join(" · ")}
                        </p>
                      </div>
                      {/* Nine things logged in the same minute don't fit in
                        a card and never will. The card says how many; the
                        list itself opens underneath it. */}
                      <span
                        className="absolute inset-y-0 right-0 flex items-center justify-center gap-1 pr-2"
                        style={{ width: actionsWidth }}
                      >
                        {single ? (
                          <EntryActions
                            onEdit={
                              onEditEntry
                                ? () => onEditEntry(nearestGroup.members[0])
                                : undefined
                            }
                            onDelete={
                              onDeleteEntry
                                ? () => onDeleteEntry(nearestGroup.members[0])
                                : undefined
                            }
                            onAdd={
                              onAddEntry
                                ? () => onAddEntry(nearestGroup.members[0].kind)
                                : undefined
                            }
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={toggleStack}
                            aria-expanded={expanded}
                            aria-label={
                              expanded
                                ? "Hide these entries"
                                : `Show all ${nearestGroup.members.length} entries`
                            }
                            className="motion-tactile flex size-8 items-center justify-center rounded-full text-foreground/80"
                          >
                            <CaretDown
                              size={14}
                              weight="bold"
                              className="transition-transform duration-300"
                              style={{
                                transform: expanded ? "rotate(180deg)" : "none",
                              }}
                            />
                          </button>
                        )}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {/* The list, once asked for: small cards of their own, dealt
                out under the main one one after the next. Nothing scrolls
                and nothing is cut off — the lift above made the room. */}
              {stackGroup && (
                <div
                  data-state={stackClosing ? "closing" : "open"}
                  className="pointer-events-auto absolute inset-x-0 flex flex-col"
                  style={{
                    top: CARD_HEIGHT / 2 + 8,
                    gap: STACK_GAP,
                    paddingLeft: ENTRY_LEFT - 8,
                  }}
                >
                  {stackGroup.members.map((member, index) => (
                    <div
                      key={member.id}
                      className="day-stack-item flex items-center gap-2.5 rounded-2xl border border-border/70 bg-card/95 px-2.5 shadow-sm backdrop-blur-sm"
                      style={{
                        height: STACK_ITEM_HEIGHT,
                        ["--stack-index" as string]: index,
                        ["--stack-index-out" as string]:
                          stackGroup.members.length - 1 - index,
                      }}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground">
                        <EntryIcon kind={member.kind} size={12} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] leading-tight font-semibold text-foreground">
                          {member.title}
                        </span>
                        <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                          {member.detail}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {member.time}
                      </span>
                      {onEditEntry && (
                        <button
                          type="button"
                          aria-label={`Edit ${member.title}`}
                          title="Edit"
                          onClick={() => onEditEntry(member)}
                          className="motion-tactile flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <PencilSimple size={12} weight="bold" />
                        </button>
                      )}
                      {onDeleteEntry && (
                        <button
                          type="button"
                          aria-label={`Delete ${member.title}`}
                          title="Delete"
                          onClick={() => onDeleteEntry(member)}
                          className="motion-tactile flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash size={12} weight="bold" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
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

          {displayGroups.map((group) => {
            const minutes = group.minutes
            const top = topForMinutes(minutes) + padding
            const single = group.members.length === 1
            const entry = group.members[0]
            const dragging = single && draggingId === entry.id
            const highlighted = nearestGroup?.key === group.key
            const depth = wheelDepth(top, scrollTop, viewportHeight)
            const scale = highlighted ? 1.08 : depth.scale
            // A row's own numbers surface as it comes within reach of the
            // anchor — the last stretch before the card takes over — and
            // step back down once it does, same as the title below. The
            // actions ride the same fade.
            const proximityOpacity = highlighted
              ? 0
              : Math.max(
                  0,
                  Math.min(
                    1,
                    1 -
                      Math.abs(top - (scrollTop + viewportHeight / 2)) /
                        FACT_REVEAL_PX
                  )
                )
            return (
              <div
                key={group.key}
                className={`absolute flex gap-5 ${
                  highlighted && !dragging ? "pointer-events-none" : ""
                }`}
                style={{
                  top: top - 9,
                  // Bounded on both sides so truncation has something to
                  // push against — an absolutely positioned row otherwise
                  // shrink-wraps its content and runs off the strip.
                  left: 0,
                  right: 10,
                  paddingLeft: LINE_LEFT + 25,
                  // The card takes over showing this group once it's the one
                  // centered under it — leaving both visible doubled the text.
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
                  onPointerDown={(event) =>
                    single && handleDotPointerDown(entry, event)
                  }
                  onPointerMove={(event) =>
                    single && handleDotPointerMove(entry, event)
                  }
                  onPointerUp={handleDotPointerUp}
                  title={
                    single && onEntryTimeChange
                      ? "Drag to change time"
                      : undefined
                  }
                  className={`absolute top-0 flex touch-none items-center justify-center rounded-full border-[3px] border-background bg-foreground text-background shadow-[0_0_0_1px_var(--border)] transition-transform select-none ${
                    single && onEntryTimeChange
                      ? dragging
                        ? "scale-125 cursor-grabbing"
                        : "cursor-grab active:scale-110"
                      : ""
                  }`}
                  style={{ left: LINE_LEFT - 13, width: 28, height: 28 }}
                >
                  {single ? (
                    <EntryIcon kind={entry.kind} size={14} />
                  ) : (
                    <Stack size={13} weight="bold" />
                  )}
                </span>
                {/* The drag cue: a pair of chevrons on the axis, above and
                  below the dot. They fade in as the row approaches the band
                  — exactly when a drag would be worth starting — and say
                  "this moves up and down through time" without a word. */}
                {single && onEntryTimeChange && (
                  <>
                    <CaretUp
                      size={9}
                      weight="bold"
                      aria-hidden="true"
                      className="pointer-events-none absolute text-muted-foreground/70 transition-opacity duration-200"
                      style={{
                        left: LINE_LEFT - 4,
                        top: -13,
                        opacity: proximityOpacity * 0.9,
                      }}
                    />
                    <CaretDown
                      size={9}
                      weight="bold"
                      aria-hidden="true"
                      className="pointer-events-none absolute text-muted-foreground/70 transition-opacity duration-200"
                      style={{
                        left: LINE_LEFT - 4,
                        top: 31,
                        opacity: proximityOpacity * 0.9,
                      }}
                    />
                  </>
                )}
                <span
                  className={`w-16 shrink-0 pt-1 text-[15px] font-semibold tabular-nums transition-colors ${
                    highlighted ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {minutesToTime(minutes)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[18px] leading-tight font-semibold text-foreground">
                    {single
                      ? entry.title
                      : `${group.members.length} logged items`}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                    {single
                      ? entry.detail
                      : group.members.map((m) => m.title).join(" · ")}
                  </p>
                  {single && entry.facts && entry.facts.length > 0 && (
                    <p
                      className="mt-0.5 text-[12px] leading-snug text-muted-foreground/90 transition-opacity duration-200"
                      style={{ opacity: proximityOpacity }}
                    >
                      {entry.facts
                        .slice(0, 3)
                        .map((fact) => `${fact.label} ${fact.value}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// The three things you can do to an entry, as quiet ghost buttons on a
// surface of their own at the end of the card — rows stay pure content, and
// the actions appear exactly where your eyes already are when you've
// decided to act.
function EntryActions({
  onEdit,
  onDelete,
  onAdd,
}: {
  onEdit?: () => void
  onDelete?: () => void
  onAdd?: () => void
}) {
  const actions = [
    { label: "Edit", icon: PencilSimple, onClick: onEdit },
    { label: "Delete", icon: Trash, onClick: onDelete },
    { label: "Add", icon: Plus, onClick: onAdd },
  ].filter((action) => action.onClick)
  if (actions.length === 0) return null
  return (
    <span className="flex shrink-0 items-center gap-1">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          aria-label={action.label}
          title={action.label}
          onClick={(event) => {
            event.stopPropagation()
            action.onClick?.()
          }}
          className="motion-tactile flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <action.icon size={14} weight="bold" />
        </button>
      ))}
    </span>
  )
}
