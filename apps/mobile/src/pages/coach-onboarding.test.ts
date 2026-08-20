import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// The Coach surface spans the page and the shared chat module it renders with
// (also consumed by the onboarding Coach setup stage).
const COACH_SOURCE = [
  readFileSync(new URL("./Coach.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("../lib/coach-chat.tsx", import.meta.url), "utf8"),
].join("\n")
const SETTINGS_SOURCE = readFileSync(
  new URL("./Settings.tsx", import.meta.url),
  "utf8"
)
const APP_CSS = readFileSync(
  new URL("../../../../packages/ui/src/index.css", import.meta.url),
  "utf8"
)

function expect(value: string) {
  return {
    toContain(expected: string) {
      assert.ok(
        value.includes(expected),
        `Expected source to contain ${expected}`
      )
    },
    not: {
      toContain(expected: string) {
        assert.ok(
          !value.includes(expected),
          `Expected source not to contain ${expected}`
        )
      },
    },
  }
}
const COACH_ACTION_SOURCE = readFileSync(
  new URL("../../../../convex/ai/metricGeneration.ts", import.meta.url),
  "utf8"
)
const PRESET_AGENT_SOURCE = readFileSync(
  new URL("../../../../convex/logs/presetAgent.ts", import.meta.url),
  "utf8"
)
const COACH_PROMPT_SOURCE = readFileSync(
  new URL("../../../../convex/ai/prompts/coach_chat.yaml", import.meta.url),
  "utf8"
).replace(/\s+/g, " ")
const PRESET_PROMPT_SOURCE = readFileSync(
  new URL("../../../../convex/ai/prompts/workout_preset.yaml", import.meta.url),
  "utf8"
).replace(/\s+/g, " ")

describe("Coach first-open experience", () => {
  test("separates general, food, and training coaching into focused tabs", () => {
    expect(COACH_SOURCE).toContain('label: "Briefing"')
    expect(COACH_SOURCE).toContain('label: "Nutrition"')
    expect(COACH_SOURCE).toContain('label: "Training"')
    expect(COACH_SOURCE).toContain('role="tablist"')
    expect(COACH_SOURCE).toContain('aria-label="Coach modes"')
    expect(COACH_SOURCE).toContain("switchCoachMode")
    expect(COACH_SOURCE).toContain("hapticSelection()")
    expect(COACH_SOURCE).toContain("coachConversationKey(activeMode)")
    expect(COACH_SOURCE).toContain("coachMode: activeMode")
    expect(COACH_SOURCE).toContain("coach-swoosh-backdrop")
    expect(COACH_SOURCE).toContain("coach-swoosh-surface")
    expect(COACH_SOURCE).toContain("coach-mobile-immersive")
    // Coach renders one backdrop, and it is the mobile variant.
    expect(COACH_SOURCE).toContain("coach-swoosh-backdrop--mobile")
    expect(COACH_SOURCE).toContain("data-coach-mode={activeMode}")
    expect(APP_CSS).toContain("@keyframes coach-swoosh-drift")
    expect(APP_CSS).toContain("@keyframes coach-swoosh-glow")
    expect(APP_CSS).toContain("--coach-flow-top: #7b3218")
    expect(APP_CSS).toContain("--coach-flow-angle: 137deg")
    expect(APP_CSS).toContain("--coach-flow-duration: 10s")
    // Switching mode is a view transition on `.coach-page-slide` rather than an
    // entrance animation on the stage.
    expect(COACH_SOURCE).toContain("coach-mode-stage")
    expect(COACH_SOURCE).toContain("coach-page-slide")
    expect(APP_CSS).toContain("@keyframes coach-page-new-forward")
    expect(APP_CSS).toContain("@keyframes coach-page-old-back")
    expect(APP_CSS).toContain("@keyframes coach-route-enter")
    // Leaving is the arrival run backwards, not a second animation: one set of
    // keyframes, so the two directions cannot drift apart.
    expect(APP_CSS).toContain("animation: coach-route-enter 560ms")
    expect(APP_CSS).toContain("var(--motion-ease-out) both reverse")
    expect(APP_CSS).toContain("repeating-linear-gradient")
    expect(APP_CSS).toContain("prefers-reduced-motion: reduce")
    expect(COACH_SOURCE).toContain("timeGreeting()")
    // The modes are a real tablist driving one panel, three abreast, with tap
    // targets that clear 44px. Pinning the semantics rather than the utility
    // classes, which have already been reworked once under these assertions.
    expect(COACH_SOURCE).toContain("grid-cols-3")
    expect(COACH_SOURCE).toContain('role="tab"')
    expect(COACH_SOURCE).toContain("aria-selected={active}")
    expect(COACH_SOURCE).toContain('aria-controls="coach-workspace"')
    expect(COACH_SOURCE).toContain('role="tabpanel"')
    expect(COACH_SOURCE).toContain("min-h-11 min-w-0")
    expect(COACH_SOURCE).toContain("{item.label}")
    expect(COACH_SOURCE).toContain("pt-[var(--app-safe-top)]")
    expect(COACH_SOURCE).toContain("lg:pt-0")
    expect(COACH_SOURCE).not.toContain("/onboarding/")
    expect(COACH_SOURCE).not.toContain("bg-orange-500/10")
    expect(COACH_SOURCE).not.toContain("bg-sky-500/10")
    expect(COACH_ACTION_SOURCE).toContain("coachMode: v.optional")
    expect(COACH_PROMPT_SOURCE).toContain("Respect the requested coachMode")
  })

  test("opens directly to useful conversation content without a promotional tour", () => {
    // The empty state is the user's own week read back to them plus one action,
    // not a prompt asking them what they want.
    expect(COACH_SOURCE).toContain("timeGreeting()")
    expect(COACH_SOURCE).toContain("See what I’d do")
    expect(COACH_SOURCE).not.toContain("coachBrief(context)")
    expect(COACH_SOURCE).not.toContain("CoachContextPanel")
    expect(COACH_SOURCE).not.toContain("FOLLOW_UP_PROMPTS")
    expect(COACH_SOURCE).not.toContain("CoachOnboarding")
    expect(COACH_SOURCE).not.toContain("Screenshot placeholder")
    expect(COACH_SOURCE).not.toContain("bg-gradient-to-br")
    expect(COACH_SOURCE).not.toContain('aria-label="Close Coach introduction"')
  })

  test("offers focused skills and a fresh-chat action", () => {
    expect(COACH_SOURCE).toContain('title: "Plan my day"')
    expect(COACH_SOURCE).toContain('title: "Review nutrition"')
    expect(COACH_SOURCE).toContain('title: "Analyze training"')
    expect(COACH_SOURCE).toContain('title: "Check progress"')
    expect(COACH_SOURCE).not.toContain('title: "Make something"')
    expect(COACH_SOURCE).not.toContain('title: "Plan my week"')
    expect(COACH_SOURCE).toContain("New chat")
    // The walkthrough's Coach chapter owns this guidance now.
    expect(COACH_SOURCE).toContain('anchor="coach-new-chat"')
    expect(COACH_SOURCE).toContain('anchor="coach-composer"')
    expect(COACH_SOURCE).toContain("startNewChat")
  })

  test("lets developers replay the Coach capabilities onboarding", () => {
    expect(SETTINGS_SOURCE).toContain("handleResetCoachOnboarding")
    expect(SETTINGS_SOURCE).toContain("Reset Coach onboarding")
    expect(SETTINGS_SOURCE).toContain("/onboarding?replay=coach")
  })

  test("beginner setup and safety context reach Coach and plan builders", () => {
    expect(COACH_SOURCE).toContain("BEGINNER_SETUP_STARTERS")
    expect(COACH_SOURCE).toContain("Build my workout plan")
    expect(COACH_SOURCE).toContain("Set up easy recipes")
    expect(COACH_SOURCE).toContain('action === "open_workout_builder"')
    expect(COACH_SOURCE).toContain('action === "open_recipe_builder"')
    expect(COACH_PROMPT_SOURCE).toContain(
      "Treat safetyMode, safetyFlags, and nutritionGuidance as hard constraints"
    )
    expect(PRESET_PROMPT_SOURCE).toContain(
      "Treat supplied safety context as a hard constraint"
    )
    expect(PRESET_AGENT_SOURCE).toContain('renderSystemPrompt("workout_preset"')
  })

  test("natural-language Coach commands can write app data with automatic UI", () => {
    expect(COACH_SOURCE).not.toContain("Visual summaries")
    expect(COACH_SOURCE).not.toContain("COACH_VISUALS_KEY")
    expect(COACH_SOURCE).toContain("h-svh overflow-hidden")
    expect(COACH_SOURCE).toContain("min-h-0 flex-1 flex-col overflow-y-auto")
    expect(COACH_PROMPT_SOURCE).toContain(
      "Return uiBlocks=[] only for greetings"
    )
    expect(COACH_PROMPT_SOURCE).toContain(
      "create exactly three reusable presets"
    )
    expect(COACH_SOURCE).toContain("api.logs.recipes.save")
    expect(COACH_SOURCE).toContain("api.logs.foodLogs.addEntry")
    expect(COACH_SOURCE).toContain("api.logs.presets.create")
    expect(COACH_SOURCE).toContain("api.users.schedules.set")
    expect(COACH_SOURCE).toContain("CoachOperationResults")
    expect(COACH_ACTION_SOURCE).toContain('type: "save_recipe"')
    expect(COACH_ACTION_SOURCE).toContain('type: "log_nutrition"')
    expect(COACH_ACTION_SOURCE).toContain('type: "create_workout_preset"')
    expect(COACH_ACTION_SOURCE).toContain('type: "create_workout_plan"')
    expect(COACH_ACTION_SOURCE).toContain('type: "update_routine"')
    expect(COACH_SOURCE).toContain("expandWorkoutPlanOperations")
    expect(COACH_PROMPT_SOURCE).toContain(
      "prefer one create_workout_plan operation"
    )
    expect(COACH_PROMPT_SOURCE).toContain(
      "Operations are real writes. Emit them only when the LATEST message directly asks"
    )
  })

  test("recipes stay as detailed previews until the user approves them", () => {
    expect(COACH_SOURCE).toContain('operation.type === "save_recipe"')
    expect(COACH_SOURCE).toContain("Recipe preview · nothing saved yet")
    expect(COACH_SOURCE).toContain("Like this recipe?")
    expect(COACH_SOURCE).toContain("Save to Recipes")
    expect(COACH_SOURCE).toContain("Estimated per serving")
    expect(COACH_SOURCE).toContain("Ingredients")
    expect(COACH_SOURCE).toContain("Method")
    expect(COACH_SOURCE).toContain("overflow-y-auto px-3 py-5 sm:px-5")
    expect(COACH_SOURCE).not.toContain("bg-[rgba(2,8,23,0.74)]")
    expect(COACH_PROMPT_SOURCE).toContain(
      "A save_recipe operation must always use confirmation=confirm"
    )
    expect(COACH_ACTION_SOURCE).toContain('confirmation: "confirm"')
  })

  test("a batch of recipes previews in full and saves as one set", () => {
    // Four recipes approved from four one-line summaries is consent without
    // reading, so the batch preview has to show what the single one shows.
    expect(COACH_SOURCE).toContain("recipes.length === operations.length")
    expect(COACH_SOURCE).toContain("recipes · nothing saved yet")
    expect(COACH_SOURCE).toContain("Cook this set?")
    expect(COACH_SOURCE).toContain("Save ${recipes.length} recipes")
    expect(COACH_PROMPT_SOURCE).toContain(
      "save_recipe operations in a single turn"
    )
  })

  test("Coach supports previews, undo, memory, check-ins, plans, and read-only analysis", () => {
    expect(COACH_SOURCE).toContain("CoachProposal")
    expect(COACH_SOURCE).toContain("Review changes")
    expect(COACH_SOURCE).toContain("Coach activity")
    expect(COACH_SOURCE).toContain("Coach memory")
    expect(COACH_SOURCE).toContain("saveCheckIn")
    expect(COACH_SOURCE).toContain("saveWeeklyPlan")
    expect(COACH_SOURCE).toContain("undoCoachAction")
    expect(COACH_SOURCE).toContain("updateFoodEntry")
    expect(COACH_SOURCE).toContain("removeFoodEntry")
    expect(COACH_SOURCE).toContain("CoachArtifacts")
    expect(COACH_SOURCE).toContain("Validate my routine")
    expect(COACH_SOURCE).toContain("Explore a scenario")
    expect(COACH_ACTION_SOURCE).toContain("recovery_adaptation")
    expect(COACH_ACTION_SOURCE).toContain("progress_explanation")
    expect(COACH_ACTION_SOURCE).toContain("save_check_in")
    expect(COACH_ACTION_SOURCE).toContain("save_weekly_plan")
    expect(COACH_PROMPT_SOURCE).toContain(
      "Questions, advice, explanations, comparisons, image questions, and hypothetical or simulation requests must have zero operations"
    )
  })

  test("Coach can schedule durable goals and pin read-only plans", () => {
    expect(COACH_SOURCE).toContain('type: "save_goal"')
    expect(COACH_SOURCE).toContain('type: "goal"')
    expect(COACH_SOURCE).toContain("Pin to Today")
    expect(COACH_SOURCE).toContain("Pin as a 7-day goal")
    expect(COACH_SOURCE).toContain("api.ai.coachGoals.save")
    expect(COACH_SOURCE).toContain("api.ai.coachGoals.setPinned")
    expect(COACH_SOURCE).toContain("durationDays: operation.durationDays")
    expect(COACH_SOURCE).toContain("goals: (goals ?? []).map")
    expect(COACH_ACTION_SOURCE).toContain('type: "save_goal"')
    expect(COACH_PROMPT_SOURCE).toContain(
      "Use one goal uiBlock when the answer is a coherent time-boxed challenge"
    )
    expect(COACH_PROMPT_SOURCE).toContain("use workspace.today as startDate")
  })

  test("Coach supports user-managed memory, pictures, and streaming voice input", () => {
    expect(COACH_SOURCE).toContain("Add memory")
    // Pictures go through the shared owned-upload helper, which is what ties an
    // upload to its owner and lets an abandoned one be discarded.
    expect(COACH_SOURCE).toContain("uploadOwnedFile(")
    expect(COACH_SOURCE).toContain('"coach_image"')
    expect(COACH_SOURCE).toContain("api.uploads.discard")
    expect(COACH_SOURCE).toContain("attachmentId")
    expect(COACH_SOURCE).toContain("useCoachDictation")
    expect(COACH_SOURCE).toContain('aria-label="Attach a picture"')
    expect(COACH_SOURCE).toContain("Start voice input")
    expect(COACH_PROMPT_SOURCE).toContain(
      "durable first-person coaching preference or constraint"
    )
  })
})
