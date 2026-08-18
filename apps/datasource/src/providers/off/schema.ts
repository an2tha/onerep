import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { meta } from "../../core/meta.ts";

/**
 * The shape an Open Food Facts export lands in.
 *
 * OFF is barcode-centric and entirely branded — there are no generic
 * ingredients here, which is precisely why it complements USDA rather than
 * competing with it. `code` (the GTIN) is the stable public identifier, so it
 * is what `off:<code>` refers to and what survives a re-import; `id` is an
 * internal rowid that exists only so FTS5 external-content joins stay cheap.
 */

export const foods = sqliteTable(
  "foods",
  {
    // Synthetic, and deliberately never exposed: OFF row order is not stable
    // between exports, so an id built from it would break saved food entries.
    id: integer("id").primaryKey(),
    // The barcode exactly as OFF publishes it. This is the public local id.
    code: text("code").notNull(),
    // Separator-free, zero-stripped GTIN, canonicalised the same way USDA's is
    // so a scan resolves identically whichever catalog holds the product.
    barcodeKey: text("barcode_key"),

    // The name in the product's own language, which for most of OFF is not
    // English. Kept alongside the English name so a French user searching
    // "chocolat noir" and an English one searching "dark chocolate" both hit.
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    lang: text("lang"),
    nameEn: text("name_en"),
    nameEnKey: text("name_en_key"),

    brand: text("brand"),
    ingredients: text("ingredients"),
    servingText: text("serving_text"),
    servingGrams: real("serving_grams"),
    // OFF ships product photography; USDA ships none.
    imageUrl: text("image_url"),

    // Per 100 g, already converted out of OFF's all-grams convention into the
    // units the normalised shape declares. See normalize.ts.
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
    // Unique so a repeated barcode surviving the de-duplication pass fails the
    // build rather than quietly serving two rows for one product.
    uniqueIndex("off_foods_code").on(table.code),
    index("off_foods_barcode_key")
      .on(table.barcodeKey)
      .where(sql`${table.barcodeKey} IS NOT NULL`),
  ],
);

export const schema = { foods, meta };
export type Schema = typeof schema;

/**
 * Both names are indexed, so a query in either language matches. The English
 * column is empty for most of the catalog, which costs nothing in FTS5.
 */
export const FTS_DDL = `
CREATE VIRTUAL TABLE foods_fts USING fts5(
  name, name_en, brand,
  content='foods', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
INSERT INTO foods_fts (rowid, name, name_en, brand)
  SELECT id, name, coalesce(name_en, ''), coalesce(brand, '') FROM foods;
INSERT INTO foods_fts (foods_fts) VALUES ('optimize');
`;
