import { describe, expect, test } from "bun:test"

import type { FoodLogEntry } from "../food-log"
import {
  claimWaterSkipNotice,
  resetWaterSkipNoticeForTests,
  saveFoodLogEntry,
} from "../food-log-write"

function entry(overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: "tea-1",
    name: "Lemon tea",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    loggedAt: "2026-10-17T20:00:00.000Z",
    meal: "snack-post-dinner",
    ...overrides,
  }
}

const OLDER_SERVER = new Error(
  "[CONVEX M(logs/foodLogs:addEntry)] [Request ID: 8d944b338061822c] Server Error"
)

describe("saving a food entry", () => {
  test("a food with no water is written once, untouched", async () => {
    const calls: Array<{ date: string; entry: FoodLogEntry }> = []
    const result = await saveFoodLogEntry(
      async (args) => void calls.push(args),
      { date: "2026-10-17", entry: entry() }
    )

    expect(result.waterSkipped).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.entry).toEqual(entry())
  })

  test("a drink the server understands is written once, with its water", async () => {
    const calls: Array<{ date: string; entry: FoodLogEntry }> = []
    const drink = entry({ hydrationMl: 250, name: "Lemon tea stick" })

    const result = await saveFoodLogEntry(
      async (args) => void calls.push(args),
      { date: "2026-10-17", entry: drink }
    )

    expect(result.waterSkipped).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.entry.hydrationMl).toBe(250)
  })

  test("a server that predates the water field still saves the food", async () => {
    // The record an older backend refuses: `hydrationMl` is not in its
    // validator, so the whole entry is rejected and Convex reports only
    // "Server Error". The meal has to survive that.
    const calls: Array<{ date: string; entry: FoodLogEntry }> = []
    const drink = entry({ hydrationMl: 250, name: "Lemon tea stick" })
    const addEntry = async (args: { date: string; entry: FoodLogEntry }) => {
      calls.push(args)
      if ("hydrationMl" in args.entry) throw OLDER_SERVER
      return { ok: true }
    }

    const result = await saveFoodLogEntry(addEntry, {
      date: "2026-10-17",
      entry: drink,
    })

    expect(result.waterSkipped).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.entry).not.toHaveProperty("hydrationMl")
    // Everything else is the same record, including the id that makes the
    // retry replace rather than duplicate a row the server did store.
    const { hydrationMl: _droppedWater, ...sameRecord } = drink
    expect(calls[1]?.entry).toEqual(sameRecord)
    expect(calls[1]?.entry.id).toBe(drink.id)
    expect(calls[1]?.date).toBe("2026-10-17")
  })

  test("a failure the water field cannot explain is reported unchanged", async () => {
    const offline = new Error("Failed to fetch")
    let attempts = 0
    const addEntry = async () => {
      attempts += 1
      throw offline
    }

    await expect(
      saveFoodLogEntry(addEntry, {
        date: "2026-10-17",
        entry: entry({ hydrationMl: 250 }),
      })
    ).rejects.toThrow("Failed to fetch")
    // The first error is the informative one: the retry only exists to rule
    // the water field out.
    expect(attempts).toBe(2)
  })

  test("water of zero is not water, so nothing is retried", async () => {
    const calls: Array<{ date: string; entry: FoodLogEntry }> = []
    const result = await saveFoodLogEntry(
      async (args) => void calls.push(args),
      { date: "2026-10-17", entry: entry({ hydrationMl: 0 }) }
    )

    expect(result.waterSkipped).toBe(false)
    expect(calls).toHaveLength(1)
  })
})

describe("the dropped-water notice", () => {
  test("is claimed once per launch, not once per drink", () => {
    resetWaterSkipNoticeForTests()

    // Someone who counts every coffee logs six a day; six toasts saying the
    // same thing is how a notice stops being read.
    expect(claimWaterSkipNotice()).toBe(true)
    expect(claimWaterSkipNotice()).toBe(false)
    expect(claimWaterSkipNotice()).toBe(false)
  })

  test("comes back on the next launch", () => {
    resetWaterSkipNoticeForTests()
    expect(claimWaterSkipNotice()).toBe(true)

    resetWaterSkipNoticeForTests()
    expect(claimWaterSkipNotice()).toBe(true)
  })
})

describe("what a failed save looks like to the user", () => {
  test("the backend's redacted prefix never reaches the toast", async () => {
    const { offlineMutationErrorMessage } = await import(
      "../offline-mutation-errors"
    )

    // Observed on a device: Convex hides the reason in production, leaving a
    // request id and "Server Error" — a support reference, not a sentence.
    const message = offlineMutationErrorMessage(OLDER_SERVER, "Could not save")
    expect(message).toBe("Could not save")
    expect(message).not.toContain("CONVEX")
    expect(message).not.toContain("Request ID")
  })

  test("a reason the server actually gave is still shown", async () => {
    const { offlineMutationErrorMessage } = await import(
      "../offline-mutation-errors"
    )

    expect(
      offlineMutationErrorMessage(
        new Error("Nutrition entry not found"),
        "Could not save"
      )
    ).toBe("Nutrition entry not found")
  })

  test("a network failure keeps its own words", async () => {
    const { offlineMutationErrorMessage } = await import(
      "../offline-mutation-errors"
    )

    expect(
      offlineMutationErrorMessage(new Error("Failed to fetch"), "Could not save")
    ).toBe("Failed to fetch")
  })
})
