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

  // Read parquet using apache-arrow
  const { tableFromIPC } = await import("apache-arrow");
  
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
