import { describe, test, expect } from "bun:test"
import { rollingAvg, sparklinePoints } from "../progress-metrics"

describe("rollingAvg", () => {
  test("single element returns itself", () => {
    expect(rollingAvg([42], 7)).toEqual([42])
  })

  test("window of 1 returns the input unchanged", () => {
    const input = [10, 20, 30, 40]
    expect(rollingAvg(input, 1)).toEqual(input)
  })

  test("window larger than array uses all available values", () => {
    // [10, 20, 30] with window=7 → [10, 15, 20]
    expect(rollingAvg([10, 20, 30], 7)).toEqual([10, 15, 20])
  })

  test("window=2 computes pair-wise trailing average", () => {
    // [10, 20, 30] → [10, 15, 25]
    expect(rollingAvg([10, 20, 30], 2)).toEqual([10, 15, 25])
  })

  test("window=3 trailing average", () => {
    // [10, 20, 30, 40, 50] window=3
    // idx0: [10] → 10
    // idx1: [10,20] → 15
    // idx2: [10,20,30] → 20
    // idx3: [20,30,40] → 30
    // idx4: [30,40,50] → 40
    expect(rollingAvg([10, 20, 30, 40, 50], 3)).toEqual([10, 15, 20, 30, 40])
  })

  test("returns same length as input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7]
    expect(rollingAvg(input, 7)).toHaveLength(input.length)
  })

  test("last value equals mean of last window elements", () => {
    const values = [60, 65, 70, 75, 80, 85, 90]
    const result = rollingAvg(values, 7)
    const expectedLast = values.reduce((a, b) => a + b, 0) / 7
    expect(result[result.length - 1]).toBeCloseTo(expectedLast, 5)
  })

  test("throws for window < 1", () => {
    expect(() => rollingAvg([1, 2, 3], 0)).toThrow()
  })

  test("handles flat series (all same value)", () => {
    const result = rollingAvg([50, 50, 50, 50], 3)
    expect(result).toEqual([50, 50, 50, 50])
  })

  test("smooths a noisy series (last value < spike)", () => {
    // Spike at index 3 should be pulled down by the average
    const noisy = [70, 71, 70, 90, 71, 70]
    const smoothed = rollingAvg(noisy, 3)
    // At the spike: avg([70,71,90]) = 77, less than 90
    expect(smoothed[3]).toBeLessThan(90)
    expect(smoothed[3]).toBeGreaterThan(70)
  })
})

describe("sparklinePoints", () => {
  test("returns empty string for empty array", () => {
    expect(sparklinePoints([], 240, 96)).toBe("")
  })

  test("single value is placed at horizontal center", () => {
    const pts = sparklinePoints([50], 240, 96)
    // "120,y" — x should be width/2
    expect(pts.startsWith("120,")).toBe(true)
  })

  test("two values span full width", () => {
    const pts = sparklinePoints([10, 20], 240, 96)
    const [first, second] = pts.split(" ")
    expect(first.split(",")[0]).toBe("0")       // leftmost x = 0
    expect(second.split(",")[0]).toBe("240")    // rightmost x = width
  })

  test("minimum value is at the bottom (max y)", () => {
    // min is index 0, max is index 1
    const pts = sparklinePoints([0, 100], 240, 96)
    const [minPt, maxPt] = pts.split(" ")
    const minY = parseFloat(minPt.split(",")[1])
    const maxY = parseFloat(maxPt.split(",")[1])
    expect(minY).toBeGreaterThan(maxY) // SVG y increases downward
  })

  test("maximum value is at the top (min y)", () => {
    const pts = sparklinePoints([100, 0], 240, 96)
    const [maxPt, minPt] = pts.split(" ")
    const maxY = parseFloat(maxPt.split(",")[1])
    const minY = parseFloat(minPt.split(",")[1])
    expect(maxY).toBeLessThan(minY)
  })

  test("all-equal values all share the same y", () => {
    const pts = sparklinePoints([50, 50, 50, 50], 240, 96)
    const ys = pts.split(" ").map((p) => p.split(",")[1])
    expect(new Set(ys).size).toBe(1)
  })

  test("produces correct number of space-separated points", () => {
    const values = [10, 20, 30, 40, 50]
    const pts = sparklinePoints(values, 240, 96)
    expect(pts.split(" ")).toHaveLength(values.length)
  })

  test("x coordinates are evenly spaced for uniform input", () => {
    const pts = sparklinePoints([1, 2, 3, 4, 5], 200, 80)
    const xs = pts.split(" ").map((p) => parseFloat(p.split(",")[0]))
    const gaps = xs.slice(1).map((x, i) => x - xs[i])
    // All gaps should be equal (50 each for 5 points over width 200)
    gaps.forEach((gap) => expect(gap).toBeCloseTo(50, 5))
  })
})
