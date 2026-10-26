import { describe, expect, test } from "bun:test"
import {
  describeDayCheck,
  summariseWritebackChecks,
  unreadableLogCheck,
  unreadableStoreCheck,
  writebackVerdict,
  type WritebackDayCheck,
} from "../health-writeback-compare"

function day(overrides: Partial<WritebackDayCheck> = {}): WritebackDayCheck {
  return {
    date: "2026-10-16",
    appKcal: 1850,
    appWaterMl: 2000,
    storeKcal: 1850,
    storeWaterMl: 2000,
    ...overrides,
  }
}

describe("write-back verification", () => {
  test("a store holding at least what we wrote counts as landed", () => {
    expect(writebackVerdict(day())).toBe("landed")
  })

  test("other apps' food only ever adds to the store's day, so more still landed", () => {
    expect(
      writebackVerdict(day({ appWaterMl: 0, storeWaterMl: null, storeKcal: 2200 }))
    ).toBe("landed")
  })

  test("a logged day the store has nothing for is missing", () => {
    expect(
      writebackVerdict(day({ storeKcal: null, storeWaterMl: null }))
    ).toBe("missing")
    expect(writebackVerdict(day({ storeKcal: 0, storeWaterMl: 0 }))).toBe(
      "missing"
    )
  })

  test("less than we wrote is partial, not missing and not landed", () => {
    // The signature of a stale stack or a half-finished push: something is
    // there, and it is not the day we logged.
    expect(writebackVerdict(day({ storeKcal: 900 }))).toBe("partial")
    expect(writebackVerdict(day({ storeWaterMl: 0 }))).toBe("partial")
  })

  test("an empty day in OneRep is not a failure", () => {
    expect(
      writebackVerdict(
        day({ appKcal: 0, appWaterMl: 0, storeKcal: null, storeWaterMl: null })
      )
    ).toBe("nothing-to-write")
  })

  test("water alone is still something to check", () => {
    expect(
      writebackVerdict(day({ appKcal: 0, storeKcal: null, storeWaterMl: 2000 }))
    ).toBe("landed")
  })

  test("a day's line names both sides and the store", () => {
    const line = describeDayCheck(day(), "Health Connect")
    expect(line).toContain("OneRep")
    expect(line).toContain("Health Connect")
  })

  test("the headline counts what landed and calls out a total miss", () => {
    const summary = summariseWritebackChecks(
      [day(), day({ date: "2026-10-15" })],
      "Health Connect"
    )
    expect(summary).toMatchObject({ checked: 2, landed: 2, missing: 0 })
    expect(summary.headline).toContain("Health Connect")

    const none = summariseWritebackChecks(
      [day({ storeKcal: null, storeWaterMl: null })],
      "Health Connect"
    )
    expect(none).toMatchObject({ checked: 1, landed: 0, missing: 1 })
    expect(none.headline).toContain("none")
  })

  test("a week with nothing logged says so instead of accusing the store", () => {
    const summary = summariseWritebackChecks(
      [day({ appKcal: 0, appWaterMl: 0 })],
      "Health Connect"
    )
    expect(summary.checked).toBe(0)
    expect(summary.headline).not.toContain("missing")
  })

  test("a check that could not run reports nothing rather than a verdict", () => {
    // Both of these are the same failure the feature exists to prevent, one step
    // earlier: an unanswerable question rendered as an answer.
    const refused = unreadableStoreCheck("Health Connect", "no_permission")
    expect(refused).toMatchObject({ checked: 0, landed: 0, missing: 0 })
    expect(refused.headline).toContain("Health Connect")
    expect(refused.headline).toContain("read")
    expect(refused.headline).not.toContain("missing")

    const silent = unreadableStoreCheck("Health Connect", "unknown")
    expect(silent.headline).not.toContain("read your food")

    const log = unreadableLogCheck()
    expect(log).toMatchObject({ checked: 0, landed: 0, missing: 0 })
    expect(log.headline).toContain("log")
  })
})
