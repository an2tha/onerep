import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const EMAIL_VERIFIED_SOURCE = readFileSync(
  new URL("./EmailVerified.tsx", import.meta.url),
  "utf8"
)
const VERIFY_REQUIRED_SOURCE = readFileSync(
  new URL("./VerifyEmailRequired.tsx", import.meta.url),
  "utf8"
)

describe("email verification mobile contract", () => {
  test("verified-email auth handoff has visible busy copy", () => {
    expect(EMAIL_VERIFIED_SOURCE).toContain("const checkingAuth")
    expect(EMAIL_VERIFIED_SOURCE).toContain("useConvexAuth")
    expect(EMAIL_VERIFIED_SOURCE).toContain("convexAuth.isAuthenticated")
    expect(EMAIL_VERIFIED_SOURCE).toContain(
      "Checking your sign-in state so we can send you to the right place."
    )
    expect(EMAIL_VERIFIED_SOURCE).toContain("disabled={checkingAuth}")
    expect(EMAIL_VERIFIED_SOURCE).toContain("aria-busy={checkingAuth}")
  })

  test("verification-required page keeps a recovery action available", () => {
    // The heading carries this now; the eyebrow above it was removed.
    expect(VERIFY_REQUIRED_SOURCE).toContain("Check your email")
    expect(VERIFY_REQUIRED_SOURCE).toContain(
      'navigate(hasPendingEmail ? "/login?mode=signup" : "/login"'
    )
    expect(VERIFY_REQUIRED_SOURCE).toContain(
      '{hasPendingEmail ? "Back to sign up" : "Back to sign in"}'
    )
  })
})
