/**
 * The scale every provider ranks on.
 *
 * Providers score their own results with their own BM25 weights, which is fine
 * so long as nothing compares them. The moment two catalogs are merged, their
 * scores have to mean the same thing — and the thing that has to agree is not
 * the text-match component but the *prior*: how much worse a branded package is
 * than a lab-measured generic ingredient.
 *
 * That prior lives here rather than in either provider, because a copy in each
 * is a copy that drifts. When it drifted once already, USDA's branded catalog
 * sat 18 points below Open Food Facts' identical products and disappeared from
 * results entirely.
 */

/**
 * How much worse each catalog tier is than a Foundation-grade generic food.
 *
 * Must outweigh the *combined* text-match bonuses, not merely one of them.
 * Branded catalogs name things the way people search — "Greek yogurt",
 * "Cheddar", "Almonds" — so they collect the exact-match bonus, the prefix
 * bonus, and a strong BM25 all at once, while USDA writes the same foods
 * comma-inverted ("Yogurt, Greek, plain, nonfat") and earns none of them.
 *
 * At 6 that stack won: adding Open Food Facts pushed USDA off the first page
 * entirely for a third of generic queries, and to zero results for "greek
 * yogurt", "cheddar" and "almonds". 8 was chosen by measuring 17 queries
 * against the real catalogs — it is the largest value at which every branded
 * query still leads with the branded catalog, which is the constraint on the
 * other side. Re-measure it when a catalog is added; it is a balance between
 * two of them, not a constant.
 */
export const TIER_PENALTY = 8.0;

/**
 * The catalog tiers, in the order we would rather answer with.
 *
 * A provider maps its own vocabulary onto these — USDA's four data types land
 * on all four; Open Food Facts is wholly `branded`.
 */
export const TIER = {
  /** Lab-measured whole foods: USDA Foundation. */
  generic: 0,
  /** Older reference data: USDA SR Legacy. */
  reference: 1,
  /** Survey composites: USDA FNDDS. */
  survey: 2,
  /** Packaged retail product, however it was contributed. */
  branded: 3,
} as const;

export type Tier = (typeof TIER)[keyof typeof TIER];

/** The penalty a given tier adds to a ranking expression. */
export function tierPenalty(tier: Tier): number {
  return tier * TIER_PENALTY;
}

/**
 * Maps a ranking expression onto 0..1, higher being better, so results from
 * different providers can be interleaved.
 *
 * BM25-derived scores are unbounded and negative-is-better; this is a monotonic
 * squash, not a calibration. Two providers returning 0.8 means "both thought
 * this was a good match", not that the matches are equally good — which is why
 * the tier prior above has to be on a shared scale before this is applied.
 */
export function relevance(score: number): number {
  return 1 / (1 + Math.exp(score / 8));
}
