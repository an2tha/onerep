/**
 * Contract tests for the two ways into logging a past workout.
 *
 * The feature's whole point is that the choice — describe it, or start from a
 * preset — is made once, up front. What needs guarding is that every entry
 * point actually funnels through that sheet rather than quietly reintroducing
 * a shortcut into the blank logger, and that the abridged preset view and the
 * full retro logger agree on the state handed between them.
 *
 * Source-text assertions in the house style: these pages pull in Convex,
 * routing, and Capacitor, so they cannot be imported into a bun test.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8")

const SHEET = read("../components/log-past-workout-sheet.tsx")
const WORKOUTS = read("./Workouts.tsx")
const QUICK = read("./QuickLogPreset.tsx")
const RETRO = read("./ActiveWorkout.tsx")
const ROUTES = read("../main.tsx")
const DASHBOARD = read("../App.tsx")

describe("the sheet asks how before it asks anything else", () => {
  test("offers both paths, and only those", () => {
    expect(SHEET).toContain("Log a past workout")
    expect(SHEET).toContain("Describe it")
    expect(SHEET).toContain("Use a preset")
  })

  test("picking a preset is a second step inside the same sheet", () => {
    expect(SHEET).toContain('useState<"choose" | "preset">("choose")')
    expect(SHEET).toContain("Pick a preset")
  })

  test("carries the day it applies to, so the choice is not made blind", () => {
    expect(SHEET).toContain("onPickPreset(date, preset.id)")
    expect(SHEET).toContain("onDescribe(date)")
  })

  test("says so rather than dead-ending when there are no presets", () => {
    expect(SHEET).toContain("disabled={presets.length === 0}")
    expect(SHEET).toContain("You haven't saved a preset yet.")
  })
})

describe("every entry point funnels through the sheet", () => {
  test("starting a retro log opens the sheet instead of navigating", () => {
    expect(WORKOUTS).toContain(
      "const startRetroLog = useCallback((date: string) => {"
    )
    expect(WORKOUTS).toContain("setLogPastDate(date)")
    // The old signature took a preset id and jumped straight to the logger.
    expect(WORKOUTS).not.toContain("startRetroLog(dateKey, preset.id)")
  })

  test("the dashboard button hands off rather than skipping the choice", () => {
    expect(DASHBOARD).toContain("/workouts?logPast=${offsetIsoDate(-1)}")
    expect(DASHBOARD).not.toContain(
      "navigate(`/workout/log/${offsetIsoDate(-1)}`"
    )
  })

  test("the handoff parameter is consumed so the sheet does not reopen", () => {
    expect(WORKOUTS).toContain('next.delete("logPast")')
    expect(WORKOUTS).toContain("setSearchParams(next, { replace: true })")
  })
})

describe("describing a workout lands in dictation", () => {
  test("the sheet routes to the logger with the describe flag", () => {
    expect(WORKOUTS).toContain("/workout/log/${date}?describe=1")
  })

  test("the logger opens the dictation sheet on arrival", () => {
    expect(RETRO).toContain('searchParams.get("describe") === "1"')
  })

  test("that sheet is the one backed by the log agent", () => {
    expect(RETRO).toContain("api.logs.logAgent.draftLogFromText")
    expect(RETRO).toContain("<BrainDumpSheet")
  })
})

describe("the abridged preset view", () => {
  test("is reachable at its own route", () => {
    expect(ROUTES).toContain('path: "/workout/log/:date/quick"')
    expect(ROUTES).toContain('<ErrorBoundary label="Quick Log">')
  })

  test("the sheet sends a chosen preset there", () => {
    expect(WORKOUTS).toContain(
      "/workout/log/${date}/quick?preset=${encodeURIComponent(presetId)}"
    )
  })

  test("collapses each exercise to sets, reps, and weight", () => {
    expect(QUICK).toContain('label="Sets"')
    expect(QUICK).toContain('label="Reps"')
    expect(QUICK).toContain("setCount: string")
  })

  test("records a session, so every set it writes is completed", () => {
    expect(QUICK).toContain("makeSet(true)")
    expect(QUICK).toContain("completed: true")
  })

  test("saves through the log mutation with the day it happened", () => {
    expect(QUICK).toContain("await logCompletion({")
    expect(QUICK).toContain(
      "completedAt: new Date(`${date}T12:00:00`).getTime()"
    )
    expect(QUICK).not.toContain("finishActive")
  })

  test("waits for the catalog before deciding what is cardio", () => {
    expect(QUICK).toContain("const catalogReady = useMemo(")
    expect(QUICK).toContain("if (!catalogReady) return")
  })

  test("expands rows through one path, so save and handoff cannot disagree", () => {
    const expandCalls = QUICK.match(/expandToExerciseData\(\)/g) ?? []
    expect(expandCalls.length).toBe(2)
  })
})

describe("expanding hands off to the full retro logger", () => {
  test("writes the numbers into the draft key the logger reads", () => {
    expect(QUICK).toContain("retroWorkoutDraftKey(date, sessionId)")
    expect(QUICK).toContain("writeActiveWorkoutDraft(")
    expect(RETRO).toContain("readActiveWorkoutDraft(slot, retroDraftKey)")
  })

  test("hands over the session id so both write the same log row", () => {
    expect(QUICK).toContain(
      "/workout/log/${date}?sessionId=${encodeURIComponent(sessionId)}"
    )
  })

  test("the draft outranks the preset it was seeded from", () => {
    const retroBranch = RETRO.slice(
      RETRO.indexOf("// Reconstructing a past session"),
      RETRO.indexOf("// If there's an active workout in Convex")
    )
    expect(retroBranch).toContain("readActiveWorkoutDraft(slot, retroDraftKey)")
    expect(retroBranch.indexOf("readActiveWorkoutDraft")).toBeLessThan(
      retroBranch.indexOf("if (presetId && presets)")
    )
  })

  test("an edit of a saved log still wins over any stale draft", () => {
    const retroBranch = RETRO.slice(
      RETRO.indexOf("// Reconstructing a past session"),
      RETRO.indexOf("// If there's an active workout in Convex")
    )
    expect(retroBranch.indexOf("if (editingLog) {")).toBeLessThan(
      retroBranch.indexOf("readActiveWorkoutDraft")
    )
  })
})
