import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SOURCE = readFileSync(new URL("./bottom-bar.tsx", import.meta.url), "utf8")

describe("bottom bar accessibility contract", () => {
  test("mobile tab buttons expose names and current page state", () => {
    expect(SOURCE).toContain("aria-label={label}")
    expect(SOURCE).toContain('aria-current={active ? "page" : undefined}')
  })

  test("icon-only actions have explicit accessible names", () => {
    expect(SOURCE).toContain('aria-label="Add"')
    expect(SOURCE).toContain('aria-label="Quick add"')
    expect(SOURCE).toContain('aria-label="Go to Today"')
  })

  test("mobile quick add exposes a long-press shortcut menu", () => {
    expect(SOURCE).toContain('aria-controls="mobile-quick-actions"')
    expect(SOURCE).toContain("aria-expanded={shortcutOpen}")
    expect(SOURCE).toContain('role="menu"')
    expect(SOURCE).toContain('role="menuitem"')
    expect(SOURCE).toContain("Snap meal")
    expect(SOURCE).toContain("Start workout")
  })

  test("desktop sidebar stays single and persistent during route transitions", () => {
    expect(SOURCE).toContain('chromeState !== "previous"')
    expect(SOURCE).toContain('chromeState !== "previous-ready"')
    expect(SOURCE).toContain("{renderDesktopSidebar && (")
    expect(SOURCE).toContain('className="desktop-sidebar fixed')
    expect(SOURCE).not.toContain("desktop-sidebar motion-card")
    expect(SOURCE).not.toContain('className="app-route-chrome desktop-sidebar')
  })
})
