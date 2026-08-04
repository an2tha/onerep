import { describe, expect, test } from "bun:test"
import {
  compareVersions,
  decideOtaUpdate,
  parseOtaManifest,
  type OtaManifest,
} from "../ota-manifest"

const ORIGIN = "https://app.onerep.life"

const validManifest = {
  schema: 1,
  version: "1.0.482",
  url: "https://app.onerep.life/ota/bundles/1.0.482.zip",
  checksum: "a".repeat(64),
  minNativeVersion: "1.0.0",
  commit: "abc1234",
  releasedAt: "2026-08-04T12:00:00Z",
}

function parsed(overrides: Record<string, unknown> = {}) {
  const manifest = parseOtaManifest(
    { ...validManifest, ...overrides },
    "ios",
    ORIGIN
  )
  if (!manifest) throw new Error("expected manifest to parse")
  return manifest
}

describe("compareVersions", () => {
  test("compares numerically, not lexically", () => {
    // The case that breaks a string compare, and only after ten releases.
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1)
    expect(compareVersions("1.0.9", "1.0.10")).toBe(-1)
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1)
  })

  test("treats equal versions as equal", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0)
  })

  test("sorts a prerelease below the release it precedes", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1)
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1)
    expect(compareVersions("1.0.0-rc.2", "1.0.0-rc.1")).toBe(1)
  })

  test("ignores build metadata", () => {
    expect(compareVersions("1.0.0+abc", "1.0.0+def")).toBe(0)
  })

  test("treats unparseable segments as zero rather than throwing", () => {
    expect(compareVersions("1.x.0", "1.0.0")).toBe(0)
  })
})

describe("parseOtaManifest", () => {
  test("accepts a well-formed manifest", () => {
    expect(parsed()).toMatchObject({
      schema: 1,
      version: "1.0.482",
      minNativeVersion: "1.0.0",
      mandatory: false,
    })
  })

  test("rejects an unknown schema version", () => {
    expect(
      parseOtaManifest({ ...validManifest, schema: 2 }, "ios", ORIGIN)
    ).toBeNull()
  })

  test("rejects a non-sha256 checksum", () => {
    expect(
      parseOtaManifest({ ...validManifest, checksum: "abc123" }, "ios", ORIGIN)
    ).toBeNull()
    expect(
      parseOtaManifest(
        { ...validManifest, checksum: "A".repeat(64) },
        "ios",
        ORIGIN
      )
    ).toBeNull()
  })

  test("rejects a plaintext URL", () => {
    expect(
      parseOtaManifest(
        { ...validManifest, url: "http://app.onerep.life/ota/bundles/x.zip" },
        "ios",
        ORIGIN
      )
    ).toBeNull()
  })

  test("rejects a bundle URL on a foreign origin", () => {
    // A tampered manifest must not be able to repoint the download.
    expect(
      parseOtaManifest(
        { ...validManifest, url: "https://evil.example/bundle.zip" },
        "ios",
        ORIGIN
      )
    ).toBeNull()
  })

  test("rejects non-semver versions", () => {
    expect(
      parseOtaManifest({ ...validManifest, version: "1.0" }, "ios", ORIGIN)
    ).toBeNull()
    expect(
      parseOtaManifest(
        { ...validManifest, minNativeVersion: "latest" },
        "ios",
        ORIGIN
      )
    ).toBeNull()
  })

  test("rejects non-object input", () => {
    expect(parseOtaManifest(null, "ios", ORIGIN)).toBeNull()
    expect(parseOtaManifest("nope", "ios", ORIGIN)).toBeNull()
    expect(parseOtaManifest([], "ios", ORIGIN)).toBeNull()
  })

  test("merges the platform override and leaves the other platform alone", () => {
    const raw = {
      ...validManifest,
      platforms: {
        ios: { version: "1.0.500", minNativeVersion: "1.2.0" },
      },
    }

    expect(parseOtaManifest(raw, "ios", ORIGIN)).toMatchObject({
      version: "1.0.500",
      minNativeVersion: "1.2.0",
    })
    expect(parseOtaManifest(raw, "android", ORIGIN)).toMatchObject({
      version: "1.0.482",
      minNativeVersion: "1.0.0",
    })
  })
})

describe("decideOtaUpdate", () => {
  const base = {
    manifest: parsed() as OtaManifest,
    currentVersion: "1.0.400",
    nativeVersion: "1.0.0",
  }

  test("downloads a newer bundle the shell can run", () => {
    expect(decideOtaUpdate(base)).toEqual({
      action: "download",
      version: "1.0.482",
      url: validManifest.url,
      checksum: validManifest.checksum,
      mandatory: false,
    })
  })

  test("skips when already on that version", () => {
    expect(decideOtaUpdate({ ...base, currentVersion: "1.0.482" })).toEqual({
      action: "skip",
      reason: "up-to-date",
    })
  })

  test("never downgrades", () => {
    expect(decideOtaUpdate({ ...base, currentVersion: "1.0.500" })).toEqual({
      action: "skip",
      reason: "older",
    })
  })

  test("withholds a bundle from a native shell that is too old", () => {
    // The gate: this bundle needs plugins only present in shell 1.2.0.
    expect(
      decideOtaUpdate({
        ...base,
        manifest: parsed({ minNativeVersion: "1.2.0" }),
        nativeVersion: "1.1.0",
      })
    ).toEqual({ action: "skip", reason: "native-too-old" })
  })

  test("treats the native floor as inclusive", () => {
    expect(
      decideOtaUpdate({
        ...base,
        manifest: parsed({ minNativeVersion: "1.2.0" }),
        nativeVersion: "1.2.0",
      })
    ).toMatchObject({ action: "download" })
  })

  test("honours an upper native bound", () => {
    expect(
      decideOtaUpdate({
        ...base,
        manifest: parsed({ maxNativeVersion: "1.1.0" }),
        nativeVersion: "1.2.0",
      })
    ).toEqual({ action: "skip", reason: "native-too-new" })
  })

  test("does not re-download a version already staged", () => {
    expect(decideOtaUpdate({ ...base, stagedVersion: "1.0.482" })).toEqual({
      action: "skip",
      reason: "already-staged",
    })
  })

  test("skips a version that previously failed to boot", () => {
    expect(decideOtaUpdate({ ...base, blockedVersions: ["1.0.482"] })).toEqual({
      action: "skip",
      reason: "blocked",
    })
  })

  test("skips when there is no usable manifest", () => {
    expect(decideOtaUpdate({ ...base, manifest: null })).toEqual({
      action: "skip",
      reason: "invalid-manifest",
    })
  })

  test("skips when the local versions are not semver", () => {
    expect(decideOtaUpdate({ ...base, nativeVersion: "1.0" })).toEqual({
      action: "skip",
      reason: "invalid-manifest",
    })
  })

  test("propagates the mandatory flag", () => {
    expect(
      decideOtaUpdate({ ...base, manifest: parsed({ mandatory: true }) })
    ).toMatchObject({ action: "download", mandatory: true })
  })
})
