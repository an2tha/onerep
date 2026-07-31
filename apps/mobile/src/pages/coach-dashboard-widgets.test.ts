import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const coachSource = [
  readFileSync(new URL("./Coach.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("../lib/coach-chat.tsx", import.meta.url), "utf8"),
].join("\n")
const widgetSource = readFileSync(
  new URL(
    "../../../../packages/ui/src/components/home/coach-dashboard-widgets.tsx",
    import.meta.url
  ),
  "utf8"
)
const generatedPrompts = readFileSync(
  new URL("../../../../convex/ai/prompts.generated.ts", import.meta.url),
  "utf8"
)

describe("Coach-created dashboard widgets", () => {
  test("asks before adding a generated widget to the dashboard", () => {
    expect(coachSource).toContain(
      "Include this compact widget in your dashboard?"
    )
    expect(coachSource).toContain("Add to dashboard")
    expect(coachSource).toContain("setDashboardWidgetPinned")
  })

  test("renders compact counter, stat, progress, sparkline, and decay views", () => {
    for (const kind of ["counter", "stat", "progress", "sparkline", "decay"]) {
      expect(widgetSource).toContain(`\"${kind}\"`)
    }
    expect(widgetSource).toContain("min-h-28")
    expect(widgetSource).toContain("Estimate ·")
    expect(widgetSource).toContain("widget.metricStep")
    expect(widgetSource).toContain("onSetValue")
  })

  test("suggests follow-ups without silently creating them", () => {
    expect(coachSource).toContain("Suggested follow-up")
    expect(generatedPrompts).toContain(
      "create the follow-up until the user chooses it"
    )
    expect(generatedPrompts).toContain("Keep dashboard widgets extremely")
  })
})
