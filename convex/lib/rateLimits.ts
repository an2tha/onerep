import type { MutationCtx } from "../_generated/server";

export const RATE_LIMITED = "RATE_LIMITED";

/**
 * Claims one slot in a fixed-window counter. This helper must only be called
 * from a mutation so the read and increment are atomic.
 */
export async function claimRateLimit(
  ctx: MutationCtx,
  userId: string,
  action: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${action}:${userId}:${windowStart}`;
  const existing = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (existing) {
    if (existing.count >= limit) throw new Error(RATE_LIMITED);
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return;
  }

  await ctx.db.insert("rateLimitBuckets", {
    key,
    userId,
    action,
    windowStart,
    count: 1,
    expiresAt: windowStart + windowMs * 2,
  });
}
