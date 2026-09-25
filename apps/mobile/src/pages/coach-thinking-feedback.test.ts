import { readLocalizedSource as readFileSync } from "../../tests/helpers/localized-source"
import { describe, expect, test } from "bun:test"

const coach = [
  readFileSync(new URL("./Coach.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("../lib/coach-chat.tsx", import.meta.url), "utf8"),
].join("\n")

describe("Coach thinking feedback", () => {
  test("cycles through varied progress messages", () => {
    expect(coach).toContain("COACH_THINKING_MESSAGES")
    expect(coach).toContain("Checking your recent patterns…")
    expect(coach).toContain("Preparing a practical response…")
    expect(coach).toContain("setMessageIndex")
  })

  test("provides restrained haptics only while thinking", () => {
    expect(coach).toContain('document.visibilityState === "visible"')
    expect(coach).toContain("hapticSelection()")
    expect(coach).toContain("window.clearInterval(interval)")
  })
})
