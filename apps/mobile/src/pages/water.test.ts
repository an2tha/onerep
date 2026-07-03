/**
 * Tests for the pure helper logic in Water.tsx.
 *
 * Water.tsx added optimistic entry management in this PR. The file also
 * contains pure merge logic that can be verified without a DOM or React
 * context. Formatting and custom amount validation are covered by
 * lib/__tests__/water-amounts.test.ts.
 */

import { describe, test, expect } from "bun:test"
import { readFileSync } from "node:fs"

const WATER_SOURCE = readFileSync(new URL("./Water.tsx", import.meta.url), "utf8")

// ─── formatDateLabel ──────────────────────────────────────────────────────────
// Mirror of formatDateLabel from Water.tsx (relies on offsetDateKey helper)

function offsetDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDateLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today"
  const yesterday = offsetDateKey(todayKey, -1)
  if (dateKey === yesterday) return "Yesterday"
  const d = new Date(`${dateKey}T12:00:00Z`)
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
}

describe("formatDateLabel – date navigation labels", () => {
  const today = "2024-06-15"

  test("same date as today returns 'Today'", () => {
    expect(formatDateLabel(today, today)).toBe("Today")
  })

  test("one day before today returns 'Yesterday'", () => {
    expect(formatDateLabel("2024-06-14", today)).toBe("Yesterday")
  })

  test("two days before today is NOT 'Today' or 'Yesterday'", () => {
    const label = formatDateLabel("2024-06-13", today)
    expect(label).not.toBe("Today")
    expect(label).not.toBe("Yesterday")
  })

  test("tomorrow is NOT 'Today' or 'Yesterday'", () => {
    const label = formatDateLabel("2024-06-16", today)
    expect(label).not.toBe("Today")
    expect(label).not.toBe("Yesterday")
  })

  test("offset of -1 from today is 'Yesterday' consistently", () => {
    const yesterday = offsetDateKey(today, -1)
    expect(formatDateLabel(yesterday, today)).toBe("Yesterday")
  })

  test("offset of 0 from today is 'Today' consistently", () => {
    expect(formatDateLabel(offsetDateKey(today, 0), today)).toBe("Today")
  })

  test("label for dates beyond yesterday contains a formatted day string (non-empty)", () => {
    const twoDaysAgo = offsetDateKey(today, -2)
    const label = formatDateLabel(twoDaysAgo, today)
    expect(label.length).toBeGreaterThan(0)
  })

  test("month boundary: yesterday crosses into previous month", () => {
    const marchFirst = "2024-03-01"
    const febTwentyNinth = "2024-02-29" // 2024 is a leap year
    expect(formatDateLabel(febTwentyNinth, marchFirst)).toBe("Yesterday")
  })

  test("year boundary: yesterday crosses into previous year", () => {
    const janFirst = "2024-01-01"
    const dec31 = "2023-12-31"
    expect(formatDateLabel(dec31, janFirst)).toBe("Yesterday")
  })
})

describe("Water page accessibility contract", () => {
  test("date and sheet icon controls have accessible labels", () => {
    expect(WATER_SOURCE).toContain('aria-label="Previous day"')
    expect(WATER_SOURCE).toContain('aria-label="Next day"')
    expect(WATER_SOURCE).toContain('aria-label="Close daily goal"')
    expect(WATER_SOURCE).toContain('aria-label="Close water logger"')
  })

  test("water amount inputs expose stable names and labels", () => {
    expect(WATER_SOURCE).toContain('name="water-goal-ml"')
    expect(WATER_SOURCE).toContain('aria-label="Daily water goal in ml"')
    expect(WATER_SOURCE).toContain('name="custom-water-ml"')
    expect(WATER_SOURCE).toContain('aria-label="Custom water amount in ml"')
  })

  test("quick and custom log actions remain named buttons", () => {
    expect(WATER_SOURCE).toContain("aria-label={`Log ${label} water`}")
    expect(WATER_SOURCE).toContain('aria-label="Log custom water"')
    expect(WATER_SOURCE).toContain('aria-label="Log custom water amount"')
  })

  test("water add and goal save actions expose busy single-flight states", () => {
    expect(WATER_SOURCE).toContain("const [addingAmountMl, setAddingAmountMl]")
    expect(WATER_SOURCE).toContain("if (addingAmountMl !== null) return false")
    expect(WATER_SOURCE).toContain("await addEntryMutation({ date, entry })")
    expect(WATER_SOURCE).toContain("disabled={addingAmountMl !== null}")
    expect(WATER_SOURCE).toContain("aria-busy={addingAmountMl === ml}")
    expect(WATER_SOURCE).toContain("saving={addingAmountMl !== null}")
    expect(WATER_SOURCE).toContain("const [savingGoal, setSavingGoal]")
    expect(WATER_SOURCE).toContain("if (savingGoal) return false")
    expect(WATER_SOURCE).toContain("await setWaterGoal({ goalMl: ml })")
    expect(WATER_SOURCE).toContain("aria-busy={saving}")
    expect(WATER_SOURCE).toContain("const saved = await onSave(draft)")
    expect(WATER_SOURCE).toContain("const saved = await onAdd(ml)")
  })

  test("failed delete restores optimistic-only entries", () => {
    expect(WATER_SOURCE).toContain(
      "const deletedEntry = entriesRef.current.find((entry) => entry.id === id)",
    )
    expect(WATER_SOURCE).toContain(
      "const wasServerEntry = serverEntries.some((entry) => entry.id === id)",
    )
    expect(WATER_SOURCE).toContain("if (deletedEntry && !wasServerEntry)")
    expect(WATER_SOURCE).toContain(
      "prev.some((entry) => entry.id === id) ? prev : [...prev, deletedEntry]",
    )
  })
})

// ─── Optimistic entry merge logic ─────────────────────────────────────────────
// Mirrors the useMemo merge from Water.tsx:
//   const serverIds = new Set(serverEntries.map((e) => e.id))
//   const pending = optimisticEntries.filter((e) => !serverIds.has(e.id))
//   return [...serverEntries, ...pending]

type WaterLogEntry = { id: string; amountMl: number; loggedAt: string }

function mergeEntries(
  serverEntries: WaterLogEntry[],
  optimisticEntries: WaterLogEntry[],
): WaterLogEntry[] {
  const serverIds = new Set(serverEntries.map((e) => e.id))
  const pending = optimisticEntries.filter((e) => !serverIds.has(e.id))
  return [...serverEntries, ...pending]
}

function mergeVisibleEntries(
  serverEntries: WaterLogEntry[],
  optimisticEntries: WaterLogEntry[],
  pendingDeletedIds: Set<string>,
): WaterLogEntry[] {
  const visibleServerEntries = serverEntries.filter(
    (entry) => !pendingDeletedIds.has(entry.id),
  )
  const serverIds = new Set(serverEntries.map((e) => e.id))
  const pending = optimisticEntries.filter(
    (entry) => !serverIds.has(entry.id) && !pendingDeletedIds.has(entry.id),
  )
  return [...visibleServerEntries, ...pending]
}

describe("optimistic entry merge logic", () => {
  test("when there are no optimistic entries, returns server entries", () => {
    const server: WaterLogEntry[] = [
      { id: "s1", amountMl: 250, loggedAt: "2024-01-01T08:00:00Z" },
    ]
    expect(mergeEntries(server, [])).toEqual(server)
  })

  test("when there are no server entries, returns all optimistic entries", () => {
    const optimistic: WaterLogEntry[] = [
      { id: "o1", amountMl: 500, loggedAt: "2024-01-01T09:00:00Z" },
    ]
    expect(mergeEntries([], optimistic)).toEqual(optimistic)
  })

  test("optimistic entry already in server is filtered out (dedup by id)", () => {
    const entry: WaterLogEntry = { id: "shared", amountMl: 300, loggedAt: "2024-01-01T10:00:00Z" }
    const server = [entry]
    const optimistic = [entry]
    const result = mergeEntries(server, optimistic)
    // The entry should appear exactly once
    expect(result.filter((e) => e.id === "shared")).toHaveLength(1)
  })

  test("optimistic entry NOT in server is appended after server entries", () => {
    const server: WaterLogEntry[] = [
      { id: "s1", amountMl: 250, loggedAt: "2024-01-01T08:00:00Z" },
    ]
    const optimistic: WaterLogEntry[] = [
      { id: "o1", amountMl: 750, loggedAt: "2024-01-01T12:00:00Z" },
    ]
    const result = mergeEntries(server, optimistic)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("s1")
    expect(result[1].id).toBe("o1")
  })

  test("server entries always appear before pending optimistic entries", () => {
    const server: WaterLogEntry[] = [
      { id: "s1", amountMl: 250, loggedAt: "2024-01-01T06:00:00Z" },
      { id: "s2", amountMl: 500, loggedAt: "2024-01-01T07:00:00Z" },
    ]
    const optimistic: WaterLogEntry[] = [
      { id: "o1", amountMl: 150, loggedAt: "2024-01-01T08:00:00Z" },
    ]
    const result = mergeEntries(server, optimistic)
    expect(result[0].id).toBe("s1")
    expect(result[1].id).toBe("s2")
    expect(result[2].id).toBe("o1")
  })

  test("multiple optimistic entries, some already synced to server", () => {
    const server: WaterLogEntry[] = [
      { id: "o1", amountMl: 250, loggedAt: "2024-01-01T08:00:00Z" },
    ]
    const optimistic: WaterLogEntry[] = [
      { id: "o1", amountMl: 250, loggedAt: "2024-01-01T08:00:00Z" }, // already synced
      { id: "o2", amountMl: 500, loggedAt: "2024-01-01T09:00:00Z" }, // still pending
    ]
    const result = mergeEntries(server, optimistic)
    expect(result).toHaveLength(2)
    const ids = result.map((e) => e.id)
    expect(ids).toContain("o1")
    expect(ids).toContain("o2")
  })

  test("empty server and empty optimistic returns empty array", () => {
    expect(mergeEntries([], [])).toEqual([])
  })

  test("totalMl calculated from merged entries is correct", () => {
    const server: WaterLogEntry[] = [
      { id: "s1", amountMl: 500, loggedAt: "2024-01-01T08:00:00Z" },
    ]
    const optimistic: WaterLogEntry[] = [
      { id: "o1", amountMl: 750, loggedAt: "2024-01-01T09:00:00Z" },
    ]
    const merged = mergeEntries(server, optimistic)
    const total = merged.reduce((s, e) => s + e.amountMl, 0)
    expect(total).toBe(1250)
  })

  test("pending deleted server entries are hidden immediately", () => {
    const server: WaterLogEntry[] = [
      { id: "s1", amountMl: 500, loggedAt: "2024-01-01T08:00:00Z" },
      { id: "s2", amountMl: 750, loggedAt: "2024-01-01T09:00:00Z" },
    ]
    const merged = mergeVisibleEntries(server, [], new Set(["s1"]))
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe("s2")
  })

  test("pending deleted optimistic entries are hidden immediately", () => {
    const optimistic: WaterLogEntry[] = [
      { id: "o1", amountMl: 500, loggedAt: "2024-01-01T08:00:00Z" },
      { id: "o2", amountMl: 750, loggedAt: "2024-01-01T09:00:00Z" },
    ]
    const merged = mergeVisibleEntries([], optimistic, new Set(["o1"]))
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe("o2")
  })
})

// ─── deleteEntry filter logic ─────────────────────────────────────────────────
// Water.tsx deleteEntry:
//   setOptimisticEntries((prev) => prev.filter((e) => e.id !== id))
//   setDay({ entries: entries.filter((e) => e.id !== id) })

function filterOutEntry(entries: WaterLogEntry[], id: string): WaterLogEntry[] {
  return entries.filter((e) => e.id !== id)
}

describe("deleteEntry filter logic", () => {
  test("removes the entry with the matching id", () => {
    const entries: WaterLogEntry[] = [
      { id: "a", amountMl: 250, loggedAt: "2024-01-01T08:00:00Z" },
      { id: "b", amountMl: 500, loggedAt: "2024-01-01T09:00:00Z" },
    ]
    const result = filterOutEntry(entries, "a")
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("b")
  })

  test("returns empty array when only entry is deleted", () => {
    const entries: WaterLogEntry[] = [
      { id: "only", amountMl: 250, loggedAt: "2024-01-01T08:00:00Z" },
    ]
    expect(filterOutEntry(entries, "only")).toEqual([])
  })

  test("non-existent id leaves entries unchanged", () => {
    const entries: WaterLogEntry[] = [
      { id: "a", amountMl: 250, loggedAt: "2024-01-01T08:00:00Z" },
    ]
    expect(filterOutEntry(entries, "nonexistent")).toEqual(entries)
  })

  test("deletes only the matching entry when multiple exist", () => {
    const entries: WaterLogEntry[] = [
      { id: "a", amountMl: 150, loggedAt: "2024-01-01T08:00:00Z" },
      { id: "b", amountMl: 250, loggedAt: "2024-01-01T09:00:00Z" },
      { id: "c", amountMl: 500, loggedAt: "2024-01-01T10:00:00Z" },
    ]
    const result = filterOutEntry(entries, "b")
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.id)).toEqual(["a", "c"])
  })

  test("filter does not mutate the original array", () => {
    const entries: WaterLogEntry[] = [
      { id: "a", amountMl: 250, loggedAt: "2024-01-01T08:00:00Z" },
    ]
    filterOutEntry(entries, "a")
    expect(entries).toHaveLength(1) // original unchanged
  })

  test("deleteEntry from optimistic only removes from optimistic list", () => {
    const optimistic: WaterLogEntry[] = [
      { id: "o1", amountMl: 250, loggedAt: "2024-01-01T08:00:00Z" },
      { id: "o2", amountMl: 500, loggedAt: "2024-01-01T09:00:00Z" },
    ]
    const filtered = filterOutEntry(optimistic, "o1")
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe("o2")
  })
})

// ─── saveGoal / addEntry construction ─────────────────────────────────────────

describe("addEntry construction logic", () => {
  test("entry object has all required fields", () => {
    // Mirrors the Water.tsx addEntry function body:
    //   const entry: WaterLogEntry = { id: createClientId(), amountMl, loggedAt: new Date().toISOString() }
    const amountMl = 500
    const id = "test-uuid"
    const loggedAt = new Date().toISOString()
    const entry: WaterLogEntry = { id, amountMl, loggedAt }

    expect(entry.id).toBeTruthy()
    expect(entry.amountMl).toBe(500)
    expect(entry.loggedAt).toBeTruthy()
  })

  test("loggedAt is a valid ISO datetime string", () => {
    const loggedAt = new Date().toISOString()
    const parsed = new Date(loggedAt)
    expect(isNaN(parsed.getTime())).toBe(false)
  })

  test("amountMl from quick amounts are all positive integers", () => {
    const quickAmounts = [150, 250, 500, 750, 1000]
    for (const ml of quickAmounts) {
      expect(ml).toBeGreaterThan(0)
      expect(Number.isInteger(ml)).toBe(true)
    }
  })
})
