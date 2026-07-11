import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

const foodLogEntryValidator = v.object({
  id: v.string(),
  name: v.string(),
  calories: v.number(),
  protein: v.number(),
  carbs: v.number(),
  fat: v.number(),
  meal: v.string(),
  loggedAt: v.string(),
  // Open Food Facts source metadata
  source: v.optional(v.literal("openfoodfacts")),
  foodCode: v.optional(v.string()),
  quantityGrams: v.optional(v.number()),
  servingGrams: v.optional(v.number()),
  servingLabel: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  openFoodFacts: v.optional(v.any()),
  // Recipe metadata for entries logged from saved/generated recipes
  recipeId: v.optional(v.string()),
  recipeDraft: v.optional(v.any()),
  // Optional micronutrients
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
  vitaminC: v.optional(v.number()),
  vitaminA: v.optional(v.number()),
  vitaminD: v.optional(v.number()),
  vitaminB12: v.optional(v.number()),
  caffeine: v.optional(v.number()),
  alcohol: v.optional(v.number()),
});

type FoodLogEntryCore = {
  id: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  quantityGrams?: number;
  servingGrams?: number;
};

const OPTIONAL_FOOD_NUMBER_FIELDS = [
  "quantityGrams",
  "servingGrams",
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
  "vitaminC",
  "vitaminA",
  "vitaminD",
  "vitaminB12",
  "caffeine",
  "alcohol",
] as const;

function nonNegativeFiniteNumber(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeFoodLogEntry<T extends FoodLogEntryCore>(entry: T): T {
  const id = entry.id.trim();
  if (!id) throw new Error("Food entry id is required");

  const source = entry as T & Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    ...entry,
    id,
    calories: nonNegativeFiniteNumber(entry.calories),
    protein: nonNegativeFiniteNumber(entry.protein),
    carbs: nonNegativeFiniteNumber(entry.carbs),
    fat: nonNegativeFiniteNumber(entry.fat),
  };

  for (const key of OPTIONAL_FOOD_NUMBER_FIELDS) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      normalized[key] = value;
    } else {
      delete normalized[key];
    }
  }

  return normalized as T;
}

function normalizeFoodLogEntries<T extends FoodLogEntryCore>(
  entries: T[],
): T[] {
  const entriesById = new Map<string, T>();
  for (const entry of entries) {
    const normalized = normalizeFoodLogEntry(entry);
    // A client-generated id makes the mutation retry-safe. If a queued request
    // is replayed, the latest copy replaces the previous one instead of adding
    // its calories and macros a second time.
    entriesById.set(normalized.id, normalized);
  }
  return [...entriesById.values()];
}

function entryHasId(entry: unknown, id: string) {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "id" in entry &&
    (entry as { id?: unknown }).id === id
  );
}

// ── getDay ────────────────────────────────────────────────────────────────────

export const getDay = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const doc = await ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    return doc?.entries ?? [];
  },
});

// ── getRecent ────────────────────────────────────────────────────────────────

export const getRecent = query({
  args: {
    beforeOrOn: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const requestedLimit = args.limit ?? 21;
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(30, Math.floor(requestedLimit)))
      : 21;
    const beforeOrOn = args.beforeOrOn ?? "9999-12-31";

    const docs = await ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).lte("date", beforeOrOn),
      )
      .order("desc")
      .take(limit);

    return docs.map((doc) => ({
      date: doc.date,
      entries: doc.entries,
      updatedAt: doc.updatedAt,
    }));
  },
});

// ── setDay ────────────────────────────────────────────────────────────────────

export const setDay = mutation({
  args: {
    date: v.string(),
    entries: v.array(foodLogEntryValidator),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const entries = normalizeFoodLogEntries(args.entries);

    const existing = await ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        entries,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("foodLogs", {
        userId: user._id,
        date: args.date,
        entries,
        updatedAt: now,
      });
    }

    return { ok: true };
  },
});

// ── addEntry ─────────────────────────────────────────────────────────────────

export const addEntry = mutation({
  args: {
    date: v.string(),
    entry: foodLogEntryValidator,
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const entry = normalizeFoodLogEntry(args.entry);

    const existing = await ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        entries: [
          ...existing.entries.filter(
            (existingEntry) => !entryHasId(existingEntry, entry.id),
          ),
          entry,
        ],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("foodLogs", {
        userId: user._id,
        date: args.date,
        entries: [entry],
        updatedAt: now,
      });
    }

    return { ok: true };
  },
});
