import { describe, expect, test } from "bun:test"
import config from "./capacitor.config"

describe("Capacitor production config", () => {
  test("uses supported local origins for each native WebView", () => {
    expect(config.server).toMatchObject({
      hostname: "localhost",
      iosScheme: "capacitor",
      androidScheme: "https",
    })
  })

  test("packages built web assets instead of a live dev server", () => {
    expect(config.webDir).toBe("dist")
    expect(config.server).not.toHaveProperty("url")
  })

  test("uses native Android networking for cross-origin auth requests", () => {
    expect(config.plugins?.CapacitorHttp).toEqual({ enabled: true })
    expect(config.plugins?.CapacitorCookies).toEqual({ enabled: true })
  })

  test("ships a monochrome status-bar icon so Android does not draw a white square", () => {
    expect(config.plugins?.LocalNotifications?.smallIcon).toBe("ic_stat_onerep")
  })
})

describe("store-only mobile updates", () => {
  test("does not configure or link an executable updater on either platform", () => {
    expect(config.plugins).not.toHaveProperty("CapacitorUpdater")
    for (const platform of [config.ios, config.android]) {
      const plugins = platform?.includePlugins ?? config.includePlugins
      expect(plugins).toBeDefined()
      expect(plugins).not.toContain("@capgo/capacitor-updater")
      expect(plugins).toContain("@capacitor/app")
      expect(plugins).toContain("@capgo/capacitor-speech-recognition")
    }
  })
})
