import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  COACH_MAX_MESSAGE_CHARS,
  COACH_MAX_MESSAGE_WORDS,
  countCoachMessageWords,
} from "@repo/models"

const COACH_PAGE = readFileSync(
  new URL("../../pages/Coach.tsx", import.meta.url),
  "utf8"
)
const METRIC_GENERATION = readFileSync(
  new URL("../../../../../convex/ai/metricGeneration.ts", import.meta.url),
  "utf8"
)

const words = (count: number) => Array(count).fill("word").join(" ")

describe("coach message word limit", () => {
  test("the limit is 2,000 words", () => {
    expect(COACH_MAX_MESSAGE_WORDS).toBe(2_000)
  })

  test("counts whitespace-delimited words regardless of separator", () => {
    expect(countCoachMessageWords("one two three")).toBe(3)
    expect(countCoachMessageWords("one\ntwo\t three  four")).toBe(4)
    expect(countCoachMessageWords("  padded  ")).toBe(1)
  })

  test("treats empty and whitespace-only input as zero words", () => {
    expect(countCoachMessageWords("")).toBe(0)
    expect(countCoachMessageWords("   \n\t ")).toBe(0)
  })

  test("2,000 words is allowed and 2,001 is not", () => {
    expect(countCoachMessageWords(words(2_000))).toBe(2_000)
    expect(countCoachMessageWords(words(2_000))).toBeLessThanOrEqual(
      COACH_MAX_MESSAGE_WORDS
    )
    expect(countCoachMessageWords(words(2_001))).toBeGreaterThan(
      COACH_MAX_MESSAGE_WORDS
    )
  })

  test("the character ceiling leaves room for 2,000 ordinary words", () => {
    // Guards against a future edit making the byte ceiling the binding limit
    // for normal prose, which would truncate before the word check ever fires.
    expect(words(2_000).length).toBeLessThan(COACH_MAX_MESSAGE_CHARS)
  })

  test("the composer blocks sending while over the limit", () => {
    expect(COACH_PAGE).toContain(
      "const overWordLimit = inputWordCount > COACH_MAX_MESSAGE_WORDS"
    )
    expect(COACH_PAGE).toContain("overWordLimit ||")
  })

  test("the composer no longer caps input with the old character limit", () => {
    expect(COACH_PAGE).not.toContain("maxLength={1200}")
    expect(COACH_PAGE).not.toContain("slice(0, 1200)")
  })

  test("the server rejects an over-limit message instead of truncating it", () => {
    expect(METRIC_GENERATION).toContain(
      "countCoachMessageWords(args.message) > COACH_MAX_MESSAGE_WORDS"
    )
    expect(METRIC_GENERATION).toContain("That message is too long.")
    // The coach message must not be clamped back to the old prompt budget.
    expect(METRIC_GENERATION).not.toContain(
      "clampText(args.message, MAX_PROMPT_CHARS)"
    )
  })
})
