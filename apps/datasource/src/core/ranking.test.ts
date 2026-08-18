import { expect, test } from "bun:test";
import { relevance, TIER, TIER_PENALTY, tierPenalty } from "./ranking.ts";

test("maps better raw scores onto higher relevance, bounded to 0..1", () => {
  // bm25-derived scores are negative-is-better and unbounded; merging results
  // from two catalogs needs them on a common, monotonic scale.
  expect(relevance(-40)).toBeGreaterThan(relevance(-10));
  expect(relevance(-10)).toBeGreaterThan(relevance(10));
  for (const score of [-1000, -8, 0, 8, 1000]) {
    expect(relevance(score)).toBeGreaterThanOrEqual(0);
    expect(relevance(score)).toBeLessThanOrEqual(1);
  }
  // Ranking scores in practice land within roughly ±40, where the curve still
  // separates matches. Far outside that it saturates to 0 or 1 and ties, which
  // only ever affects results that were already indistinguishably good or bad.
  expect(relevance(-40)).toBeLessThan(1);
  expect(relevance(40)).toBeGreaterThan(0);
});

test("orders the tiers from lab-measured generic to packaged product", () => {
  expect(TIER.generic).toBeLessThan(TIER.reference);
  expect(TIER.reference).toBeLessThan(TIER.survey);
  expect(TIER.survey).toBeLessThan(TIER.branded);
});

test("costs a generic food nothing and a branded one the full prior", () => {
  expect(tierPenalty(TIER.generic)).toBe(0);
  expect(tierPenalty(TIER.branded)).toBe(TIER_PENALTY * 3);
});

test("keeps the tier prior dominant over the combined text-match bonuses", () => {
  // Not just the largest bonus — all of them at once. A branded catalog naming
  // a product exactly what people type collects the exact match AND the prefix
  // match together, which is how Open Food Facts pushed USDA's lab-measured
  // foods off the first page when the prior was only worth 18.
  const EXACT_BONUS = 12;
  const PREFIX_BONUS = 4;
  expect(tierPenalty(TIER.branded)).toBeGreaterThan(EXACT_BONUS + PREFIX_BONUS);
});

test("a branded product never outranks an equally matched generic one", () => {
  // The property the whole shared scale exists to guarantee: given identical
  // text-match quality, the lab-measured food wins across any two providers.
  const bm25 = -3;
  const generic = relevance(bm25 + tierPenalty(TIER.generic));
  const branded = relevance(bm25 + tierPenalty(TIER.branded));
  expect(generic).toBeGreaterThan(branded);
});
