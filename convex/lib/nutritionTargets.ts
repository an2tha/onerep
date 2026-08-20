import type { MutationCtx } from "../_generated/server";
import {
  NUTRITION_TARGET_FIELDS,
  NUTRITION_TARGET_RANGES,
  type NutritionTargetField,
} from "../../packages/models/src/coach";

export type NutritionTargetInput = Partial<
  Record<NutritionTargetField, number | null>
>;

export type NutritionTargetSnapshot = {
  customGoals: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  } | null;
  waterGoalMl: number | null;
};

const MACRO_FIELDS = ["calories", "protein", "carbs", "fat"] as const;

/** Rounds and bounds-checks one field, or throws with the field named. */
function clean(field: NutritionTargetField, value: number) {
  const [low, high] = NUTRITION_TARGET_RANGES[field];
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < low || rounded > high)
    throw new Error(`${field} must be between ${low} and ${high}`);
  return rounded;
}

/**
 * Writes the daily target sheet and hands back what was there before.
 *
 * Three callers share this — the coach operation, the MCP tool, the REST route
 * — because the interesting part is not the patch, it is the snapshot: undo
 * has to restore an absent override as absent, not as whatever the calculator
 * happened to suggest that day.
 */
export async function applyNutritionTargets(
  ctx: MutationCtx,
  userId: string,
  input: NutritionTargetInput,
) {
  const changed = NUTRITION_TARGET_FIELDS.filter(
    (field) => input[field] !== undefined,
  );
  if (changed.length === 0) throw new Error("No nutrition target was given");

  const existing = await ctx.db
    .query("userPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  const previous: NutritionTargetSnapshot = {
    customGoals: existing?.customGoals ?? null,
    waterGoalMl: existing?.waterGoalMl ?? null,
  };

  const customGoals: Record<string, number | undefined> = {
    ...(existing?.customGoals ?? {}),
  };
  for (const field of MACRO_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    customGoals[field] = value === null ? undefined : clean(field, value);
  }

  const waterInput = input.waterMl;
  const waterGoalMl =
    waterInput === undefined
      ? previous.waterGoalMl
      : waterInput === null
        ? null
        : clean("waterMl", waterInput);

  const patch = {
    customGoals: Object.values(customGoals).some((value) => value != null)
      ? {
          calories: customGoals.calories,
          protein: customGoals.protein,
          carbs: customGoals.carbs,
          fat: customGoals.fat,
        }
      : undefined,
    waterGoalMl: waterGoalMl ?? undefined,
    updatedAt: Date.now(),
  };

  if (existing) await ctx.db.patch(existing._id, patch);
  else
    await ctx.db.insert("userPreferences", {
      userId,
      lastActiveTimezone: "UTC",
      ...patch,
    });

  return {
    previous,
    targets: {
      calories: customGoals.calories ?? null,
      protein: customGoals.protein ?? null,
      carbs: customGoals.carbs ?? null,
      fat: customGoals.fat ?? null,
      waterMl: waterGoalMl,
    },
    changed,
  };
}

/** Puts a snapshot back, absences included. Used by undo. */
export async function restoreNutritionTargets(
  ctx: MutationCtx,
  userId: string,
  snapshot: NutritionTargetSnapshot,
) {
  const existing = await ctx.db
    .query("userPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!existing) return;
  await ctx.db.patch(existing._id, {
    customGoals: snapshot.customGoals ?? undefined,
    waterGoalMl: snapshot.waterGoalMl ?? undefined,
    updatedAt: Date.now(),
  });
}

/** One line for a summary or an undo label. */
export function describeNutritionTargets(targets: {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  waterMl: number | null;
}) {
  const parts: string[] = [];
  if (targets.calories != null) parts.push(`${targets.calories} kcal`);
  if (targets.protein != null) parts.push(`${targets.protein} g protein`);
  if (targets.carbs != null) parts.push(`${targets.carbs} g carbs`);
  if (targets.fat != null) parts.push(`${targets.fat} g fat`);
  if (targets.waterMl != null) parts.push(`${targets.waterMl} ml water`);
  return parts.length > 0 ? parts.join(", ") : "no daily targets";
}
