import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(name) {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8")
}

const activeWorkout = [
  "ActiveWorkout.tsx",
  "active-workout/set-rows.tsx",
  "active-workout/active-exercise-card.tsx",
].map(source).join("\n")
const workouts = source("Workouts.tsx")
const newPreset = source("NewPreset.tsx")
const supplements = source("Supplements.tsx")
const setRow = readFileSync(
  new URL(
    "../../../../packages/ui/src/components/apple-fitness-set-row.tsx",
    import.meta.url,
  ),
  "utf8",
)

test("active workout communicates time, progress, and next action", () => {
  // One header timer that switches between counting the session and counting
  // rest, rather than two separately labelled readouts. Retro mode adds a third
  // state ahead of it, so the live pair is matched across the wrapping ternary.
  assert.match(
    activeWorkout,
    /rest\.remaining !== null\s*\?\s*"Rest"\s*:\s*"Elapsed"/,
  )
  assert.match(activeWorkout, /formatElapsed\(rest\.remaining \?\? elapsed\)/)
  assert.match(activeWorkout, /role="progressbar"/)
  assert.match(activeWorkout, /aria-label="Workout completion"/)
  assert.match(activeWorkout, /Complete set/)
  assert.match(activeWorkout, /Build this workout/)
})

test("training and preset creation use task-oriented hierarchy", () => {
  // Consistency is reported as this week's sessions and the current streak.
  assert.match(workouts, /This week/)
  assert.match(workouts, /Streak/)
  assert.match(workouts, /calcStreak/)
  assert.match(workouts, /calcWorkoutsThisWeek/)
  assert.match(workouts, /Edit routine/)
  assert.match(workouts, /New preset/)
  assert.match(newPreset, /Workout name/)
  assert.match(newPreset, /Paste a workout plan/)
})

test("supplements prioritizes adherence and labels library actions", () => {
  assert.match(supplements, /Today’s adherence/)
  assert.match(supplements, /Today’s plan/)
  assert.match(supplements, /No supplements to take/)
  assert.match(supplements, /item\.active \? "Tracking" : "Paused"/)
  assert.match(supplements, /Loading today’s supplements…/)
})

test("dense workout UI avoids tiny labels and undersized set controls", () => {
  assert.doesNotMatch(activeWorkout, /text-\[(?:7\.5|8\.5|9|10)px\]/)
  assert.doesNotMatch(
    activeWorkout,
    /text-muted-foreground\/(?:25|30|35)/,
  )
  assert.match(setRow, /min-h-12/)
  assert.match(setRow, /h-11 w-11/)
})
