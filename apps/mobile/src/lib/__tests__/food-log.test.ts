import { describe, test, expect, beforeEach } from "bun:test"
import {
  DEFAULT_MEAL_CATEGORIES,
  CUSTOM_CATEGORY_COLORS,
  defaultMeal,
  dateForOffset,
  offsetDateKey,
  currentDateKey,
  defaultFoodPortion,
  detectTimeZone,
  foodLogEntryFromFoodResult,
  buildFoodHistoryDaySummaries,
  findSmartMealPresetSuggestion,
  foodLogEntriesFromMealPreset,
  foodLogEntriesFromHistoryMeal,
  foodPortionLabel,
  foodServingLabel,
  foodServingMultiplier,
  gramsFromFoodPortion,
  isNamedFoodServing,
  stepFoodServingMultiplier,
  mealEntriesSignature,
  mealPresetTemplateEntries,
  nutritionDetailTotals,
  parseFoodPortionLabel,
  readAllMealCategories,
  addMealCategory,
  removeMealCategory,
  mergeCustomMealCategories,
  type FoodLogEntry,
  type MealPreset,
} from "../food-log"

// ── DEFAULT_MEAL_CATEGORIES ───────────────────────────────────────────────────

describe("DEFAULT_MEAL_CATEGORIES", () => {
  test("has 4 default categories", () => {
    expect(DEFAULT_MEAL_CATEGORIES).toHaveLength(4)
  })

  test("contains breakfast, lunch, dinner, snack", () => {
    const ids = DEFAULT_MEAL_CATEGORIES.map((c) => c.id)
    expect(ids).toContain("breakfast")
    expect(ids).toContain("lunch")
    expect(ids).toContain("dinner")
    expect(ids).toContain("snack")
  })

  test("all default categories have isDefault: true", () => {
    for (const cat of DEFAULT_MEAL_CATEGORIES) {
      expect(cat.isDefault).toBe(true)
    }
  })

  test("all categories have id, label, color, bg", () => {
    for (const cat of DEFAULT_MEAL_CATEGORIES) {
      expect(cat.id).toBeTruthy()
      expect(cat.label).toBeTruthy()
      expect(cat.color).toBeTruthy()
      expect(cat.bg).toBeTruthy()
    }
  })
})

// ── CUSTOM_CATEGORY_COLORS ────────────────────────────────────────────────────

describe("CUSTOM_CATEGORY_COLORS", () => {
  test("has multiple color options", () => {
    expect(CUSTOM_CATEGORY_COLORS.length).toBeGreaterThan(0)
  })

  test("each entry has color and bg", () => {
    for (const entry of CUSTOM_CATEGORY_COLORS) {
      expect(entry.color).toBeTruthy()
      expect(entry.bg).toBeTruthy()
    }
  })
})

// ── defaultMeal ───────────────────────────────────────────────────────────────

describe("defaultMeal", () => {
  test("returns a valid meal type string", () => {
    const meal = defaultMeal()
    const validMeals = ["breakfast", "lunch", "dinner", "snack"]
    expect(validMeals).toContain(meal)
  })
})

describe("food portion units", () => {
  test("parses metric liquid portions", () => {
    expect(parseFoodPortionLabel("250 ml")).toEqual({
      amount: 250,
      unit: "ml",
      grams: 250,
    })
  })

  test("converts cups and fluid ounces to backing grams", () => {
    expect(gramsFromFoodPortion(1, "cup")).toBe(240)
    expect(gramsFromFoodPortion(8, "fl_oz")).toBe(236.6)
  })

  test("keeps an exact source mass when a volume serving provides one", () => {
    expect(parseFoodPortionLabel("1 cup (230 g)")).toEqual({
      amount: 1,
      unit: "cup",
      grams: 230,
    })
  })

  test("displays liquid foods in ml when source only has generic 100 g", () => {
    const portion = defaultFoodPortion("100 g", "Orange juice")
    expect(portion).toEqual({ amount: 100, unit: "ml", grams: 100 })
    expect(foodPortionLabel(portion)).toBe("100 ml")
  })
})

describe("foodLogEntryFromFoodResult", () => {
  const food = {
    id: "code-123",
    code: "123",
    name: "Greek Yogurt",
    brand: "Test Dairy",
    calories: 120,
    protein: 10,
    carbs: 8,
    fat: 4,
    serving: "100 g",
    source: "openfoodfacts" as const,
    imageUrl: "https://example.com/yogurt.jpg",
    openFoodFacts: {
      code: "123",
      product_name: "Greek Yogurt",
      nutriments: {
        "energy-kcal_100g": 120,
        fiber_100g: 1,
      },
    },
  }

  test("creates a basic OpenFoodFacts food log entry", () => {
    const entry = foodLogEntryFromFoodResult(food, {
      meal: "lunch",
      loggedAt: "2026-02-03T10:11:12.000Z",
    })

    expect(entry.id).toBeTruthy()
    expect(entry.name).toBe("Greek Yogurt")
    expect(entry.calories).toBe(120)
    expect(entry.protein).toBe(10)
    expect(entry.carbs).toBe(8)
    expect(entry.fat).toBe(4)
    expect(entry.loggedAt).toBe("2026-02-03T10:11:12.000Z")
    expect(entry.meal).toBe("lunch")
    expect(entry.source).toBe("openfoodfacts")
    expect(entry.foodCode).toBe("123")
    expect(entry.quantityGrams).toBe(100)
    expect(entry.servingLabel).toBe("100 g")
    expect(entry.imageUrl).toBe("https://example.com/yogurt.jpg")
    expect(entry.openFoodFacts?.code).toBe("123")
  })

  test("scales macros, labels custom portions, and keeps micronutrients", () => {
    const entry = foodLogEntryFromFoodResult(food, {
      grams: 150,
      micros: { fiber: 3.5, sodium: 80 },
      meal: "snack",
      portion: { amount: 150, unit: "g", grams: 150 },
      detail: {
        ...food,
        servingGrams: 125,
        servingLabel: "1 cup",
        nutrients: [],
        extraNutrients: [],
        imageUrl: "https://example.com/detail.jpg",
        openFoodFacts: { code: "detail", nutriments: {} },
      },
    })

    expect(entry.name).toBe("Greek Yogurt (150 g)")
    expect(entry.calories).toBe(180)
    expect(entry.protein).toBe(15)
    expect(entry.carbs).toBe(12)
    expect(entry.fat).toBe(6)
    expect(entry.fiber).toBe(3.5)
    expect(entry.sodium).toBe(80)
    expect(entry.meal).toBe("snack")
    expect(entry.quantityGrams).toBe(150)
    expect(entry.servingGrams).toBe(125)
    expect(entry.servingLabel).toBe("1 cup")
    expect(entry.imageUrl).toBe("https://example.com/detail.jpg")
    expect(entry.openFoodFacts?.code).toBe("detail")
  })
})

function foodEntry(overrides: Partial<FoodLogEntry>): FoodLogEntry {
  return {
    id: "entry",
    name: "Food",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    loggedAt: "2026-01-01T12:00:00.000Z",
    meal: "breakfast",
    ...overrides,
  }
}

describe("nutritionDetailTotals", () => {
  test("uses logged micronutrient fields before source fallback data", () => {
    const totals = nutritionDetailTotals([
      foodEntry({
        calories: 100,
        fiber: 3,
        sodium: 125,
        openFoodFacts: {
          code: "direct",
          nutriments: {
            "energy-kcal_100g": 100,
            fiber_100g: 99,
            sodium_100g: 1,
            sodium_unit: "g",
          },
        },
      }),
    ])

    expect(totals.fiber).toBe(3)
    expect(totals.sodium).toBe(125)
  })

  test("derives source micronutrients using the logged calorie scale", () => {
    const totals = nutritionDetailTotals([
      foodEntry({
        calories: 250,
        openFoodFacts: {
          code: "scaled",
          nutriments: {
            "energy-kcal_100g": 500,
            fiber_100g: 4,
            sodium_100g: 0.8,
            sodium_unit: "g",
            calcium_100g: 80,
            calcium_unit: "mg",
          },
        },
      }),
    ])

    expect(totals.fiber).toBe(2)
    expect(totals.sodium).toBe(400)
    expect(totals.calcium).toBe(40)
  })

  test("uses logged quantity grams when calories and macros are unavailable", () => {
    const totals = nutritionDetailTotals([
      foodEntry({
        quantityGrams: 150,
        openFoodFacts: {
          code: "quantity",
          nutriments: {
            fiber_100g: 4,
          },
        },
      }),
    ])

    expect(totals.fiber).toBe(6)
  })

  test("prefers the recorded portion mass over rounded calories", () => {
    const totals = nutritionDetailTotals([
      foodEntry({
        // 150 g of a 1 kcal/100 g food can round to 2 kcal. Reconstructing
        // from calories would incorrectly treat it as 200 g.
        calories: 2,
        quantityGrams: 150,
        openFoodFacts: {
          code: "mass-first",
          nutriments: {
            "energy-kcal_100g": 1,
            fiber_100g: 4,
            sodium_100g: 0.8,
            sodium_unit: "g",
          },
        },
      }),
    ])

    expect(totals.fiber).toBe(6)
    expect(totals.sodium).toBe(1200)
  })

  test("normalizes Greek-mu microgram units without a thousand-fold error", () => {
    const totals = nutritionDetailTotals([
      foodEntry({
        quantityGrams: 100,
        openFoodFacts: {
          code: "microgram-unit",
          nutriments: {
            "vitamin-a_100g": 0.5,
            "vitamin-a_unit": "μg",
          },
        },
      }),
    ])

    expect(totals.vitaminA).toBe(0.5)
  })
})

describe("smart meal preset helpers", () => {
  const breakfastEntries = [
    foodEntry({
      id: "oats-1",
      name: "Oats (60 g)",
      calories: 230,
      protein: 8,
      carbs: 38,
      fat: 4,
      loggedAt: "2026-06-20T07:30:00.000Z",
      meal: "breakfast",
    }),
    foodEntry({
      id: "coffee-1",
      name: "Coffee",
      calories: 20,
      protein: 1,
      carbs: 2,
      fat: 0,
      loggedAt: "2026-06-20T07:35:00.000Z",
      meal: "breakfast",
    }),
  ]

  function breakfastPreset(): MealPreset {
    const entries = mealPresetTemplateEntries(breakfastEntries)
    return {
      _id: "preset-1",
      name: "Usual Breakfast",
      meal: "breakfast",
      signature: mealEntriesSignature(entries),
      entries,
      updatedAt: 10,
    }
  }

  test("suggests saving a meal repeated across recent logs", () => {
    const suggestion = findSmartMealPresetSuggestion({
      recentDays: [
        { date: "2026-06-21", entries: breakfastEntries },
        {
          date: "2026-06-20",
          entries: breakfastEntries
            .map((entry) => ({
              ...entry,
              id: `${entry.id}-again`,
              loggedAt: "2026-06-20T08:00:00.000Z",
            }))
            .reverse(),
        },
      ],
      presets: [],
      todayEntries: [],
      currentMeal: "breakfast",
    })

    expect(suggestion?.kind).toBe("save")
    if (suggestion?.kind !== "save") return
    expect(suggestion.name).toBe("Usual Breakfast")
    expect(suggestion.count).toBe(2)
    expect(suggestion.entries.map((entry) => entry.name)).toEqual([
      "Oats (60 g)",
      "Coffee",
    ])
  })

  test("suggests logging the saved usual meal for the current meal window", () => {
    const preset = breakfastPreset()
    const suggestion = findSmartMealPresetSuggestion({
      recentDays: [],
      presets: [preset],
      todayEntries: [],
      currentMeal: "breakfast",
    })

    expect(suggestion?.kind).toBe("log")
    if (suggestion?.kind !== "log") return
    expect(suggestion.preset.name).toBe("Usual Breakfast")
    expect(suggestion.mealLabel).toBe("Breakfast")
  })

  test("does not suggest logging a saved usual meal already in today's diary", () => {
    const preset = breakfastPreset()
    const suggestion = findSmartMealPresetSuggestion({
      recentDays: [],
      presets: [preset],
      todayEntries: breakfastEntries,
      currentMeal: "breakfast",
    })

    expect(suggestion).toBeNull()
  })

  test("creates fresh food log entries from a meal preset", () => {
    const preset = breakfastPreset()
    const entries = foodLogEntriesFromMealPreset(preset, {
      meal: "lunch",
      loggedAt: "2026-06-22T12:00:00.000Z",
    })

    expect(entries).toHaveLength(2)
    expect(entries[0].id).toBeTruthy()
    expect(entries[0].meal).toBe("lunch")
    expect(entries[0].loggedAt).toBe("2026-06-22T12:00:00.000Z")
    expect(entries[0].name).toBe("Oats (60 g)")
  })
})

// ── food history helpers ─────────────────────────────────────────────────────

describe("food history helpers", () => {
  const breakfastEntries = [
    foodEntry({
      id: "oats-history",
      name: "Oats",
      calories: 230,
      protein: 8,
      carbs: 38,
      fat: 4,
      loggedAt: "2026-06-29T07:30:00.000Z",
      meal: "breakfast",
    }),
    foodEntry({
      id: "coffee-history",
      name: "Coffee",
      calories: 20,
      protein: 1,
      carbs: 2,
      fat: 0,
      loggedAt: "2026-06-29T07:35:00.000Z",
      meal: "breakfast",
    }),
  ]

  const lunchEntries = [
    foodEntry({
      id: "bowl-history",
      name: "Chicken bowl",
      calories: 620,
      protein: 45,
      carbs: 70,
      fat: 16,
      loggedAt: "2026-06-29T12:20:00.000Z",
      meal: "lunch",
    }),
  ]

  test("summarizes recent days and excludes the current day", () => {
    const summaries = buildFoodHistoryDaySummaries(
      [
        { date: "2026-06-30", entries: lunchEntries },
        { date: "2026-06-29", entries: [...lunchEntries, ...breakfastEntries] },
      ],
      { excludeDate: "2026-06-30" }
    )

    expect(summaries).toHaveLength(1)
    expect(summaries[0].date).toBe("2026-06-29")
    expect(summaries[0].calories).toBe(870)
    expect(summaries[0].meals.map((meal) => meal.meal)).toEqual([
      "breakfast",
      "lunch",
    ])
    expect(summaries[0].meals[0].itemSummary).toBe("Oats, Coffee")
  })

  test("drops empty days and sorts by newest date", () => {
    const summaries = buildFoodHistoryDaySummaries([
      { date: "2026-06-27", entries: [] },
      { date: "2026-06-28", entries: breakfastEntries },
      { date: "2026-06-29", entries: lunchEntries },
    ])

    expect(summaries.map((summary) => summary.date)).toEqual([
      "2026-06-29",
      "2026-06-28",
    ])
  })

  test("copies a historical meal as fresh food log entries", () => {
    const copied = foodLogEntriesFromHistoryMeal(breakfastEntries, {
      meal: "snack",
      loggedAt: "2026-06-30T15:00:00.000Z",
    })

    expect(copied).toHaveLength(2)
    expect(copied[0].id).not.toBe("oats-history")
    expect(copied[0].meal).toBe("snack")
    expect(copied[0].loggedAt).toBe("2026-06-30T15:00:00.000Z")
    expect(copied.map((entry) => entry.name)).toEqual(["Oats", "Coffee"])
  })
})

// ── detectTimeZone ────────────────────────────────────────────────────────────

describe("detectTimeZone", () => {
  test("returns a non-empty string", () => {
    const tz = detectTimeZone()
    expect(typeof tz).toBe("string")
    expect(tz.length).toBeGreaterThan(0)
  })

  test("returns a valid IANA timezone identifier", () => {
    const tz = detectTimeZone()
    // Should not throw when used in Intl
    expect(() => new Intl.DateTimeFormat("en", { timeZone: tz })).not.toThrow()
  })
})

// ── offsetDateKey ─────────────────────────────────────────────────────────────

describe("offsetDateKey", () => {
  test("returns same date with offset 0", () => {
    expect(offsetDateKey("2024-01-15", 0)).toBe("2024-01-15")
  })

  test("adds 1 day correctly", () => {
    expect(offsetDateKey("2024-01-15", 1)).toBe("2024-01-16")
  })

  test("subtracts 1 day correctly", () => {
    expect(offsetDateKey("2024-01-15", -1)).toBe("2024-01-14")
  })

  test("handles month boundary forward", () => {
    expect(offsetDateKey("2024-01-31", 1)).toBe("2024-02-01")
  })

  test("handles month boundary backward", () => {
    expect(offsetDateKey("2024-02-01", -1)).toBe("2024-01-31")
  })

  test("handles year boundary forward", () => {
    expect(offsetDateKey("2024-12-31", 1)).toBe("2025-01-01")
  })

  test("handles year boundary backward", () => {
    expect(offsetDateKey("2025-01-01", -1)).toBe("2024-12-31")
  })

  test("handles leap year February", () => {
    expect(offsetDateKey("2024-02-28", 1)).toBe("2024-02-29") // 2024 is a leap year
    expect(offsetDateKey("2024-02-29", 1)).toBe("2024-03-01")
  })

  test("handles large positive offset", () => {
    // 2024 is a leap year (366 days), so +365 from Jan 1 lands on Dec 31 2024
    expect(offsetDateKey("2024-01-01", 365)).toBe("2024-12-31")
    // +366 lands on Jan 1 2025
    expect(offsetDateKey("2024-01-01", 366)).toBe("2025-01-01")
  })

  test("returns string in YYYY-MM-DD format", () => {
    const result = offsetDateKey("2024-06-15", 3)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ── dateForOffset ─────────────────────────────────────────────────────────────

describe("dateForOffset", () => {
  test("returns a string in YYYY-MM-DD format", () => {
    const result = dateForOffset(0, "UTC")
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test("uses the provided reference date and timezone", () => {
    const reference = new Date("2026-01-01T01:00:00.000Z")
    expect(dateForOffset(0, "UTC", reference)).toBe("2026-01-01")
    expect(dateForOffset(0, "America/Los_Angeles", reference)).toBe(
      "2025-12-31"
    )
  })

  test("tomorrow is 1 day ahead of today", () => {
    const today = dateForOffset(0, "UTC")
    const tomorrow = dateForOffset(1, "UTC")
    expect(offsetDateKey(today, 1)).toBe(tomorrow)
  })

  test("yesterday is 1 day behind today", () => {
    const today = dateForOffset(0, "UTC")
    const yesterday = dateForOffset(-1, "UTC")
    expect(offsetDateKey(today, -1)).toBe(yesterday)
  })
})

// ── currentDateKey ────────────────────────────────────────────────────────────

describe("currentDateKey", () => {
  test("returns a string in YYYY-MM-DD format", () => {
    const result = currentDateKey("UTC")
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test("equals dateForOffset(0)", () => {
    const result = currentDateKey("UTC")
    const expected = dateForOffset(0, "UTC")
    expect(result).toBe(expected)
  })

  test("defaults to the device local calendar date", () => {
    expect(currentDateKey(undefined, new Date(2026, 0, 1, 0, 30))).toBe(
      "2026-01-01"
    )
  })

  test("preserves explicit timezone behavior", () => {
    const reference = new Date("2026-01-01T01:00:00.000Z")
    expect(currentDateKey("UTC", reference)).toBe("2026-01-01")
    expect(currentDateKey("America/Los_Angeles", reference)).toBe("2025-12-31")
  })
})

// ── localStorage-dependent helpers (mock localStorage) ───────────────────────

describe("meal category localStorage helpers", () => {
  // Set up a simple localStorage mock
  const store: Record<string, string> = {}

  beforeEach(() => {
    // Clear the mock store before each test
    for (const key of Object.keys(store)) delete store[key]

    // Install mock
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value
        },
        removeItem: (key: string) => {
          delete store[key]
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k]
        },
      },
    })
  })

  test("readAllMealCategories includes default categories", () => {
    const cats = readAllMealCategories()
    const ids = cats.map((c) => c.id)
    expect(ids).toContain("breakfast")
    expect(ids).toContain("lunch")
    expect(ids).toContain("dinner")
    expect(ids).toContain("snack")
  })

  test("readAllMealCategories returns only defaults when no custom ones", () => {
    const cats = readAllMealCategories()
    expect(cats).toHaveLength(4)
  })

  test("addMealCategory adds a new category", () => {
    addMealCategory("Pre-Workout")
    const cats = readAllMealCategories()
    expect(cats.length).toBe(5)
    const custom = cats.find((c) => c.label === "Pre-Workout")
    expect(custom).toBeDefined()
    expect(custom!.isDefault).toBeUndefined()
  })

  test("addMealCategory generates id from label", () => {
    addMealCategory("Post Workout")
    const cats = readAllMealCategories()
    const custom = cats.find((c) => c.label === "Post Workout")
    expect(custom!.id).toMatch(/^post_workout_\d+$/)
  })

  test("addMealCategory assigns a color from CUSTOM_CATEGORY_COLORS", () => {
    addMealCategory("Smoothie")
    const cats = readAllMealCategories()
    const custom = cats.find((c) => c.label === "Smoothie")
    const validColors = CUSTOM_CATEGORY_COLORS.map((c) => c.color)
    expect(validColors).toContain(custom!.color)
  })

  test("removeMealCategory removes the correct category", () => {
    addMealCategory("Test Meal")
    let cats = readAllMealCategories()
    const custom = cats.find((c) => c.label === "Test Meal")!

    removeMealCategory(custom.id)

    cats = readAllMealCategories()
    expect(cats.find((c) => c.id === custom.id)).toBeUndefined()
  })

  test("removeMealCategory does not remove default categories", () => {
    removeMealCategory("breakfast")
    const cats = readAllMealCategories()
    // Default categories are not stored in localStorage so they still appear
    expect(cats.find((c) => c.id === "breakfast")).toBeDefined()
  })

  test("multiple custom categories cycle through colors", () => {
    const numColors = CUSTOM_CATEGORY_COLORS.length
    for (let i = 0; i < numColors + 1; i++) {
      addMealCategory(`Meal ${i}`)
    }
    const cats = readAllMealCategories()
    const customCats = cats.filter((c) => !c.isDefault)
    // Color at index numColors should wrap around to index 0
    expect(customCats[numColors].color).toBe(CUSTOM_CATEGORY_COLORS[0].color)
  })
})

describe("mergeCustomMealCategories", () => {
  const local = {
    id: "pre_workout_1",
    label: "Pre-workout",
    color: "c1",
    bg: "b1",
  }
  const server = {
    id: "second_dinner_2",
    label: "Second dinner",
    color: "c2",
    bg: "b2",
  }

  test("server categories come first and local-only ones are kept", () => {
    const { merged, needsPush } = mergeCustomMealCategories([local], [server])
    expect(merged.map((c) => c.id)).toEqual([
      "second_dinner_2",
      "pre_workout_1",
    ])
    // The local-only category is not on the server yet, so it must be pushed.
    expect(needsPush).toBe(true)
  })

  test("no push is needed once the server already has everything", () => {
    const { merged, needsPush } = mergeCustomMealCategories([server], [server])
    expect(merged).toEqual([server])
    expect(needsPush).toBe(false)
  })

  test("a category present on both sides is not duplicated", () => {
    const { merged } = mergeCustomMealCategories([server, local], [server])
    expect(merged).toHaveLength(2)
  })

  test("the server copy wins on label conflicts for the same id", () => {
    const renamedLocally = { ...server, label: "Stale local name" }
    const { merged } = mergeCustomMealCategories([renamedLocally], [server])
    expect(merged[0].label).toBe("Second dinner")
  })

  test("missing or malformed inputs do not throw", () => {
    expect(mergeCustomMealCategories([], undefined).merged).toEqual([])
    expect(mergeCustomMealCategories([], null).needsPush).toBe(false)
    expect(
      mergeCustomMealCategories(undefined as never, undefined).merged
    ).toEqual([])
  })

  test("entries without an id are dropped rather than crashing", () => {
    const { merged } = mergeCustomMealCategories(
      [{ id: "", label: "broken", color: "", bg: "" }, local],
      []
    )
    expect(merged).toEqual([local])
  })
})

// ── Named servings ────────────────────────────────────────────────────────────

describe("named food servings", () => {
  test("a serving the units can already spell is not named", () => {
    expect(
      isNamedFoodServing("100 g", defaultFoodPortion("100 g", "apple"))
    ).toBe(false)
    expect(
      isNamedFoodServing("100g", defaultFoodPortion("100 g", "apple"))
    ).toBe(false)
    expect(isNamedFoodServing("", defaultFoodPortion("", "apple"))).toBe(false)
    expect(isNamedFoodServing(null, defaultFoodPortion("", "apple"))).toBe(
      false
    )
  })

  test("a serving in the food's own words is named", () => {
    expect(
      isNamedFoodServing("8 ONZ", defaultFoodPortion("8 ONZ", "apple", 242))
    ).toBe(true)
    expect(
      isNamedFoodServing(
        "1 cup, chopped",
        defaultFoodPortion("1 cup, chopped", "apple", 125)
      )
    ).toBe(true)
  })

  test("multiplier counts servings out of the selected grams", () => {
    expect(foodServingMultiplier(242, 242)).toBe(1)
    expect(foodServingMultiplier(484, 242)).toBe(2)
    expect(foodServingMultiplier(121, 242)).toBe(0.5)
    expect(foodServingMultiplier(0, 242)).toBe(0)
  })

  test("multiplier survives a serving with no weight", () => {
    expect(foodServingMultiplier(242, 0)).toBe(1)
    expect(foodServingMultiplier(242, Number.NaN)).toBe(1)
  })

  test("a single serving reads as itself, more of it multiplies", () => {
    expect(foodServingLabel(1, "8 ONZ")).toBe("8 ONZ")
    expect(foodServingLabel(2, "8 ONZ")).toBe("2 × 8 ONZ")
    expect(foodServingLabel(0.5, "8 ONZ")).toBe("0.5 × 8 ONZ")
  })

  test("stepping snaps to whole servings and floors at a half", () => {
    expect(stepFoodServingMultiplier(1, 1)).toBe(2)
    expect(stepFoodServingMultiplier(2, 1)).toBe(3)
    expect(stepFoodServingMultiplier(1.6, 1)).toBe(2)
    expect(stepFoodServingMultiplier(0.5, 1)).toBe(1)
    expect(stepFoodServingMultiplier(3, -1)).toBe(2)
    expect(stepFoodServingMultiplier(1.6, -1)).toBe(1)
    expect(stepFoodServingMultiplier(1, -1)).toBe(0.5)
    expect(stepFoodServingMultiplier(0.5, -1)).toBe(0.5)
  })
})
