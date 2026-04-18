import { v } from "convex/values";
import { action, internalMutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { authComponent } from "../auth";

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";

const USDA_API_KEY = process.env.USDA_API_KEY;

// Maps a USDA food object (single-food endpoint) to FoodDetail
function mapUsdaDetailToFoodDetail(food: any): any {
  const nutrients: any[] = food.foodNutrients ?? [];

  function get(name: string): number {
    const n = nutrients.find((n: any) =>
      (n.nutrient?.name ?? n.nutrientName ?? "")
        .toLowerCase()
        .includes(name.toLowerCase())
    );
    return n ? n.amount ?? n.value ?? 0 : 0;
  }

  const CORE = [
    { key: "energy",   name: "Calories",      nutrient: "Energy",                unit: "kcal" },
    { key: "protein",  name: "Protein",        nutrient: "Protein",               unit: "g"    },
    { key: "carbs",    name: "Carbohydrates",  nutrient: "Carbohydrate",          unit: "g"    },
    { key: "fat",      name: "Total Fat",      nutrient: "Total lipid",           unit: "g"    },
    { key: "fiber",    name: "Dietary Fiber",  nutrient: "Fiber",                 unit: "g"    },
    { key: "sugar",    name: "Total Sugars",   nutrient: "Sugars",                unit: "g"    },
    { key: "satFat",   name: "Saturated Fat",  nutrient: "Saturated",             unit: "g"    },
    { key: "sodium",   name: "Sodium",         nutrient: "Sodium",                unit: "mg"   },
    { key: "cholesterol", name: "Cholesterol", nutrient: "Cholesterol",           unit: "mg"   },
  ];

  const EXTRA = [
    { key: "calcium",   name: "Calcium",    nutrient: "Calcium",   unit: "mg" },
    { key: "iron",      name: "Iron",       nutrient: "Iron",      unit: "mg" },
    { key: "potassium", name: "Potassium",  nutrient: "Potassium", unit: "mg" },
    { key: "vitaminC",  name: "Vitamin C",  nutrient: "Vitamin C", unit: "mg" },
    { key: "vitaminD",  name: "Vitamin D",  nutrient: "Vitamin D", unit: "µg" },
    { key: "vitaminB12",name: "Vitamin B12",nutrient: "Vitamin B-12", unit: "µg" },
  ];

  return {
    id: String(food.fdcId),
    name: food.description,
    brand: food.brandName || food.brandOwner || "",
    serving: food.servingSize ? `${food.servingSize} ${food.servingSizeUnit ?? "g"}` : "100 g",
    calories: Math.round(get("Energy")),
    protein: get("Protein"),
    carbs: get("Carbohydrate"),
    fat: get("Total lipid"),
    servingGrams: food.servingSize ?? null,
    servingLabel: food.servingSize ? `${food.servingSize} ${food.servingSizeUnit ?? "g"}` : "100 g",
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

function getNutrientValue(nutrients: any[], name: string): number {
  const n = nutrients.find(
    (n: any) =>
      n.nutrientName?.toLowerCase().includes(name.toLowerCase()) ||
      n.name?.toLowerCase().includes(name.toLowerCase()),
  );
  return n ? n.value || n.amount || 0 : 0;
}

function mapUsdaToFoodResult(food: any): any {
  const nutrients = food.foodNutrients ?? [];
  return {
    id: String(food.fdcId),
    name: food.description,
    brand: food.brandName || food.brandOwner || "",
    serving: `${food.servingSize || 100} ${food.servingSizeUnit || "g"}`,
    calories: String(Math.round(getNutrientValue(nutrients, "Energy"))),
    protein: String(getNutrientValue(nutrients, "Protein")),
    carbs: String(getNutrientValue(nutrients, "Carbohydrate")),
    fat: String(getNutrientValue(nutrients, "Total lipid (fat)")),
  };
}

async function getCachedResult(ctx: any, queryStr: string) {
  return await ctx.db
    .query("searchCache")
    .withIndex("by_query", (q: any) => q.eq("query", queryStr.toLowerCase()))
    .first();
}

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (!args.query) return [];
    const cache = await getCachedResult(ctx, args.query);
    return cache?.results ?? null;
  },
});

export const fetchAndCache = action({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(args.query)}&pageSize=${args.limit ?? 10}`,
    );

    if (!response.ok) throw new Error(`USDA API error: ${response.statusText}`);

    const data = await response.json();
    const results = (data.foods ?? []).map(mapUsdaToFoodResult);

    await ctx.runMutation(internal.data.foods.writeCache, {
      query: args.query.toLowerCase(),
      results,
    });

    return results;
  },
});

export const writeCache = internalMutation({
  args: {
    query: v.string(),
    results: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await getCachedResult(ctx, args.query);
    if (existing) {
      await ctx.db.patch(existing._id, {
        results: args.results,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("searchCache", {
        query: args.query,
        results: args.results,
        createdAt: Date.now(),
      });
    }
  },
});

// ── Single-food detail cache ───────────────────────────────────────────────────

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

export const getById = action({
  args: { fdcId: v.string() },
  handler: async (ctx, { fdcId }) => {
    // 1. Cache hit — return immediately
    const cached = await ctx.runQuery(internal.data.foods.getDetail, { fdcId });
    if (cached) return cached;

    // 2. Cache miss — fetch from USDA
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const response = await fetch(
      `${USDA_BASE}/food/${encodeURIComponent(fdcId)}?api_key=${USDA_API_KEY}`,
    );
    if (!response.ok) throw new Error(`USDA API error: ${response.statusText}`);

    const food = await response.json();
    const detail = mapUsdaDetailToFoodDetail(food);

    // 3. Write to cache and return
    await ctx.runMutation(internal.data.foods.writeDetailCache, { fdcId, detail });
    return detail;
  },
});