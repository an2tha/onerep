import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { meta } from "../../core/meta.ts";

/**
 * The shape a FoodData Central release lands in.
 *
 * Column names stay in USDA's vocabulary — this is the only place in the
 * service allowed to know what an `fdc_id` is. `normalize.ts` translates rows
 * of these tables into the {@link Food} everything else consumes.
 */

export const foods = sqliteTable(
  "foods",
  {
    // INTEGER PRIMARY KEY aliases the rowid, so the branded and nutrient passes
    // update by rowid lookup instead of scanning two million rows per statement.
    fdcId: integer("fdc_id").primaryKey(),
    name: text("name").notNull(),
    // Punctuation-free lowercase name. USDA writes generic foods comma-inverted
    // ("Chicken, breast, raw"), which would otherwise never prefix-match the
    // natural phrase a user types and would hand every prefix bonus to branded
    // products.
    nameKey: text("name_key").notNull(),
    brand: text("brand"),
    source: text("source").notNull(),
    tier: integer("tier").notNull(),
    // Kept exactly as USDA published it, separators and all.
    barcode: text("barcode"),
    // Separator-free, zero-stripped GTIN used for lookups.
    barcodeKey: text("barcode_key"),
    ingredients: text("ingredients"),
    servingText: text("serving_text"),
    servingGrams: real("serving_grams"),

    kcal: real("kcal"),
    protein: real("protein"),
    carbs: real("carbs"),
    fat: real("fat"),
    fiber: real("fiber"),
    sugar: real("sugar"),
    saturatedFat: real("saturated_fat"),
    transFat: real("trans_fat"),
    sodium: real("sodium"),
    cholesterol: real("cholesterol"),
    potassium: real("potassium"),
    calcium: real("calcium"),
    iron: real("iron"),
    vitaminA: real("vitamin_a"),
    vitaminC: real("vitamin_c"),
    vitaminD: real("vitamin_d"),
  },
  (table) => [
    index("foods_barcode_key")
      .on(table.barcodeKey)
      .where(sql`${table.barcodeKey} IS NOT NULL`),
  ],
);

export const portions = sqliteTable(
  "portions",
  {
    fdcId: integer("fdc_id").notNull(),
    amount: real("amount"),
    unit: text("unit"),
    gramWeight: real("gram_weight").notNull(),
  },
  (table) => [index("portions_fdc_id").on(table.fdcId)],
);

/**
 * Maps every de-duplicated `fdc_id` to the row that replaced it, so a food
 * logged before an import still resolves afterwards.
 */
export const aliases = sqliteTable("aliases", {
  fdcId: integer("fdc_id").primaryKey(),
  canonicalFdcId: integer("canonical_fdc_id").notNull(),
});

export const schema = { foods, portions, aliases, meta };
export type Schema = typeof schema;

/**
 * FTS5 has no Drizzle representation, so the index and the queries against it
 * are raw SQL. It is external-content over `foods`, built once after the load.
 */
export const FTS_DDL = `
CREATE VIRTUAL TABLE foods_fts USING fts5(
  name, brand,
  content='foods', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
INSERT INTO foods_fts (rowid, name, brand)
  SELECT rowid, name, coalesce(brand, '') FROM foods;
INSERT INTO foods_fts (foods_fts) VALUES ('optimize');
`;
