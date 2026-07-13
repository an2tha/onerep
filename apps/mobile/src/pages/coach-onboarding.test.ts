import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const COACH_SOURCE = readFileSync(
  new URL("./Coach.tsx", import.meta.url),
  "utf8"
)
const SETTINGS_SOURCE = readFileSync(
  new URL("./Settings.tsx", import.meta.url),
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
  test("opens directly to useful conversation content without a promotional tour", () => {
    expect(COACH_SOURCE).toContain("What do you want to work on?")
    expect(COACH_SOURCE).toContain("coachBrief(context)")
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
    expect(COACH_SOURCE).toContain("New chat")
    expect(COACH_SOURCE).toContain("APP_TOOLTIP_IDS.coachStarters")
    expect(COACH_SOURCE).toContain("APP_TOOLTIP_IDS.coachNewChat")
  })

  test("does not expose obsolete introduction controls in settings", () => {
    expect(SETTINGS_SOURCE).not.toContain("handleResetCoachOnboarding")
    expect(SETTINGS_SOURCE).not.toContain("Reset Coach introduction")
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
      "Return uiBlocks=[] for greetings"
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
    expect(COACH_ACTION_SOURCE).toContain('type: "update_routine"')
    expect(COACH_PROMPT_SOURCE).toContain(
      "Operations are real writes. Emit them only when the LATEST message directly asks"
    )
  })

  test("Coach supports previews, undo, memory, check-ins, plans, and read-only analysis", () => {
    expect(COACH_SOURCE).toContain("CoachProposal")
    expect(COACH_SOURCE).toContain("Review changes")
    expect(COACH_SOURCE).toContain("Coach activity")
    expect(COACH_SOURCE).toContain("Coach memory")
    expect(COACH_SOURCE).toContain("Today’s check-in")
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

  test("Coach supports user-managed memory, pictures, and streaming voice input", () => {
    expect(COACH_SOURCE).toContain("Add memory")
    expect(COACH_SOURCE).toContain("generateCoachUploadUrl")
    expect(COACH_SOURCE).toContain("registerCoachUpload")
    expect(COACH_SOURCE).toContain("attachmentId")
    expect(COACH_SOURCE).toContain("useCoachDictation")
    expect(COACH_SOURCE).toContain('aria-label="Attach a picture"')
    expect(COACH_SOURCE).toContain("Start voice input")
    expect(COACH_PROMPT_SOURCE).toContain(
      "durable first-person coaching preference or constraint"
    )
  })
})
