import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { getLatestOnboardingProfile } from "../lib/onboardingProfiles";
import { findFreeWorkoutSlot, upsertWorkoutLog } from "../lib/workoutLogs";

/** One HealthKit batch. The client reads at most 50 workouts per sync. */
const MAX_IMPORT_BATCH = 50;

/**
 * Activity types that map cleanly onto a cardio exercise.
 *
 * HealthKit also returns strength training, which has no distance or pace and
 * would produce a misleading cardio row. Those still import — they just are not
 * offered for promotion into the training log.
 */
const LINKABLE_ACTIVITY_TYPES = new Set([
  "running",
  "walking",
  "cycling",
  "swimming",
  "rowing",
  "hiking",
  "elliptical",
  "stairClimbing",
  "crossCountrySkiing",
  "downhillSkiing",
  "wheelchairRunPace",
  "wheelchairWalkPace",
]);

export function isLinkableActivity(activityType: string): boolean {
  return LINKABLE_ACTIVITY_TYPES.has(activityType);
}

/**
 * Activity types that represent lifting rather than cardio.
 *
 * These are the inverse of the linkable set: HealthKit knows the session
 * happened and how long it lasted, but carries no exercises, so promoting one
 * automatically would produce an empty log. Instead they seed the retro logger,
 * where the user supplies what they actually did.
 */
const STRENGTH_ACTIVITY_TYPES = new Set([
  "traditionalStrengthTraining",
  "functionalStrengthTraining",
  "coreTraining",
]);

export function isStrengthActivity(activityType: string): boolean {
  return STRENGTH_ACTIVITY_TYPES.has(activityType);
}

/** The session id a health workout always promotes onto, linked or not. */
export function healthSessionId(externalId: string) {
  return `apple-health:${externalId}`;
}

const appleHealthWorkoutValidator = v.object({
  uuid: v.string(),
  activityType: v.string(),
  activityName: v.string(),
  /** Local date, computed client-side — see the timezone note in the sync lib. */
  date: v.string(),
  startedAt: v.string(),
  endedAt: v.string(),
  durationSeconds: v.number(),
  totalDistanceMeters: v.optional(v.number()),
  avgHeartRateBpm: v.optional(v.number()),
  maxHeartRateBpm: v.optional(v.number()),
  activeEnergyKcal: v.optional(v.number()),
  sourceName: v.optional(v.string()),
  sourceBundleId: v.optional(v.string()),
  hasRoute: v.optional(v.boolean()),
  routeName: v.optional(v.string()),
});

async function requireWearableConsent(ctx: MutationCtx, userId: string) {
  // Re-checked server-side: the client gate is a UX affordance, not a control.
  const profile = await getLatestOnboardingProfile(ctx, userId);
  if (profile?.consent?.wearableIntegrations !== true) {
    throw new Error("Health sync is not enabled for this account");
  }
}

async function patchHealthSync(
  ctx: MutationCtx,
  userId: string,
  patch: { lastSyncedAt?: number; lastSyncError?: string },
) {
  const existing = await ctx.db
    .query("userPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const healthSync = {
    appleHealthEnabled: existing?.healthSync?.appleHealthEnabled ?? true,
    autoSyncOnForeground: existing?.healthSync?.autoSyncOnForeground ?? true,
    ...existing?.healthSync,
    ...patch,
  };
  if (existing) {
    await ctx.db.patch(existing._id, { healthSync, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("userPreferences", {
      userId,
      lastActiveTimezone: "UTC",
      healthSync,
      updatedAt: Date.now(),
    });
  }
}

/**
 * Idempotent upsert keyed on the HealthKit UUID.
 *
 * Re-running the same pull is a no-op beyond metric revisions — HealthKit
 * revises energy and heart rate after a workout has already synced.
 */
export const importFromAppleHealth = mutation({
  args: { workouts: v.array(appleHealthWorkoutValidator) },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    await requireWearableConsent(ctx, user._id);

    if (args.workouts.length > MAX_IMPORT_BATCH) {
      throw new Error(`At most ${MAX_IMPORT_BATCH} workouts per sync`);
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const now = Date.now();

    for (const workout of args.workouts) {
      const startedAt = Date.parse(workout.startedAt);
      const endedAt = Date.parse(workout.endedAt);
      if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
        skipped += 1;
        continue;
      }

      const fields = {
        activityType: workout.activityType,
        activityName: workout.activityName,
        date: workout.date,
        startedAt,
        endedAt,
        durationSeconds: workout.durationSeconds,
        totalDistanceMeters: workout.totalDistanceMeters,
        avgHeartRateBpm: workout.avgHeartRateBpm,
        maxHeartRateBpm: workout.maxHeartRateBpm,
        activeEnergyKcal: workout.activeEnergyKcal,
        sourceName: workout.sourceName,
        sourceBundleId: workout.sourceBundleId,
        hasRoute: workout.hasRoute,
        routeName: workout.routeName,
      };

      const existing = await ctx.db
        .query("healthWorkouts")
        .withIndex("by_userId_and_externalId", (q) =>
          q.eq("userId", user._id).eq("externalId", workout.uuid),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { ...fields, updatedAt: now });
        updated += 1;
      } else {
        await ctx.db.insert("healthWorkouts", {
          userId: user._id,
          provider: "apple_health",
          externalId: workout.uuid,
          ...fields,
          importedAt: now,
          updatedAt: now,
        });
        imported += 1;
      }
    }

    await patchHealthSync(ctx, user._id, { lastSyncedAt: now });
    return { imported, updated, skipped };
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);

    const rows = await ctx.db
      .query("healthWorkouts")
      .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit * 2);

    return rows
      .filter((row) => row.dismissedAt === undefined)
      .slice(0, limit)
      .map((row) => ({
        _id: row._id,
        externalId: row.externalId,
        activityType: row.activityType,
        activityName: row.activityName,
        date: row.date,
        startedAt: row.startedAt,
        durationSeconds: row.durationSeconds,
        totalDistanceMeters: row.totalDistanceMeters,
        avgHeartRateBpm: row.avgHeartRateBpm,
        maxHeartRateBpm: row.maxHeartRateBpm,
        activeEnergyKcal: row.activeEnergyKcal,
        sourceName: row.sourceName,
        linked: row.linkedSessionId !== undefined,
        linkable: isLinkableActivity(row.activityType),
        // Recorded lifting with nothing to promote — the retro logger's cue.
        needsExercises:
          isStrengthActivity(row.activityType) &&
          row.linkedSessionId === undefined,
      }));
  },
});

// ── unlogged ──────────────────────────────────────────────────────────────────

/**
 * Recorded strength sessions with no training log behind them.
 *
 * Feeds the "you trained Tuesday — what did you do?" prompt. Dates that already
 * hold two sessions are filtered out so the nudge never offers a workout that
 * cannot be saved.
 */
export const unlogged = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const limit = Math.min(Math.max(args.limit ?? 3, 1), 5);

    const rows = await ctx.db
      .query("healthWorkouts")
      .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(30);

    const candidates = rows
      .filter(
        (row) =>
          row.dismissedAt === undefined &&
          row.linkedSessionId === undefined &&
          isStrengthActivity(row.activityType),
      )
      // Bound the per-date slot reads below rather than scanning every match.
      .slice(0, limit * 2);

    const results = [];
    for (const row of candidates) {
      if (results.length >= limit) break;
      const slot = await findFreeWorkoutSlot(
        ctx,
        user._id,
        row.date,
        healthSessionId(row.externalId),
      );
      if (slot === null) continue;
      results.push({
        _id: row._id,
        externalId: row.externalId,
        activityName: row.activityName,
        date: row.date,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        durationSeconds: row.durationSeconds,
        activeEnergyKcal: row.activeEnergyKcal,
        avgHeartRateBpm: row.avgHeartRateBpm,
        sourceName: row.sourceName,
        slot,
      });
    }
    return results;
  },
});

// ── getById ───────────────────────────────────────────────────────────────────

/** Seeds the retro logger with a recorded session's date, duration and end. */
export const getById = query({
  args: { id: v.id("healthWorkouts") },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== user._id) return null;
    return {
      _id: row._id,
      externalId: row.externalId,
      sessionId: healthSessionId(row.externalId),
      activityType: row.activityType,
      activityName: row.activityName,
      date: row.date,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      durationSeconds: row.durationSeconds,
      activeEnergyKcal: row.activeEnergyKcal,
      avgHeartRateBpm: row.avgHeartRateBpm,
      sourceName: row.sourceName,
      linked: row.linkedSessionId !== undefined,
    };
  },
});

// ── attachToLog ───────────────────────────────────────────────────────────────

/**
 * Records that a retro-logged session covers this recorded workout.
 *
 * Separate from `linkToTrainingLog`: that mutation *creates* a cardio log,
 * whereas here the user has already written the log by hand and this only marks
 * the linkage so the nudge stops offering it and a re-sync stays idempotent.
 */
export const attachToLog = mutation({
  args: {
    id: v.id("healthWorkouts"),
    sessionId: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const workout = await ctx.db.get(args.id);
    if (!workout || workout.userId !== user._id) {
      throw new Error("Health workout not found");
    }

    const log = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_and_date_and_sessionId", (q) =>
        q
          .eq("userId", user._id)
          .eq("date", args.date)
          .eq("sessionId", args.sessionId),
      )
      .unique();
    if (!log) throw new Error("No workout log to attach to");

    await ctx.db.patch(args.id, {
      linkedSessionId: args.sessionId,
      linkedDate: args.date,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Promotes one imported workout into the training log.
 *
 * The session id is namespaced so it can never collide with a client
 * `crypto.randomUUID()`, which also makes re-linking idempotent for free via
 * the existing `by_userId_and_date_and_sessionId` index.
 */
export const linkToTrainingLog = mutation({
  args: { id: v.id("healthWorkouts") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const workout = await ctx.db.get(args.id);
    if (!workout || workout.userId !== user._id) {
      throw new Error("Health workout not found");
    }
    if (!isLinkableActivity(workout.activityType)) {
      throw new Error("This activity type cannot be added to the training log");
    }

    const sessionId = `apple-health:${workout.externalId}`;
    // A slot is mandatory: `logs.workouts.getLog` reads `.take(2)` per date, so
    // a slot-less third log would be silently invisible.
    const slot = await findFreeWorkoutSlot(
      ctx,
      user._id,
      workout.date,
      sessionId,
    );
    if (slot === null) {
      throw new Error(
        "You already have two sessions logged that day. Remove one first.",
      );
    }

    await upsertWorkoutLog(ctx, user._id, {
      date: workout.date,
      sessionId,
      slot,
      durationSeconds: workout.durationSeconds,
      exercises: [
        {
          id: sessionId,
          name: workout.activityName,
          category: "cardio",
          sets: [],
          cardio: {
            distanceMeters: workout.totalDistanceMeters,
            durationSeconds: workout.durationSeconds,
            avgHeartRateBpm: workout.avgHeartRateBpm,
            maxHeartRateBpm: workout.maxHeartRateBpm,
            ...(workout.hasRoute
              ? { route: { name: workout.routeName } }
              : {}),
            source: {
              provider: "apple_health" as const,
              name: workout.sourceName ?? "Apple Health",
              externalId: workout.externalId,
              importedAt: new Date(workout.importedAt).toISOString(),
            },
          },
        },
      ],
    });

    await ctx.db.patch(args.id, {
      linkedSessionId: sessionId,
      linkedDate: workout.date,
      updatedAt: Date.now(),
    });

    return { sessionId, slot };
  },
});

export const unlink = mutation({
  args: { id: v.id("healthWorkouts") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const workout = await ctx.db.get(args.id);
    if (!workout || workout.userId !== user._id) {
      throw new Error("Health workout not found");
    }
    if (!workout.linkedSessionId || !workout.linkedDate) return { ok: true };

    const log = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_and_date_and_sessionId", (q) =>
        q
          .eq("userId", user._id)
          .eq("date", workout.linkedDate!)
          .eq("sessionId", workout.linkedSessionId!),
      )
      .unique();
    if (log) await ctx.db.delete(log._id);

    await ctx.db.patch(args.id, {
      linkedSessionId: undefined,
      linkedDate: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const dismiss = mutation({
  args: { id: v.id("healthWorkouts") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const workout = await ctx.db.get(args.id);
    if (!workout || workout.userId !== user._id) {
      throw new Error("Health workout not found");
    }
    await ctx.db.patch(args.id, {
      dismissedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Recorded so Settings can show why a background sync stopped working. */
export const recordSyncError = mutation({
  args: { message: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    await patchHealthSync(ctx, user._id, {
      lastSyncError: args.message.slice(0, 200),
    });
    return { ok: true };
  },
});
