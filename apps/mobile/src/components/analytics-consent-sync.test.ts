import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const COMPONENT = readFileSync(
  new URL("./analytics-consent-sync.tsx", import.meta.url),
  "utf8"
)
const AUTH_SESSION = readFileSync(
  new URL("../lib/auth-session.ts", import.meta.url),
  "utf8"
)

/**
 * The consent cache is read in `main.tsx`, written by this component, and
 * cleared by the sign-out path. Those three have to agree on the key and on
 * the direction: it is account state, so a stale `true` must never outlive the
 * session it belonged to.
 */
describe("analytics consent cache", () => {
  test("re-primes the same key the boot path reads", () => {
    expect(COMPONENT).toContain('"onerep:analytics-enabled"')
    expect(COMPONENT).toContain("privacySettings?.analyticsEnabled")
  })

  test("puts PostHog in the account's state", () => {
    expect(COMPONENT).toContain("posthog.opt_in_capturing()")
    expect(COMPONENT).toContain("posthog.opt_out_capturing()")
  })

  test("waits for the account's answer before touching anything", () => {
    expect(COMPONENT).toContain("if (!loaded) return")
  })

  test("treats an account with no saved consent as no consent", () => {
    expect(COMPONENT).toContain("if (saved === true)")
    expect(COMPONENT).toContain(
      'safeLocalStorageRemove("onerep:analytics-enabled")'
    )
  })

  test("is not treated as a device-local key on sign-out", () => {
    const deviceLocalList = AUTH_SESSION.slice(
      AUTH_SESSION.indexOf("const DEVICE_LOCAL_KEY_PREFIXES"),
      AUTH_SESSION.indexOf("const AUTH_REDIRECT_COOLDOWN_MS")
    )
    expect(deviceLocalList).not.toContain("onerep:analytics-enabled")
  })
})
