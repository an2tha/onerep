import { v } from "convex/values";
import { action } from "../_generated/server";

const DATA_API_URL = process.env.DATA_API_URL?.replace(/\/+$/, "");
const DATA_API_KEY = process.env.DATA_API_KEY;

function apiHeaders(): HeadersInit {
  return DATA_API_KEY ? { "x-api-key": DATA_API_KEY } : {};
}

function apiUrl(path: string, params?: URLSearchParams): string | null {
  if (!DATA_API_URL) return null;
  const prefix = DATA_API_URL.endsWith("/api/v1") ? "" : "/api/v1";
  const query = params ? `?${params}` : "";
  return `${DATA_API_URL}${prefix}${path}${query}`;
}

function toNumber(value: any): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstNumber(...values: any[]): number {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== 0) return parsed;
  }
  return 0;
}

function getMultilangText(value: any): string {
  if (!value) return "Unknown";
  
  // If it's already an array, use it directly
  if (Array.isArray(value)) {
    const main = value.find((v: any) => v.lang === "main");
    if (main?.text) return main.text;
    const en = value.find((v: any) => v.lang === "en");
    if (en?.text) return en.text;
    return value[0]?.text || "Unknown";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    // Handle stringified Python-style lists: "[{'lang': 'main', 'text': '...'}, ...]"
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        // More robust JSON-like parsing for Python repr() output
        // Replace ' with " but try not to break valid double quotes or contractions
        // This is a heuristic: replace ' followed by {[, ]}, or : with "
        // and replace {[, ]}, or : followed by ' with "
        const fixed = trimmed
          .replace(/([\{\[,: \t])'|'([\}\],: \t])/g, '$1"$2')
          .replace(/^'|'$/g, '"');
        
        const parsed = JSON.parse(fixed);
        if (Array.isArray(parsed)) {
          const main = parsed.find((v: any) => v.lang === "main");
          if (main?.text) return main.text;
          const en = parsed.find((v: any) => v.lang === "en");
          if (en?.text) return en.text;
          return parsed[0]?.text || "Unknown";
        }
        if (typeof parsed === "object" && parsed !== null) {
          if (parsed.text) return parsed.text;
        }
      } catch {
        // Fallback for messy strings: try to extract text between 'text': '...'
        const match = trimmed.match(/'text':\s*'([^']*)'/);
        if (match) return match[1];
        
        // Strip common Python-style debris
        return trimmed.replace(/[\[\]']/g, "").replace(/\{lang: [^,]+, text: /g, "").replace(/\}/g, "").trim() || "Unknown";
      }
    }
    return value;
  }
  
  return String(value) || "Unknown";
}

/**
 * Map a search hit or source document into a normalized product result suitable for UI consumption.
 *
 * @param hit - A search hit object (may be the raw document or an object with a `_source` property) containing product fields and `nutriments`.
 * @returns An object with the following properties:
 *  - `id`: string identifier (from `code`, `_id`, or hit metadata)
 *  - `name`: localized product name
 *  - `brand`: localized brand name
 *  - `serving`: serving label (`"100 g"`)
 *  - `calories`: calories per 100 g as an integer
 *  - `protein`: protein per 100 g as a number rounded to one decimal place
 *  - `carbs`: carbohydrates per 100 g as a number rounded to one decimal place
 *  - `fat`: fat per 100 g as a number rounded to one decimal place
 */
function mapHitToResult(hit: any): any {
  const src = hit._source ?? hit;

  const getNutrient = (key: string): number => {
    const nutriments = src.nutriments ?? src.other_nutrients;
    if (!nutriments) return 0;

    if (Array.isArray(nutriments)) {
      const normalizedKey = key.toLowerCase();
      const found = nutriments.find((n: any) => String(n.name ?? "").toLowerCase() === normalizedKey);
      if (found) {
        const val = found["100g"] !== undefined && found["100g"] !== null ? found["100g"] : found.value;
        return toNumber(val);
      }
      return 0;
    }

    return toNumber(nutriments[`${key}_100g`] ?? nutriments[key]);
  };

  const serving = [src.servingSize, src.servingUnit].filter(Boolean).join(" ") || "100 g";
  const calories = firstNumber(src.calories, src.calories_100g, getNutrient("energy-kcal"));
  const protein = firstNumber(src.protein, src.protein_100g, getNutrient("proteins"));
  const carbs = firstNumber(src.carbohydrates, src.carbs, src.carbs_100g, getNutrient("carbohydrates"));
  const fat = firstNumber(src.fat, src.fat_100g, getNutrient("fat"));

  return {
    id: String(src.code ?? src.id ?? src._id ?? hit._id ?? src.externalId ?? ""),
    name: getMultilangText(src.product_name ?? src.name),
    brand: getMultilangText(src.brands ?? src.brand),
    serving,
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
  };
}

function mapDocToDetail(doc: any): any {
  const nutriments = doc.nutriments ?? doc.other_nutrients;

  function get(key: string): number {
    const columnAliases: Record<string, any> = {
      "energy-kcal": doc.calories,
      proteins: doc.protein,
      carbohydrates: doc.carbohydrates ?? doc.carbs,
      fat: doc.fat,
      fiber: doc.fiber,
      sugars: doc.sugar,
      sodium: doc.sodium,
    };
    const columnValue = toNumber(columnAliases[key]);
    if (columnValue !== 0) return columnValue;

    if (!nutriments) return 0;
    if (Array.isArray(nutriments)) {
      const normalizedKey = key.toLowerCase();
      const found = nutriments.find((n: any) => String(n.name ?? "").toLowerCase() === normalizedKey);
      return toNumber(found?.["100g"] ?? found?.value);
    }
    return toNumber(nutriments[`${key}_100g`] ?? nutriments[key]);
  }

  const CORE = [
    { key: "energy", name: "Calories", nutrient: "energy-kcal", unit: "kcal" },
    { key: "protein", name: "Protein", nutrient: "proteins", unit: "g" },
    {
      key: "carbs",
      name: "Carbohydrates",
      nutrient: "carbohydrates",
      unit: "g",
    },
    { key: "fat", name: "Total Fat", nutrient: "fat", unit: "g" },
    { key: "fiber", name: "Dietary Fiber", nutrient: "fiber", unit: "g" },
    { key: "sugar", name: "Total Sugars", nutrient: "sugars", unit: "g" },
    {
      key: "satFat",
      name: "Saturated Fat",
      nutrient: "saturated-fat",
      unit: "g",
    },
    { key: "sodium", name: "Sodium", nutrient: "sodium", unit: "mg" },
    {
      key: "cholesterol",
      name: "Cholesterol",
      nutrient: "cholesterol",
      unit: "mg",
    },
  ];

  const EXTRA = [
    { key: "calcium", name: "Calcium", nutrient: "calcium", unit: "mg" },
    { key: "iron", name: "Iron", nutrient: "iron", unit: "mg" },
    { key: "potassium", name: "Potassium", nutrient: "potassium", unit: "mg" },
    { key: "vitaminC", name: "Vitamin C", nutrient: "vitamin-c", unit: "mg" },
  ];

  const servingLabel = [doc.servingSize, doc.servingUnit].filter(Boolean).join(" ") || "100 g";

  return {
    id: String(doc.code ?? doc.id ?? doc.externalId ?? ""),
    name: getMultilangText(doc.product_name ?? doc.name),
    brand: getMultilangText(doc.brands ?? doc.brand),
    serving: servingLabel,
    calories: Math.round(get("energy-kcal")),
    protein: get("proteins"),
    carbs: get("carbohydrates"),
    fat: get("fat"),
    servingGrams: doc.servingUnit === "g" ? toNumber(doc.servingSize) || null : null,
    servingLabel,
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

async function fetchFoodDetail(fdcId: string): Promise<any | null> {
  const encoded = encodeURIComponent(fdcId);
  const paths = /^\d+$/.test(fdcId)
    ? [`/foods/${encoded}`, `/foods/barcode/${encoded}`]
    : [`/foods/barcode/${encoded}`];

  for (const path of paths) {
    const url = apiUrl(path);
    if (!url) return null;
    const response = await fetch(url, { headers: apiHeaders() });
    if (response.ok) return response.json();
  }

  return null;
}

export const search = action({
  args: { query: v.string() },
  handler: async (_ctx, args) => {
    if (args.query.length < 2) return [];
    const params = new URLSearchParams({ q: args.query });
    const url = apiUrl("/foods/search", params);
    if (!url) return [];
    const response = await fetch(url, { headers: apiHeaders() });
    if (!response.ok) return [];
    const hits = await response.json();
    return (Array.isArray(hits) ? hits : []).map(mapHitToResult);
  },
});

export const fetchAndCache = action({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (_ctx, args) => {
    const params = new URLSearchParams({ q: args.query });
    if (args.limit) params.set("limit", String(Math.min(args.limit, 50)));
    const url = apiUrl("/foods/search", params);
    if (!url) throw new Error("DATA_API_URL environment variable is required");
    const response = await fetch(url, { headers: apiHeaders() });
    if (!response.ok) throw new Error(`Data API error: ${response.statusText}`);
    const hits = await response.json();
    return (Array.isArray(hits) ? hits : []).map(mapHitToResult);
  },
});

export const getDetail = action({
  args: { fdcId: v.string() },
  handler: async (_ctx, { fdcId }) => {
    const doc = await fetchFoodDetail(fdcId);
    return doc ? mapDocToDetail(doc) : null;
  },
});

export const getById = action({
  args: { fdcId: v.string() },
  handler: async (_ctx, { fdcId }) => {
    const doc = await fetchFoodDetail(fdcId);
    return doc ? mapDocToDetail(doc) : null;
  },
});
