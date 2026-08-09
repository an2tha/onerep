import { describe, test } from "node:test"
import assert from "node:assert/strict"

import {
  metricSeries,
  personalRecords,
  summariseSessions,
  trendPercent,
  type HistorySession,
} from "../exercise-stats"
import {
  exerciseImageUrls,
  exerciseThumbnailUrl,
  hasExerciseArt,
} from "../exercise-media"

function set(weight: number, reps: number, type = "normal", completed = true) {
  return { weight, reps, type, completed }
}

const HISTORY: HistorySession[] = [
  {
    id: "b",
    date: "2026-02-10",
    sets: [set(100, 5), set(100, 5), set(105, 3)],
  },
  {
    id: "a",
    date: "2026-01-06",
    sets: [set(40, 10, "warmup"), set(90, 5), set(90, 5)],
  },
]

describe("summariseSessions", () => {
  test("orders oldest first and drops warm-ups from volume", () => {
    const sessions = summariseSessions(HISTORY)
    assert.equal(sessions.length, 2)
    assert.equal(sessions[0]!.date, "2026-01-06")
    assert.equal(sessions[0]!.sets.length, 2)
    assert.equal(sessions[0]!.volume, 900)
    assert.equal(sessions[0]!.heaviestWeight, 90)
    assert.equal(sessions[1]!.volume, 1315)
    assert.equal(sessions[1]!.heaviestWeight, 105)
  })

  test("drops sessions where nothing was completed", () => {
    const sessions = summariseSessions([
      { date: "2026-03-01", sets: [set(60, 5, "normal", false)] },
    ])
    assert.deepEqual(sessions, [])
  })

  test("survives undefined history", () => {
    assert.deepEqual(summariseSessions(undefined), [])
  })
})

describe("personalRecords", () => {
  test("keeps the date a record was first hit", () => {
    const sessions = summariseSessions([
      { date: "2026-01-01", sets: [set(100, 5)] },
      { date: "2026-02-01", sets: [set(100, 5)] },
    ])
    assert.equal(personalRecords(sessions).heaviestWeight?.date, "2026-01-01")
  })

  test("reports every category from a real history", () => {
    const records = personalRecords(summariseSessions(HISTORY))
    assert.equal(records.heaviestWeight?.value, 105)
    assert.equal(records.bestSessionVolume?.value, 1315)
    assert.equal(records.mostReps?.value, 5)
    assert.ok((records.bestE1rm?.value ?? 0) > 105)
  })

  test("returns nulls with no sessions", () => {
    assert.deepEqual(personalRecords([]), {
      heaviestWeight: null,
      bestE1rm: null,
      bestSessionVolume: null,
      mostReps: null,
    })
  })
})

describe("metricSeries and trendPercent", () => {
  test("series follows the selected metric in chronological order", () => {
    const sessions = summariseSessions(HISTORY)
    assert.deepEqual(metricSeries(sessions, "heaviest"), [90, 105])
    assert.deepEqual(metricSeries(sessions, "volume"), [900, 1315])
  })

  test("trend is a whole-percent change across the series", () => {
    assert.equal(trendPercent([100, 110]), 10)
    assert.equal(trendPercent([100, 100]), 0)
    assert.equal(trendPercent([100, 50]), -50)
  })

  test("a single session has no trend to report", () => {
    assert.equal(trendPercent([100]), null)
    assert.equal(trendPercent([]), null)
  })
})

describe("exercise art urls", () => {
  test("builds both frames for a catalog id", () => {
    assert.deepEqual(exerciseImageUrls("Barbell_Squat"), [
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/0.jpg",
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/1.jpg",
    ])
    assert.equal(
      exerciseThumbnailUrl("3_4_Sit-Up"),
      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/3_4_Sit-Up/0.jpg"
    )
  })

  test("user-authored and malformed ids get no artwork", () => {
    assert.equal(hasExerciseArt("custom:abc123"), false)
    assert.equal(hasExerciseArt("../../etc/passwd"), false)
    assert.equal(hasExerciseArt("Bench Press"), false)
    assert.equal(hasExerciseArt(undefined), false)
    assert.deepEqual(exerciseImageUrls("custom:abc123"), [])
    assert.equal(exerciseThumbnailUrl(null), null)
  })
})
