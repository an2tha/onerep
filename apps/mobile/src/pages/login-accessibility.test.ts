import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const LOGIN_SOURCE = readFileSync(
  new URL("./Login.tsx", import.meta.url),
  "utf8"
)
const RESET_SOURCE = readFileSync(
  new URL("./ResetPassword.tsx", import.meta.url),
  "utf8"
)

describe("auth form mobile accessibility and autofill", () => {
  test("login fields expose stable form names", () => {
    expect(LOGIN_SOURCE).toContain('name="email"')
    expect(LOGIN_SOURCE).toContain('name="password"')
    expect(LOGIN_SOURCE).toContain('name="name"')
    expect(LOGIN_SOURCE).toContain('name="one-time-code"')
  })

  test("reset password fields expose stable form names", () => {
    expect(RESET_SOURCE).toContain('name="email"')
    expect(RESET_SOURCE).toContain('name="new-password"')
    expect(RESET_SOURCE).toContain('name="confirm-password"')
    expect(RESET_SOURCE).toContain("token = searchParams.get")
  })

  test("login auth actions use a synchronous single-flight guard", () => {
    expect(LOGIN_SOURCE).toContain("const authActionRef = useRef(false)")
    expect(LOGIN_SOURCE).toContain(
      "if (authActionRef.current || submitting) return"
    )
    expect(LOGIN_SOURCE).toContain("authActionRef.current = true")
    expect(LOGIN_SOURCE).toContain("authActionRef.current = false")
    expect(LOGIN_SOURCE).toContain("setOauthLoading(strategy)")
    expect(LOGIN_SOURCE).toContain("setLoading(true)")
  })

  test("login auth actions fail fast instead of spinning forever", () => {
    expect(LOGIN_SOURCE).toContain("AUTH_ACTION_TIMEOUT_MS")
    expect(LOGIN_SOURCE).toContain("withAuthActionTimeout")
    expect(LOGIN_SOURCE).toContain("is taking too long")
    expect(LOGIN_SOURCE).toContain("betterAuthErrorMessage")
    expect(LOGIN_SOURCE).toContain(
      'setError(betterAuthErrorMessage(error, "Authentication failed"))'
    )
  })

  test("signed-in login redirect fallback explains the handoff", () => {
    expect(LOGIN_SOURCE).toContain("Opening OneRep")
    expect(LOGIN_SOURCE).toContain(
      "Your sign-in is ready. Sending you back to where you left off."
    )
  })

  test("reset password actions use a synchronous single-flight guard", () => {
    expect(RESET_SOURCE).toContain("const resetActionRef = useRef(false)")
    expect(RESET_SOURCE).toContain(
      "if (resetActionRef.current || loading) return"
    )
    expect(RESET_SOURCE).toContain("resetActionRef.current = true")
    expect(RESET_SOURCE).toContain("resetActionRef.current = false")
    expect(RESET_SOURCE).toContain("onClick={() => void sendCode()}")
  })

  test("reset password submit actions expose busy state", () => {
    expect(RESET_SOURCE).toContain("aria-busy={loading}")
    expect(RESET_SOURCE).toMatch(
      /type="submit"\s+disabled=\{loading\}\s+aria-busy=\{loading\}/
    )
    expect(RESET_SOURCE).toMatch(
      /onClick=\{\(\) => void sendCode\(\)\}\s+disabled=\{loading\}\s+aria-busy=\{loading\}/
    )
  })
})
