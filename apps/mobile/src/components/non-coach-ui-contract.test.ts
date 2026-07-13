import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

const foodDetail = source("./food-detail-sheet.tsx")
const offlineStatus = source("./offline-sync-indicator.tsx")
const dateSelector = source("./date-selector-button.tsx")
const errorBoundary = source("./error-boundary.tsx")

function collectTsx(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(
      entry.name + (entry.isDirectory() ? "/" : ""),
      directory
    )
    if (entry.isDirectory()) return collectTsx(child)
    return entry.name.endsWith(".tsx") ? [child] : []
  })
}

describe("non-Coach UI cleanup contract", () => {
  test("food review uses readable rows instead of ornamental dashboards", () => {
    assert.doesNotMatch(foodDetail, /function DonutRing/)
    assert.doesNotMatch(foodDetail, /budgetWidth/)
    assert.match(foodDetail, /How much\?/)
    assert.match(foodDetail, /Full nutrition details/)
    assert.doesNotMatch(foodDetail, /Product code/)
    assert.doesNotMatch(foodDetail, /Selected amount/)
    assert.doesNotMatch(foodDetail, /Package serving/)
  })

  test("transient and failure states keep readable copy and touch targets", () => {
    assert.match(offlineStatus, /text-\[14px\]/)
    assert.match(offlineStatus, /h-11 w-11/)
    assert.match(errorBoundary, /text-\[14px\] leading-6/)
    assert.match(dateSelector, /h-11 w-11/)
    assert.match(dateSelector, /safe-area-inset-bottom/)
  })

  test("unused ornamental demo components stay removed", () => {
    for (const file of [
      "./ui/aurora-background.tsx",
      "./ui/dock.tsx",
      "./ui/dot-background.tsx",
      "./ui/glare-card.tsx",
      "./ui/gooey-input.tsx",
      "./ui/sparkles.tsx",
    ]) {
      assert.equal(existsSync(new URL(file, import.meta.url)), false, file)
    }
  })

  test("primary non-Coach surfaces do not restore tiny low-contrast copy", () => {
    const surfaces = [
      ...collectTsx(new URL("../pages/", import.meta.url)),
      ...collectTsx(new URL("./", import.meta.url)),
    ].filter((file) => !file.pathname.endsWith("/Coach.tsx"))
    const discouraged =
      /text-\[(?:7\.5|8|8\.5|9|9\.5|10|10\.5|11|11\.5|12|12\.5)px\]|text-muted-foreground\/(?:25|30|35|40|45|50|55)/

    for (const file of surfaces) {
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        discouraged,
        file.pathname
      )
    }
  })
})
