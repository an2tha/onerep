import { describe, expect, test } from "bun:test"
import {
  clearRouteMotion,
  getRouteMotion,
  hasNativeRouteTransition,
  prefersReducedMotion,
  setRouteMotion,
  shouldShowPageBar,
} from "../navigation"

describe("route motion helpers", () => {
  const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "document"
  )
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window"
  )

  function restoreGlobals() {
    if (originalDocumentDescriptor) {
      Object.defineProperty(globalThis, "document", originalDocumentDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, "document")
    }

    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, "window")
    }
  }

  test("sets, reads, and clears route motion", () => {
    const dataset: Record<string, string> = {}
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { documentElement: { dataset } },
    })

    try {
      setRouteMotion("forward")
      expect(getRouteMotion()).toBe("forward")
      expect(hasNativeRouteTransition()).toBe(false)

      setRouteMotion("back", true)
      expect(getRouteMotion()).toBe("back")
      expect(hasNativeRouteTransition()).toBe(true)

      clearRouteMotion()
      expect(getRouteMotion()).toBeUndefined()
      expect(hasNativeRouteTransition()).toBe(false)
    } finally {
      restoreGlobals()
    }
  })

  test("ignores invalid or unavailable route motion state", () => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { documentElement: { dataset: { routeMotion: "sideways" } } },
    })

    try {
      expect(getRouteMotion()).toBeUndefined()
    } finally {
      restoreGlobals()
    }

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: undefined,
    })

    try {
      expect(() => setRouteMotion("switch")).not.toThrow()
      expect(getRouteMotion()).toBeUndefined()
      expect(hasNativeRouteTransition()).toBe(false)
      expect(() => clearRouteMotion()).not.toThrow()
    } finally {
      restoreGlobals()
    }
  })

  test("detects reduced motion preference when available", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { matchMedia: () => ({ matches: true }) },
    })

    try {
      expect(prefersReducedMotion()).toBe(true)
    } finally {
      restoreGlobals()
    }
  })
})

describe("shared page navigation", () => {
  test("focused tasks keep their own dismissal controls", () => {
    for (const path of [
      "/camera",
      "/workout/log/2026-10-03",
      "/foods/review/apple",
      "/restart",
      "/workouts/new",
      "/workouts/edit/preset",
      "/workout/active",
      "/workout/active/preset",
      "/endurance/active/run",
    ]) {
      expect(shouldShowPageBar(path, true)).toBe(false)
    }
  })
  test("browsing pages and food tools use the shared toolbar", () => {
    for (const path of [
      "/settings",
      "/workout/log/2026-10-03/quick",
      "/health/sleep",
      "/recipes",
      "/foods/search",
      "/foods/recipe/new",
      "/nutrition/groceries/list",
    ]) {
      expect(shouldShowPageBar(path, true)).toBe(true)
      expect(shouldShowPageBar(path, false)).toBe(false)
    }
  })
})
