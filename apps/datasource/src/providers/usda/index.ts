import { desc, eq, inArray, sql } from "drizzle-orm";
import type {
  BuildContext,
  BuildSummary,
  FoodProvider,
  Ranked,
} from "../../core/provider.ts";
import { readMeta } from "../../core/meta.ts";
import { LiveStore, livePath } from "../../core/store.ts";
import { relevance, TIER_PENALTY } from "../../core/ranking.ts";
import { barcodeKey, nameKey, toMatchExpression } from "../../core/text.ts";
import type { Food } from "../../core/types.ts";
import { build } from "./import.ts";
import { toFood, type PortionRow } from "./normalize.ts";
import { aliases, foods, portions, schema } from "./schema.ts";

/**
 * Ranking weights.
 *
 * `bm25` returns increasingly negative values for better matches, so the
 * ordering expression is ascending and every bonus is subtracted. Tier pushes
 * branded SKUs below generic foods; the exact and prefix bonuses pull the
 * literal thing a user typed to the top.
 */
const NAME_WEIGHT = 8.0;
const BRAND_WEIGHT = 2.0;
const EXACT_BONUS = 12.0;
const PREFIX_BONUS = 4.0;

/**
 * FTS5 is invisible to Drizzle, so the one query that touches it is raw SQL —
 * and it returns nothing but ids and scores. `fdc_id` is an INTEGER PRIMARY KEY
 * and therefore the rowid, so Drizzle can read the rows themselves and this
 * file never has to restate the column list in USDA's snake_case.
 */
const SEARCH_SQL = `
SELECT
  foods_fts.rowid AS id,
  bm25(foods_fts, ${NAME_WEIGHT}, ${BRAND_WEIGHT})
    + (f.tier * ${TIER_PENALTY})
    - (CASE WHEN f.name_key = :raw THEN ${EXACT_BONUS} ELSE 0 END)
    - (CASE WHEN f.name_key LIKE :prefix THEN ${PREFIX_BONUS} ELSE 0 END)
    AS score
FROM foods_fts
JOIN foods f ON f.rowid = foods_fts.rowid
WHERE foods_fts MATCH :match
ORDER BY score ASC
LIMIT :limit
`;

export class UsdaProvider implements FoodProvider {
  readonly id = "usda";
  readonly kind = "food" as const;
  readonly attribution = "USDA FoodData Central";
  readonly buildFlags = [
    { name: "csv-dir", description: "unpacked FoodData Central CSV directory", required: true },
  ];

  private readonly store: LiveStore<typeof schema>;

  constructor(dataDir: string) {
    this.store = new LiveStore(livePath(dataDir, "usda"), schema);
  }

  build(context: BuildContext): Promise<BuildSummary> {
    return build(context);
  }

  stats(): { imported: boolean } & Record<string, unknown> {
    const db = this.store.get();
    if (!db) return { imported: false };
    return { imported: true, ...readMeta(db) };
  }

  close(): void {
    this.store.close();
  }

  search(query: string, limit: number): Ranked<Food>[] {
    const db = this.store.get();
    const raw = this.store.rawHandle();
    const match = toMatchExpression(query);
    if (!db || !raw || !match) return [];

    const key = nameKey(query);
    const ranked = raw.query(SEARCH_SQL).all({
      ":match": match,
      ":raw": key,
      // nameKey already strips "%" and "_", so no LIKE escaping is needed.
      ":prefix": `${key}%`,
      ":limit": limit,
    }) as { id: number; score: number }[];
    if (ranked.length === 0) return [];

    // Search results skip the portions join: it would be a query per row for
    // data the list view never renders.
    const rows = new Map(
      db
        .select()
        .from(foods)
        .where(inArray(foods.fdcId, ranked.map((row) => row.id)))
        .all()
        .map((row) => [row.fdcId, row]),
    );

    // The `IN` lookup loses the ranking, so order is restored from the FTS pass.
    return ranked.flatMap(({ id, score }) => {
      const row = rows.get(id);
      return row ? [{ item: toFood(row), score: relevance(score) }] : [];
    });
  }

  byId(id: string): Food | null {
    const db = this.store.get();
    const fdcId = Number.parseInt(id, 10);
    if (!db || !Number.isFinite(fdcId)) return null;

    let row = db.select().from(foods).where(eq(foods.fdcId, fdcId)).get();

    // The id may belong to a duplicate that a later import collapsed away.
    if (!row) {
      const alias = db.select().from(aliases).where(eq(aliases.fdcId, fdcId)).get();
      if (!alias) return null;
      row = db.select().from(foods).where(eq(foods.fdcId, alias.canonicalFdcId)).get();
    }

    return row ? toFood(row, this.portionsFor(row.fdcId)) : null;
  }

  byBarcode(barcode: string): Food | null {
    const db = this.store.get();
    const key = barcodeKey(barcode);
    if (!db || !key) return null;

    // Prefer a row that actually carries nutrition data: USDA sometimes lists
    // the same GTIN several times, including discontinued entries with none.
    const row = db
      .select()
      .from(foods)
      .where(eq(foods.barcodeKey, key))
      .orderBy(sql`(${foods.kcal} IS NULL)`, desc(foods.fdcId))
      .limit(1)
      .get();

    return row ? toFood(row, this.portionsFor(row.fdcId)) : null;
  }

  private portionsFor(fdcId: number): PortionRow[] {
    const db = this.store.get();
    if (!db) return [];
    return db
      .select()
      .from(portions)
      .where(eq(portions.fdcId, fdcId))
      .orderBy(portions.gramWeight)
      .limit(10)
      .all();
  }
}
