/**
 * Main loader - orchestrates all data loading
 * Run: npx tsx src/loaders/main.ts
 */
import { execSync } from "child_process";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { loadExercises } from "./exercises";
import { foodfacts } from "../db/schema";

const LOADER_DIR = path.join(__dirname, "../../loaders");
const DATASETS_DIR = path.join(LOADER_DIR, "datasets");

/**
 * Ensure required dataset artifacts exist under DATASETS_DIR.
 *
 * If the local copy of `free-exercise-db` is missing, clones it from
 * https://github.com/yuhonas/free-exercise-db.git. If `foods.parquet` is missing,
 * downloads it from the Hugging Face product-database URL into the datasets directory.
 */
async function ensureDatasets(): Promise<void> {
  // Clone free-exercise-db if not present
  const exerciseDbPath = path.join(DATASETS_DIR, "free-exercise-db");
  if (!fs.existsSync(exerciseDbPath)) {
    console.log("[SETUP] Cloning free-exercise-db...");
    execSync("git clone https://github.com/yuhonas/free-exercise-db.git", {
      cwd: DATASETS_DIR,
      stdio: "inherit",
    });
  }

  // Download foods parquet if not present
  const foodsPath = path.join(DATASETS_DIR, "foods.parquet");
  if (!fs.existsSync(foodsPath)) {
    console.log("[SETUP] Downloading foods.parquet (this may take a while)...");
    execSync(
      `curl -L "https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet?download=true" -o "${foodsPath}"`,
      { stdio: "inherit" }
    );
  }
}

/**
 * Streams newline-delimited JSON from a spawned Python loader and inserts parsed food records into the `foodfacts` table in batches.
 *
 * Inserts are performed in batches of 5000; duplicate-key insertion errors are suppressed. The promise rejects if the Python process exits with a non-zero code or if the child process cannot be spawned.
 *
 * @returns `void` when the Python loader process completes successfully
 */
function loadFoodsFromPython(): Promise<void> {
  return new Promise((resolve, reject) => {
    const pythonExe = path.join(LOADER_DIR, ".venv", "bin", "python");
    const script = path.join(LOADER_DIR, "load_foods.py");
    
    console.log("[LOADER] Starting foods loader (Python/DuckDB)...\n");
    
    const proc = spawn(pythonExe, [script], { cwd: LOADER_DIR });
    
    const BATCH_SIZE = 5000;
    let batch: any[] = [];
    
    proc.stdout.on("data", async (data: Buffer) => {
      const lines = data.toString().trim().split("\n").filter(Boolean);
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed && parsed.code) {
            batch.push(parsed);
          }
        } catch (e) {
          // skip invalid JSON
        }
        
        if (batch.length >= BATCH_SIZE) {
          try {
            await db.insert(foodfacts).values(batch.map(f => ({
              code: String(f.code),
              name: String(f.name || f.code || ''),
              brand: f.brand || null,
              serving: String(f.serving || '100g'),
              servingGrams: Number(f.servingGrams) || 100,
              calories: Number(f.calories) || 0,
              protein: Number(f.protein) || 0,
              carbs: Number(f.carbs) || 0,
              fat: Number(f.fat) || 0,
              nutriscoreGrade: f.nutriscoreGrade || null,
              novaGroup: f.novaGroup || null,
              popularityKey: f.popularityKey || null,
              nutrients: JSON.stringify(f.nutrients || []),
              extraNutrients: JSON.stringify(f.extraNutrients || []),
            })) as any);
          } catch (err) {
            // Ignore duplicate key errors
            const errMsg = String(err);
            if (!errMsg.includes("duplicate key") && !errMsg.includes("23505")) {
              console.error("[DB] Insert error:", errMsg.substring(0, 200));
            }
          }
          batch = [];
        }
      }
    });
    
    proc.stderr.on("data", (data: Buffer) => {
      process.stderr.write(data);
    });
    
    proc.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error(`Python script exited with code ${code}`));
        return;
      }
      
      // Flush remaining batch
      if (batch.length > 0) {
        try {
          await db.insert(foodfacts).values(batch.map(f => ({
            code: String(f.code),
            name: String(f.name || f.code || ''),
            brand: f.brand || null,
            serving: String(f.serving || '100g'),
            servingGrams: Number(f.servingGrams) || 100,
            calories: Number(f.calories) || 0,
            protein: Number(f.protein) || 0,
            carbs: Number(f.carbs) || 0,
            fat: Number(f.fat) || 0,
            nutriscoreGrade: f.nutriscoreGrade || null,
            novaGroup: f.novaGroup || null,
            popularityKey: f.popularityKey || null,
            nutrients: JSON.stringify(f.nutrients || []),
            extraNutrients: JSON.stringify(f.extraNutrients || []),
          })) as any);
        } catch (err) {
          console.error('[DB] Flush error:', String(err).substring(0, 100));
        }
      }
      
      console.log("\n[LOADER] Foods load complete!");
      resolve();
    });
    
    proc.on("error", reject);
  });
}

/**
 * Orchestrates dataset preparation and ingestion into the PostgreSQL database, then logs final row counts.
 *
 * Performs a database connectivity check (exits the process with code 1 on failure), ensures required datasets
 * are available locally, loads exercise data, streams and loads food data into the `foodfacts` table, and prints
 * counts for both `foodfacts` and `exercises` upon completion.
 */
async function main(): Promise<void> {
  console.log("[LOADER] OneRep Data Loader Starting...\n");

  // Check DB connection
  try {
    await db.execute(sql`SELECT 1`);
    console.log("[DB] Connected to PostgreSQL ✓\n");
  } catch (err) {
    console.error("[DB] Connection failed:", err);
    process.exit(1);
  }

  // Ensure datasets
  console.log("[SETUP] Ensuring datasets...");
  await ensureDatasets();
  console.log("");

  // Run migrations (tables already created via drizzle-kit)
  console.log("[DB] Tables ready ✓\n");

  // Load exercises (fast - JSON file)
  console.log("[LOADER] Loading exercises...");
  await loadExercises();
  console.log("");

  // Load foods (uses Python/DuckDB to stream parquet → PostgreSQL)
  console.log("[LOADER] Loading foods (streaming from parquet)...\n");
  await loadFoodsFromPython();

  // Verify counts
  const foodCount = await db.execute(sql<{count: number}>`SELECT COUNT(*) FROM foodfacts`);
  const exCount = await db.execute(sql<{count: number}>`SELECT COUNT(*) FROM exercises`);
  console.log(`\n[LOADER] ✓ Complete!`);
  console.log(`  Foods: ${foodCount.rows[0]?.count ?? 0}`);
  console.log(`  Exercises: ${exCount.rows[0]?.count ?? 0}`);
}

main().catch(err => {
  console.error("[LOADER] Fatal error:", err);
  process.exit(1);
});