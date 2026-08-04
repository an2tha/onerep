import { describe, expect, test } from "bun:test"
import { buildManifest, OtaPackagingError } from "../build-ota-release.mjs"

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
      minNativeVersion: "1.0.0",
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
