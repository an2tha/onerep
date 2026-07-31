import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const APP_SOURCE = readFileSync(new URL("../App.tsx", import.meta.url), "utf8")
const HOME_SOURCE = readFileSync(
  new URL("../../../../packages/ui/src/components/home/index.tsx", import.meta.url),
  "utf8"
)
const APP_CSS = readFileSync(
  new URL("../../../../packages/ui/src/index.css", import.meta.url),
  "utf8"
)
const SCHEMA_SOURCE = readFileSync(
  new URL("../../../../convex/schema.ts", import.meta.url),
  "utf8"
)

describe("Coach goals on Today", () => {
  test("renders first-party wavy goal cards with durable task controls", () => {
    assert.match(HOME_SOURCE, /export function CoachGoalCards/)
    assert.match(HOME_SOURCE, /coach-goal-card/)
    assert.match(HOME_SOURCE, /goals\.length > 1 && "md:grid-cols-2"/)
    assert.match(
      HOME_SOURCE,
      /data-layout=\{goals\.length === 1 \? "wide" : "compact"\}/
    )
    assert.match(HOME_SOURCE, /Coach goals/)
    assert.match(HOME_SOURCE, /onToggleTask/)
    assert.match(HOME_SOURCE, /aria-pressed=\{task\.completed\}/)
    assert.doesNotMatch(
      HOME_SOURCE,
      /<Sparkle size=\{12\} weight="fill" \/> Coach goal/
    )
    assert.match(APP_CSS, /@keyframes coach-dashboard-wave/)
    assert.match(
      APP_CSS,
      /\.coach-goal-card\[data-layout="wide"\][\s\S]*grid-template-columns/
    )
    assert.match(APP_CSS, /repeating-linear-gradient/)
    assert.match(APP_CSS, /prefers-reduced-motion: reduce/)
  })

  test("requires confirmation before unpinning without deleting the goal", () => {
    assert.match(APP_SOURCE, /Unpin this Coach goal\?/)
    assert.match(APP_SOURCE, /Keep pinned/)
    assert.match(APP_SOURCE, /Unpin from Today/)
    assert.match(APP_SOURCE, /setCoachGoalPinned/)
    assert.match(APP_SOURCE, /pinned: false/)
    assert.match(
      APP_SOURCE,
      /the goal and its task progress[\s\S]*will stay available to Coach/
    )
  })

  test("stores tasks separately from goals", () => {
    assert.match(SCHEMA_SOURCE, /coachGoals: defineTable/)
    assert.match(SCHEMA_SOURCE, /coachGoalTasks: defineTable/)
    assert.match(SCHEMA_SOURCE, /v\.id\("coachGoals"\)/)
    assert.match(SCHEMA_SOURCE, /by_userId_and_pinned/)
    assert.match(SCHEMA_SOURCE, /by_goalId_and_sortOrder/)
  })
})
