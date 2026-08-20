/**
 * Server-side "has this already been celebrated?".
 *
 * The client used to answer this out of localStorage, which quietly redefined
 * once-per-achievement as once-per-device. The arithmetic is trivial; the only
 * reason it lives here is that the answer has to survive a reinstall and follow
 * the account onto a second phone.
 */

import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { safeGetAuthUser } from "../lib/auth";

/**
 * Claim one celebration, returning whether the caller is the first to do so.
 *
 * Signed out, the answer is a permissive `true`: an anonymous session showing
 * confetti twice is a smaller failure than a real achievement passing in
 * silence because the auth check happened to be mid-flight.
 */
export const claim = mutation({
  args: {
    kind: v.string(),
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return { claimed: true, persisted: false };

    const existing = await ctx.db
      .query("celebrations")
      .withIndex("by_userId_and_kind_and_dedupeKey", (q) =>
        q
          .eq("userId", user._id)
          .eq("kind", args.kind)
          .eq("dedupeKey", args.dedupeKey),
      )
      .unique();
    if (existing) return { claimed: false, persisted: true };

    await ctx.db.insert("celebrations", {
      userId: user._id,
      kind: args.kind,
      dedupeKey: args.dedupeKey,
      celebratedAt: Date.now(),
    });
    return { claimed: true, persisted: true };
  },
});
