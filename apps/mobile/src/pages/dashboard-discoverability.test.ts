import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8")
const home = readFileSync(
  new URL("../components/home/index.tsx", import.meta.url),
  "utf8"
)

describe("Today dashboard discoverability", () => {
  test("keeps daily actions visible without relying on the add menu", () => {
    expect(app).toContain("<NextStepCard")
    expect(app).toContain("<DashboardQuickActions")
    expect(app).toContain("<TodayChecklist")
    expect(app).toContain("Help me decide what to do next")
  })

  test("provides guidance and explicit activity controls", () => {
    expect(home).toContain("Your first-week guide")
    expect(home).toContain("View all activity")
    expect(home).toContain("Edit ${event.title}")
  })

  test("supports a simpler dashboard preference", () => {
    expect(app).toContain("settings.simpleMode")
  })

  test("animates the energy breakdown disclosure", () => {
    expect(home).toContain("<AnimatedAccordion")
    expect(home).toContain('open ? "Hide breakdown" : "Show breakdown"')
  })

  test("links quick add inspiration to the recipes hub", () => {
    expect(app).toContain("Inspire me")
    expect(app).toContain('navigate("/recipes")')
  })
})
