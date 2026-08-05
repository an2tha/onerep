import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  buildManifest,
  OtaPackagingError,
  stageBundle,
} from "../build-ota-release.mjs"

const CHECKSUM = "a".repeat(64)

const base = {
  version: "1.0.482",
  commit: "abc1234",
  checksum: CHECKSUM,
  baseUrl: "https://app.onerep.life",
  releasedAt: "2026-08-04T12:00:00Z",
}

describe("buildManifest", () => {
  test("produces a schema-1 manifest devices can parse", () => {
    expect(buildManifest(base)).toEqual({
      schema: 1,
      version: "1.0.482",
      url: "https://app.onerep.life/ota/bundles/1.0.482.zip",
      checksum: CHECKSUM,
      // Raised to 1.1.0 with the native parity release: the bundle now calls
      // HealthConnect / WorkoutStatus / HomeWidgets, which a 1.0.0 shell has no
      // implementation for.
      minNativeVersion: "1.1.0",
      commit: "abc1234",
      releasedAt: "2026-08-04T12:00:00Z",
      mandatory: false,
    })
  })

  test("derives the bundle URL from the base URL's origin", () => {
    expect(
      buildManifest({ ...base, baseUrl: "https://app.onerep.life/some/path" })
        .url
    ).toBe("https://app.onerep.life/ota/bundles/1.0.482.zip")
  })

  test("rejects a non-semver version", () => {
    // The guard against a turbo cache replay shipping a stale stamp.
    expect(() => buildManifest({ ...base, version: "1.0" })).toThrow(
      OtaPackagingError
    )
    expect(() => buildManifest({ ...base, version: undefined })).toThrow(
      OtaPackagingError
    )
  })

  test("rejects a non-semver native floor", () => {
    expect(() =>
      buildManifest({ ...base, minNativeVersion: "latest" })
    ).toThrow(OtaPackagingError)
  })

  test("rejects a checksum that is not sha256 hex", () => {
    expect(() => buildManifest({ ...base, checksum: "abc123" })).toThrow(
      OtaPackagingError
    )
    expect(() =>
      buildManifest({ ...base, checksum: "A".repeat(64) })
    ).toThrow(OtaPackagingError)
  })

  test("defaults the commit when the build was not stamped with one", () => {
    expect(buildManifest({ ...base, commit: undefined }).commit).toBe("unknown")
  })
})

describe("stageBundle", () => {
  /** A dist directory shaped like a real build, in a throwaway location. */
  function fakeDist() {
    const dir = mkdtempSync(path.join(tmpdir(), "onerep-dist-"))
    writeFileSync(path.join(dir, "index.html"), "<html></html>")
    mkdirSync(path.join(dir, "assets"))
    writeFileSync(path.join(dir, "assets/index.js"), "console.log(1)")
    mkdirSync(path.join(dir, "models"))
    writeFileSync(path.join(dir, "models/motionbert_lite_int8.onnx"), "weights")
    mkdirSync(path.join(dir, "ota"))
    writeFileSync(path.join(dir, "ota/manifest.json"), "{}")
    return dir
  }

  test("leaves the pose models out of the zip", () => {
    // They are ~19 MB and change only when the models are re-exported, so
    // including them would multiply the size of every routine web update.
    const { stageDir } = stageBundle(fakeDist())

    expect(existsSync(path.join(stageDir, "models"))).toBe(false)
    expect(existsSync(path.join(stageDir, "assets/index.js"))).toBe(true)
  })

  test("leaves a previous run's artifacts out of the zip", () => {
    const { stageDir } = stageBundle(fakeDist())

    expect(existsSync(path.join(stageDir, "ota"))).toBe(false)
  })

  test("refuses a bundle the plugin would reject", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "onerep-dist-"))

    expect(() => stageBundle(dir)).toThrow(OtaPackagingError)
  })
})
