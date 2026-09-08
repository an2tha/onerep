import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const NAVIGATION = readFileSync(
  new URL("../../../packages/ui/src/components/app-navigation.tsx", import.meta.url),
  "utf8"
)
const AUTH_MARK = readFileSync(
  new URL("./components/auth-shell.tsx", import.meta.url),
  "utf8"
)
const ONBOARDING = readFileSync(
  new URL("./pages/OnboardingMobile.tsx", import.meta.url),
  "utf8"
)
const APP_ENTRY = readFileSync(new URL("./main.tsx", import.meta.url), "utf8")

test("keeps genuine OneRep wordmarks in the original brand font", () => {
  for (const source of [NAVIGATION, AUTH_MARK, ONBOARDING, APP_ENTRY]) {
    expect(source).toContain(
      `style={{ fontFamily: '\"Instrument Sans Variable\", sans-serif' }}`
    )
  }
})
