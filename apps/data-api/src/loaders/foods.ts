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

/**
 * Extracts a text string from a value or returns `null` when no text is present.
 *
 * Accepts a raw string or an object with a `text` property; empty strings, `null`, `undefined`,
 * and values that are not strings or objects with a string `text` yield `null`.
 *
 * @param val - A candidate value (string, object with `text`, or other) to extract text from
 * @returns The extracted text string, or `null` if no usable text is found
 */
function extractText(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val || null;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if ("text" in obj && typeof obj.text === "string") return obj.text;
  }
  return null;
}

/**
 * Retrieve a nutrient value from a nutriments map, preferring the per-100g variant and rounding to one decimal.
 *
 * @param nutriments - Object containing nutrient entries (e.g. `"fat_100g"` or `"fat"`)
 * @param key - Nutrient key name without the `_100g` suffix
 * @returns The nutrient value rounded to one decimal, or `0` if the value is missing or not a valid number
 */
function getNutrientValue(nutriments: Record<string, unknown>, key: string): number {
  const val = nutriments[`${key}_100g`] ?? nutriments[key];
  if (val === undefined || val === null) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : Math.round(n * 10) / 10;
}

/**
 * Loads foods from a Parquet file into the `foodfacts` table.
 *
 * If the `foodfacts` table already contains any rows, the function logs and exits without performing work.
 * Otherwise it logs notes about Parquet-to-CSV conversion and dynamically imports the `apache-arrow` helper
 * required for Parquet/Arrow processing. This implementation does not perform the full Parquet parsing or
 * database inserts; it expects an intermediate CSV conversion step in practice.
 *
 * @param parquetPath - filesystem path to the Parquet file (or intended source) for the food data
 */
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

  void parquetPath;

  // Parquet files need to be read via IPC/Arrow format
  // Convert first: parquet-tools cat datasets/foods.parquet --to csv > foods.csv
  // Or use: duckdb -c "COPY (SELECT * FROM 'datasets/foods.parquet') TO 'foods.csv' (HEADER, DELIMITER ',')"
  
  // For MVP, create a batch loader that reads CSV (after manual conversion)
  // In production CI/CD, pre-convert parquet to CSV
}

/**
 * Loads OpenFoodFacts rows from a tab-separated CSV/TSV file into the `foodfacts` table.
 *
 * Reads the file at `csvPath`, parses the header to locate expected columns (e.g., `code`, `product_name`,
 * `brands`, `serving_size`, `serving_quantity`, `nutriments`, `nutriscore_grade`, `nova_group`, `popularity_key`,
 * `nutriments_list`), transforms each data row into the database shape (deriving calories, protein, carbs, fat,
 * splitting core vs extra nutrients, normalizing grades/groups), and inserts records in batches.
 *
 * The function returns immediately without modifying the database if the `foodfacts` table already contains any rows.
 *
 * @param csvPath - Filesystem path to the input TSV (tab-separated) file whose first row is a header row matching the expected column names.
 */
export async function loadFoodsFromCSV(csvPath: string): Promise<void> {
  const existing = await db.select({ count: foodfacts }).from(foodfacts).limit(1);
  if (existing.length > 0) {
    console.log("[LOADER] Foods already loaded, skipping...");
    return;
  }

  // Use streaming reader with readline
  const readline = await import("readline");
  const stream = fs.createReadStream(csvPath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers: string[] = [];
  let codeIdx = -1, nameIdx = -1, brandsIdx = -1, servingIdx = -1, quantityIdx = -1;
  let nutrimentsIdx = -1, nutriscoreIdx = -1, novaIdx = -1, popKeyIdx = -1, extrasIdx = -1;
  let isFirstLine = true;
  let batch: any[] = [];
  let totalProcessed = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (isFirstLine) {
      // Parse header row
      headers = line.split("\t");
      codeIdx = headers.indexOf("code");
      nameIdx = headers.indexOf("product_name");
      brandsIdx = headers.indexOf("brands");
      servingIdx = headers.indexOf("serving_size");
      quantityIdx = headers.indexOf("serving_quantity");
      nutrimentsIdx = headers.indexOf("nutriments");
      nutriscoreIdx = headers.indexOf("nutriscore_grade");
      novaIdx = headers.indexOf("nova_group");
      popKeyIdx = headers.indexOf("popularity_key");
      extrasIdx = headers.indexOf("nutriments_list");
      isFirstLine = false;
      continue;
    }

    // Parse data row
    const cols = line.split("\t");
    if (!cols[codeIdx]) continue;

    const row = {
      code: cols[codeIdx] || "",
      name: extractText(cols[nameIdx]) || cols[codeIdx] || "",
      brand: cols[brandsIdx] || null,
      serving: cols[servingIdx] || "100 g",
      servingGrams: parseFloat(cols[quantityIdx]) || 100,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      nutriscoreGrade: cols[nutriscoreIdx]?.toUpperCase() || null,
      novaGroup: parseInt(cols[novaIdx]) || null,
      popularityKey: parseInt(cols[popKeyIdx]) || null,
      nutrients: JSON.stringify([]),
      extraNutrients: JSON.stringify([]),
    };

    try {
      const nutriments = cols[nutrimentsIdx] ? JSON.parse(cols[nutrimentsIdx]) : {};
      row.calories = getNutrientValue(nutriments, "energy-kcal");
      row.protein = getNutrientValue(nutriments, "proteins");
      row.carbs = getNutrientValue(nutriments, "carbohydrates");
      row.fat = getNutrientValue(nutriments, "fat");

      const extras = cols[extrasIdx] ? JSON.parse(cols[extrasIdx]) : [];
      const coreNutrients = ["Energy", "Fat", "Saturated-fat", "Carbohydrates", "Sugars", "Fiber", "Proteins", "Salt", "Sodium"];
      const nutrients = extras.filter((n: { name: string }) => coreNutrients.includes(n.name));
      const extraNutrients = extras.filter((n: { name: string }) => !coreNutrients.includes(n.name));
      row.nutrients = JSON.stringify(nutrients);
      row.extraNutrients = JSON.stringify(extraNutrients);
    } catch (e) {
      // Skip invalid JSON
    }

    batch.push(row);

    // Insert batch when it reaches the batch size
    if (batch.length >= BATCH_SIZE) {
      await db.insert(foodfacts).values(batch);
      totalProcessed += batch.length;
      console.log(`[LOADER] Loaded ${totalProcessed} foods...`);
      batch = [];
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    await db.insert(foodfacts).values(batch);
    totalProcessed += batch.length;
    console.log(`[LOADER] Loaded ${totalProcessed} foods...`);
  }

  console.log("[LOADER] Foods load complete!");
}