/**
 * Foods loader - extracts only Convex-required fields from OpenFoodFacts parquet
 * Run: npx tsx src/loaders/foods.ts
 */
import * as fs from "fs";
import * as path from "path";
import { db } from "../db";
import { foodfacts } from "../db/schema";

const BATCH_SIZE = 5000;

interface ParquetRow {
  code?: string;
  product_name?: { text?: string } | string | null;
  brands?: string | null;
  serving_size?: string | null;
  serving_quantity?: number | null;
  "nutriments"?: Record<string, unknown>;
  "nutriscore_grade"?: string | null;
  "nova_group"?: number | null;
  popularity_key?: number | null;
  nutriments_list?: { name: string; value: string; unit: string }[];
}

function extractText(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val || null;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if ("text" in obj && typeof obj.text === "string") return obj.text;
  }
  return null;
}

function getNutrientValue(nutriments: Record<string, unknown>, key: string): number {
  const val = nutriments[`${key}_100g`] ?? nutriments[key];
  if (val === undefined || val === null) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : Math.round(n * 10) / 10;
}

async function loadFoods(parquetPath: string): Promise<void> {
  console.log("[LOADER] Starting foods load...");
  
  // Check if data already exists
  const existing = await db.select({ count: foodfacts }).from(foodfacts).limit(1);
  if (existing.length > 0) {
    console.log("[LOADER] Foods already loaded, skipping...");
    return;
  }

  // Use Apache Arrow/parquet-tools or read with a library
  // For simplicity, we'll read raw parquet bytes and parse
  // In production, use: import { tableFromIPC } from "apache-arrow";
  
  // For now, we'll use a simpler approach with CSV conversion
  // The parquet file is large (~7GB), so we process in chunks
  console.log("[LOADER] Note: Parquet parsing requires apache-arrow");
  console.log("[LOADER] Converting to intermediate format...");

  // Read parquet using apache-arrow
  const { tableFromIPC } = await import("apache-arrow");
  
  // Parquet files need to be read via IPC/Arrow format
  // Convert first: parquet-tools cat datasets/foods.parquet --to csv > foods.csv
  // Or use: duckdb -c "COPY (SELECT * FROM 'datasets/foods.parquet') TO 'foods.csv' (HEADER, DELIMITER ',')"
  
  // For MVP, create a batch loader that reads CSV (after manual conversion)
  // In production CI/CD, pre-convert parquet to CSV
}

export async function loadFoodsFromCSV(csvPath: string): Promise<void> {
  const existing = await db.select({ count: foodfacts }).from(foodfacts).limit(1);
  if (existing.length > 0) {
    console.log("[LOADER] Foods already loaded, skipping...");
    return;
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());
  const headers = lines[0].split("\t");
  
  // Map column indices
  const codeIdx = headers.indexOf("code");
  const nameIdx = headers.indexOf("product_name");
  const brandsIdx = headers.indexOf("brands");
  const servingIdx = headers.indexOf("serving_size");
  const quantityIdx = headers.indexOf("serving_quantity");
  const nutrimentsIdx = headers.indexOf("nutriments");
  const nutriscoreIdx = headers.indexOf("nutriscore_grade");
  const novaIdx = headers.indexOf("nova_group");
  const popKeyIdx = headers.indexOf("popularity_key");
  const extrasIdx = headers.indexOf("nutriments_list");

  console.log(`[LOADER] Processing ${lines.length - 1} foods...`);

  for (let i = 1; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);
    const rows = batch.map(line => {
      const cols = line.split("\t");
      const code = cols[codeIdx] || "";
      const name = extractText(cols[nameIdx]) || code;
      const brand = cols[brandsIdx] || null;
      const serving = cols[servingIdx] || "100 g";
      const quantity = parseFloat(cols[quantityIdx]) || 100;
      const nutriments = cols[nutrimentsIdx] ? JSON.parse(cols[nutrimentsIdx]) : {};
      const nutriscore = cols[nutriscoreIdx]?.toUpperCase() || null;
      const nova = parseInt(cols[novaIdx]) || null;
      const popKey = parseInt(cols[popKeyIdx]) || null;
      const extras = cols[extrasIdx] ? JSON.parse(cols[extrasIdx]) : [];

      const calories = getNutrientValue(nutriments, "energy-kcal");
      const protein = getNutrientValue(nutriments, "proteins");
      const carbs = getNutrientValue(nutriments, "carbohydrates");
      const fat = getNutrientValue(nutriments, "fat");

      // Split nutrients into core and extra
      const coreNutrients = ["Energy", "Fat", "Saturated-fat", "Carbohydrates", "Sugars", "Fiber", "Proteins", "Salt", "Sodium"];
      const nutrients = extras.filter((n: { name: string }) => coreNutrients.includes(n.name));
      const extraNutrients = extras.filter((n: { name: string }) => !coreNutrients.includes(n.name));

      return {
        code,
        name,
        brand,
        serving: `${quantity}g`,
        servingGrams: quantity,
        calories,
        protein,
        carbs,
        fat,
        nutriscoreGrade: nutriscore,
        novaGroup: nova,
        popularityKey: popKey,
        nutrients: JSON.stringify(nutrients),
        extraNutrients: JSON.stringify(extraNutrients),
      };
    }).filter(r => r.code);

    await db.insert(foodfacts).values(rows);
    console.log(`[LOADER] Loaded ${Math.min(i + BATCH_SIZE, lines.length - 1)}/${lines.length - 1}`);
  }
  console.log("[LOADER] Foods load complete!");
}
