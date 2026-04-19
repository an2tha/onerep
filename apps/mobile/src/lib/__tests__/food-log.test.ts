import { describe, test, expect, beforeEach } from "bun:test";
import {
  DEFAULT_MEAL_CATEGORIES,
  CUSTOM_CATEGORY_COLORS,
  defaultMeal,
  dateForOffset,
  offsetDateKey,
  currentDateKey,
  detectTimeZone,
  readAllMealCategories,
  addMealCategory,
  removeMealCategory,
} from "../food-log";

// ── DEFAULT_MEAL_CATEGORIES ───────────────────────────────────────────────────

describe("DEFAULT_MEAL_CATEGORIES", () => {
  test("has 4 default categories", () => {
    expect(DEFAULT_MEAL_CATEGORIES).toHaveLength(4);
  });

  test("contains breakfast, lunch, dinner, snack", () => {
    const ids = DEFAULT_MEAL_CATEGORIES.map((c) => c.id);
    expect(ids).toContain("breakfast");
    expect(ids).toContain("lunch");
    expect(ids).toContain("dinner");
    expect(ids).toContain("snack");
  });

  test("all default categories have isDefault: true", () => {
    for (const cat of DEFAULT_MEAL_CATEGORIES) {
      expect(cat.isDefault).toBe(true);
    }
  });

  test("all categories have id, label, color, bg", () => {
    for (const cat of DEFAULT_MEAL_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.color).toBeTruthy();
      expect(cat.bg).toBeTruthy();
    }
  });
});

// ── CUSTOM_CATEGORY_COLORS ────────────────────────────────────────────────────

describe("CUSTOM_CATEGORY_COLORS", () => {
  test("has multiple color options", () => {
    expect(CUSTOM_CATEGORY_COLORS.length).toBeGreaterThan(0);
  });

  test("each entry has color and bg", () => {
    for (const entry of CUSTOM_CATEGORY_COLORS) {
      expect(entry.color).toBeTruthy();
      expect(entry.bg).toBeTruthy();
    }
  });
});

// ── defaultMeal ───────────────────────────────────────────────────────────────

describe("defaultMeal", () => {
  test("returns a valid meal type string", () => {
    const meal = defaultMeal();
    const validMeals = ["breakfast", "lunch", "dinner", "snack"];
    expect(validMeals).toContain(meal);
  });
});

// ── detectTimeZone ────────────────────────────────────────────────────────────

describe("detectTimeZone", () => {
  test("returns a non-empty string", () => {
    const tz = detectTimeZone();
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
  });

  test("returns a valid IANA timezone identifier", () => {
    const tz = detectTimeZone();
    // Should not throw when used in Intl
    expect(() => new Intl.DateTimeFormat("en", { timeZone: tz })).not.toThrow();
  });
});

// ── offsetDateKey ─────────────────────────────────────────────────────────────

describe("offsetDateKey", () => {
  test("returns same date with offset 0", () => {
    expect(offsetDateKey("2024-01-15", 0)).toBe("2024-01-15");
  });

  test("adds 1 day correctly", () => {
    expect(offsetDateKey("2024-01-15", 1)).toBe("2024-01-16");
  });

  test("subtracts 1 day correctly", () => {
    expect(offsetDateKey("2024-01-15", -1)).toBe("2024-01-14");
  });

  test("handles month boundary forward", () => {
    expect(offsetDateKey("2024-01-31", 1)).toBe("2024-02-01");
  });

  test("handles month boundary backward", () => {
    expect(offsetDateKey("2024-02-01", -1)).toBe("2024-01-31");
  });

  test("handles year boundary forward", () => {
    expect(offsetDateKey("2024-12-31", 1)).toBe("2025-01-01");
  });

  test("handles year boundary backward", () => {
    expect(offsetDateKey("2025-01-01", -1)).toBe("2024-12-31");
  });

  test("handles leap year February", () => {
    expect(offsetDateKey("2024-02-28", 1)).toBe("2024-02-29"); // 2024 is a leap year
    expect(offsetDateKey("2024-02-29", 1)).toBe("2024-03-01");
  });

  test("handles large positive offset", () => {
    // 2024 is a leap year (366 days), so +365 from Jan 1 lands on Dec 31 2024
    expect(offsetDateKey("2024-01-01", 365)).toBe("2024-12-31");
    // +366 lands on Jan 1 2025
    expect(offsetDateKey("2024-01-01", 366)).toBe("2025-01-01");
  });

  test("returns string in YYYY-MM-DD format", () => {
    const result = offsetDateKey("2024-06-15", 3);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── dateForOffset ─────────────────────────────────────────────────────────────

describe("dateForOffset", () => {
  test("returns a string in YYYY-MM-DD format", () => {
    const result = dateForOffset(0, "UTC");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("tomorrow is 1 day ahead of today", () => {
    const today = dateForOffset(0, "UTC");
    const tomorrow = dateForOffset(1, "UTC");
    expect(offsetDateKey(today, 1)).toBe(tomorrow);
  });

  test("yesterday is 1 day behind today", () => {
    const today = dateForOffset(0, "UTC");
    const yesterday = dateForOffset(-1, "UTC");
    expect(offsetDateKey(today, -1)).toBe(yesterday);
  });
});

// ── currentDateKey ────────────────────────────────────────────────────────────

describe("currentDateKey", () => {
  test("returns a string in YYYY-MM-DD format", () => {
    const result = currentDateKey("UTC");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("equals dateForOffset(0)", () => {
    const result = currentDateKey("UTC");
    const expected = dateForOffset(0, "UTC");
    expect(result).toBe(expected);
  });
});

// ── localStorage-dependent helpers (mock localStorage) ───────────────────────

describe("meal category localStorage helpers", () => {
  // Set up a simple localStorage mock
  const store: Record<string, string> = {};

  beforeEach(() => {
    // Clear the mock store before each test
    for (const key of Object.keys(store)) delete store[key];

    // Install mock
    (globalThis as any).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    };
  });

  test("readAllMealCategories includes default categories", () => {
    const cats = readAllMealCategories();
    const ids = cats.map((c) => c.id);
    expect(ids).toContain("breakfast");
    expect(ids).toContain("lunch");
    expect(ids).toContain("dinner");
    expect(ids).toContain("snack");
  });

  test("readAllMealCategories returns only defaults when no custom ones", () => {
    const cats = readAllMealCategories();
    expect(cats).toHaveLength(4);
  });

  test("addMealCategory adds a new category", () => {
    addMealCategory("Pre-Workout");
    const cats = readAllMealCategories();
    expect(cats.length).toBe(5);
    const custom = cats.find((c) => c.label === "Pre-Workout");
    expect(custom).toBeDefined();
    expect(custom!.isDefault).toBeUndefined();
  });

  test("addMealCategory generates id from label", () => {
    addMealCategory("Post Workout");
    const cats = readAllMealCategories();
    const custom = cats.find((c) => c.label === "Post Workout");
    expect(custom!.id).toMatch(/^post_workout_\d+$/);
  });

  test("addMealCategory assigns a color from CUSTOM_CATEGORY_COLORS", () => {
    addMealCategory("Smoothie");
    const cats = readAllMealCategories();
    const custom = cats.find((c) => c.label === "Smoothie");
    const validColors = CUSTOM_CATEGORY_COLORS.map((c) => c.color);
    expect(validColors).toContain(custom!.color);
  });

  test("removeMealCategory removes the correct category", () => {
    addMealCategory("Test Meal");
    let cats = readAllMealCategories();
    const custom = cats.find((c) => c.label === "Test Meal")!;

    removeMealCategory(custom.id);

    cats = readAllMealCategories();
    expect(cats.find((c) => c.id === custom.id)).toBeUndefined();
  });

  test("removeMealCategory does not remove default categories", () => {
    removeMealCategory("breakfast");
    const cats = readAllMealCategories();
    // Default categories are not stored in localStorage so they still appear
    expect(cats.find((c) => c.id === "breakfast")).toBeDefined();
  });

  test("multiple custom categories cycle through colors", () => {
    const numColors = CUSTOM_CATEGORY_COLORS.length;
    for (let i = 0; i < numColors + 1; i++) {
      addMealCategory(`Meal ${i}`);
    }
    const cats = readAllMealCategories();
    const customCats = cats.filter((c) => !c.isDefault);
    // Color at index numColors should wrap around to index 0
    expect(customCats[numColors].color).toBe(CUSTOM_CATEGORY_COLORS[0].color);
  });
});
