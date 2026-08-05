import { describe, expect, test } from "bun:test"
import config from "./capacitor.config"

describe("Capacitor production config", () => {
  test("uses a stable HTTPS origin for durable WebView auth storage", () => {
    expect(config.server).toMatchObject({
      hostname: "localhost",
      iosScheme: "https",
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

describe("OTA updater config", () => {
  const updater = () => config.plugins?.CapacitorUpdater

  test("never auto-downloads: the app owns fetch, gating, and apply", () => {
    expect(updater()?.autoUpdate).toBe(false)
  })

  test("is fully self-hosted: no request reaches the Capgo service", () => {
    expect(updater()?.updateUrl).toBe("")
    expect(updater()?.statsUrl).toBe("")
  })

  test("gives a cold start room to mount before the rollback timer fires", () => {
    const timeout = updater()?.appReadyTimeout
    expect(typeof timeout).toBe("number")
    expect(timeout).toBeGreaterThanOrEqual(15000)
  })

  test("drops OTA bundles when a store update replaces the native shell", () => {
    expect(updater()?.resetWhenUpdate).toBe(true)
  })

  test("forbids runtime rewrites of the update source", () => {
    expect(updater()?.allowModifyUrl).toBe(false)
  })
})
