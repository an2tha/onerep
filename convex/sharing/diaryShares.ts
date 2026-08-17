import { v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

const MAX_OUTGOING_SHARES = 20;

const scopeValidator = v.object({
  diary: v.boolean(),
  report: v.boolean(),
  comments: v.boolean(),
});

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function assertValidEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address");
  }
}

function assertDateOrder(start?: string, end?: string) {
  if (start && end && start > end) {
    throw new Error("The end date must not be before the start date");
  }
}

/**
 * An opaque, unguessable invite token.
 *
 * `crypto.getRandomValues` rather than Math.random: the token is what a
 * recipient presents to claim the invite, so guessability matters.
 */
function createToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

// ── owner side ────────────────────────────────────────────────────────────────

export const listOutgoing = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const docs = await ctx.db
      .query("diaryShares")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
      .take(MAX_OUTGOING_SHARES * 2);

    return docs
      .filter((doc) => doc.status !== "revoked" && doc.status !== "declined")
      .sort((a, b) => b.invitedAt - a.invitedAt)
      .map((doc) => ({ ...doc, id: doc._id }));
  },
});

export const invite = mutation({
  args: {
    email: v.string(),
    scope: scopeValidator,
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const inviteeEmail = normalizeEmail(args.email);
    assertValidEmail(inviteeEmail);
    assertDateOrder(args.startDate, args.endDate);

    if (user.email && normalizeEmail(user.email) === inviteeEmail) {
      throw new Error("You already have access to your own diary");
    }

    const existing = await ctx.db
      .query("diaryShares")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
      .take(MAX_OUTGOING_SHARES * 2);

    const live = existing.filter(
      (doc) => doc.status === "pending" || doc.status === "accepted",
    );
    if (live.some((doc) => doc.inviteeEmail === inviteeEmail)) {
      throw new Error("You already shared your diary with this person");
    }
    if (live.length >= MAX_OUTGOING_SHARES) {
      throw new Error(
        `You can share your diary with up to ${MAX_OUTGOING_SHARES} people.`,
      );
    }

    const now = Date.now();
    const token = createToken();
    const id = await ctx.db.insert("diaryShares", {
      ownerUserId: user._id,
      ownerEmail: user.email,
      ownerName: user.name,
      inviteeEmail,
      status: "pending",
      scope: args.scope,
      startDate: args.startDate,
      endDate: args.endDate,
      token,
      invitedAt: now,
      updatedAt: now,
    });

    // Delivery is scheduled, not awaited: mutations cannot fetch, and a mail
    // outage must not fail the share. The in-app link is the fallback.
    await ctx.scheduler.runAfter(0, internal.sharing.emails.sendInvite, {
      to: inviteeEmail,
      ownerName: user.name ?? undefined,
      ownerEmail: user.email ?? undefined,
      token,
    });

    return id;
  },
});

export const updateScope = mutation({
  args: {
    id: v.id("diaryShares"),
    scope: scopeValidator,
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.ownerUserId !== user._id) {
      throw new Error("Share not found or access denied");
    }
    assertDateOrder(args.startDate, args.endDate);

    await ctx.db.patch(args.id, {
      scope: args.scope,
      startDate: args.startDate,
      endDate: args.endDate,
      updatedAt: Date.now(),
    });
  },
});

export const revoke = mutation({
  args: { id: v.id("diaryShares") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.ownerUserId !== user._id) {
      throw new Error("Share not found or access denied");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    });
  },
});

// ── invitee side ──────────────────────────────────────────────────────────────

/**
 * Invites waiting for this account plus diaries already shared with it.
 *
 * Pending invites match on the caller's **verified** email — that email match
 * is what binds an invite to an account. Accepted shares match on the stored
 * `inviteeUserId`, never on email again.
 */
export const listIncoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const accepted = await ctx.db
      .query("diaryShares")
      .withIndex("by_inviteeUserId_and_status", (q) =>
        q.eq("inviteeUserId", user._id).eq("status", "accepted"),
      )
      .take(MAX_OUTGOING_SHARES * 2);

    const pending = user.email
      ? await ctx.db
          .query("diaryShares")
          .withIndex("by_inviteeEmail_and_status", (q) =>
            q.eq("inviteeEmail", normalizeEmail(user.email!)).eq("status", "pending"),
          )
          .take(MAX_OUTGOING_SHARES * 2)
      : [];

    return [...accepted, ...pending]
      .sort((a, b) => b.invitedAt - a.invitedAt)
      .map((doc) => ({ ...doc, id: doc._id }));
  },
});

export const getInviteByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;

    const doc = await ctx.db
      .query("diaryShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!doc || doc.status !== "pending") return null;
    // Only the addressee sees the invite details, so a leaked token alone
    // reveals nothing about the owner.
    if (!user.email || normalizeEmail(user.email) !== doc.inviteeEmail) {
      return null;
    }

    return {
      id: doc._id,
      ownerName: doc.ownerName,
      ownerEmail: doc.ownerEmail,
      scope: doc.scope,
      startDate: doc.startDate,
      endDate: doc.endDate,
      invitedAt: doc.invitedAt,
    };
  },
});

export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const doc = await ctx.db
      .query("diaryShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!doc || doc.status !== "pending") {
      throw new Error("This invite is no longer available");
    }
    // The email check is the whole security model for claiming an invite. It
    // is safe only because Better Auth requires a verified email.
    if (!user.email || normalizeEmail(user.email) !== doc.inviteeEmail) {
      throw new Error("This invite was sent to a different email address");
    }

    const now = Date.now();
    await ctx.db.patch(doc._id, {
      inviteeUserId: user._id,
      inviteeName: user.name,
      status: "accepted",
      acceptedAt: now,
      updatedAt: now,
    });
    return doc.ownerUserId;
  },
});

export const declineInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const doc = await ctx.db
      .query("diaryShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!doc || doc.status !== "pending") {
      throw new Error("This invite is no longer available");
    }
    if (!user.email || normalizeEmail(user.email) !== doc.inviteeEmail) {
      throw new Error("This invite was sent to a different email address");
    }

    await ctx.db.patch(doc._id, {
      status: "declined",
      updatedAt: Date.now(),
    });
  },
});

/** Viewer-initiated revoke: stepping away from someone else's diary. */
export const leaveShare = mutation({
  args: { id: v.id("diaryShares") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.inviteeUserId !== user._id) {
      throw new Error("Share not found or access denied");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    });
  },
});
