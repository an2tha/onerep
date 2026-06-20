/**
 * Exercises loader - loads from free-exercise-db JSON
 * Run: bun src/loaders/exercises.ts
 */
import { db } from "../db";
import { exercises } from "../db/schema";
import { readFile } from "fs/promises";
import { join } from "path";

const EXERCISES_PATH = join(__dirname, "../../loaders/datasets/free-exercise-db/dist/exercises.json");

/**
 * Loads exercises from the local Free Exercise DB JSON file into the `exercises` database table.
 *
 * This operation is idempotent: it checks for existing rows and exits without modifying the table if any are present.
 * When loading, it reads the bundled JSON, transforms entries into database rows, and inserts them in batches while logging progress.
 */
async function loadExercises(): Promise<void> {
  console.log("[LOADER] Starting exercises load...");

  const existing = await db.select({ count: exercises }).from(exercises).limit(1);
  if (existing.length > 0) {
    console.log("[LOADER] Exercises already loaded, skipping...");
    return;
  }

  const content = await readFile(EXERCISES_PATH, "utf-8");
  const data = JSON.parse(content);

  console.log(`[LOADER] Processing ${data.length} exercises...`);

  const rows = data.map((ex: Record<string, unknown>) => ({
    exerciseId: String(ex.id || ""),
    userId: null, // null = global catalog
    name: String(ex.name || ""),
    category: String(ex.category || "strength"),
    level: String(ex.level || "beginner"),
    mechanic: ex.mechanic ? String(ex.mechanic) : null,
    equipment: ex.equipment ? String(ex.equipment) : null,
    force: ex.force ? String(ex.force) : null,
    primaryMuscles: ex.primaryMuscles || [],
    secondaryMuscles: ex.secondaryMuscles || [],
    instructions: ex.instructions || [],
  })).filter((r: { exerciseId: string }) => r.exerciseId);

  // Insert in batches
  const BATCH_SIZE = 1000;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(exercises).values(batch);
    console.log(`[LOADER] Loaded ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  
  console.log("[LOADER] Exercises load complete!");
}

export { loadExercises };