import { v } from "convex/values";

/**
 * Optional micronutrient fields shared by food log entries, custom foods and
 * meal prep batches. Keeping one list here stops the three surfaces from
 * drifting apart as nutrients are added.
 */
export const MICRONUTRIENT_KEYS = [
  "fiber",
  "sugar",
  "saturatedFat",
  "transFat",
  "cholesterol",
  "sodium",
  "potassium",
  "calcium",
  "iron",
  "magnesium",
  "phosphorus",
  "zinc",
  "vitaminC",
  "vitaminA",
  "vitaminD",
  "vitaminB12",
  "caffeine",
  "alcohol",
] as const;

export type MicronutrientKey = (typeof MICRONUTRIENT_KEYS)[number];

const micronutrientFields = Object.fromEntries(
  MICRONUTRIENT_KEYS.map((key) => [key, v.optional(v.number())]),
) as Record<
  MicronutrientKey,
  ReturnType<typeof v.optional<ReturnType<typeof v.number>>>
>;

/** Macros are required, micronutrients are optional. */
export const nutrientProfileValidator = v.object({
  calories: v.number(),
  protein: v.number(),
  carbs: v.number(),
  fat: v.number(),
  ...micronutrientFields,
});

export type NutrientProfile = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} & Partial<Record<MicronutrientKey, number>>;

function finiteNonNegative(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/** Drops non-finite/negative values and strips absent micronutrients. */
export function normalizeNutrientProfile(
  profile: NutrientProfile,
): NutrientProfile {
  const normalized: NutrientProfile = {
    calories: finiteNonNegative(profile.calories),
    protein: finiteNonNegative(profile.protein),
    carbs: finiteNonNegative(profile.carbs),
    fat: finiteNonNegative(profile.fat),
  };

  for (const key of MICRONUTRIENT_KEYS) {
    const value = profile[key];
    if (value === undefined) continue;
    const clean = finiteNonNegative(value);
    if (clean > 0) normalized[key] = clean;
  }

  return normalized;
}

/** Multiplies every nutrient by `factor` (used for servings math). */
export function scaleNutrientProfile(
  profile: NutrientProfile,
  factor: number,
): NutrientProfile {
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 0;
  const scaled: NutrientProfile = {
    calories: profile.calories * safeFactor,
    protein: profile.protein * safeFactor,
    carbs: profile.carbs * safeFactor,
    fat: profile.fat * safeFactor,
  };

  for (const key of MICRONUTRIENT_KEYS) {
    const value = profile[key];
    if (value === undefined) continue;
    scaled[key] = value * safeFactor;
  }

  return scaled;
}
