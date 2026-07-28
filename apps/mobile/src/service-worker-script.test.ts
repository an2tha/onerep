import { describe, expect, test } from "bun:test"

const sw = await Bun.file(new URL("../public/sw.js", import.meta.url)).text()

describe("public service worker", () => {
  test("caches the app shell and install assets", () => {
    expect(sw).toContain('const CACHE_NAME = "onerep-app-v3"')
    expect(sw).toContain('"/index.html"')
    expect(sw).toContain('"/site.webmanifest"')
    expect(sw).toContain('"/icon-512.png"')
    expect(sw).toContain('"/icon-maskable-512.png"')
  })

  test("does not cache mutating or backend requests", () => {
    expect(sw).toContain('if (request.method !== "GET") return')
    expect(sw).toContain('url.pathname.startsWith("/api/")')
    expect(sw).toContain('url.pathname.startsWith("/_convex/")')
  })

  test("uses the cached shell for failed navigations", () => {
    expect(sw).toContain('if (request.mode === "navigate")')
    expect(sw).toContain('caches.match("/index.html")')
    expect(sw).toContain('cache.put("/index.html", response.clone())')
  })

  test("supports user-triggered update activation", () => {
    expect(sw).toContain('event.data?.type === "SKIP_WAITING"')
    expect(sw).toContain("self.skipWaiting()")
  })

  test("does not poison the cache with fallback MIME types", () => {
    expect(sw).toContain('request.destination === "script"')
    expect(sw).toContain('contentType.includes("javascript")')
    expect(sw).toContain('request.destination === "style"')
    expect(sw).toContain('contentType.includes("text/css")')
    expect(sw).toContain(
      "response.ok && hasExpectedMimeType(request, response)"
    )
  })
})
