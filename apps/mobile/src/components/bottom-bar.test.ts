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

  test("primary navigation exposes its stable labeled destinations", () => {
    for (const label of [
      "Today",
      "Nutrition",
      "Training",
      "Progress",
      "Coach",
    ]) {
      expect(SOURCE).toContain(`label: "${label}"`)
    }
  })

  test("the slide order matches the order the tabs are drawn in", () => {
    const tabs = readFileSync(
      new URL("./bottom-bar.tsx", import.meta.url),
      "utf8"
    )
    const navigation = readFileSync(
      new URL("../lib/navigation.ts", import.meta.url),
      "utf8"
    )

    function quotedStrings(source: string) {
      return [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1])
    }

    const drawn = quotedStrings(
      tabs.match(/const TABS = \[([\s\S]*?)\] as const/)?.[1] ?? ""
    ).filter((value) => value.startsWith("/"))
    const slideOrder = quotedStrings(
      navigation.match(/PRIMARY_TAB_ORDER = \[([\s\S]*?)\]/)?.[1] ?? ""
    )

    // The transition direction is the difference between two indexes in
    // PRIMARY_TAB_ORDER. Out of order, pressing a tab slides the page the
    // wrong way.
    assert.deepEqual(slideOrder, drawn)
  })

  test("the tab grid tracks the tab count instead of a hardcoded column class", () => {
    expect(SOURCE).toContain(
      "gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`"
    )
    expect(SOURCE).not.toContain("grid-cols-5")
  })

  test("Coach navigation stays light in light mode and dark in dark mode", () => {
    expect(SOURCE).toContain(
      "border-border bg-background/96 dark:border-white/10 dark:bg-[#020817]/96"
    )
    expect(SOURCE).toContain("text-foreground dark:text-white")
    expect(SOURCE).toContain(
      "text-muted-foreground active:text-foreground dark:text-white/55 dark:active:text-white"
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
    expect(SOURCE).toContain(
      'className="desktop-sidebar app-route-sidebar fixed'
    )
    expect(SOURCE).not.toContain("desktop-sidebar motion-card")
    expect(SOURCE).not.toContain('className="app-route-chrome desktop-sidebar')
  })

  test("settings stays out of the primary tabs and remains in the desktop profile area", () => {
    expect(SOURCE).not.toContain('{ path: "/settings", Icon:')
    expect(SOURCE).toContain('aria-label="Open profile and settings"')
    // The walkthrough points here instead of a standalone tooltip.
    expect(SOURCE).toContain('anchor="today-profile"')
    expect(SOURCE).toContain("Profile & settings")
  })
})
