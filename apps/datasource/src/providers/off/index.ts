import { desc, eq, inArray, sql } from "drizzle-orm";
import { readMeta } from "../../core/meta.ts";
import type { BuildContext, BuildSummary, FoodProvider, Ranked } from "../../core/provider.ts";
import { LiveStore, livePath } from "../../core/store.ts";
import { relevance, TIER, tierPenalty } from "../../core/ranking.ts";
import { barcodeKey, nameKey, toMatchExpression } from "../../core/text.ts";
import type { Food } from "../../core/types.ts";
import { build } from "./import.ts";
import { toFood } from "./normalize.ts";
import { foods, schema } from "./schema.ts";

/**
 * Ranking weights.
 *
 * There is no data-type prior here — Open Food Facts is entirely branded
 * packaged product, so the tier penalty that keeps USDA's generic ingredients
 * on top has nothing to sort. What matters instead is that a match on the
 * product's own name and a match on its English name count equally, so a
 * bilingual catalog does not rank English-language products above the rest
 * purely for having two indexed names.
 */
const NAME_WEIGHT = 8.0;
const NAME_EN_WEIGHT = 8.0;
const BRAND_WEIGHT = 2.0;
const EXACT_BONUS = 12.0;
const PREFIX_BONUS = 4.0;
/**
 * Open Food Facts is wholly branded packaged product, so every row enters the
 * merge at the shared branded tier. Without this the catalog would be scored as
 * though it were lab-measured generic food, and USDA's branded products — which
 * do carry the penalty — would vanish from results the moment this provider was
 * imported. See core/ranking.ts.
 */
const BRANDED_PENALTY = tierPenalty(TIER.branded);

/**
 * FTS5 is invisible to Drizzle, so this one query is raw SQL and returns only
 * ids and scores; Drizzle reads the rows. The exact and prefix bonuses apply to
 * whichever of the two names matches, so typing the French name of a French
 * product is rewarded exactly as typing the English one would be.
 */
const SEARCH_SQL = `
SELECT
  foods_fts.rowid AS id,
  bm25(foods_fts, ${NAME_WEIGHT}, ${NAME_EN_WEIGHT}, ${BRAND_WEIGHT})
    + ${BRANDED_PENALTY}
    - (CASE WHEN f.name_key = :raw OR f.name_en_key = :raw THEN ${EXACT_BONUS} ELSE 0 END)
    - (CASE WHEN f.name_key LIKE :prefix OR f.name_en_key LIKE :prefix THEN ${PREFIX_BONUS} ELSE 0 END)
    AS score
FROM foods_fts
JOIN foods f ON f.id = foods_fts.rowid
WHERE foods_fts MATCH :match
ORDER BY score ASC
LIMIT :limit
`;

export class OpenFoodFactsProvider implements FoodProvider {
  readonly id = "off";
  readonly kind = "food" as const;
  readonly attribution = "Open Food Facts (ODbL)";
  readonly buildFlags = [
    { name: "file", description: "openfoodfacts-products.jsonl.gz dump", required: true },
    { name: "limit", description: "stop after N products, for a partial import", required: false },
  ];

  private readonly store: LiveStore<typeof schema>;

  constructor(dataDir: string) {
    this.store = new LiveStore(livePath(dataDir, "off"), schema);
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

    const rows = new Map(
      db
        .select()
        .from(foods)
        .where(
          inArray(
            foods.id,
            ranked.map((row) => row.id),
          ),
        )
        .all()
        .map((row) => [row.id, row]),
    );

    // The `IN` lookup loses the ranking, so order is restored from the FTS pass.
    return ranked.flatMap(({ id, score }) => {
      const row = rows.get(id);
      return row ? [{ item: toFood(row), score: relevance(score) }] : [];
    });
  }

  /** OFF's local id is the barcode itself, so this is a plain code lookup. */
  byId(id: string): Food | null {
    const db = this.store.get();
    if (!db) return null;
    const row = db.select().from(foods).where(eq(foods.code, id)).get();
    // An id may have been published with separators or a leading zero that the
    // caller has since normalised away, so fall back to the canonical form.
    return row ? toFood(row) : this.byBarcode(id);
  }

  byBarcode(barcode: string): Food | null {
    const db = this.store.get();
    const key = barcodeKey(barcode);
    if (!db || !key) return null;

    // Prefer a row that actually carries energy: OFF holds plenty of skeleton
    // records contributed before anyone photographed the nutrition panel.
    const row = db
      .select()
      .from(foods)
      .where(eq(foods.barcodeKey, key))
      .orderBy(sql`(${foods.kcal} IS NULL)`, desc(foods.id))
      .limit(1)
      .get();

    return row ? toFood(row) : null;
  }
}
