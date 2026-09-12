import { describe, expect, test } from "bun:test"

import {
  filledWaterGlassCount,
  nextGlassAmount,
  waterAmountNeededForGlass,
  WATER_GLASS_COUNT,
  waterGlassTargetMl,
} from "../water-glasses"

describe("water glass dashboard helpers", () => {
  test("maps half of the default 2500 ml goal to a clean four-glass row", () => {
    expect(filledWaterGlassCount(1250, 2500)).toBe(4)
  })

  test("uses proportional glass targets instead of accumulating rounded per-glass amounts", () => {
    expect(waterGlassTargetMl(2500, 4)).toBe(1250)
    expect(waterGlassTargetMl(2500, WATER_GLASS_COUNT)).toBe(2500)
  })

  test("returns the amount needed to fill forward to a clicked glass", () => {
    expect(waterAmountNeededForGlass(500, 2500, 4)).toBe(750)
  })

  test("caps filled glasses at the full grid when total passes the goal", () => {
    expect(filledWaterGlassCount(2750, 2500)).toBe(WATER_GLASS_COUNT)
  })

  test("rounds each cumulative target up, so a fractional eighth is still reachable", () => {
    // 250 ml / 8 = 31.25 ml. Rounded to nearest, glass one lands at 31 ml while
    // the grid still reads zero filled — the next tap then computes a 0 ml
    // difference and logs nothing.
    expect(waterGlassTargetMl(250, 1)).toBe(32)
    expect(filledWaterGlassCount(32, 250)).toBe(1)
    expect(waterAmountNeededForGlass(0, 250, 1)).toBeGreaterThan(0)

    // Every one of the eight thresholds has to trip its own glass.
    for (let count = 1; count <= WATER_GLASS_COUNT; count += 1) {
      expect(filledWaterGlassCount(waterGlassTargetMl(250, count), 250)).toBe(
        count
      )
    }
  })

  test("computes the next tap from the effective total, not the last sync", () => {
    // Two taps back to back with the server still at 0: the first fills to
    // glass one, the second must add only the difference to glass two.
    const first = nextGlassAmount(0, 2500, 0)
    expect(first).toBe(313)
    expect(nextGlassAmount(first, 2500, 1)).toBe(312)
    expect(first + nextGlassAmount(first, 2500, 1)).toBe(625)

    // A full row keeps pouring the last glass's worth instead of computing
    // against a cap it can never exceed.
    expect(nextGlassAmount(2600, 2500, WATER_GLASS_COUNT)).toBe(313)
  })
})
