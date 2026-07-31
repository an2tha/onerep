import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const COACH_SOURCE = readFileSync(
  new URL("./Coach.tsx", import.meta.url),
  "utf8"
)

describe("Coach memory modal", () => {
  test("escapes the clipped Coach canvas and behaves like a modal", () => {
    assert.match(COACH_SOURCE, /return createPortal\([\s\S]*document\.body/)
    assert.match(COACH_SOURCE, /aria-labelledby=\{titleId\}/)
    assert.match(COACH_SOURCE, /event\.key !== "Escape"/)
    assert.match(COACH_SOURCE, /document\.body\.style\.overflow = "hidden"/)
    assert.match(COACH_SOURCE, /previouslyFocused\.focus\(\)/)
  })

  test("keeps the sheet themed for the active Coach mode", () => {
    assert.match(COACH_SOURCE, /data-coach-mode=\{mode\}/)
    assert.match(COACH_SOURCE, /title="Coach memory"[\s\S]*mode=\{activeMode\}/)
  })
})
