import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function requireUser(ctx: any) {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return null;
    return await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const syncTimezone = mutation({
  args: { timeZone: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    if (!isValidTimeZone(args.timeZone)) {
      return { timeZone: "UTC" };
    }

    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastActiveTimezone: args.timeZone,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: args.timeZone,
        updatedAt: Date.now(),
      });
    }

    return { timeZone: args.timeZone };
  },
});

export const setBodyReminder = mutation({
  args: {
    enabled: v.boolean(),
    hour: v.number(),
    minute: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        bodyReminder: args,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        bodyReminder: args,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setCustomMealCategories = mutation({
  args: {
    categories: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        color: v.string(),
        bg: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        customMealCategories: args.categories,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        customMealCategories: args.categories,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setDashboardSettings = mutation({
  args: {
    workoutFocus: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        dashboardSettings: args,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        dashboardSettings: args,
        updatedAt: Date.now(),
      });
    }
  },
});
function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
