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
})
