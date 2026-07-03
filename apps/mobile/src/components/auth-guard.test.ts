import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const AUTH_GUARD_SOURCE = readFileSync(
  new URL("./auth-guard.tsx", import.meta.url),
  "utf8",
)

describe("AuthGuard source contract", () => {
  test("auth loading does not trap users behind a checking screen", () => {
    expect(AUTH_GUARD_SOURCE).not.toContain("Checking sign in")
    expect(AUTH_GUARD_SOURCE).not.toContain("AUTH_LOAD_GRACE_MS")
    expect(AUTH_GUARD_SOURCE).toContain("authLoadTimedOut")
    expect(AUTH_GUARD_SOURCE).toContain("Sign-in service unavailable")
    expect(AUTH_GUARD_SOURCE).toContain("Retry")
    expect(AUTH_GUARD_SOURCE).toContain("if (!isLoaded) {")
    expect(AUTH_GUARD_SOURCE).toContain("return null")
  })

  test("unauthenticated protected routes render a visible sign-in handoff", () => {
    expect(AUTH_GUARD_SOURCE).not.toContain("if (!isSignedIn) return null")
    expect(AUTH_GUARD_SOURCE).toContain("Taking you to sign in")
    expect(AUTH_GUARD_SOURCE).toContain("Continue to sign in")
    expect(AUTH_GUARD_SOURCE).toContain(
      "void handleUnauthenticatedSession({ navigate, signOut })",
    )
  })
})
