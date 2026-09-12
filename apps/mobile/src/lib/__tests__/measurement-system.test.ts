import { beforeEach, describe, expect, test } from "bun:test"
import {
  applyMeasurementSystem,
  distanceUnitForSystem,
  formatDistanceForUnit,
  formatElevationForSystem,
  formatPaceForUnit,
  formatSpeedForUnit,
  flOzToMl,
  formatQuantityAmount,
  formatWater,
  formatWaterPair,
  gramsToOz,
  mlToFlOz,
  ozToGrams,
  quantityLabel,
  quantityUnitForSystem,
  readMeasurementSystem,
  waterUnitForSystem,
  writeMeasurementSystem,
} from "../measurement-system"
import { cacheWeightUnit, readCachedWeightUnit } from "../use-weight-unit"
import { cacheEnergyUnit } from "../use-energy-unit"
import {
  cacheWaterUnit,
  clearExplicitWaterUnit,
  readCachedWaterUnit,
  setActiveWaterAccount,
  waterUnitIsExplicit,
} from "../use-water-unit"

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  clear() {
    this.map.clear()
  }
}
;(globalThis as Record<string, unknown>).localStorage = new MemoryStorage()

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: Storage }).localStorage.clear()
  writeMeasurementSystem("metric")
})

describe("measurement system storage", () => {
  test("defaults to metric", () => {
    expect(readMeasurementSystem()).toBe("metric")
  })

  test("a stored imperial choice is read back", () => {
    writeMeasurementSystem("imperial")
    expect(readMeasurementSystem()).toBe("imperial")
  })
})

describe("applyMeasurementSystem", () => {
  test("imperial sets lb + Cal caches in one step", () => {
    applyMeasurementSystem("imperial")
    expect(readCachedWeightUnit()).toBe("lbs")
    // The cache keys agree: energy cache now answers cal.
    expect(readMeasurementSystem()).toBe("imperial")
  })

  test("metric sets kg", () => {
    applyMeasurementSystem("imperial")
    applyMeasurementSystem("metric")
    expect(readCachedWeightUnit()).toBe("kg")
    expect(readMeasurementSystem()).toBe("metric")
  })

  test("existing weight cache hook still agrees after apply", () => {
    cacheWeightUnit("kg")
    applyMeasurementSystem("imperial")
    expect(readCachedWeightUnit()).toBe("lbs")
    cacheEnergyUnit("kJ")
    applyMeasurementSystem("metric")
    expect(readCachedWeightUnit()).toBe("kg")
  })

  test("water cache is scoped to the active account", () => {
    setActiveWaterAccount("account-a")
    cacheWaterUnit("fl oz", true)
    setActiveWaterAccount("account-b")
    expect(readCachedWaterUnit()).toBe("ml")
    expect(waterUnitIsExplicit()).toBe(false)
    cacheWaterUnit("ml", true)
    setActiveWaterAccount("account-a")
    expect(readCachedWaterUnit()).toBe("fl oz")
    expect(waterUnitIsExplicit()).toBe(true)
    setActiveWaterAccount(null)
  })

  test("water default follows the system until the user picks a unit", () => {
    applyMeasurementSystem("imperial")
    expect(readCachedWaterUnit()).toBe("fl oz")
    // A deliberate ml choice survives the master switch.
    cacheWaterUnit("ml", true)
    expect(waterUnitIsExplicit()).toBe(true)
    applyMeasurementSystem("metric")
    expect(readCachedWaterUnit()).toBe("ml")
    // Without an explicit choice, the default tracks the system again.
    clearExplicitWaterUnit()
    applyMeasurementSystem("metric")
    expect(readCachedWaterUnit()).toBe("ml")
    applyMeasurementSystem("imperial")
    expect(readCachedWaterUnit()).toBe("fl oz")
  })
})

describe("derived units", () => {
  test("distance: imperial → mi, metric → km", () => {
    expect(distanceUnitForSystem("imperial")).toBe("mi")
    expect(distanceUnitForSystem("metric")).toBe("km")
  })

  test("water unit follows the system as a default", () => {
    expect(waterUnitForSystem("imperial")).toBe("fl oz")
    expect(waterUnitForSystem("metric")).toBe("ml")
  })
})

describe("workout distance formatting", () => {
  test("uses kilometres and metres for metric distances", () => {
    expect(formatDistanceForUnit(500, "km")).toBe("500 m")
    expect(formatDistanceForUnit(5_000, "km")).toBe("5.0 km")
  })

  test("uses miles for imperial distances and speed", () => {
    expect(formatDistanceForUnit(1_609.344, "mi")).toBe("1.0 mi")
    expect(formatPaceForUnit(300, "mi")).toBe("8:03 /mi")
    expect(formatSpeedForUnit(1_609.344, 600, "mi")).toBe("6.0 mi/h")
  })

  test("converts elevation with the measurement system", () => {
    expect(formatElevationForSystem(100, "metric")).toBe("100 m")
    expect(formatElevationForSystem(100, "imperial")).toBe("328 ft")
  })
})

describe("water formatting", () => {
  test("ml renders ml below a liter and liters at or above", () => {
    expect(formatWater(250, "ml")).toBe("250 ml")
    expect(formatWater(1000, "ml")).toBe("1 L")
    expect(formatWater(1500, "ml")).toBe("1.5 L")
  })

  test("fl oz renders fl oz at a tenth-ounce resolution", () => {
    // 250 ml ≈ 8.45 fl oz
    expect(formatWater(250, "fl oz")).toBe("8.5 fl oz")
    // 1000 ml ≈ 33.8 fl oz (whole-number rounding only kicks in at 100+)
    expect(formatWater(1000, "fl oz")).toBe("33.8 fl oz")
  })

  test("fl oz conversion round-trips", () => {
    const ml = 29.5735
    expect(mlToFlOz(ml)).toBeCloseTo(1, 6)
    expect(flOzToMl(1)).toBeCloseTo(29.5735, 6)
    expect(flOzToMl(mlToFlOz(1234))).toBeCloseTo(1234, 3)
  })

  test("formatWaterPair keeps both operands in one unit", () => {
    // Sub-liter goal anchors ml for both sides (the "0.25 / 500 ml" bug)
    expect(formatWaterPair(250, 500, "ml")).toEqual({
      total: "250 ml",
      goal: "500 ml",
    })
    // Liter-scale goal keeps both in liters, including a sub-liter total.
    expect(formatWaterPair(250, 2000, "ml")).toEqual({
      total: "0.25 L",
      goal: "2 L",
    })
    expect(formatWaterPair(1000, 2000, "ml")).toEqual({
      total: "1 L",
      goal: "2 L",
    })
    // fl oz never mixes magnitudes
    expect(formatWaterPair(250, 2000, "fl oz")).toEqual({
      total: "8.5 fl oz",
      goal: "67.6 fl oz",
    })
  })
})

describe("food quantity formatting", () => {
  test("metric keeps the exact grams formatting", () => {
    expect(formatQuantityAmount(100, "metric")).toBe("100")
    expect(formatQuantityAmount(87.5, "metric")).toBe("87.5")
    expect(quantityUnitForSystem("metric")).toBe("g")
  })

  test("imperial converts grams to ounces at a tenth-ounce resolution", () => {
    expect(quantityUnitForSystem("imperial")).toBe("oz")
    // 100 g ≈ 3.527 oz → shows 3.5
    expect(formatQuantityAmount(100, "imperial")).toBe("3.5")
    // A whole ounce stays whole (no trailing .0)
    expect(formatQuantityAmount(28.3495, "imperial")).toBe("1")
    expect(formatQuantityAmount(226.796, "imperial")).toBe("8")
  })

  test("typed ounces convert back to grams within rounding", () => {
    // 3.5 oz typed → 99.22 g, rounds back to the same displayed 3.5 oz
    const grams = ozToGrams(3.5)
    expect(formatQuantityAmount(grams, "imperial")).toBe("3.5")
    expect(gramsToOz(ozToGrams(6))).toBeCloseTo(6, 9)
  })

  test("quantityLabel prints number and unit together", () => {
    expect(quantityLabel(250, "metric")).toBe("250 g")
    expect(quantityLabel(250, "imperial")).toBe("8.8 oz")
  })
})
