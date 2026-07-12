import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function source(name) {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8")
}

const activeWorkout = source("ActiveWorkout.tsx")
const workouts = source("Workouts.tsx")
const newPreset = source("NewPreset.tsx")
const supplements = source("Supplements.tsx")
const setRow = readFileSync(
  new URL("../components/workout/apple-fitness-set-row.tsx", import.meta.url),
  "utf8",
)

test("active workout communicates time, progress, and next action", () => {
  assert.match(activeWorkout, /Workout time/)
  assert.match(activeWorkout, /Rest remaining/)
  assert.match(activeWorkout, /role="progressbar"/)
  assert.match(activeWorkout, /Complete set/)
  assert.match(activeWorkout, /Build this workout/)
})

test("training and preset creation use task-oriented hierarchy", () => {
  assert.match(workouts, /Four-week consistency/)
  assert.match(workouts, /Edit routine/)
  assert.match(workouts, /New preset/)
  assert.match(newPreset, /Workout name/)
  assert.match(newPreset, /Import workout from text/)
})

test("supplements prioritizes adherence and labels library actions", () => {
  assert.match(supplements, /Today’s adherence/)
  assert.match(supplements, /Today’s plan/)
  assert.match(supplements, /No supplements to take/)
  assert.match(supplements, /item\.active \? "Tracking" : "Paused"/)
  assert.match(supplements, /Loading today’s supplements…/)
})

test("dense workout UI avoids tiny labels and undersized set controls", () => {
  assert.doesNotMatch(activeWorkout, /text-\[(?:7\.5|8\.5|9|10|11|12)px\]/)
  assert.doesNotMatch(
    activeWorkout,
    /text-muted-foreground\/(?:25|30|35|40|45|50|55)/,
  )
  assert.match(setRow, /min-h-12/)
  assert.match(setRow, /h-11 w-11/)
})
