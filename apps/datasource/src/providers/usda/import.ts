import { and, eq, isNull, sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readCsvRecords } from "../../core/csv.ts";
import { writeMeta } from "../../core/meta.ts";
import type { BuildContext, BuildSummary } from "../../core/provider.ts";
import { bind, changes } from "../../core/sql.ts";
import { createIndexes, openStaged, promote, type Staged } from "../../core/store.ts";
import { barcodeKey, nameKey } from "../../core/text.ts";
import { aliases, foods, FTS_DDL, portions, schema, type Schema } from "./schema.ts";

/**
 * Builds a FoodData Central release into SQLite.
 *
 * Every statement in the hot loops is a Drizzle prepared statement bound with
 * `sql.placeholder`. That matters: building the query per row instead costs
 * roughly 25x, which on `food_nutrient.csv` is the difference between a
 * ten-second pass and a five-minute one.
 */

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
 * Column per `nutrient.id`, which is what `food_nutrient.nutrient_id` joins on.
 * Do not switch these to `nutrient_nbr`: that column holds the legacy SR
 * numbering (protein is 203 there, 1003 here).
 *
 * Values are per 100 g in the units the normalised shape expects (g, mg, mcg),
 * which is also how FoodData Central publishes them.
 */
const NUTRIENTS = {
  "1008": "kcal",
  "1003": "protein",
  "1004": "fat",
  "1005": "carbs",
  "1079": "fiber",
  "2000": "sugar",
  "1258": "saturatedFat",
  "1257": "transFat",
  "1093": "sodium",
  "1253": "cholesterol",
  "1092": "potassium",
  "1087": "calcium",
  "1089": "iron",
  "1106": "vitaminA",
  "1162": "vitaminC",
  "1114": "vitaminD",
} as const satisfies Record<string, keyof typeof foods.$inferInsert>;

type NutrientColumn = (typeof NUTRIENTS)[keyof typeof NUTRIENTS];

/** Used only when nutrient 1008 is absent for a food. */
const ENERGY_FALLBACK = new Set(["2047", "2048"]);
/** Older releases record total sugars under 1063 instead of 2000. */
const SUGAR_FALLBACK = "1063";

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

export async function build(context: BuildContext): Promise<BuildSummary> {
  const csvDir = context.flag("csv-dir");
  if (!csvDir) throw new Error("import usda requires --csv-dir");
  const { dataDir, log } = context;

  const staged = openStaged(dataDir, "usda", schema);
  try {
    const parsed = await loadFoods(staged, csvDir, log);
    if (parsed === 0) throw new Error("no foods parsed from food.csv");
    await loadBranded(staged, csvDir, log);
    await loadNutrients(staged, csvDir, log);
    const portionCount = await loadPortions(staged, csvDir, log);

    deriveEnergy(staged, log);
    // Dedupe before dropping, so an empty row that repeats a populated one is
    // aliased onto it rather than vanishing.
    deduplicate(staged, log);
    const kept = dropFoodsWithoutNutrition(staged, log);
    if (kept === 0) throw new Error("every food was dropped for having no nutrition data");

    log("building search index");
    createIndexes(staged, schema);
    staged.raw.exec(FTS_DDL);

    writeMeta(staged.db, {
      foods: kept,
      foods_parsed: parsed,
      portions: portionCount,
      imported_at: new Date().toISOString(),
    });
    staged.raw.close();

    promote(dataDir, "usda", kept);
    log(`promoted usda database with ${kept} foods (from ${parsed} parsed)`);
    return { primary: kept, counts: { foods: kept, parsed, portions: portionCount } };
  } catch (error) {
    staged.raw.close();
    throw error;
  }
}

async function loadFoods(staged: Staged<Schema>, csvDir: string, log: BuildContext["log"]) {
  const insert = staged.db
    .insert(foods)
    .values({
      fdcId: sql.placeholder("fdcId"),
      name: sql.placeholder("name"),
      nameKey: sql.placeholder("nameKey"),
      source: sql.placeholder("source"),
      tier: sql.placeholder("tier"),
    })
    .onConflictDoNothing()
    .prepare();

  let count = 0;
  staged.raw.exec("BEGIN");
  for await (const record of readCsvRecords(requireFile(csvDir, "food.csv"))) {
    const type = DATA_TYPES[record.data_type ?? ""];
    const name = clean(record.description);
    const fdcId = num(record.fdc_id);
    if (!type || !name || fdcId === null) continue;
    insert.run({ fdcId, name, nameKey: nameKey(name), source: type.source, tier: type.tier });
    count += 1;
    if (count % 500_000 === 0) log(`foods: ${count}`);
  }
  staged.raw.exec("COMMIT");
  log(`foods: ${count} total`);
  return count;
}

async function loadBranded(staged: Staged<Schema>, csvDir: string, log: BuildContext["log"]) {
  const update = staged.db
    .update(foods)
    .set({
      brand: bind("brand"),
      barcode: bind("barcode"),
      barcodeKey: bind("barcodeKey"),
      ingredients: bind("ingredients"),
      servingText: bind("servingText"),
      servingGrams: bind("servingGrams"),
    })
    .where(eq(foods.fdcId, sql.placeholder("fdcId")))
    .prepare();

  let count = 0;
  staged.raw.exec("BEGIN");
  for await (const record of readCsvRecords(requireFile(csvDir, "branded_food.csv"))) {
    const fdcId = num(record.fdc_id);
    if (fdcId === null) continue;
    const unit = clean(record.serving_size_unit)?.toLowerCase();
    const barcode = clean(record.gtin_upc);
    update.run({
      fdcId,
      brand: clean(record.brand_name) ?? clean(record.brand_owner),
      barcode,
      barcodeKey: barcode ? barcodeKey(barcode) : null,
      ingredients: clean(record.ingredients),
      servingText: servingText(record),
      // Only gram servings convert cleanly against the per-100g basis.
      servingGrams: unit === "g" ? num(record.serving_size) : null,
    });
    count += 1;
    if (count % 500_000 === 0) log(`branded: ${count}`);
  }
  staged.raw.exec("COMMIT");
  log(`branded: ${count} total`);
}

/**
 * Maps `nutrient.id` to a column, then streams `food_nutrient.csv` — the
 * largest file in the release — applying only the nutrients we keep.
 */
async function loadNutrients(staged: Staged<Schema>, csvDir: string, log: BuildContext["log"]) {
  const columnById = new Map<string, NutrientColumn>();
  const energyFallbackIds = new Set<string>();
  const sugarFallbackIds = new Set<string>();

  for await (const record of readCsvRecords(requireFile(csvDir, "nutrient.csv"))) {
    const id = clean(record.id);
    if (!id) continue;
    const column = NUTRIENTS[id as keyof typeof NUTRIENTS];
    if (column) columnById.set(id, column);
    else if (ENERGY_FALLBACK.has(id)) energyFallbackIds.add(id);
    else if (id === SUGAR_FALLBACK) sugarFallbackIds.add(id);
  }
  log(`nutrient columns mapped: ${columnById.size}`);
  // A release that renumbered nutrients would otherwise import every food with
  // zero macros and still look like a successful build.
  if (columnById.size < Object.keys(NUTRIENTS).length) {
    throw new Error(
      `nutrient.csv matched only ${columnById.size} of ${Object.keys(NUTRIENTS).length} ` +
        "expected nutrient ids; the release schema may have changed",
    );
  }

  const statements = new Map<NutrientColumn, ReturnType<typeof prepareNutrientUpdate>>();
  for (const column of new Set(Object.values(NUTRIENTS))) {
    statements.set(column, prepareNutrientUpdate(staged, column));
  }
  // Fallbacks only fill a column that nothing authoritative has set.
  const kcalFallback = prepareNutrientUpdate(staged, "kcal", true);
  const sugarFallback = prepareNutrientUpdate(staged, "sugar", true);

  let applied = 0;
  let seen = 0;
  staged.raw.exec("BEGIN");
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

    if (column) statements.get(column)!.run({ amount, fdcId });
    else if (isEnergyFallback) kcalFallback.run({ amount, fdcId });
    else sugarFallback.run({ amount, fdcId });
    applied += 1;
  }
  staged.raw.exec("COMMIT");
  log(`nutrients: ${applied} values applied from ${seen} rows`);
  if (applied === 0) throw new Error("food_nutrient.csv produced no nutrient values");
}

function prepareNutrientUpdate(
  staged: Staged<Schema>,
  column: NutrientColumn,
  onlyIfNull = false,
) {
  const target = eq(foods.fdcId, sql.placeholder("fdcId"));
  return staged.db
    .update(foods)
    .set({ [column]: bind("amount") })
    .where(onlyIfNull ? and(target, isNull(foods[column])) : target)
    .prepare();
}

/**
 * Fills in energy from the Atwater factors (4/4/9) for foods that carry macros
 * but no energy nutrient. USDA leaves 1008 off a surprising number of branded
 * records even when the macros are complete.
 */
function deriveEnergy(staged: Staged<Schema>, log: BuildContext["log"]): void {
  staged.db
    .update(foods)
    .set({
      kcal: sql`round(coalesce(${foods.protein}, 0) * 4 + coalesce(${foods.carbs}, 0) * 4 + coalesce(${foods.fat}, 0) * 9, 1)`,
    })
    .where(
      sql`${foods.kcal} IS NULL AND (${foods.protein} IS NOT NULL OR ${foods.carbs} IS NOT NULL OR ${foods.fat} IS NOT NULL)`,
    )
    .run();
  log(`energy derived from macros for ${changes(staged.raw)} foods`);
}

/**
 * Removes foods with neither energy nor any macro. They cannot be logged, and
 * they otherwise surface in search as convincing-looking zero-calorie entries
 * (USDA publishes "Oil, olive, extra virgin" with no nutrition at all).
 */
function dropFoodsWithoutNutrition(staged: Staged<Schema>, log: BuildContext["log"]): number {
  staged.db
    .delete(foods)
    .where(
      sql`${foods.kcal} IS NULL AND ${foods.protein} IS NULL AND ${foods.fat} IS NULL AND ${foods.carbs} IS NULL`,
    )
    .run();
  const dropped = changes(staged.raw);

  // An alias whose target just went away would resolve to nothing.
  staged.db
    .delete(aliases)
    .where(sql`${aliases.canonicalFdcId} NOT IN (SELECT ${foods.fdcId} FROM ${foods})`)
    .run();
  const dangling = changes(staged.raw);

  const remaining = countFoods(staged);
  log(
    `dropped ${dropped} foods with no nutrition data (and ${dangling} dangling aliases), ` +
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
function deduplicate(staged: Staged<Schema>, log: BuildContext["log"]): void {
  // Most complete first: real energy, then a serving, then the newest record.
  const preference = "(kcal IS NULL), (serving_text IS NULL), (brand IS NULL), fdc_id DESC";

  staged.raw.exec(`
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

  const aliased = staged.db.select({ n: sql<number>`count(*)` }).from(aliases).get()?.n ?? 0;
  log(`de-duplicated ${aliased} foods into ${countFoods(staged)} distinct products`);
}

function countFoods(staged: Staged<Schema>): number {
  return staged.db.select({ n: sql<number>`count(*)` }).from(foods).get()?.n ?? 0;
}

async function loadPortions(staged: Staged<Schema>, csvDir: string, log: BuildContext["log"]) {
  const units = new Map<string, string>();
  const unitPath = join(csvDir, "measure_unit.csv");
  if (existsSync(unitPath)) {
    for await (const record of readCsvRecords(unitPath)) {
      const id = clean(record.id);
      const name = clean(record.name);
      if (id && name && name !== "undetermined") units.set(id, name);
    }
  }

  const insert = staged.db
    .insert(portions)
    .values({
      fdcId: sql.placeholder("fdcId"),
      amount: sql.placeholder("amount"),
      unit: sql.placeholder("unit"),
      gramWeight: sql.placeholder("gramWeight"),
    })
    .prepare();

  let count = 0;
  staged.raw.exec("BEGIN");
  for await (const record of readCsvRecords(requireFile(csvDir, "food_portion.csv"))) {
    const fdcId = num(record.fdc_id);
    const gramWeight = num(record.gram_weight);
    if (fdcId === null || gramWeight === null || gramWeight <= 0) continue;
    const unit =
      clean(record.portion_description) ??
      [units.get(record.measure_unit_id ?? ""), clean(record.modifier)]
        .filter(Boolean)
        .join(" ")
        .trim();
    insert.run({ fdcId, amount: num(record.amount), unit: unit || null, gramWeight });
    count += 1;
  }
  staged.raw.exec("COMMIT");
  log(`portions: ${count} total`);
  return count;
}
