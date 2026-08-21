import { beforeEach, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { cacheWeightUnit, readCachedWeightUnit } from "../use-weight-unit"

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8")

/** The app's storage helpers read `window.localStorage`; give them one. */
class MemoryStorage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  key(index: number) {
    return [...this.store.keys()][index] ?? null
  }
  getItem(key: string) {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  })
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    configurable: true,
  })
})

/**
 * A pounds user was shown kilograms on every first paint.
 *
 * Nothing converted wrongly — each screen guessed metric on its own until the
 * preferences query resolved, so the numbers changed underneath the user on
 * every navigation and every reload.
 */
describe("weight unit does not flip after load", () => {
  test("an unset cache reads as metric", () => {
    expect(readCachedWeightUnit()).toBe("kg")
  })

  test("the last known unit survives a reload", () => {
    cacheWeightUnit("lbs")
    expect(readCachedWeightUnit()).toBe("lbs")
    cacheWeightUnit("kg")
    expect(readCachedWeightUnit()).toBe("kg")
  })

  test("junk in storage is not trusted", () => {
    storage.setItem("onerep:weight-unit", "stones")
    expect(readCachedWeightUnit()).toBe("kg")
  })

  test("no screen hardcodes a metric default any more", () => {
    for (const path of [
      "../../pages/Progress.tsx",
      "../../pages/ExerciseDetail.tsx",
      "../../pages/QuickLogPreset.tsx",
      "../../components/moments/quick-log-step.tsx",
    ]) {
      expect(read(path)).toContain("useWeightUnit()")
    }
    for (const path of [
      "../../pages/ActiveWorkout.tsx",
      "../../pages/NewPreset.tsx",
    ]) {
      const source = read(path)
      expect(source).toContain("useState<WeightUnit>(readCachedWeightUnit)")
      expect(source).not.toContain('useState<WeightUnit>("kg")')
    }
  })

  test("changing the unit in Settings writes through immediately", () => {
    expect(read("../../pages/Settings.tsx")).toContain(
      "cacheWeightUnit(weightUnit)"
    )
  })
})
