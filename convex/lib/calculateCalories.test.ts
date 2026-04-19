import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { calculateCalories } from "./calculateCalories.ts"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate expected BMR using the Mifflin-St Jeor equation.
 * Male:   10*w + 6.25*h - 5*a + 5
 * Female: 10*w + 6.25*h - 5*a - 161
 */
function expectedBMR(sex: string, weightKg: number, heightCm: number, age: number) {
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161))
}

// ─── BMR Calculation ──────────────────────────────────────────────────────────

describe("calculateCalories – BMR", () => {
  test("male BMR uses +5 sex constant", () => {
    const result = calculateCalories({
      sex: "male",
      age: 30,
      weightKg: 80,
      heightCm: 180,
      activityLevel: "sedentary",
      goal: "maintain",
    })
    const expected = expectedBMR("male", 80, 180, 30)
    assert.strictEqual(result.bmr, expected)
  })

  test("female BMR uses -161 sex constant", () => {
    const result = calculateCalories({
      sex: "female",
      age: 25,
      weightKg: 60,
      heightCm: 165,
      activityLevel: "sedentary",
      goal: "maintain",
    })
    const expected = expectedBMR("female", 60, 165, 25)
    assert.strictEqual(result.bmr, expected)
  })

  test("male BMR is greater than female BMR with equal stats (difference is 166)", () => {
    const params = { age: 30, weightKg: 75, heightCm: 170, activityLevel: "sedentary", goal: "maintain" }
    const male = calculateCalories({ ...params, sex: "male" })
    const female = calculateCalories({ ...params, sex: "female" })
    assert.ok(male.bmr > female.bmr, "male BMR should be greater")
    // Difference should be 5 - (-161) = 166
    assert.strictEqual(male.bmr - female.bmr, 166)
  })

  test("BMR is a rounded integer", () => {
    const result = calculateCalories({
      sex: "male",
      age: 27,
      weightKg: 73.5,
      heightCm: 177,
      activityLevel: "lightly_active",
      goal: "maintain",
    })
    assert.ok(Number.isInteger(result.bmr), "BMR should be an integer")
  })
})

// ─── Activity Multipliers ─────────────────────────────────────────────────────

describe("calculateCalories – TDEE / activity multipliers", () => {
  const baseParams = { sex: "male", age: 30, weightKg: 80, heightCm: 180, goal: "maintain" }

  test("sedentary uses 1.2 multiplier", () => {
    const result = calculateCalories({ ...baseParams, activityLevel: "sedentary" })
    const bmr = expectedBMR("male", 80, 180, 30)
    assert.strictEqual(result.tdee, Math.round(bmr * 1.2))
  })

  test("lightly_active uses 1.375 multiplier", () => {
    const result = calculateCalories({ ...baseParams, activityLevel: "lightly_active" })
    const bmr = expectedBMR("male", 80, 180, 30)
    assert.strictEqual(result.tdee, Math.round(bmr * 1.375))
  })

  test("moderately_active uses 1.55 multiplier", () => {
    const result = calculateCalories({ ...baseParams, activityLevel: "moderately_active" })
    const bmr = expectedBMR("male", 80, 180, 30)
    assert.strictEqual(result.tdee, Math.round(bmr * 1.55))
  })

  test("very_active uses 1.725 multiplier", () => {
    const result = calculateCalories({ ...baseParams, activityLevel: "very_active" })
    const bmr = expectedBMR("male", 80, 180, 30)
    assert.strictEqual(result.tdee, Math.round(bmr * 1.725))
  })

  test("extra_active uses 1.9 multiplier", () => {
    const result = calculateCalories({ ...baseParams, activityLevel: "extra_active" })
    const bmr = expectedBMR("male", 80, 180, 30)
    assert.strictEqual(result.tdee, Math.round(bmr * 1.9))
  })

  test("unknown activity level falls back to 1.55 multiplier", () => {
    const result = calculateCalories({ ...baseParams, activityLevel: "unknown_level" })
    const bmr = expectedBMR("male", 80, 180, 30)
    assert.strictEqual(result.tdee, Math.round(bmr * 1.55))
  })

  test("TDEE is a rounded integer", () => {
    const result = calculateCalories({ ...baseParams, activityLevel: "very_active" })
    assert.ok(Number.isInteger(result.tdee), "TDEE should be an integer")
  })
})

// ─── Goal Deltas ──────────────────────────────────────────────────────────────

describe("calculateCalories – goal calorie delta", () => {
  const baseParams = { sex: "male", age: 30, weightKg: 80, heightCm: 180, activityLevel: "moderately_active" }

  test("maintain goal has 0 delta", () => {
    const result = calculateCalories({ ...baseParams, goal: "maintain" })
    assert.strictEqual(result.targetCalories, result.tdee)
  })

  test("lose goal subtracts 500 kcal from TDEE", () => {
    const result = calculateCalories({ ...baseParams, goal: "lose" })
    assert.strictEqual(result.targetCalories, result.tdee - 500)
  })

  test("gain goal adds 500 kcal to TDEE", () => {
    const result = calculateCalories({ ...baseParams, goal: "gain" })
    assert.strictEqual(result.targetCalories, result.tdee + 500)
  })

  test("unknown goal falls back to 0 delta (same as maintain)", () => {
    const maintain = calculateCalories({ ...baseParams, goal: "maintain" })
    const unknown = calculateCalories({ ...baseParams, goal: "something_random" })
    assert.strictEqual(unknown.targetCalories, maintain.targetCalories)
  })

  test("targetCalories is a rounded integer", () => {
    const result = calculateCalories({ ...baseParams, goal: "gain" })
    assert.ok(Number.isInteger(result.targetCalories), "targetCalories should be an integer")
  })
})

// ─── Macro Calculation ────────────────────────────────────────────────────────

describe("calculateCalories – macros", () => {
  const params = {
    sex: "female",
    age: 28,
    weightKg: 65,
    heightCm: 168,
    activityLevel: "lightly_active",
    goal: "maintain",
  }

  test("protein is 30% of targetCalories / 4 (rounded)", () => {
    const result = calculateCalories(params)
    assert.strictEqual(result.protein, Math.round((result.targetCalories * 0.3) / 4))
  })

  test("carbs is 40% of targetCalories / 4 (rounded)", () => {
    const result = calculateCalories(params)
    assert.strictEqual(result.carbs, Math.round((result.targetCalories * 0.4) / 4))
  })

  test("fat is 30% of targetCalories / 9 (rounded)", () => {
    const result = calculateCalories(params)
    assert.strictEqual(result.fat, Math.round((result.targetCalories * 0.3) / 9))
  })

  test("all macros are positive integers", () => {
    const result = calculateCalories(params)
    assert.ok(Number.isInteger(result.protein), "protein should be integer")
    assert.ok(Number.isInteger(result.carbs), "carbs should be integer")
    assert.ok(Number.isInteger(result.fat), "fat should be integer")
    assert.ok(result.protein > 0, "protein should be positive")
    assert.ok(result.carbs > 0, "carbs should be positive")
    assert.ok(result.fat > 0, "fat should be positive")
  })
})

// ─── Integration / real-world scenarios ──────────────────────────────────────

describe("calculateCalories – integration scenarios", () => {
  test("sedentary male, 30yo, 80kg 180cm, maintain", () => {
    // BMR = 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    // TDEE = round(1780 * 1.2) = round(2136) = 2136
    // targetCalories = 2136 + 0 = 2136
    const result = calculateCalories({
      sex: "male",
      age: 30,
      weightKg: 80,
      heightCm: 180,
      activityLevel: "sedentary",
      goal: "maintain",
    })
    assert.strictEqual(result.bmr, 1780)
    assert.strictEqual(result.tdee, 2136)
    assert.strictEqual(result.targetCalories, 2136)
  })

  test("very_active female, 25yo, 60kg 165cm, lose", () => {
    const result = calculateCalories({
      sex: "female",
      age: 25,
      weightKg: 60,
      heightCm: 165,
      activityLevel: "very_active",
      goal: "lose",
    })
    assert.strictEqual(result.bmr, 1345)
    assert.strictEqual(result.targetCalories, result.tdee - 500)
    assert.ok(result.targetCalories > 0, "targetCalories should be positive")
  })

  test("extra_active male, 22yo, 90kg 190cm, gain", () => {
    // BMR = 10*90 + 6.25*190 - 5*22 + 5 = 900 + 1187.5 - 110 + 5 = 1982.5 → 1983
    const result = calculateCalories({
      sex: "male",
      age: 22,
      weightKg: 90,
      heightCm: 190,
      activityLevel: "extra_active",
      goal: "gain",
    })
    assert.strictEqual(result.targetCalories, result.tdee + 500)
    assert.strictEqual(result.bmr, 1983)
    assert.ok(result.tdee > result.bmr, "TDEE should exceed BMR")
  })

  test("returned object has all required fields", () => {
    const result = calculateCalories({
      sex: "male",
      age: 35,
      weightKg: 75,
      heightCm: 175,
      activityLevel: "moderately_active",
      goal: "maintain",
    })
    assert.ok("bmr" in result)
    assert.ok("tdee" in result)
    assert.ok("targetCalories" in result)
    assert.ok("protein" in result)
    assert.ok("carbs" in result)
    assert.ok("fat" in result)
  })

  test("TDEE is always greater than BMR for any valid activity level", () => {
    const result = calculateCalories({
      sex: "male",
      age: 30,
      weightKg: 70,
      heightCm: 170,
      activityLevel: "sedentary",
      goal: "maintain",
    })
    assert.ok(result.tdee > result.bmr, "TDEE should always exceed BMR")
  })
})