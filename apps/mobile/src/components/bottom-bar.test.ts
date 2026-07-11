import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SOURCE = readFileSync(
  new URL("./bottom-bar.tsx", import.meta.url),
  "utf8"
)

describe("bottom bar accessibility contract", () => {
  test("mobile tab buttons expose names and current page state", () => {
    expect(SOURCE).toContain("aria-label={label}")
    expect(SOURCE).toContain('aria-current={active ? "page" : undefined}')
  })

  test("desktop brand action exposes an explicit accessible name", () => {
    expect(SOURCE).toContain('aria-label="Go to Today"')
  })

  test("desktop sidebar does not render a persistent quick add button", () => {
    expect(SOURCE).not.toContain("PersistentQuickAdd")
    expect(SOURCE).not.toContain('aria-label="Quick add"')
  })

  test("desktop sidebar stays single and persistent during route transitions", () => {
    expect(SOURCE).toContain('chromeState !== "previous"')
    expect(SOURCE).toContain('chromeState !== "previous-ready"')
    expect(SOURCE).toContain("{renderDesktopSidebar && (")
    expect(SOURCE).toContain('className="desktop-sidebar fixed')
    expect(SOURCE).not.toContain("desktop-sidebar motion-card")
    expect(SOURCE).not.toContain('className="app-route-chrome desktop-sidebar')
  })

  test("settings moves from the primary tabs into responsive profile actions", () => {
    expect(SOURCE).not.toContain('{ path: "/settings", Icon:')
    expect(SOURCE).toContain('aria-label="Open profile and settings"')
    expect(SOURCE).toContain("APP_TOOLTIP_IDS.profileMobile")
    expect(SOURCE).toContain("APP_TOOLTIP_IDS.profileDesktop")
    expect(SOURCE).toContain("top-[var(--app-safe-top)]")
    expect(SOURCE).toContain("Profile & settings")
  })
})
