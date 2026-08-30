import { beforeEach, describe, expect, mock, test } from "bun:test"

// Pin the disabled behavior itself: with the shipped config (OTA_ENABLED =
// false, Apple review mode), every entry point must be a no-op and must never
// touch the Capgo plugin or the network, even if a future refactor breaks the
// module's internal guards. Unlike ota.test.ts, this suite does NOT alias
// ota-config, so it exercises the shipped configuration.
mock.module("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "ios",
    isNativePlatform: () => true,
  },
  registerPlugin: () => ({}),
  WebPlugin: class {},
}))

const downloadMock = mock(async () => {
  throw new Error("plugin must never be called while OTA is disabled")
})
const nextMock = mock(async () => {
  throw new Error("plugin must never be called while OTA is disabled")
})
const setMock = mock(async () => {
  throw new Error("plugin must never be called while OTA is disabled")
})
const notifyAppReadyMock = mock(async () => ({ bundle: {} }))
const currentMock = mock(async () => {
  throw new Error("plugin must never be called while OTA is disabled")
})
const getNextBundleMock = mock(async () => null)
const getFailedUpdateMock = mock(async () => null)
const addListenerMock = mock(async () => ({ remove: async () => {} }))

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

const originalFetch = globalThis.fetch

const {
  applyOtaUpdateNow,
  checkForOtaUpdate,
  getOtaState,
  initializeOta,
  notifyOtaAppReady,
  resetOtaStateForTests,
} = await import("../ota")

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

const fetchMock = mock(async () => {
  throw new Error("network must never be touched while OTA is disabled")
})
globalThis.fetch = fetchMock as unknown as typeof fetch

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
  for (const fn of capgoMocks) fn.mockClear()
  fetchMock.mockClear()
  storage.clear()
  resetOtaStateForTests()
})

describe("OTA disabled (Apple review mode)", () => {
  test("checkForOtaUpdate is a no-op that never fetches or touches the plugin", async () => {
    const decision = await checkForOtaUpdate({ force: true })

    expect(decision).toEqual({ action: "skip", reason: "up-to-date" })
    expect(getOtaState()).toEqual({ phase: "idle" })
    expect(globalThis.fetch).not.toHaveBeenCalled()
    for (const fn of capgoMocks) expect(fn).not.toHaveBeenCalled()
  })

  test("applyOtaUpdateNow does nothing when nothing is staged", async () => {
    await applyOtaUpdateNow()
    expect(setMock).not.toHaveBeenCalled()
  })

  test("notifyOtaAppReady never reaches the plugin", async () => {
    await notifyOtaAppReady()
    expect(notifyAppReadyMock).not.toHaveBeenCalled()
  })

  test("initializeOta wires nothing and returns a disposer", async () => {
    const dispose = await initializeOta()
    expect(typeof dispose).toBe("function")
    expect(() => dispose()).not.toThrow()
    expect(addListenerMock).not.toHaveBeenCalled()
    expect(getFailedUpdateMock).not.toHaveBeenCalled()
  })
})
