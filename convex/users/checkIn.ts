import { mutation, query } from "../_generated/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";
import { getAuthUser } from "../lib/auth";

async function requireUser(
  ctx: GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>,
) {
  const user = await getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export const getDailyCheckIn = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    return await ctx.db
      .query("dailyCheckIns")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const setDailyCheckIn = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("dailyCheckIns")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: now });
    } else {
      await ctx.db.insert("dailyCheckIns", {
        userId: user._id,
        updatedAt: now,
      });
    }
  },
});
