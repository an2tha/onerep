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
        trendMetric: v.optional(v.string()), // bodyFatPct | waistCm | chestCm | armsCm | thighsCm
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
    foodSearchLanguage: v.optional(v.string()), // Open Food Facts language code, e.g. "en"
    waterGoalMl: v.optional(v.number()),
    customGoals: v.optional(
      v.object({
        calories: v.optional(v.number()),
        protein: v.optional(v.number()),
        carbs: v.optional(v.number()),
        fat: v.optional(v.number()),
      }),
    ),
    macroCyclingEnabled: v.optional(v.boolean()),
    macroCyclingTargets: v.optional(
      v.object({
        restDay: v.object({
          calories: v.number(),
          protein: v.number(),
          carbs: v.number(),
          fat: v.number(),
        }),
        trainingDay: v.object({
          calories: v.number(),
          protein: v.number(),
          carbs: v.number(),
          fat: v.number(),
        }),
      }),
    ),
    workoutAdjustmentEnabled: v.optional(v.boolean()),
    pushReminders: v.optional(
      v.object({
        water: v.object({
          enabled: v.boolean(),
          hour: v.number(),
          minute: v.number(),
        }),
        meal: v.object({
          enabled: v.boolean(),
          hour: v.number(),
          minute: v.number(),
        }),
        workout: v.object({
          enabled: v.boolean(),
          hour: v.number(),
          minute: v.number(),
        }),
        body: v.object({
          enabled: v.boolean(),
          hour: v.number(),
          minute: v.number(),
        }),
        supplement: v.optional(
          v.object({
            enabled: v.boolean(),
            hour: v.number(),
            minute: v.number(),
          }),
        ),
      }),
    ),
    privacySettings: v.optional(
      v.object({
        analyticsEnabled: v.boolean(),
        personalizedInsightsEnabled: v.boolean(),
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
        displayAmount: v.optional(v.number()),
        displayUnit: v.optional(v.string()),
        servingLabel: v.optional(v.string()),
        caloriesPer100: v.number(),
        proteinPer100: v.number(),
        carbsPer100: v.number(),
        fatPer100: v.number(),
        fiberPer100: v.optional(v.number()),
        sugarPer100: v.optional(v.number()),
        saturatedFatPer100: v.optional(v.number()),
        transFatPer100: v.optional(v.number()),
        cholesterolPer100: v.optional(v.number()),
        sodiumPer100: v.optional(v.number()),
        potassiumPer100: v.optional(v.number()),
        calciumPer100: v.optional(v.number()),
        ironPer100: v.optional(v.number()),
        magnesiumPer100: v.optional(v.number()),
        phosphorusPer100: v.optional(v.number()),
        zincPer100: v.optional(v.number()),
        vitaminCPer100: v.optional(v.number()),
        vitaminAPer100: v.optional(v.number()),
        vitaminDPer100: v.optional(v.number()),
        vitaminB12Per100: v.optional(v.number()),
        caffeinePer100: v.optional(v.number()),
        alcoholPer100: v.optional(v.number()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // ── Meal presets (quick-log templates from repeated food logs) ────────────
  mealPresets: defineTable({
    userId: v.string(),
    name: v.string(),
    meal: v.string(),
    signature: v.string(),
    entries: v.array(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_meal_and_signature", ["userId", "meal", "signature"]),

  // ── Onboarding profile (lightweight initial setup) ─────────────────────────
  onboardingProfiles: defineTable({
    userId: v.string(),
    age: v.number(),
    heightCm: v.number(),
    goal: v.string(), // "lose" | "build" | "health" | "performance"
    experienceLevel: v.optional(v.string()), // "beginner" | "intermediate" | "advanced"
    nutritionGoal: v.optional(v.string()), // "maintain" | "lose_fat" | "gain_muscle" | "performance" | "macros_only" | "medical"
    consent: v.optional(
      v.object({
        dataUse: v.boolean(),
        weightData: v.boolean(),
        foodLogging: v.boolean(),
        wearableIntegrations: v.boolean(),
      }),
    ),
    safetyFlags: v.optional(v.array(v.string())),
    safetyMode: v.optional(v.string()), // "standard" | "habit" | "clinician" | "recovery"
    weightTrend: v.optional(v.string()), // "losing" | "stable" | "gaining" | "unknown"
    occupationActivity: v.optional(v.string()), // "desk" | "mixed" | "on_feet" | "manual"
    dietType: v.optional(v.string()),
    allergies: v.optional(v.array(v.string())),
    cookingSkill: v.optional(v.string()),
    budget: v.optional(v.string()),
    mealFrequency: v.optional(v.number()),
    trackingMode: v.optional(v.string()),
    loggingFeatures: v.optional(v.array(v.string())),
    firstNutritionAction: v.optional(v.string()),
    shownTooltips: v.optional(v.array(v.number())),
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

  // ── Completed workout logs (up to one per session; legacy rows lack sessionId) ──
  workoutLogs: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD
    // Added as a widening migration so existing daily logs remain valid.
    sessionId: v.optional(v.string()),
    slot: v.optional(v.union(v.literal(1), v.literal(2))),
    exercises: v.array(v.any()),
    durationSeconds: v.number(),
    completedAt: v.number(),
  })
    .index("by_userId_date", ["userId", "date"])
    .index("by_userId_and_date_and_sessionId", ["userId", "date", "sessionId"]),

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

  // ── Supplement logs (one doc per user+date) ───────────────────────────────
  supplementLogs: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD
    entries: v.array(v.any()), // SupplementLogEntry[]
    updatedAt: v.number(),
  }).index("by_userId_date", ["userId", "date"]),

  // ── Supplement catalog (reusable user-owned supplement items) ─────────────
  supplementItems: defineTable({
    userId: v.string(),
    name: v.string(),
    brand: v.optional(v.string()),
    category: v.union(
      v.literal("protein"),
      v.literal("creatine"),
      v.literal("multivitamin"),
      v.literal("vitamin_mineral"),
      v.literal("electrolyte"),
      v.literal("caffeine_pre_workout"),
      v.literal("omega_3"),
      v.literal("fiber"),
      v.literal("other"),
    ),
    form: v.union(
      v.literal("capsule"),
      v.literal("tablet"),
      v.literal("powder"),
      v.literal("liquid"),
      v.literal("gummy"),
      v.literal("softgel"),
      v.literal("other"),
    ),
    servingLabel: v.string(),
    defaultServingQuantity: v.number(),
    barcode: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.boolean(),
    schedule: v.object({
      type: v.union(
        v.literal("none"),
        v.literal("daily"),
        v.literal("weekdays"),
        v.literal("training_days"),
        v.literal("rest_days"),
      ),
      weekdays: v.optional(v.array(v.number())), // 0 Sun through 6 Sat
      preferredTime: v.optional(v.string()), // HH:mm
    }),
    nutrientsPerServing: v.object({
      calories: v.optional(v.number()),
      protein: v.optional(v.number()),
      carbs: v.optional(v.number()),
      fat: v.optional(v.number()),
      fiber: v.optional(v.number()),
      sugar: v.optional(v.number()),
      saturatedFat: v.optional(v.number()),
      transFat: v.optional(v.number()),
      cholesterol: v.optional(v.number()),
      sodium: v.optional(v.number()),
      potassium: v.optional(v.number()),
      calcium: v.optional(v.number()),
      iron: v.optional(v.number()),
      magnesium: v.optional(v.number()),
      phosphorus: v.optional(v.number()),
      zinc: v.optional(v.number()),
      vitaminA: v.optional(v.number()),
      vitaminC: v.optional(v.number()),
      vitaminD: v.optional(v.number()),
      vitaminB12: v.optional(v.number()),
      caffeine: v.optional(v.number()),
      alcohol: v.optional(v.number()),
      creatine: v.optional(v.number()),
      omega3: v.optional(v.number()),
      epa: v.optional(v.number()),
      dha: v.optional(v.number()),
    }),
    source: v.union(v.literal("manual"), v.literal("openfoodfacts")),
    importedOpenFoodFacts: v.optional(v.any()),
    legacyKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_active", ["userId", "active"])
    .index("by_userId_and_barcode", ["userId", "barcode"])
    .index("by_userId_and_legacyKey", ["userId", "legacyKey"]),

  // ── Supplement intake events (one row per taken/skipped event) ────────────
  supplementIntakeLogs: defineTable({
    userId: v.string(),
    supplementId: v.id("supplementItems"),
    clientId: v.optional(v.string()),
    date: v.string(), // YYYY-MM-DD
    status: v.union(v.literal("taken"), v.literal("skipped")),
    loggedAt: v.string(),
    servingMultiplier: v.number(),
    servingLabel: v.string(),
    name: v.string(),
    brand: v.optional(v.string()),
    category: v.union(
      v.literal("protein"),
      v.literal("creatine"),
      v.literal("multivitamin"),
      v.literal("vitamin_mineral"),
      v.literal("electrolyte"),
      v.literal("caffeine_pre_workout"),
      v.literal("omega_3"),
      v.literal("fiber"),
      v.literal("other"),
    ),
    nutrients: v.object({
      calories: v.optional(v.number()),
      protein: v.optional(v.number()),
      carbs: v.optional(v.number()),
      fat: v.optional(v.number()),
      fiber: v.optional(v.number()),
      sugar: v.optional(v.number()),
      saturatedFat: v.optional(v.number()),
      transFat: v.optional(v.number()),
      cholesterol: v.optional(v.number()),
      sodium: v.optional(v.number()),
      potassium: v.optional(v.number()),
      calcium: v.optional(v.number()),
      iron: v.optional(v.number()),
      magnesium: v.optional(v.number()),
      phosphorus: v.optional(v.number()),
      zinc: v.optional(v.number()),
      vitaminA: v.optional(v.number()),
      vitaminC: v.optional(v.number()),
      vitaminD: v.optional(v.number()),
      vitaminB12: v.optional(v.number()),
      caffeine: v.optional(v.number()),
      alcohol: v.optional(v.number()),
      creatine: v.optional(v.number()),
      omega3: v.optional(v.number()),
      epa: v.optional(v.number()),
      dha: v.optional(v.number()),
    }),
    note: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_date_and_supplementId", [
      "userId",
      "date",
      "supplementId",
    ])
    .index("by_userId_and_supplementId_and_date", [
      "userId",
      "supplementId",
      "date",
    ]),

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
    photoStorageId: v.optional(v.id("_storage")),
    photoDataUrl: v.optional(v.string()), // legacy base64 image; new photos use storage
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
    userId: v.optional(v.string()), // "__global__" for bundled catalog
    exerciseId: v.string(), // original dataset id or client UUID
    name: v.string(),
    category: v.string(), // "strength" | "cardio" | "mobility" | "core"
    level: v.string(), // "beginner" | "intermediate" | "expert"
    mechanic: v.optional(v.string()), // "isolation" | "compound"
    equipment: v.optional(v.string()),
    force: v.optional(v.string()), // "push" | "pull" | "static"
    primaryMuscles: v.array(v.string()),
    secondaryMuscles: v.array(v.string()),
    instructions: v.array(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_category", ["userId", "category"])
    .index("by_userId_and_exerciseId", ["userId", "exerciseId"])
    .index("by_exerciseId", ["exerciseId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["userId", "category"],
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

  // ── AI usage quotas ──────────────────────────────────────────────────────
  aiUsage: defineTable({
    userId: v.string(),
    month: v.string(), // YYYY-MM UTC month key
    count: v.number(),
    lastSource: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_userId_month", ["userId", "month"]),

  // ── Food photo analysis quota ─────────────────────────────────────────────
  snapUsage: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD UTC
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_userId_date", ["userId", "date"]),

  // ── Subscription status (server-owned RevenueCat cache) ──────────────────
  subscriptionStates: defineTable({
    userId: v.string(),
    appUserId: v.string(),
    entitlementId: v.string(),
    isActive: v.boolean(),
    hasActiveSubscription: v.boolean(),
    activeSubscriptions: v.array(v.string()),
    managementUrl: v.union(v.string(), v.null()),
    productIdentifier: v.union(v.string(), v.null()),
    store: v.union(v.string(), v.null()),
    expiresAt: v.union(v.string(), v.null()),
    rawCustomerInfo: v.optional(v.any()),
    source: v.union(
      v.literal("revenuecat_api"),
      v.literal("revenuecat_webhook"),
      v.literal("manual"),
    ),
    fetchedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // ── Active workout (persisted during workout to prevent data loss on mobile) ──
  activeWorkouts: defineTable({
    userId: v.string(),
    slot: v.union(v.literal(1), v.literal(2)),
    presetId: v.optional(v.string()),
    items: v.array(v.any()), // WorkoutItem[]
    exerciseData: v.any(), // Record<string, ExerciseState>
    startedAt: v.number(), // timestamp when workout started
    elapsedSeconds: v.number(), // current elapsed time
    completedAt: v.optional(v.number()), // when finished
  })
    .index("by_userId_slot", ["userId", "slot"])
    .index("by_userId", ["userId"]),
});
