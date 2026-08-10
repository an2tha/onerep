import { describe, expect, test } from "bun:test"
import {
  detectPwaInstallPlatform,
  isPwaStandalone,
  pwaInstallCopy,
} from "../pwa-install"

function fakeWindow({
  displayMode = false,
  fullscreen = false,
  standalone = false,
}: {
  displayMode?: boolean
  fullscreen?: boolean
  standalone?: boolean
}) {
  return {
    navigator: { standalone },
    matchMedia: (query: string) => ({
      matches:
        (query === "(display-mode: standalone)" && displayMode) ||
        (query === "(display-mode: fullscreen)" && fullscreen),
    }),
  } as unknown as Window
}

describe("PWA install helpers", () => {
  test("detects standalone display mode", () => {
    expect(isPwaStandalone(fakeWindow({ displayMode: true }))).toBe(true)
  })

  test("detects iOS navigator standalone mode", () => {
    expect(isPwaStandalone(fakeWindow({ standalone: true }))).toBe(true)
  })

  test("detects fullscreen installed mode", () => {
    expect(isPwaStandalone(fakeWindow({ fullscreen: true }))).toBe(true)
  })

  test("reports install-ready copy when a prompt is available", () => {
    expect(pwaInstallCopy({ hasPrompt: true, installed: false })).toEqual({
      actionLabel: "Install",
      description: "Add OneRep to your home screen for faster launches.",
      disabled: false,
      statusLabel: "Ready",
    })
  })

  test("reports installed copy when already running as an app", () => {
    expect(pwaInstallCopy({ hasPrompt: true, installed: true })).toEqual({
      actionLabel: "Installed",
      description: "OneRep is already installed on this device.",
      disabled: true,
      statusLabel: "Installed",
    })
  })

  test("keeps the tile tappable with generic guidance when no prompt exists", () => {
    const copy = pwaInstallCopy({ hasPrompt: false, installed: false })
    expect(copy.disabled).toBe(false)
    expect(copy.statusLabel).toBe("Manual")
    expect(copy.description).toContain("home screen")
  })

  test("gives iOS users the Share → Add to Home Screen steps", () => {
    const copy = pwaInstallCopy({
      hasPrompt: false,
      installed: false,
      platform: "ios",
    })
    expect(copy.disabled).toBe(false)
    expect(copy.description).toContain("Add to Home Screen")
    expect(copy.description).toContain("Share")
  })

  test("tells in-app browser users to escape to a real browser", () => {
    const copy = pwaInstallCopy({
      hasPrompt: false,
      installed: false,
      platform: "in-app",
    })
    expect(copy.statusLabel).toBe("Blocked")
    expect(copy.description).toContain("app.onerep.life")
  })

  test("points desktop Safari at Add to Dock", () => {
    expect(
      pwaInstallCopy({
        hasPrompt: false,
        installed: false,
        platform: "safari-desktop",
      }).description
    ).toContain("Add to Dock")
  })
})

function uaWindow(userAgent: string, maxTouchPoints = 0) {
  return { navigator: { userAgent, maxTouchPoints } } as unknown as Window
}

describe("detectPwaInstallPlatform", () => {
  test("detects iPhone Safari", () => {
    expect(
      detectPwaInstallPlatform(
        uaWindow(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
        )
      )
    ).toBe("ios")
  })

  test("detects iPadOS masquerading as a Mac via touch points", () => {
    expect(
      detectPwaInstallPlatform(
        uaWindow(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
          5
        )
      )
    ).toBe("ios")
  })

  test("detects Chrome on Android", () => {
    expect(
      detectPwaInstallPlatform(
        uaWindow(
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
        )
      )
    ).toBe("chromium")
  })

  test("detects desktop Safari", () => {
    expect(
      detectPwaInstallPlatform(
        uaWindow(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
        )
      )
    ).toBe("safari-desktop")
  })

  test("detects the Instagram in-app browser", () => {
    expect(
      detectPwaInstallPlatform(
        uaWindow(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.0"
        )
      )
    ).toBe("in-app")
  })

  test("detects an Android webview", () => {
    expect(
      detectPwaInstallPlatform(
        uaWindow(
          "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AD1A.240418.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36"
        )
      )
    ).toBe("in-app")
  })

  test("falls back to other for Firefox desktop", () => {
    expect(
      detectPwaInstallPlatform(
        uaWindow(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0"
        )
      )
    ).toBe("other")
  })
})
