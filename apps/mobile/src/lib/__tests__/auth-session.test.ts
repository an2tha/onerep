import { beforeEach, describe, expect, test } from "bun:test"
import {
  clearLocalStorageCache,
  clearUnauthenticatedLocalState,
  handleUnauthenticatedSession,
  isUnauthenticatedError,
  loginPathForAuthRedirect,
  safeAuthRedirectPath,
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

function setWindowLocation(pathname: string, search = "", hash = "") {
  Object.defineProperty(globalThis, "window", {
    value: { localStorage, location: { pathname, search, hash } },
    configurable: true,
  })
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
    localStorage.setItem("convex:auth", "token")
    localStorage.setItem("theme", "dark")
    localStorage.setItem("external:keep", "value")

    clearLocalStorageCache()

    expect(localStorage.getItem("onerep:offline-mutation-queue:v1")).toBeNull()
    expect(localStorage.getItem("onerep_custom_meal_categories")).toBeNull()
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

  test("sanitizes auth redirect paths to in-app routes only", () => {
    expect(safeAuthRedirectPath("/foods?tab=history#meal")).toBe(
      "/foods?tab=history#meal"
    )
    expect(safeAuthRedirectPath("https://evil.example/foods")).toBe("/")
    expect(safeAuthRedirectPath("//evil.example/foods")).toBe("/")
    expect(safeAuthRedirectPath("/login?next=/foods")).toBe("/")
    expect(safeAuthRedirectPath("/sso-callback?next=/foods")).toBe("/")
  })

  test("builds a login path that preserves the protected route", () => {
    setWindowLocation("/foods", "?tab=history", "#meal")

    expect(loginPathForAuthRedirect()).toBe(
      "/login?next=%2Ffoods%3Ftab%3Dhistory%23meal"
    )
  })

  test("signs out the auth client before redirecting to login", async () => {
    const events: string[] = []
    const originalNow = Date.now
    Date.now = () => 10_000

    try {
      await handleUnauthenticatedSession({
        signOut: async () => {
          events.push("signOut")
        },
        navigate: (to, options) => {
          events.push(`navigate:${String(to)}:${String(options?.replace)}`)
        },
      })
    } finally {
      Date.now = originalNow
    }

    expect(events).toEqual(["signOut", "navigate:/login:true"])
    expect(localStorage.getItem("onerep:prelogin-onboarding-seen")).toBe("true")
  })

  test("redirects unauthenticated protected routes to login with next path", async () => {
    const events: string[] = []
    const originalNow = Date.now
    Date.now = () => 12_500
    setWindowLocation("/water", "?from=widget")

    try {
      await handleUnauthenticatedSession({
        navigate: (to, options) => {
          events.push(`navigate:${String(to)}:${String(options?.replace)}`)
        },
      })
    } finally {
      Date.now = originalNow
    }

    expect(events).toEqual([
      "navigate:/login?next=%2Fwater%3Ffrom%3Dwidget:true",
    ])
  })

  test("suppresses duplicate unauthenticated redirects during the cooldown", async () => {
    const events: string[] = []
    const originalNow = Date.now
    Date.now = () => 20_000

    try {
      await handleUnauthenticatedSession({
        signOut: async () => {
          events.push("first:signOut")
        },
        navigate: () => {
          events.push("first:navigate")
        },
      })
      Date.now = () => 20_500
      await handleUnauthenticatedSession({
        signOut: async () => {
          events.push("second:signOut")
        },
        navigate: () => {
          events.push("second:navigate")
        },
      })
    } finally {
      Date.now = originalNow
    }

    expect(events).toEqual(["first:signOut", "first:navigate"])
  })

  test("allows changed protected routes during the redirect cooldown", async () => {
    const events: string[] = []
    const originalNow = Date.now
    Date.now = () => 21_000
    setWindowLocation("/water")

    try {
      await handleUnauthenticatedSession({
        navigate: (to) => {
          events.push(`first:${String(to)}`)
        },
      })
      Date.now = () => 21_500
      setWindowLocation("/foods/search", "?q=rice")
      await handleUnauthenticatedSession({
        navigate: (to) => {
          events.push(`second:${String(to)}`)
        },
      })
    } finally {
      Date.now = originalNow
    }

    expect(events).toEqual([
      "first:/login?next=%2Fwater",
      "second:/login?next=%2Ffoods%2Fsearch%3Fq%3Drice",
    ])
  })

  test("allows future unauthenticated recovery after the cooldown", async () => {
    const events: string[] = []
    const originalNow = Date.now
    Date.now = () => 30_000

    try {
      await handleUnauthenticatedSession({
        signOut: async () => {
          events.push("first:signOut")
        },
        navigate: () => {
          events.push("first:navigate")
        },
      })
      Date.now = () => 32_500
      await handleUnauthenticatedSession({
        signOut: async () => {
          events.push("second:signOut")
        },
        navigate: () => {
          events.push("second:navigate")
        },
      })
    } finally {
      Date.now = originalNow
    }

    expect(events).toEqual([
      "first:signOut",
      "first:navigate",
      "second:signOut",
      "second:navigate",
    ])
  })

  test("ignores overlapping unauthenticated redirects while sign-out is running", async () => {
    const events: string[] = []
    const originalNow = Date.now
    Date.now = () => 40_000
    let releaseSignOut: (() => void) | undefined

    try {
      const first = handleUnauthenticatedSession({
        signOut: async () => {
          events.push("first:signOut")
          await new Promise<void>((resolve) => {
            releaseSignOut = resolve
          })
        },
        navigate: () => {
          events.push("first:navigate")
        },
      })
      await handleUnauthenticatedSession({
        signOut: async () => {
          events.push("second:signOut")
        },
        navigate: () => {
          events.push("second:navigate")
        },
      })
      releaseSignOut?.()
      await first
    } finally {
      Date.now = originalNow
    }

    expect(events).toEqual(["first:signOut", "first:navigate"])
  })
})
