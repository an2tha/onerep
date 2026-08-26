/**
 * Source contract for the iOS privacy manifests.
 *
 * App Review rejects a build whose manifest is missing, and — worse, because
 * it is quiet — accepts one that has drifted from what the app actually does.
 * These tests hold the two things a human will forget: that every bundle we
 * ship carries a manifest, and that no Swift file starts calling a
 * required-reason API without the manifest beside it learning about it.
 */

import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const IOS = join(import.meta.dir, "ios/App")

/** Each shipped bundle, and the folder its manifest must live in. */
const BUNDLES = [
  { name: "app", dir: "App" },
  { name: "widget extension", dir: "OneRep" },
  { name: "watch app", dir: "OneRepWatch" },
]

const manifest = (dir: string) =>
  readFileSync(join(IOS, dir, "PrivacyInfo.xcprivacy"), "utf8")

/**
 * Every value the plist gives for a key, flattened.
 *
 * A hand-rolled reader rather than a plist parser: this file must run under
 * Bun on Linux in CI, where PlistBuddy and plutil are not, and the shapes here
 * are two lines of regex wide.
 */
function stringsUnder(plist: string, key: string) {
  return plist
    .split(`<key>${key}</key>`)
    .slice(1)
    .flatMap((after) => {
      const block = after.slice(0, after.indexOf("</array>") + 1)
      return [...block.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1])
    })
}

describe("every bundle carries a manifest", () => {
  for (const bundle of BUNDLES) {
    test(`the ${bundle.name} has one, and it is a plist`, () => {
      const plist = manifest(bundle.dir)
      expect(plist).toStartWith('<?xml version="1.0" encoding="UTF-8"?>')
      expect(plist).toContain("<key>NSPrivacyTracking</key>")
      expect(plist).toContain("<key>NSPrivacyCollectedDataTypes</key>")
    })

    test(`the ${bundle.name} claims no tracking and no tracking domains`, () => {
      // Declaring a tracking domain here is what makes iOS block it under
      // "Ask App Not to Track". Nothing in this app advertises; if that ever
      // changes, this test is the right place to find out.
      const plist = manifest(bundle.dir)
      expect(plist).toContain("<key>NSPrivacyTracking</key>\n\t<false/>")
      expect(plist).toContain("<key>NSPrivacyTrackingDomains</key>\n\t<array/>")
    })
  }
})

describe("the app manifest describes the app", () => {
  const plist = manifest("App")

  test("declares the data the app is built to sync", () => {
    const declared = stringsUnder(plist, "NSPrivacyCollectedDataType")
    for (const type of [
      "NSPrivacyCollectedDataTypeHealthFitness",
      "NSPrivacyCollectedDataTypeEmailAddress",
      "NSPrivacyCollectedDataTypePhotosorVideos",
      "NSPrivacyCollectedDataTypeOtherUserContent",
      "NSPrivacyCollectedDataTypePurchaseHistory",
      "NSPrivacyCollectedDataTypeProductInteraction",
    ]) {
      expect(declared).toContain(type)
    }
  })

  test("gives every collected type a purpose", () => {
    // A type declared without a purpose is a form App Store Connect will
    // refuse, and the refusal names neither the type nor the file.
    const entries = plist
      .split("<key>NSPrivacyCollectedDataType</key>")
      .slice(1)
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      const dict = entry.slice(0, entry.indexOf("</dict>"))
      expect(dict).toContain("NSPrivacyCollectedDataTypePurpose")
      expect(dict).toContain("<key>NSPrivacyCollectedDataTypeLinked</key>")
      expect(dict).toContain("<key>NSPrivacyCollectedDataTypeTracking</key>")
    }
  })

  test("is in the app target's resources, not merely on disk", () => {
    // A manifest Xcode never copies is a manifest that does not exist. It
    // fails at upload, weeks after somebody added the file and moved on.
    const pbxproj = readFileSync(
      join(IOS, "App.xcodeproj/project.pbxproj"),
      "utf8"
    )
    expect(pbxproj).toContain("PrivacyInfo.xcprivacy in Resources")
  })
})

describe("required-reason APIs", () => {
  function swiftIn(dir: string) {
    return readdirSync(join(IOS, dir))
      .filter((file) => file.endsWith(".swift"))
      .map((file) => readFileSync(join(IOS, dir, file), "utf8"))
      .join("\n")
  }

  for (const bundle of BUNDLES) {
    test(`the ${bundle.name} declares UserDefaults if it touches it`, () => {
      if (!swiftIn(bundle.dir).includes("UserDefaults")) return
      const reasons = stringsUnder(
        manifest(bundle.dir),
        "NSPrivacyAccessedAPITypeReasons"
      )
      // CA92.1 is the app's own defaults; 1C8F.1 is the shared app group.
      expect(reasons.some((r) => r === "CA92.1" || r === "1C8F.1")).toBe(true)
      expect(manifest(bundle.dir)).toContain(
        "NSPrivacyAccessedAPICategoryUserDefaults"
      )
    })
  }

  test("nobody has quietly started reading file timestamps or free disk space", () => {
    // These have required reasons too, and no manifest here declares one.
    const swift = BUNDLES.map((bundle) => swiftIn(bundle.dir)).join("\n")
    for (const api of [
      "systemUptime",
      "volumeAvailableCapacity",
      "attributesOfItem",
      "creationDateKey",
      "contentModificationDateKey",
    ]) {
      expect(swift).not.toContain(api)
    }
  })
})
