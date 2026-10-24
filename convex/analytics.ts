import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  action,
  env,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import {
  normalizeTikTokSnapshot,
  tikTokSnapshotValidator,
} from "./lib/tiktokAnalytics";
import type { TikTokSnapshot } from "./lib/tiktokAnalytics";
import {
  instagramSnapshotValidator,
  normalizeInstagramSnapshot,
  type InstagramSnapshot,
} from "./lib/instagramAnalytics";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { authComponent, safeGetAuthUser } from "./lib/auth";
import {
  commaSeparated,
  createAnalyticsAccumulator,
  excludedAnalyticsAccount,
} from "./lib/internalAnalytics";
import type {
  AnalyticsAccount,
  AnalyticsReport,
} from "./lib/internalAnalytics";

async function canViewAnalytics(ctx: QueryCtx | ActionCtx) {
  const user = await safeGetAuthUser(ctx);
  if (!user) return false;
  if (commaSeparated(env.ANALYTICS_ADMIN_USER_IDS).has(user.tokenIdentifier))
    return true;
  const emails = new Set(
    [...commaSeparated(env.ANALYTICS_ADMIN_EMAILS)].map((email) =>
      email.toLowerCase(),
    ),
  );
  if (emails.size === 0) return false;
  // Never grant access from an unverified address or a JWT email claim alone.
  const identity = await ctx.auth.getUserIdentity();
  if (typeof identity?.sessionId !== "string" || !identity.sessionId)
    return false;
  const account = await authComponent.safeGetAuthUser(ctx);
  return Boolean(
    account?.emailVerified &&
    user.tokenIdentifier === `${process.env.CONVEX_SITE_URL}|${account._id}` &&
    emails.has(account.email.trim().toLowerCase()),
  );
}

async function requireAdmin(ctx: QueryCtx | ActionCtx) {
  if (!(await canViewAnalytics(ctx)))
    throw new ConvexError("Analytics is restricted to administrators.");
}

export const viewer = query({
  args: {},
  handler: async (ctx) => ({ canView: await canViewAnalytics(ctx) }),
});

export const tiktokSnapshot = query({
  args: {},
  handler: async (ctx): Promise<TikTokSnapshot | null> => {
    await requireAdmin(ctx);
    const snapshot = await ctx.db
      .query("analyticsSocialSnapshots")
      .withIndex("by_accountHandle", (q) =>
        q.eq("accountHandle", "onerep.life"),
      )
      .unique();
    if (!snapshot) return null;
    const { _id, _creationTime, ...data } = snapshot;
    return data;
  },
});

export const instagramSnapshot = query({
  args: {},
  handler: async (ctx): Promise<InstagramSnapshot | null> => {
    await requireAdmin(ctx);
    const snapshot = await ctx.db
      .query("analyticsInstagramSnapshots")
      .withIndex("by_accountHandle", (q) => q.eq("accountHandle", "onerep_app"))
      .unique();
    if (!snapshot) return null;
    const { _id, _creationTime, ...data } = snapshot;
    return data;
  },
});

export const syncInstagramSnapshot = internalMutation({
  args: { snapshot: instagramSnapshotValidator },
  handler: async (ctx, { snapshot }) => {
    const data = normalizeInstagramSnapshot(snapshot, Date.now());
    const existing = await ctx.db
      .query("analyticsInstagramSnapshots")
      .withIndex("by_accountHandle", (q) =>
        q.eq("accountHandle", data.accountHandle),
      )
      .unique();
    if (existing && existing.capturedAt > data.capturedAt)
      throw new ConvexError("A newer Instagram snapshot is already saved.");
    if (existing) await ctx.db.replace(existing._id, data);
    else await ctx.db.insert("analyticsInstagramSnapshots", data);
    return { accountHandle: data.accountHandle, capturedAt: data.capturedAt };
  },
});

// Only server code or the existing deployment-admin CLI can update this cache.
// The browser has no public mutation and never receives Metricool credentials.
export const syncTikTokSnapshot = internalMutation({
  args: { snapshot: tikTokSnapshotValidator },
  handler: async (ctx, { snapshot }) => {
    const data = normalizeTikTokSnapshot(snapshot, Date.now());
    const existing = await ctx.db
      .query("analyticsSocialSnapshots")
      .withIndex("by_accountHandle", (q) =>
        q.eq("accountHandle", data.accountHandle),
      )
      .unique();
    if (existing && existing.capturedAt > data.capturedAt)
      throw new ConvexError("A newer TikTok snapshot is already saved.");
    if (existing) await ctx.db.replace(existing._id, data);
    else await ctx.db.insert("analyticsSocialSnapshots", data);
    return { accountHandle: data.accountHandle, capturedAt: data.capturedAt };
  },
});

// Internal pages never return addresses, names, exercises, durations, or health data.
export const accountPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), asOf: v.number() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    page: AnalyticsAccount[];
    isDone: boolean;
    continueCursor: string;
  }> => {
    await requireAdmin(ctx);
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: { cursor: args.cursor, numItems: 128 },
    });
    const issuer = process.env.CONVEX_SITE_URL;
    if (!issuer)
      throw new ConvexError("Analytics account mapping is unavailable.");
    const excludedIds = commaSeparated(env.ANALYTICS_EXCLUDED_USER_IDS);
    const excludedEmails = new Set(
      [...commaSeparated(env.ANALYTICS_EXCLUDED_EMAILS)].map((email) =>
        email.toLowerCase(),
      ),
    );
    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      page: result.page
        .filter((user) => user._creationTime <= args.asOf)
        .map((user) => {
          const userId = `${issuer}|${user._id}`;
          return {
            userId,
            signupAt: user.createdAt,
            excluded: excludedAnalyticsAccount(
              { userId, email: user.email },
              excludedIds,
              excludedEmails,
            ),
          };
        }),
    };
  },
});

export const workoutPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), asOf: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db
      .query("workoutLogs")
      .withIndex("by_creation_time", (q) => q.lte("_creationTime", args.asOf))
      .paginate({
        cursor: args.cursor,
        numItems: 128,
        maximumBytesRead: 1_000_000,
      });
    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      page: result.page.map((log) => ({
        userId: log.userId,
        loggedAt: log._creationTime,
        date: log.date,
      })),
    };
  },
});

/** On-demand and paginated, so refreshing does not create a live full-table subscription. */
export const report = action({
  args: {},
  handler: async (ctx): Promise<AnalyticsReport> => {
    await requireAdmin(ctx);
    const asOf = Date.now();
    const accumulator = createAnalyticsAccumulator(asOf);
    // Fail explicitly rather than displaying truncated counts on oversized datasets.
    for (const kind of ["accounts", "workouts"] as const) {
      let cursor: string | null = null;
      let complete = false;
      for (let page = 0; page < 2_000; page++) {
        if (kind === "accounts") {
          const result = await ctx.runQuery(internal.analytics.accountPage, {
            cursor,
            asOf,
          });
          result.page.forEach(accumulator.account);
          cursor = result.continueCursor;
          complete = result.isDone;
        } else {
          const result = await ctx.runQuery(internal.analytics.workoutPage, {
            cursor,
            asOf,
          });
          result.page.forEach(accumulator.workout);
          cursor = result.continueCursor;
          complete = result.isDone;
        }
        if (complete) break;
      }
      if (!complete)
        throw new ConvexError(
          "This dataset needs an analytics rollup. No partial totals were returned.",
        );
    }
    await requireAdmin(ctx);
    return accumulator.finish();
  },
});
