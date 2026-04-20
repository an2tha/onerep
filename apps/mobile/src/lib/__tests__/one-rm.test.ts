import { describe, test, expect } from "bun:test"
import { epley1RM, brzycki1RM, estimate1RM, orm1RMBreakdown } from "../one-rm"

describe("epley1RM", () => {
  test("returns weight unchanged for 1 rep", () => {
    expect(epley1RM(100, 1)).toBe(100)
    expect(epley1RM(60, 1)).toBe(60)
  })

  test("calculates correctly for 5 reps", () => {
    // 100 × (1 + 5/30) = 100 × 1.1667 = 116.67
    expect(epley1RM(100, 5)).toBeCloseTo(116.67, 1)
  })

  test("calculates correctly for 10 reps", () => {
    // 80 × (1 + 10/30) = 80 × 1.333 = 106.67
    expect(epley1RM(80, 10)).toBeCloseTo(106.67, 1)
  })

  test("increases as reps increase (same weight)", () => {
    expect(epley1RM(100, 5)).toBeLessThan(epley1RM(100, 10))
    expect(epley1RM(100, 10)).toBeLessThan(epley1RM(100, 20))
  })

  test("increases as weight increases (same reps)", () => {
    expect(epley1RM(60, 5)).toBeLessThan(epley1RM(80, 5))
    expect(epley1RM(80, 5)).toBeLessThan(epley1RM(100, 5))
  })

  test("result is always ≥ input weight", () => {
    expect(epley1RM(100, 1)).toBeGreaterThanOrEqual(100)
    expect(epley1RM(100, 5)).toBeGreaterThanOrEqual(100)
  })
})

describe("brzycki1RM", () => {
  test("returns weight unchanged for 1 rep", () => {
    expect(brzycki1RM(100, 1)).toBe(100)
  })

  test("calculates correctly for 5 reps", () => {
    // 100 / (1.0278 - 0.0278×5) = 100 / 0.8888 ≈ 112.5
    expect(brzycki1RM(100, 5)).toBeCloseTo(112.5, 0)
  })

  test("calculates correctly for 10 reps", () => {
    // 80 / (1.0278 - 0.0278×10) = 80 / 0.75 ≈ 106.7
    expect(brzycki1RM(80, 10)).toBeCloseTo(106.7, 0)
  })

  test("falls back to Epley for reps ≥ 37", () => {
    expect(brzycki1RM(100, 37)).toBeCloseTo(epley1RM(100, 37), 5)
    expect(brzycki1RM(100, 50)).toBeCloseTo(epley1RM(100, 50), 5)
  })

  test("increases as reps increase (same weight)", () => {
    expect(brzycki1RM(100, 3)).toBeLessThan(brzycki1RM(100, 8))
  })

  test("result is always ≥ input weight", () => {
    expect(brzycki1RM(100, 1)).toBeGreaterThanOrEqual(100)
    expect(brzycki1RM(100, 10)).toBeGreaterThanOrEqual(100)
  })
})

describe("estimate1RM", () => {
  test("equals weight for 1 rep", () => {
    expect(estimate1RM(100, 1)).toBe(100)
  })

  test("is the average of Epley and Brzycki", () => {
    const e = epley1RM(100, 5)
    const b = brzycki1RM(100, 5)
    expect(estimate1RM(100, 5)).toBeCloseTo((e + b) / 2, 5)
  })

  test("is between Epley and Brzycki estimates", () => {
    for (const reps of [3, 5, 8, 10, 12]) {
      const e = epley1RM(100, reps)
      const b = brzycki1RM(100, reps)
      const est = estimate1RM(100, reps)
      expect(est).toBeGreaterThanOrEqual(Math.min(e, b))
      expect(est).toBeLessThanOrEqual(Math.max(e, b))
    }
  })

  test("increases with more reps at same weight", () => {
    expect(estimate1RM(100, 5)).toBeLessThan(estimate1RM(100, 10))
  })

  test("increases with more weight at same reps", () => {
    expect(estimate1RM(80, 5)).toBeLessThan(estimate1RM(100, 5))
  })
})

describe("orm1RMBreakdown", () => {
  test("returns entries for 100, 90, 80, 70, 60 percent", () => {
    const result = orm1RMBreakdown(100)
    expect(result.map((r) => r.pct)).toEqual([100, 90, 80, 70, 60])
  })

  test("100% entry equals the input 1RM", () => {
    expect(orm1RMBreakdown(150)[0].weight).toBe(150)
  })

  test("90% entry is 90% of 1RM", () => {
    expect(orm1RMBreakdown(200)[1].weight).toBeCloseTo(180, 5)
  })

  test("60% entry is 60% of 1RM", () => {
    expect(orm1RMBreakdown(100)[4].weight).toBeCloseTo(60, 5)
  })

  test("weights are in descending order", () => {
    const weights = orm1RMBreakdown(120).map((r) => r.weight)
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeLessThan(weights[i - 1])
    }
  })
})
