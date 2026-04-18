import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";

async function requireUser(ctx: any) {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
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
    ingredients: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        grams: v.number(),
        caloriesPer100: v.number(),
        proteinPer100: v.number(),
        carbsPer100: v.number(),
        fatPer100: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    if (args.id) {
      // Update existing recipe
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
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    await ctx.db.delete(args.id as any);
  },
});
