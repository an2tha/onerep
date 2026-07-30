/**
 * Builds an FTS5 MATCH expression from free-form user input.
 *
 * Every token is quoted so FTS5 operators a user happens to type ("AND", "*",
 * "NEAR", parentheses) are matched literally instead of changing the query.
 * The final token gets a prefix wildcard so results appear while typing.
 */
export function toMatchExpression(query: string): string | null {
  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;

  return tokens
    .map((token, index) => {
      const quoted = `"${token}"`;
      return index === tokens.length - 1 ? `${quoted}*` : quoted;
    })
    .join(" AND ");
}

/**
 * Ranking weights.
 *
 * `bm25` returns increasingly negative values for better matches, so the
 * ordering expression is ascending and every bonus is subtracted. Tier pushes
 * branded SKUs below generic foods; the exact and prefix bonuses pull the
 * literal thing a user typed to the top.
 */
export const NAME_WEIGHT = 8.0;
export const BRAND_WEIGHT = 2.0;
/**
 * Deliberately larger than EXACT_BONUS. Thousands of branded products are named
 * exactly "CHICKEN BREAST", so without a dominant tier prior they take every
 * exact-match bonus and bury the generic ingredient. Only foods matching all
 * query tokens are candidates, so tier ordering never suppresses a genuinely
 * better match — it only decides between comparably good ones.
 */
export const TIER_PENALTY = 6.0;
export const EXACT_BONUS = 12.0;
export const PREFIX_BONUS = 4.0;

export const SEARCH_SQL = `
SELECT
  f.*,
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

/**
 * Normalises a name or query for exact and prefix comparison, so that
 * "Chicken, breast, raw" and "chicken breast raw" compare equal.
 */
export function nameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Canonical form of a GTIN for equality lookups.
 *
 * USDA publishes the same product as UPC-A ("012345678905"), EAN-13
 * ("0012345678905") and occasionally with separators ("7-19283-62832-9"), so
 * separators are dropped and leading zeros stripped on both sides of the
 * comparison.
 */
export function barcodeKey(barcode: string): string | null {
  const digits = barcode.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length > 0 ? digits : null;
}

/** Bind parameters for {@link SEARCH_SQL}, or null when nothing is searchable. */
export function searchParams(
  query: string,
  limit: number,
): { ":match": string; ":raw": string; ":prefix": string; ":limit": number } | null {
  const match = toMatchExpression(query);
  if (!match) return null;
  const key = nameKey(query);
  return {
    ":match": match,
    ":raw": key,
    // nameKey already strips "%" and "_", so no LIKE escaping is needed.
    ":prefix": `${key}%`,
    ":limit": limit,
  };
}
