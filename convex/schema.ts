import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── User preferences (settings) ───────────────────────────────────────────
  userPreferences: defineTable({
    userId: v.string(),
    lastActiveTimezone: v.string(),
    bodyReminder: v.optional(
      v.object({
        enabled: v.boolean(),
        hour: v.number(),
        minute: v.number(),
      }),
    ),
    customMealCategories: v.optional(
      v.array(
        v.object({
          id: v.string(),
          label: v.string(),
          color: v.string(),
          bg: v.string(),
        }),
      ),
    ),
    dashboardSettings: v.optional(
      v.object({
        workoutFocus: v.string(), // "strength" | "cardio" | "mobility"
      }),
    ),
    widgetLayout: v.optional(
      v.array(
        v.object({
          id: v.string(), // WidgetId
          size: v.union(v.literal("full"), v.literal("small")),
        }),
      ),
    ),
    weightUnit: v.optional(v.string()), // "kg" | "lbs"
    waterGoalMl: v.optional(v.number()),
    customGoals: v.optional(
      v.object({
        calories: v.optional(v.number()),
        protein: v.optional(v.number()),
        carbs: v.optional(v.number()),
        fat: v.optional(v.number()),
      }),
    ),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // ── Recipes (saved food templates) ────────────────────────────────────────
  recipes: defineTable({
    userId: v.string(),
    name: v.string(),
    ingredients: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        grams: v.number(),
        caloriesPer100: v.number(),
        proteinPer100: v.number(),
        carbsPer100: v.number(),
        fatPer100: v.number(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // ── Onboarding profile (lightweight initial setup) ─────────────────────────
  onboardingProfiles: defineTable({
    userId: v.string(),
    age: v.number(),
    heightCm: v.number(),
    goal: v.string(), // "lose" | "build" | "health" | "performance"
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // ── Full health profile (detailed calorie calculation) ─────────────────────
  healthProfiles: defineTable({
    userId: v.string(),
    sex: v.string(), // "male" | "female"
    age: v.number(),
    weightKg: v.number(),
    heightCm: v.number(),
    activityLevel: v.string(), // "sedentary" | "lightly_active" | ...
    goal: v.string(), // "lose" | "maintain" | "gain"
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // ── Workout presets (templates) ────────────────────────────────────────────
  presets: defineTable({
    userId: v.string(),
    name: v.string(),
    items: v.array(v.any()),
    exerciseData: v.any(),
    focus: v.optional(v.string()),
    duration: v.optional(v.string()),
    steps: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // ── Weekly workout schedule ────────────────────────────────────────────────
  schedules: defineTable({
    userId: v.string(),
    routine: v.any(), // Record<Day, presetId | null>
    presetOrder: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // ── Completed workout logs (one per user+date) ─────────────────────────────
  workoutLogs: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD
    exercises: v.array(v.any()),
    durationSeconds: v.number(),
    completedAt: v.number(),
  }).index("by_userId_date", ["userId", "date"]),

  // ── Food logs (one doc per user+date, stores all entries) ─────────────────
  foodLogs: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD
    entries: v.array(v.any()),
    updatedAt: v.number(),
  }).index("by_userId_date", ["userId", "date"]),

  // ── Water logs (one doc per user+date) ────────────────────────────────────
  waterLogs: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD
    entries: v.array(v.any()), // WaterLogEntry[]
    updatedAt: v.number(),
  }).index("by_userId_date", ["userId", "date"]),

  // ── Body measurements (one record per check-in) ────────────────────────────
  bodyMeasurements: defineTable({
    userId: v.string(),
    clientId: v.string(), // client-generated UUID for idempotent upserts
    loggedAt: v.string(), // YYYY-MM-DD
    weightKg: v.optional(v.number()),
    bodyFatPct: v.optional(v.number()),
    waistCm: v.optional(v.number()),
    hipsCm: v.optional(v.number()),
    chestCm: v.optional(v.number()),
    armsCm: v.optional(v.number()),
    thighsCm: v.optional(v.number()),
    calvesCm: v.optional(v.number()),
    neckCm: v.optional(v.number()),
    notes: v.optional(v.string()),
    photoDataUrl: v.optional(v.string()), // base64-encoded image
    photoTakenAt: v.optional(v.number()), // timestamp when photo was taken
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_clientId", ["userId", "clientId"]),

  // ── Food facts (OpenFoodFacts catalog) ────────────────────────────────────
  foodfacts: defineTable({
    code: v.string(), // barcode / product id
    name: v.string(), // English name (denormalized for search)
    brand: v.optional(v.string()),
    serving: v.string(), // e.g. "100 g" or "1 bar (40g)"
    calories: v.number(), // kcal per serving
    protein: v.number(), // g per serving
    carbs: v.number(), // g per serving
    fat: v.number(), // g per serving
    popularityKey: v.optional(v.number()),
    servingGrams: v.optional(v.number()), // grams in one serving (for scaling)
    nutriscoreGrade: v.optional(v.string()),
    novaGroup: v.optional(v.number()),
    nutrients: v.array(
      v.object({
        // core nutrition label rows
        name: v.string(),
        value: v.string(),
        unit: v.string(),
      }),
    ),
    extraNutrients: v.array(
      v.object({
        // vitamins, minerals, etc.
        name: v.string(),
        value: v.string(),
        unit: v.string(),
      }),
    ),
  })
    .index("by_code", ["code"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["popularityKey"],
    }),

  // ── Exercise catalog ───────────────────────────────────────────────────────
  exercises: defineTable({
    userId: v.optional(v.string()),          // null for global catalog
    exerciseId: v.string(),                  // original dataset id or client UUID
    name: v.string(),
    category: v.string(),                    // "strength" | "cardio" | "mobility" | "core"
    level: v.string(),                       // "beginner" | "intermediate" | "expert"
    mechanic: v.optional(v.string()),        // "isolation" | "compound"
    equipment: v.optional(v.string()),
    force: v.optional(v.string()),           // "push" | "pull" | "static"
    primaryMuscles: v.array(v.string()),
    secondaryMuscles: v.array(v.string()),
    instructions: v.array(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_exerciseId", ["exerciseId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["category", "userId"],
    }),


  // ── Food detail cache (USDA per-food nutrient lookup) ────────────────────────
  foodDetailCache: defineTable({
    fdcId: v.string(),
    detail: v.any(), // FoodDetail shape
    createdAt: v.number(),
  }).index("by_fdcId", ["fdcId"]),

  // --- Search Cache
  searchCache: defineTable({
    query: v.string(),
    results: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        brand: v.optional(v.string()),
        serving: v.string(),
        calories: v.string(),
        protein: v.string(),
        carbs: v.string(),
        fat: v.string(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_query", ["query"])
    .searchIndex("search_results", {
      searchField: "results",
      filterFields: ["createdAt"],
    }),

  dailyCheckIns: defineTable({
    userId: v.string(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
});
