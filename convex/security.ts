import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { claimRateLimit } from "./lib/rateLimits";

export const claim = internalMutation({
  args: {
    userId: v.string(),
    action: v.union(
      v.literal("checkout"),
      v.literal("purchase_restore"),
    ),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    await claimRateLimit(
      ctx,
      args.userId,
      args.action,
      args.limit,
      args.windowMs,
    );
    return null;
  },
});

