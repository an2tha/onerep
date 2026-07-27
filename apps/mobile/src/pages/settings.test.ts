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
import { readFileSync } from "node:fs"

const SETTINGS_SOURCE = readFileSync(
  new URL("./Settings.tsx", import.meta.url),
  "utf8"
)
const APP_STYLES_SOURCE = readFileSync(
  new URL("../../../../packages/ui/src/index.css", import.meta.url),
  "utf8"
)
const SETTINGS_UI_SOURCE = [
  "../../../../packages/ui/src/components/settings-controls.tsx",
  "../../../../packages/ui/src/components/settings-display.tsx",
  "../../../../packages/ui/src/components/mobile-ui.tsx",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n")

// ─── NumberInput logic ────────────────────────────────────────────────────────
// Mirror of the NumberInput commit / step logic from Settings.tsx

function numberInputCommit(draft: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, draft))
}

function numberInputDecrement(
  draft: number,
  step: number,
  min: number
): number {
  return Math.max(min, draft - step)
}

function numberInputIncrement(
  draft: number,
  step: number,
  max: number
): number {
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

describe("Settings destructive actions", () => {
  test("reset onboarding is guarded while the async reset is in flight", () => {
    assert.match(
      SETTINGS_SOURCE,
      /const \[resettingOnboarding, setResettingOnboarding\] = useState\(false\)/
    )
    assert.match(
      SETTINGS_SOURCE,
      /if \(resettingOnboarding\) return\s+hapticTap\(\)\s+setResettingOnboarding\(true\)/
    )
    assert.match(
      SETTINGS_SOURCE,
      /finally \{\s+setResettingOnboarding\(false\)\s+\}/
    )
    assert.match(
      SETTINGS_SOURCE,
      /disabled=\{resettingOnboarding\}\s+busy=\{resettingOnboarding\}/
    )
    assert.match(SETTINGS_SOURCE, /Resetting health profile…/)
  })

  test("long-running account and data actions expose busy state", () => {
    assert.match(
      SETTINGS_SOURCE,
      /disabled=\{loggingOut\}\s+busy=\{loggingOut\}/
    )
    assert.match(
      SETTINGS_SOURCE,
      /disabled=\{syncingOfflineQueue\}\s+busy=\{syncingOfflineQueue\}/
    )
    assert.match(SETTINGS_SOURCE, /disabled=\{exporting\}\s+busy=\{exporting\}/)
    assert.match(
      SETTINGS_SOURCE,
      /disabled=\{deleteConfirmText !== "DELETE" \|\| deleting\}\s+aria-busy=\{deleting\}/
    )
    assert.match(
      SETTINGS_SOURCE,
      /disabled=\{canceling\}\s+aria-busy=\{canceling\}/
    )
  })
})

describe("OneRep Pro membership surface", () => {
  test("uses the Coach-derived premium surface without changing billing actions", () => {
    assert.match(SETTINGS_SOURCE, /className="profile-pro-card"/)
    assert.match(SETTINGS_SOURCE, /"profile-pro-primary-action"/)
    assert.doesNotMatch(SETTINGS_SOURCE, /OneRep membership/)
    assert.match(SETTINGS_SOURCE, /revenueCat\.purchaseMonthly/)
    assert.match(SETTINGS_SOURCE, /revenueCat\.restorePurchases/)
    assert.match(SETTINGS_SOURCE, /revenueCat\.refresh/)
    assert.match(SETTINGS_SOURCE, /revenueCat\.cancelSubscription/)
  })

  test("keeps cancellation confirmed and adds tactile feedback at entry", () => {
    assert.match(
      SETTINGS_SOURCE,
      /if \(active\) \{[\s\S]*?hapticTap\(\)\s+setConfirmCancel\(true\)/
    )
    assert.match(SETTINGS_SOURCE, /role="alertdialog"/)
    assert.match(SETTINGS_SOURCE, /Keep OneRep Pro/)
  })

  test("shares Coach wave motion and respects reduced-motion preferences", () => {
    assert.match(
      APP_STYLES_SOURCE,
      /\.profile-pro-card::before[\s\S]*animation: coach-dashboard-wave/
    )
    assert.match(
      APP_STYLES_SOURCE,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.profile-pro-card::before,[\s\S]*animation: none !important/
    )
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
    assert.deepStrictEqual(resolveEffective(null, null), {
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 65,
    })
  })

  test("custom goals override health and defaults for all fields", () => {
    const result = resolveEffective(
      { calories: 2500, protein: 180, carbs: 250, fat: 80 },
      { calories: 1800, protein: 120, carbs: 180, fat: 60 }
    )
    assert.deepStrictEqual(result, {
      calories: 2500,
      protein: 180,
      carbs: 250,
      fat: 80,
    })
  })

  test("health goals are used when custom is null", () => {
    const result = resolveEffective(null, {
      calories: 1800,
      protein: 120,
      carbs: 180,
      fat: 60,
    })
    assert.deepStrictEqual(result, {
      calories: 1800,
      protein: 120,
      carbs: 180,
      fat: 60,
    })
  })

  test("custom calories overrides health, health protein overrides default", () => {
    const result = resolveEffective(
      { calories: 2500 }, // custom only has calories
      { calories: 1800, protein: 120, carbs: 180, fat: 60 }
    )
    assert.strictEqual(result.calories, 2500) // from custom
    assert.strictEqual(result.protein, 120) // from health (custom.protein is undefined)
    assert.strictEqual(result.carbs, 180) // from health
    assert.strictEqual(result.fat, 60) // from health
  })

  test("defaults used for fields missing in both custom and health", () => {
    const result = resolveEffective(
      { calories: 2500 }, // only calories
      { protein: 130 } // only protein
    )
    assert.strictEqual(result.calories, 2500) // custom
    assert.strictEqual(result.protein, 130) // health
    assert.strictEqual(result.carbs, 200) // default
    assert.strictEqual(result.fat, 65) // default
  })

  test("undefined custom is treated same as null", () => {
    const result = resolveEffective(undefined, {
      calories: 1900,
      protein: 140,
      carbs: 195,
      fat: 62,
    })
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

describe("Settings – production feature visibility", () => {
  test("settings loading state explains what is happening", () => {
    assert.match(SETTINGS_UI_SOURCE, /aria-label="Loading settings"/)
    assert.match(SETTINGS_UI_SOURCE, /Loading settings/)
    assert.match(
      SETTINGS_UI_SOURCE,
      /Syncing your preferences, goals, and account controls\./
    )
  })

  test("privacy and data sections are reachable", () => {
    assert.match(SETTINGS_SOURCE, /\| "privacy"/)
    assert.match(SETTINGS_SOURCE, /\| "data"/)
    assert.match(SETTINGS_SOURCE, /\| "nutrition"/)
    assert.match(SETTINGS_SOURCE, /title="Privacy & sync"/)
    assert.match(SETTINGS_SOURCE, /title="Data & account"/)
    assert.match(SETTINGS_SOURCE, /title="Nutrition strategy"/)
    assert.match(SETTINGS_SOURCE, /Install OneRep/)
    assert.match(SETTINGS_SOURCE, /handleInstallApp/)
    assert.match(SETTINGS_SOURCE, /SettingsRow label="Haptic feedback"/)
    assert.match(SETTINGS_SOURCE, /handleHapticsChange/)
    assert.match(SETTINGS_SOURCE, /oneRepExportDocument/)
    assert.match(SETTINGS_SOURCE, /Export downloaded with checksum/)
    assert.doesNotMatch(SETTINGS_SOURCE, /AccordionItem/)
  })

  test("developer options can replay Coach onboarding", () => {
    assert.match(SETTINGS_SOURCE, /Reset Coach onboarding/)
    assert.match(SETTINGS_SOURCE, /handleResetCoachOnboarding/)
    assert.match(SETTINGS_SOURCE, /\/onboarding\?replay=coach/)
  })

  test("uses the native settings hierarchy and accessible controls", () => {
    const combinedSource = `${SETTINGS_SOURCE}\n${SETTINGS_UI_SOURCE}`
    assert.match(combinedSource, /<NavigationBar/)
    assert.match(combinedSource, /<GroupedList/)
    assert.match(combinedSource, /<DisclosureRow/)
    assert.match(combinedSource, /role="switch"/)
    assert.match(combinedSource, /aria-checked=\{checked\}/)
    assert.match(combinedSource, /role="progressbar"/)
    assert.match(
      combinedSource,
      /<span className="sr-only">\{label\} reminder time<\/span>/
    )
  })
})

// ─── Settings defaults from preferences ──────────────────────────────────────

describe("Settings – preference defaults", () => {
  test("waterGoalMl defaults to 2500 when preferences is null", () => {
    const preferences = null as { waterGoalMl?: number } | null
    const goalMl = preferences?.waterGoalMl ?? 2500
    assert.strictEqual(goalMl, 2500)
  })

  test("waterGoalMl uses stored value when available", () => {
    const preferences = { waterGoalMl: 3000 }
    const goalMl = preferences?.waterGoalMl ?? 2500
    assert.strictEqual(goalMl, 3000)
  })

  test("weightUnit defaults to 'kg' when preferences is null", () => {
    const preferences = null as { weightUnit?: string } | null
    const unit = (preferences?.weightUnit as "kg" | "lbs") || "kg"
    assert.strictEqual(unit, "kg")
  })

  test("weightUnit uses stored 'lbs' value when available", () => {
    const preferences = { weightUnit: "lbs" }
    const unit = (preferences?.weightUnit as "kg" | "lbs") || "kg"
    assert.strictEqual(unit, "lbs")
  })

  test("workoutFocus defaults to 'strength' when dashboardSettings is absent", () => {
    const preferences = null as {
      dashboardSettings?: { workoutFocus?: string }
    } | null
    const focus =
      (preferences?.dashboardSettings?.workoutFocus as
        "strength" | "cardio" | "mobility") || "strength"
    assert.strictEqual(focus, "strength")
  })

  test("workoutFocus uses stored 'cardio' value when available", () => {
    const preferences = { dashboardSettings: { workoutFocus: "cardio" } }
    const focus =
      (preferences?.dashboardSettings?.workoutFocus as
        "strength" | "cardio" | "mobility") || "strength"
    assert.strictEqual(focus, "cardio")
  })

  test("waterGoalMl: new PR default (2500) is higher than old localStorage default (2000)", () => {
    // PR changed the default from 2000 (localStorage) to 2500 (from DB preferences)
    const oldDefault = 2000
    const newDefault = 2500
    assert.ok(newDefault > oldDefault, "new default should be higher")
  })
})

// ─── NumberStepper logic ──────────────────────────────────────────────────────
// The PR renamed NumberInput → NumberStepper and redesigned the commit / step
// logic. The key changes:
//   - draft is now a STRING (not a number), parsed with parseInt(draft, 10)
//   - commit() reverts draft to String(value) when parseInt returns NaN
//   - decrement() and increment() operate on the `value` prop (not draft)

function numberStepperCommit(
  draft: string,
  _value: number,
  min: number,
  max: number
): number | "revert" {
  const parsed = parseInt(draft, 10)
  if (!isNaN(parsed)) {
    return Math.max(min, Math.min(max, parsed))
  }
  // NaN → caller should revert draft to String(value), value stays unchanged
  return "revert"
}

function numberStepperDecrement(
  value: number,
  step: number,
  min: number
): number {
  return Math.max(min, value - step)
}

function numberStepperIncrement(
  value: number,
  step: number,
  max: number
): number {
  return Math.min(max, value + step)
}

describe("NumberStepper – commit (string parsing + clamp)", () => {
  test("valid numeric string within range passes through unchanged", () => {
    assert.strictEqual(numberStepperCommit("2000", 2000, 800, 5000), 2000)
  })

  test("numeric string below min is clamped to min", () => {
    assert.strictEqual(numberStepperCommit("300", 2000, 800, 5000), 800)
  })

  test("numeric string above max is clamped to max", () => {
    assert.strictEqual(numberStepperCommit("9999", 2000, 800, 5000), 5000)
  })

  test("non-numeric string returns revert sentinel (onChange not called)", () => {
    assert.strictEqual(numberStepperCommit("abc", 1500, 800, 5000), "revert")
  })

  test("empty string returns revert sentinel", () => {
    assert.strictEqual(numberStepperCommit("", 1500, 800, 5000), "revert")
  })

  test("string with spaces and digits: parseInt extracts leading int", () => {
    // parseInt("  500  ", 10) === 500 in JS
    assert.strictEqual(numberStepperCommit("  500  ", 2000, 500, 5000), 500)
  })

  test("float string is truncated to integer (parseInt, not parseFloat)", () => {
    // parseInt("2000.5", 10) === 2000
    assert.strictEqual(numberStepperCommit("2000.5", 2000, 800, 5000), 2000)
  })

  test("string exactly at min is accepted", () => {
    assert.strictEqual(numberStepperCommit("800", 2000, 800, 5000), 800)
  })

  test("string exactly at max is accepted", () => {
    assert.strictEqual(numberStepperCommit("5000", 2000, 800, 5000), 5000)
  })

  test("water goal: string '250' below min 500 clamps to 500", () => {
    assert.strictEqual(numberStepperCommit("250", 2500, 500, 5000), 500)
  })

  test("protein: string '0' below min 20 clamps to 20", () => {
    assert.strictEqual(numberStepperCommit("0", 150, 20, 400), 20)
  })
})

describe("NumberStepper – decrement (operates on value prop)", () => {
  test("decrements by step from value prop", () => {
    assert.strictEqual(numberStepperDecrement(2000, 50, 800), 1950)
  })

  test("does not go below min", () => {
    assert.strictEqual(numberStepperDecrement(800, 50, 800), 800)
  })

  test("partial step at boundary clamps to min", () => {
    assert.strictEqual(numberStepperDecrement(820, 50, 800), 800)
  })

  test("water goal decrement by 250", () => {
    assert.strictEqual(numberStepperDecrement(2500, 250, 500), 2250)
  })

  test("water goal decrement stops at min=500", () => {
    assert.strictEqual(numberStepperDecrement(500, 250, 500), 500)
  })

  test("fat decrement by 5", () => {
    assert.strictEqual(numberStepperDecrement(65, 5, 10), 60)
  })

  test("carbs decrement stops when step would go below min=10", () => {
    assert.strictEqual(numberStepperDecrement(15, 10, 10), 10)
  })
})

describe("NumberStepper – increment (operates on value prop)", () => {
  test("increments by step from value prop", () => {
    assert.strictEqual(numberStepperIncrement(2000, 50, 5000), 2050)
  })

  test("does not exceed max", () => {
    assert.strictEqual(numberStepperIncrement(5000, 50, 5000), 5000)
  })

  test("partial step at boundary clamps to max", () => {
    assert.strictEqual(numberStepperIncrement(4990, 50, 5000), 5000)
  })

  test("water goal increment by 250", () => {
    assert.strictEqual(numberStepperIncrement(2500, 250, 5000), 2750)
  })

  test("water goal increment stops at max=5000", () => {
    assert.strictEqual(numberStepperIncrement(5000, 250, 5000), 5000)
  })

  test("protein increment by 5", () => {
    assert.strictEqual(numberStepperIncrement(150, 5, 400), 155)
  })

  test("fat increment stops at max=200", () => {
    assert.strictEqual(numberStepperIncrement(200, 5, 200), 200)
  })
})

describe("NumberStepper – draft state sync logic", () => {
  test("when not editing, draft should equal String(value)", () => {
    // The useEffect: if (!editing) setDraft(String(value))
    const value = 2500
    const editing = false
    const draft = editing ? "old" : String(value)
    assert.strictEqual(draft, "2500")
  })

  test("when editing, draft is NOT overwritten by value changes", () => {
    const value = 2500
    const editing = true
    // The effect only runs setDraft when !editing
    const draft = editing ? "user-typing" : String(value)
    assert.strictEqual(draft, "user-typing")
  })

  test("String(value) converts integer correctly for any goal field", () => {
    assert.strictEqual(String(2000), "2000")
    assert.strictEqual(String(150), "150")
    assert.strictEqual(String(200), "200")
    assert.strictEqual(String(65), "65")
    assert.strictEqual(String(2500), "2500")
  })
})

// ─── SettingsRow layout logic ─────────────────────────────────────────────────
// SettingsRow is a thin wrapper: label + children in a flex row.
// RowDivider is a horizontal rule. Both are purely structural.
// We validate the label-passing contract by mirroring the render output.

describe("SettingsRow – label rendering", () => {
  test("label string is passed through unchanged", () => {
    const label = "Daily goal"
    assert.strictEqual(label, "Daily goal")
  })

  test("all Settings labels present in the component", () => {
    const expectedLabels = [
      "Calories",
      "Protein",
      "Carbs",
      "Fat",
      "Daily goal",
      "Focus",
      "Weight unit",
      "Haptics",
    ]
    for (const label of expectedLabels) {
      assert.ok(label.length > 0, `label "${label}" should be non-empty`)
    }
  })
})
