import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DuckDBInstance } from "@duckdb/node-api";
import { DatasourceDatabase } from "./database.ts";
import { normalizeUsdaFood } from "./usda.ts";
import { syncOff } from "./off.ts";
import { AtomicDatabaseSlot } from "./database-slot.ts";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function temp() { const path = await mkdtemp(join(tmpdir(), "onerep-datasource-")); directories.push(path); return path; }

describe("USDA normalization and search", () => {
  test("normalizes nutrients, portions, and indexes names", async () => {
    const food = normalizeUsdaFood({ fdcId: 123, dataType: "Foundation", description: "Greek yogurt, plain", foodCategory: { description: "Dairy" }, foodNutrients: [
      { amount: 97, nutrient: { name: "Energy", unitName: "kcal" } }, { amount: 9, nutrient: { name: "Protein", unitName: "g" } },
      { amount: 3.9, nutrient: { name: "Carbohydrate, by difference", unitName: "g" } }, { amount: 5, nutrient: { name: "Total lipid (fat)", unitName: "g" } },
    ], foodPortions: [{ amount: 1, gramWeight: 170, measureUnit: { name: "cup" } }] });
    expect(food?.protein100g).toBe(9); expect(food?.portions?.[0]?.grams).toBe(170);
    const dir = await temp(); const db = new DatasourceDatabase("usda", join(dir, "usda.sqlite")); db.insertUsda([food!]); db.rebuildUsdaSearch();
    const results = db.searchFoods("greek yog", 10) as Array<{ fdc_id: number }>; expect(results[0]?.fdc_id).toBe(123); db.close();
  });
});

describe("Open Food Facts projection", () => {
  test("projects a wide parquet file into exact barcode SQLite rows", async () => {
    const dir = await temp(); const parquet = join(dir, "off.parquet"); const duck = await DuckDBInstance.create(":memory:"); const connection = await duck.connect();
    await connection.run(`copy (select '4008400402222' code, 'Hazelnut Spread' product_name, 'Example' brands, 'de:germany' countries_tags, 539.0 "energy-kcal_100g", 6.3 proteins_100g, 57.5 carbohydrates_100g, 30.9 fat_100g, 0.91 completeness) to '${parquet.replaceAll("'", "''")}' (format parquet)`); connection.closeSync();
    const db = new DatasourceDatabase("off", join(dir, "off.sqlite")); const count = await syncOff({ db, cacheDir: dir, input: parquet, countries: ["germany"], withSearch: true });
    expect(count).toBe(1); expect(db.barcode("4008400402222")?.name).toBe("Hazelnut Spread"); expect((db.searchProducts("hazel", 5) as unknown[]).length).toBe(1); db.close();
  });
});

describe("atomic database deployment", () => {
  test("keeps live data during failed builds, promotes valid builds, and rolls back", async () => {
    const dir = await temp(); const slot = new AtomicDatabaseSlot("usda", join(dir, "usda.sqlite"));
    slot.db.insertUsda([{ fdcId: 1, dataType: "fixture", name: "Old food" }]); slot.db.rebuildUsdaSearch();
    await expect(slot.buildAndPromote("empty", async () => 0)).rejects.toThrow("empty");
    expect(slot.db.food(1)?.name).toBe("Old food");
    await slot.buildAndPromote("valid", async (database) => { database.insertUsda([{ fdcId: 2, dataType: "fixture", name: "New food" }]); database.rebuildUsdaSearch(); return 1; });
    expect(slot.db.food(1)).toBeUndefined(); expect(slot.db.food(2)?.name).toBe("New food"); expect(slot.hasRollback).toBe(true);
    slot.rollback(); expect(slot.db.food(1)?.name).toBe("Old food"); expect(slot.db.food(2)).toBeUndefined(); slot.close();
  });
});
