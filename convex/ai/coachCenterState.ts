import { query, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { safeGetAuthUser } from "../lib/auth";
import { centerKind, centerResult } from "../lib/coachCenterValidators";
import { coachCenterContent } from "../../packages/models/src/coach-center";
export const latest = query({
  args: { kind: centerKind },
  handler: async (ctx, { kind }) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    const row = await ctx.db
      .query("coachCenterResults")
      .withIndex("by_userId_and_kind", (q) =>
        q.eq("userId", user._id).eq("kind", kind),
      )
      .unique();
    return row?.result ?? null;
  },
});
export const save = internalMutation({
  args: { userId: v.string(), result: centerResult },
  handler: async (ctx, { userId, result }) => {
    coachCenterContent.parse(result.content);
    const row = await ctx.db
      .query("coachCenterResults")
      .withIndex("by_userId_and_kind", (q) =>
        q.eq("userId", userId).eq("kind", result.kind),
      )
      .unique();
    if (row) await ctx.db.patch(row._id, { result });
    else
      await ctx.db.insert("coachCenterResults", {
        userId,
        kind: result.kind,
        result,
      });
  },
});

export const forModel = internalQuery({
  args: { userId: v.string(), kind: centerKind },
  handler: async (ctx, { userId, kind }) =>
    (
      await ctx.db
        .query("coachCenterResults")
        .withIndex("by_userId_and_kind", (q) =>
          q.eq("userId", userId).eq("kind", kind),
        )
        .unique()
    )?.result ?? null,
});
