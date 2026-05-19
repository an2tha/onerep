import { describe, test, expect } from "bun:test";
import {
  foodSchema,
  exerciseSchema,
  searchQuerySchema,
  barcodeSchema,
  idParamSchema,
  numericIdParamSchema,
  idsQuerySchema,
  parseValidatedBody,
} from "../validation";

// ── foodSchema ────────────────────────────────────────────────────────────────

describe("foodSchema", () => {
  const validFood = {
    product_name: "Apple",
    energy_kcal_100g: 52,
    proteins_100g: 0.3,
    carbohydrates_100g: 14,
    fat_100g: 0.2,
  };

  test("accepts a minimal valid food object", () => {
    expect(() => foodSchema.parse({ product_name: "Apple" })).not.toThrow();
  });

  test("accepts a full valid food object", () => {
    const full = {
      ...validFood,
      code: "1234567890",
      brands: "Organic Farms",
      categories: "Fruits",
      ingredients_text: "Apple",
      nutriscore_grade: "a" as const,
      nutriscore_score: -1,
      fiber_100g: 2.4,
      salt_100g: 0.01,
      sugars_100g: 10,
      sodium_100g: 0.004,
      saturated_fat_100g: 0.05,
    };
    expect(() => foodSchema.parse(full)).not.toThrow();
  });

  test("rejects missing product_name", () => {
    expect(() => foodSchema.parse({})).toThrow();
  });

  test("rejects empty product_name", () => {
    expect(() => foodSchema.parse({ product_name: "" })).toThrow();
  });

  test("accepts all valid nutriscore_grade values", () => {
    const grades = ["a", "b", "c", "d", "e"] as const;
    for (const grade of grades) {
      expect(() =>
        foodSchema.parse({ product_name: "Test", nutriscore_grade: grade }),
      ).not.toThrow();
    }
  });

  test("rejects invalid nutriscore_grade", () => {
    expect(() =>
      foodSchema.parse({ product_name: "Test", nutriscore_grade: "f" }),
    ).toThrow();
  });

  test("rejects nutriscore_score below -15", () => {
    expect(() =>
      foodSchema.parse({ product_name: "Test", nutriscore_score: -16 }),
    ).toThrow();
  });

  test("rejects nutriscore_score above 40", () => {
    expect(() =>
      foodSchema.parse({ product_name: "Test", nutriscore_score: 41 }),
    ).toThrow();
  });

  test("accepts nutriscore_score at boundaries (-15, 40)", () => {
    expect(() =>
      foodSchema.parse({ product_name: "Test", nutriscore_score: -15 }),
    ).not.toThrow();
    expect(() =>
      foodSchema.parse({ product_name: "Test", nutriscore_score: 40 }),
    ).not.toThrow();
  });

  test("optional fields can be omitted", () => {
    const result = foodSchema.safeParse({ product_name: "Test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBeUndefined();
      expect(result.data.brands).toBeUndefined();
    }
  });
});

// ── exerciseSchema ─────────────────────────────────────────────────────────────

describe("exerciseSchema", () => {
  test("accepts minimal valid exercise", () => {
    expect(() => exerciseSchema.parse({ name: "Squat" })).not.toThrow();
  });

  test("accepts full exercise object", () => {
    const full = {
      name: "Barbell Squat",
      primaryMuscles: ["Quadriceps", "Glutes"],
      secondaryMuscles: ["Hamstrings", "Core"],
      equipment: "Barbell",
      category: "Strength",
      force: "Push",
      level: "Intermediate",
      instructions: ["Stand with feet shoulder-width apart", "Squat down"],
      description: "Classic compound lower body movement",
    };
    expect(() => exerciseSchema.parse(full)).not.toThrow();
  });

  test("rejects missing name", () => {
    expect(() => exerciseSchema.parse({})).toThrow();
  });

  test("rejects empty name", () => {
    expect(() => exerciseSchema.parse({ name: "" })).toThrow();
  });

  test("primaryMuscles must be an array of strings", () => {
    expect(() =>
      exerciseSchema.parse({ name: "Squat", primaryMuscles: "Quads" }),
    ).toThrow();
  });

  test("accepts empty muscle arrays", () => {
    expect(() =>
      exerciseSchema.parse({
        name: "Squat",
        primaryMuscles: [],
        secondaryMuscles: [],
      }),
    ).not.toThrow();
  });

  test("optional string fields can be omitted", () => {
    const result = exerciseSchema.safeParse({ name: "Test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.equipment).toBeUndefined();
      expect(result.data.category).toBeUndefined();
    }
  });
});

// ── searchQuerySchema ─────────────────────────────────────────────────────────

describe("searchQuerySchema", () => {
  test("accepts empty search query", () => {
    expect(() => searchQuerySchema.parse({})).not.toThrow();
  });

  test("accepts all optional filters", () => {
    const query = {
      q: "chicken",
      grade: "b" as const,
      min_score: -5,
      max_score: 20,
      muscle: "chest",
      equipment: "barbell",
      category: "strength",
      force: "push",
    };
    expect(() => searchQuerySchema.parse(query)).not.toThrow();
  });

  test("accepts valid grade values", () => {
    const grades = ["a", "b", "c", "d", "e"] as const;
    for (const grade of grades) {
      expect(() => searchQuerySchema.parse({ grade })).not.toThrow();
    }
  });

  test("rejects invalid grade", () => {
    expect(() => searchQuerySchema.parse({ grade: "z" })).toThrow();
  });

  test("coerces min_score from string to number", () => {
    const result = searchQuerySchema.safeParse({ min_score: "5" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.min_score).toBe(5);
    }
  });

  test("rejects min_score below -15", () => {
    expect(() => searchQuerySchema.parse({ min_score: -20 })).toThrow();
  });

  test("rejects max_score above 40", () => {
    expect(() => searchQuerySchema.parse({ max_score: 50 })).toThrow();
  });

  test("accepts score at boundaries", () => {
    expect(() =>
      searchQuerySchema.parse({ min_score: -15, max_score: 40 }),
    ).not.toThrow();
  });

  test("coerces limit and respects boundaries", () => {
    const result = searchQuerySchema.parse({ limit: "10" });
    expect(result.limit).toBe(10);
    expect(() => searchQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() => searchQuerySchema.parse({ limit: 101 })).toThrow();
    expect(searchQuerySchema.parse({ limit: 100 }).limit).toBe(100);
  });

  test("has default limit of 25", () => {
    const result = searchQuerySchema.parse({});
    expect(result.limit).toBe(25);
  });

  test("has default empty string for q", () => {
    const result = searchQuerySchema.parse({});
    expect(result.q).toBe("");
  });
});

// ── idsQuerySchema ────────────────────────────────────────────────────────────

describe("idsQuerySchema", () => {
  test("transforms comma-separated string into trimmed array", () => {
    const result = idsQuerySchema.parse({ ids: " e1, e2 ,e3 " });
    expect(result.ids).toEqual(["e1", "e2", "e3"]);
  });

  test("filters out empty entries", () => {
    const result = idsQuerySchema.parse({ ids: "e1,,e2," });
    expect(result.ids).toEqual(["e1", "e2"]);
  });

  test("caps array at 100 entries", () => {
    const longList = Array.from({ length: 110 }, (_, i) => `e${i}`).join(",");
    const result = idsQuerySchema.parse({ ids: longList });
    expect(result.ids.length).toBe(100);
    expect(result.ids[0]).toBe("e0");
    expect(result.ids[99]).toBe("e99");
  });

  test("rejects empty string or missing field", () => {
    expect(() => idsQuerySchema.parse({ ids: "" })).toThrow();
    expect(() => idsQuerySchema.parse({})).toThrow();
  });
});

// ── barcodeSchema ─────────────────────────────────────────────────────────────

describe("barcodeSchema", () => {
  test("accepts valid numeric barcode", () => {
    expect(() => barcodeSchema.parse({ code: "1234567890123" })).not.toThrow();
  });

  test("accepts single digit barcode", () => {
    expect(() => barcodeSchema.parse({ code: "0" })).not.toThrow();
  });

  test("rejects alphabetic barcode", () => {
    expect(() => barcodeSchema.parse({ code: "ABC123" })).toThrow();
  });

  test("rejects barcode with hyphens", () => {
    expect(() => barcodeSchema.parse({ code: "123-456" })).toThrow();
  });

  test("rejects barcode with spaces", () => {
    expect(() => barcodeSchema.parse({ code: "123 456" })).toThrow();
  });

  test("rejects empty barcode", () => {
    expect(() => barcodeSchema.parse({ code: "" })).toThrow();
  });

  test("rejects missing code field", () => {
    expect(() => barcodeSchema.parse({})).toThrow();
  });
});

// ── parseValidatedBody ────────────────────────────────────────────────────────

describe("parseValidatedBody", () => {
  test("returns data on success", () => {
    const result = parseValidatedBody(barcodeSchema, { code: "123456" });
    expect(result.data).toEqual({ code: "123456" });
    expect(result.error).toBeUndefined();
  });

  test("returns error on failure", () => {
    const result = parseValidatedBody(barcodeSchema, { code: "invalid!" });
    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  test("returned ZodError has issues array", () => {
    const result = parseValidatedBody(barcodeSchema, {});
    expect(result.error).toBeDefined();
    if (result.error) {
      expect(Array.isArray(result.error.issues)).toBe(true);
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  test("works with foodSchema", () => {
    const result = parseValidatedBody(foodSchema, { product_name: "Egg" });
    expect(result.data).toBeDefined();
    expect(result.data?.product_name).toBe("Egg");
  });

  test("works with exerciseSchema on invalid data", () => {
    const result = parseValidatedBody(exerciseSchema, { name: "" });
    expect(result.error).toBeDefined();
  });
});

describe("idParamSchema", () => {
  test("accepts valid string ID", () => {
    const validId = "e1";
    const result = idParamSchema.safeParse({ id: validId });
    expect(result.success).toBe(true);
  });

  test("rejects empty ID", () => {
    const result = idParamSchema.safeParse({ id: "" });
    expect(result.success).toBe(false);
  });
});

describe("numericIdParamSchema", () => {
  test("accepts valid positive integer", () => {
    expect(numericIdParamSchema.safeParse({ id: "123" }).success).toBe(true);
    expect(numericIdParamSchema.safeParse({ id: 123 }).success).toBe(true);
  });

  test("rejects non-numeric string", () => {
    expect(numericIdParamSchema.safeParse({ id: "abc" }).success).toBe(false);
  });

  test("rejects non-integer", () => {
    expect(numericIdParamSchema.safeParse({ id: "1.2" }).success).toBe(false);
  });

  test("rejects non-positive integer", () => {
    expect(numericIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
    expect(numericIdParamSchema.safeParse({ id: "-1" }).success).toBe(false);
  });
});
