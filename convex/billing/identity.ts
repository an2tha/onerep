import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";

/**
 * Stable per-user token carried through every store purchase.
 *
 * StoreKit's `appAccountToken` must be a UUID, which our Convex user ids are
 * not, so we mint one and keep the reverse mapping in `billingIdentities`.
 * Play's `obfuscatedAccountId` and Stripe's `client_reference_id` reuse the same
 * value so a single lookup attributes a purchase on any platform.
 *
 * This is what lets an App Store Server Notification for a purchase we never
 * observed still be matched to the right account.
 */

/** Derive a deterministic UUIDv5-shaped token from the user id. */
async function deriveAppAccountToken(userId: string) {
  // A namespaced digest keeps the token stable across regenerations while not
  // leaking the user id to the stores.
  const data = new TextEncoder().encode(`onerep:billing:${userId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));

  const bytes = digest.slice(0, 16);
  // Stamp the version (5) and RFC 4122 variant bits so stores accept it.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export async function ensureAppAccountToken(ctx: MutationCtx, userId: string) {
  const existing = await ctx.db
    .query("billingIdentities")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (existing) return existing.appAccountToken;

  const appAccountToken = await deriveAppAccountToken(userId);
  await ctx.db.insert("billingIdentities", {
    userId,
    appAccountToken,
    createdAt: Date.now(),
  });
  return appAccountToken;
}

/**
 * Return the token the client must attach to a purchase, creating it on first
 * use. A mutation rather than a query because it persists the mapping.
 */
export const getOrCreateAppAccountToken = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => ({
    appAccountToken: await ensureAppAccountToken(ctx, args.userId),
  }),
});
