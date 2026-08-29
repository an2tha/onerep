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

  test("fires native haptics while enabled", () => {
    hapticTap()
    hapticMedium()
    hapticHeavy()
    hapticSelection()

    expect(impactMock).toHaveBeenCalledTimes(3)
    expect(impactMock.mock.calls[0]?.[0]).toEqual({ style: "LIGHT" })
    expect(impactMock.mock.calls[1]?.[0]).toEqual({ style: "MEDIUM" })
    expect(impactMock.mock.calls[2]?.[0]).toEqual({ style: "HEAVY" })
    // The rest of the sequence hangs off promises; the start is what fires now.
    expect(selectionStartMock).toHaveBeenCalledTimes(1)
  })

  test("suppresses native haptics when disabled", () => {
    setHapticsEnabled(false)

    hapticTap()
    hapticMedium()
    hapticHeavy()
    hapticSelection()

    expect(impactMock).not.toHaveBeenCalled()
    expect(selectionStartMock).not.toHaveBeenCalled()
  })

  test("defaults to full strength and stores the chosen level", () => {
    expect(hapticStrength()).toBe("full")

    setHapticStrength("light")
    expect(localStorage.getItem(HAPTICS_STRENGTH_KEY)).toBe("light")
    expect(hapticStrength()).toBe("light")
    // The legacy key follows along so an older build still buzzes.
    expect(localStorage.getItem(HAPTICS_ENABLED_KEY)).toBe("true")
  })

  test("honours a pre-dial opt-out stored under the old key", () => {
    localStorage.setItem(HAPTICS_ENABLED_KEY, "false")
    expect(hapticStrength()).toBe("off")
    expect(hapticsEnabled()).toBe(false)
  })

  test("clamps every impact to the chosen strength", () => {
    setHapticStrength("light")
    hapticTap()
    hapticMedium()
    hapticHeavy()
    expect(impactMock.mock.calls.map((call) => call[0])).toEqual([
      { style: "LIGHT" },
      { style: "LIGHT" },
      { style: "LIGHT" },
    ])

    impactMock.mockClear()
    setHapticStrength("medium")
    hapticTap()
    hapticMedium()
    hapticHeavy()
    expect(impactMock.mock.calls.map((call) => call[0])).toEqual([
      { style: "LIGHT" },
      { style: "MEDIUM" },
      { style: "MEDIUM" },
    ])
  })

  test("off silences impacts and selection alike", () => {
    setHapticStrength("off")

    hapticTap()
    hapticHeavy()
    hapticSelection()

    expect(impactMock).not.toHaveBeenCalled()
    expect(selectionStartMock).not.toHaveBeenCalled()
  })
})
