import { describe, expect, test } from "bun:test"

const sw = await Bun.file(new URL("../public/sw.js", import.meta.url)).text()

describe("public service worker", () => {
  test("caches the app shell and install assets", () => {
    expect(sw).toContain('const CACHE_NAME = "onerep-app-v1"')
    expect(sw).toContain('"/index.html"')
    expect(sw).toContain('"/site.webmanifest"')
    expect(sw).toContain('"/icon-512.png"')
  })

  test("does not cache mutating or backend requests", () => {
    expect(sw).toContain('if (request.method !== "GET") return')
    expect(sw).toContain('url.pathname.startsWith("/api/")')
    expect(sw).toContain('url.pathname.startsWith("/_convex/")')
  })

  test("uses the cached shell for failed navigations", () => {
    expect(sw).toContain('if (request.mode === "navigate")')
    expect(sw).toContain('caches.match("/index.html")')
  })

  test("supports user-triggered update activation", () => {
    expect(sw).toContain('event.data?.type === "SKIP_WAITING"')
    expect(sw).toContain("self.skipWaiting()")
  })
})
