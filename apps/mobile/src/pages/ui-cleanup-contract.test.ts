import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8")
}

const LOGIN = source("./Login.tsx")
const ONBOARDING = source("./OnboardingMobile.tsx")
const SETTINGS = source("./Settings.tsx")
const AUTH_GUARD = source("../components/auth-guard.tsx")
const MOBILE_UI = source("../../../../packages/ui/src/components/mobile-ui.tsx")
const MOBILE_SHEET = source(
  "../../../../packages/ui/src/components/mobile-sheet.tsx"
)
const BOTTOM_BAR = `${source("../components/bottom-bar.tsx")}\n${source(
  "../../../../packages/ui/src/components/app-navigation.tsx"
)}`
const MAIN = source("../main.tsx")
const CSS = source("../../../../packages/ui/src/index.css")

describe("authentication interface cleanup", () => {
  test("uses a direct labeled form without marketing slides or dead provider controls", () => {
    assert.match(LOGIN, /const FIELD_CLASS = "native-field"/)
    assert.match(LOGIN, /Create your account/)
    assert.doesNotMatch(LOGIN, /INTRO_SLIDES|IntroIllustration|OAUTH_PROVIDERS/)
    // The rail surface stays banned — that was the floating card. The segmented
    // control does not: sign in and create account are two peer modes, which is
    // the control's whole job, and it is what the rest of the app now uses.
    assert.doesNotMatch(LOGIN, /app-rail-surface/)
    assert.match(LOGIN, /app-segmented-button/)
  })

  test("auth handoff states are plain semantic pages rather than floating cards", () => {
    assert.match(AUTH_GUARD, /aria-labelledby="auth-service-heading"/)
    assert.match(AUTH_GUARD, /native-primary-button/)
    assert.doesNotMatch(AUTH_GUARD, /app-rail-surface/)
  })
})

describe("onboarding interface cleanup", () => {
  test("runs setup as a scripted chat with progress", () => {
    for (const id of [
      "intro",
      "goal",
      "experience",
      "coach",
      "sex",
      "measurements",
      "activity",
      "safety",
      "assistant",
      "review",
    ]) {
      assert.match(ONBOARDING, new RegExp(`id: "${id}"`))
    }
    assert.match(ONBOARDING, /aria-valuenow=\{stage \+ 1\}/)
    assert.match(ONBOARDING, /role="progressbar"/)
  })

  test("previews Coach with a real exchange, not decorative mockups", () => {
    assert.doesNotMatch(ONBOARDING, /\/onboarding\/|OnboardingIllustration/)
    assert.doesNotMatch(ONBOARDING, /#[0-9a-fA-F]{3,8}|font-black|uppercase/)
    assert.doesNotMatch(ONBOARDING, /text-\[(?:9|10|11|12)(?:px|\.5px)/)
    assert.match(ONBOARDING, /function CoachPreviewExchange/)
    // The old showcase drew fake product screenshots in hand-rolled SVG, with
    // an uppercase kicker over every panel. Both are gone for good.
    assert.doesNotMatch(ONBOARDING, /<svg|onboarding-coach-kicker/)
    assert.doesNotMatch(CSS, /onboarding-svg-|onboarding-coach-glass/)
    assert.match(ONBOARDING, /onboarding-coach-preview-stats/)
  })

  test("uses one responsive frosted frame", () => {
    assert.doesNotMatch(ONBOARDING, /onboarding-brand-mark/)
    assert.match(
      CSS,
      /\.onboarding-frame \{[\s\S]*backdrop-filter: blur\(26px\)/
    )
  })

  test("uses lightweight chat choreography", () => {
    assert.doesNotMatch(ONBOARDING, /framer-motion|AnimatePresence/)
    assert.doesNotMatch(ONBOARDING, /startViewTransition/)
    assert.match(ONBOARDING, /onboarding-chat-stage/)
    assert.match(CSS, /animation: onboarding-bubble-in/)
    assert.match(CSS, /@keyframes onboarding-typing-dot/)
  })

  test("the unused duplicate onboarding implementation is no longer imported", () => {
    assert.doesNotMatch(MAIN, /pages\/Onboarding\.tsx/)
    assert.match(MAIN, /OnboardingMobile/)
  })
})

describe("shared native interface cleanup", () => {
  test("settings switches use a 44px interaction target", () => {
    const controls = source(
      "../../../../packages/ui/src/components/settings-controls.tsx"
    )
    assert.match(controls, /inline-flex h-11 w-14/)
    assert.match(controls, /role="switch"/)
  })

  test("empty states use simple hierarchy instead of an animated icon card", () => {
    assert.match(MOBILE_UI, /role="status"/)
    assert.match(MOBILE_UI, /border-y border-border/)
    assert.doesNotMatch(MOBILE_UI, /motion-card app-empty|motion-pop/)
  })

  test("sheets have an accessible name and do not inject stray side padding", () => {
    assert.match(MOBILE_SHEET, /aria-label=\{ariaLabel\}/)
    assert.match(MOBILE_SHEET, /ariaLabel = "Sheet"/)
    assert.doesNotMatch(MOBILE_SHEET, /overflow-y-auto overscroll-contain px-1/)
  })

  test("desktop navigation is stable, opaque, and line-selected", () => {
    assert.match(BOTTOM_BAR, /border-l-2/)
    assert.match(BOTTOM_BAR, /border-r border-border bg-background/)
    assert.doesNotMatch(BOTTOM_BAR, /backdrop-blur-2xl/)
  })

  test("unused metric tile and action dock primitives are gone", () => {
    assert.doesNotMatch(MOBILE_UI, /export function MetricTile/)
    assert.doesNotMatch(MOBILE_UI, /export function ActionDock/)
  })
})
