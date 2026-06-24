import { describe, expect, test } from "bun:test"

import {
  filledWaterGlassCount,
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
})
