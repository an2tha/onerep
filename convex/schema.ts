import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { billingPlatform, billingState } from "./billing/types";
import { nutrientProfileValidator } from "./lib/nutritionValues";

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
        simpleMode: v.optional(v.boolean()),
      }),
    ),
    widgetLayout: v.optional(
      v.array(
        v.object({
          id: v.string(), // WidgetId
          size: v.union(v.literal("full"), v.literal("small")),
          hidden: v.optional(v.boolean()),
          pinned: v.optional(v.boolean()),
        }),
      ),
    ),
    weightUnit: v.optional(v.string()), // "kg" | "lbs"
    foodSearchLanguage: v.optional(v.string()), // Open Food Facts language code, e.g. "en"
    waterGoalMl: v.optional(v.number()),
    /** Display carbs as net (carbs − fiber) everywhere. Purely presentational. */
    netCarbsEnabled: v.optional(v.boolean()),
    customGoals: v.optional(
      v.object({
        calories: v.optional(v.number()),
        protein: v.optional(v.number()),
        carbs: v.optional(v.number()),
        fat: v.optional(v.number()),
      }),
    ),
    /**
     * Per-meal calorie budget as percentages of the day's effective calories.
     * Keyed by meal-category id, so an array rather than a fixed-key object.
     */
    mealCalorieTargets: v.optional(
      v.object({
        enabled: v.boolean(),
        shares: v.array(
          v.object({
            meal: v.string(),
            percent: v.number(),
            // Reserved for a future absolute per-meal override.
            calories: v.optional(v.number()),
          }),
        ),
        updatedAt: v.number(),
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
    healthSync: v.optional(
      v.object({
        appleHealthEnabled: v.boolean(),
        autoSyncOnForeground: v.boolean(),
        lastSyncedAt: v.optional(v.number()),
        /** Surfaced in Settings; a background sync must never toast. */
        lastSyncError: v.optional(v.string()),
      }),
    ),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // ── Recipes (saved food templates) ────────────────────────────────────────
  recipes: defineTable({
    userId: v.string(),
    name: v.string(),
    recipeType: v.optional(v.union(v.literal("quick"), v.literal("detailed"))),
    description: v.optional(v.string()),
    servings: v.optional(v.number()),
    prepMinutes: v.optional(v.number()),
    cookMinutes: v.optional(v.number()),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    placeholderImage: v.optional(v.string()),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
    photoUploadIds: v.optional(v.array(v.id("fileUploads"))),
    originCountry: v.optional(v.string()),
    isCommunityShared: v.optional(v.boolean()),
    communityAuthorName: v.optional(v.string()),
    sharedAt: v.optional(v.number()),
    communityAnonymous: v.optional(v.boolean()),
    ratingCount: v.optional(v.number()),
    ratingTotal: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    steps: v.optional(v.array(v.string())),
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
  })
    .index("by_userId", ["userId"])
    .index("by_communityShared", ["isCommunityShared"]),

  recipeCommunityShareEvents: defineTable({
    userId: v.string(),
    recipeId: v.id("recipes"),
    sharedAt: v.number(),
  }).index("by_userId_sharedAt", ["userId", "sharedAt"]),

  recipeReports: defineTable({
    reporterId: v.string(),
    recipeId: v.id("recipes"),
    reason: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("reviewed")),
    createdAt: v.number(),
  })
    .index("by_recipeId", ["recipeId"])
    .index("by_reporterId_recipeId", ["reporterId", "recipeId"]),

  recipeRatings: defineTable({
    userId: v.string(),
    recipeId: v.id("recipes"),
    rating: v.optional(v.number()),
    promptedAt: v.number(),
    ratedAt: v.optional(v.number()),
  })
    .index("by_recipeId", ["recipeId"])
    .index("by_userId_recipeId", ["userId", "recipeId"]),

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

  // ── Custom foods (user-authored food catalog, independent of any log) ─────
  customFoods: defineTable({
    userId: v.string(),
    name: v.string(),
    brand: v.optional(v.string()),
    servingLabel: v.string(), // e.g. "1 scoop", "100 g"
    servingGrams: v.optional(v.number()),
    barcode: v.optional(v.string()),
    notes: v.optional(v.string()),
    favorite: v.optional(v.boolean()),
    nutrientsPerServing: nutrientProfileValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_name", ["userId", "name"])
    .index("by_userId_and_barcode", ["userId", "barcode"]),

  // ── Meal prep batches (cook once, log servings across the week) ───────────
  mealPrepBatches: defineTable({
    userId: v.string(),
    name: v.string(),
    meal: v.optional(v.string()), // default meal slot when logging a serving
    notes: v.optional(v.string()),
    preppedOn: v.string(), // YYYY-MM-DD
    useByOn: v.optional(v.string()), // YYYY-MM-DD
    storage: v.optional(
      v.union(v.literal("fridge"), v.literal("freezer"), v.literal("pantry")),
    ),
    servingsTotal: v.number(),
    servingsLogged: v.number(),
    nutrientsPerServing: nutrientProfileValidator,
    sourceRecipeId: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_preppedOn", ["userId", "preppedOn"]),

  // ── Intermittent fasting ───────────────────────────────────────────────────
  fastingSessions: defineTable({
    userId: v.string(),
    startedAt: v.number(), // epoch ms
    endedAt: v.optional(v.number()), // absent => the fast is still running
    targetMinutes: v.number(),
    protocol: v.string(), // "16:8" | "18:6" | "20:4" | "omad" | "custom"
    startDate: v.string(), // local YYYY-MM-DD, for calendar grouping
    endDate: v.optional(v.string()),
    note: v.optional(v.string()),
    endedEarly: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_startedAt", ["userId", "startedAt"])
    // Lets the active-fast lookup be a single indexed read on endedAt === undefined.
    .index("by_userId_endedAt", ["userId", "endedAt"]),

  // ── Grocery lists ──────────────────────────────────────────────────────────
  groceryLists: defineTable({
    userId: v.string(),
    name: v.string(),
    sourceRecipeIds: v.optional(v.array(v.string())),
    sourceBatchIds: v.optional(v.array(v.string())),
    // Embedded like foodLogs.entries: a list is always read whole, and a
    // checkbox toggle stays a single patch.
    items: v.array(
      v.object({
        id: v.string(), // client-generated, retry-safe
        name: v.string(),
        key: v.string(), // normalized merge key
        grams: v.optional(v.number()),
        displayAmount: v.optional(v.number()),
        displayUnit: v.optional(v.string()),
        category: v.optional(v.string()), // aisle
        checked: v.boolean(),
        manual: v.optional(v.boolean()),
        sources: v.optional(v.array(v.string())),
      }),
    ),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_updatedAt", ["userId", "updatedAt"]),

  // ── Diary sharing ──────────────────────────────────────────────────────────
  diaryShares: defineTable({
    ownerUserId: v.string(),
    ownerEmail: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    inviteeEmail: v.string(), // lowercased + trimmed at write time
    inviteeUserId: v.optional(v.string()), // filled in on accept
    inviteeName: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
      v.literal("declined"),
    ),
    scope: v.object({
      diary: v.boolean(),
      report: v.boolean(),
      comments: v.boolean(),
    }),
    startDate: v.optional(v.string()), // absent = unbounded
    endDate: v.optional(v.string()),
    token: v.string(), // opaque invite token
    invitedAt: v.number(),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_inviteeEmail_and_status", ["inviteeEmail", "status"])
    .index("by_inviteeUserId_and_status", ["inviteeUserId", "status"])
    .index("by_token", ["token"]),

  diaryComments: defineTable({
    ownerUserId: v.string(),
    // Optional so the diary owner can reply without granting themselves a share.
    shareId: v.optional(v.id("diaryShares")),
    authorUserId: v.string(),
    authorName: v.optional(v.string()),
    authorRole: v.union(v.literal("owner"), v.literal("viewer")),
    date: v.string(), // YYYY-MM-DD
    entryId: v.optional(v.string()), // set when commenting on one food entry
    body: v.string(),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_ownerUserId_and_date", ["ownerUserId", "date"])
    .index("by_ownerUserId_and_createdAt", ["ownerUserId", "createdAt"])
    .index("by_authorUserId", ["authorUserId"]),

  diaryCommentReads: defineTable({
    userId: v.string(),
    ownerUserId: v.string(),
    lastReadAt: v.number(),
  }).index("by_userId_and_ownerUserId", ["userId", "ownerUserId"]),

  // ── Guided walkthrough progress ────────────────────────────────────────────
  // One row per (user, chapter). Kept off onboardingProfiles deliberately: the
  // walkthrough must work for users who have no profile row yet, and per-chapter
  // rows keep two chapters from contending on the same document.
  walkthroughProgress: defineTable({
    userId: v.string(),
    chapterId: v.string(),
    status: v.union(
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("skipped"),
    ),
    stepIndex: v.number(), // last shown step, 0-based
    version: v.number(), // chapter.version at write time
    startedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_chapter", ["userId", "chapterId"]),

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

  /**
   * Workouts read out of Apple Health.
   *
   * Kept separate from `workoutLogs` on purpose: importing is not the same as
   * training-logging. A day has only two workout slots, so a silent auto-write
   * could displace a session the user logged by hand. Promotion into the
   * training log is an explicit action (`linkToTrainingLog`).
   */
  healthWorkouts: defineTable({
    userId: v.string(),
    provider: v.literal("apple_health"),
    /** The HealthKit UUID — the dedupe key. */
    externalId: v.string(),
    activityType: v.string(),
    activityName: v.string(),
    /** Local calendar date, computed client-side from the user's timezone. */
    date: v.string(),
    startedAt: v.number(),
    endedAt: v.number(),
    durationSeconds: v.number(),
    totalDistanceMeters: v.optional(v.number()),
    avgHeartRateBpm: v.optional(v.number()),
    maxHeartRateBpm: v.optional(v.number()),
    activeEnergyKcal: v.optional(v.number()),
    sourceName: v.optional(v.string()),
    sourceBundleId: v.optional(v.string()),
    hasRoute: v.optional(v.boolean()),
    routeName: v.optional(v.string()),
    /** Set once the user promotes this into their training log. */
    linkedSessionId: v.optional(v.string()),
    linkedDate: v.optional(v.string()),
    dismissedAt: v.optional(v.number()),
    importedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_externalId", ["userId", "externalId"])
    .index("by_userId_and_startedAt", ["userId", "startedAt"])
    .index("by_userId_and_date", ["userId", "date"]),

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
    photoUploadId: v.optional(v.id("fileUploads")),
    photoDataUrl: v.optional(v.string()), // legacy base64 image; new photos use storage
    photoTakenAt: v.optional(v.number()), // timestamp when photo was taken
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_clientId", ["userId", "clientId"])
    // Ordered by check-in date rather than `_creationTime` because backfilled
    // check-ins are common — someone logs Monday's weigh-in on Wednesday.
    .index("by_userId_and_loggedAt", ["userId", "loggedAt"]),

  customProgressMetrics: defineTable({
    userId: v.string(),
    title: v.string(),
    description: v.string(),
    tab: v.union(
      v.literal("body"),
      v.literal("nutrition"),
      v.literal("training"),
    ),
    kind: v.union(
      v.literal("counter"),
      v.literal("number"),
      v.literal("toggle"),
    ),
    unit: v.string(),
    step: v.number(),
    target: v.optional(v.number()),
    accent: v.union(
      v.literal("food"),
      v.literal("water"),
      v.literal("workout"),
      v.literal("progress"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  customProgressMetricEntries: defineTable({
    userId: v.string(),
    metricId: v.id("customProgressMetrics"),
    date: v.string(),
    value: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_metricId", ["userId", "metricId"])
    .index("by_userId_and_metricId_and_date", ["userId", "metricId", "date"]),

  dashboardWidgets: defineTable({
    userId: v.string(),
    title: v.string(),
    description: v.string(),
    kind: v.union(
      v.literal("stat"),
      v.literal("counter"),
      v.literal("progress"),
      v.literal("sparkline"),
      v.literal("decay"),
    ),
    sourceMetricId: v.id("customProgressMetrics"),
    unit: v.string(),
    accent: v.union(
      v.literal("food"),
      v.literal("water"),
      v.literal("workout"),
      v.literal("progress"),
    ),
    target: v.optional(v.number()),
    windowDays: v.optional(v.number()),
    halfLifeHours: v.optional(v.number()),
    parentWidgetId: v.optional(v.id("dashboardWidgets")),
    pinned: v.boolean(),
    createdBy: v.literal("coach"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_pinned", ["userId", "pinned"]),

  // Datasource API response cache. Entries are hard-expired and replaced;
  // this holds no user data.
  foodSourceCache: defineTable({
    key: v.string(),
    value: v.any(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),

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

  dailyCheckIns: defineTable({
    userId: v.string(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // ── Coach memory, check-ins, and reversible action history ──────────────
  // Memories are stored one-per-key so the list stays bounded and individual
  // preferences can be updated without rewriting an ever-growing document.
  coachMemories: defineTable({
    userId: v.string(),
    key: v.string(),
    category: v.string(),
    value: v.string(),
    source: v.string(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_key", ["userId", "key"]),

  coachCheckIns: defineTable({
    userId: v.string(),
    date: v.string(),
    kind: v.optional(v.string()),
    energy: v.number(),
    soreness: v.number(),
    sleepQuality: v.number(),
    mood: v.number(),
    note: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_date_and_kind", ["userId", "date", "kind"]),

  coachActionEvents: defineTable({
    userId: v.string(),
    kind: v.string(),
    summary: v.string(),
    status: v.union(v.literal("applied"), v.literal("undone")),
    targetType: v.string(),
    targetId: v.optional(v.string()),
    undoPayload: v.any(),
    createdAt: v.number(),
    undoneAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  coachOperationRuns: defineTable({
    userId: v.string(),
    requestId: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_requestId", ["userId", "requestId"]),

  coachWeeklyPlans: defineTable({
    userId: v.string(),
    weekStart: v.string(),
    status: v.union(v.literal("active"), v.literal("archived")),
    title: v.string(),
    days: v.array(v.any()),
    assumptions: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_weekStart", ["userId", "weekStart"]),

  // Time-boxed goals created with Coach. Tasks live in their own table so
  // completion updates do not rewrite the entire goal document.
  coachGoals: defineTable({
    userId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.string(),
    durationDays: v.number(),
    status: v.union(v.literal("active"), v.literal("completed")),
    pinned: v.boolean(),
    sourceMode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_pinned", ["userId", "pinned"])
    .index("by_userId_and_status", ["userId", "status"]),

  coachGoalTasks: defineTable({
    userId: v.string(),
    goalId: v.id("coachGoals"),
    title: v.string(),
    detail: v.optional(v.string()),
    completed: v.boolean(),
    sortOrder: v.number(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_goalId_and_sortOrder", ["goalId", "sortOrder"]),

  coachUploads: defineTable({
    userId: v.string(),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    fileName: v.string(),
    size: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_storageId", ["storageId"])
    .index("by_userId_and_storageId", ["userId", "storageId"])
    .index("by_expiresAt", ["expiresAt"]),

  // Every newly uploaded blob is registered here before any feature can use
  // it. Application records reference this ownership row, never raw storage
  // IDs supplied by clients.
  fileUploads: defineTable({
    userId: v.string(),
    purpose: v.union(
      v.literal("recipe_photo"),
      v.literal("body_progress_photo"),
      v.literal("form_coach_landmarks"),
      v.literal("coach_image"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("attached"),
      v.literal("failed"),
    ),
    storageId: v.optional(v.id("_storage")),
    expectedMimeType: v.string(),
    expectedSize: v.number(),
    actualMimeType: v.optional(v.string()),
    actualSize: v.optional(v.number()),
    fileName: v.optional(v.string()),
    attachedTable: v.optional(
      v.union(
        v.literal("recipes"),
        v.literal("bodyMeasurements"),
        v.literal("formCoachSessions"),
        v.literal("coachMessages"),
      ),
    ),
    attachedDocumentId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    attachedAt: v.optional(v.number()),
  })
    .index("by_storageId", ["storageId"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_userId_and_purpose_and_status", ["userId", "purpose", "status"])
    .index("by_expiresAt", ["expiresAt"]),

  // ── AI usage quotas ──────────────────────────────────────────────────────
  aiUsage: defineTable({
    userId: v.string(),
    month: v.string(), // YYYY-MM UTC month key
    count: v.number(),
    lastSource: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_userId_month", ["userId", "month"]),

  rateLimitBuckets: defineTable({
    key: v.string(),
    userId: v.string(),
    action: v.string(),
    windowStart: v.number(),
    count: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  // ── One-time maintenance markers, so a backfill cannot run twice ──────────
  migrationRuns: defineTable({
    name: v.string(),
    ranAt: v.number(),
    detail: v.optional(v.string()),
  }).index("by_name", ["name"]),

  // ── Food photo analysis quota ─────────────────────────────────────────────
  snapUsage: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD UTC
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_userId_date", ["userId", "date"]),

  // ── Subscription status (server-owned per-user entitlement rollup) ───────
  // Derived from `billingSubscriptions`. Legacy source variants remain in the
  // validator so existing production documents continue to validate.
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
      v.literal("apple_api"),
      v.literal("apple_notification"),
      v.literal("google_api"),
      v.literal("google_rtdn"),
      v.literal("stripe_api"),
      v.literal("stripe_webhook"),
    ),
    platform: v.optional(billingPlatform),
    // Richer than `isActive`, which stays derived from it.
    state: v.optional(billingState),
    autoRenew: v.optional(v.boolean()),
    gracePeriodExpiresAt: v.optional(v.number()),
    revalidateAfter: v.optional(v.number()),
    fetchedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_revalidateAfter", ["revalidateAfter"]),

  // ── Platform subscriptions (one row per store subscription identity) ─────
  // Intentionally 1:N per user: the same person can hold an Apple sub and a
  // Stripe sub, which is what makes cross-platform linking fall out for free.
  billingSubscriptions: defineTable({
    userId: v.string(),
    platform: billingPlatform,
    // Apple `originalTransactionId` / Google `purchaseToken` / Stripe `sub_…`.
    platformSubscriptionId: v.string(),
    platformCustomerId: v.optional(v.string()),
    productId: v.string(),
    state: billingState,
    autoRenew: v.boolean(),
    expiresAt: v.number(),
    gracePeriodExpiresAt: v.optional(v.number()),
    environment: v.union(v.literal("production"), v.literal("sandbox")),
    // Retained on rows imported from the previous provider.
    originRevenueCat: v.optional(v.boolean()),
    grandfatheredUntil: v.optional(v.number()),
    // Monotonicity guard: the platform's own timestamp for the latest state we
    // stored, so out-of-order webhook delivery can be ignored.
    sourceUpdatedAt: v.optional(v.number()),
    revalidateAfter: v.optional(v.number()),
    latestRaw: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_platform_and_platformSubscriptionId", [
      "platform",
      "platformSubscriptionId",
    ])
    .index("by_userId", ["userId"])
    .index("by_platform_and_platformCustomerId", [
      "platform",
      "platformCustomerId",
    ])
    .index("by_revalidateAfter", ["revalidateAfter"]),

  // ── Inbound store notifications (idempotency + audit trail) ──────────────
  billingEvents: defineTable({
    platform: v.string(),
    // Apple `notificationUUID` / Pub/Sub `messageId` / Stripe `evt_…`.
    eventId: v.string(),
    eventType: v.string(),
    platformSubscriptionId: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    processedAt: v.number(),
    status: v.union(
      v.literal("received"),
      v.literal("processed"),
      v.literal("ignored"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    raw: v.optional(v.any()),
  })
    .index("by_platform_and_eventId", ["platform", "eventId"])
    .index("by_processedAt", ["processedAt"]),

  // ── Store-facing account identifiers ─────────────────────────────────────
  // StoreKit's `appAccountToken` must be a UUID, so we mint a stable one per
  // user and keep the reverse mapping here. Play's `obfuscatedAccountId` and
  // Stripe's `client_reference_id` reuse the same value for consistency.
  billingIdentities: defineTable({
    userId: v.string(),
    appAccountToken: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_appAccountToken", ["appAccountToken"]),

  // ── Stripe Checkout sessions (session → user attribution) ────────────────
  billingCheckouts: defineTable({
    userId: v.string(),
    sessionId: v.string(),
    stripeCustomerId: v.optional(v.string()),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

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

  supportedExercises: defineTable({
    exerciseId: v.id("exercises"),
    createdAt: v.optional(v.number()),
  }),

  // ── Form coach ────────────────────────────────────────────────────────────
  // One capture of a lifter's technique. The landmark payload lives in file
  // storage rather than the document: it is a few hundred KB of numbers, only
  // read when a report is generated, and never queried against.
  formCoachSessions: defineTable({
    userId: v.string(),
    exerciseId: v.string(),
    exerciseName: v.string(),
    slug: v.string(),
    date: v.string(), // YYYY-MM-DD
    capturedAt: v.number(),
    landmarksStorageId: v.optional(v.id("_storage")),
    landmarksUploadId: v.optional(v.id("fileUploads")),
    repCount: v.number(),
    angles: v.array(
      v.object({
        index: v.number(),
        kind: v.string(), // "video" | "image"
        view: v.string(), // front | back | side | oblique
        repCount: v.number(),
        trackingRate: v.number(),
        durationMs: v.number(),
        // Which body distance the reps were read from. Optional because
        // captures recorded before the detector went beyond squats have none.
        repSignal: v.optional(v.string()),
      }),
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_exerciseId", ["userId", "exerciseId"]),

  formCoachReports: defineTable({
    userId: v.string(),
    sessionId: v.id("formCoachSessions"),
    exerciseId: v.string(),
    exerciseName: v.string(),
    date: v.string(),
    createdAt: v.number(),
    summary: v.string(),
    findings: v.array(
      v.object({
        title: v.string(),
        detail: v.string(),
        severity: v.string(), // strength | minor | major
        confidence: v.string(), // low | medium | high
        // What the model measured to reach this, so the report is auditable
        // rather than merely plausible.
        evidence: v.object({
          measurement: v.string(),
          value: v.string(),
          phase: v.optional(v.string()),
        }),
        cue: v.optional(v.string()),
      }),
    ),
    drills: v.array(v.object({ name: v.string(), reason: v.string() })),
    /** What the capture could not answer, and why. */
    notMeasured: v.array(v.string()),
    /**
     * What to watch for on the next set of this lift.
     *
     * Separate from findings and drills because it is read at a different
     * moment: findings explain what happened, this is the thing to hold in mind
     * while lifting. Optional so reports written before it existed still read.
     */
    checklist: v.optional(v.array(v.string())),
    /**
     * Joint angles to aim for, rendered as a corrected pose in the app.
     *
     * Optional because reports written before corrections existed have no such
     * field, and a required one makes every one of them fail validation on
     * read. Absent means "no corrections", which is also what a report with
     * nothing positional to fix returns.
     */
    corrections: v.optional(
      v.array(
        v.object({
          joint: v.string(),
          side: v.string(),
          phase: v.string(),
          targetDegrees: v.number(),
          reason: v.string(),
        }),
      ),
    ),
    /**
     * The rep the report describes, compact enough to live in the
     * document. Stored here rather than re-read from the landmark blob so a
     * pinned card can render on its own weeks later.
     */
    pose: v.optional(
      v.array(
        v.object({
          timeMs: v.number(),
          worldLandmarks: v.array(
            v.object({
              x: v.number(),
              y: v.number(),
              z: v.number(),
              visibility: v.number(),
            }),
          ),
        }),
      ),
    ),
    /** Every tool the agent called, for debugging and for showing our work. */
    toolCalls: v.array(
      v.object({
        tool: v.string(),
        input: v.string(),
        output: v.string(),
      }),
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_sessionId", ["sessionId"])
    .index("by_userId_and_exerciseId", ["userId", "exerciseId"]),

  /** Form cards the user chose to keep on the Workouts or Progress screen. */
  formCoachPins: defineTable({
    userId: v.string(),
    reportId: v.id("formCoachReports"),
    surface: v.string(), // "workouts" | "progress"
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_surface", ["userId", "surface"])
    .index("by_userId_and_report", ["userId", "reportId"]),
});
