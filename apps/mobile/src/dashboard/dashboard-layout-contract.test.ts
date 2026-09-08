import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8")
const timeline = readFileSync(new URL("./timeline.tsx", import.meta.url), "utf8")
const weekStrip = readFileSync(new URL("./week-strip.tsx", import.meta.url), "utf8")
const styles = readFileSync(
  new URL("../styles/index.css", import.meta.url),
  "utf8"
)
const dials = readFileSync(new URL("./dials.tsx", import.meta.url), "utf8")

describe("responsive dashboard layout", () => {
  test("keeps the two-column rearrangement behind the desktop breakpoint", () => {
    expect(styles).toMatch(
      /@media \(min-width: 1024px\)[\s\S]*?\.dashboard-today-body[\s\S]*?grid-template-columns:/
    )
    expect(app).toContain('className="dashboard-today-body')
  })

  test("uses one date control and no summary rail below desktop", () => {
    expect(app).toContain('dashboard-day-rail mx-auto hidden')
    expect(app).toContain("<MobileDateSelector")
    expect(app).toContain("lg:hidden")
    expect(app).toContain("lg:flex")
    expect(weekStrip).toContain('type="date"')
    expect(weekStrip).toContain("max={todayKey}")
    expect(weekStrip).toContain('type="button"')
    expect(weekStrip).toContain("input.showPicker()")
    expect(weekStrip).toContain("input.click()")
    expect(app).not.toContain("shrink-0 px-6 pt-3 pb-4 lg:hidden")
    expect(app).toContain('-mr-1 flex items-center gap-1 lg:hidden')
  })

  test("lets the mobile timeline fill the space released by the date rail", () => {
    expect(app).toContain(
      'dashboard-timeline-stage flex min-h-0 flex-1 justify-center'
    )
    expect(
      styles.indexOf(".dashboard-timeline-stage .day-timeline::before")
    ).toBeLessThan(styles.indexOf("@media (min-width: 1024px)"))
  })

  test("keeps the centered timeline pill stable when the day changes", () => {
    expect(timeline).not.toContain("scale-[0.94]")
    expect(timeline).not.toContain("scale-[0.84]")
    expect(weekStrip).toContain('className="flex min-h-7')
  })

  test("slides the full-width week bar up for each selected day", () => {
    expect(weekStrip).toContain("duration: 1200")
    expect(weekStrip).toContain("useLayoutEffect")
    expect(weekStrip).toContain("slideAnimation.current?.playState")
    expect(weekStrip).toContain("window.getComputedStyle(node).transform")
    expect(weekStrip).toContain("prefers-reduced-motion: reduce")
  })

  test("uses larger icon-led dials and a desktop-only widget action", () => {
    expect(dials).toContain("const DIAL = 80")
    expect(dials).toContain("const HOLD = 112")
    expect(dials).toContain("<ForkKnife")
    expect(dials).toContain("<Heartbeat")
    expect(dials).toContain("<Barbell")
    expect(dials).toContain("<Play")
    expect(dials).toContain("onShortPress={onStartWorkoutTip}")
    expect(app).toContain("Add widget")
    expect(app).toContain("hidden min-h-12")
    expect(app).toContain("lg:flex")
    expect(app).toContain("Press and hold to start an open workout.")
  })
})
