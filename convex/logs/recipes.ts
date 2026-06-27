import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

async function requireUser(ctx: MutationCtx | QueryCtx) {
  const user = await getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

const recipeIngredientValidator = v.object({
  id: v.string(),
  name: v.string(),
  grams: v.number(),
  displayAmount: v.optional(v.number()),
  displayUnit: v.optional(v.string()),
  servingLabel: v.optional(v.string()),
  caloriesPer100: v.number(),
  proteinPer100: v.number(),
  carbsPer100: v.number(),
  fatPer100: v.number(),
  fiberPer100: v.optional(v.number()),
  sugarPer100: v.optional(v.number()),
  saturatedFatPer100: v.optional(v.number()),
  transFatPer100: v.optional(v.number()),
  cholesterolPer100: v.optional(v.number()),
  sodiumPer100: v.optional(v.number()),
  potassiumPer100: v.optional(v.number()),
  calciumPer100: v.optional(v.number()),
  ironPer100: v.optional(v.number()),
  magnesiumPer100: v.optional(v.number()),
  phosphorusPer100: v.optional(v.number()),
  zincPer100: v.optional(v.number()),
  vitaminCPer100: v.optional(v.number()),
  vitaminAPer100: v.optional(v.number()),
  vitaminDPer100: v.optional(v.number()),
  vitaminB12Per100: v.optional(v.number()),
  caffeinePer100: v.optional(v.number()),
  alcoholPer100: v.optional(v.number()),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("recipes")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id("recipes")),
    name: v.string(),
    ingredients: v.array(recipeIngredientValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    if (args.id) {
      // Update existing recipe
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.userId !== user._id) {
        throw new Error("Recipe not found or access denied");
      }
      await ctx.db.patch(args.id, {
        name: args.name,
        ingredients: args.ingredients,
        updatedAt: now,
      });
      return args.id;
    } else {
      // Insert new recipe
      return await ctx.db.insert("recipes", {
        userId: user._id,
        name: args.name,
        ingredients: args.ingredients,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const remove = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== user._id) {
      throw new Error("Recipe not found or access denied");
    }
    await ctx.db.delete(args.id);
  },
});
