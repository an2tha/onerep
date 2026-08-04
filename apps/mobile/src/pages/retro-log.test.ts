/**
 * Contract tests for retro mode — logging a workout after the fact.
 *
 * The set-entry UI is shared with the live logger, so what needs guarding is
 * everything retro mode must *not* do. Chief among them: `activeWorkouts` is
 * keyed by `(userId, slot)` with no date column, so a reconstructed session
 * writing there would silently overwrite a workout running right now.
 *
 * These are source-text assertions in the house style: the page pulls in
 * Convex, routing, and Capacitor, so it cannot be imported into a bun test.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const PAGE = readFileSync(
  new URL("./ActiveWorkout.tsx", import.meta.url),
  "utf8"
)
const LIB = readFileSync(
  new URL("../lib/workout-logging.ts", import.meta.url),
  "utf8"
)
const ROUTES = readFileSync(new URL("../main.tsx", import.meta.url), "utf8")

describe("retro mode never touches live workout state", () => {
  test("does not subscribe to the active workout", () => {
    expect(PAGE).toContain('isRetro ? "skip" : { slot }')
  })

  test("the three activeWorkouts writers are unreachable while reconstructing", () => {
    // createActive
    expect(PAGE).toMatch(
      /useEffect\(\(\) => \{\s*if \(isRetro\) return\s*if \(!isInitialized\) return\s*if \(abortingRef\.current\) return\s*if \(items\.length === 0\) return/
    )
    // updateActive, via the debounced sync closure
    expect(PAGE).toContain("if (isRetroRef.current) return")
    // abortActive
    expect(PAGE).toContain("if (!isRetro) await abortActive({ slot })")
  })

  test("saves through the log mutation, never finishActive", () => {
    const retroSave = PAGE.slice(
      PAGE.indexOf(
        "if (isRetro) {",
        PAGE.indexOf("async function handleFinish")
      ),
      PAGE.indexOf("// Finish the active workout in Convex")
    )
    expect(retroSave).toContain("await logCompletion({")
    expect(retroSave).toContain("date: retroDate")
    expect(retroSave).toContain("sessionId: retroSessionId")
    // finishActive derives the date server-side in UTC, which would misfile it.
    expect(retroSave).not.toContain("finishActive")
  })

  test("does not start a Live Activity for a workout that already ended", () => {
    expect(PAGE).toMatch(
      /useEffect\(\(\) => \{\s*if \(isRetro\) return\s*if \(!isInitialized \|\| items\.length === 0\) return\s*if \(!liveActivityStartedRef\.current\)/
    )
  })

  test("never starts a rest countdown", () => {
    expect(PAGE).toContain("if (isRetro) return\n      rest.start(seconds)")
    // Every call site goes through the guarded wrapper.
    expect(PAGE).toContain("onStartRest={startRest}")
    expect(PAGE).toContain("startRest(currentSet.restSeconds)")
    expect(PAGE).not.toContain("onStartRest={rest.start}")
  })

  test("reads a rest-timer key no live session writes", () => {
    expect(PAGE).toContain(
      "isRetro ? `${REST_TIMER_PREFIX}retro` : restTimerKey(slot)"
    )
  })

  test("drafts under a date-scoped key, not a slot-scoped one", () => {
    expect(LIB).toContain("export function retroWorkoutDraftKey(")
    expect(LIB).toContain("`${RETRO_WORKOUT_DRAFT_PREFIX}${date}:${sessionId}`")
    expect(PAGE).toContain("retroWorkoutDraftKey(retroDate, retroSessionId)")
  })
})

describe("retro mode records what actually happened", () => {
  test("is reachable at its own route", () => {
    expect(ROUTES).toContain('path: "/workout/log/:date"')
    expect(ROUTES).toContain('<ErrorBoundary label="Retro Log">')
  })

  test("sets added while reconstructing start already completed", () => {
    expect(LIB).toContain("export function makeSet(completed = false)")
    expect(PAGE).toContain("makeDefaultExerciseState(ex, isRetro)")
    expect(PAGE).toContain("defaultSetCompleted={isRetro}")
    expect(PAGE).toContain("makeSet(defaultSetCompleted)")
  })

  test("sends the instant the session finished, so it is not stamped now", () => {
    expect(PAGE).toContain("{ completedAt: retroCompletedAt }")
  })

  test("seeds duration from the recorded session before estimating", () => {
    expect(PAGE).toContain(
      "setRetroDuration(Math.round(healthWorkout.durationSeconds))"
    )
    expect(PAGE).toContain("estimateRetroDurationSeconds(items, exData)")
  })

  test("reuses the Apple Health session namespace so re-saves are idempotent", () => {
    expect(PAGE).toContain("healthWorkout?.sessionId ??")
    expect(PAGE).toContain("await attachHealthWorkout({")
  })

  test("offers editing instead of failing when a date is full", () => {
    expect(PAGE).toContain(
      'if (isRetro && retroMode === "create" && retroFreeSlot === null)'
    )
    expect(PAGE).toContain("Edit workout {log.slot ?? index + 1}")
  })

  test("resolves dictated exercise names against the catalog", () => {
    // The model returns names; an id it invented must never reach the log.
    expect(PAGE).toContain("pickBestExerciseMatch(drafted.name, candidates)")
    expect(PAGE).toContain("const unmatched = resolved")
    expect(PAGE).toContain('Could not find ${unmatched.join(", ")}')
  })

  test("dictation is biased toward lifting vocabulary", () => {
    expect(PAGE).toContain("contextualStrings: WORKOUT_DICTATION_TERMS")
    expect(PAGE).toContain('"AMRAP"')
    // Stopping first recovers the tail partial iOS drops on send.
    expect(PAGE).toContain(
      'dictation.status === "listening" ? await dictation.stop() : text'
    )
  })
})

describe("editing a saved workout", () => {
  test("rebuilds editable state from the stored log", () => {
    expect(LIB).toContain("export function exerciseStateFromLoggedExercise(")
    expect(PAGE).toContain("exerciseStateFromLoggedExercise(")
  })

  test("the Workouts page wires the edit affordance for one and two logs", () => {
    const workouts = readFileSync(
      new URL("./Workouts.tsx", import.meta.url),
      "utf8"
    )
    expect(workouts).toContain("const editRetroLog = useCallback(")
    expect(workouts).toContain("onEdit={(editSlot) =>")
    expect(workouts).toContain(
      "onEdit={() =>\n                            editRetroLog(dateKey, workoutLogs[0]?.sessionId)"
    )
    expect(workouts).toContain("Log this workout")
    expect(workouts).toContain("Add to this workout")
  })
})
