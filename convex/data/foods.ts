import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "../_generated/server";
import { internal } from "../_generated/api";

const DATA_API_URL = process.env.DATA_API_URL;
const DATA_API_KEY = process.env.DATA_API_KEY;

function apiHeaders(): HeadersInit {
  return DATA_API_KEY ? { "x-api-key": DATA_API_KEY } : {};
}

// Maps an ES hit (from /api/v1/foods/search) to the FoodResult shape
function mapHitToResult(hit: any): any {
  const src = hit._source ?? hit;
  return {
    id: String(src.code ?? hit._id ?? ""),
    name: src.product_name || "Unknown",
    brand: src.brands || "",
    serving: "100 g",
    calories: String(Math.round(Number(src.calories_100g ?? 0))),
    protein: String(Math.round(Number(src.protein_100g ?? 0) * 10) / 10),
    carbs: String(Math.round(Number(src.carbs_100g ?? 0) * 10) / 10),
    fat: String(Math.round(Number(src.fat_100g ?? 0) * 10) / 10),
  };
}

// Maps a full MongoDB doc (from /api/v1/foods/barcode/:code) to the FoodDetail shape
function mapDocToDetail(doc: any): any {
  // nutriments is a flat dict from OpenFoodFacts: { "energy-kcal_100g": 530, "proteins_100g": 6.3, ... }
  const nm: Record<string, number> = doc.nutriments ?? {};

  function get(key: string): number {
    return Number(nm[`${key}_100g`] ?? nm[key] ?? 0);
  }

  const CORE = [
    { key: "energy",      name: "Calories",      nutrient: "energy-kcal",   unit: "kcal" },
    { key: "protein",     name: "Protein",        nutrient: "proteins",      unit: "g"    },
    { key: "carbs",       name: "Carbohydrates",  nutrient: "carbohydrates", unit: "g"    },
    { key: "fat",         name: "Total Fat",      nutrient: "fat",           unit: "g"    },
    { key: "fiber",       name: "Dietary Fiber",  nutrient: "fiber",         unit: "g"    },
    { key: "sugar",       name: "Total Sugars",   nutrient: "sugars",        unit: "g"    },
    { key: "satFat",      name: "Saturated Fat",  nutrient: "saturated-fat", unit: "g"    },
    { key: "sodium",      name: "Sodium",         nutrient: "sodium",        unit: "mg"   },
    { key: "cholesterol", name: "Cholesterol",    nutrient: "cholesterol",   unit: "mg"   },
  ];

  const EXTRA = [
    { key: "calcium",   name: "Calcium",   nutrient: "calcium",   unit: "mg" },
    { key: "iron",      name: "Iron",      nutrient: "iron",      unit: "mg" },
    { key: "potassium", name: "Potassium", nutrient: "potassium", unit: "mg" },
    { key: "vitaminC",  name: "Vitamin C", nutrient: "vitamin-c", unit: "mg" },
  ];

  return {
    id: String(doc.code ?? ""),
    name: doc.product_name || "Unknown",
    brand: doc.brands || "",
    serving: "100 g",
    calories: Math.round(get("energy-kcal")),
    protein: get("proteins"),
    carbs: get("carbohydrates"),
    fat: get("fat"),
    servingGrams: null,
    servingLabel: "100 g",
    nutriscoreGrade: doc.nutriscore_grade?.toLowerCase() || undefined,
    novaGroup: doc.nova_group || undefined,
    nutrients: CORE.map(({ key, name, nutrient, unit }) => ({
      key,
      name,
      per100g: get(nutrient),
      unit,
    })),
    extraNutrients: EXTRA.map(({ key, name, nutrient, unit }) => ({
      key,
      name,
      per100g: get(nutrient),
      unit,
    })).filter((n) => n.per100g > 0),
  };
}

// Cache-only lookup: returns null on miss so the client knows to call fetchAndCache
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (args.query.length < 2) return null;
    const cache = await ctx.db
      .query("searchCache")
      .withIndex("by_query", (q) => q.eq("query", args.query.toLowerCase()))
      .first();
    return cache?.results ?? null;
  },
});

// Fetches from the data-api, maps results, writes to cache — query re-runs reactively
export const fetchAndCache = action({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const url = `${DATA_API_URL}/api/v1/foods/search?q=${encodeURIComponent(args.query)}`;
    const response = await fetch(url, { headers: apiHeaders() });
    if (!response.ok) throw new Error(`Data API error: ${response.statusText}`);

    const hits = await response.json();
    const results = (Array.isArray(hits) ? hits : []).map(mapHitToResult);

    await ctx.runMutation(internal.data.foods.writeCache, {
      query: args.query.toLowerCase(),
      results,
    });

    return results;
  },
});

export const internalGetCache = internalQuery({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("searchCache")
      .withIndex("by_query", (q) => q.eq("query", args.query.toLowerCase()))
      .first();
  },
});

export const writeCache = internalMutation({
  args: { query: v.string(), results: v.array(v.any()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("searchCache")
      .withIndex("by_query", (q) => q.eq("query", args.query))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { results: args.results, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("searchCache", {
        query: args.query,
        results: args.results,
        createdAt: Date.now(),
      });
    }
  },
});

// Detail cache lookup
export const getDetail = query({
  args: { fdcId: v.string() },
  handler: async (ctx, { fdcId }) => {
    const cached = await ctx.db
      .query("foodDetailCache")
      .withIndex("by_fdcId", (q) => q.eq("fdcId", fdcId))
      .first();
    return cached?.detail ?? null;
  },
});

export const writeDetailCache = internalMutation({
  args: { fdcId: v.string(), detail: v.any() },
  handler: async (ctx, { fdcId, detail }) => {
    const existing = await ctx.db
      .query("foodDetailCache")
      .withIndex("by_fdcId", (q) => q.eq("fdcId", fdcId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { detail, createdAt: Date.now() });
    } else {
      await ctx.db.insert("foodDetailCache", { fdcId, detail, createdAt: Date.now() });
    }
  },
});

// Fetches full food detail by barcode (code) from data-api, caches it
export const getById = action({
  args: { fdcId: v.string() },
  handler: async (ctx, { fdcId }) => {
    const cached = await ctx.runQuery(internal.data.foods.getDetail, { fdcId });
    if (cached) return cached;

    const url = `${DATA_API_URL}/api/v1/foods/barcode/${encodeURIComponent(fdcId)}`;
    const response = await fetch(url, { headers: apiHeaders() });
    if (!response.ok) return null;

    const doc = await response.json();
    const detail = mapDocToDetail(doc);

    await ctx.runMutation(internal.data.foods.writeDetailCache, { fdcId, detail });
    return detail;
  },
});
