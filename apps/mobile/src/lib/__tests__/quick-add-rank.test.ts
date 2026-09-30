import { beforeEach, describe, expect, test } from "bun:test"
import {
  rankQuickActions,
  readQuickActionUsage,
  recordQuickActionUse,
  DEFAULT_QUICK_ADD_ORDER,
} from "../quick-add-rank"

const OPTIONS = [
  { action: "workout", label: "Log a workout" },
  { action: "food", label: "Log Food" },
  { action: "recipe-create", label: "Create a recipe" },
  { action: "recipes", label: "Find Recipes" },
  { action: "water", label: "Log water" },
  { action: "fasting", label: "Start a fast" },
  { action: "supplements", label: "Take supplements" },
]

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

describe("quick-add ranking", () => {
  test("an unused fan keeps its fallback order, food first", () => {
    const ranked = rankQuickActions(OPTIONS)
    expect(ranked.map((option) => option.action)).toEqual([
      ...DEFAULT_QUICK_ADD_ORDER,
    ])
  })

  test("the most-used action rises to the top after use", () => {
    for (let i = 0; i < 3; i++) recordQuickActionUse("water")
    recordQuickActionUse("food")
    const ranked = rankQuickActions(OPTIONS)
    expect(ranked[0].action).toBe("water")
    expect(ranked[1].action).toBe("food")
  })

  test("recent use outranks an old habit: decay lets another action pass", () => {
    for (let i = 0; i < 6; i++) recordQuickActionUse("fasting")
    // Six uses of fasting; water used once now. Decay on each record lets
    // the fresh use climb: 6 -> 4 -> 2.67 -> 1.78 -> 1.19 -> 0.79 -> 0.52.
    recordQuickActionUse("water")
    const ranked = rankQuickActions(OPTIONS)
    expect(ranked[0].action).toBe("fasting")
    // And once the habit stops being used, the newer one overtakes it.
    for (let i = 0; i < 3; i++) recordQuickActionUse("water")
    expect(rankQuickActions(OPTIONS)[0].action).toBe("water")
  })

  test("counts are capped and stored", () => {
    for (let i = 0; i < 100; i++) recordQuickActionUse("food")
    expect(readQuickActionUsage().food).toBeLessThanOrEqual(50)
  })

  test("a corrupt store reads as empty", () => {
    storage.setItem("onerep:quick-add-usage", "{not json")
    expect(readQuickActionUsage()).toEqual({})
    expect(rankQuickActions(OPTIONS).map((o) => o.action)).toEqual([
      ...DEFAULT_QUICK_ADD_ORDER,
    ])
  })

  test("unknown actions keep their given order after ranked ones", () => {
    const mixed = [
      { action: "food", label: "Log Food" },
      { action: "mystery", label: "Mystery" },
    ]
    recordQuickActionUse("food")
    const ranked = rankQuickActions(mixed)
    expect(ranked.map((o) => o.action)).toEqual(["food", "mystery"])
  })
})
