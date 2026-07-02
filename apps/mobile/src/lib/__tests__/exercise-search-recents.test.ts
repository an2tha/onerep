import { describe, expect, test } from "bun:test"
import { getExerciseById } from "../exercise-catalog"
import {
  clearRecentExerciseSearches,
  compactRecentExerciseSearch,
  nextRecentExerciseSearches,
  normalizeRecentExerciseSearches,
  readRecentExerciseSearches,
  rememberRecentExerciseSearch,
  visibleRecentExerciseSearches,
  writeRecentExerciseSearches,
} from "../exercise-search-recents"

function mockStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}

const RECENT_KEY = "onerep:recent-exercises:v1"
function exercise(id: string) {
  const result = getExerciseById(id)
  if (!result) throw new Error(`Missing test exercise ${id}`)
  return result
}

const squat = exercise("e1")
const bench = exercise("e2")
const deadlift = exercise("e3")
const pullup = exercise("e4")
const run = exercise("e9")
const plank = exercise("e17")
const row = exercise("e6")
const curl = exercise("e7")
const dip = exercise("e8")

describe("recent exercise search helpers", () => {
  test("normalizes, dedupes, and caps recent exercises", () => {
    expect(
      normalizeRecentExerciseSearches([
        compactRecentExerciseSearch(squat),
        compactRecentExerciseSearch(bench),
        { ...compactRecentExerciseSearch(squat), name: "Duplicate Squat" },
        { id: "bad", name: "Bad", category: "invalid" },
        { id: "missing-name", category: "strength" },
        compactRecentExerciseSearch(deadlift),
        compactRecentExerciseSearch(pullup),
        compactRecentExerciseSearch(run),
        compactRecentExerciseSearch(plank),
        compactRecentExerciseSearch(row),
        compactRecentExerciseSearch(curl),
        compactRecentExerciseSearch(dip),
      ]).map((exercise) => exercise.id)
    ).toEqual(["e1", "e2", "e3", "e4", "e9", "e17", "e6", "e7"])
  })

  test("moves an existing exercise to the front", () => {
    expect(
      nextRecentExerciseSearches(
        [compactRecentExerciseSearch(squat), compactRecentExerciseSearch(bench)],
        squat
      ).map((exercise) => exercise.id)
    ).toEqual(["e1", "e2"])

    expect(
      nextRecentExerciseSearches(
        [compactRecentExerciseSearch(squat), compactRecentExerciseSearch(bench)],
        bench
      ).map((exercise) => exercise.id)
    ).toEqual(["e2", "e1"])
  })

  test("reads valid storage and ignores invalid storage", () => {
    const storage = mockStorage({
      [RECENT_KEY]: JSON.stringify([
        compactRecentExerciseSearch(squat),
        compactRecentExerciseSearch(bench),
      ]),
    })

    expect(readRecentExerciseSearches(storage).map((exercise) => exercise.id))
      .toEqual(["e1", "e2"])

    const brokenStorage = mockStorage({ [RECENT_KEY]: "not-json" })
    expect(readRecentExerciseSearches(brokenStorage)).toEqual([])

    const blockedStorage = {
      getItem() {
        throw new Error("storage blocked")
      },
      setItem() {},
      removeItem() {},
    }
    expect(readRecentExerciseSearches(blockedStorage)).toEqual([])
  })

  test("writes normalized searches and removes empty lists", () => {
    const storage = mockStorage()
    writeRecentExerciseSearches(
      [
        compactRecentExerciseSearch(squat),
        { ...compactRecentExerciseSearch(squat), name: "Duplicate Squat" },
        compactRecentExerciseSearch(bench),
      ],
      storage
    )

    expect(
      JSON.parse(storage.getItem(RECENT_KEY) ?? "[]").map(
        (exercise: { id: string }) => exercise.id
      )
    ).toEqual(["e1", "e2"])

    writeRecentExerciseSearches([], storage)
    expect(storage.getItem(RECENT_KEY)).toBeNull()
  })

  test("remembers an exercise and returns the updated list", () => {
    const storage = mockStorage({
      [RECENT_KEY]: JSON.stringify([compactRecentExerciseSearch(squat)]),
    })

    expect(
      rememberRecentExerciseSearch(bench, storage).map((exercise) => exercise.id)
    ).toEqual(["e2", "e1"])
    expect(readRecentExerciseSearches(storage).map((exercise) => exercise.id))
      .toEqual(["e2", "e1"])
  })

  test("hides exercises already added to the current workout", () => {
    expect(
      visibleRecentExerciseSearches("e1 e3".split(" "), [
        compactRecentExerciseSearch(squat),
        compactRecentExerciseSearch(bench),
        compactRecentExerciseSearch(deadlift),
      ]).map((exercise) => exercise.id)
    ).toEqual(["e2"])
  })

  test("clears stored recent exercises", () => {
    const storage = mockStorage({
      [RECENT_KEY]: JSON.stringify([compactRecentExerciseSearch(squat)]),
    })
    clearRecentExerciseSearches(storage)
    expect(storage.getItem(RECENT_KEY)).toBeNull()
  })

  test("swallows storage write and clear failures", () => {
    const blockedStorage = {
      getItem: () => null,
      setItem() {
        throw new Error("quota exceeded")
      },
      removeItem() {
        throw new Error("remove blocked")
      },
    }

    expect(() =>
      writeRecentExerciseSearches(
        [compactRecentExerciseSearch(squat)],
        blockedStorage
      )
    ).not.toThrow()
    expect(() => writeRecentExerciseSearches([], blockedStorage)).not.toThrow()
    expect(() => clearRecentExerciseSearches(blockedStorage)).not.toThrow()
    expect(rememberRecentExerciseSearch(squat, blockedStorage)).toEqual([
      compactRecentExerciseSearch(squat),
    ])
  })
})
