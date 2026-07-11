import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

type SupplementItem = Doc<"supplementItems">;
type SupplementLog = Doc<"supplementIntakeLogs">;
type SupplementNutrients = Partial<Record<SupplementNutrientKey, number>>;

const supplementCategoryValidator = v.union(
  v.literal("protein"),
  v.literal("creatine"),
  v.literal("multivitamin"),
  v.literal("vitamin_mineral"),
  v.literal("electrolyte"),
  v.literal("caffeine_pre_workout"),
  v.literal("omega_3"),
  v.literal("fiber"),
  v.literal("other"),
);

const supplementFormValidator = v.union(
  v.literal("capsule"),
  v.literal("tablet"),
  v.literal("powder"),
  v.literal("liquid"),
  v.literal("gummy"),
  v.literal("softgel"),
  v.literal("other"),
);

const supplementScheduleValidator = v.object({
  type: v.union(
    v.literal("none"),
    v.literal("daily"),
    v.literal("weekdays"),
    v.literal("training_days"),
    v.literal("rest_days"),
  ),
  weekdays: v.optional(v.array(v.number())),
  preferredTime: v.optional(v.string()),
});

const supplementNutrientsValidator = v.object({
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
});

const supplementStatusValidator = v.union(
  v.literal("taken"),
  v.literal("skipped"),
);

const legacySupplementKindValidator = v.union(
  v.literal("creatine"),
  v.literal("protein"),
  v.literal("vitamins"),
  v.literal("caffeine"),
);

const legacySupplementUnitValidator = v.union(
  v.literal("g"),
  v.literal("mg"),
  v.literal("serving"),
);

const legacySupplementEntryValidator = v.object({
  id: v.string(),
  kind: legacySupplementKindValidator,
  amount: v.number(),
  unit: legacySupplementUnitValidator,
  loggedAt: v.string(),
  note: v.optional(v.string()),
});

const SUPPLEMENT_NUTRIENT_KEYS = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "fiber",
  "sugar",
  "saturatedFat",
  "transFat",
  "cholesterol",
  "sodium",
  "potassium",
  "calcium",
  "iron",
  "magnesium",
  "phosphorus",
  "zinc",
  "vitaminA",
  "vitaminC",
  "vitaminD",
  "vitaminB12",
  "caffeine",
  "alcohol",
  "creatine",
  "omega3",
  "epa",
  "dha",
] as const;

type SupplementNutrientKey = (typeof SUPPLEMENT_NUTRIENT_KEYS)[number];

const LEGACY_DEFINITIONS = {
  creatine: {
    name: "Creatine",
    category: "creatine",
    form: "powder",
    servingLabel: "5 g",
    defaultServingQuantity: 1,
    defaultAmount: 5,
    unit: "g",
    nutrientsPerServing: { creatine: 5 },
  },
  protein: {
    name: "Protein",
    category: "protein",
    form: "powder",
    servingLabel: "25 g",
    defaultServingQuantity: 1,
    defaultAmount: 25,
    unit: "g",
    nutrientsPerServing: { protein: 25 },
  },
  vitamins: {
    name: "Vitamins",
    category: "multivitamin",
    form: "tablet",
    servingLabel: "1 serving",
    defaultServingQuantity: 1,
    defaultAmount: 1,
    unit: "serving",
    nutrientsPerServing: {},
  },
  caffeine: {
    name: "Caffeine",
    category: "caffeine_pre_workout",
    form: "other",
    servingLabel: "100 mg",
    defaultServingQuantity: 1,
    defaultAmount: 100,
    unit: "mg",
    nutrientsPerServing: { caffeine: 100 },
  },
} as const;

function cleanString(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function optionalCleanString(value: string | undefined) {
  const cleaned = value ? cleanString(value) : "";
  return cleaned.length > 0 ? cleaned : undefined;
}

function assertPositive(value: number, message: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(message);
}

function assertValidEntries(entries: Array<{ amount: number }>) {
  for (const entry of entries) {
    assertPositive(entry.amount, "supplement amount must be positive");
  }
}

function cleanNutrients(
  input: Partial<Record<SupplementNutrientKey, number>>,
): SupplementNutrients {
  const next: SupplementNutrients = {};
  for (const key of SUPPLEMENT_NUTRIENT_KEYS) {
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    next[key] = roundNutrient(value);
  }
  return next;
}

function roundNutrient(value: number) {
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

function scaleNutrients(
  nutrients: SupplementNutrients,
  servingMultiplier: number,
) {
  const scaled: SupplementNutrients = {};
  for (const key of SUPPLEMENT_NUTRIENT_KEYS) {
    const value = nutrients[key];
    if (typeof value !== "number" || value <= 0) continue;
    scaled[key] = roundNutrient(value * servingMultiplier);
  }
  return scaled;
}

function sumNutrients(logs: Array<{ status: string; nutrients: unknown }>) {
  const totals: SupplementNutrients = {};
  for (const log of logs) {
    if (log.status !== "taken") continue;
    const nutrients =
      log.nutrients && typeof log.nutrients === "object"
        ? (log.nutrients as SupplementNutrients)
        : {};
    for (const key of SUPPLEMENT_NUTRIENT_KEYS) {
      const value = nutrients[key];
      if (typeof value !== "number" || value <= 0) continue;
      totals[key] = (totals[key] ?? 0) + value;
    }
  }
  return cleanNutrients(totals);
}

function legacyEntryNutrients(entry: {
  kind: keyof typeof LEGACY_DEFINITIONS;
  amount: number;
}) {
  const definition = LEGACY_DEFINITIONS[entry.kind];
  const multiplier = entry.amount / definition.defaultAmount;
  return scaleNutrients(definition.nutrientsPerServing, multiplier);
}

function categoryToLegacyKind(category: SupplementItem["category"]) {
  if (category === "creatine") return "creatine";
  if (category === "protein") return "protein";
  if (category === "caffeine_pre_workout") return "caffeine";
  return "vitamins";
}

function legacyLogFromIntake(log: SupplementLog) {
  const amount =
    log.category === "creatine"
      ? (log.nutrients.creatine ?? log.servingMultiplier)
      : log.category === "protein"
        ? (log.nutrients.protein ?? log.servingMultiplier)
        : log.category === "caffeine_pre_workout"
          ? (log.nutrients.caffeine ?? log.servingMultiplier)
          : log.servingMultiplier;
  const unit =
    log.category === "creatine" || log.category === "protein"
      ? "g"
      : log.category === "caffeine_pre_workout"
        ? "mg"
        : "serving";

  return {
    id: log.clientId ?? log._id,
    kind: categoryToLegacyKind(log.category),
    category: log.category,
    supplementId: log.supplementId,
    name: log.name,
    brand: log.brand,
    status: log.status,
    amount,
    unit,
    loggedAt: log.loggedAt,
    servingMultiplier: log.servingMultiplier,
    servingLabel: log.servingLabel,
    nutrients: log.nutrients,
    note: log.note,
  };
}

async function getOwnedSupplement(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  supplementId: Id<"supplementItems">,
) {
  const item = await ctx.db.get(supplementId);
  if (!item || item.userId !== userId) throw new Error("Supplement not found");
  return item;
}

async function insertIntakeLog(
  ctx: MutationCtx,
  userId: string,
  item: SupplementItem,
  args: {
    date: string;
    status: "taken" | "skipped";
    loggedAt?: string;
    servingMultiplier?: number;
    clientId?: string;
    note?: string;
  },
) {
  const servingMultiplier = args.servingMultiplier ?? 1;
  assertPositive(servingMultiplier, "serving multiplier must be positive");

  const now = Date.now();
  const nutrients =
    args.status === "taken"
      ? scaleNutrients(item.nutrientsPerServing, servingMultiplier)
      : {};

  return await ctx.db.insert("supplementIntakeLogs", {
    userId,
    supplementId: item._id,
    ...(args.clientId ? { clientId: args.clientId } : {}),
    date: args.date,
    status: args.status,
    loggedAt: args.loggedAt ?? new Date().toISOString(),
    servingMultiplier,
    servingLabel: item.servingLabel,
    name: item.name,
    ...(item.brand ? { brand: item.brand } : {}),
    category: item.category,
    nutrients,
    ...(args.note ? { note: cleanString(args.note) } : {}),
    createdAt: now,
    updatedAt: now,
  });
}

async function getOrCreateLegacyItem(
  ctx: MutationCtx,
  userId: string,
  kind: keyof typeof LEGACY_DEFINITIONS,
) {
  const legacyKey = `legacy:${kind}`;
  const existing = await ctx.db
    .query("supplementItems")
    .withIndex("by_userId_and_legacyKey", (q) =>
      q.eq("userId", userId).eq("legacyKey", legacyKey),
    )
    .unique();
  if (existing) return existing;

  const definition = LEGACY_DEFINITIONS[kind];
  const now = Date.now();
  const id = await ctx.db.insert("supplementItems", {
    userId,
    name: definition.name,
    category: definition.category,
    form: definition.form,
    servingLabel: definition.servingLabel,
    defaultServingQuantity: definition.defaultServingQuantity,
    active: true,
    schedule: { type: "daily" },
    nutrientsPerServing: definition.nutrientsPerServing,
    source: "manual",
    legacyKey,
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(id))!;
}

// -- catalog -----------------------------------------------------------------

export const listCatalog = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const items = args.includeInactive
      ? await ctx.db
          .query("supplementItems")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .take(200)
      : await ctx.db
          .query("supplementItems")
          .withIndex("by_userId_and_active", (q) =>
            q.eq("userId", user._id).eq("active", true),
          )
          .take(200);

    return items.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  },
});

export const getOverview = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) {
      return {
        items: [],
        logs: [],
        legacyEntries: [],
        recentLogs: [],
        nutritionTotals: {},
        isTrainingDay: false,
      };
    }

    const [items, logs, legacyDoc, recentLogs, workoutLogs] = await Promise.all([
      ctx.db
        .query("supplementItems")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(200),
      ctx.db
        .query("supplementIntakeLogs")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", user._id).eq("date", args.date),
        )
        .take(200),
      ctx.db
        .query("supplementLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", user._id).eq("date", args.date),
        )
        .unique(),
      ctx.db
        .query("supplementIntakeLogs")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", user._id).lt("date", args.date),
        )
        .order("desc")
        .take(300),
      ctx.db
        .query("workoutLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", user._id).eq("date", args.date),
        )
        .take(1),
    ]);

    const legacyEntries = (legacyDoc?.entries ?? []).map((entry: unknown) => {
      const parsed = entry as {
        id: string;
        kind: keyof typeof LEGACY_DEFINITIONS;
        amount: number;
        unit: string;
        loggedAt: string;
        note?: string;
      };
      return {
        ...parsed,
        name: LEGACY_DEFINITIONS[parsed.kind]?.name ?? "Supplement",
        status: "taken" as const,
        servingMultiplier: 1,
        servingLabel: `${parsed.amount} ${parsed.unit}`,
        nutrients: legacyEntryNutrients(parsed),
      };
    });

    return {
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
      logs,
      legacyEntries,
      recentLogs,
      nutritionTotals: sumNutrients([
        ...logs,
        ...legacyEntries.map((entry) => ({
          status: "taken",
          nutrients: entry.nutrients,
        })),
      ]),
      isTrainingDay: workoutLogs.length > 0,
    };
  },
});

export const getItemHistory = query({
  args: {
    supplementId: v.id("supplementItems"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    await getOwnedSupplement(ctx, user._id, args.supplementId);

    const limit = Math.max(1, Math.min(90, Math.floor(args.limit ?? 30)));
    return await ctx.db
      .query("supplementIntakeLogs")
      .withIndex("by_userId_and_supplementId_and_date", (q) =>
        q.eq("userId", user._id).eq("supplementId", args.supplementId),
      )
      .order("desc")
      .take(limit);
  },
});

export const getDayNutrition = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return {};

    const [logs, legacyDoc] = await Promise.all([
      ctx.db
        .query("supplementIntakeLogs")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", user._id).eq("date", args.date),
        )
        .take(200),
      ctx.db
        .query("supplementLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", user._id).eq("date", args.date),
        )
        .unique(),
    ]);
    const legacyLogs = (legacyDoc?.entries ?? []).map((entry: unknown) => ({
      status: "taken",
      nutrients: legacyEntryNutrients(
        entry as {
          kind: keyof typeof LEGACY_DEFINITIONS;
          amount: number;
        },
      ),
    }));
    return sumNutrients([...logs, ...legacyLogs]);
  },
});

export const saveItem = mutation({
  args: {
    id: v.optional(v.id("supplementItems")),
    name: v.string(),
    brand: v.optional(v.string()),
    category: supplementCategoryValidator,
    form: supplementFormValidator,
    servingLabel: v.string(),
    defaultServingQuantity: v.number(),
    barcode: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.boolean(),
    schedule: supplementScheduleValidator,
    nutrientsPerServing: supplementNutrientsValidator,
    source: v.optional(
      v.union(v.literal("manual"), v.literal("openfoodfacts")),
    ),
    importedOpenFoodFacts: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const name = cleanString(args.name);
    const servingLabel = cleanString(args.servingLabel);
    if (!name) throw new Error("supplement name is required");
    if (!servingLabel) throw new Error("serving label is required");
    assertPositive(
      args.defaultServingQuantity,
      "default serving quantity must be positive",
    );

    const now = Date.now();
    const payload = {
      name,
      ...(optionalCleanString(args.brand)
        ? { brand: optionalCleanString(args.brand) }
        : {}),
      category: args.category,
      form: args.form,
      servingLabel,
      defaultServingQuantity: args.defaultServingQuantity,
      ...(optionalCleanString(args.barcode)
        ? { barcode: optionalCleanString(args.barcode) }
        : {}),
      ...(optionalCleanString(args.notes)
        ? { notes: optionalCleanString(args.notes) }
        : {}),
      active: args.active,
      schedule: {
        type: args.schedule.type,
        ...(args.schedule.weekdays
          ? {
              weekdays: [...new Set(args.schedule.weekdays)]
                .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
                .sort((a, b) => a - b),
            }
          : {}),
        ...(optionalCleanString(args.schedule.preferredTime)
          ? { preferredTime: optionalCleanString(args.schedule.preferredTime) }
          : {}),
      },
      nutrientsPerServing: cleanNutrients(args.nutrientsPerServing),
      source: args.source ?? "manual",
      ...(args.importedOpenFoodFacts !== undefined
        ? { importedOpenFoodFacts: args.importedOpenFoodFacts }
        : {}),
      updatedAt: now,
    };

    if (args.id) {
      const existing = await getOwnedSupplement(ctx, user._id, args.id);
      await ctx.db.patch(existing._id, payload);
      return { id: existing._id };
    }

    const id = await ctx.db.insert("supplementItems", {
      userId: user._id,
      ...payload,
      createdAt: now,
    });
    return { id };
  },
});

export const setItemActive = mutation({
  args: { id: v.id("supplementItems"), active: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const item = await getOwnedSupplement(ctx, user._id, args.id);
    await ctx.db.patch(item._id, {
      active: args.active,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const removeItem = mutation({
  args: { id: v.id("supplementItems") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const item = await getOwnedSupplement(ctx, user._id, args.id);
    await ctx.db.delete(item._id);
    return { ok: true };
  },
});

export const logTaken = mutation({
  args: {
    supplementId: v.id("supplementItems"),
    date: v.string(),
    loggedAt: v.optional(v.string()),
    servingMultiplier: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const item = await getOwnedSupplement(ctx, user._id, args.supplementId);
    const id = await insertIntakeLog(ctx, user._id, item, {
      date: args.date,
      status: "taken",
      loggedAt: args.loggedAt,
      servingMultiplier: args.servingMultiplier,
      note: args.note,
    });
    return { id };
  },
});

export const markSkipped = mutation({
  args: {
    supplementId: v.id("supplementItems"),
    date: v.string(),
    loggedAt: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const item = await getOwnedSupplement(ctx, user._id, args.supplementId);
    const id = await insertIntakeLog(ctx, user._id, item, {
      date: args.date,
      status: "skipped",
      loggedAt: args.loggedAt,
      servingMultiplier: 1,
      note: args.note,
    });
    return { id };
  },
});

export const removeLog = mutation({
  args: { logId: v.id("supplementIntakeLogs") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const log = await ctx.db.get(args.logId);
    if (!log || log.userId !== user._id) return { ok: true };
    await ctx.db.delete(log._id);
    return { ok: true };
  },
});

// -- legacy compatibility ----------------------------------------------------

export const getDay = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const [legacyDoc, logs] = await Promise.all([
      ctx.db
        .query("supplementLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", user._id).eq("date", args.date),
        )
        .unique(),
      ctx.db
        .query("supplementIntakeLogs")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", user._id).eq("date", args.date),
        )
        .take(200),
    ]);

    return [
      ...(legacyDoc?.entries ?? []),
      ...logs
        .filter((log) => log.status === "taken")
        .map((log) => legacyLogFromIntake(log)),
    ];
  },
});

export const setDay = mutation({
  args: {
    date: v.string(),
    entries: v.array(legacySupplementEntryValidator),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    assertValidEntries(args.entries);

    const existing = await ctx.db
      .query("supplementLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        entries: args.entries,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("supplementLogs", {
        userId: user._id,
        date: args.date,
        entries: args.entries,
        updatedAt: now,
      });
    }

    return { ok: true };
  },
});

export const addEntry = mutation({
  args: {
    date: v.string(),
    entry: legacySupplementEntryValidator,
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    assertValidEntries([args.entry]);

    const definition = LEGACY_DEFINITIONS[args.entry.kind];
    const item = await getOrCreateLegacyItem(ctx, user._id, args.entry.kind);
    const servingMultiplier = args.entry.amount / definition.defaultAmount;
    await insertIntakeLog(ctx, user._id, item, {
      date: args.date,
      status: "taken",
      loggedAt: args.entry.loggedAt,
      servingMultiplier,
      clientId: args.entry.id,
      note: args.entry.note,
    });

    return { ok: true };
  },
});

export const removeEntry = mutation({
  args: {
    date: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const logs = await ctx.db
      .query("supplementIntakeLogs")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .take(200);
    for (const log of logs) {
      if (log._id === args.id || log.clientId === args.id) {
        await ctx.db.delete(log._id);
        return { ok: true };
      }
    }

    const existing = await ctx.db
      .query("supplementLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    if (!existing) return { ok: true };

    const nextEntries = existing.entries.filter((entry: unknown) => {
      if (!entry || typeof entry !== "object") return true;
      return (entry as { id?: unknown }).id !== args.id;
    });

    if (nextEntries.length === existing.entries.length) return { ok: true };

    await ctx.db.patch(existing._id, {
      entries: nextEntries,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});
