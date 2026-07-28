import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const AUTH_GUARD_SOURCE = readFileSync(
  new URL("./auth-guard.tsx", import.meta.url),
  "utf8"
)

describe("AuthGuard source contract", () => {
  test("uses Convex authentication as the protected-route source of truth", () => {
    expect(AUTH_GUARD_SOURCE).toContain("useConvexAuth")
    expect(AUTH_GUARD_SOURCE).toContain(
      "if (convexAuth.isAuthenticated) return <>{children}</>"
    )
    expect(AUTH_GUARD_SOURCE).toContain(
      "Convex authentication is the source of truth"
    )
  })

  test("keeps a newly signed-in session alive during Convex token hydration", () => {
    expect(AUTH_GUARD_SOURCE).toContain("Finishing sign in")
    expect(AUTH_GUARD_SOURCE).toContain("if (!authServiceConfigured || authLoadTimedOut || isSignedIn) return")
    expect(AUTH_GUARD_SOURCE).toContain(
      "never destroy the newly created session"
    )
  })

  test("surfaces a recoverable handoff timeout instead of creating a redirect loop", () => {
    expect(AUTH_GUARD_SOURCE).toContain("CONVEX_AUTH_HANDOFF_TIMEOUT_MS")
    expect(AUTH_GUARD_SOURCE).toContain("Sign-in service unavailable")
    expect(AUTH_GUARD_SOURCE).toContain("Retry")
    expect(AUTH_GUARD_SOURCE).toContain("Sign out and start again")
  })

  test("unauthenticated protected routes render a visible sign-in handoff", () => {
    expect(AUTH_GUARD_SOURCE).toContain("Taking you to sign in")
    expect(AUTH_GUARD_SOURCE).toContain("Continue to sign in")
    expect(AUTH_GUARD_SOURCE).toContain("handleUnauthenticatedSession")
  })
})
