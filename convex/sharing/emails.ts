import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { sendDiaryInviteEmail } from "../lib/authEmail";

/** Where the accept page lives on the web build of the app. */
function acceptUrl(token: string): string {
  const base = (
    process.env.SITE_URL?.trim() || "https://app.onerep.life"
  ).replace(/\/+$/, "");
  return `${base}/shared/accept?token=${encodeURIComponent(token)}`;
}

/**
 * Delivers a diary invitation. Scheduled from the invite mutation rather than
 * awaited: mutations cannot fetch, and delivery failing must never undo the
 * share row — the in-app link remains a working fallback.
 */
export const sendInvite = internalAction({
  args: {
    to: v.string(),
    ownerName: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    token: v.string(),
  },
  handler: async (_ctx, args) => {
    await sendDiaryInviteEmail({
      to: args.to,
      ownerName: args.ownerName,
      ownerEmail: args.ownerEmail,
      acceptUrl: acceptUrl(args.token),
    });
  },
});
