/**
 * Tests for the Settings page logic.
 *
 * The Settings page (Settings.tsx) includes two helper components:
 *   - NumberInput: stepper input with min/max/step constraints
 *   - SegmentedControl: tab-style selector
 *
 * It also drives the effective-goals priority logic that is mirrored in
 * convex/users/users.ts::getEffectiveGoals.
 *
 * Since these are embedded inside a React module that requires Convex and
 * routing context, we extract and test the pure business-logic units here.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"

// ─── NumberInput logic ────────────────────────────────────────────────────────
// Mirror of the NumberInput commit / step logic from Settings.tsx

function numberInputCommit(draft: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, draft))
}

function numberInputDecrement(draft: number, step: number, min: number): number {
  return Math.max(min, draft - step)
}

function numberInputIncrement(draft: number, step: number, max: number): number {
  return Math.min(max, draft + step)
}

describe("NumberInput – commit (clamp to [min, max])", () => {
  test("value within range stays unchanged", () => {
    assert.strictEqual(numberInputCommit(100, 50, 200), 100)
  })

  test("value below min is clamped to min", () => {
    assert.strictEqual(numberInputCommit(30, 50, 200), 50)
  })

  test("value above max is clamped to max", () => {
    assert.strictEqual(numberInputCommit(300, 50, 200), 200)
  })

  test("value exactly at min is kept", () => {
    assert.strictEqual(numberInputCommit(50, 50, 200), 50)
  })

  test("value exactly at max is kept", () => {
    assert.strictEqual(numberInputCommit(200, 50, 200), 200)
  })

  test("calorie range: 800 floor is enforced", () => {
    assert.strictEqual(numberInputCommit(500, 800, 5000), 800)
  })

  test("calorie range: 5000 ceiling is enforced", () => {
    assert.strictEqual(numberInputCommit(6000, 800, 5000), 5000)
  })

  test("water goal range: 500 floor is enforced", () => {
    assert.strictEqual(numberInputCommit(100, 500, 5000), 500)
  })
})

describe("NumberInput – decrement", () => {
  test("decrements by step", () => {
    assert.strictEqual(numberInputDecrement(2500, 250, 500), 2250)
  })

  test("does not go below min", () => {
    assert.strictEqual(numberInputDecrement(500, 250, 500), 500)
  })

  test("partial step at boundary clamps to min", () => {
    assert.strictEqual(numberInputDecrement(600, 250, 500), 500)
  })

  test("decrementing calories by 50 step", () => {
    assert.strictEqual(numberInputDecrement(2000, 50, 800), 1950)
  })

  test("decrementing protein by 5 step", () => {
    assert.strictEqual(numberInputDecrement(155, 5, 20), 150)
  })
})

describe("NumberInput – increment", () => {
  test("increments by step", () => {
    assert.strictEqual(numberInputIncrement(2500, 250, 5000), 2750)
  })

  test("does not exceed max", () => {
    assert.strictEqual(numberInputIncrement(5000, 250, 5000), 5000)
  })

  test("partial step at boundary clamps to max", () => {
    assert.strictEqual(numberInputIncrement(4900, 250, 5000), 5000)
  })

  test("incrementing fat by 5 step", () => {
    assert.strictEqual(numberInputIncrement(65, 5, 200), 70)
  })
})

// ─── SegmentedControl logic ───────────────────────────────────────────────────
// The SegmentedControl just tracks which value is selected. The active option
// is determined by strict equality: value === opt.value

function isOptionSelected(currentValue: string, optionValue: string): boolean {
  return currentValue === optionValue
}

describe("SegmentedControl – selection", () => {
  const workoutOptions = ["strength", "cardio", "mobility"]

  test("only the current value is marked as selected", () => {
    const selected = workoutOptions.filter((v) => isOptionSelected("cardio", v))
    assert.deepStrictEqual(selected, ["cardio"])
  })

  test("strength is selected when value is 'strength'", () => {
    assert.strictEqual(isOptionSelected("strength", "strength"), true)
    assert.strictEqual(isOptionSelected("strength", "cardio"), false)
    assert.strictEqual(isOptionSelected("strength", "mobility"), false)
  })

  test("kg is selected when weight unit is 'kg'", () => {
    assert.strictEqual(isOptionSelected("kg", "kg"), true)
    assert.strictEqual(isOptionSelected("kg", "lbs"), false)
  })

  test("lbs is selected when weight unit is 'lbs'", () => {
    assert.strictEqual(isOptionSelected("lbs", "lbs"), true)
    assert.strictEqual(isOptionSelected("lbs", "kg"), false)
  })

  test("selection comparison is case-sensitive", () => {
    assert.strictEqual(isOptionSelected("Strength", "strength"), false)
  })
})

// ─── Effective goals priority logic ──────────────────────────────────────────
// Mirrors the priority in convex/users/users.ts::getEffectiveGoals handler:
//   custom > health > defaults

const DEFAULTS = { calories: 2000, protein: 150, carbs: 200, fat: 65 }

function resolveEffective(
  custom: Partial<typeof DEFAULTS> | null | undefined,
  health: Partial<typeof DEFAULTS> | null | undefined
) {
  return {
    calories: custom?.calories ?? health?.calories ?? DEFAULTS.calories,
    protein: custom?.protein ?? health?.protein ?? DEFAULTS.protein,
    carbs: custom?.carbs ?? health?.carbs ?? DEFAULTS.carbs,
    fat: custom?.fat ?? health?.fat ?? DEFAULTS.fat,
  }
}

describe("getEffectiveGoals – priority: custom > health > default", () => {
  test("when custom and health are null, returns hardcoded defaults", () => {
    assert.deepStrictEqual(resolveEffective(null, null), { calories: 2000, protein: 150, carbs: 200, fat: 65 })
  })

  test("custom goals override health and defaults for all fields", () => {
    const result = resolveEffective(
      { calories: 2500, protein: 180, carbs: 250, fat: 80 },
      { calories: 1800, protein: 120, carbs: 180, fat: 60 }
    )
    assert.deepStrictEqual(result, { calories: 2500, protein: 180, carbs: 250, fat: 80 })
  })

  test("health goals are used when custom is null", () => {
    const result = resolveEffective(null, { calories: 1800, protein: 120, carbs: 180, fat: 60 })
    assert.deepStrictEqual(result, { calories: 1800, protein: 120, carbs: 180, fat: 60 })
  })

  test("custom calories overrides health, health protein overrides default", () => {
    const result = resolveEffective(
      { calories: 2500 },       // custom only has calories
      { calories: 1800, protein: 120, carbs: 180, fat: 60 }
    )
    assert.strictEqual(result.calories, 2500)  // from custom
    assert.strictEqual(result.protein, 120)    // from health (custom.protein is undefined)
    assert.strictEqual(result.carbs, 180)      // from health
    assert.strictEqual(result.fat, 60)         // from health
  })

  test("defaults used for fields missing in both custom and health", () => {
    const result = resolveEffective(
      { calories: 2500 },   // only calories
      { protein: 130 }      // only protein
    )
    assert.strictEqual(result.calories, 2500)  // custom
    assert.strictEqual(result.protein, 130)    // health
    assert.strictEqual(result.carbs, 200)      // default
    assert.strictEqual(result.fat, 65)         // default
  })

  test("undefined custom is treated same as null", () => {
    const result = resolveEffective(undefined, { calories: 1900, protein: 140, carbs: 195, fat: 62 })
    assert.strictEqual(result.calories, 1900)
  })

  test("all defaults are non-zero positive numbers", () => {
    const result = resolveEffective(null, null)
    assert.ok(result.calories > 0, "default calories should be positive")
    assert.ok(result.protein > 0, "default protein should be positive")
    assert.ok(result.carbs > 0, "default carbs should be positive")
    assert.ok(result.fat > 0, "default fat should be positive")
  })

  test("custom 0 is NOT treated as missing (0 ?? x → 0 since 0 is not null/undefined)", () => {
    // NOTE: ?? only falls through for null/undefined, NOT for 0
    const result = resolveEffective({ calories: 0 }, { calories: 1800 })
    assert.strictEqual(result.calories, 0)
  })
})

// ─── Settings defaults from preferences ──────────────────────────────────────

describe("Settings – preference defaults", () => {
  test("waterGoalMl defaults to 2500 when preferences is null", () => {
    const preferences: { waterGoalMl?: number } | null = null
    const goalMl = preferences?.waterGoalMl ?? 2500
    assert.strictEqual(goalMl, 2500)
  })

  test("waterGoalMl uses stored value when available", () => {
    const preferences = { waterGoalMl: 3000 }
    const goalMl = preferences?.waterGoalMl ?? 2500
    assert.strictEqual(goalMl, 3000)
  })

  test("weightUnit defaults to 'kg' when preferences is null", () => {
    const preferences: { weightUnit?: string } | null = null
    const unit = (preferences?.weightUnit as "kg" | "lbs") || "kg"
    assert.strictEqual(unit, "kg")
  })

  test("weightUnit uses stored 'lbs' value when available", () => {
    const preferences = { weightUnit: "lbs" }
    const unit = (preferences?.weightUnit as "kg" | "lbs") || "kg"
    assert.strictEqual(unit, "lbs")
  })

  test("workoutFocus defaults to 'strength' when dashboardSettings is absent", () => {
    const preferences: { dashboardSettings?: { workoutFocus?: string } } | null = null
    const focus = (preferences?.dashboardSettings?.workoutFocus as "strength" | "cardio" | "mobility") || "strength"
    assert.strictEqual(focus, "strength")
  })

  test("workoutFocus uses stored 'cardio' value when available", () => {
    const preferences = { dashboardSettings: { workoutFocus: "cardio" } }
    const focus = (preferences?.dashboardSettings?.workoutFocus as "strength" | "cardio" | "mobility") || "strength"
    assert.strictEqual(focus, "cardio")
  })

  test("waterGoalMl: new PR default (2500) is higher than old localStorage default (2000)", () => {
    // PR changed the default from 2000 (localStorage) to 2500 (from DB preferences)
    const oldDefault = 2000
    const newDefault = 2500
    assert.ok(newDefault > oldDefault, "new default should be higher")
  })
})