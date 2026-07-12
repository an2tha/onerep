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
const MOBILE_UI = source("../components/mobile-ui.tsx")
const MOBILE_SHEET = source("../components/mobile-sheet.tsx")
const BOTTOM_BAR = source("../components/bottom-bar.tsx")
const MAIN = source("../main.tsx")

describe("authentication interface cleanup", () => {
  test("uses a direct labeled form without marketing slides or dead provider controls", () => {
    assert.match(LOGIN, /const FIELD_CLASS = "native-field"/)
    assert.match(LOGIN, /Create your account/)
    assert.doesNotMatch(LOGIN, /INTRO_SLIDES|IntroIllustration|OAUTH_PROVIDERS/)
    assert.doesNotMatch(LOGIN, /app-rail-surface|app-segmented/)
  })

  test("auth handoff states are plain semantic pages rather than floating cards", () => {
    assert.match(AUTH_GUARD, /aria-labelledby="auth-service-heading"/)
    assert.match(AUTH_GUARD, /native-primary-button/)
    assert.doesNotMatch(AUTH_GUARD, /app-rail-surface/)
  })
})

describe("onboarding interface cleanup", () => {
  test("groups setup into five task-oriented steps", () => {
    for (const id of ["goals", "baseline", "activity", "safety", "review"]) {
      assert.match(ONBOARDING, new RegExp(`id: "${id}"`))
    }
    assert.match(ONBOARDING, /Step \{step \+ 1\} of \{steps\.length\}/)
    assert.match(ONBOARDING, /role="progressbar"/)
  })

  test("removes decorative illustrations, hard-coded theme colors, and tiny display copy", () => {
    assert.doesNotMatch(ONBOARDING, /\/onboarding\/|OnboardingIllustration/)
    assert.doesNotMatch(ONBOARDING, /#[0-9a-fA-F]{3,8}|font-black|uppercase/)
    assert.doesNotMatch(ONBOARDING, /text-\[(?:9|10|11|12)(?:px|\.5px)/)
  })

  test("the unused duplicate onboarding implementation is no longer imported", () => {
    assert.doesNotMatch(MAIN, /pages\/Onboarding\.tsx/)
    assert.match(MAIN, /OnboardingMobile/)
  })
})

describe("shared native interface cleanup", () => {
  test("settings switches use a 44px interaction target", () => {
    assert.match(SETTINGS, /inline-flex h-11 w-14/)
    assert.match(SETTINGS, /role="switch"/)
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
