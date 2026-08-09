import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const COACH_SOURCE = readFileSync(
  new URL("./Coach.tsx", import.meta.url),
  "utf8"
)
const POSE_CONFIRM_SOURCE = readFileSync(
  new URL("../components/form-coach-pose-confirm.tsx", import.meta.url),
  "utf8"
)
const MESSAGE_SOURCE = readFileSync(
  new URL("../lib/form-coach-message.ts", import.meta.url),
  "utf8"
)

describe("form check from the Coach composer", () => {
  test("the composer offers a labelled camera button outside chef mode", () => {
    assert.match(COACH_SOURCE, /aria-label="Check my form"/)
    assert.match(
      COACH_SOURCE,
      /activeMode !== "chef" && \([\s\S]*setShowFormCoach\(true\)/
    )
  })

  test("picking an exercise starts a draft the recorder can act on", () => {
    assert.match(
      COACH_SOURCE,
      /matchFormCoachExercise\(exercise\.name, supported\)/
    )
    assert.match(
      COACH_SOURCE,
      /startFormCoachDraft\(\{[\s\S]*exerciseId: exercise\.id[\s\S]*slug: movement\.slug/
    )
  })

  test("the whole capture flow is mounted, not just its entry point", () => {
    assert.match(COACH_SOURCE, /<FormCoachRecorder \/>/)
    assert.match(COACH_SOURCE, /<FormCoachReviewSheet \/>/)
    assert.match(COACH_SOURCE, /<FormCoachPoseConfirm \/>/)
  })

  test("the paywall is checked as the camera opens, not after filming", () => {
    assert.match(
      COACH_SOURCE,
      /requireAiAccess\(FORM_COACH_AI_COST, "form_coach"\)/
    )
    assert.match(COACH_SOURCE, /clips\.length === 0/)
  })

  test("a report reaches a mounted Coach instead of only local storage", () => {
    assert.match(MESSAGE_SOURCE, /export function subscribeToFormCoachMessages/)
    assert.match(MESSAGE_SOURCE, /if \(liveListeners\.size > 0\)/)
    assert.match(
      COACH_SOURCE,
      /subscribeToFormCoachMessages\(\(message\) => \{[\s\S]*setMessages/
    )
  })

  test("sending from the Coach page does not push the route it is already on", () => {
    assert.match(
      POSE_CONFIRM_SOURCE,
      /window\.location\.pathname !== "\/coach"/
    )
  })
})
