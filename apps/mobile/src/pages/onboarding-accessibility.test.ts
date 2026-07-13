import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(
  new URL("./OnboardingMobile.tsx", import.meta.url),
  "utf8"
)
const styles = readFileSync(new URL("../index.css", import.meta.url), "utf8")

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

  test("tapers the Coach atmosphere across all five steps", () => {
    assert.match(source, /data-onboarding-step=\{step\}/)
    assert.match(source, /className="onboarding-atmosphere"/)
    assert.match(source, /className="onboarding-progress-segment"/)
    assert.match(source, /data-selected=\{selected\}/)
    for (const step of ["0", "1", "2", "3", "4"]) {
      assert.match(
        styles,
        new RegExp(`data-onboarding-step="${step.replace("-", "\\-")}"`)
      )
    }
    assert.match(
      styles,
      /data-onboarding-step="0"[\s\S]*--onboarding-atmosphere-opacity: 1/
    )
    assert.match(
      styles,
      /data-onboarding-step="4"[\s\S]*--onboarding-atmosphere-opacity: 0\.035/
    )
  })

  test("keeps the journey responsive and motion-accessible", () => {
    assert.match(
      styles,
      /@media \(min-width: 768px\)[\s\S]*grid-template-columns: minmax\(14rem, 0\.72fr\)/
    )
    assert.match(
      styles,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.onboarding-atmosphere::before[\s\S]*animation: none !important/
    )
  })
})
