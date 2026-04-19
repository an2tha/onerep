import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { estimateOnboardingCalories } from "./estimateOnboardingCalories.ts"

// ─── Goal mapping ─────────────────────────────────────────────────────────────

describe("estimateOnboardingCalories – goal mapping", () => {
  const baseInput = { age: 25, heightCm: 170 }

  test('"lose" goal subtracts 280 from base', () => {
    const result = estimateOnboardingCalories({ ...baseInput, goal: "lose" })
    const base = Math.round(1500 + baseInput.heightCm * 2.8 - baseInput.age * 3.2)
    const expected = Math.max(1400, base - 280)
    assert.strictEqual(result.targetCalories, expected)
  })

  test('"build" goal adds 240 to base', () => {
    const result = estimateOnboardingCalories({ ...baseInput, goal: "build" })
    const base = Math.round(1500 + baseInput.heightCm * 2.8 - baseInput.age * 3.2)
    const expected = Math.max(1400, base + 240)
    assert.strictEqual(result.targetCalories, expected)
  })

  test('"performance" goal adds 240 to base (same as build)', () => {
    const buildResult = estimateOnboardingCalories({ ...baseInput, goal: "build" })
    const perfResult = estimateOnboardingCalories({ ...baseInput, goal: "performance" })
    assert.strictEqual(perfResult.targetCalories, buildResult.targetCalories)
    assert.strictEqual(perfResult.bmr, buildResult.bmr)
    assert.strictEqual(perfResult.tdee, buildResult.tdee)
  })

  test('"maintain" goal has 0 delta', () => {
    const result = estimateOnboardingCalories({ ...baseInput, goal: "maintain" })
    const base = Math.round(1500 + baseInput.heightCm * 2.8 - baseInput.age * 3.2)
    const expected = Math.max(1400, base)
    assert.strictEqual(result.targetCalories, expected)
  })

  test('unknown goal maps to maintain (0 delta)', () => {
    const maintain = estimateOnboardingCalories({ ...baseInput, goal: "maintain" })
    const unknown = estimateOnboardingCalories({ ...baseInput, goal: "something_else" })
    assert.strictEqual(unknown.targetCalories, maintain.targetCalories)
  })

  test('"tone" goal maps to maintain (0 delta)', () => {
    const maintain = estimateOnboardingCalories({ ...baseInput, goal: "maintain" })
    const tone = estimateOnboardingCalories({ ...baseInput, goal: "tone" })
    assert.strictEqual(tone.targetCalories, maintain.targetCalories)
  })
})

// ─── BMR floor ────────────────────────────────────────────────────────────────

describe("estimateOnboardingCalories – BMR floor at 1200", () => {
  test("BMR is never below 1200", () => {
    const result = estimateOnboardingCalories({ age: 80, heightCm: 140, goal: "maintain" })
    assert.ok(result.bmr >= 1200, "BMR should not go below 1200")
  })

  test("BMR reaches floor of 1200 for extreme inputs", () => {
    // age=100, heightCm=50: base = round(1500 + 140 - 320) = round(1320) = 1320
    // bmr = max(1200, 1320 - 220) = max(1200, 1100) = 1200
    const result = estimateOnboardingCalories({ age: 100, heightCm: 50, goal: "maintain" })
    assert.strictEqual(result.bmr, 1200)
  })
})

// ─── targetCalories floor ─────────────────────────────────────────────────────

describe("estimateOnboardingCalories – targetCalories floor at 1400", () => {
  test("targetCalories is never below 1400", () => {
    // age=90, heightCm=50, goal=lose
    // base = round(1500 + 140 - 288) = round(1352) = 1352
    // targetCalories = max(1400, 1352 - 280) = max(1400, 1072) = 1400
    const result = estimateOnboardingCalories({ age: 90, heightCm: 50, goal: "lose" })
    assert.strictEqual(result.targetCalories, 1400)
  })

  test("normal inputs don't hit the targetCalories floor", () => {
    const result = estimateOnboardingCalories({ age: 25, heightCm: 170, goal: "maintain" })
    assert.ok(result.targetCalories > 1400, "normal inputs should exceed the 1400 floor")
  })
})

// ─── TDEE calculation ─────────────────────────────────────────────────────────

describe("estimateOnboardingCalories – TDEE", () => {
  test("TDEE is max(base+120, bmr+400)", () => {
    const input = { age: 25, heightCm: 175, goal: "maintain" }
    const result = estimateOnboardingCalories(input)
    const base = Math.round(1500 + input.heightCm * 2.8 - input.age * 3.2)
    const bmr = Math.max(1200, base - 220)
    const expected = Math.max(base + 120, bmr + 400)
    assert.strictEqual(result.tdee, expected)
  })

  test("TDEE is always greater than BMR", () => {
    const result = estimateOnboardingCalories({ age: 25, heightCm: 170, goal: "maintain" })
    assert.ok(result.tdee > result.bmr, "TDEE should exceed BMR")
  })
})

// ─── Macros ───────────────────────────────────────────────────────────────────

describe("estimateOnboardingCalories – macros", () => {
  test("protein is 30% of targetCalories / 4 (rounded)", () => {
    const result = estimateOnboardingCalories({ age: 30, heightCm: 165, goal: "maintain" })
    assert.strictEqual(result.protein, Math.round((result.targetCalories * 0.3) / 4))
  })

  test("carbs is 40% of targetCalories / 4 (rounded)", () => {
    const result = estimateOnboardingCalories({ age: 30, heightCm: 165, goal: "maintain" })
    assert.strictEqual(result.carbs, Math.round((result.targetCalories * 0.4) / 4))
  })

  test("fat is 30% of targetCalories / 9 (rounded)", () => {
    const result = estimateOnboardingCalories({ age: 30, heightCm: 165, goal: "maintain" })
    assert.strictEqual(result.fat, Math.round((result.targetCalories * 0.3) / 9))
  })

  test("all macro values are positive integers", () => {
    const result = estimateOnboardingCalories({ age: 30, heightCm: 165, goal: "maintain" })
    assert.ok(Number.isInteger(result.protein), "protein should be integer")
    assert.ok(Number.isInteger(result.carbs), "carbs should be integer")
    assert.ok(Number.isInteger(result.fat), "fat should be integer")
    assert.ok(result.protein > 0, "protein should be positive")
    assert.ok(result.carbs > 0, "carbs should be positive")
    assert.ok(result.fat > 0, "fat should be positive")
  })
})

// ─── Integration scenarios ───────────────────────────────────────────────────

describe("estimateOnboardingCalories – integration", () => {
  test("age 25, height 170cm, lose goal – full calculation", () => {
    // base = round(1500 + 170*2.8 - 25*3.2) = round(1500 + 476 - 80) = round(1896) = 1896
    // bmr = max(1200, 1896-220) = max(1200, 1676) = 1676
    // tdee = max(1896+120, 1676+400) = max(2016, 2076) = 2076
    // targetCalories = max(1400, 1896-280) = max(1400, 1616) = 1616
    const result = estimateOnboardingCalories({ age: 25, heightCm: 170, goal: "lose" })
    assert.strictEqual(result.bmr, 1676)
    assert.strictEqual(result.tdee, 2076)
    assert.strictEqual(result.targetCalories, 1616)
  })

  test("age 30, height 180cm, build goal – full calculation", () => {
    // base = round(1500 + 180*2.8 - 30*3.2) = round(1500 + 504 - 96) = round(1908) = 1908
    // bmr = max(1200, 1908-220) = max(1200, 1688) = 1688
    // tdee = max(1908+120, 1688+400) = max(2028, 2088) = 2088
    // targetCalories = max(1400, 1908+240) = max(1400, 2148) = 2148
    const result = estimateOnboardingCalories({ age: 30, heightCm: 180, goal: "build" })
    assert.strictEqual(result.bmr, 1688)
    assert.strictEqual(result.tdee, 2088)
    assert.strictEqual(result.targetCalories, 2148)
  })

  test("returned object has all required fields", () => {
    const result = estimateOnboardingCalories({ age: 25, heightCm: 170, goal: "maintain" })
    assert.ok("bmr" in result)
    assert.ok("tdee" in result)
    assert.ok("targetCalories" in result)
    assert.ok("protein" in result)
    assert.ok("carbs" in result)
    assert.ok("fat" in result)
  })

  test("gain goal results in higher targetCalories than maintain", () => {
    const maintain = estimateOnboardingCalories({ age: 25, heightCm: 170, goal: "maintain" })
    const gain = estimateOnboardingCalories({ age: 25, heightCm: 170, goal: "build" })
    assert.ok(gain.targetCalories > maintain.targetCalories, "gain should have more calories than maintain")
  })

  test("lose goal results in lower targetCalories than maintain", () => {
    const maintain = estimateOnboardingCalories({ age: 25, heightCm: 170, goal: "maintain" })
    const lose = estimateOnboardingCalories({ age: 25, heightCm: 170, goal: "lose" })
    assert.ok(lose.targetCalories < maintain.targetCalories, "lose should have fewer calories than maintain")
  })
})