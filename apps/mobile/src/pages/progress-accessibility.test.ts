import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const PROGRESS_SOURCE = readFileSync(
  new URL("./Progress.tsx", import.meta.url),
  "utf8"
)

describe("Progress page accessibility contract", () => {
  test("progress page reads the existing body, workout, food, and goal data", () => {
    expect(PROGRESS_SOURCE).toContain("api.bodyProgress.list")
    expect(PROGRESS_SOURCE).toContain("api.logs.workouts.getHistory")
    expect(PROGRESS_SOURCE).toContain("api.logs.foodLogs.getRecent")
    expect(PROGRESS_SOURCE).toContain("api.users.users.getEffectiveGoals")
    expect(PROGRESS_SOURCE).not.toContain("return null")
  })

  test("weekly visual summaries have accessible chart and navigation labels", () => {
    expect(PROGRESS_SOURCE).toContain(
      'aria-label="Seven-day nutrition chart. Filled bars show calorie progress. Purple dots mark protein target days."'
    )
    expect(PROGRESS_SOURCE).toContain(
      'aria-label="Seven-day training chart. Bar height represents completed sets."'
    )
    expect(PROGRESS_SOURCE).toContain('aria-label="Open nutrition week"')
    expect(PROGRESS_SOURCE).toContain('aria-label="Open training week"')
  })

  test("progress stays compact and does not restore the text-heavy legacy editor", () => {
    expect(PROGRESS_SOURCE).not.toContain("Progress photo")
    expect(PROGRESS_SOURCE).not.toContain("Save check-in")
    expect(PROGRESS_SOURCE).not.toContain("Metric library")
  })
})
