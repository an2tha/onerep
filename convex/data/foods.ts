import { v } from "convex/values";
import { action } from "../_generated/server";

const DATA_API_URL = process.env.DATA_API_URL;
const DATA_API_KEY = process.env.DATA_API_KEY;

function apiHeaders(): HeadersInit {
  return DATA_API_KEY ? { "x-api-key": DATA_API_KEY } : {};
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

function mapHitToResult(hit: any): any {
  const src = hit._source ?? hit;
  
  const getNutrient = (key: string): number => {
    const nutriments = src.nutriments;
    if (!nutriments) return 0;
    
    // If it's an array of {name, value, 100g, unit}
    if (Array.isArray(nutriments)) {
      const found = nutriments.find((n: any) => n.name === key);
      if (found) {
        // Prefer 100g, then value
        const val = found["100g"] !== undefined && found["100g"] !== null ? found["100g"] : found.value;
        return Number(val ?? 0);
      }
      return 0;
    }
    
    // If it's a flat object
    return Number(nutriments[`${key}_100g`] ?? nutriments[key] ?? 0);
  };

  const calories = src.calories_100g || getNutrient("energy-kcal");
  const protein = src.protein_100g || getNutrient("proteins");
  const carbs = src.carbs_100g || getNutrient("carbohydrates");
  const fat = src.fat_100g || getNutrient("fat");

  return {
    id: String(src.code ?? src._id ?? hit._id ?? ""),
    name: getMultilangText(src.product_name),
    brand: getMultilangText(src.brands),
    serving: "100 g",
    calories: Math.round(Number(calories)),
    protein: Math.round(Number(protein) * 10) / 10,
    carbs: Math.round(Number(carbs) * 10) / 10,
    fat: Math.round(Number(fat) * 10) / 10,
  };
}

function mapDocToDetail(doc: any): any {
  const nutriments = doc.nutriments;

  function get(key: string): number {
    if (!nutriments) return 0;
    if (Array.isArray(nutriments)) {
      const found = nutriments.find((n: any) => n.name === key);
      return Number(found?.["100g"] ?? found?.value ?? 0);
    }
    return Number(nutriments[`${key}_100g`] ?? nutriments[key] ?? 0);
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
