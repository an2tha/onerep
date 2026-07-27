import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const coachSource = readFileSync(
  new URL("./Coach.tsx", import.meta.url),
  "utf8"
)
const generationSource = readFileSync(
  new URL("../../../../convex/ai/metricGeneration.ts", import.meta.url),
  "utf8"
)
const generatedPrompts = readFileSync(
  new URL("../../../../convex/ai/prompts.generated.ts", import.meta.url),
  "utf8"
)

describe("Coach generative interactive cards", () => {
  test("supports composable controls instead of a meal-only template", () => {
    for (const element of [
      "text",
      "section",
      "divider",
      "key_value",
      "progress",
      "list",
      "metric_group",
      "stepper",
      "range",
      "choice",
      "rating",
      "toggle",
    ]) {
      expect(generationSource).toContain(`type: "${element}"`)
      expect(coachSource).toContain(`element.type === "${element}"`)
    }
  })

  test("turns the adjusted quantity into a nutrition operation", () => {
    expect(coachSource).toContain("quantityControlId")
    expect(coachSource).toContain("block.submit.calories * factor")
    expect(coachSource).toContain('type: "log_nutrition"')
  })

  test("directs Coach to prefer interactive quick logging", () => {
    expect(generatedPrompts).toContain(
      "For quick meal logging, prefer one interactive_card"
    )
    expect(generatedPrompts).toContain("interactive_card is a composable")
    expect(generatedPrompts).toContain(
      "generative canvas rather than a fixed template"
    )
  })
})
