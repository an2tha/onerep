import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const REPORT_SOURCE = readFileSync(
  new URL("./NutritionReport.tsx", import.meta.url),
  "utf8"
)
const UI_STYLES = readFileSync(
  new URL("../../../../packages/ui/src/index.css", import.meta.url),
  "utf8"
)
const NUTRITION_SOURCE = readFileSync(
  new URL("./Nutrition.tsx", import.meta.url),
  "utf8"
)

describe("Nutrition report contract", () => {
  test("the print action is named", () => {
    expect(REPORT_SOURCE).toContain('aria-label="Print report"')
  })

  test("the range picker is a labelled group with pressed states", () => {
    expect(REPORT_SOURCE).toContain('aria-label="Report period"')
    expect(REPORT_SOURCE).toContain("aria-pressed={range === option.id}")
  })

  test("app chrome is marked so it drops out of the printed page", () => {
    expect(REPORT_SOURCE).toContain('className="print-hidden"')
    expect(REPORT_SOURCE).toContain("print-sheet")
  })

  test("sections avoid page breaks and the diary starts a fresh page", () => {
    expect(REPORT_SOURCE).toContain("print-block")
    expect(REPORT_SOURCE).toContain("print-break-before")
  })

  test("printing goes through window.print with a guard", () => {
    expect(REPORT_SOURCE).toContain("window.print()")
    expect(REPORT_SOURCE).toContain('typeof window.print !== "function"')
  })

  test("the report states that the figures are self-reported estimates", () => {
    expect(REPORT_SOURCE).toContain("self-reported logs and are estimates")
  })

  test("the stylesheet defines the print rules the page relies on", () => {
    expect(UI_STYLES).toContain("@media print")
    expect(UI_STYLES).toContain(".print-hidden")
    expect(UI_STYLES).toContain(".print-sheet")
    expect(UI_STYLES).toContain(".print-block")
    expect(UI_STYLES).toContain(".print-break-before")
  })

  test("nutrition links to the report from the add sheet", () => {
    expect(NUTRITION_SOURCE).toContain('navigate("/nutrition/report")')
  })
})
