import { beforeEach, describe, expect, mock, test } from "bun:test"

const impactMock = mock(async (_options: unknown) => undefined)
const selectionChangedMock = mock(async () => undefined)

mock.module("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "ios",
    isNativePlatform: () => true,
  },
  registerPlugin: () => ({}),
  WebPlugin: class {},
}))

mock.module("@capacitor/haptics", () => ({
  Haptics: {
    impact: impactMock,
    selectionChanged: selectionChangedMock,
  },
  ImpactStyle: {
    Light: "LIGHT",
    Medium: "MEDIUM",
    Heavy: "HEAVY",
  },
}))

const {
  HAPTICS_ENABLED_KEY,
  hapticHeavy,
  hapticMedium,
  hapticSelection,
  hapticTap,
  hapticsEnabled,
  setHapticsEnabled,
} = await import("../haptics")

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

function installStorage() {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  })
  return storage
}

describe("haptic preferences", () => {
  beforeEach(() => {
    installStorage()
    impactMock.mockClear()
    selectionChangedMock.mockClear()
  })

  test("haptics default to enabled", () => {
    expect(hapticsEnabled()).toBe(true)
  })

  test("persists the local haptics preference", () => {
    expect(setHapticsEnabled(false)).toBe(true)
    expect(localStorage.getItem(HAPTICS_ENABLED_KEY)).toBe("false")
    expect(hapticsEnabled()).toBe(false)

    expect(setHapticsEnabled(true)).toBe(true)
    expect(localStorage.getItem(HAPTICS_ENABLED_KEY)).toBe("true")
    expect(hapticsEnabled()).toBe(true)
  })

  test("fires native haptics while enabled", () => {
    hapticTap()
    hapticMedium()
    hapticHeavy()
    hapticSelection()

    expect(impactMock).toHaveBeenCalledTimes(3)
    expect(impactMock.mock.calls[0]?.[0]).toEqual({ style: "LIGHT" })
    expect(impactMock.mock.calls[1]?.[0]).toEqual({ style: "MEDIUM" })
    expect(impactMock.mock.calls[2]?.[0]).toEqual({ style: "HEAVY" })
    expect(selectionChangedMock).toHaveBeenCalledTimes(1)
  })

  test("suppresses native haptics when disabled", () => {
    setHapticsEnabled(false)

    hapticTap()
    hapticMedium()
    hapticHeavy()
    hapticSelection()

    expect(impactMock).not.toHaveBeenCalled()
    expect(selectionChangedMock).not.toHaveBeenCalled()
  })
})
