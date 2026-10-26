import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

/**
 * The inbound nutrition path, checked where a typecheck cannot see it.
 *
 * Three of its rules live in three different languages: the native reader is
 * what stops the app importing its own meals, the sync component is what stops
 * an unreadable store from deleting history, and the server mutation is what
 * stops a nonsense figure from being displayed as food. None of the three is
 * enforced by TypeScript, and each failure is silent — a doubled day, a wiped
 * history, a 40,000 kcal lunch. So they are asserted here, the way this repo
 * already checks its health permissions.
 */

const KOTLIN_PLUGIN = readFileSync(
  new URL(
    "../../../android/app/src/main/java/com/ananthh/onerep/HealthConnectPlugin.kt",
    import.meta.url
  ),
  "utf8"
)
const SWIFT_PLUGIN = readFileSync(
  new URL("../../../ios/App/App/AppleHealthPlugin.swift", import.meta.url),
  "utf8"
)
const HEALTH_PROVIDER = readFileSync(
  new URL("../health-provider.ts", import.meta.url),
  "utf8"
)
const HEALTH_SYNC = readFileSync(
  new URL("../../components/health-sync.tsx", import.meta.url),
  "utf8"
)
const SERVER_MODULE = readFileSync(
  new URL("../../../../../convex/logs/externalIntake.ts", import.meta.url),
  "utf8"
)
const NUTRITION_PAGE = readFileSync(
  new URL("../../pages/Nutrition.tsx", import.meta.url),
  "utf8"
)

describe("reading nutrition from the health store", () => {
  test("Android reads nutrition and water, and names the app that wrote them", () => {
    expect(KOTLIN_PLUGIN).toContain("fun getExternalNutrition(call: PluginCall)")
    expect(KOTLIN_PLUGIN).toContain("NutritionRecord::class")
    expect(KOTLIN_PLUGIN).toContain("HydrationRecord::class")
    expect(KOTLIN_PLUGIN).toContain('"nutrients"')
    expect(KOTLIN_PLUGIN).toContain('"sources"')
    expect(KOTLIN_PLUGIN).toContain('add(appLabel(packageName))')
  })

  test("Android drops the records this app wrote, by data origin", () => {
    // The whole loop protection. Our own day is written out as NutritionRecords,
    // so without this filter the app's lunch is imported back as somebody
    // else's and every total doubles.
    expect(KOTLIN_PLUGIN).toContain("val ownPackage = context.packageName")
    expect(KOTLIN_PLUGIN).toContain(
      "record.metadata.dataOrigin.packageName == ownPackage"
    )
  })

  test("iOS drops its own samples by bundle identifier", () => {
    expect(SWIFT_PLUGIN).toContain('CAPPluginMethod(name: "getExternalNutrition"')
    expect(SWIFT_PLUGIN).toContain(
      "if let ownBundle, origin == ownBundle { continue }"
    )
    // HealthKit has no trans-fat type; a row for it would be a number nobody
    // measured.
    expect(SWIFT_PLUGIN).not.toContain("dietaryTransFatG")
  })

  test("the JS side treats the method as optional, for older shells", () => {
    expect(HEALTH_PROVIDER).toContain("getExternalNutrition?(")
    expect(HEALTH_PROVIDER).toContain("if (!active?.getExternalNutrition)")
  })

  test("an unreadable store is not the same as an empty one", () => {
    // `complete` is what lets the server prune. A shell that cannot read the
    // store answers with no days too, and mistaking the two would delete
    // everything imported so far the first time the app ran on an old build.
    expect(HEALTH_PROVIDER).toContain("complete: false")
    expect(HEALTH_PROVIDER).toContain("complete: true")
    expect(HEALTH_SYNC).toContain("if (external.days.length === 0 && !external.complete) return")
    expect(HEALTH_SYNC).toContain("...(external.complete")
    expect(HEALTH_SYNC).toContain("windowStart:")
  })

  test("the sync pulls it every foreground pass, not only when workouts exist", () => {
    expect(HEALTH_SYNC).toContain("getExternalNutrition({")
    // Both the early return and the full path file it, or a day with no new
    // workout would keep showing yesterday's imported figures.
    expect(HEALTH_SYNC.match(/await syncIntake\(\)/g)?.length).toBe(2)
  })
})

describe("storing what other apps logged", () => {
  test("figures are checked against the catalogue's own bounds", () => {
    expect(SERVER_MODULE).toContain("sanePlatformReading(key, value)")
  })

  test("a day of zeroes is not stored", () => {
    expect(SERVER_MODULE).toContain(
      "if (!Object.values(nutrients).some((value) => value > 0)) continue"
    )
  })

  test("history is pruned only inside a window the phone actually read", () => {
    expect(SERVER_MODULE).toContain("if (args.windowStart && isDateKey(args.windowStart))")
    expect(SERVER_MODULE).toContain("windowStart: v.optional(v.string())")
  })

  test("one row per user and day, so a re-read replaces rather than stacks", () => {
    expect(SERVER_MODULE).toContain('"by_userId_and_date"')
    expect(SERVER_MODULE).toContain("ctx.db.patch(existing._id")
  })
})

describe("showing it", () => {
  test("the card is on the Nutrition tab", () => {
    expect(NUTRITION_PAGE).toContain("<ExternalIntakeCard")
    expect(NUTRITION_PAGE).toContain("date={dateKey}")
  })
})
