import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const COACH_SOURCE = readFileSync(
  new URL("./Coach.tsx", import.meta.url),
  "utf8"
)
const COACH_ONBOARDING_SOURCE = readFileSync(
  new URL("../lib/coach-onboarding.ts", import.meta.url),
  "utf8"
)
const SETTINGS_SOURCE = readFileSync(
  new URL("./Settings.tsx", import.meta.url),
  "utf8"
)
const COACH_ACTION_SOURCE = readFileSync(
  new URL("../../../../convex/ai/metricGeneration.ts", import.meta.url),
  "utf8"
)
const PRESET_AGENT_SOURCE = readFileSync(
  new URL("../../../../convex/logs/presetAgent.ts", import.meta.url),
  "utf8"
)

describe("Coach first-open experience", () => {
  test("shows a persistent and accessible feature introduction", () => {
    expect(COACH_ONBOARDING_SOURCE).toContain(
      '"onerep:coach-onboarding-seen:v1"'
    )
    expect(COACH_ONBOARDING_SOURCE).toContain(
      'safeLocalStorageGet(COACH_ONBOARDING_SEEN_KEY) === "1"'
    )
    expect(COACH_ONBOARDING_SOURCE).toContain(
      'safeLocalStorageSet(COACH_ONBOARDING_SEEN_KEY, "1")'
    )
    expect(COACH_SOURCE).toContain('role="dialog"')
    expect(COACH_SOURCE).toContain('aria-modal="true"')
    expect(COACH_SOURCE).toContain('aria-label="Close Coach introduction"')
    expect(COACH_SOURCE).toContain('if (event.key === "Escape") onDismiss()')
  })

  test("uses replaceable screenshot placeholders across the walkthrough", () => {
    expect(COACH_SOURCE).toContain("Daily coaching overview screenshot")
    expect(COACH_SOURCE).toContain("Progress insight cards screenshot")
    expect(COACH_SOURCE).toContain("Coach quick actions screenshot")
    expect(COACH_SOURCE).toContain("Screenshot placeholder")
  })

  test("offers focused skills and a fresh-chat action", () => {
    expect(COACH_SOURCE).toContain('title: "Plan my day"')
    expect(COACH_SOURCE).toContain('title: "Review nutrition"')
    expect(COACH_SOURCE).toContain('title: "Analyze training"')
    expect(COACH_SOURCE).toContain('title: "Check progress"')
    expect(COACH_SOURCE).toContain("New chat")
    expect(COACH_SOURCE).toContain("APP_TOOLTIP_IDS.coachStarters")
    expect(COACH_SOURCE).toContain("APP_TOOLTIP_IDS.coachNewChat")
  })

  test("can be reset from developer settings", () => {
    expect(COACH_ONBOARDING_SOURCE).toContain(
      "safeLocalStorageRemove(COACH_ONBOARDING_SEEN_KEY)"
    )
    expect(SETTINGS_SOURCE).toContain("handleResetCoachOnboarding")
    expect(SETTINGS_SOURCE).toContain("Reset Coach introduction")
  })

  test("beginner setup and safety context reach Coach and plan builders", () => {
    expect(COACH_SOURCE).toContain("BEGINNER_SETUP_STARTERS")
    expect(COACH_SOURCE).toContain("Build my workout plan")
    expect(COACH_SOURCE).toContain("Set up easy recipes")
    expect(COACH_SOURCE).toContain('action === "open_workout_builder"')
    expect(COACH_SOURCE).toContain('action === "open_recipe_builder"')
    expect(COACH_ACTION_SOURCE).toContain(
      "Treat safetyMode, safetyFlags, and nutritionGuidance as hard constraints"
    )
    expect(PRESET_AGENT_SOURCE).toContain(
      "Treat the supplied safety context as a hard constraint"
    )
  })
})
