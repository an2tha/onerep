import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

/**
 * The two ways a health metric table can outrun its permissions.
 *
 * Both platforms punish this, differently and badly:
 *
 * iOS raises `NSInvalidArgumentException` from `requestAuthorization` when the
 * share set holds a type Apple computes itself. It is an Objective-C exception,
 * so Swift cannot catch it and the app terminates. `WalkingHeartRateAverage`
 * shipped this way and killed the app on first launch of the health screen.
 *
 * Android says nothing at all. Health Connect will not grant a permission the
 * manifest does not declare — it simply leaves it off the permission screen, so
 * the metric is switchable in Settings, bindable as a custom metric, and never
 * arrives. The plugin's tables had outrun the manifest by fifty-two entries.
 *
 * Neither failure is visible in a typecheck, and neither shows up until an
 * actual device is in front of you, which is exactly when the tables are hard
 * to change. So they are checked here instead.
 */

const IOS_PLUGIN = readFileSync(
  new URL("../../../ios/App/App/AppleHealthPlugin.swift", import.meta.url),
  "utf8"
)
const ANDROID_PLUGIN = readFileSync(
  new URL(
    "../../../android/app/src/main/java/com/ananthh/onerep/HealthConnectPlugin.kt",
    import.meta.url
  ),
  "utf8"
)
const ANDROID_MANIFEST = readFileSync(
  new URL("../../../android/app/src/main/AndroidManifest.xml", import.meta.url),
  "utf8"
)

/**
 * HealthKit types Apple derives and refuses to accept samples for.
 *
 * Not exhaustive — Apple publishes no machine-readable list, and the mobility
 * metrics alone run to a dozen. It holds the ones this app maps plus the
 * neighbours most likely to be reached for next, which is the best a deny-list
 * can do. The real protection is that `writable` defaults to false in the
 * plugin; this catches someone overriding it for one of these by hand.
 */
const APPLE_READ_ONLY = [
  "AppleExerciseTime",
  "AppleMoveTime",
  "AppleStandTime",
  "AppleSleepingWristTemperature",
  "AppleWalkingSteadiness",
  "WalkingHeartRateAverage",
  "HeartRateRecoveryOneMinute",
  "WalkingSpeed",
  "WalkingStepLength",
  "WalkingAsymmetryPercentage",
  "WalkingDoubleSupportPercentage",
  "StairAscentSpeed",
  "StairDescentSpeed",
  "SixMinuteWalkTestDistance",
  "EnvironmentalAudioExposure",
  "HeadphoneAudioExposure",
]

/**
 * Health Connect record class → permission suffix, where the two disagree.
 *
 * Most are the record name in SCREAMING_SNAKE, but enough are not that guessing
 * mechanically would produce permissions that look right and grant nothing.
 */
const ANDROID_PERMISSION_NAMES: Record<string, string> = {
  ExerciseSession: "EXERCISE",
  SleepSession: "SLEEP",
  HeartRateVariabilityRmssd: "HEART_RATE_VARIABILITY",
  MenstruationFlow: "MENSTRUATION",
  MenstruationPeriod: "MENSTRUATION",
  Vo2Max: "VO2_MAX",
  Nutrition: "NUTRITION",
}

function screamingSnake(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()
}

function androidPermission(kind: "READ" | "WRITE", record: string) {
  const suffix = ANDROID_PERMISSION_NAMES[record] ?? screamingSnake(record)
  return `android.permission.health.${kind}_${suffix}`
}

describe("native health permissions", () => {
  test("no Apple-derived type is marked writable", () => {
    // Rows carrying `writable: true`, which is the opt-in the plugin requires
    // before a type ever reaches the `toShare:` set.
    const writable = [
      ...IOS_PLUGIN.matchAll(
        /DailyQuantity\(key: "[^"]+", identifier: "([^"]+)"[^\n]*writable: true/g
      ),
    ].map((match) => match[1])

    assert.ok(writable.length > 0, "expected some writable quantity types")
    for (const identifier of writable) {
      assert.ok(
        !APPLE_READ_ONLY.includes(identifier),
        `${identifier} is computed by Apple and cannot be shared. Marking it writable makes requestAuthorization throw NSInvalidArgumentException, which terminates the app.`
      )
    }
  })

  test("the writable flag still defaults to false", () => {
    // The deny-list above only catches types someone thought about. The default
    // is what protects the ones nobody did.
    assert.match(
      IOS_PLUGIN,
      /var writable: Bool = false/,
      "DailyQuantity.writable must default to false, so a new row cannot reach the share set by accident"
    )
  })

  test("every Health Connect permission the plugin uses is declared", () => {
    const used = new Set<string>()
    for (const [, kind, record] of ANDROID_PLUGIN.matchAll(
      /get(Read|Write)Permission\((\w+)Record::class\)/g
    )) {
      used.add(
        androidPermission(kind.toUpperCase() as "READ" | "WRITE", record)
      )
    }

    assert.ok(used.size > 0, "expected the plugin to request permissions")
    const missing = [...used].filter(
      (permission) => !ANDROID_MANIFEST.includes(permission)
    )
    assert.deepEqual(
      missing,
      [],
      `AndroidManifest.xml is missing these. Health Connect does not error on an undeclared permission — it omits it from the permission screen and the metric silently never arrives.`
    )
  })
})
