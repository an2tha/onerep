import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, env, internalMutation, internalQuery } from "../_generated/server";
import { getAuthUser } from "../lib/auth";

const API_URL = "https://platform.fatsecret.com/rest/server.api";
const TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const CONTENT_TTL_MS = 23 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 60 * 60 * 1000;
const TOKEN_SAFETY_MS = 5 * 60 * 1000;
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

let tokenCache: { token: string; expiresAt: number } | null = null;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
}

function number(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstServing(food: JsonRecord): JsonRecord {
  const servings = record(food.servings);
  const values = array(servings.serving).map(record);
  return values.find((serving) => number(serving.is_default) === 1) ?? values[0] ?? {};
}

function descriptionMacros(description: unknown) {
  const value = text(description) ?? "";
  const read = (label: string) =>
    number(value.match(new RegExp(`${label}:\\s*([0-9.,]+)`, "i"))?.[1]);
  return {
    calories: read("Calories"),
    fat: read("Fat"),
    carbs: read("Carbs"),
    protein: read("Protein"),
  };
}

function toCompatProduct(raw: unknown): JsonRecord | null {
  const food = record(raw);
  const foodId = text(food.food_id);
  if (!foodId) return null;
  const serving = firstServing(food);
  const fallback = descriptionMacros(food.food_description);
  const servingDescription = text(serving.serving_description) ??
    text(food.food_description)?.split(" - ")[0] ?? "1 serving";
  const metricAmount = number(serving.metric_serving_amount);
  const metricUnit = text(serving.metric_serving_unit);
  const scale = metricAmount > 0 && metricUnit === "g" ? 100 / metricAmount : 1;
  const nutrient = (key: string, fallbackValue = 0) => {
    const value = number(serving[key]) || fallbackValue;
    return Math.round(value * scale * 1000) / 1000;
  };
  const images = array(record(food.food_images).food_image).map(record);
  const imageUrl = text(images[0]?.image_url);
  return {
    code: foodId,
    product_name: text(food.food_name) ?? foodId,
    brands: text(food.brand_name),
    serving_size: servingDescription,
    serving_quantity: metricAmount > 0 ? metricAmount : undefined,
    image_front_small_url: imageUrl,
    nutriments: {
      "energy-kcal_100g": nutrient("calories", fallback.calories),
      proteins_100g: nutrient("protein", fallback.protein),
      carbohydrates_100g: nutrient("carbohydrate", fallback.carbs),
      fat_100g: nutrient("fat", fallback.fat),
      fiber_100g: nutrient("fiber"),
      sugars_100g: nutrient("sugar"),
      "saturated-fat_100g": nutrient("saturated_fat"),
      "trans-fat_100g": nutrient("trans_fat"),
      sodium_100g: nutrient("sodium"),
      sodium_unit: "mg",
      cholesterol_100g: nutrient("cholesterol"),
      cholesterol_unit: "mg",
      potassium_100g: nutrient("potassium"),
      potassium_unit: "mg",
      calcium_100g: nutrient("calcium"),
      calcium_unit: "mg",
      iron_100g: nutrient("iron"),
      iron_unit: "mg",
      "vitamin-a_100g": nutrient("vitamin_a"),
      "vitamin-a_unit": "mcg",
      "vitamin-c_100g": nutrient("vitamin_c"),
      "vitamin-c_unit": "mg",
      "vitamin-d_100g": nutrient("vitamin_d"),
      "vitamin-d_unit": "mcg",
    },
  };
}

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + TOKEN_SAFETY_MS) {
    return tokenCache.token;
  }
  const clientId = env.FATSECRET_CLIENT_ID;
  const clientSecret = env.FATSECRET_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("FatSecret credentials are not configured");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!response.ok) throw new Error(`FatSecret authentication failed (${response.status})`);
  const body = record(await response.json());
  const token = text(body.access_token);
  if (!token) throw new Error("FatSecret authentication returned no access token");
  tokenCache = {
    token,
    expiresAt: Date.now() + Math.max(60, number(body.expires_in)) * 1000,
  };
  return token;
}

async function apiCall(params: Record<string, string>) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ ...params, format: "json" }),
    });
    lastStatus = response.status;
    if (response.ok) {
      const body = await response.json();
      const error = record(record(body).error);
      if (error.code !== undefined) throw new Error(text(error.message) ?? "FatSecret API error");
      return body;
    }
    if (!TRANSIENT_STATUSES.has(response.status)) break;
  }
  throw new Error(`FatSecret request failed (${lastStatus})`);
}

export const getCached = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db.query("fatSecretCache").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    return entry && entry.expiresAt > Date.now() ? entry.value : null;
  },
});

export const putCached = internalMutation({
  args: { key: v.string(), value: v.any(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("fatSecretCache").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (existing) await ctx.db.replace(existing._id, args);
    else await ctx.db.insert("fatSecretCache", args);
    const expired = await ctx.db.query("fatSecretCache").withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now())).take(100);
    for (const entry of expired) await ctx.db.delete(entry._id);
  },
});

const operationValidator = v.union(v.literal("search"), v.literal("detail"), v.literal("barcode"));

export const proxy = action({
  args: {
    operation: operationValidator,
    value: v.string(),
    limit: v.optional(v.number()),
    language: v.optional(v.string()),
    region: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    if (!(await getAuthUser(ctx))) throw new Error("Not authenticated");
    const normalized = args.value.trim();
    const key = JSON.stringify({ ...args, value: normalized.toLowerCase() });
    const cached: unknown = await ctx.runQuery(internal.food.fatSecret.getCached, { key });
    if (cached !== null) return cached;

    let result: unknown;
    if (args.operation === "search") {
      const body = record(await apiCall({
        method: "foods.search",
        search_expression: normalized,
        max_results: String(Math.min(50, Math.max(1, args.limit ?? 25))),
        ...(args.region ? { region: args.region } : {}),
        ...(args.language ? { language: args.language } : {}),
      }));
      const foods = record(body.foods ?? body.foods_search);
      result = { products: array(foods.food).map(toCompatProduct).filter(Boolean), attribution: "fatsecret" };
    } else {
      let foodId = normalized;
      if (args.operation === "barcode") {
        const lookup = record(await apiCall({ method: "food.find_id_for_barcode", barcode: normalized }));
        foodId = text(record(lookup.food_id).value) ?? text(lookup.food_id) ?? "";
        if (!foodId) result = { status: 0, product: null, attribution: "fatsecret" };
      }
      if (result === undefined) {
        const body = record(await apiCall({ method: "food.get.v4", food_id: foodId }));
        const product = toCompatProduct(body.food);
        result = { status: product ? 1 : 0, product, attribution: "fatsecret" };
      }
    }
    await ctx.runMutation(internal.food.fatSecret.putCached, {
      key,
      value: result,
      expiresAt: Date.now() + (args.operation === "search" ? SEARCH_TTL_MS : CONTENT_TTL_MS),
    });
    return result;
  },
});
