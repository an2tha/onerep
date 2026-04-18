import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";

async function requireUser(
  ctx:
    | Parameters<typeof mutation>[0]["ctx"]
    | Parameters<typeof query>[0]["ctx"],
) {
  const user = await authComponent.getAuthUser(ctx);
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
