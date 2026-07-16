import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const SOURCE = [
  "./bottom-bar.tsx",
  "../../../../packages/ui/src/components/app-navigation.tsx",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n")

function expect(value: string) {
  return {
    toContain(expected: string) {
      assert.ok(
        value.includes(expected),
        `Expected source to contain ${expected}`
      )
    },
    not: {
      toContain(expected: string) {
        assert.ok(
          !value.includes(expected),
          `Expected source not to contain ${expected}`
        )
      },
    },
  }
}

describe("bottom bar accessibility contract", () => {
  test("mobile tab buttons expose names and current page state", () => {
    expect(SOURCE).toContain("aria-label={tab.label}")
    expect(SOURCE).toContain('aria-current={tab.active ? "page" : undefined}')
  })

  test("primary navigation exposes five stable labeled destinations", () => {
    for (const label of [
      "Today",
      "Nutrition",
      "Training",
      "Progress",
      "Coach",
    ]) {
      expect(SOURCE).toContain(`label: "${label}"`)
    }
    expect(SOURCE).toContain(
      '"mx-auto grid h-[4.25rem] max-w-xl grid-cols-5 px-1"'
    )
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

  test("settings stays out of the primary tabs and remains in the desktop profile area", () => {
    expect(SOURCE).not.toContain('{ path: "/settings", Icon:')
    expect(SOURCE).toContain('aria-label="Open profile and settings"')
    expect(SOURCE).toContain("APP_TOOLTIP_IDS.profileDesktop")
    expect(SOURCE).toContain("Profile & settings")
  })
})
