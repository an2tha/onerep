import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

const APP_SOURCE = readFileSync(new URL("../App.tsx", import.meta.url), "utf8")

describe("logging a food again on a past day", () => {
  test("the one-tap repeat list is shown for whichever day is being viewed", () => {
    // RepeatChips is already date-correct: it reads what was eaten on or before
    // the viewed day and logs onto that same day. Gating it behind
    // `viewingToday` took the only one-tap backfill away from a day the user had
    // deliberately navigated back to.
    expect(APP_SOURCE).toContain("<RepeatChips dateKey={dateKey} />")
    expect(APP_SOURCE).not.toMatch(
      /viewingToday && \(\s*<div className="my-2 flex items-center gap-2">\s*<RepeatChips/
    )
  })

  test("voice logging still belongs to today", () => {
    // Dictating food into a day that has already happened is a different
    // question, so only the voice button keeps the today gate.
    expect(APP_SOURCE).toContain("{viewingToday && <VoiceLogButton />}")
  })
})
