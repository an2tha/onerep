import { describe, expect, test } from "bun:test"
import { reconcilePendingWater } from "../pending-water"

describe("pending water reconciliation", () => {
  const pending = [
    { id: "first", date: "2026-09-12", amountMl: 313 },
    { id: "second", date: "2026-09-13", amountMl: 312 },
  ]

  test("changing dates preserves each day's queued pours", () => {
    expect(reconcilePendingWater(pending, "2026-09-13", []))
      .toEqual(pending)
  })

  test("a pour from another device does not acknowledge a local pour", () => {
    expect(reconcilePendingWater(pending, "2026-09-12", [{ id: "remote" }]))
      .toEqual(pending)
  })

  test("acknowledges the exact entry even if the day's total also decreased", () => {
    expect(reconcilePendingWater(pending, "2026-09-12", [{ id: "first" }]))
      .toEqual([pending[1]!])
  })
})
