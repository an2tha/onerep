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
    /**
     * How to show food energy: "kcal" | "Cal" | "kJ". kcal and Cal are the
     * same number; kJ converts at display time. Stored values stay kcal.
     */
    energyUnit: v.optional(v.string()),
    /**
     * What the user last actually ran. Recorded on launch so a bug report can
     * be checked against the build that produced it — "did the OTA reach
     * them?" was previously unanswerable without asking.
     */
    lastAppVersion: v.optional(v.string()),
    /** The active web bundle, which is what an OTA release actually changes. */
    lastBundleVersion: v.optional(v.string()),
    lastPlatform: v.optional(v.string()), // "ios" | "android" | "web"
    lastAppVersionAt: v.optional(v.number()),
    /**
     * Opt back in to calorie/macro numbers after a recovery-mode screening
     * answer hid them. Deliberately a separate field from the onboarding
     * answer: the screening result stays on record, the display does not
     * override it silently.
     */
    showCalorieNumbers: v.optional(v.boolean()),
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
        /**
         * Legacy name from when iOS was the only platform. Still written so a
         * rollback stays safe; `healthSyncEnabled` is the canonical field and
         * wins on read. Drop this once a backfill has run.
         */
        appleHealthEnabled: v.boolean(),
        healthSyncEnabled: v.optional(v.boolean()),
        autoSyncOnForeground: v.boolean(),
        /**
         * Writing finished sessions back to the health store. Opt-in on both
         * platforms — the app historically only ever read.
         */
        writeEnabled: v.optional(v.boolean()),
        lastSyncedAt: v.optional(v.number()),
        /** Surfaced in Settings; a background sync must never toast. */
        lastSyncError: v.optional(v.string()),
        /**
         * Per-signal opt-in, keyed by `lib/healthMetricCatalog.ts`. A record
         * rather than named fields so adding a metric is a catalogue edit and
         * not a schema migration; absent keys fall back to the catalogue
         * default, which is what lets a new metric arrive switched on without
         * overriding anything a user turned off.
         */
        metrics: v.optional(v.record(v.string(), v.boolean())),
        /**
         * Which dials the Health hero shows, keyed by area id. Separate from
         * `metrics` on purpose: one is "may we read this from your phone", the
         * other is "do you want to look at it". Someone can sync sleep for the
         * recovery score without wanting a sleep dial in their face.
         */
        dials: v.optional(v.record(v.string(), v.boolean())),
      }),
    ),
    /**
     * The ongoing workout notification on Android. iOS has no equivalent
     * setting because a Live Activity is far less intrusive than a persistent
     * Android notification.
     */
    liveWorkoutStatusEnabled: v.optional(v.boolean()),
    /**
     * Whether Coach may speak first, and when.
     *
     * Distinct from `pushReminders`, which is a clock the user set themselves.
     * This is the app deciding it has something to say, which is a different
     * permission and deserves its own switch. Absent means the defaults in
     * `convex/lib/outreach.ts` apply.
     */
    coachOutreach: v.optional(
      v.object({
        enabled: v.boolean(),
        weeklyReview: v.boolean(),
        nudges: v.boolean(),
        /** Local minutes-of-day. Silence wraps midnight when start > end. */
        quietHours: v.optional(
          v.object({ startMinutes: v.number(), endMinutes: v.number() }),
        ),
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
   * Workouts read out of the platform health store — Apple Health on iOS,
   * Health Connect on Android.
   *
   * Kept separate from `workoutLogs` on purpose: importing is not the same as
   * training-logging. A day has only two workout slots, so a silent auto-write
   * could displace a session the user logged by hand. Promotion into the
   * training log is an explicit action (`linkToTrainingLog`).
   */
  healthWorkouts: defineTable({
    userId: v.string(),
    /**
     * `api` is a session written through the public API or MCP rather than
     * read off a phone — a watch the app cannot see, or an import script. It
     * carries no device dedupe key, so the writer supplies its own external id.
     */
    provider: v.union(
      v.literal("apple_health"),
      v.literal("health_connect"),
      v.literal("api"),
    ),
    /** HealthKit sample UUID or Health Connect record id — the dedupe key. */
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
    // provider is part of the key: HealthKit UUIDs and Health Connect record
    // ids come from different namespaces and could otherwise collide.
    .index("by_userId_and_externalId", ["userId", "provider", "externalId"])
    .index("by_userId_and_startedAt", ["userId", "startedAt"])
    .index("by_userId_and_date", ["userId", "date"]),

  /**
   * Daily recovery signals read out of the platform health store.
   *
   * One row per user per local day, upserted — the phone re-reads the same day
   * repeatedly as a watch syncs late, and the last read wins. Deliberately
   * separate from `healthWorkouts`: those are discrete sessions the user may
   * promote into their training log, while these are ambient background
   * measurements nobody logged and nobody should have to.
   *
   * Every field is optional because every field is a different sensor with a
   * different failure mode. A phone with no watch has steps and nothing else;
   * that is a normal row, not a broken one.
   */
  healthMetrics: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD, the user's local day
    provider: v.union(
      v.literal("apple_health"),
      v.literal("health_connect"),
      // "manual" is what a row nobody's watch produced calls itself: a day the
      // user typed a figure into before any sync had reached it. The next sync
      // to touch the day overwrites this with the real provider, which is
      // correct — by then the platform store does have an opinion about it.
      v.literal("manual"),
    ),
    /** Asleep time, not time in bed. */
    sleepMinutes: v.optional(v.number()),
    steps: v.optional(v.number()),
    restingHeartRateBpm: v.optional(v.number()),
    /**
     * HRV in milliseconds — SDNN from HealthKit, RMSSD from Health Connect.
     * The two are different statistics and must never be compared across
     * platforms; every consumer works in deviation from the same user's own
     * baseline, which is per-provider by construction.
     */
    hrvMs: v.optional(v.number()),
    activeEnergyKcal: v.optional(v.number()),
    /**
     * Field names on this row the user corrected by hand, which the sync must
     * leave alone. Per field rather than per row because the reason people edit
     * these at all is one bad sensor: a chest strap that reported a 41bpm
     * resting heart rate should not also freeze the step count for that day.
     *
     * A list rather than a record of flags because the flag would carry no
     * information the membership does not — the value itself already lives in
     * the field beside it — and because clearing an override has to mean
     * removing the name entirely, so the next sync owns the field again. A
     * record invites writing `false`, which reads as "synced" everywhere except
     * the one place that checks `key in record`.
     */
    manualFields: v.optional(v.array(v.string())),
    syncedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"]),

  // ── Food logs (one doc per user+date, stores all entries) ─────────────────
  foodLogs: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD
    entries: v.array(v.any()),
    updatedAt: v.number(),
  }).index("by_userId_date", ["userId", "date"]),

  // ── Repeat meals (auto-logged at a local time of day) ─────────────────────
  repeatMeals: defineTable({
    userId: v.string(),
    name: v.string(),
    /** Meal slot the entries land in ("breakfast", a custom id, …). */
    meal: v.string(),
    /** Local time of day, in the user's lastActiveTimezone. */
    hour: v.number(),
    minute: v.number(),
    enabled: v.boolean(),
    /** Food-entry templates; ids and loggedAt are re-minted at log time. */
    entries: v.array(v.any()),
    /** Last local date this was materialized into the food log. */
    lastLoggedDate: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_enabled", ["enabled"]),

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
    /**
     * "manual" (typed in the app or through the API) or "health" (read from
     * HealthKit / Health Connect). The sync only ever overwrites rows it wrote
     * itself: a number someone typed outranks a scale reading for the same day.
     */
    source: v.optional(v.string()),
    leanBodyMassKg: v.optional(v.number()),
    boneMassKg: v.optional(v.number()),
    basalMetabolicRateKcal: v.optional(v.number()),
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
    /**
     * A key from `lib/platformHealthMetrics.ts`. Set it and the health sync
     * fills this metric in from Apple Health or Health Connect instead of the
     * user typing it — which is how blood glucose, blood pressure or SpO2 get
     * tracked without the app inventing a score for them.
     *
     * A synced metric still accepts a typed value: the reading is a default,
     * not a lock, and a finger-prick someone trusts more than their monitor
     * should win. A typed value marks the day `manual` so a later sync leaves
     * it alone.
     */
    healthMetricKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  customProgressMetricEntries: defineTable({
    userId: v.string(),
    metricId: v.id("customProgressMetrics"),
    date: v.string(),
    value: v.number(),
    /** True when a person typed this figure, so the sync will not replace it. */
    manual: v.optional(v.boolean()),
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

  // User-authored exercises. Kept out of `exercises` because the catalog import
  // (`bun run exercises:import`) runs `convex import --replace`, which would
  // wipe any user-owned rows living in that table.
  customExercises: defineTable({
    userId: v.string(),
    name: v.string(),
    category: v.string(), // "strength" | "cardio" | "mobility" | "core"
    equipment: v.optional(v.string()),
    primaryMuscles: v.array(v.string()),
    secondaryMuscles: v.array(v.string()),
    instructions: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_name", ["userId", "name"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["userId", "category"],
    }),

  dailyCheckIns: defineTable({
    userId: v.string(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  /**
   * Personal access tokens for the MCP endpoint.
   *
   * Only the hash is stored: the plaintext is shown once, at creation, and is
   * unrecoverable afterwards. `scopes` is checked per tool call, so a token
   * handed to something read-only cannot be talked into writing.
   */
  mcpTokens: defineTable({
    userId: v.string(),
    /** What the user called it — "laptop Claude", "the shortcut". */
    name: v.string(),
    /** SHA-256 of the plaintext token, hex. */
    tokenHash: v.string(),
    /** First few characters, so a token can be told apart in a list. */
    prefix: v.string(),
    /**
     * `delete` is deliberately its own scope rather than part of `write`.
     * Removing a month of logs and adding a meal are not the same risk, and a
     * key minted before deletes existed must not silently acquire the power.
     */
    scopes: v.array(
      v.union(v.literal("read"), v.literal("write"), v.literal("delete")),
    ),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    /**
     * Set when the token came out of the OAuth token endpoint rather than the
     * settings screen. Such a token belongs to a connected app, expires on its
     * own, and is listed under connections rather than among personal keys.
     */
    clientId: v.optional(v.string()),
    /** Absent means it never expires — which is true of every personal key. */
    expiresAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_tokenHash", ["tokenHash"]),

  /**
   * OAuth clients allowed to ask for an MCP token on a user's behalf.
   *
   * Two ways in. A client can register itself at `/oauth/register` — the
   * protocol expects that, and it is what lets Claude Desktop connect without
   * anybody copying a credential around — or a user can mint one by hand in
   * settings for a client that refuses to self-register and wants an ID and
   * secret typed into a form.
   *
   * A self-registered client is not trusted for having registered. It gets
   * nothing until a signed-in human approves it on the consent screen, and the
   * approval is what the token is actually made of.
   */
  mcpOauthClients: defineTable({
    clientId: v.string(),
    /** SHA-256 hex. Absent means a public client, authorized by PKCE alone. */
    clientSecretHash: v.optional(v.string()),
    /** Whatever the client called itself. Shown on the consent screen, so it
     * is treated as hostile text and truncated rather than trusted. */
    clientName: v.string(),
    /** Exact-match allowlist. A redirect this does not contain is refused. */
    redirectUris: v.array(v.string()),
    clientUri: v.optional(v.string()),
    createdAt: v.number(),
    /** Set only for clients minted by hand; self-registered ones have no owner. */
    createdByUserId: v.optional(v.string()),
    registration: v.union(v.literal("dynamic"), v.literal("manual")),
    revokedAt: v.optional(v.number()),
  })
    .index("by_clientId", ["clientId"])
    .index("by_createdByUserId", ["createdByUserId"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * Authorization codes, between the consent screen and the token endpoint.
   *
   * Single use and short lived, stored as a hash like every other credential
   * here. The PKCE challenge is bound to the row so the code is worthless to
   * anyone who intercepts it without also holding the verifier.
   */
  mcpAuthCodes: defineTable({
    codeHash: v.string(),
    clientId: v.string(),
    userId: v.string(),
    redirectUri: v.string(),
    scopes: v.array(v.union(v.literal("read"), v.literal("write"))),
    codeChallenge: v.string(),
    expiresAt: v.number(),
    /** Kept after use so a replay can be told apart from an unknown code. */
    consumedAt: v.optional(v.number()),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  /**
   * Refresh tokens. Rotated on every use: presenting one mints a replacement
   * and revokes the old, so a stolen token is good for at most one exchange
   * and the theft shows up as the real client suddenly being logged out.
   */
  mcpRefreshTokens: defineTable({
    tokenHash: v.string(),
    clientId: v.string(),
    userId: v.string(),
    scopes: v.array(v.union(v.literal("read"), v.literal("write"))),
    /**
     * The access token minted alongside this one. Rotation revokes that token
     * and no other: two installs of the same client are two grants, and one
     * refreshing must not sign the other out.
     */
    accessTokenId: v.optional(v.id("mcpTokens")),
    createdAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  /**
   * What the user said they'd do next week, taken at the end of the last one.
   *
   * One row per ISO week. The weekly report reads the target back when that
   * week closes, which is the only reason to ask for it: a number nobody is
   * ever shown again is a survey, not a plan.
   */
  weeklyTargets: defineTable({
    userId: v.string(),
    weekKey: v.string(), // 2026-W16
    sessions: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_week", ["userId", "weekKey"]),

  /**
   * Days the user has said were rest on purpose.
   *
   * Kept apart from workoutLogs because a rest day is the absence of a
   * session, not a kind of one: it must never show up in volume, streaks or
   * history. It exists so the lapse nudge can tell a deload from a drift.
   */
  restDays: defineTable({
    userId: v.string(),
    date: v.string(), // YYYY-MM-DD
    /** Where the marker came from, for when this grows a second entry point. */
    source: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"]),

  /**
   * One row per full-screen moment the app has already put in front of the
   * user, scoped by `key` — a date for the daily nudge, an ISO week for the
   * report. Server-side rather than local so a nudge answered on the phone is
   * not waiting on the tablet, and so a reinstall does not replay the week.
   */
  momentEvents: defineTable({
    userId: v.string(),
    eventId: v.string(),
    key: v.string(),
    outcome: v.union(
      v.literal("shown"),
      v.literal("resolved"),
      v.literal("dismissed"),
    ),
    shownAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_event", ["userId", "eventId"])
    .index("by_userId_and_event_and_key", ["userId", "eventId", "key"]),

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

  // ── Coach outreach: the machinery for speaking first ─────────────────────
  // One row per device per user. A token is a routing address, not an
  // identity: the same phone handed to a second account gets a second row, and
  // the stale one dies the next time the provider rejects it. The platform
  // decides the transport: iOS tokens go to APNs, Android tokens to FCM.
  pushTokens: defineTable({
    userId: v.string(),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    /** Set when the provider says the token is gone; the row is then dropped. */
    failedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_token", ["token"]),

  // Every message Coach sent on its own initiative. This is the frequency cap's
  // memory and the dedupe key's home, so it is written before anyone is
  // disturbed rather than after.
  coachTouches: defineTable({
    userId: v.string(),
    kind: v.union(
      v.literal("weekly_review"),
      v.literal("missed_log"),
      v.literal("training_lapse"),
    ),
    /** The scope one sending covers — a date key, a week key, a lapse key. */
    dedupeKey: v.string(),
    sentAt: v.number(),
    delivered: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_sentAt", ["userId", "sentAt"])
    .index("by_userId_and_kind_and_dedupeKey", ["userId", "kind", "dedupeKey"]),

  // Which celebrations this account has already had. Confetti is a
  // once-per-achievement thing, and the localStorage flag that used to enforce
  // that made "once" mean "once per device" — finish a fast on the phone, open
  // the iPad, watch it all again.
  celebrations: defineTable({
    userId: v.string(),
    /** CelebrationKind on the client. */
    kind: v.string(),
    /** The scope one showing covers: a date key, or a fasting session id. */
    dedupeKey: v.string(),
    celebratedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_kind_and_dedupeKey", ["userId", "kind", "dedupeKey"]),

  // The Sunday review: what the coach made of the week, and what it proposes
  // doing about it. Operations are stored as proposals and applied only when
  // the user taps, so this table holds intent, never a completed write.
  coachReviews: defineTable({
    userId: v.string(),
    /** Monday of the week under review, so a week has exactly one row. */
    weekStart: v.string(),
    weekKey: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("partial"),
      v.literal("dismissed"),
      v.literal("expired"),
    ),
    headline: v.string(),
    summary: v.array(v.string()),
    focus: v.optional(v.string()),
    proposedOperations: v.array(v.any()),
    /** Indices of `proposedOperations` the user has applied. */
    appliedOperations: v.array(v.number()),
    requestId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_userId_and_weekStart", ["userId", "weekStart"])
    // For the expiry cron, which asks a cross-user question and was
    // filter-scanning the whole table to answer it.
    .index("by_status_and_createdAt", ["status", "createdAt"]),

  /**
   * One row per user per calendar month: the long view, precomputed.
   *
   * Deriving this on read would mean pulling six months of food logs into
   * every coach turn. A closed month's numbers never change again, so
   * computing once and storing is both cheaper and exactly as correct; the
   * current month is simply recomputed whenever the weekly review runs.
   */
  coachMonthlySummaries: defineTable({
    userId: v.string(),
    month: v.string(), // YYYY-MM
    sessions: v.number(),
    activeDays: v.number(),
    sets: v.number(),
    loggedFoodDays: v.number(),
    daysInMonth: v.number(),
    avgCalories: v.union(v.number(), v.null()),
    avgProtein: v.union(v.number(), v.null()),
    weightStartKg: v.union(v.number(), v.null()),
    weightEndKg: v.union(v.number(), v.null()),
    computedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_month", ["userId", "month"]),

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
      v.literal("data_import"),
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

  // ── Bring-your-own-key: a user's own OpenRouter credential ───────────────
  // The key never leaves server functions; clients only ever see `last4`.
  aiKeys: defineTable({
    userId: v.string(),
    key: v.string(),
    last4: v.string(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

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
  // Links StoreKit's `appAccountToken` back to an account. The app attaches the
  // UUID as a purchase option, Apple signs it into every transaction the
  // subscription ever produces, and that is what attributes a renewal three
  // years from now to the person who bought it — including one that renews
  // while the app is uninstalled. One row per user, never rotated.
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

  /**
   * Mobile app waitlist signups from the marketing site.
   *
   * Deliberately not tied to a user: the whole point is that these people do
   * not have an account yet. Written by an unauthenticated HTTP endpoint, so
   * every field is length-capped at the door.
   */
  mobileWaitlist: defineTable({
    email: v.string(),
    /** "ios" | "android" | "either" — what they are actually waiting for. */
    platform: v.string(),
    /** Where the form was submitted from, for attribution. */
    source: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

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
