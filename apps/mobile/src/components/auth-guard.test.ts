import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const AUTH_GUARD_SOURCE = readFileSync(
  new URL("./auth-guard.tsx", import.meta.url),
  "utf8",
)

describe("AuthGuard source contract", () => {
  test("auth loading state renders explanatory copy", () => {
    expect(AUTH_GUARD_SOURCE).toContain("Checking sign in")
    expect(AUTH_GUARD_SOURCE).toContain("connecting your saved session")
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
