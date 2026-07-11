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

  test("mobile onboarding stays concise and guides beginners into Coach", () => {
    expect(ONBOARDING_MOBILE_SOURCE).not.toContain("Choose what OneRep can use")
    expect(ONBOARDING_MOBILE_SOURCE).not.toContain("What should be ready?")
    expect(ONBOARDING_MOBILE_SOURCE).not.toContain("Start with one action")
    expect(ONBOARDING_MOBILE_SOURCE).not.toContain(
      "function firstNutritionActionPath"
    )
    expect(ONBOARDING_MOBILE_SOURCE).not.toContain("Setup mode")
    expect(ONBOARDING_MOBILE_SOURCE).toContain('id: "goal"')
    expect(ONBOARDING_MOBILE_SOURCE).toContain('id: "experience"')
    expect(ONBOARDING_MOBILE_SOURCE).toContain('id: "review"')
    expect(ONBOARDING_MOBILE_SOURCE).toContain(
      'experienceLevel === "beginner" ? "/coach?setup=beginner" : "/"'
    )
    expect(ONBOARDING_MOBILE_SOURCE).toContain("icon: GenderFemale")
    expect(ONBOARDING_MOBILE_SOURCE).toContain("icon: GenderMale")
    expect(ONBOARDING_MOBILE_SOURCE).toContain("<ArrowRight")
  })
})
