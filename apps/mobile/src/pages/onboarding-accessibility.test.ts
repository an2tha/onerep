import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const ONBOARDING_SOURCE = readFileSync(
  new URL("./Onboarding.tsx", import.meta.url),
  "utf8",
)

describe("Onboarding page production contract", () => {
  test("final setup save is single-flight and announced", () => {
    expect(ONBOARDING_SOURCE).toContain("const savingRef = useRef(false)")
    expect(ONBOARDING_SOURCE).toContain(
      "if (!draft.goal || !profile.sex || savingRef.current || saving) return",
    )
    expect(ONBOARDING_SOURCE).toContain("savingRef.current = true")
    expect(ONBOARDING_SOURCE).toContain("await Promise.all([")
    expect(ONBOARDING_SOURCE).toContain("savingRef.current = false")
    expect(ONBOARDING_SOURCE).toContain("disabled={saving || !stepReady}")
    expect(ONBOARDING_SOURCE).toContain("aria-busy={saving}")
    expect(ONBOARDING_SOURCE).toContain('{saving\n                ? "Saving..."')
  })
})
