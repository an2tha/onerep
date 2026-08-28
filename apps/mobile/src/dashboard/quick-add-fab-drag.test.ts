import { describe, expect, test } from "bun:test"
import {
  boundsFrom,
  clampOffset,
  parkedOffset,
  resistOffset,
  type Bounds,
  type Home,
} from "@/dashboard/quick-add-fab"

// A 390×844 phone with the button in its home corner: 48pt square, 16pt from
// the right edge, sitting above the tab rail.
const HOME: Home = { left: 326, top: 720, width: 48, height: 48 }

/** A phone: no sidebar, a 68pt tab rail against the bottom. */
const PHONE: Bounds = boundsFrom({
  viewport: { width: 390, height: 844 },
  safe: { left: 0, right: 390, top: 0, bottom: 844 },
  sidebarRight: 0,
  tabBarTop: 776,
})

describe("the box the quick-add button lives in", () => {
  test("stops short of the desktop sidebar", () => {
    const desktop = boundsFrom({
      viewport: { width: 1440, height: 900 },
      safe: { left: 0, right: 1440, top: 0, bottom: 900 },
      sidebarRight: 256,
      tabBarTop: Number.POSITIVE_INFINITY,
    })
    expect(desktop.left).toBe(256 + 16)
    expect(desktop.bottom).toBe(900 - 16)
  })

  test("stops short of the mobile tab rail", () => {
    expect(PHONE.bottom).toBe(776 - 16)
  })

  test("respects safe-area insets when there is no chrome", () => {
    const landscape = boundsFrom({
      viewport: { width: 844, height: 390 },
      // A notch down the left, a home indicator along the bottom.
      safe: { left: 59, right: 844, top: 0, bottom: 369 },
      sidebarRight: 0,
      tabBarTop: Number.POSITIVE_INFINITY,
    })
    expect(landscape.left).toBe(59 + 16)
    expect(landscape.bottom).toBe(369 - 16)
  })
})

describe("dragging the quick-add button", () => {
  test("never leaves its column, however hard it is pulled", () => {
    expect(clampOffset({ dx: -9000, dy: 0 }, HOME, PHONE).dx).toBe(0)
    expect(clampOffset({ dx: 9000, dy: 0 }, HOME, PHONE).dx).toBe(0)
    expect(resistOffset({ dx: -9000, dy: 0 }, HOME, PHONE).dx).toBe(0)
    expect(parkedOffset({ dx: -9000, dy: 0 }, HOME, PHONE).dx).toBe(0)
  })

  test("stays between the status bar and the tab rail", () => {
    const up = clampOffset({ dx: 0, dy: -9000 }, HOME, PHONE)
    expect(HOME.top + up.dy).toBe(PHONE.top)

    const down = clampOffset({ dx: 0, dy: 9000 }, HOME, PHONE)
    expect(HOME.top + HOME.height + down.dy).toBe(PHONE.bottom)
  })

  test("leaves an in-bounds drag alone", () => {
    expect(clampOffset({ dx: 0, dy: -240 }, HOME, PHONE)).toEqual({
      dx: 0,
      dy: -240,
    })
    expect(resistOffset({ dx: 0, dy: -240 }, HOME, PHONE)).toEqual({
      dx: 0,
      dy: -240,
    })
  })

  test("gives back only a third of a drag past the end", () => {
    const limit = clampOffset({ dx: 0, dy: -9000 }, HOME, PHONE).dy
    const hauled = resistOffset({ dx: 0, dy: limit - 100 }, HOME, PHONE)
    expect(hauled.dy).toBeCloseTo(limit - 32, 5)
  })

  test("springs a rubber-banded drag back into bounds", () => {
    const limit = clampOffset({ dx: 0, dy: -9000 }, HOME, PHONE).dy
    expect(parkedOffset({ dx: 0, dy: limit - 100 }, HOME, PHONE).dy).toBe(limit)
  })

  test("keeps the height it was left at", () => {
    expect(parkedOffset({ dx: 0, dy: -240 }, HOME, PHONE).dy).toBe(-240)
  })

  test("hauls a restored offset back onto a smaller screen", () => {
    const rescued = parkedOffset({ dx: 0, dy: -2000 }, HOME, PHONE)
    expect(HOME.top + rescued.dy).toBe(PHONE.top)
  })
})

describe("a screen that measures as nothing", () => {
  // The safe-area probe is a styled element. When its rule went missing the
  // rect came back zero-sized at the origin, the bounds collapsed, and the
  // button was pinned hundreds of pixels above the screen — which is what
  // "the action button can slide out of view" looked like from the outside.
  test("collapsed bounds never invert into a pin", () => {
    const nothing = boundsFrom({
      viewport: { width: 390, height: 844 },
      safe: { left: 0, right: 0, top: 0, bottom: 0 },
      sidebarRight: 0,
      tabBarTop: Number.POSITIVE_INFINITY,
    })
    const parked = parkedOffset({ dx: 0, dy: 0 }, HOME, nothing)
    // Whatever it decides, it decides one thing, and the same thing every
    // time — not a range whose ends have crossed over.
    expect(parked).toEqual(clampOffset(parked, HOME, nothing))
    expect(Number.isFinite(parked.dy)).toBe(true)
  })
})
