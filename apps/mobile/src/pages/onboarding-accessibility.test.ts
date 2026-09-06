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
  test("uses immediate structured setup and editable review", () => {
    assert.match(pageSource, /aria-label="Setup steps"/)
    assert.match(pageSource, /id="setup-heading"/)
    assert.match(pageSource, /setup-review-list/)
    assert.doesNotMatch(
      pageSource,
      /TypewriterText|fastForwardTyping|auth-light-only/
    )
    for (const id of [
      "preferences",
      "nutrition",
      "lifestyle",
      "connections",
      "import",
      "review",
    ]) {
      assert.match(pageSource, new RegExp(`id: "${id}"`))
    }
  })

  test("an interrupted run resumes and an edit jumps back", () => {
    // Answers persist locally as they are given, restore on return (even
    // offline), and are cleared once the real save lands.
    assert.match(pageSource, /onerep:onboarding-draft/)
    assert.match(pageSource, /function parseOnboardingSnapshot/)
    assert.match(pageSource, /safeLocalStorageRemove\(ONBOARDING_DRAFT_KEY\)/)
    // Editing an earlier answer returns in one tap, not a forced re-walk.
    assert.match(pageSource, /setReturnStage/)
    assert.match(
      pageSource,
      /returnStage !== null && returnStage > next \? returnStage : next/
    )
  })

  test("the header says where you are in the journey", () => {
    assert.match(pageSource, /\$\{stage \+ 1\} of \$\{stages\.length\}/)
  })

  test("reuses the real Coach chat backend", () => {
    assert.match(source, /api\.ai\.metricGeneration\.generateCoachChatMessage/)
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
    assert.match(
      pageSource,
      /setSetupDestination\(SETUP_DESTINATIONS\[action\]\)/
    )
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
    assert.match(
      pageSource,
      /if \(selectedAttachment\) clearSetupAttachment\(\)/
    )
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
