import { beforeEach, describe, expect, mock, test } from "bun:test"

const impactMock = mock(async (_options: unknown) => undefined)
const selectionStartMock = mock(async () => undefined)
const selectionChangedMock = mock(async () => undefined)
const selectionEndMock = mock(async () => undefined)

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
    selectionStart: selectionStartMock,
    selectionChanged: selectionChangedMock,
    selectionEnd: selectionEndMock,
  },
  ImpactStyle: {
    Light: "LIGHT",
    Medium: "MEDIUM",
    Heavy: "HEAVY",
  },
}))

const {
  HAPTICS_ENABLED_KEY,
  HAPTICS_STRENGTH_KEY,
  hapticStrength,
  setHapticStrength,
  hapticConfirm,
  hapticRain,
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
    selectionStartMock.mockClear()
    selectionChangedMock.mockClear()
    selectionEndMock.mockClear()
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

  test("routine interactions never vibrate, even at full strength", () => {
    setHapticStrength("full")
    hapticTap(); hapticMedium(); hapticHeavy(); hapticSelection(); hapticRain()
    expect(impactMock).not.toHaveBeenCalled()
    expect(selectionStartMock).not.toHaveBeenCalled()
  })

  test("defaults to gentle feedback and preserves existing opt out", () => {
    expect(hapticStrength()).toBe("light")
    localStorage.setItem(HAPTICS_ENABLED_KEY, "false")
    expect(hapticStrength()).toBe("off")
    hapticConfirm()
    expect(impactMock).not.toHaveBeenCalled()
  })

  test("essential confirmations are light and rate limited", () => {
    const originalNow = Date.now
    let now = 100000
    Date.now = () => now
    try {
      setHapticStrength("full")
      hapticConfirm(); hapticConfirm()
      expect(impactMock).toHaveBeenCalledTimes(1)
      expect(impactMock.mock.calls[0]?.[0]).toEqual({ style: "LIGHT" })
      now += 701
      hapticConfirm()
      expect(impactMock).toHaveBeenCalledTimes(2)
      setHapticStrength("off")
      now += 701
      hapticConfirm()
      expect(impactMock).toHaveBeenCalledTimes(2)
    } finally { Date.now = originalNow }
  })
})
