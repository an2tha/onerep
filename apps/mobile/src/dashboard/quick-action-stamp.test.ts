/**
 * The wheel picks a minute; the entry had better land on it.
 *
 * This is the regression for a tester's report that back-filled entries were
 * stamped at whatever time they were typed. The sheet knew the minute, the
 * drawer never saw it, and every path through here called `new Date()`.
 */
import { describe, expect, it } from "bun:test"
import { stampAt } from "@/dashboard/quick-action-drawers"

describe("stampAt", () => {
  it("puts the entry at the picked minute on the viewed day", () => {
    const at = new Date(stampAt("2026-08-27", 9 * 60 + 30))
    expect(at.getFullYear()).toBe(2026)
    expect(at.getMonth()).toBe(7)
    expect(at.getDate()).toBe(27)
    expect(at.getHours()).toBe(9)
    expect(at.getMinutes()).toBe(30)
  })

  it("keeps the picked minute on a day that is not today", () => {
    const at = new Date(stampAt("2026-01-02", 23 * 60 + 5))
    expect(at.getMonth()).toBe(0)
    expect(at.getDate()).toBe(2)
    expect(at.getHours()).toBe(23)
    expect(at.getMinutes()).toBe(5)
  })

  it("keeps the viewed day even when no minute was picked", () => {
    const now = new Date()
    const at = new Date(stampAt("2026-08-27"))
    expect(at.getFullYear()).toBe(2026)
    expect(at.getMonth()).toBe(7)
    expect(at.getDate()).toBe(27)
    expect(at.getHours()).toBe(now.getHours())
    expect(at.getMinutes()).toBe(now.getMinutes())
  })
})
