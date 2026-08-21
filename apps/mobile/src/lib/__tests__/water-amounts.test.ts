import { describe, expect, test } from "bun:test"
import {
  clearRecentWaterAmounts,
  fmtMl,
  nextRecentWaterAmounts,
  normalizeRecentWaterAmounts,
  readRecentWaterAmounts,
  rememberRecentWaterAmount,
  validateCustomWaterAmount,
  visibleRecentWaterAmounts,
  writeRecentWaterAmounts,
} from "../water-amounts"

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

const RECENT_KEY = "onerep:recent-water-amounts:v1"

describe("fmtMl", () => {
  test("formats ml and whole liters without unnecessary decimals", () => {
    expect(fmtMl(250)).toBe("250 ml")
    expect(fmtMl(1000)).toBe("1 L")
    expect(fmtMl(2000)).toBe("2 L")
  })

  test("formats fractional liters with one decimal", () => {
    expect(fmtMl(1500)).toBe("1.5 L")
    expect(fmtMl(2500)).toBe("2.5 L")
  })
})

describe("validateCustomWaterAmount", () => {
  test("accepts normal custom water entries", () => {
    expect(validateCustomWaterAmount("375")).toEqual({
      amountMl: 375,
      error: null,
    })
  })

  test("trims whitespace and rounds decimals", () => {
    expect(validateCustomWaterAmount(" 250.4 ")).toEqual({
      amountMl: 250,
      error: null,
    })
    expect(validateCustomWaterAmount("250.5")).toEqual({
      amountMl: 251,
      error: null,
    })
  })

  test("rejects blank and non-numeric values", () => {
    expect(validateCustomWaterAmount("")).toEqual({
      amountMl: null,
      error: "Enter an amount in ml.",
    })
    expect(validateCustomWaterAmount("water")).toEqual({
      amountMl: null,
      error: "Use numbers only.",
    })
  })

  test("rejects tiny and huge accidental entries", () => {
    expect(validateCustomWaterAmount("49")).toEqual({
      amountMl: null,
      error: "Use at least 50 ml.",
    })
    expect(validateCustomWaterAmount("3001")).toEqual({
      amountMl: null,
      error: "Use 3 L or less for one entry.",
    })
  })

  test("allows exact min and max bounds", () => {
    expect(validateCustomWaterAmount("50")).toEqual({
      amountMl: 50,
      error: null,
    })
    expect(validateCustomWaterAmount("3000")).toEqual({
      amountMl: 3000,
      error: null,
    })
  })
})

describe("recent water amount helpers", () => {
  test("normalizes, dedupes, bounds, and caps recent amounts", () => {
    expect(
      normalizeRecentWaterAmounts([
        "333",
        333,
        444.4,
        49,
        3001,
        555,
        666,
        777,
        888,
      ])
    ).toEqual([333, 444, 555, 666, 777])
  })

  test("moves an existing amount to the front", () => {
    expect(nextRecentWaterAmounts([333, 444], 444)).toEqual([444, 333])
  })

  test("hides amounts already shown as quick actions", () => {
    expect(visibleRecentWaterAmounts([250, 333, 500], [150, 250, 500])).toEqual(
      [333]
    )
  })

  test("reads valid storage and ignores invalid storage", () => {
    const storage = mockStorage({ [RECENT_KEY]: JSON.stringify([333, 444]) })
    expect(readRecentWaterAmounts(storage)).toEqual([333, 444])

    const brokenStorage = mockStorage({ [RECENT_KEY]: "not-json" })
    expect(readRecentWaterAmounts(brokenStorage)).toEqual([])

    const blockedStorage = {
      getItem() {
        throw new Error("storage blocked")
      },
      setItem() {},
      removeItem() {},
    }
    expect(readRecentWaterAmounts(blockedStorage)).toEqual([])
  })

  test("writes normalized amounts and removes empty lists", () => {
    const storage = mockStorage()
    writeRecentWaterAmounts([333, 333, 444], storage)
    expect(JSON.parse(storage.getItem(RECENT_KEY) ?? "[]")).toEqual([333, 444])

    writeRecentWaterAmounts([], storage)
    expect(storage.getItem(RECENT_KEY)).toBeNull()
  })

  test("remembers an amount and returns the updated list", () => {
    const storage = mockStorage({ [RECENT_KEY]: JSON.stringify([333]) })
    expect(rememberRecentWaterAmount(444, storage)).toEqual([444, 333])
    expect(readRecentWaterAmounts(storage)).toEqual([444, 333])
  })

  test("clears stored recent water amounts", () => {
    const storage = mockStorage({ [RECENT_KEY]: JSON.stringify([333]) })
    clearRecentWaterAmounts(storage)
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

    expect(() => writeRecentWaterAmounts([333], blockedStorage)).not.toThrow()
    expect(() => writeRecentWaterAmounts([], blockedStorage)).not.toThrow()
    expect(() => clearRecentWaterAmounts(blockedStorage)).not.toThrow()
    expect(rememberRecentWaterAmount(333, blockedStorage)).toEqual([333])
  })
})
