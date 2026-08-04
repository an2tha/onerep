import { describe, test, expect } from "bun:test"
import {
  browserLocalStorage,
  browserSessionStorage,
  cn,
  createClientId,
  localDateKey,
  logDevDebug,
  logDevError,
  logDevWarn,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  safeSessionStorageGet,
  safeSessionStorageRemove,
  safeSessionStorageSet,
  safeStorageKeys,
} from "../utils"

describe("cn (class name utility)", () => {
  test("returns a single class name unchanged", () => {
    expect(cn("text-red-500")).toBe("text-red-500")
  })

  test("merges multiple class names", () => {
    const result = cn("text-red-500", "font-bold")
    expect(result).toContain("text-red-500")
    expect(result).toContain("font-bold")
  })

  test("handles undefined and null values", () => {
    expect(() => cn("text-red-500", undefined, null)).not.toThrow()
  })

  test("handles false conditionals", () => {
    const shouldInclude = false
    const result = cn("base-class", shouldInclude && "conditional-class")
    expect(result).toContain("base-class")
    expect(result).not.toContain("conditional-class")
  })

  test("handles true conditionals", () => {
    const shouldInclude = true
    const result = cn("base-class", shouldInclude && "conditional-class")
    expect(result).toContain("base-class")
    expect(result).toContain("conditional-class")
  })

  test("handles object syntax", () => {
    const result = cn({ "text-red-500": true, "text-blue-500": false })
    expect(result).toContain("text-red-500")
    expect(result).not.toContain("text-blue-500")
  })

  test("handles array syntax", () => {
    const result = cn(["text-red-500", "font-bold"])
    expect(result).toContain("text-red-500")
    expect(result).toContain("font-bold")
  })

  test("merges conflicting Tailwind classes (twMerge behavior)", () => {
    // twMerge should resolve conflicts: later class wins
    const result = cn("text-red-500", "text-blue-500")
    expect(result).not.toContain("text-red-500")
    expect(result).toContain("text-blue-500")
  })

  test("merges conflicting padding classes", () => {
    const result = cn("p-4", "p-2")
    expect(result).toBe("p-2")
  })

  test("preserves non-conflicting classes", () => {
    const result = cn("p-4", "m-2", "text-red-500")
    expect(result).toContain("p-4")
    expect(result).toContain("m-2")
    expect(result).toContain("text-red-500")
  })

  test("returns empty string for no arguments", () => {
    expect(cn()).toBe("")
  })

  test("returns empty string for all falsy arguments", () => {
    expect(cn(false, null, undefined)).toBe("")
  })

  test("handles nested arrays and objects", () => {
    const result = cn(["text-sm", { "font-bold": true }], "mt-2")
    expect(result).toContain("text-sm")
    expect(result).toContain("font-bold")
    expect(result).toContain("mt-2")
  })
})

describe("localDateKey", () => {
  test("formats local date parts with zero padding", () => {
    expect(localDateKey(new Date(2026, 0, 5, 9, 30))).toBe("2026-01-05")
    expect(localDateKey(new Date(2026, 10, 15, 9, 30))).toBe("2026-11-15")
  })

  test("uses local calendar date instead of UTC ISO date", () => {
    expect(localDateKey(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01")
  })
})

describe("createClientId", () => {
  const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "crypto"
  )

  function restoreCrypto() {
    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, "crypto", originalCryptoDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, "crypto")
    }
  }

  test("uses crypto.randomUUID when available", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => "uuid-123" },
    })

    try {
      expect(createClientId()).toBe("uuid-123")
    } finally {
      restoreCrypto()
    }
  })

  test("falls back to a timestamp and random suffix", () => {
    const originalNow = Date.now
    const originalRandom = Math.random
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    })
    Date.now = () => 1700000000000
    Math.random = () => 0.5

    try {
      expect(createClientId()).toBe("1700000000000_i")
    } finally {
      Date.now = originalNow
      Math.random = originalRandom
      restoreCrypto()
    }
  })
})

describe("safe localStorage helpers", () => {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window"
  )

  function restoreWindow() {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, "window")
    }
  }

  // Both paths have to be closed off, not just `window`: the helper falls back
  // to `globalThis.localStorage`, and the runtime supplies one of its own —
  // which is why stubbing `window` alone passes this file in isolation and
  // fails once another test has already materialised the global.
  test("returns null when localStorage is unavailable", () => {
    const originalGlobalStorage = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage"
    )
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: undefined,
    })

    try {
      expect(browserLocalStorage()).toBeNull()
      expect(safeLocalStorageGet("missing")).toBeNull()
      expect(safeLocalStorageSet("key", "value")).toBe(false)
      expect(safeLocalStorageRemove("key")).toBe(false)
    } finally {
      if (originalGlobalStorage) {
        Object.defineProperty(globalThis, "localStorage", originalGlobalStorage)
      } else {
        Reflect.deleteProperty(globalThis, "localStorage")
      }
      restoreWindow()
    }
  })

  test("reads, writes, and removes values when storage is available", () => {
    const values = new Map<string, string>()
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => values.set(key, value),
          removeItem: (key: string) => values.delete(key),
        },
      },
    })

    try {
      expect(safeLocalStorageSet("key", "value")).toBe(true)
      expect(safeLocalStorageGet("key")).toBe("value")
      expect(safeLocalStorageRemove("key")).toBe(true)
      expect(safeLocalStorageGet("key")).toBeNull()
    } finally {
      restoreWindow()
    }
  })

  test("falls back to global localStorage when window storage is absent", () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    }
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    })
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    })

    try {
      expect(browserLocalStorage()).toBe(storage)
      expect(safeLocalStorageSet("key", "value")).toBe(true)
      expect(safeLocalStorageGet("key")).toBe("value")
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage")
      restoreWindow()
    }
  })

  test("lists storage keys and swallows key iteration failures", () => {
    const keys = ["first", "second"]

    expect(
      safeStorageKeys({
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        length: keys.length,
        key: (index: number) => keys[index] ?? null,
      })
    ).toEqual(keys)

    expect(
      safeStorageKeys({
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        length: 1,
        key() {
          throw new Error("blocked")
        },
      })
    ).toEqual([])
  })

  test("safe sessionStorage helpers read, write, remove, and swallow failures", () => {
    const values = new Map<string, string>()
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => values.set(key, value),
          removeItem: (key: string) => values.delete(key),
        },
      },
    })

    try {
      expect(browserSessionStorage()).not.toBeNull()
      expect(safeSessionStorageSet("key", "value")).toBe(true)
      expect(safeSessionStorageGet("key")).toBe("value")
      expect(safeSessionStorageRemove("key")).toBe(true)
      expect(safeSessionStorageGet("key")).toBeNull()
    } finally {
      restoreWindow()
    }

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.defineProperty({}, "sessionStorage", {
        get() {
          throw new Error("storage blocked")
        },
      }),
    })

    try {
      expect(browserSessionStorage()).toBeNull()
      expect(safeSessionStorageGet("key")).toBeNull()
      expect(safeSessionStorageSet("key", "value")).toBe(false)
      expect(safeSessionStorageRemove("key")).toBe(false)
    } finally {
      restoreWindow()
    }
  })

  test("swallows storage getter and quota failures", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.defineProperty({}, "localStorage", {
        get() {
          throw new Error("storage blocked")
        },
      }),
    })

    try {
      expect(browserLocalStorage()).toBeNull()
      expect(safeLocalStorageGet("key")).toBeNull()
    } finally {
      restoreWindow()
    }

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem() {
            throw new Error("read blocked")
          },
          setItem() {
            throw new Error("quota exceeded")
          },
          removeItem() {
            throw new Error("remove blocked")
          },
        },
      },
    })

    try {
      expect(safeLocalStorageGet("key")).toBeNull()
      expect(safeLocalStorageSet("key", "value")).toBe(false)
      expect(safeLocalStorageRemove("key")).toBe(false)
    } finally {
      restoreWindow()
    }
  })
})

describe("dev logging helpers", () => {
  test("suppress console output outside dev mode", () => {
    const originalDebug = console.debug
    const originalWarn = console.warn
    const originalError = console.error
    let calls = 0
    console.debug = () => {
      calls += 1
    }
    console.warn = () => {
      calls += 1
    }
    console.error = () => {
      calls += 1
    }

    try {
      logDevDebug("debug")
      logDevWarn("warn")
      logDevError("error")
    } finally {
      console.debug = originalDebug
      console.warn = originalWarn
      console.error = originalError
    }

    expect(calls).toBe(0)
  })
})
