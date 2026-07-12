import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(
  new URL("./OnboardingMobile.tsx", import.meta.url),
  "utf8"
)

describe("Onboarding production contract", () => {
  test("uses five task-oriented steps instead of illustrated micro-steps", () => {
    for (const id of ["goals", "baseline", "activity", "safety", "review"]) {
      assert.match(source, new RegExp(`id: "${id}"`))
    }
    assert.doesNotMatch(source, /Choose what OneRep can use/)
    assert.doesNotMatch(source, /Setup mode/)
  })

  test("final setup save is single-flight and announced", () => {
    assert.match(source, /const savingRef = useRef\(false\)/)
    assert.match(source, /savingRef\.current = true/)
    assert.match(source, /savingRef\.current = false/)
    assert.match(source, /disabled=\{saving\}/)
    assert.match(source, /aria-busy=\{saving\}/)
  })

  test("baseline fields and choices expose readable labels and state", () => {
    assert.match(source, /aria-pressed=\{selected\}/)
    assert.match(source, /aria-valuemin/)
    assert.match(source, /aria-valuemax/)
    assert.match(source, /role="progressbar"/)
    assert.match(source, /Review your starting targets/)
  })
})
