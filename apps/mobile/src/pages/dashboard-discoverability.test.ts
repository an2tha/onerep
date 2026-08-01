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
  test("keeps the dashboard free of duplicate prompting controls", () => {
    expect(app).not.toContain("showBriefingAction")
    expect(home).not.toContain("Briefing banner")
    expect(app).not.toContain("<NextStepCard")
    expect(app).not.toContain("<DashboardQuickActions")
    expect(app).not.toContain("<TodayChecklist")
  })

  test("provides guidance and explicit activity controls", () => {
    // The guided walkthrough replaced the unused first-week card.
    expect(home).not.toContain("FirstWeekGuide")
    expect(app).toContain('anchor="today-log-meal"')
    expect(app).toContain('anchor="today-ledger"')
    expect(home).toContain("View all activity")
    expect(home).toContain("Edit ${event.title}")
  })

  test("supports a simpler dashboard preference", () => {
    expect(app).toContain("settings.simpleMode")
  })

  test("keeps the energy summary compact without duplicating macro facts", () => {
    expect(home).toContain("CalorieRing")
    expect(home).toContain("macros.map")
    expect(home).not.toContain("proteinLeft")
    expect(home).not.toContain('open ? "Hide breakdown" : "Show breakdown"')
  })

  test("links quick add inspiration to the recipes hub", () => {
    expect(app).toContain("Inspire me")
    expect(app).toContain('navigate("/recipes")')
  })
})
