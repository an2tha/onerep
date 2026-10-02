import { zonedNow } from "../../packages/models/src/moments";
import { v } from "convex/values";

export const restartReason = v.union(
  v.literal("energy"),
  v.literal("starting"),
  v.literal("schedule"),
  v.literal("unsure"),
);
export const restartAction = v.union(
  v.literal("walk"),
  v.literal("gym"),
  v.literal("home"),
  v.literal("rest"),
);
export const restartChoices = {
  reason: restartReason,
  action: restartAction,
  anchor: v.string(),
};
export const RESTART_GAP_MS = 14 * 86_400_000;
export function restartNudgeDue(
  lastLoggedAt: number | null,
  now: number,
  quietUntil: number,
  active: boolean,
) {
  return (
    !active &&
    lastLoggedAt !== null &&
    now - lastLoggedAt >= RESTART_GAP_MS &&
    now >= quietUntil
  );
}

/** Only a fresh, matching action after preparation can advance a restart.
 * Existing-log edits and backfills never call this with a new completion. */
export async function creditRestartAction(
  ctx: import("../_generated/server").MutationCtx,
  userId: string,
  action: "training" | "rest",
  date: string,
  occurredAt: number,
) {
  const plan = await ctx.db
    .query("restartPlans")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!plan || plan.status !== "active" || plan.stage < 1 || plan.stage > 2)
    return;
  if (
    action === "rest"
      ? plan.action !== "rest"
      : !["gym", "home"].includes(plan.action ?? "")
  )
    return;
  const preferences = await ctx.db
    .query("userPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const today = zonedNow(preferences?.lastActiveTimezone ?? "UTC").todayKey;
  if (date !== today || occurredAt < (plan.startedAt ?? plan._creationTime))
    return;
  if (plan.stage === 2 && plan.lastActionOn === today) return;
  const stage = plan.stage + 1;
  await ctx.db.patch(plan._id, {
    stage,
    lastActionOn: today,
    updatedAt: Date.now(),
    status: stage >= 3 ? "completed" : "active",
    quietUntil: stage >= 3 ? Date.now() + RESTART_GAP_MS : 0,
  });
}
