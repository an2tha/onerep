import { sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { readJsonLines } from "../../core/jsonl.ts";
import { writeMeta } from "../../core/meta.ts";
import type { BuildContext, BuildSummary } from "../../core/provider.ts";
import { changes } from "../../core/sql.ts";
import { commitEvery, createIndexes, openStaged, promote, type Staged } from "../../core/store.ts";
import { barcodeKey, nameKey } from "../../core/text.ts";
import { foods, FTS_DDL, schema, type Schema } from "./schema.ts";
import { hasNutrition, imageUrl, number, readNutrition, text } from "./normalize.ts";

/**
 * Builds an Open Food Facts export into SQLite.
 *
 * The dump is one JSON object per line and tens of gigabytes uncompressed, so
 * it is streamed and gzip-decoded in a single pass, and rows are committed in
 * batches. Both halves of that matter, and both were learned the hard way on a
 * 4 GB host: decompressing through `DecompressionStream` buffered the expanded
 * dump instead of honouring backpressure, and holding one transaction across
 * millions of inserts pinned every dirty page in memory. Either alone was
 * enough to get the import OOM-killed.
 */

/**
 * A dump this size carries the occasional truncated line. Losing a handful of
 * products is preferable to losing the import, but widespread corruption means
 * a bad download and must not be quietly promoted as a catalog.
 */
const MAX_MALFORMED_LINES = 1_000;

export async function build(context: BuildContext): Promise<BuildSummary> {
  const file = context.flag("file");
  if (!file) throw new Error("import off requires --file (the openfoodfacts-products.jsonl.gz dump)");
  if (!existsSync(file)) throw new Error(`missing Open Food Facts dump: ${file}`);

  const limitFlag = context.flag("limit");
  const limit = limitFlag ? Number.parseInt(limitFlag, 10) : null;
  if (limitFlag && (limit === null || !Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`invalid --limit: ${limitFlag}`);
  }

  const { dataDir, log } = context;
  const staged = openStaged(dataDir, "off", schema);

  try {
    const { seen, kept, malformed } = await load(staged, file, limit, log);
    if (kept === 0) throw new Error("no usable products parsed from the Open Food Facts dump");

    const duplicates = deduplicate(staged, log);

    log("building search index");
    createIndexes(staged, schema);
    staged.raw.exec(FTS_DDL);

    const stored = count(staged);
    writeMeta(staged.db, {
      products: stored,
      products_seen: seen,
      duplicates_collapsed: duplicates,
      malformed_lines: malformed,
      imported_at: new Date().toISOString(),
    });
    staged.raw.close();

    promote(dataDir, "off", stored);
    log(`promoted off database with ${stored} products (from ${seen} scanned)`);
    return {
      primary: stored,
      counts: { products: stored, scanned: seen, duplicates, malformed },
    };
  } catch (error) {
    staged.raw.close();
    throw error;
  }
}

async function load(
  staged: Staged<Schema>,
  file: string,
  limit: number | null,
  log: BuildContext["log"],
) {
  const insert = staged.db
    .insert(foods)
    .values({
      code: sql.placeholder("code"),
      barcodeKey: sql.placeholder("barcodeKey"),
      name: sql.placeholder("name"),
      nameKey: sql.placeholder("nameKey"),
      lang: sql.placeholder("lang"),
      nameEn: sql.placeholder("nameEn"),
      nameEnKey: sql.placeholder("nameEnKey"),
      brand: sql.placeholder("brand"),
      ingredients: sql.placeholder("ingredients"),
      servingText: sql.placeholder("servingText"),
      servingGrams: sql.placeholder("servingGrams"),
      imageUrl: sql.placeholder("imageUrl"),
      kcal: sql.placeholder("kcal"),
      protein: sql.placeholder("protein"),
      carbs: sql.placeholder("carbs"),
      fat: sql.placeholder("fat"),
      fiber: sql.placeholder("fiber"),
      sugar: sql.placeholder("sugar"),
      saturatedFat: sql.placeholder("saturatedFat"),
      transFat: sql.placeholder("transFat"),
      sodium: sql.placeholder("sodium"),
      cholesterol: sql.placeholder("cholesterol"),
      potassium: sql.placeholder("potassium"),
      calcium: sql.placeholder("calcium"),
      iron: sql.placeholder("iron"),
      vitaminA: sql.placeholder("vitaminA"),
      vitaminC: sql.placeholder("vitaminC"),
      vitaminD: sql.placeholder("vitaminD"),
    })
    .prepare();

  let seen = 0;
  let kept = 0;
  let malformed = 0;

  staged.raw.exec("BEGIN");
  for await (const record of readJsonLines(file, {
    onError: () => {
      malformed += 1;
      if (malformed > MAX_MALFORMED_LINES) {
        throw new Error(
          `more than ${MAX_MALFORMED_LINES} malformed lines; the dump is probably truncated`,
        );
      }
    },
  })) {
    seen += 1;
    if (seen % 250_000 === 0) log(`products scanned: ${seen} (kept ${kept})`);

    const row = toRow(record);
    if (row) {
      insert.run(row);
      kept += 1;
      // Bounded memory: see commitEvery. Four million products in one
      // transaction is what got this OOM-killed on the import box.
      commitEvery(staged.raw, kept);
    }
    if (limit !== null && kept >= limit) break;
  }
  staged.raw.exec("COMMIT");

  log(`products: ${kept} kept from ${seen} scanned`);
  if (malformed > 0) log(`skipped ${malformed} malformed lines`);
  return { seen, kept, malformed };
}

/** A record that cannot be logged, identified or found is not worth storing. */
function toRow(record: Record<string, unknown>) {
  const code = text(record.code);
  if (!code) return null;

  const lang = text(record.lang);
  // The main-language name, with the language-suffixed field as a fallback for
  // records that only ever filled that one in.
  const original =
    text(record.product_name) ?? (lang ? text(record[`product_name_${lang}`]) : null);
  const english = text(record.product_name_en);
  const name = original ?? english;
  if (!name) return null;

  const nutrients = readNutrition(record);
  // Same rule as USDA: a product with no energy and no macros cannot be logged,
  // and would otherwise surface in search as a convincing zero-calorie entry.
  if (!hasNutrition(nutrients)) return null;

  const key = nameKey(name);
  // Only store the English name when it actually differs, so the FTS index does
  // not carry a second copy of every English-origin product.
  const englishKey = english ? nameKey(english) : null;
  const distinctEnglish = englishKey && englishKey !== key ? english : null;

  return {
    code,
    barcodeKey: barcodeKey(code),
    name,
    nameKey: key,
    lang,
    nameEn: distinctEnglish,
    nameEnKey: distinctEnglish ? englishKey : null,
    brand: firstBrand(record.brands),
    // English ingredients where contributed, matching the display-name choice.
    ingredients: text(record.ingredients_text_en) ?? text(record.ingredients_text),
    servingText: text(record.serving_size),
    servingGrams: number(record.serving_quantity),
    // The dump encodes images rather than serving a URL; see imageUrl.
    imageUrl: text(record.image_front_small_url) ?? imageUrl(record),
    ...nutrients,
  };
}

/** `brands` is a comma-separated list; the first entry is the primary brand. */
function firstBrand(value: unknown): string | null {
  const brands = text(value);
  if (!brands) return null;
  return text(brands.split(",")[0]);
}

/**
 * Collapses any repeated barcode, keeping the most complete row.
 *
 * The export is keyed by code and should not repeat one, but a duplicate would
 * otherwise fail the unique index and take the whole import down with it.
 */
function deduplicate(staged: Staged<Schema>, log: BuildContext["log"]): number {
  staged.raw.exec(`
    DELETE FROM foods
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY code
            ORDER BY (kcal IS NULL), (serving_text IS NULL), (image_url IS NULL), id
          ) AS rank
        FROM foods
      )
      WHERE rank = 1
    )
  `);
  const removed = changes(staged.raw);
  if (removed > 0) log(`collapsed ${removed} duplicate barcodes`);
  return removed;
}

function count(staged: Staged<Schema>): number {
  return staged.db.select({ n: sql<number>`count(*)` }).from(foods).get()?.n ?? 0;
}
