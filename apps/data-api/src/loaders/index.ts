/**
 * Foods loader using DuckDB for efficient parquet streaming
 * Run: npx tsx src/loaders/index.ts
 */
import * as path from "path";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { foodfacts } from "../db/schema";

const LOADER_DIR = path.join(__dirname, "../../loaders");
const DATASETS_DIR = path.join(LOADER_DIR, "datasets");
const PARQUET_PATH = path.join(DATASETS_DIR, "foods.parquet");

const BATCH_SIZE = 10000;

/**
 * Load food records from the parquet dataset into the database's `foodfacts` table using DuckDB.
 *
 * Streams the parquet file in batches, transforms and normalizes each row to the target schema, and inserts records into `foodfacts`. If the table already contains rows the function returns early. Insert errors caused by duplicate-key conflicts are tolerated; other insert errors are logged. The DuckDB connection is closed when loading completes.
 */
async function loadFoodsWithDuckDB(): Promise<void> {
  console.log("[LOADER] Starting foods load with DuckDB...");
  
  // Check if already loaded
  const existing = await db.execute(sql`SELECT COUNT(*) FROM foodfacts`);
  const count = existing.rows?.[0]?.count ?? existing[0]?.count ?? 0;
  if (Number(count) > 0) {
    console.log(`[LOADER] ${count} foods already loaded, skipping...`);
    return;
  }

  // Use DuckDB to stream parquet
  const duckdb = await import("duckdb");
  const conn = new duckdb.Connection(new duckdb.Database());
  
  // Check row count first
  const rowCount = conn.query(`SELECT COUNT(*) FROM '${PARQUET_PATH}'`);
  const total = Number(rowCount.toArray()[0][0]);
  console.log(`[LOADER] Total foods in parquet: ${total}`);

  // Select only columns we need (Convex schema only)
  const query = `
    SELECT 
      code,
      COALESCE(
        CASE WHEN product_name LIKE '[{%' THEN NULL
        ELSE product_name
        END,
        code
      ) as name,
      NULLIF(brands, '') as brand,
      COALESCE(serving_quantity, 100) as serving_grams,
      COALESCE(serving_size, '100 g') as serving,
      COALESCE("nutriments"->>'energy-kcal_100g', "nutriments"->>'energy-kcal', '0')::DOUBLE as calories,
      COALESCE("nutriments"->>'proteins_100g', "nutriments"->>'proteins', '0')::DOUBLE as protein,
      COALESCE("nutriments"->>'carbohydrates_100g', "nutriments"->>'carbohydrates', '0')::DOUBLE as carbs,
      COALESCE("nutriments"->>'fat_100g', "nutriments"->>'fat', '0')::DOUBLE as fat,
      NULLIF(UPPER(nutriscore_grade), '') as nutriscore_grade,
      nova_group::INTEGER as nova_group,
      popularity_key::INTEGER as popularity_key,
      nutriments_list
    FROM '${PARQUET_PATH}'
    WHERE code IS NOT NULL AND code != ''
  `;

  // Process in batches using DuckDB's batch reader
  let offset = 0;
  let loaded = 0;

  while (true) {
    const batchQuery = query + ` LIMIT ${BATCH_SIZE} OFFSET ${offset}`;
    const result = conn.query(batchQuery);
    const rows = result.toArray();
    
    if (rows.length === 0) break;

    // Transform rows
    const transformed = rows.map((row: any) => {
      const nutriments_list = row.nutriments_list || [];
      const coreNutrients = ["Energy", "Fat", "Saturated-fat", "Carbohydrates", "Sugars", "Fiber", "Proteins", "Salt", "Sodium"];
      const nutrients = nutriments_list.filter((n: any) => coreNutrients.includes(n?.name));
      const extraNutrients = nutriments_list.filter((n: any) => !coreNutrients.includes(n?.name));

      return {
        code: String(row.code || ""),
        name: String(row.name || row.code || ""),
        brand: row.brand || null,
        serving: `${row.serving_grams || 100}g`,
        servingGrams: Number(row.serving_grams) || 100,
        calories: Math.round(Number(row.calories) * 10) / 10 || 0,
        protein: Math.round(Number(row.protein) * 10) / 10 || 0,
        carbs: Math.round(Number(row.carbs) * 10) / 10 || 0,
        fat: Math.round(Number(row.fat) * 10) / 10 || 0,
        nutriscoreGrade: row.nutriscore_grade || null,
        novaGroup: row.nova_group || null,
        popularityKey: row.popularity_key || null,
        nutrients: JSON.stringify(nutrients),
        extraNutrients: JSON.stringify(extraNutrients),
      };
    }).filter((r: any) => r.code);

    // Insert to PostgreSQL
    try {
      await db.insert(foodfacts).values(transformed as any).onConflictDoNothing();
    } catch (err) {
      // Ignore duplicate key errors (on conflict do nothing)
      const errMsg = String(err);
      if (!errMsg.includes("duplicate key") && !errMsg.includes("23505")) {
        console.error("[LOADER] Insert error:", err);
      }
    }

    loaded += rows.length;
    offset += BATCH_SIZE;
    console.log(`[LOADER] Loaded ${loaded}/${total} (${Math.round(loaded/total*100)}%)`);
    
    if (rows.length < BATCH_SIZE) break;
  }

  conn.close();
  console.log("[LOADER] Foods load complete!");
}

export { loadFoodsWithDuckDB };