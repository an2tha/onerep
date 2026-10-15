import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"

/**
 * Two things this file keeps from growing back.
 *
 * The *totals*: a day's hydration is one number with one home. Every surface that
 * used to sum `amountMl` on its own was a surface that could disagree with the
 * others about the same day, so summing it anywhere else is a re-introduction of
 * that bug — the sort of thing a later change does innocently.
 *
 * The *write path*: a food entry carries its hydration on the entry itself, which
 * only works if the server-side validator lets the field through. It did not, for
 * one revision, and the failure was silent from the app's side — a ticked drink
 * simply arrived without its water. That is the contract worth pinning.
 */

const SRC = new URL("../../", import.meta.url)

/** Files allowed to touch `amountMl` as arithmetic, and why. */
const OWNS_A_WATER_SUM = new Set([
  // The day total itself, the one place a sum of amountMl belongs.
  "lib/hydration.ts",
  // The offline queue's own bookkeeping: entries the server has not acknowledged
  // yet are added to the server figure rather than read as part of it.
  "lib/pending-water.ts",
])

function sourceFiles(dir: URL, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory())
      return sourceFiles(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`)
    const name = `${prefix}${entry.name}`
    if (!/\.tsx?$/.test(name)) return []
    if (/\.test\.tsx?$|\.legacy\.tsx?$/.test(name)) return []
    return [name]
  })
}

describe("a water total has one home", () => {
  test("no surface sums amountMl by itself", () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      if (OWNS_A_WATER_SUM.has(file)) continue
      const lines = readFileSync(new URL(file, SRC), "utf8").split("\n")
      lines.forEach((line, index) => {
        // A sum, not a mention: `formatWater(entry.amountMl)` and a single
        // entry's own amount are both fine.
        if (/\+\s*[\w.?[\]]*\.amountMl\b/.test(line))
          offenders.push(`${file}:${index + 1}: ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  test("the surfaces that show a total ask the helper for it", () => {
    const readers = [
      "lib/hydration-trend.ts",
      "dashboard/water.tsx",
      "dashboard/quick-action-drawers.tsx",
      "components/health-writeback-repair.tsx",
      "components/widget-data-sync.tsx",
      "pages/Nutrition.tsx",
      "pages/Journal.tsx",
    ]
    for (const file of readers) {
      const source = readFileSync(new URL(file, SRC), "utf8")
      expect(source).toContain("dayHydrationMl")
      expect(source).toMatch(/from "(?:@\/lib\/hydration|\.\/hydration)"/)
    }
  })
})

describe("the drink's water survives the write", () => {
  const convexSource = readFileSync(
    new URL("../../../../../convex/logs/foodLogs.ts", import.meta.url),
    "utf8"
  )

  test("the entry validator accepts hydrationMl", () => {
    expect(convexSource).toContain("hydrationMl: v.optional(v.number())")
  })

  test("and normalizes it like the other optional numbers", () => {
    // The shared list is what deletes a zero rather than storing one, so a drink
    // unticked on a later edit leaves nothing behind.
    expect(convexSource).toMatch(/"alcohol",\s*"hydrationMl",\s*\] as const/)
  })

  test("the app's own entry type carries it too", () => {
    const foodLog = readFileSync(
      new URL("../food-log.ts", import.meta.url),
      "utf8"
    )
    expect(foodLog).toContain("hydrationMl?: number")
  })
})
