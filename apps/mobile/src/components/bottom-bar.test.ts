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
})
