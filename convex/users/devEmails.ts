import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, mutation } from "../_generated/server";
import { getAuthUser } from "../lib/auth";
import { sendAuthEmail, sendDiaryInviteEmail } from "../lib/authEmail";

const kindValidator = v.union(
  v.literal("verification"),
  v.literal("password-reset"),
  v.literal("diary-invite"),
);

function siteUrl(): string {
  return (process.env.SITE_URL?.trim() || "https://app.onerep.life").replace(
    /\/+$/,
    "",
  );
}

/**
 * Sends a sample of one of the product's emails to the signed-in account's
 * own address. Exists for the developer menu: the templates are otherwise
 * only visible by resetting your password for real. The links point at the
 * app, not at live tokens — nothing a sample email lands on can act.
 */
export const sendTest = mutation({
  args: { kind: kindValidator },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user.email) throw new Error("This account has no email address");

    await ctx.scheduler.runAfter(0, internal.users.devEmails.deliverTest, {
      kind: args.kind,
      to: user.email,
      name: user.name ?? undefined,
    });
  },
});

export const deliverTest = internalAction({
  args: {
    kind: kindValidator,
    to: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    if (args.kind === "diary-invite") {
      await sendDiaryInviteEmail({
        to: args.to,
        ownerName: args.name,
        ownerEmail: args.to,
        acceptUrl: `${siteUrl()}/shared`,
      });
      return;
    }
    await sendAuthEmail({
      kind: args.kind,
      to: args.to,
      name: args.name,
      url: siteUrl(),
    });
  },
});
