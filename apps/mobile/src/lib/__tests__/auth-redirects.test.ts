import { beforeEach, describe, expect, mock, test } from "bun:test"

const isNativePlatform = mock(() => false)

mock.module("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform,
  },
}))

describe("auth redirect helpers", () => {
  beforeEach(() => {
    isNativePlatform.mockReset()
    isNativePlatform.mockImplementation(() => false)
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          hostname: "127.0.0.1",
          origin: "http://127.0.0.1:5177",
          protocol: "http:",
        },
      },
      configurable: true,
    })
  })

  test("uses the configured production web origin outside Vite dev", async () => {
    const { getAuthCallbackUrl } = await import("../auth-redirects")

    expect(getAuthCallbackUrl("/sso-callback?next=/foods")).toBe(
      "https://app.onerep.life/sso-callback?next=/foods"
    )
  })

  test("uses the registered Capacitor scheme in native builds", async () => {
    isNativePlatform.mockImplementation(() => true)
    const { getAuthCallbackUrl } = await import("../auth-redirects")

    expect(getAuthCallbackUrl("/sso-callback?next=/foods")).toBe(
      "onerep://auth/sso-callback?next=/foods"
    )
  })

  test("sends social sign-in returns through the sso-callback screen", async () => {
    const { getSocialCallbackUrl } = await import("../auth-redirects")

    expect(getSocialCallbackUrl("/foods")).toBe(
      "https://app.onerep.life/sso-callback?next=%2Ffoods&method=google"
    )
  })

  test("marks first-time social sign-ups so onboarding is reported once", async () => {
    const { getSocialCallbackUrl } = await import("../auth-redirects")

    expect(getSocialCallbackUrl("/onboarding", { isNewUser: true })).toBe(
      "https://app.onerep.life/sso-callback?next=%2Fonboarding&method=google&new=1"
    )
  })
})
