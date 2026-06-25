import { beforeEach, describe, expect, test } from "bun:test"
import {
  clearLocalStorageCache,
  clearUnauthenticatedLocalState,
  isUnauthenticatedError,
} from "../auth-session"

class MemoryStorage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  clear() {
    this.values.clear()
  }
}

function installStorage() {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  })
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage, location: { pathname: "/" } },
    configurable: true,
  })
  return storage
}

describe("auth session helpers", () => {
  beforeEach(() => {
    installStorage()
  })

  test("detects Convex unauthenticated errors", () => {
    expect(isUnauthenticatedError(new Error("Unauthenticated"))).toBe(true)
    expect(isUnauthenticatedError(new Error("Network error"))).toBe(false)
  })

  test("clears app-owned local storage keys only", () => {
    localStorage.setItem("onerep:offline-mutation-queue:v1", "[]")
    localStorage.setItem("onerep_custom_meal_categories", "[]")
    localStorage.setItem("better-auth.session", "token")
    localStorage.setItem("convex:auth", "token")
    localStorage.setItem("theme", "dark")
    localStorage.setItem("external:keep", "value")

    clearLocalStorageCache()

    expect(localStorage.getItem("onerep:offline-mutation-queue:v1")).toBeNull()
    expect(localStorage.getItem("onerep_custom_meal_categories")).toBeNull()
    expect(localStorage.getItem("better-auth.session")).toBeNull()
    expect(localStorage.getItem("convex:auth")).toBeNull()
    expect(localStorage.getItem("theme")).toBeNull()
    expect(localStorage.getItem("external:keep")).toBe("value")
  })

  test("marks intro as seen after unauthenticated cleanup", () => {
    localStorage.setItem("onerep:offline-owner:v1", "user")

    clearUnauthenticatedLocalState()

    expect(localStorage.getItem("onerep:offline-owner:v1")).toBeNull()
    expect(localStorage.getItem("onerep:prelogin-onboarding-seen")).toBe("true")
  })
})
