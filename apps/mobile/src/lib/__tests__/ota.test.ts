import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

let isNative = true
let trustAvailable = true

const downloadMock = mock(async (options: { version: string }) => ({
  id: `bundle-${options.version}`,
  version: options.version,
  downloaded: "2026-08-04T12:00:00Z",
  checksum: "a".repeat(64),
  status: "success" as const,
}))
const nextMock = mock(async (_options: { id: string }) => ({
  id: _options.id,
  version: "1.0.482",
  downloaded: "",
  checksum: "",
  status: "pending" as const,
}))
const setMock = mock(async (_options: { id: string }) => undefined)
const notifyAppReadyMock = mock(async () => ({ bundle: {} }))
const currentMock = mock(async () => ({
  bundle: {
    id: "builtin",
    version: "builtin",
    downloaded: "",
    checksum: "",
    status: "success" as const,
  },
  native: "1.0.0",
}))
const getNextBundleMock = mock(async () => null)
const getFailedUpdateMock = mock(async () => null)
const addListenerMock = mock(async () => ({ remove: async () => {} }))
const verifyManifestMock = mock(async () => ({ valid: true }))

mock.module("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "ios",
    isNativePlatform: () => isNative,
    isPluginAvailable: (name: string) => trustAvailable && name === "OtaTrust",
  },
  registerPlugin: (name: string) =>
    name === "OtaTrust" ? { verifyManifest: verifyManifestMock } : {},
  WebPlugin: class {},
}))

mock.module("../ota-config", () => ({ OTA_ENABLED: true }))

mock.module("@capgo/capacitor-updater", () => ({
  CapacitorUpdater: {
    download: downloadMock,
    next: nextMock,
    set: setMock,
    notifyAppReady: notifyAppReadyMock,
    current: currentMock,
    getNextBundle: getNextBundleMock,
    getFailedUpdate: getFailedUpdateMock,
    addListener: addListenerMock,
  },
}))

const {
  applyOtaUpdateNow,
  checkForOtaUpdate,
  getOtaState,
  initializeOta,
  isOtaSupported,
  notifyOtaAppReady,
  otaBuildVersion,
  otaDiagnostics,
  resetOtaStateForTests,
} = await import("../ota")

const MANIFEST = {
  schema: 1,
  version: "1.0.482",
  url: "https://app.onerep.life/ota/bundles/1.0.482.zip",
  checksum: "a".repeat(64),
  minNativeVersion: "1.0.0",
  releaseKind: "bugfix",
  baseCommit: "base123",
  sourceCommit: "head456",
  changeTicket: "INC-42",
  rolloutPercent: 100,
  nativeApiLevel: 1,
  reviewedFeatureSet: "onerep-2026.09",
  releasedAt: "2026-09-10T12:00:00Z",
}

const originalFetch = globalThis.fetch

/** The module persists check timestamps and blocked versions in localStorage. */
function installStorage() {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  }
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  })
  return storage
}

const storage = installStorage()

function stubFetch(impl: () => Promise<unknown>) {
  globalThis.fetch = mock(async () => {
    const body = await impl()
    const payload = btoa(JSON.stringify(body))
    return {
      ok: true,
      status: 200,
      json: async () => ({
        schema: 1,
        algorithm: "RS256",
        keyId: "onerep-ota-2026-01",
        payload,
        signature: "AA==",
      }),
    } as unknown as Response
  }) as unknown as typeof fetch
}

const capgoMocks = [
  downloadMock,
  nextMock,
  setMock,
  notifyAppReadyMock,
  currentMock,
  getNextBundleMock,
  getFailedUpdateMock,
  addListenerMock,
  verifyManifestMock,
]

beforeEach(() => {
  isNative = true
  trustAvailable = true
  for (const fn of capgoMocks) fn.mockClear()
  verifyManifestMock.mockImplementation(async () => ({ valid: true }))
  storage.clear()
  resetOtaStateForTests()
})

function readPendingMarker(): { id: string; version: string } | null {
  const raw = storage.getItem("onerep:ota:pending-bundle")
  return raw ? (JSON.parse(raw) as { id: string; version: string }) : null
}

function stubEnvelope(raw: unknown) {
  globalThis.fetch = mock(async () => ({
    ok: true,
    status: 200,
    json: async () => raw,
  })) as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("platform guard", () => {
  test("does nothing at all on web", async () => {
    isNative = false
    stubFetch(async () => MANIFEST)

    expect(isOtaSupported()).toBe(false)
    await notifyOtaAppReady()
    const decision = await checkForOtaUpdate({ force: true })
    await applyOtaUpdateNow()

    expect(decision).toEqual({ action: "skip", reason: "up-to-date" })
    // The PWA keeps its service-worker update path; the plugin must stay
    // entirely untouched, not merely unused.
    for (const fn of capgoMocks) expect(fn).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

describe("checkForOtaUpdate", () => {
  test("downloads a newer bundle and persists it for the next cold launch", async () => {
    stubFetch(async () => MANIFEST)

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toMatchObject({ action: "download", version: "1.0.482" })
    expect(downloadMock).toHaveBeenCalledWith({
      url: MANIFEST.url,
      version: "1.0.482",
      checksum: MANIFEST.checksum,
    })
    // Cold-launch-only: never stage via next() (Capgo would apply it on
    // background), never apply in this same session. The marker is consumed
    // by initializeOta on the next launch.
    expect(nextMock).not.toHaveBeenCalled()
    expect(setMock).not.toHaveBeenCalled()
    expect(readPendingMarker()).toEqual({
      id: "bundle-1.0.482",
      version: "1.0.482",
    })
    expect(getOtaState()).toMatchObject({ phase: "ready", version: "1.0.482" })
    const diagnostics = await otaDiagnostics()
    expect(diagnostics.staged).toBe("1.0.482")
  })

  test("keeps the installed bundle when the network fails", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "invalid-manifest" })
    expect(downloadMock).not.toHaveBeenCalled()
    expect(getOtaState()).toEqual({ phase: "idle" })
  })

  test("ignores a manifest pointing off-origin", async () => {
    stubFetch(async () => ({ ...MANIFEST, url: "https://evil.example/b.zip" }))

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "invalid-manifest" })
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test("rejects a manifest the native shell cannot authenticate", async () => {
    stubFetch(async () => MANIFEST)
    verifyManifestMock.mockImplementationOnce(async () => ({ valid: false }))

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "invalid-manifest" })
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test("does not stage a bundle whose download failed", async () => {
    stubFetch(async () => MANIFEST)
    downloadMock.mockImplementationOnce(async () => {
      throw new Error("checksum mismatch")
    })

    await checkForOtaUpdate({ force: true })

    expect(nextMock).not.toHaveBeenCalled()
    expect(setMock).not.toHaveBeenCalled()
    expect(readPendingMarker()).toBeNull()
    expect(getOtaState()).toMatchObject({ phase: "error" })
  })

  test("skips when the shell is older than the bundle requires", async () => {
    stubFetch(async () => ({ ...MANIFEST, minNativeVersion: "9.0.0" }))

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "native-too-old" })
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test("rate limits unforced checks", async () => {
    stubFetch(async () => MANIFEST)
    await checkForOtaUpdate({ force: true })
    resetOtaStateForTests()
    ;(globalThis.fetch as unknown as { mockClear: () => void }).mockClear()

    await checkForOtaUpdate()

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  test("rejects an envelope with an unknown key id", async () => {
    const payload = btoa(JSON.stringify(MANIFEST))
    stubEnvelope({
      schema: 1,
      algorithm: "RS256",
      keyId: "attacker-key",
      payload,
      signature: "AA==",
    })

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "invalid-manifest" })
    expect(verifyManifestMock).not.toHaveBeenCalled()
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test("rejects an envelope with an unknown algorithm", async () => {
    const payload = btoa(JSON.stringify(MANIFEST))
    stubEnvelope({
      schema: 1,
      algorithm: "none",
      keyId: "onerep-ota-2026-01",
      payload,
      signature: "AA==",
    })

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "invalid-manifest" })
    expect(verifyManifestMock).not.toHaveBeenCalled()
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test("rejects a tampered payload the native shell will not sign for", async () => {
    stubFetch(async () => ({
      ...MANIFEST,
      url: "https://app.onerep.life/ota/bundles/1.0.482.zip",
    }))
    verifyManifestMock.mockImplementationOnce(async () => ({ valid: false }))

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "invalid-manifest" })
    expect(downloadMock).not.toHaveBeenCalled()
    expect(readPendingMarker()).toBeNull()
  })

  test("rejects an envelope whose payload is not JSON", async () => {
    stubEnvelope({
      schema: 1,
      algorithm: "RS256",
      keyId: "onerep-ota-2026-01",
      payload: btoa("not-json{{{"),
      signature: "AA==",
    })

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "invalid-manifest" })
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test("holds devices outside a staged rollout", async () => {
    storage.setItem("onerep:ota:rollout-bucket", "50")
    stubFetch(async () => ({ ...MANIFEST, rolloutPercent: 10 }))

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "rollout" })
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test("includes devices inside a staged rollout", async () => {
    storage.setItem("onerep:ota:rollout-bucket", "9")
    stubFetch(async () => ({ ...MANIFEST, rolloutPercent: 10 }))

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toMatchObject({ action: "download", version: "1.0.482" })
    expect(downloadMock).toHaveBeenCalled()
  })

  test("never forces an immediate reload on iOS", async () => {
    stubFetch(async () => ({ ...MANIFEST, mandatory: true }))

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toMatchObject({ action: "download", mandatory: false })
    expect(getOtaState()).toMatchObject({ phase: "ready", mandatory: false })
  })

  test("skips entirely on shells without OtaTrust", async () => {
    trustAvailable = false
    stubFetch(async () => MANIFEST)

    expect(isOtaSupported()).toBe(false)
    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "up-to-date" })
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(downloadMock).not.toHaveBeenCalled()
  })

  test("does not re-download a version already persisted for next launch", async () => {
    stubFetch(async () => MANIFEST)
    await checkForOtaUpdate({ force: true })
    expect(readPendingMarker()?.version).toBe("1.0.482")

    resetOtaStateForTests()
    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "already-staged" })
    expect(downloadMock).toHaveBeenCalledTimes(1)
  })
})

describe("cold-launch activation", () => {
  test("initializeOta applies a bundle staged by a prior session", async () => {
    storage.setItem(
      "onerep:ota:pending-bundle",
      JSON.stringify({ id: "bundle-1.0.482", version: "1.0.482" })
    )

    const dispose = await initializeOta()

    expect(setMock).toHaveBeenCalledWith({ id: "bundle-1.0.482" })
    expect(storage.getItem("onerep:ota:pending-bundle")).toBeNull()
    dispose()
  })

  test("a freshly downloaded bundle is not applied in the same session", async () => {
    stubFetch(async () => MANIFEST)
    await checkForOtaUpdate({ force: true })
    expect(readPendingMarker()?.version).toBe("1.0.482")

    const dispose = await initializeOta()

    // The just-downloaded bundle waits for the toast or the next launch.
    expect(setMock).not.toHaveBeenCalled()
    expect(readPendingMarker()?.version).toBe("1.0.482")
    dispose()
  })

  test("initializeOta with no pending bundle touches nothing", async () => {
    const dispose = await initializeOta()

    expect(setMock).not.toHaveBeenCalled()
    dispose()
  })
})

describe("applyOtaUpdateNow", () => {
  test("applies the staged bundle", async () => {
    stubFetch(async () => MANIFEST)
    await checkForOtaUpdate({ force: true })

    await applyOtaUpdateNow()

    expect(setMock).toHaveBeenCalledWith({ id: "bundle-1.0.482" })
  })

  test("does nothing when no bundle is staged", async () => {
    await applyOtaUpdateNow()
    expect(setMock).not.toHaveBeenCalled()
  })
})

describe("otaBuildVersion", () => {
  test("falls back to 0.0.0 when the build was not stamped", () => {
    // Unstamped builds must never look newer than a real release.
    expect(otaBuildVersion()).toBe("0.0.0")
  })
})

describe("notifyOtaAppReady", () => {
  test("reports readiness through the plugin", async () => {
    await notifyOtaAppReady()
    expect(notifyAppReadyMock).toHaveBeenCalled()
  })
})
