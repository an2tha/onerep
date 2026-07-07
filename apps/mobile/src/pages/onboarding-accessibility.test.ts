import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const ONBOARDING_SOURCE = readFileSync(
  new URL("./Onboarding.tsx", import.meta.url),
  "utf8"
)
const ONBOARDING_MOBILE_SOURCE = readFileSync(
  new URL("./OnboardingMobile.tsx", import.meta.url),
  "utf8"
)

describe("Onboarding page production contract", () => {
  test("final setup save is single-flight and announced", () => {
    expect(ONBOARDING_SOURCE).toContain("const savingRef = useRef(false)")
    expect(ONBOARDING_SOURCE).toContain(
      "if (!draft.goal || !profile.sex || savingRef.current || saving) return"
    )
    expect(ONBOARDING_SOURCE).toContain("savingRef.current = true")
    expect(ONBOARDING_SOURCE).toContain("await Promise.all([")
    expect(ONBOARDING_SOURCE).toContain("savingRef.current = false")
    expect(ONBOARDING_SOURCE).toContain("disabled={saving || !stepReady}")
    expect(ONBOARDING_SOURCE).toContain("aria-busy={saving}")
    expect(ONBOARDING_SOURCE).toContain(
      '{saving\n                ? "Saving..."'
    )
  })

  test("mobile nutrition first action routes once after onboarding", () => {
    expect(ONBOARDING_MOBILE_SOURCE).toContain(
      'const FIRST_NUTRITION_ACTION_DONE_KEY = "onerep:first-nutrition-action-done"'
    )
    expect(ONBOARDING_MOBILE_SOURCE).toContain(
      "function firstNutritionActionPath"
    )
    expect(ONBOARDING_MOBILE_SOURCE).toContain('return "/foods/search"')
    expect(ONBOARDING_MOBILE_SOURCE).toContain('return "/foods/recipe/new"')
    expect(ONBOARDING_MOBILE_SOURCE).toContain(
      'return "/nutrition?plan=tomorrow"'
    )
    expect(ONBOARDING_MOBILE_SOURCE).toContain('return "/foods?history=1"')
    expect(ONBOARDING_MOBILE_SOURCE).toContain('return "/nutrition?mode=habit"')
    expect(ONBOARDING_MOBILE_SOURCE).toContain(
      'safeSessionStorageSet(FIRST_NUTRITION_ACTION_DONE_KEY, "true")'
    )
    expect(ONBOARDING_MOBILE_SOURCE).toContain(
      "navigate(firstNutritionActionPath(firstNutritionAction)"
    )
  })
})
