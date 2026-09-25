import { readLocalizedSource as readFileSync } from "../../tests/helpers/localized-source"
import { describe, expect, test } from "bun:test"

const coachSource = [
  readFileSync(new URL("./Coach.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("../lib/coach-chat.tsx", import.meta.url), "utf8"),
].join("\n")
const generatedPrompts = readFileSync(
  new URL("../../../../convex/ai/prompts.generated.ts", import.meta.url),
  "utf8"
)

describe("Coach generative interactive cards", () => {
  test("keeps legacy conversation controls readable", () => {
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
      "For quick meal logging, prefer one MealLog component"
    )
    expect(generatedPrompts).toContain("Generate interfaces with OpenUI Lang")
  })
})
