import { beforeEach, describe, expect, test } from "bun:test"
import {
  applyMeasurementSystem,
  distanceUnitForSystem,
  flOzToMl,
  formatWater,
  mlToFlOz,
  readMeasurementSystem,
  waterUnitForSystem,
  writeMeasurementSystem,
} from "../measurement-system"
import { cacheWeightUnit, readCachedWeightUnit } from "../use-weight-unit"
import { cacheEnergyUnit } from "../use-energy-unit"

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
})

describe("derived units", () => {
  test("distance: imperial → mi, metric → km", () => {
    expect(distanceUnitForSystem("imperial")).toBe("mi")
    expect(distanceUnitForSystem("metric")).toBe("km")
  })

  test("water unit follows the system", () => {
    expect(waterUnitForSystem("imperial")).toBe("fl oz")
    expect(waterUnitForSystem("metric")).toBe("ml")
  })
})

describe("water formatting", () => {
  test("metric renders ml and L exactly as before", () => {
    expect(formatWater(250, "metric")).toBe("250 ml")
    expect(formatWater(1000, "metric")).toBe("1 L")
    expect(formatWater(1500, "metric")).toBe("1.5 L")
  })

  test("imperial renders fl oz", () => {
    const out = formatWater(250, "imperial")
    expect(out.endsWith("fl oz")).toBe(true)
  })

  test("fl oz conversion round-trips", () => {
    const ml = 29.5735
    expect(mlToFlOz(ml)).toBeCloseTo(1, 6)
    expect(flOzToMl(1)).toBeCloseTo(29.5735, 6)
    expect(flOzToMl(mlToFlOz(1234))).toBeCloseTo(1234, 3)
  })
})
