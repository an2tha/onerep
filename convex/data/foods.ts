import { v } from "convex/values";
import { action } from "../_generated/server";

const DATA_API_URL = process.env.DATA_API_URL;
const DATA_API_KEY = process.env.DATA_API_KEY;

function apiHeaders(): HeadersInit {
  return DATA_API_KEY ? { "x-api-key": DATA_API_KEY } : {};
}

function getMultilangText(value: any): string {
  if (!value) return "Unknown";
  if (typeof value === "string") {
    if (value.startsWith("[")) {
      try {
        const fixed = value.replace(/'/g, '"');
        const parsed = JSON.parse(fixed);
        const main = parsed.find((v: any) => v.lang === "main");
        if (main?.text) return main.text;
        const en = parsed.find((v: any) => v.lang === "en");
        if (en?.text) return en.text;
        return parsed[0]?.text || "Unknown";
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    const main = value.find((v: any) => v.lang === "main");
    if (main?.text) return main.text;
    const en = value.find((v: any) => v.lang === "en");
    if (en?.text) return en.text;
    return value[0]?.text || "Unknown";
  }
  return String(value) || "Unknown";
}

function mapHitToResult(hit: any): any {
  const src = hit._source ?? hit;
  return {
    id: String(src.code ?? hit._id ?? ""),
    name: getMultilangText(src.product_name),
    brand: getMultilangText(src.brands),
    serving: "100 g",
    calories: String(Math.round(Number(src.calories_100g ?? 0))),
    protein: String(Math.round(Number(src.protein_100g ?? 0) * 10) / 10),
    carbs: String(Math.round(Number(src.carbs_100g ?? 0) * 10) / 10),
    fat: String(Math.round(Number(src.fat_100g ?? 0) * 10) / 10),
  };
}

function mapDocToDetail(doc: any): any {
  const nm: Record<string, number> = doc.nutriments ?? {};

  function get(key: string): number {
    return Number(nm[`${key}_100g`] ?? nm[key] ?? 0);
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

  return {
    id: String(doc.code ?? ""),
    name: getMultilangText(doc.product_name),
    brand: getMultilangText(doc.brands),
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

export const search = action({
  args: { query: v.string() },
  handler: async (_ctx, args) => {
    if (args.query.length < 2) return [];
    const url = `${DATA_API_URL}/api/v1/foods/search?q=${encodeURIComponent(args.query)}`;
    const response = await fetch(url, { headers: apiHeaders() });
    if (!response.ok) return [];
    const hits = await response.json();
    return (Array.isArray(hits) ? hits : []).map(mapHitToResult);
  },
});

export const fetchAndCache = action({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (_ctx, args) => {
    const url = `${DATA_API_URL}/api/v1/foods/search?q=${encodeURIComponent(args.query)}`;
    const response = await fetch(url, { headers: apiHeaders() });
    if (!response.ok) throw new Error(`Data API error: ${response.statusText}`);
    const hits = await response.json();
    return (Array.isArray(hits) ? hits : []).map(mapHitToResult);
  },
});

export const getDetail = action({
  args: { fdcId: v.string() },
  handler: async (_ctx, { fdcId }) => {
    const url = `${DATA_API_URL}/api/v1/foods/barcode/${encodeURIComponent(fdcId)}`;
    const response = await fetch(url, { headers: apiHeaders() });
    if (!response.ok) return null;
    const doc = await response.json();
    return mapDocToDetail(doc);
  },
});

export const getById = action({
  args: { fdcId: v.string() },
  handler: async (_ctx, { fdcId }) => {
    const url = `${DATA_API_URL}/api/v1/foods/barcode/${encodeURIComponent(fdcId)}`;
    const response = await fetch(url, { headers: apiHeaders() });
    if (!response.ok) return null;
    const doc = await response.json();
    return mapDocToDetail(doc);
  },
});
