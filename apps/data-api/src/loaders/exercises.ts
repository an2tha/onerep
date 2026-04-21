/**
 * Exercises loader - loads from free-exercise-db JSON
 * Run: npx tsx src/loaders/exercises.ts
 */
import * as fs from "fs";
import { db } from "../db";
import { exercises } from "../db/schema";

const EXERCISES_PATH = "./loaders/datasets/free-exercise-db/dist/exercises.json";

async function loadExercises(): Promise<void> {
  console.log("[LOADER] Starting exercises load...");
  
  const existing = await db.select({ count: exercises }).from(exercises).limit(1);
  if (existing.length > 0) {
    console.log("[LOADER] Exercises already loaded, skipping...");
    return;
  }

  const content = fs.readFileSync(EXERCISES_PATH, "utf-8");
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
    primaryMuscles: JSON.stringify(ex.primaryMuscles || []),
    secondaryMuscles: JSON.stringify(ex.secondaryMuscles || []),
    instructions: JSON.stringify(ex.instructions || []),
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
