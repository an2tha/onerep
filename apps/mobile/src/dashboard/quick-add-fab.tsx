/**
 * The dashboard's quick-add button: the same round black bubble the active
 * workout page carries, opened into a fan of destinations instead of a
 * coach menu.
 *
 * The choreography is borrowed wholesale from `WorkoutCoachMenu` — the
 * options spring out of the button itself, nearest first, and fold back
 * into it farthest first, so the menu reads as the button opening and
 * closing rather than as a panel arriving from somewhere else. All of the
 * animation lives in the shared `coach-fab-*` CSS; this component only
 * supplies the markup and the stagger indexes.
 *
 * Like the coach menu, this outlives its own dismissal by `exitMs` so the
 * way out gets to play; every path out goes through `dismiss`.
 *
 * Until the button has been opened once on this device it wears a slow ring
 * and a line of text saying what it does — the only thing on the dashboard
 * that says the button is there at all. First open retires both for good.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { ComponentType, CSSProperties } from "react"
import { Plus, X } from "@phosphor-icons/react"
import {
  hapticHeavy,
  hapticMedium,
  hapticSelection,
  hapticTap,
} from "@/lib/haptics"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"
import type { QuickActionId } from "@/dashboard/quick-action-drawers"
import { QuickAddMore } from "@/dashboard/quick-add-more"

export type QuickAddOption = {
  /** Which quick-action drawer the option opens. */
  action: QuickActionId
  label: string
  icon: ComponentType<{ size?: number; weight?: "bold"; className?: string }>
}

/** Set the first time the button is opened; the hint never comes back after. */
const HINT_SEEN_KEY = "onerep:quick-add-hint-seen"

/** Said once, to the one person who has not met this button yet. */
const HINT_TEXT = "Tap for quick actions, hold for more"

/**
 * The hold, in four beats.
 *
 * Each entry is how long after the finger lands that beat fires, how far the
 * circle has crawled out by then, and how hard the phone answers. Two full
 * seconds, which is a long time to ask somebody to keep their thumb still —
 * that is the point. The growth accelerates while the gaps stay wide, so the
 * gesture reads as something gathering under the finger rather than a
 * progress bar being filled in on your behalf. The last beat is the page.
 */
const HOLD_STEPS: {
  at: number
  scale: number
  haptic: () => void
}[] = [
  { at: 320, scale: 0.05, haptic: hapticTap },
  { at: 900, scale: 0.14, haptic: hapticTap },
  { at: 1500, scale: 0.34, haptic: hapticMedium },
  { at: 2050, scale: 1, haptic: hapticHeavy },
]

/** How long the circle takes to crawl back into the finger on a cancel. */
const HOLD_CANCEL_MS = 420

/** Farthest corner from the hold origin — how big the circle has to get to
 * own the screen. */
function reachFrom(x: number, y: number) {
  const width = window.innerWidth
  const height = window.innerHeight
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y))
}

/** Where the button was left. Only the offset from its home corner is kept —
 * the corner itself is a CSS calc full of safe-area insets and is nobody's
 * business in JavaScript. */
const POSITION_KEY = "onerep:quick-add-fab-pos"

// The menu rises from the trigger's top edge. Keeping this relationship in
// numbers makes it impossible for the last action to drift back underneath
// the draggable button when either position changes.
export const QUICK_ADD_TRIGGER_BOTTOM_REM = 10.25
export const QUICK_ADD_TRIGGER_SIZE_REM = 3
export const QUICK_ADD_MENU_GAP_REM = 0.75
export const QUICK_ADD_MENU_BOTTOM_REM =
  QUICK_ADD_TRIGGER_BOTTOM_REM +
  QUICK_ADD_TRIGGER_SIZE_REM +
  QUICK_ADD_MENU_GAP_REM

/** How far a finger has to travel before this stops being a press and starts
 * being a drag. Below this, thumbs shake and holds would never survive. */
const DRAG_SLOP = 12

/** How much of an out-of-bounds drag the button keeps. The rest is the
 * screen refusing, politely. */
const DRAG_RESISTANCE = 0.32

/** Breathing room between the button and whatever it parks against. */
const PARK_MARGIN = 16

/** Clearance kept below the top safe inset, so the button never rides up
 * into a status bar or a notch. */
const PARK_TOP = 56

export type Offset = { dx: number; dy: number }

/**
 * The button's box with the drag taken back out of it — where it would sit
 * having never been touched. Every bound is expressed against this, so the
 * safe-area calc in the CSS stays the only definition of home and nothing
 * here has to guess at insets.
 */
export type Home = { left: number; top: number; width: number; height: number }

/** The box the button is allowed to be inside, in viewport pixels. */
export type Bounds = {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * What the button has to stay clear of.
 *
 * `safe` is the safe-area rectangle, measured rather than calculated — a
 * hidden probe wearing `inset: env(...)` gives all four insets in one read,
 * which beats four `env()` strings JavaScript cannot resolve.
 *
 * `sidebarRight` and `tabBarTop` are the app's own chrome, measured from the
 * elements themselves. Both are laid out by media queries; asking the DOM
 * where they are means this never has to know that the sidebar is 16rem, or
 * that it disappears below `lg`, or that the tab rail does the opposite.
 */
export function boundsFrom({
  viewport,
  safe,
  sidebarRight,
  tabBarTop,
}: {
  viewport: { width: number; height: number }
  safe: Bounds
  sidebarRight: number
  tabBarTop: number
}): Bounds {
  return {
    left: Math.max(safe.left, sidebarRight) + PARK_MARGIN,
    right: Math.min(safe.right, viewport.width) - PARK_MARGIN,
    top: safe.top + PARK_TOP,
    bottom: Math.min(safe.bottom, tabBarTop) - PARK_MARGIN,
  }
}

const HOME: Offset = { dx: 0, dy: 0 }

function readOffset(): Offset {
  const raw = safeLocalStorageGet(POSITION_KEY)
  if (!raw) return HOME
  try {
    const parsed = JSON.parse(raw) as Partial<Offset>
    if (!Number.isFinite(parsed?.dx) || !Number.isFinite(parsed?.dy)) {
      return HOME
    }
    return { dx: Number(parsed.dx), dy: Number(parsed.dy) }
  } catch {
    return HOME
  }
}

function measureHome(el: HTMLElement, offset: Offset): Home {
  const rect = el.getBoundingClientRect()
  return {
    left: rect.left - offset.dx,
    top: rect.top - offset.dy,
    width: rect.width,
    height: rect.height,
  }
}

/**
 * Keeps the button inside the bounds.
 *
 * The button never leaves its column: `dx` is pinned at zero, so the only
 * question a drag ever asks is how high. The left half of the screen belongs
 * to the sidebar on a desktop and to the content everywhere else, and a
 * button that can be parked over either is a button someone has to find.
 *
 * The bounds can be shorter than the button on a genuinely tiny window; the
 * maximum is floored to the minimum so it lands somewhere real instead of
 * inverting.
 */
export function clampOffset(
  offset: Offset,
  home: Home,
  bounds: Bounds
): Offset {
  const minDy = bounds.top - home.top
  const maxDy = Math.max(minDy, bounds.bottom - home.height - home.top)
  return { dx: 0, dy: Math.min(maxDy, Math.max(minDy, offset.dy)) }
}

/**
 * The same, but soft: past either end the finger keeps some of its travel and
 * loses the rest, so the button follows into the dead zone rather than
 * stopping dead under the thumb. Letting go springs it back — which is where
 * the bounce comes from and the only place it belongs.
 */
export function resistOffset(
  offset: Offset,
  home: Home,
  bounds: Bounds
): Offset {
  const inside = clampOffset(offset, home, bounds)
  return { dx: 0, dy: inside.dy + (offset.dy - inside.dy) * DRAG_RESISTANCE }
}

/** Where the button belongs once the finger lets go: same column, whatever
 * height it was left at, back inside the bounds. */
export function parkedOffset(
  offset: Offset,
  home: Home,
  bounds: Bounds
): Offset {
  return clampOffset(offset, home, bounds)
}

/** Longest exit animation plus its stagger — keeps 220ms true for two items
 * and lets bigger menus finish folding before they unmount. */
function exitMsFor(options: number): number {
  return Math.max(220, 200 + (options - 1) * 40)
}

export function QuickAddFab({
  options,
  onChoose,
}: {
  options: QuickAddOption[]
  onChoose: (action: QuickActionId) => void
}) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  // Nobody finds a button they have not been told about. The ring runs until
  // the button has been opened once, on this device, ever.
  const [hinting, setHinting] = useState(
    () => safeLocalStorageGet(HINT_SEEN_KEY) !== "true"
  )
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exitMs = exitMsFor(options.length)

  // The hold. `origin` is where the finger landed and how far the circle has
  // to travel from there; `step` is which of the four beats has fired.
  const [origin, setOrigin] = useState<{
    x: number
    y: number
    size: number
  } | null>(null)
  const [step, setStep] = useState(0)
  const [more, setMore] = useState(false)
  const [moreClosing, setMoreClosing] = useState(false)
  const holdTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A completed hold ends in a `click` the browser still owes us. Without
  // this the page would open and the fan would spring out behind it.
  const swallowClick = useRef(false)

  // The drag. `offset` is how far the button sits from its home corner;
  // `parking` is on only while it springs back to an edge, which is the one
  // moment the movement should be animated rather than tracked.
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [offset, setOffset] = useState<Offset>(readOffset)
  const [dragging, setDragging] = useState(false)
  const [parking, setParking] = useState(false)
  const drag = useRef<{
    startX: number
    startY: number
    from: Offset
    home: Home
    bounds: Bounds
    moved: boolean
    /** Set once the hold has visibly begun. From then on the finger is
     * allowed to wander: two seconds is a long time to hold a thumb still,
     * and cancelling a hold that is already drawing itself is a betrayal. */
    committed: boolean
  } | null>(null)
  const parkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const probeRef = useRef<HTMLSpanElement>(null)

  /**
   * Where the button may go, right now. Measured on every drag and every
   * resize rather than cached: the sidebar appears at `lg`, the tab rail
   * disappears at the same breakpoint, and a rotation moves both.
   */
  const measureBounds = useCallback((): Bounds => {
    const probe = probeRef.current?.getBoundingClientRect()
    // A probe with no width is a probe with no stylesheet. Believing it would
    // shrink the screen to a point and park the button somewhere off it, so an
    // unstyled ruler is treated as no ruler at all.
    const safe: Bounds =
      probe && probe.width > 0 && probe.height > 0
        ? {
            left: probe.left,
            right: probe.right,
            top: probe.top,
            bottom: probe.bottom,
          }
        : {
            left: 0,
            right: window.innerWidth,
            top: 0,
            bottom: window.innerHeight,
          }
    const sidebar = document
      .querySelector(".app-route-sidebar")
      ?.getBoundingClientRect()
    const tabBar = document
      .querySelector(".app-route-chrome")
      ?.getBoundingClientRect()
    return boundsFrom({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      safe,
      // A hidden element measures as a zero-sized box at the origin, which is
      // exactly the "no sidebar here" answer — but only if width is checked,
      // or its right edge of 0 would read as a sidebar of no width.
      sidebarRight: sidebar && sidebar.width > 0 ? sidebar.right : 0,
      tabBarTop:
        tabBar && tabBar.height > 0 ? tabBar.top : Number.POSITIVE_INFINITY,
    })
  }, [])
  // Handlers fire between renders and would otherwise be reasoning about an
  // offset one frame stale — which is a button that leaps as you let go.
  const offsetRef = useRef(offset)
  offsetRef.current = offset

  const settle = useCallback((next: Offset, animate: boolean) => {
    offsetRef.current = next
    setOffset(next)
    safeLocalStorageSet(POSITION_KEY, JSON.stringify(next))
    if (parkTimer.current) clearTimeout(parkTimer.current)
    if (!animate) {
      setParking(false)
      return
    }
    setParking(true)
    parkTimer.current = setTimeout(() => {
      parkTimer.current = null
      setParking(false)
    }, 420)
  }, [])

  /** Springs the button to the nearer edge and remembers where that was. */
  const park = useCallback(
    (home: Home) => {
      const next = parkedOffset(offsetRef.current, home, measureBounds())
      // Only spring when there is somewhere to spring to: the drag itself
      // already put the button where it belongs unless it was hauled past an
      // end, and a spring from nowhere to nowhere just reads as a twitch.
      settle(next, Math.abs(next.dy - offsetRef.current.dy) > 1)
    },
    [settle, measureBounds]
  )

  // A restored position is only as good as the screen it was saved on: a
  // rotated phone, a smaller window, or a stale value from a previous device
  // can all put the button somewhere it does not fit. Check on the way in and
  // on every resize, and move it back without ceremony if it is out of
  // bounds. Silence when it already fits — this must not fight the drag.
  useEffect(() => {
    function reconcile() {
      const el = triggerRef.current
      if (!el || drag.current) return
      const home = measureHome(el, offsetRef.current)
      settle(parkedOffset(offsetRef.current, home, measureBounds()), false)
    }
    reconcile()
    window.addEventListener("resize", reconcile)
    window.addEventListener("orientationchange", reconcile)
    return () => {
      window.removeEventListener("resize", reconcile)
      window.removeEventListener("orientationchange", reconcile)
    }
  }, [settle, measureBounds])

  const clearHoldTimers = useCallback(() => {
    holdTimers.current.forEach(clearTimeout)
    holdTimers.current = []
  }, [])

  /** Pull the circle back into the finger, then stop drawing it. */
  const collapse = useCallback(() => {
    setStep(0)
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(() => {
      collapseTimer.current = null
      setOrigin(null)
    }, HOLD_CANCEL_MS)
  }, [])

  const retireHint = useCallback(() => {
    setHinting((was) => {
      if (was) safeLocalStorageSet(HINT_SEEN_KEY, "true")
      return false
    })
  }, [])

  const startHold = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (open || more) return
      // Mouse: only the left button counts. Touch and pen have no opinion.
      if (event.pointerType === "mouse" && event.button !== 0) return
      // A drag that ends outside the button retargets its click to whatever
      // is underneath, so the click this flag is waiting for may never come.
      // Every fresh press is proof the last gesture is over.
      swallowClick.current = false
      const x = event.clientX
      const y = event.clientY
      const el = event.currentTarget
      drag.current = {
        startX: x,
        startY: y,
        from: offsetRef.current,
        home: measureHome(el, offsetRef.current),
        bounds: measureBounds(),
        moved: false,
        committed: false,
      }
      clearHoldTimers()
      if (collapseTimer.current) {
        clearTimeout(collapseTimer.current)
        collapseTimer.current = null
      }
      setOrigin({ x, y, size: reachFrom(x, y) * 2 })
      setStep(0)
      holdTimers.current = HOLD_STEPS.map((beat, index) =>
        setTimeout(() => {
          if (drag.current) drag.current.committed = true
          beat.haptic()
          setStep(index + 1)
          if (index === HOLD_STEPS.length - 1) {
            swallowClick.current = true
            retireHint()
            setMore(true)
          }
        }, beat.at)
      )
    },
    [open, more, clearHoldTimers, retireHint, measureBounds]
  )

  /**
   * The finger moved. Past the slop this is a drag, not a press: the hold is
   * called off, its circle goes home, and the button starts following.
   */
  const moveHold = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const held = drag.current
      if (!held) return
      const dy = event.clientY - held.startY
      if (!held.moved) {
        if (held.committed) return
        // Only vertical travel counts. A sideways swipe across the button is
        // going nowhere, so it should not cost the user their hold.
        if (Math.abs(dy) < DRAG_SLOP) return
        held.moved = true
        clearHoldTimers()
        collapse()
        setParking(false)
        setDragging(true)
        retireHint()
      }
      const next = resistOffset(
        { dx: 0, dy: held.from.dy + dy },
        held.home,
        held.bounds
      )
      offsetRef.current = next
      setOffset(next)
    },
    [clearHoldTimers, collapse, retireHint]
  )

  const endHold = useCallback(() => {
    clearHoldTimers()
    const held = drag.current
    drag.current = null
    if (held?.moved) {
      setDragging(false)
      // A drag ends in a click too, and a click here would open the fan.
      swallowClick.current = true
      park(held.home)
      return
    }
    // A finished hold keeps its circle — it is the page's background now.
    if (swallowClick.current || more) return
    collapse()
  }, [clearHoldTimers, collapse, more, park])

  const closeMore = useCallback(
    (then?: () => void) => {
      if (moreClosing) return
      setMoreClosing(true)
      setTimeout(() => {
        setMore(false)
        setMoreClosing(false)
        swallowClick.current = false
        then?.()
        collapse()
      }, 180)
    },
    [moreClosing, collapse]
  )

  useEffect(
    () => () => {
      holdTimers.current.forEach(clearTimeout)
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
      if (parkTimer.current) clearTimeout(parkTimer.current)
    },
    []
  )

  const dismiss = useCallback(
    (then?: () => void) => {
      if (timer.current) return
      setClosing(true)
      timer.current = setTimeout(() => {
        timer.current = null
        then?.()
        setOpen(false)
        setClosing(false)
      }, exitMs)
    },
    [exitMs]
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, dismiss])

  useEffect(() => {
    if (open) panelRef.current?.querySelector("button")?.focus()
  }, [open])

  const state = closing ? "closing" : "open"
  const holdScale = step > 0 ? HOLD_STEPS[step - 1].scale : 0

  return (
    <>
      {/* The safe-area probe: nothing to see, everything to measure. */}
      <span ref={probeRef} aria-hidden="true" className="app-inset-probe" />
      {origin && (
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
          <span
            aria-hidden="true"
            style={
              {
                "--hold-x": `${origin.x}px`,
                "--hold-y": `${origin.y}px`,
                "--hold-size": `${origin.size}px`,
                "--hold-scale": holdScale,
              } as CSSProperties
            }
            data-settled={more ? "true" : "false"}
            className="quick-add-reveal"
          />
        </div>
      )}
      {more && (
        <QuickAddMore closing={moreClosing} onClose={() => closeMore()} />
      )}
      {/* Parked above the week strip, not on it. At the old height the
          button sat on Sunday and its hint sat on the week's name; the strip
          is the last thing on the page and gets the bottom edge to itself. */}
      <button
        ref={triggerRef}
        type="button"
        data-drag={dragging ? "true" : parking ? "parking" : "false"}
        style={
          {
            "--fab-dy": `${offset.dy}px`,
            bottom: `calc(var(--app-safe-bottom-lg) + ${QUICK_ADD_TRIGGER_BOTTOM_REM}rem)`,
          } as CSSProperties
        }
        aria-label={
          open
            ? "Close quick add"
            : hinting
              ? `Quick add. ${HINT_TEXT}`
              : "Quick add"
        }
        aria-expanded={open}
        aria-busy={closing}
        data-open={open ? "true" : "false"}
        data-hint={hinting && !open ? "true" : "false"}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId)
          startHold(event)
        }}
        onPointerMove={moveHold}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false
            return
          }
          hapticSelection()
          retireHint()
          if (open) dismiss()
          else setOpen(true)
        }}
        className="coach-fab-trigger fixed right-[max(1rem,env(safe-area-inset-right,0px))] z-50 inline-flex h-12 w-12 touch-none items-center justify-center rounded-full text-background select-none"
      >
        <span aria-hidden="true" className="coach-fab-gloss" />
        {open ? (
          <X size={17} weight="bold" />
        ) : (
          <Plus size={19} weight="bold" />
        )}
      </button>
      {hinting && !open && (
        <div
          aria-hidden="true"
          // Above the button rather than beside it. Beside it, the line ran
          // the width of the screen straight across the ruler and whatever
          // hour was under it; above, it hangs over the empty right lane.
          className="coach-fab-hint-tip pointer-events-none fixed right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(var(--app-safe-bottom-lg)+13.75rem)] z-50 flex h-8 items-center"
        >
          <span className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] leading-none font-medium whitespace-nowrap shadow-[0_8px_22px_rgba(0,0,0,0.18)]">
            {HINT_TEXT}
          </span>
        </div>
      )}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close quick add"
            onClick={() => dismiss()}
            data-state={state}
            className="coach-fab-scrim fixed inset-0 z-40 cursor-default"
          />
          <div
            ref={panelRef}
            role="menu"
            aria-label="Quick add"
            data-state={state}
            style={
              {
                "--fab-dy": `${offset.dy}px`,
                bottom: `calc(var(--app-safe-bottom-lg) + ${QUICK_ADD_MENU_BOTTOM_REM}rem)`,
              } as CSSProperties
            }
            className="coach-fab-menu fixed right-[max(1rem,env(safe-area-inset-right,0px))] z-50 flex flex-col items-end gap-2"
          >
            {options.map((option, index) => (
              <button
                key={option.action + option.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  hapticTap()
                  dismiss(() => onChoose(option.action))
                }}
                // Out nearest-first, back in farthest-first: the stack unrolls
                // away from the button and folds back toward it.
                style={
                  {
                    "--fab-index": options.length - 1 - index,
                    "--fab-index-out": index,
                  } as CSSProperties
                }
                className="coach-fab-item motion-tactile flex items-center gap-2 disabled:opacity-45"
              >
                <span className="coach-fab-label rounded-full border border-border bg-card px-3 py-1.5 text-[13px] leading-none font-medium whitespace-nowrap shadow-[0_8px_22px_rgba(0,0,0,0.18)]">
                  {option.label}
                </span>
                <span className="coach-fab-icon flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-[0_8px_22px_rgba(0,0,0,0.18)]">
                  <option.icon
                    size={16}
                    weight="bold"
                    className="text-foreground"
                    aria-hidden="true"
                  />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
