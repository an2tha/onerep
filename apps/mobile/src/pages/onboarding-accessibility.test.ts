import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const pageSource = readFileSync(
  new URL("./OnboardingMobile.tsx", import.meta.url),
  "utf8"
)
const controlsSource = readFileSync(
  new URL(
    "../../../../packages/ui/src/components/onboarding-controls.tsx",
    import.meta.url
  ),
  "utf8"
)
const source = `${pageSource}\n${controlsSource}`
const styles = readFileSync(
  new URL("../../../../packages/ui/src/index.css", import.meta.url),
  "utf8"
)

describe("Onboarding production contract", () => {
  test("uses six task-oriented steps including Coach capabilities", () => {
    for (const id of [
      "goals",
      "coach",
      "baseline",
      "activity",
      "safety",
      "review",
    ]) {
      assert.match(source, new RegExp(`id: "${id}"`))
    }
    assert.doesNotMatch(source, /Choose what OneRep can use/)
    assert.doesNotMatch(source, /Setup mode/)
  })

  test("supports a developer-only Coach replay without resetting profile data", () => {
    assert.match(source, /get\("replay"\) === "coach"/)
    assert.match(source, /coachReplay \? coachStepIndex : 0/)
    assert.match(source, /Coach onboarding preview/)
    assert.match(source, /Open Coach/)
    assert.match(source, /if \(coachReplay\) \{[\s\S]*navigate\("\/coach"/)
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

  test("tapers the frosted Coach atmosphere across all six steps", () => {
    assert.match(source, /data-onboarding-step=\{step\}/)
    assert.match(source, /className="onboarding-atmosphere"/)
    assert.match(source, /className="onboarding-progress-segment"/)
    assert.match(source, /data-selected=\{selected\}/)
    for (const step of ["0", "1", "2", "3", "4", "5"]) {
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
      /data-onboarding-step="5"[\s\S]*--onboarding-atmosphere-opacity: 0\.035/
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
    assert.match(source, /function CoachFeatureMockups/)
    assert.match(
      source,
      /aria-label="Animated compact caffeine dashboard widget"/
    )
    assert.match(source, /aria-label="Animated estimated caffeine decay chart"/)
    assert.match(
      styles,
      /\.onboarding-frame[\s\S]*backdrop-filter: blur\(26px\)/
    )
    assert.match(styles, /\.onboarding-svg-curve[\s\S]*onboarding-curve-draw/)
    assert.match(
      styles,
      /prefers-reduced-motion[\s\S]*\.onboarding-svg-curve[\s\S]*animation: none !important/
    )
  })
})
