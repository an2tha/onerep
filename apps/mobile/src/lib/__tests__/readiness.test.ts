import { describe, expect, test } from "bun:test"
import { computeReadiness } from "@/lib/readiness"

describe("computeReadiness", () => {
  test("full data blends check-in, fuel, and muscles with stated weights", () => {
    const result = computeReadiness({
      checkIn: { energy: 5, sleepQuality: 5, soreness: 1 },
      proteinProgress: 100,
      waterProgress: 100,
      muscleGroups: [{ status: "overdue" }, { status: "overdue" }],
    })
    expect(result.score).toBe(100)
    expect(result.label).toBe("Ready")
    const weights = result.components.map((component) => component.weight)
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(weights).toEqual([0.45, 0.3, 0.25])
  })

  test("missing check-in renormalizes weights instead of substituting", () => {
    const result = computeReadiness({
      checkIn: null,
      proteinProgress: 50,
      waterProgress: 50,
      muscleGroups: [],
    })
    const [checkIn, fuel, muscles] = result.components
    expect(checkIn.score).toBeNull()
    expect(checkIn.weight).toBe(0)
    expect(muscles.score).toBeNull()
    expect(fuel.weight).toBe(1)
    expect(result.score).toBe(50)
    expect(result.label).toBe("Steady")
  })

  test("muscle score scales with the share of recovering groups", () => {
    const result = computeReadiness({
      checkIn: null,
      proteinProgress: 0,
      waterProgress: 0,
      muscleGroups: [
        { status: "trained" },
        { status: "recovering" },
        { status: "overdue" },
        { status: "overdue" },
      ],
    })
    const muscles = result.components.find((c) => c.id === "muscles")!
    expect(muscles.score).toBe(60)
    expect(muscles.detail).toBe("2 of 4 groups still recovering")
  })

  test("poor inputs land in Recover with actionable advice", () => {
    const result = computeReadiness({
      checkIn: { energy: 1, sleepQuality: 1, soreness: 5 },
      proteinProgress: 10,
      waterProgress: 0,
      muscleGroups: [{ status: "trained" }],
    })
    expect(result.label).toBe("Recover")
    expect(result.advice).toBe("Reduce volume and prioritize recovery.")
  })

  test("progress inputs are clamped to 0–100", () => {
    const result = computeReadiness({
      checkIn: null,
      proteinProgress: 250,
      waterProgress: -20,
      muscleGroups: [],
    })
    const fuel = result.components.find((c) => c.id === "fuel")!
    expect(fuel.score).toBe(50)
    expect(fuel.detail).toBe("Protein 100% · water 0% of target")
  })
})
