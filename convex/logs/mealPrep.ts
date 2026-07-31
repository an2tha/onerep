import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import {
  normalizeNutrientProfile,
  nutrientProfileValidator,
} from "../lib/nutritionValues";

const MAX_BATCHES = 200;

const storageValidator = v.union(
  v.literal("fridge"),
  v.literal("freezer"),
  v.literal("pantry"),
);

function cleanString(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function positiveServings(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  // Quarter-serving granularity keeps the math honest without float drift.
  return Math.round(value * 4) / 4;
}

// ── list ──────────────────────────────────────────────────────────────────────

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const docs = await ctx.db
      .query("mealPrepBatches")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_BATCHES);

    return docs
      .filter((doc) => (args.includeArchived ? true : !doc.archivedAt))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((doc) => ({ ...doc, id: doc._id }));
  },
});

// ── save (create or update) ───────────────────────────────────────────────────

export const save = mutation({
  args: {
    id: v.optional(v.id("mealPrepBatches")),
    name: v.string(),
    meal: v.optional(v.string()),
    notes: v.optional(v.string()),
    preppedOn: v.string(),
    useByOn: v.optional(v.string()),
    storage: v.optional(storageValidator),
    servingsTotal: v.number(),
    servingsLogged: v.optional(v.number()),
    nutrientsPerServing: nutrientProfileValidator,
    sourceRecipeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const name = cleanString(args.name);
    if (!name) throw new Error("Batch name is required");

    const preppedOn = cleanString(args.preppedOn);
    if (!preppedOn) throw new Error("Prep date is required");

    const servingsTotal = positiveServings(args.servingsTotal, "Servings");
    const now = Date.now();

    const body = {
      name,
      meal: cleanString(args.meal),
      notes: cleanString(args.notes),
      preppedOn,
      useByOn: cleanString(args.useByOn),
      storage: args.storage,
      servingsTotal,
      nutrientsPerServing: normalizeNutrientProfile(args.nutrientsPerServing),
      sourceRecipeId: cleanString(args.sourceRecipeId),
      updatedAt: now,
    };

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.userId !== user._id) {
        throw new Error("Meal prep batch not found or access denied");
      }
      // Editing a batch must not silently discard servings already eaten.
      const servingsLogged = Math.min(
        args.servingsLogged ?? existing.servingsLogged,
        servingsTotal,
      );
      await ctx.db.patch(args.id, { ...body, servingsLogged });
      return { id: args.id };
    }

    const id = await ctx.db.insert("mealPrepBatches", {
      userId: user._id,
      ...body,
      servingsLogged: Math.min(args.servingsLogged ?? 0, servingsTotal),
      createdAt: now,
    });

    return { id };
  },
});

// ── consume ───────────────────────────────────────────────────────────────────

/**
 * Records servings taken out of a batch. `servings` may be negative to undo a
 * mis-tap. Auto-archives the batch once it is emptied.
 */
export const consume = mutation({
  args: {
    id: v.id("mealPrepBatches"),
    servings: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const batch = await ctx.db.get(args.id);
    if (!batch || batch.userId !== user._id) {
      throw new Error("Meal prep batch not found or access denied");
    }

    if (!Number.isFinite(args.servings) || args.servings === 0) {
      throw new Error("Servings must be a non-zero number");
    }

    const delta = Math.round(args.servings * 4) / 4;
    const servingsLogged = Math.min(
      Math.max(batch.servingsLogged + delta, 0),
      batch.servingsTotal,
    );
    const emptied = servingsLogged >= batch.servingsTotal;

    await ctx.db.patch(args.id, {
      servingsLogged,
      archivedAt: emptied ? (batch.archivedAt ?? Date.now()) : undefined,
      updatedAt: Date.now(),
    });

    return {
      servingsLogged,
      servingsRemaining: batch.servingsTotal - servingsLogged,
    };
  },
});

// ── setArchived ───────────────────────────────────────────────────────────────

export const setArchived = mutation({
  args: { id: v.id("mealPrepBatches"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const batch = await ctx.db.get(args.id);
    if (!batch || batch.userId !== user._id) {
      throw new Error("Meal prep batch not found or access denied");
    }
    await ctx.db.patch(args.id, {
      archivedAt: args.archived ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
  },
});

// ── remove ────────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: { id: v.id("mealPrepBatches") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const batch = await ctx.db.get(args.id);
    if (!batch || batch.userId !== user._id) {
      throw new Error("Meal prep batch not found or access denied");
    }
    await ctx.db.delete(args.id);
  },
});
