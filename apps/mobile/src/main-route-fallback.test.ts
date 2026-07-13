import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const MAIN_SOURCE = readFileSync(new URL("./main.tsx", import.meta.url), "utf8")

describe("mobile route fallback contract", () => {
  test("route transitions expose a loading state without replacing the app shell", () => {
    expect(MAIN_SOURCE).toContain("app-route-frame-current")
    expect(MAIN_SOURCE).toContain("data-route-loading")
    expect(MAIN_SOURCE).toContain("data-route-path={location.pathname}")
    expect(MAIN_SOURCE).toContain(
      "data-route-path={routeTransition.fromPathname}"
    )
    expect(MAIN_SOURCE).toContain("waitForRouteContent")
  })

  test("app root uses Better Auth for Convex sessions", () => {
    expect(MAIN_SOURCE).toContain("ConvexBetterAuthProvider")
    expect(MAIN_SOURCE).toContain("providerAuthClient")
    expect(MAIN_SOURCE).toContain("window.__onerepSignOut = signOutApp")
    expect(MAIN_SOURCE).not.toContain("ClerkProvider")
  })
})
