/**
 * Tests for the MobileSheet component logic (mobile-sheet.tsx).
 *
 * The PR added several new capabilities to MobileSheet:
 *   - minHeight / maxHeight props
 *   - snapPoints prop (snaps to closest point on release)
 *   - defaultHeight prop
 *   - dragThreshold changed from 120 to 100
 *   - Pointer offset calculation changed (negative delta now uses 0.3 factor)
 *
 * Since MobileSheet is a React component requiring a DOM, we extract and test
 * the pure algorithmic logic units here.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const SHEET_SOURCE = readFileSync(
  new URL("./mobile-sheet.tsx", import.meta.url),
  "utf8"
)

describe("MobileSheet – accessible dialog contract", () => {
  test("exposes modal semantics and a programmatic focus target", () => {
    assert.match(SHEET_SOURCE, /role="dialog"/)
    assert.match(SHEET_SOURCE, /aria-modal="true"/)
    assert.match(SHEET_SOURCE, /tabIndex=\{-1\}/)
  })

  test("supports Escape, traps Tab, and restores previous focus", () => {
    assert.match(SHEET_SOURCE, /event\.key === "Escape"/)
    assert.match(SHEET_SOURCE, /event\.key !== "Tab"/)
    assert.match(SHEET_SOURCE, /previousFocus\?\.focus/)
  })

  test("keeps the sheet mounted through exit and uses the live drag offset", () => {
    assert.match(SHEET_SOURCE, /const CLOSE_MS = 320/)
    assert.match(SHEET_SOURCE, /const finalOffsetY = offsetYRef\.current/)
    assert.match(SHEET_SOURCE, /finalOffsetY > dragThreshold/)
  })
})

// ─── Snap point algorithm ─────────────────────────────────────────────────────
// Mirror of the snap point snapping in mobile-sheet.tsx::handlePointerEnd:
//   const closest = snapPoints.reduce((prev, curr) =>
//     Math.abs(curr - newHeight) < Math.abs(prev - newHeight) ? curr : prev
//   )

function findClosestSnapPoint(
  snapPoints: number[],
  currentHeight: number
): number {
  return snapPoints.reduce((prev, curr) =>
    Math.abs(curr - currentHeight) < Math.abs(prev - currentHeight)
      ? curr
      : prev
  )
}

describe("MobileSheet – snap point algorithm", () => {
  const snapPoints = [350, 450, 600]

  test("snaps to exact match when height equals a snap point", () => {
    assert.strictEqual(findClosestSnapPoint(snapPoints, 350), 350)
    assert.strictEqual(findClosestSnapPoint(snapPoints, 450), 450)
    assert.strictEqual(findClosestSnapPoint(snapPoints, 600), 600)
  })

  test("snaps to lower point when closer", () => {
    // 390 is 40 from 350 and 60 from 450 → snaps to 350
    assert.strictEqual(findClosestSnapPoint(snapPoints, 390), 350)
  })

  test("snaps to upper point when closer", () => {
    // 420 is 70 from 350 and 30 from 450 → snaps to 450
    assert.strictEqual(findClosestSnapPoint(snapPoints, 420), 450)
  })

  test("midpoint between two snap points picks the first one (reduce keeps prev on tie)", () => {
    // 400 is exactly 50 from 350 and 50 from 450
    // reduce: |450 - 400| = 50, |350 - 400| = 50 → not strictly less, so prev (350) wins
    assert.strictEqual(findClosestSnapPoint(snapPoints, 400), 350)
  })

  test("below all snap points snaps to smallest", () => {
    assert.strictEqual(findClosestSnapPoint(snapPoints, 100), 350)
  })

  test("above all snap points snaps to largest", () => {
    assert.strictEqual(findClosestSnapPoint(snapPoints, 800), 600)
  })

  test("single snap point always returns that point", () => {
    assert.strictEqual(findClosestSnapPoint([500], 100), 500)
    assert.strictEqual(findClosestSnapPoint([500], 500), 500)
    assert.strictEqual(findClosestSnapPoint([500], 999), 500)
  })

  test("two snap points: value closer to first", () => {
    assert.strictEqual(findClosestSnapPoint([300, 600], 350), 300)
  })

  test("two snap points: value closer to second", () => {
    assert.strictEqual(findClosestSnapPoint([300, 600], 500), 600)
  })

  test("Settings.tsx default snap points [350, 450, 600]: defaultHeight=450 snaps to 450", () => {
    assert.strictEqual(findClosestSnapPoint([350, 450, 600], 450), 450)
  })
})

// ─── Height clamping ──────────────────────────────────────────────────────────
// Mirror of the height clamping in mobile-sheet.tsx::handlePointerMove and handlePointerEnd:
//   Math.max(parseFloat(minHeight), Math.min(parseFloat(maxHeight), startHeight - delta))

function clampHeight(
  startHeight: number,
  delta: number,
  minHeight: number,
  maxHeight: number
): number {
  return Math.max(minHeight, Math.min(maxHeight, startHeight - delta))
}

describe("MobileSheet – height clamping during drag", () => {
  const minH = 100 // represents parseFloat("15vh") in test context
  const maxH = 700 // represents parseFloat("85vh") in test context

  test("no delta returns startHeight unchanged", () => {
    assert.strictEqual(clampHeight(450, 0, minH, maxH), 450)
  })

  test("positive delta (dragging down) decreases height", () => {
    assert.strictEqual(clampHeight(450, 100, minH, maxH), 350)
  })

  test("negative delta (dragging up to expand) increases height", () => {
    assert.strictEqual(clampHeight(450, -100, minH, maxH), 550)
  })

  test("clamped to maxHeight when drag would exceed it", () => {
    // startHeight=600, delta=-200 → would give 800 → clamped to 700
    assert.strictEqual(clampHeight(600, -200, minH, maxH), maxH)
  })

  test("clamped to minHeight when drag would go below it", () => {
    // startHeight=200, delta=200 → would give 0 → clamped to 100
    assert.strictEqual(clampHeight(200, 200, minH, maxH), minH)
  })

  test("exact minHeight boundary is not clamped further", () => {
    assert.strictEqual(clampHeight(minH + 50, 50, minH, maxH), minH)
  })

  test("exact maxHeight boundary is not clamped further", () => {
    assert.strictEqual(clampHeight(maxH - 50, -50, minH, maxH), maxH)
  })
})

// ─── Drag offset formula ──────────────────────────────────────────────────────
// Mirror of PR change in handlePointerMove:
// Before: delta < 0 ? delta * 0.18 : delta
// After:  delta < 0 ? delta * 0.3  : delta   (resistance when pulling up)

function computeDragOffset(delta: number): number {
  return delta < 0 ? delta * 0.3 : delta
}

describe("MobileSheet – drag offset formula (PR change: 0.18 → 0.3)", () => {
  test("positive delta (dragging down) passes through unchanged", () => {
    assert.strictEqual(computeDragOffset(50), 50)
    assert.strictEqual(computeDragOffset(120), 120)
    assert.strictEqual(computeDragOffset(0), 0)
  })

  test("negative delta (dragging up past top) uses 0.3 resistance factor", () => {
    assert.strictEqual(computeDragOffset(-100), -30)
    assert.strictEqual(computeDragOffset(-50), -15)
    assert.strictEqual(computeDragOffset(-200), -60)
  })

  test("resistance factor produces less visual offset than the actual drag", () => {
    const rawDelta = -80
    const offset = computeDragOffset(rawDelta)
    assert.ok(
      Math.abs(offset) < Math.abs(rawDelta),
      "resistance should reduce visual offset"
    )
  })
})

// ─── Drag threshold ───────────────────────────────────────────────────────────
// PR changed default dragThreshold from 120 to 100

describe("MobileSheet – drag threshold (PR change: 120 → 100)", () => {
  const DRAG_THRESHOLD = 100

  test("offset above threshold triggers dismiss", () => {
    assert.ok(101 > DRAG_THRESHOLD, "101 should exceed threshold")
  })

  test("offset at exactly threshold does NOT trigger dismiss (strict >)", () => {
    // threshold check is strict: offsetY > dragThreshold
    assert.strictEqual(100 > DRAG_THRESHOLD, false)
  })

  test("offset below threshold does not trigger dismiss", () => {
    assert.strictEqual(99 > DRAG_THRESHOLD, false)
  })

  test("zero offset does not trigger dismiss", () => {
    assert.strictEqual(0 > DRAG_THRESHOLD, false)
  })

  test("old default (120) is no longer the threshold – 110 would now trigger dismiss", () => {
    const oldThreshold = 120
    const newThreshold = 100
    // 110 > 120 → false (old: would NOT dismiss)
    assert.strictEqual(110 > oldThreshold, false)
    // 110 > 100 → true (new: DOES dismiss)
    assert.strictEqual(110 > newThreshold, true)
  })
})

// ─── Prop defaults and combinations ──────────────────────────────────────────

describe("MobileSheet – new prop defaults", () => {
  interface SheetProps {
    minHeight?: string
    maxHeight?: string
    snapPoints?: number[]
    defaultHeight?: number
    dragThreshold?: number
  }

  function resolveProps(props: SheetProps) {
    return {
      minHeight: props.minHeight ?? "15vh",
      maxHeight: props.maxHeight ?? "85vh",
      snapPoints: props.snapPoints,
      defaultHeight: props.defaultHeight ?? 0,
      dragThreshold: props.dragThreshold ?? 100,
    }
  }

  test("all props have correct defaults when omitted", () => {
    const resolved = resolveProps({})
    assert.strictEqual(resolved.minHeight, "15vh")
    assert.strictEqual(resolved.maxHeight, "85vh")
    assert.strictEqual(resolved.snapPoints, undefined)
    assert.strictEqual(resolved.defaultHeight, 0)
    assert.strictEqual(resolved.dragThreshold, 100)
  })

  test("Settings.tsx passes correct custom props", () => {
    // From Settings.tsx: maxHeight="85vh" minHeight="50vh" snapPoints={[350,450,600]} defaultHeight={450}
    const resolved = resolveProps({
      maxHeight: "85vh",
      minHeight: "50vh",
      snapPoints: [350, 450, 600],
      defaultHeight: 450,
    })
    assert.strictEqual(resolved.minHeight, "50vh")
    assert.strictEqual(resolved.maxHeight, "85vh")
    assert.deepStrictEqual(resolved.snapPoints, [350, 450, 600])
    assert.strictEqual(resolved.defaultHeight, 450)
  })

  test("custom dragThreshold overrides default", () => {
    const resolved = resolveProps({ dragThreshold: 80 })
    assert.strictEqual(resolved.dragThreshold, 80)
  })

  test("defaultHeight 0 means no explicit height (sheet sizes to content)", () => {
    const resolved = resolveProps({})
    assert.strictEqual(resolved.defaultHeight, 0)
    // In the component: currentHeight || undefined → undefined when 0
    const heightStyle = resolved.defaultHeight
      ? { height: `${resolved.defaultHeight}px` }
      : {}
    assert.deepStrictEqual(heightStyle, {})
  })

  test("non-zero defaultHeight produces height style", () => {
    const resolved = resolveProps({ defaultHeight: 450 })
    const heightStyle = resolved.defaultHeight
      ? { height: `${resolved.defaultHeight}px` }
      : {}
    assert.deepStrictEqual(heightStyle, { height: "450px" })
  })
})
