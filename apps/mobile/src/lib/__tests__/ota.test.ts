import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

let isNative = true

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

mock.module("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "ios",
    isNativePlatform: () => isNative,
  },
  registerPlugin: () => ({}),
  WebPlugin: class {},
}))

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
  isOtaSupported,
  notifyOtaAppReady,
  otaBuildVersion,
  resetOtaStateForTests,
} = await import("../ota")

const MANIFEST = {
  schema: 1,
  version: "1.0.482",
  url: "https://app.onerep.life/ota/bundles/1.0.482.zip",
  checksum: "a".repeat(64),
  minNativeVersion: "1.0.0",
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
    return {
      ok: true,
      status: 200,
      json: async () => body,
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
]

beforeEach(() => {
  isNative = true
  for (const fn of capgoMocks) fn.mockClear()
  storage.clear()
  resetOtaStateForTests()
})

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
  test("downloads a newer bundle and stages it for the next launch", async () => {
    stubFetch(async () => MANIFEST)

    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toMatchObject({ action: "download", version: "1.0.482" })
    expect(downloadMock).toHaveBeenCalledWith({
      url: MANIFEST.url,
      version: "1.0.482",
      checksum: MANIFEST.checksum,
    })
    // Staging is what makes the update land without the user tapping anything.
    expect(nextMock).toHaveBeenCalledWith({ id: "bundle-1.0.482" })
    expect(getOtaState()).toMatchObject({ phase: "ready", version: "1.0.482" })
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

  test("does not stage a bundle whose download failed", async () => {
    stubFetch(async () => MANIFEST)
    downloadMock.mockImplementationOnce(async () => {
      throw new Error("checksum mismatch")
    })

    await checkForOtaUpdate({ force: true })

    expect(nextMock).not.toHaveBeenCalled()
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
