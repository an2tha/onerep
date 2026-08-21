import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

const FASTING_SOURCE = readFileSync(
  new URL("./Fasting.tsx", import.meta.url),
  "utf8"
)
const NUTRITION_SOURCE = readFileSync(
  new URL("./Nutrition.tsx", import.meta.url),
  "utf8"
)
const MAIN_SOURCE = readFileSync(
  new URL("../main.tsx", import.meta.url),
  "utf8"
)
// Task-route registration lives with the navigation helpers, not the router.
const NAVIGATION_SOURCE = readFileSync(
  new URL("../lib/navigation.ts", import.meta.url),
  "utf8"
)

describe("fasting page accessibility", () => {
  test("each preset button names the protocol it starts", () => {
    expect(FASTING_SOURCE).toContain(
      "aria-label={`Start ${preset.label} fast`}"
    )
  })

  test("the primary actions are labelled", () => {
    expect(FASTING_SOURCE).toContain('aria-label="End fast"')
    expect(FASTING_SOURCE).toContain('aria-label="Start custom fast"')
    expect(FASTING_SOURCE).toContain('aria-label="Edit fast start time"')
    expect(FASTING_SOURCE).toContain('aria-label="Start fast from last meal"')
  })

  test("the running elapsed time is announced to screen readers", () => {
    expect(FASTING_SOURCE).toContain('role="timer"')
    expect(FASTING_SOURCE).toContain('aria-live="polite"')
  })

  test("history rows name the fast they delete", () => {
    expect(FASTING_SOURCE).toContain(
      "aria-label={`Delete fast from ${historyDate(session.startDate)}`}"
    )
  })

  test("the custom length input is labelled", () => {
    expect(FASTING_SOURCE).toContain('aria-label="Custom fast length in hours"')
  })
})

describe("fasting discoverability", () => {
  // Fasting has its own card on the nutrition page rather than a row in the
  // add sheet, so the timer is reachable without opening anything first.
  test("nutrition links to the fasting timer from its own card", () => {
    expect(NUTRITION_SOURCE).toContain('navigate("/nutrition/fasting")')
    expect(NUTRITION_SOURCE).toContain('aria-label="Open the fasting timer"')
  })

  test("the fasting entry point stays available on past dates", () => {
    const pastDates = NUTRITION_SOURCE.slice(
      NUTRITION_SOURCE.lastIndexOf("{!isToday && (")
    ).slice(0, 200)
    expect(pastDates).toContain("{fastingCard}")
  })

  test("a running fast surfaces as a live pill in the nutrition header", () => {
    expect(NUTRITION_SOURCE).toContain("api.logs.fasting.getActive")
    expect(NUTRITION_SOURCE).toContain("useFastTimer(")
    expect(NUTRITION_SOURCE).toContain("open the fasting timer")
  })

  test("the route is registered and hides the bottom bar", () => {
    expect(MAIN_SOURCE).toContain('path: "/nutrition/fasting"')
    expect(MAIN_SOURCE).toContain('label="Fasting"')
    const prefixes = NAVIGATION_SOURCE.slice(
      NAVIGATION_SOURCE.indexOf("const TASK_ROUTE_PREFIXES")
    ).slice(0, 400)
    expect(prefixes).toContain('"/nutrition/fasting"')
  })
})
