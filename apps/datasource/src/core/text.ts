/**
 * Text normalisation shared by every provider.
 *
 * These are the rules that decide whether two catalogs agree that they are
 * describing the same thing, so they live in core rather than in any one
 * provider: USDA and Open Food Facts must canonicalise a GTIN identically or a
 * scanned barcode will find one and miss the other.
 */

/**
 * Builds an FTS5 MATCH expression from free-form user input.
 *
 * Every token is quoted so FTS5 operators a user happens to type ("AND", "*",
 * "NEAR", parentheses) match literally instead of changing the query. The final
 * token gets a prefix wildcard so results appear while typing.
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
 * The same product is published as UPC-A ("012345678905"), EAN-13
 * ("0012345678905") and occasionally with separators ("7-19283-62832-9"), so
 * separators are dropped and leading zeros stripped on both sides of the
 * comparison. Returns null for a barcode that is all zeros or punctuation,
 * which is a bad scan rather than a bad request.
 */
export function barcodeKey(barcode: string): string | null {
  const digits = barcode.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Maps a ranking expression onto 0..1, higher being better, so results from
 * different providers can be interleaved.
 *
 * BM25-derived scores are unbounded and negative-is-better; this is a monotonic
 * squash, not a calibration. Two providers returning 0.8 means "both thought
 * this was a good match", not that the matches are equally good.
 */
export function relevance(score: number): number {
  return 1 / (1 + Math.exp(score / 8));
}
