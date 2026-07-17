import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8")
const home = readFileSync(
  new URL(
    "../../../../packages/ui/src/components/home/index.tsx",
    import.meta.url
  ),
  "utf8"
)

describe("Today dashboard discoverability", () => {
  test("keeps one contextual action without duplicate dashboard controls", () => {
    expect(app).toContain("showBriefingAction")
    expect(app).not.toContain("<NextStepCard")
    expect(app).not.toContain("<DashboardQuickActions")
    expect(app).not.toContain("<TodayChecklist")
  })

  test("provides guidance and explicit activity controls", () => {
    expect(home).toContain("Your first-week guide")
    expect(home).toContain("View all activity")
    expect(home).toContain("Edit ${event.title}")
  })

  test("supports a simpler dashboard preference", () => {
    expect(app).toContain("settings.simpleMode")
  })

  test("keeps the energy summary compact", () => {
    expect(home).toContain("grid-cols-3")
    expect(home).toContain("Protein")
    expect(home).toContain("Water")
    expect(home).not.toContain('open ? "Hide breakdown" : "Show breakdown"')
  })

  test("links quick add inspiration to the recipes hub", () => {
    expect(app).toContain("Inspire me")
    expect(app).toContain('navigate("/recipes")')
  })
})
