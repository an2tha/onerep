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
  test("runs as a scripted chat covering the full setup journey", () => {
    for (const id of [
      "intro",
      "goal",
      "experience",
      "coach",
      "sex",
      "measurements",
      "activity",
      "safety",
      "assistant",
      "review",
    ]) {
      assert.match(source, new RegExp(`id: "${id}"`))
    }
    assert.match(source, /role="log"/)
    assert.match(source, /aria-label="Setup conversation"/)
    assert.match(source, /onboarding-chat-bubble-coach/)
    assert.match(source, /onboarding-chat-bubble-user/)
    assert.doesNotMatch(source, /Choose what OneRep can use/)
    assert.doesNotMatch(source, /Setup mode/)
  })

  test("shows a typing indicator and lets users edit earlier answers", () => {
    assert.match(source, /onboarding-chat-typing/)
    assert.match(source, /aria-label="Coach is typing"/)
    assert.match(source, /aria-label=\{`Edit answer: \$\{answer\}`\}/)
    assert.match(source, /function rewindTo\(index: number\)/)
    assert.match(source, /chatEndRef\.current\?\.scrollIntoView/)
  })

  test("types coach messages out and respects reduced motion", () => {
    assert.match(source, /function TypewriterText/)
    assert.match(source, /prefers-reduced-motion: reduce/)
    assert.match(source, /<span aria-label=\{text\}>/)
    assert.match(source, /setTypedCount\(\(current\) => current \+ 1\)/)
  })

  test("runs in light mode and dips into the light Coach theme for Coach stages", () => {
    assert.match(source, /auth-light-only/)
    assert.match(source, /data-coach-stage=\{coachStage\}/)
    assert.match(
      styles,
      /\.onboarding-shell\[data-coach-stage="true"\][\s\S]*--coach-flow-top: #eef0ff/
    )
  })

  test("reuses the real Coach animated backdrop and Coach chat backend", () => {
    assert.match(source, /coach-swoosh-backdrop coach-swoosh-backdrop--mobile/)
    assert.match(source, /className="coach-background-layer"/)
    assert.match(
      source,
      /api\.ai\.metricGeneration\.generateCoachChatMessage/
    )
    assert.match(source, /api\.ai\.coachOperations\.applyApproved/)
    assert.match(source, /const SETUP_MESSAGE_LIMIT = 5/)
    assert.match(source, /aria-label="Message Coach"/)
    assert.match(source, /useCoachContext/)
  })

  test("supports a developer-only Coach replay without resetting profile data", () => {
    assert.match(source, /get\("replay"\) === "coach"/)
    assert.match(source, /coachReplay \? coachStageIndex : 0/)
    assert.match(source, /Coach onboarding preview/)
    assert.match(source, /Open Coach/)
    assert.match(source, /navigate\("\/coach", \{ replace: true \}\)/)
  })

  test("final setup save is single-flight and announced", () => {
    assert.match(source, /const savingRef = useRef\(false\)/)
    assert.match(source, /savingRef\.current = true/)
    assert.match(source, /savingRef\.current = false/)
    assert.match(source, /disabled=\{saving\}/)
    assert.match(source, /aria-busy=\{saving\}/)
  })

  test("chat choices and progress expose readable labels and state", () => {
    assert.match(source, /aria-pressed=\{selected\}/)
    assert.match(source, /aria-valuemin/)
    assert.match(source, /aria-valuemax/)
    assert.match(source, /role="progressbar"/)
    assert.match(source, /starting daily targets/)
  })

  test("shows the Coach backdrop only during the Coach stages", () => {
    assert.match(source, /\{coachStage && \(/)
    assert.match(source, /className="onboarding-progress-segment"/)
    assert.match(source, /data-selected=\{selected\}/)
    assert.match(styles, /animation: coach-flow-reveal/)
    assert.match(styles, /@keyframes coach-swoosh-drift/)
  })

  test("keeps the journey responsive and motion-accessible", () => {
    assert.match(styles, /@media \(min-width: 768px\)[\s\S]*\.onboarding-chat/)
    assert.match(
      styles,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.onboarding-atmosphere::before[\s\S]*animation: none !important/
    )
    assert.match(
      styles,
      /prefers-reduced-motion[\s\S]*\.onboarding-chat-typing span[\s\S]*animation: none !important/
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

  test("the Coach setup stage renders the full shared Coach surface", () => {
    // The stage must reuse the extracted Coach chat module rather than
    // re-implement a text-only chat that silently drops structured output.
    assert.match(pageSource, /from "@\/lib\/coach-chat"/)
    for (const component of [
      "<CoachUiBlocks",
      "<CoachArtifacts",
      "<CoachProposal",
      "<CoachOperationResults",
      "<ThinkingIndicator",
    ]) {
      assert.ok(
        pageSource.includes(component),
        `Coach setup stage is missing ${component}`
      )
    }
    for (const normalizer of [
      "normalizeCoachUiBlocks(response.uiBlocks)",
      "normalizeCoachOperations(response.operations)",
      "normalizeCoachArtifacts(response.artifacts)",
    ]) {
      assert.ok(
        pageSource.includes(normalizer),
        `Coach setup stage drops ${normalizer}`
      )
    }
  })

  test("Coach setup operations are validated before they are applied", () => {
    assert.match(
      pageSource,
      /const validationErrors = validateCoachOperations\(operations\)[\s\S]*throw new Error\(validationErrors\[0\]\)/
    )
    // Recipes, confirm-flagged writes, and warned writes stay proposals.
    assert.match(
      pageSource,
      /operation\.type === "save_recipe" \|\|[\s\S]*operation\.confirmation === "confirm" \|\|[\s\S]*operation\.warnings\.length > 0/
    )
  })

  test("Coach setup runs against the in-progress onboarding draft", () => {
    assert.match(pageSource, /const setupCoachContext = useMemo\(/)
    assert.match(pageSource, /context: setupCoachContext/)
    for (const field of [
      "experienceLevel,",
      "safetyMode: deriveSafetyMode(",
      "calorieTarget: preview?.targetCalories",
      "proteinTarget: preview?.protein",
    ]) {
      assert.ok(
        pageSource.includes(field),
        `Draft-aware Coach context is missing ${field}`
      )
    }
  })

  test("Coach setup defers navigation until onboarding finishes", () => {
    assert.match(pageSource, /setSetupDestination\(SETUP_DESTINATIONS\[action\]\)/)
    assert.match(pageSource, /setupDestination \?\?/)
  })

  test("the Coach setup stage accepts image attachments", () => {
    assert.match(pageSource, /useCoachAttachment\(\)/)
    for (const component of [
      "<CoachAttachmentInput",
      "<CoachAttachmentPreview",
      "<CoachAttachButton",
    ]) {
      assert.ok(
        pageSource.includes(component),
        `Coach setup composer is missing ${component}`
      )
    }
    // The upload id must reach the model, and a half-uploaded image must not.
    assert.match(pageSource, /attachmentId: selectedAttachment\.id/)
    assert.match(pageSource, /selectedAttachment\.status !== "ready"/)
    // An image alone is a valid message; the composer must not require text.
    assert.match(
      pageSource,
      /\(!rawPrompt && !selectedAttachment\) \|\| setupBusy/
    )
    assert.match(pageSource, /if \(selectedAttachment\) clearSetupAttachment\(\)/)
  })

  test("the attach control does not read as a second primary action", () => {
    assert.match(
      styles,
      /\.onboarding-chat-composer \.onboarding-chat-attach \{[\s\S]*background: transparent/
    )
  })

  test("the Coach setup stage is styled for structured Coach output", () => {
    assert.match(styles, /\.onboarding-setup-response \{/)
    assert.match(styles, /\.onboarding-setup-starters \{/)
    assert.match(styles, /\.onboarding-chat-bubble-error \{/)
  })
})
