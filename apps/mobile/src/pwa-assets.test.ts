import { describe, expect, test } from "bun:test"

const publicUrl = new URL("../public/", import.meta.url)
const manifest = await Bun.file(new URL("site.webmanifest", publicUrl)).json()
const html = await Bun.file(new URL("../index.html", import.meta.url)).text()
const main = await Bun.file(new URL("main.tsx", import.meta.url)).text()
const headers = await Bun.file(new URL("_headers", publicUrl)).text()

describe("PWA install surface", () => {
  test("publishes a scoped standalone manifest", () => {
    expect(manifest.id).toBe("/")
    expect(manifest.start_url).toBe("/")
    expect(manifest.scope).toBe("/")
    expect(manifest.display).toBe("standalone")
    expect(manifest.name).toContain("OneRep")
    expect(manifest.short_name).toBe("OneRep")
  })

  test("provides separate any and maskable install icons", async () => {
    const icons = manifest.icons as Array<{
      src: string
      sizes: string
      purpose: string
      type: string
    }>
    expect(
      icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any")
    ).toBe(true)
    expect(
      icons.some(
        (icon) => icon.sizes === "512x512" && icon.purpose === "maskable"
      )
    ).toBe(true)

    for (const icon of icons) {
      expect(icon.type).toBe("image/png")
      const file = Bun.file(new URL(icon.src.replace(/^\//, ""), publicUrl))
      expect(await file.exists()).toBe(true)
      expect(file.size).toBeGreaterThan(1_000)
    }
  })

  test("links install metadata from the document head", () => {
    expect(html).toContain('rel="manifest" href="/site.webmanifest"')
    expect(html).toContain('rel="apple-touch-icon" sizes="180x180"')
    expect(html).toContain('name="mobile-web-app-capable" content="yes"')
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"')
    expect(html).toContain('name="theme-color"')
  })

  test("starts install tracking and service-worker lifecycle management", () => {
    expect(main).toContain("initializePwaInstallTracking()")
    expect(main).toContain("registerAppServiceWorker")
    expect(main).toContain("<PwaLifecycle />")
  })

  test("prevents stale workers and HTML fallback cache poisoning", () => {
    expect(headers).toContain("/sw.js")
    expect(headers).toContain(
      "Cache-Control: no-cache, no-store, must-revalidate"
    )
    expect(headers).toContain("/assets/*")
    expect(headers).toContain(
      "Cache-Control: public, max-age=0, must-revalidate"
    )
    expect(headers).toContain("X-Content-Type-Options: nosniff")
  })
})
