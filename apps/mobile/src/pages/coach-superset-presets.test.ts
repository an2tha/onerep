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

describe("Coach superset preset creation", () => {
  test("accepts superset groups in structured workout operations", () => {
    expect(generationSource).toContain("exercise.supersetGroup")
    expect(generationSource).toContain("supersetGroup: clampText")
  })

  test("stores repeated groups as real preset superset items", () => {
    expect(coachSource).toContain('kind: "superset"')
    expect(coachSource).toContain("exerciseIds")
    expect(coachSource).toContain("groupCounts")
  })

  test("teaches Coach safe superset pairing behavior", () => {
    expect(generatedPrompts).toContain("Workout presets may contain supersets")
    expect(generatedPrompts).toContain(
      "never superset two highly fatiguing compound lifts"
    )
  })
})
