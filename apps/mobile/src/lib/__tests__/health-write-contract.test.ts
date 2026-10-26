import { beforeEach, describe, expect, mock, test } from "bun:test"
import { readFileSync } from "node:fs"

/**
 * The write path's contract with the native layer.
 *
 * These methods used to answer `{ saved: false }` and nothing else, which is
 * how "the app never wrote my food" and "the app wrote it" became the same
 * observation. The reasons are the point of the change, so they are what is
 * pinned here — along with the fallback that keeps an older shell working and
 * the day-record write that replaced four single-nutrient records.
 */

type DailyCall = { metric: string; date: string; value: number }
type DayCall = {
  date: string
  energyKcal?: number
  proteinG?: number
  carbsG?: number
  fatG?: number
  waterMl?: number
}
type ItemCall = {
  date: string
  items: {
    id: string
    name: string
    meal: string
    loggedAt?: string
    calories: number
    protein: number
    carbs: number
    fat: number
  }[]
  waterMl?: number
  cleared?: boolean
}

const plugin: Record<string, unknown> = {}
const calls: { daily: DailyCall[]; day: DayCall[]; items: ItemCall[] } = {
  daily: [],
  day: [],
  items: [],
}

// Mutable so one file can put the same question to both platforms.
let platform = "android"

mock.module("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => platform,
  },
  registerPlugin: () => plugin,
}))

const {
  getHealthWriteAccess,
  healthStoreNeedsDailyCleanup,
  saveHealthDailyMetric,
  saveHealthNutritionDay,
  saveHealthNutritionItems,
} = await import("../health-provider")

beforeEach(() => {
  platform = "android"
  for (const key of Object.keys(plugin)) delete plugin[key]
  calls.daily = []
  calls.day = []
  calls.items = []
})

describe("health write contract", () => {
  test("a day goes out as one record when the native side has the method", async () => {
    plugin.saveNutritionDay = async (options: DayCall) => {
      calls.day.push(options)
      return { saved: true, written: 2 }
    }

    const result = await saveHealthNutritionDay({
      date: "2026-10-16",
      energyKcal: 1850,
      proteinG: 120,
      carbsG: 180,
      fatG: 60,
      waterMl: 2000,
    })

    expect(result).toEqual({ saved: true, written: 2 })
    expect(calls.day).toHaveLength(1)
    // One record, not four: four single-nutrient records read as four meals of
    // unknown type in the store's own screens.
    expect(calls.daily).toHaveLength(0)
    expect(calls.day[0]).toMatchObject({
      date: "2026-10-16",
      energyKcal: 1850,
      waterMl: 2000,
    })
  })

  test("an older shell still gets the day, one metric at a time", async () => {
    plugin.saveDailyMetric = async (options: DailyCall) => {
      calls.daily.push(options)
      return { saved: true }
    }

    const result = await saveHealthNutritionDay({
      date: "2026-10-16",
      energyKcal: 100,
      proteinG: 5,
      waterMl: 500,
    })

    expect(result).toEqual({ saved: true })
    expect(calls.daily.map((call) => call.metric)).toEqual([
      "dietaryEnergyKcal",
      "dietaryProteinG",
      "hydrationMl",
    ])
  })

  test("a refused day keeps the store's reason instead of a bare false", async () => {
    plugin.saveDailyMetric = async (options: DailyCall) => {
      calls.daily.push(options)
      return options.metric === "dietaryProteinG"
        ? { saved: false, reason: "no_permission", message: "not granted" }
        : { saved: true }
    }

    const result = await saveHealthNutritionDay({
      date: "2026-10-16",
      energyKcal: 100,
      proteinG: 5,
    })

    expect(result).toMatchObject({
      saved: false,
      reason: "no_permission",
      message: "not granted",
    })
  })

  test("a refused single metric carries its reason too", async () => {
    plugin.saveDailyMetric = async () => ({
      saved: false,
      reason: "no_permission",
      message: "WRITE permission for weightKg was not granted",
    })

    expect(
      await saveHealthDailyMetric({
        metric: "weightKg",
        date: "2026-10-16",
        value: 80,
      })
    ).toMatchObject({ saved: false, reason: "no_permission" })
  })

  test("a shell with no method at all is unsupported, not silent", async () => {
    expect(
      await saveHealthDailyMetric({
        metric: "weightKg",
        date: "2026-10-16",
        value: 80,
      })
    ).toEqual({ saved: false, reason: "unsupported_metric" })
    expect(
      await saveHealthNutritionDay({ date: "2026-10-16", energyKcal: 100 })
    ).toEqual({ saved: false, reason: "unsupported_metric" })
  })

  test("a refusal that reaches JS as an exception still names a reason", async () => {
    plugin.saveDailyMetric = async () => {
      throw new Error("SecurityException: no permission")
    }

    expect(
      await saveHealthDailyMetric({
        metric: "weightKg",
        date: "2026-10-16",
        value: 80,
      })
    ).toEqual({
      saved: false,
      reason: "unknown",
      message: "SecurityException: no permission",
    })
  })

  test("the day's foods go out as items, named and meal-typed, in one call", async () => {
    plugin.saveNutritionItems = async (options: ItemCall) => {
      calls.items.push(options)
      return { saved: true, written: 3 }
    }

    const result = await saveHealthNutritionItems({
      date: "2026-10-16",
      items: [
        {
          id: "e1",
          name: "Greek yoghurt",
          loggedAt: "2026-10-16T08:12:00.000Z",
          meal: "breakfast",
          calories: 180,
          protein: 17,
          carbs: 9,
          fat: 6,
        },
        {
          id: "e2",
          name: "Apple",
          meal: "snack",
          calories: 80,
          protein: 0,
          carbs: 21,
          fat: 0,
        },
      ],
      waterMl: 750,
    })

    expect(result).toEqual({ saved: true, written: 3 })
    // One call for the day, not one per food: the day is replaced as a unit.
    expect(calls.items).toHaveLength(1)
    expect(calls.items[0]?.items).toHaveLength(2)
    expect(calls.items[0]?.items[0]).toMatchObject({
      id: "e1",
      name: "Greek yoghurt",
      meal: "breakfast",
      loggedAt: "2026-10-16T08:12:00.000Z",
    })
    expect(calls.items[0]?.waterMl).toBe(750)
  })

  test("an older shell gets the day's totals instead of its items", async () => {
    plugin.saveNutritionDay = async (options: DayCall) => {
      calls.day.push(options)
      return { saved: true, written: 1 }
    }

    await saveHealthNutritionItems({
      date: "2026-10-16",
      items: [
        {
          id: "e1",
          name: "Oats",
          meal: "breakfast",
          calories: 300,
          protein: 10,
          carbs: 50,
          fat: 6,
        },
        {
          id: "e2",
          name: "Curry",
          meal: "dinner",
          calories: 700,
          protein: 30,
          carbs: 80,
          fat: 25,
        },
      ],
      waterMl: 500,
    })

    expect(calls.items).toHaveLength(0)
    expect(calls.day[0]).toMatchObject({
      date: "2026-10-16",
      energyKcal: 1000,
      proteinG: 40,
      carbsG: 130,
      fatG: 31,
      waterMl: 500,
    })
  })

  test("with neither method the day still goes out, one metric at a time", async () => {
    plugin.saveDailyMetric = async (options: DailyCall) => {
      calls.daily.push(options)
      return { saved: true }
    }

    await saveHealthNutritionItems({
      date: "2026-10-16",
      items: [
        {
          id: "e1",
          name: "Toast",
          meal: "breakfast",
          calories: 120,
          protein: 4,
          carbs: 20,
          fat: 3,
        },
      ],
    })

    expect(calls.daily.map((call) => call.metric)).toEqual([
      "dietaryEnergyKcal",
      "dietaryProteinG",
      "dietaryCarbsG",
      "dietaryFatG",
    ])
  })

  test("a refused items write keeps the store's reason", async () => {
    plugin.saveNutritionItems = async () => ({
      saved: false,
      reason: "no_permission",
      message: "not granted: NUTRITION",
    })

    expect(
      await saveHealthNutritionItems({
        date: "2026-10-16",
        items: [
          {
            id: "e1",
            name: "Oats",
            meal: "breakfast",
            calories: 300,
            protein: 10,
            carbs: 50,
            fat: 6,
          },
        ],
      })
    ).toMatchObject({
      saved: false,
      reason: "no_permission",
      message: "not granted: NUTRITION",
    })
  })

  test("an items write that throws still names a reason", async () => {
    plugin.saveNutritionItems = async () => {
      throw new Error("SecurityException: no permission")
    }

    expect(
      await saveHealthNutritionItems({ date: "2026-10-16", items: [] })
    ).toMatchObject({ saved: false, reason: "unknown" })
  })

  test("write access is unknown where the shell cannot be asked", async () => {
    expect(await getHealthWriteAccess()).toBe("unknown")
  })

  test("write access passes the store's answer through", async () => {
    plugin.getWriteAccess = async () => ({ status: "missing" })
    expect(await getHealthWriteAccess()).toBe("missing")
  })
})

describe("the write-back no longer fires and forgets", () => {
  const writeback = readFileSync(
    new URL("../nutrition-writeback.ts", import.meta.url),
    "utf8"
  )

  test("sends what was eaten, with its name and meal, not a day's totals", () => {
    expect(writeback).toContain("saveHealthNutritionItems")
    expect(writeback).toContain("toHealthNutritionItems")
    expect(writeback).toContain("reportHealthWriteOutcome")
    // The old shape: fire every metric, drop every result.
    expect(writeback).not.toContain("void saveHealthDailyMetric")
  })

  test("keys the debounce on the items, so an edit or rename re-pushes", () => {
    expect(writeback).toContain("item.name")
    expect(writeback).toContain("item.meal")
    expect(writeback).toContain("signatureFor(")
  })

  test("still asks the hydration rule rather than summing water itself", () => {
    // The dashboard, the card, the widget and the watch all agree on a day's
    // water because they all come through here.
    expect(writeback).toContain("hydrationEnabledFor(preferences)")
  })
})

describe("a day emptied in the diary is emptied in the store", () => {
  const writeback = readFileSync(
    new URL("../nutrition-writeback.ts", import.meta.url),
    "utf8"
  )
  const kotlin = readFileSync(
    new URL(
      "../../../android/app/src/main/java/com/ananthh/onerep/HealthConnectPlugin.kt",
      import.meta.url
    ),
    "utf8"
  )
  const swift = readFileSync(
    new URL("../../../ios/App/App/AppleHealthPlugin.swift", import.meta.url),
    "utf8"
  )

  test("the clear reaches the shell, and an old shell is not blamed for it", async () => {
    plugin.saveNutritionItems = async (options: ItemCall) => {
      calls.items.push(options)
      return { saved: true, written: 0 }
    }

    expect(
      await saveHealthNutritionItems({
        date: "2026-10-16",
        items: [],
        cleared: true,
      })
    ).toEqual({ saved: true, written: 0 })
    expect(calls.items[0]).toMatchObject({
      date: "2026-10-16",
      items: [],
      cleared: true,
    })

    // A shell older than the items write has no delete at all. There is nothing
    // to report: the day is empty here, and the repair washes it later.
    delete plugin.saveNutritionItems
    expect(
      await saveHealthNutritionItems({
        date: "2026-10-16",
        items: [],
        cleared: true,
      })
    ).toEqual({ saved: true, written: 0 })
  })

  test("only a day this session filed is cleared", () => {
    // Otherwise every date the user browses would delete a day it never wrote.
    expect(writeback).toContain("filedDays.has(dateKey)")
    expect(writeback).toContain("cleared: true")
  })

  test("both shells read the clear and delete rather than refuse", () => {
    expect(kotlin).toContain("cleared: Boolean")
    expect(kotlin).toContain("(wantsNutrition || cleared)")
    // An empty clear has nothing to insert, and the SDK refuses an empty batch.
    expect(kotlin).toContain("if (written.isNotEmpty()) hc.insertRecords(written)")
    expect(swift).toContain('call.getBool("cleared")')
    expect(swift).toContain("in: day, nutrition: true, water: true")
  })
})

describe("rewriting a past day asks the store that needs to be asked", () => {
  const repair = readFileSync(
    new URL("../../components/health-writeback-repair.tsx", import.meta.url),
    "utf8"
  )
  const swift = readFileSync(
    new URL("../../../ios/App/App/AppleHealthPlugin.swift", import.meta.url),
    "utf8"
  )
  const kotlin = readFileSync(
    new URL(
      "../../../android/app/src/main/java/com/ananthh/onerep/HealthConnectPlugin.kt",
      import.meta.url
    ),
    "utf8"
  )

  test("only Health Connect is asked to wash the day", () => {
    expect(healthStoreNeedsDailyCleanup()).toBe(true)
    platform = "ios"
    // Apple Health deletes the day's own samples inside the items write, so a
    // separate cleanup would fail every day on a store that already did it.
    expect(healthStoreNeedsDailyCleanup()).toBe(false)
  })

  test("the repair's cleanup goes through that answer", () => {
    expect(repair).toContain("healthStoreNeedsDailyCleanup()")
    expect(repair).toContain("deleteHealthDailyRecords")
  })

  test("Apple Health really does clean its own day inside the write", () => {
    expect(swift).toContain("deleteOwnDay")
    expect(swift).toContain("func saveNutritionItems")
  })

  test("both shells implement the items write the app prefers", () => {
    expect(kotlin).toContain("fun saveNutritionItems")
    expect(swift).toContain("func saveNutritionItems")
  })

  test("a late-night meal stays inside its own day on both shells", () => {
    // A start of exactly the day's end is the next day's midnight, so the
    // store counts that meal tomorrow. Seen on a real week: the diary's
    // 10-11 dinner was written at that day's last instant with a minute of
    // length, and Health Connect moved its 920 kcal to 10-12.
    expect(kotlin).toContain("dayEnd.minusMillis(1)")
    expect(swift).toContain("day.end.addingTimeInterval(-1)")
  })
})

describe("native replacement preserves unrelated and unauthorized data", () => {
  const swift = readFileSync(
    new URL("../../../ios/App/App/AppleHealthPlugin.swift", import.meta.url),
    "utf8"
  )
  const kotlin = readFileSync(
    new URL(
      "../../../android/app/src/main/java/com/ananthh/onerep/HealthConnectPlugin.kt",
      import.meta.url
    ),
    "utf8"
  )

  test("both Android writers remove legacy hydration IDs only when replacing water", () => {
    for (const name of ["writeNutritionDay", "writeNutritionItems"]) {
      const body = kotlin
        .slice(kotlin.indexOf(`private suspend fun ${name}(`))
        .split("\n    private ")[0]!
      const replacement = body.slice(body.indexOf("return runCatching {"))
      expect(replacement).toMatch(
        /if \(wantsWater(?: \|\| cleared)?\) \{[\s\S]*?deleteRecords\(HydrationRecord::class/
      )
      expect(replacement.indexOf("HydrationRecord::class")).toBeLessThan(
        replacement.indexOf("hc.insertRecords")
      )
      expect(replacement).toMatch(
        /if \((?:wantsNutrition(?: \|\| cleared)?|items.isNotEmpty\(\))\) \{[\s\S]*?deleteRecords\(NutritionRecord::class/
      )
    }
  })

  test("iOS refuses missing write permissions before any cleanup", () => {
    const write = swift.slice(
      swift.indexOf("@objc func saveNutritionItems("),
      swift.indexOf("private func dayRange(")
    )
    const permission = write.indexOf("guard requiredTypes.allSatisfy")
    // The delete that belongs to a write. The clear path above deletes without
    // waiting for that guard on purpose: it writes nothing to protect.
    const cleanup = write.indexOf("await deleteOwnDay(", permission)
    expect(permission).toBeGreaterThan(0)
    expect(permission).toBeLessThan(cleanup)
    expect(write.slice(permission, cleanup)).toContain(
      'writeRefusal("no_permission"'
    )
    expect(write.slice(permission, cleanup)).toContain("return")
    expect(write).toContain("nutrition: !items.isEmpty, water: wantsWater")
  })

  test("iOS cleanup skips unshared types and omitted water", () => {
    const cleanup = swift.slice(
      swift.indexOf("private func deleteOwnDay("),
      swift.indexOf("private func saveObjects(")
    )
    expect(cleanup).toContain('if water { identifiers.append("DietaryWater") }')
    expect(cleanup).toContain("var identifiers = nutrition ? [")
    const permission = cleanup.indexOf(
      "guard healthStore.authorizationStatus(for: type) == .sharingAuthorized else { continue }"
    )
    expect(permission).toBeGreaterThan(0)
    expect(permission).toBeLessThan(
      cleanup.indexOf("healthStore.deleteObjects")
    )
  })
})
