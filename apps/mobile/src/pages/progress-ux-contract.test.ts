import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

const progress = `${source("./Progress.tsx")}\n${source(
  "../../../../packages/ui/src/components/progress-views.tsx"
)}`
const tooltips = `${source("../components/tooltips.tsx")}\n${source(
  "../../../../packages/ui/src/components/app-feedback.tsx"
)}`
const dashboardInsights = source(
  "../../../../packages/ui/src/components/dashboard-progress-panels.tsx"
)
const home = source("../../../../packages/ui/src/components/home/index.tsx")
const app = source("../App.tsx")

describe("progress UX contract", () => {
  test("explains calculations and gives each progress area a next action", () => {
    assert.match(progress, /What to do next/)
    assert.match(progress, /Empty days are not counted as zero-calorie days/)
    assert.match(progress, /It is a simple consistency proxy/)
    assert.match(progress, /Add measurement/)
    assert.match(progress, /Open nutrition diary/)
    assert.match(progress, /Open training/)
  })

  test("metric help is user-invoked and has an accessible touch target", () => {
    assert.match(tooltips, /export function MetricTooltip/)
    assert.match(tooltips, /aria-label={`About \${label}`}/)
    assert.match(tooltips, /min-h-11 min-w-11/)
    assert.match(progress, /<MetricTooltip/)
  })

  test("today summaries have explicit meaning and readable equations", () => {
    assert.match(home, /Training this week/)
    assert.match(home, /completed session/)
    assert.match(home, /Number\(day.date.slice\(-2\)\)/)
    assert.doesNotMatch(dashboardInsights, /budgetWidth/)
    assert.match(dashboardInsights, /rounded-full/)
    assert.match(dashboardInsights, /maintenance minus the planned/)
  })

  test("quick add uses consistent sheet gutters and safe-area spacing", () => {
    assert.match(
      app,
      /px-5 pt-4 pb-\[max\(1\.25rem,env\(safe-area-inset-bottom\)\)\]/
    )
    assert.match(app, /flex min-h-16 w-full items-center gap-3 px-1/)
  })
})
