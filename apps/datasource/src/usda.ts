import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readCsvRecords } from "./csv.ts";
import { openStaged, promote } from "./db.ts";
import { barcodeKey, nameKey } from "./search.ts";

/**
 * Ranking prior. Generic whole foods outrank branded packages for the same
 * query, so "chicken breast" returns the ingredient rather than a supermarket
 * SKU that happens to share the words.
 */
const DATA_TYPES: Record<string, { source: string; tier: number }> = {
  foundation_food: { source: "foundation", tier: 0 },
  sr_legacy_food: { source: "sr_legacy", tier: 1 },
  survey_fndds_food: { source: "survey", tier: 2 },
  branded_food: { source: "branded", tier: 3 },
};

/**
 * Column per `nutrient.id`, which is what `food_nutrient.nutrient_id` joins
 * on. Do not switch these to `nutrient_nbr`: that column holds the legacy SR
 * numbering (protein is 203 there, 1003 here).
 *
 * Values are per 100 g in the units the compat product shape expects (g, mg,
 * mcg), which is also how FoodData Central publishes them.
 */
const NUTRIENTS: Record<string, string> = {
  "1008": "kcal",
  "1003": "protein",
  "1004": "fat",
  "1005": "carbs",
  "1079": "fiber",
  "2000": "sugar",
  "1258": "saturated_fat",
  "1257": "trans_fat",
  "1093": "sodium",
  "1253": "cholesterol",
  "1092": "potassium",
  "1087": "calcium",
  "1089": "iron",
  "1106": "vitamin_a",
  "1162": "vitamin_c",
  "1114": "vitamin_d",
};

/** Used only when nutrient 1008 is absent for a food. */
const ENERGY_FALLBACK = new Set(["2047", "2048"]);
/** Older releases record total sugars under 1063 instead of 2000. */
const SUGAR_FALLBACK = "1063";

const SCHEMA = `
CREATE TABLE foods (
  -- INTEGER PRIMARY KEY aliases the rowid, so the branded and nutrient passes
  -- update by rowid lookup instead of scanning two million rows per statement.
  fdc_id        INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  -- Punctuation-free lowercase name. USDA writes generic foods comma-inverted
  -- ("Chicken, breast, raw"), which would otherwise never prefix-match the
  -- natural phrase a user types and would hand every prefix bonus to branded
  -- products.
  name_key      TEXT NOT NULL,
  brand         TEXT,
  source        TEXT NOT NULL,
  tier          INTEGER NOT NULL,
  barcode       TEXT,
  -- Separator-free, zero-stripped GTIN used for lookups. The barcode column
  -- keeps the value exactly as USDA published it.
  barcode_key   TEXT,
  ingredients   TEXT,
  serving_text  TEXT,
  serving_grams REAL,
  kcal REAL, protein REAL, carbs REAL, fat REAL,
  fiber REAL, sugar REAL, saturated_fat REAL, trans_fat REAL,
  sodium REAL, cholesterol REAL, potassium REAL,
  calcium REAL, iron REAL,
  vitamin_a REAL, vitamin_c REAL, vitamin_d REAL
);
CREATE TABLE portions (
  fdc_id      INTEGER NOT NULL,
  amount      REAL,
  unit        TEXT,
  gram_weight REAL NOT NULL
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Maps every de-duplicated fdc_id to the row that replaced it, so a food
-- logged before an import still resolves afterwards.
CREATE TABLE aliases (
  fdc_id           INTEGER PRIMARY KEY,
  canonical_fdc_id INTEGER NOT NULL
);
`;

const INDEXES = `
CREATE INDEX foods_barcode_key ON foods (barcode_key) WHERE barcode_key IS NOT NULL;
CREATE INDEX portions_fdc_id ON portions (fdc_id);
CREATE VIRTUAL TABLE foods_fts USING fts5(
  name, brand,
  content='foods', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
INSERT INTO foods_fts (rowid, name, brand)
  SELECT rowid, name, coalesce(brand, '') FROM foods;
INSERT INTO foods_fts (foods_fts) VALUES ('optimize');
`;

function num(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

/** Prefers the human-readable serving text branded records carry. */
function servingText(record: Record<string, string>): string | null {
  const household = clean(record.household_serving_fulltext);
  if (household) return household;
  const size = num(record.serving_size);
  const unit = clean(record.serving_size_unit);
  return size !== null && unit ? `${size} ${unit}` : null;
}

function requireFile(dir: string, name: string): string {
  const path = join(dir, name);
  if (!existsSync(path)) throw new Error(`missing USDA file: ${path}`);
  return path;
}

export type ImportProgress = (message: string) => void;

export async function importUsda(options: {
  csvDir: string;
  dataDir: string;
  onProgress?: ImportProgress;
}): Promise<{ foods: number }> {
  const { csvDir, dataDir } = options;
  const log = options.onProgress ?? (() => {});
  const db = openStaged(dataDir, "usda");

  try {
    db.exec(SCHEMA);
    const foods = await loadFoods(db, csvDir, log);
    if (foods === 0) throw new Error("no foods parsed from food.csv");
    await loadBranded(db, csvDir, log);
    await loadNutrients(db, csvDir, log);
    await loadPortions(db, csvDir, log);

    deriveEnergy(db, log);
    // Dedupe before dropping, so an empty row that repeats a populated one is
    // aliased onto it rather than vanishing.
    deduplicate(db, log);
    const usable = dropFoodsWithoutNutrition(db, log);
    if (usable === 0) throw new Error("every food was dropped for having no nutrition data");

    log("building search index");
    db.exec(INDEXES);
    const kept = (db.query("SELECT count(*) AS n FROM foods").get() as { n: number }).n;
    const meta = db.query("INSERT INTO meta (key, value) VALUES (?, ?)");
    meta.run("foods", String(kept));
    meta.run("foods_parsed", String(foods));
    meta.run("imported_at", new Date().toISOString());
    db.close();

    promote(dataDir, "usda", kept);
    log(`promoted usda database with ${kept} foods (from ${foods} parsed)`);
    return { foods: kept };
  } catch (error) {
    db.close();
    throw error;
  }
}

async function loadFoods(db: Database, csvDir: string, log: ImportProgress): Promise<number> {
  const insert = db.query(
    `INSERT OR IGNORE INTO foods (fdc_id, name, name_key, source, tier)
     VALUES (?, ?, ?, ?, ?)`,
  );
  let count = 0;
  db.exec("BEGIN");
  for await (const record of readCsvRecords(requireFile(csvDir, "food.csv"))) {
    const type = DATA_TYPES[record.data_type ?? ""];
    const name = clean(record.description);
    const fdcId = num(record.fdc_id);
    if (!type || !name || fdcId === null) continue;
    insert.run(fdcId, name, nameKey(name), type.source, type.tier);
    count += 1;
    if (count % 500_000 === 0) log(`foods: ${count}`);
  }
  db.exec("COMMIT");
  log(`foods: ${count} total`);
  return count;
}

async function loadBranded(db: Database, csvDir: string, log: ImportProgress): Promise<void> {
  const update = db.query(
    `UPDATE foods
     SET brand = ?, barcode = ?, barcode_key = ?, ingredients = ?,
         serving_text = ?, serving_grams = ?
     WHERE fdc_id = ?`,
  );
  let count = 0;
  db.exec("BEGIN");
  for await (const record of readCsvRecords(requireFile(csvDir, "branded_food.csv"))) {
    const fdcId = num(record.fdc_id);
    if (fdcId === null) continue;
    const brand = clean(record.brand_name) ?? clean(record.brand_owner);
    const unit = clean(record.serving_size_unit)?.toLowerCase();
    // Only gram servings convert cleanly against the per-100g basis.
    const grams = unit === "g" ? num(record.serving_size) : null;
    const barcode = clean(record.gtin_upc);
    update.run(
      brand,
      barcode,
      barcode ? barcodeKey(barcode) : null,
      clean(record.ingredients),
      servingText(record),
      grams,
      fdcId,
    );
    count += 1;
    if (count % 500_000 === 0) log(`branded: ${count}`);
  }
  db.exec("COMMIT");
  log(`branded: ${count} total`);
}

/**
 * Maps `nutrient.id` to a column, then streams
 * `food_nutrient.csv` (the largest file in the release) applying only the
 * nutrients the compat shape needs.
 */
async function loadNutrients(db: Database, csvDir: string, log: ImportProgress): Promise<void> {
  const columnById = new Map<string, string>();
  const energyFallbackIds = new Set<string>();
  const sugarFallbackIds = new Set<string>();

  for await (const record of readCsvRecords(requireFile(csvDir, "nutrient.csv"))) {
    const id = clean(record.id);
    if (!id) continue;
    const column = NUTRIENTS[id];
    if (column) columnById.set(id, column);
    else if (ENERGY_FALLBACK.has(id)) energyFallbackIds.add(id);
    else if (id === SUGAR_FALLBACK) sugarFallbackIds.add(id);
  }
  log(`nutrient columns mapped: ${columnById.size}`);
  // A release that renumbers nutrients would otherwise import every food with
  // zero macros and still look like a successful build.
  if (columnById.size < Object.keys(NUTRIENTS).length) {
    throw new Error(
      `nutrient.csv matched only ${columnById.size} of ${Object.keys(NUTRIENTS).length} ` +
        "expected nutrient ids; the release schema may have changed",
    );
  }

  const statements = new Map<string, ReturnType<Database["query"]>>();
  for (const column of new Set(Object.values(NUTRIENTS))) {
    statements.set(column, db.query(`UPDATE foods SET ${column} = ? WHERE fdc_id = ?`));
  }
  // Fallbacks only fill a column that nothing authoritative has set.
  const kcalFallback = db.query("UPDATE foods SET kcal = ? WHERE fdc_id = ? AND kcal IS NULL");
  const sugarFallback = db.query("UPDATE foods SET sugar = ? WHERE fdc_id = ? AND sugar IS NULL");

  let applied = 0;
  let seen = 0;
  db.exec("BEGIN");
  for await (const record of readCsvRecords(requireFile(csvDir, "food_nutrient.csv"))) {
    seen += 1;
    if (seen % 5_000_000 === 0) log(`food_nutrient rows scanned: ${seen}`);
    const nutrientId = record.nutrient_id;
    if (!nutrientId) continue;

    const column = columnById.get(nutrientId);
    const isEnergyFallback = !column && energyFallbackIds.has(nutrientId);
    const isSugarFallback = !column && sugarFallbackIds.has(nutrientId);
    if (!column && !isEnergyFallback && !isSugarFallback) continue;

    const amount = num(record.amount);
    const fdcId = num(record.fdc_id);
    if (amount === null || fdcId === null) continue;

    if (column) statements.get(column)!.run(amount, fdcId);
    else if (isEnergyFallback) kcalFallback.run(amount, fdcId);
    else sugarFallback.run(amount, fdcId);
    applied += 1;
  }
  db.exec("COMMIT");
  log(`nutrients: ${applied} values applied from ${seen} rows`);
  if (applied === 0) throw new Error("food_nutrient.csv produced no nutrient values");
}

/**
 * Fills in energy from the Atwater factors (4/4/9) for foods that carry macros
 * but no energy nutrient. USDA leaves 1008 off a surprising number of branded
 * records even when the macros are complete.
 */
function deriveEnergy(db: Database, log: ImportProgress): void {
  const { changes } = db.run(
    `UPDATE foods
     SET kcal = round(coalesce(protein, 0) * 4 + coalesce(carbs, 0) * 4 + coalesce(fat, 0) * 9, 1)
     WHERE kcal IS NULL
       AND (protein IS NOT NULL OR carbs IS NOT NULL OR fat IS NOT NULL)`,
  );
  log(`energy derived from macros for ${changes} foods`);
}

/**
 * Removes foods with neither energy nor any macro. They cannot be logged, and
 * they otherwise surface in search as convincing-looking zero-calorie entries
 * (USDA publishes "Oil, olive, extra virgin" with no nutrition at all).
 */
function dropFoodsWithoutNutrition(db: Database, log: ImportProgress): number {
  const { changes } = db.run(
    `DELETE FROM foods
     WHERE kcal IS NULL AND protein IS NULL AND fat IS NULL AND carbs IS NULL`,
  );
  // An alias whose target just went away would resolve to nothing.
  const dangling = db.run(
    "DELETE FROM aliases WHERE canonical_fdc_id NOT IN (SELECT fdc_id FROM foods)",
  );
  const remaining = (db.query("SELECT count(*) AS n FROM foods").get() as { n: number }).n;
  log(
    `dropped ${changes} foods with no nutrition data (and ${dangling.changes} dangling aliases), ` +
      `${remaining} remain`,
  );
  return remaining;
}

/**
 * Collapses repeated publications of the same product.
 *
 * USDA reissues a GTIN on every release, so the branded set holds roughly four
 * rows per physical product; generic foods occasionally repeat a description.
 * The survivor is the most complete row, and every dropped id is recorded in
 * `aliases` so a previously logged food still resolves.
 */
function deduplicate(db: Database, log: ImportProgress): void {
  // Most complete first: real energy, then a serving, then the newest record.
  const preference = "(kcal IS NULL), (serving_text IS NULL), (brand IS NULL), fdc_id DESC";

  db.exec(`
    CREATE TEMP TABLE ranked AS
    SELECT
      fdc_id,
      first_value(fdc_id) OVER (
        PARTITION BY coalesce('gtin:' || barcode_key, 'name:' || source || ':' || name_key)
        ORDER BY ${preference}
      ) AS canonical_fdc_id
    FROM foods;

    INSERT INTO aliases (fdc_id, canonical_fdc_id)
      SELECT fdc_id, canonical_fdc_id FROM ranked WHERE fdc_id <> canonical_fdc_id;

    DELETE FROM foods WHERE fdc_id IN (SELECT fdc_id FROM aliases);

    DROP TABLE ranked;
  `);

  const { n } = db.query("SELECT count(*) AS n FROM aliases").get() as { n: number };
  const remaining = (db.query("SELECT count(*) AS n FROM foods").get() as { n: number }).n;
  log(`de-duplicated ${n} foods into ${remaining} distinct products`);
}

async function loadPortions(db: Database, csvDir: string, log: ImportProgress): Promise<void> {
  const units = new Map<string, string>();
  const unitPath = join(csvDir, "measure_unit.csv");
  if (existsSync(unitPath)) {
    for await (const record of readCsvRecords(unitPath)) {
      const id = clean(record.id);
      const name = clean(record.name);
      if (id && name && name !== "undetermined") units.set(id, name);
    }
  }

  const insert = db.query(
    "INSERT INTO portions (fdc_id, amount, unit, gram_weight) VALUES (?, ?, ?, ?)",
  );
  let count = 0;
  db.exec("BEGIN");
  for await (const record of readCsvRecords(requireFile(csvDir, "food_portion.csv"))) {
    const fdcId = num(record.fdc_id);
    const grams = num(record.gram_weight);
    if (fdcId === null || grams === null || grams <= 0) continue;
    const unit =
      clean(record.portion_description) ??
      [units.get(record.measure_unit_id ?? ""), clean(record.modifier)]
        .filter(Boolean)
        .join(" ")
        .trim();
    insert.run(fdcId, num(record.amount), unit || null, grams);
    count += 1;
  }
  db.exec("COMMIT");
  log(`portions: ${count} total`);
}
