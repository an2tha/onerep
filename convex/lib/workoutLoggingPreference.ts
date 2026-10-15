import type { MutationCtx } from "../_generated/server";

export async function setWorkoutLoggingPreference(
  ctx: MutationCtx,
  userId: string,
  enabled: boolean,
) {
  const existing = await ctx.db
    .query("userPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const changes = { relaxedWorkoutLogging: enabled, updatedAt: Date.now() };
  if (existing) await ctx.db.patch("userPreferences", existing._id, changes);
  else {
    await ctx.db.insert("userPreferences", {
      userId,
      lastActiveTimezone: "UTC",
      ...changes,
    });
  }
  return { previous: existing?.relaxedWorkoutLogging ?? false, enabled };
}
