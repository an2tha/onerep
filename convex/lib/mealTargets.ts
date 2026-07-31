/**
 * Per-meal calorie budgets.
 *
 * Shares are stored as **percentages**, never absolute calories. A percentage
 * survives a goal edit, macro cycling and the workout-calorie adjustment; an
 * absolute number silently desyncs the moment the day's calorie target moves.
 * Absolutes are derived against the final `effective.calories`.
 *
 * Meal ids are arbitrary strings — the four defaults plus whatever custom
 * categories the user created — so shares are an array, not a record.
 */

export type MealShare = {
  meal: string;
  /** 0–100. */
  percent: number;
  /** Reserved for a future per-meal absolute override. Ignored today. */
  calories?: number;
};

export type ResolvedMealTarget = {
  meal: string;
  percent: number;
  calories: number;
};

export const DEFAULT_MEAL_IDS = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
] as const;

export const DEFAULT_MEAL_SHARES: MealShare[] = [
  { meal: "breakfast", percent: 25 },
  { meal: "lunch", percent: 35 },
  { meal: "dinner", percent: 30 },
  { meal: "snack", percent: 10 },
];

function safePercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(100, value);
}

/**
 * Reconciles stored shares against the meals that currently exist.
 *
 * Shares for deleted categories are dropped, newly created categories join at
 * 0%, every percent is clamped to [0, 100], and the result is rescaled so it
 * sums to exactly 100. If nothing usable survives, the meals split evenly —
 * a silently all-zero budget would render every meal as "0 kcal remaining".
 */
export function normalizeMealShares(
  shares: MealShare[] | undefined | null,
  knownMeals: string[],
): MealShare[] {
  const meals = Array.isArray(knownMeals)
    ? knownMeals.filter(
        (meal, index) =>
          typeof meal === "string" &&
          meal.length > 0 &&
          knownMeals.indexOf(meal) === index,
      )
    : [];

  if (meals.length === 0) return [];

  const byMeal = new Map<string, number>();
  if (Array.isArray(shares)) {
    for (const share of shares) {
      if (!share || typeof share.meal !== "string") continue;
      if (!meals.includes(share.meal)) continue;
      byMeal.set(share.meal, safePercent(share.percent));
    }
  }

  const raw = meals.map((meal) => ({
    meal,
    percent: byMeal.get(meal) ?? 0,
  }));

  const total = raw.reduce((sum, share) => sum + share.percent, 0);

  if (total <= 0) {
    const even = 100 / meals.length;
    return raw.map((share) => ({ ...share, percent: even }));
  }

  return raw.map((share) => ({
    ...share,
    percent: (share.percent / total) * 100,
  }));
}

/**
 * Turns percentages into whole calories.
 *
 * Uses largest-remainder rounding so the parts add up to `totalCalories`
 * exactly — three meals at 33.33% of 2000 give 667/667/666, not 3 × 666.
 */
export function resolveMealCalorieTargets(
  shares: MealShare[],
  totalCalories: number,
): ResolvedMealTarget[] {
  if (!Array.isArray(shares) || shares.length === 0) return [];

  const total =
    typeof totalCalories === "number" &&
    Number.isFinite(totalCalories) &&
    totalCalories > 0
      ? totalCalories
      : 0;

  const exact = shares.map((share) => {
    const percent = safePercent(share.percent);
    return { meal: share.meal, percent, value: (percent / 100) * total };
  });

  const floored = exact.map((item) => ({
    ...item,
    calories: Math.floor(item.value),
    remainder: item.value - Math.floor(item.value),
  }));

  let deficit =
    Math.round(total) - floored.reduce((sum, item) => sum + item.calories, 0);

  // Hand the leftover calories to the largest fractional parts first.
  const order = [...floored].sort((a, b) => b.remainder - a.remainder);
  for (const item of order) {
    if (deficit <= 0) break;
    item.calories += 1;
    deficit -= 1;
  }

  return floored.map(({ meal, percent, calories }) => ({
    meal,
    percent,
    calories,
  }));
}
