import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const FEEDBACK = readFileSync(
  new URL("../components/feedback-center.tsx", import.meta.url),
  "utf8"
)
const SETTINGS = readFileSync(
  new URL("./Settings.tsx", import.meta.url),
  "utf8"
)
const DASHBOARD = readFileSync(new URL("../App.tsx", import.meta.url), "utf8")

describe("moderated feedback featureboard", () => {
  test("keeps bug reports and feature ideas in separate accessible panes", () => {
    assert.match(FEEDBACK, /role="tablist"/)
    assert.match(FEEDBACK, /role="tab"/)
    assert.match(FEEDBACK, /aria-selected=/)
    assert.match(FEEDBACK, /role="tabpanel"/)
    assert.match(FEEDBACK, /Report a bug/)
    assert.match(FEEDBACK, /Share an idea/)
  })

  test("explains moderation and exposes reversible voting", () => {
    assert.match(FEEDBACK, /reviewed before anything appears publicly/)
    assert.match(FEEDBACK, /aria-pressed=\{item\.hasVoted\}/)
    assert.match(FEEDBACK, /toggleVote/)
    assert.match(FEEDBACK, /Moderation queue/)
  })

  test("is reachable from Settings and the Today dashboard hint", () => {
    assert.match(SETTINGS, /title="Feedback"/)
    assert.match(SETTINGS, /showView\("feature-board"\)/)
    assert.match(DASHBOARD, /Help shape OneRep/)
    assert.match(DASHBOARD, /\/settings\?view=feedback/)
  })
})
