import { describe, expect, test } from "bun:test"
import { createVerify, generateKeyPairSync } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  buildManifest,
  OtaPackagingError,
  signManifest,
  stageBundle,
} from "../build-ota-release.mjs"

const CHECKSUM = "a".repeat(64)

const base = {
  version: "1.0.482",
  sourceCommit: "abc1234",
  baseCommit: "base1234",
  releaseKind: "bugfix",
  changeTicket: "INC-42",
  rolloutPercent: 10,
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
      releaseKind: "bugfix",
      baseCommit: "base1234",
      sourceCommit: "abc1234",
      changeTicket: "INC-42",
      rolloutPercent: 10,
      nativeApiLevel: 1,
      reviewedFeatureSet: "onerep-2026.09",
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
    expect(() => buildManifest({ ...base, checksum: "A".repeat(64) })).toThrow(
      OtaPackagingError
    )
  })

  test("requires auditable provenance and approval", () => {
    expect(() => buildManifest({ ...base, sourceCommit: undefined })).toThrow(
      OtaPackagingError
    )
    expect(() => buildManifest({ ...base, changeTicket: "" })).toThrow(
      OtaPackagingError
    )
  })
})

describe("signManifest", () => {
  test("signs the exact payload bytes in the published envelope", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    })
    const manifest = buildManifest(base)
    const envelope = signManifest(
      manifest,
      privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    )
    const payload = Buffer.from(envelope.payload, "base64")
    const valid = createVerify("RSA-SHA256")
      .update(payload)
      .end()
      .verify(publicKey, envelope.signature, "base64")

    expect(valid).toBe(true)
    expect(JSON.parse(payload.toString("utf8"))).toEqual(manifest)
    expect(envelope).toMatchObject({
      schema: 1,
      algorithm: "RS256",
      keyId: "onerep-ota-2026-01",
    })
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
