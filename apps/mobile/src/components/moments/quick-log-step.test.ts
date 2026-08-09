/**
 * Contract tests for the moment's retro-log step.
 *
 * The point of this screen is that the day is chosen once and the session is
 * logged here. Every regression it can suffer is the same regression: quietly
 * turning back into a link to another page.
 *
 * Source-text assertions in the house style: the component pulls in Convex,
 * routing and the exercise catalog, so it cannot be imported into a bun test.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8")

const STEP = read("./quick-log-step.tsx")
const CHECK_IN = read("./check-in-moment.tsx")

describe("the day step logs rather than navigates", () => {
  test("offers both one-tap sources: recent sessions and saved plans", () => {
    expect(STEP).toContain("buildQuickLogCandidates(")
    expect(STEP).toContain("presetRows.map(")
    expect(STEP).toContain("repeatSession(candidate)")
    expect(STEP).toContain("logPreset(row)")
  })

  test("writes both of them through the one completion mutation", () => {
    expect(STEP).toContain("logs.workouts.completion")
    // Two callers, one writer, so both get the same slot and the same undo.
    expect(STEP.match(/await logCompletion\(\{/g)).toHaveLength(1)
  })

  /**
   * It used to hand off to `/workouts?logPast=`, which asked for the day a
   * second time on a page the user had not chosen to visit.
   */
  test("the escape hatch opens the logger on the day already chosen", () => {
    expect(STEP).toContain("`/workout/log/${date}`")
    expect(STEP).not.toContain("logPast")
  })

  test("names that escape hatch as adding an exercise, not as leaving", () => {
    expect(STEP).toContain("Another exercise")
    expect(STEP).toContain("Add exercises")
  })

  /** A blank screen with one button that leaves is the state this replaced. */
  test("an account with no history still gets an explanation and a next step", () => {
    expect(STEP).toContain("Nothing to repeat yet")
    expect(STEP).toContain("Build a routine")
    // And it waits for the queries before claiming there is nothing.
    expect(STEP).toContain("!loading && !hasOneTapOptions")
  })

  test("a day already holding two sessions disables the one-tap rows", () => {
    expect(STEP).toContain("const dayFull = freeSlot === null")
    expect(STEP).toContain("disabled={busy || dayFull}")
  })

  test("the check-in hands the day step its history rather than requerying", () => {
    expect(CHECK_IN).toContain("<QuickLogStep")
    expect(CHECK_IN).toContain("workoutLogs={workoutLogs}")
  })
})
