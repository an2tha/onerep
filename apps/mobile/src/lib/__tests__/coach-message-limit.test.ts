import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { COACH_MAX_MESSAGE_CHARS } from "@repo/models"

const COACH_PAGE = readFileSync(
  new URL("../../pages/Coach.tsx", import.meta.url),
  "utf8"
)
const METRIC_GENERATION = readFileSync(
  new URL("../../../../../convex/ai/metricGeneration.ts", import.meta.url),
  "utf8"
)

describe("coach message character limit", () => {
  test("the limit is 1,200 characters", () => {
    expect(COACH_MAX_MESSAGE_CHARS).toBe(1_200)
  })

  test("the composer caps typed and pasted input", () => {
    expect(COACH_PAGE).toContain("maxLength={COACH_MAX_MESSAGE_CHARS}")
    expect(COACH_PAGE).toContain("value.slice(0, COACH_MAX_MESSAGE_CHARS)")
  })

  test("the submitted prompt is capped independently of the composer", () => {
    // Dictation and guided prompts bypass the textarea, so the cap has to be
    // reapplied at submit rather than relying on maxLength alone.
    expect(COACH_PAGE).toContain(".slice(0, COACH_MAX_MESSAGE_CHARS)")
  })

  test("the server clamps the message to the same shared limit", () => {
    expect(METRIC_GENERATION).toContain(
      "clampText(args.message, COACH_MAX_MESSAGE_CHARS)"
    )
  })

  test("client and server share one constant rather than a magic number", () => {
    expect(COACH_PAGE).not.toContain("maxLength={1200}")
    expect(COACH_PAGE).not.toContain("slice(0, 1200)")
    expect(METRIC_GENERATION).not.toContain(
      "clampText(args.message, MAX_PROMPT_CHARS)"
    )
  })
})
