import { trailPointValidator, validateTrailPoints } from "../lib/trailGeometry";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { getLatestOnboardingProfile } from "../lib/onboardingProfiles";
import {
  findCardioLinkTarget,
  findFreeWorkoutSlot,
  upsertWorkoutLog,
} from "../lib/workoutLogs";

/** One health batch. The client reads at most 50 workouts per sync. */
const MAX_IMPORT_BATCH = 50;

/** Which platform health store a row came from. */
/** What a device can claim to be. The sync mutation accepts only these. */
export type HealthProvider = "apple_health" | "health_connect";

/**
 * What a stored row can be. `api` is only ever written server-side, by the
 * public API and MCP tools — a phone that claimed it would be forging a
 * provenance the dedupe key depends on.
 */
export type StoredHealthProvider = HealthProvider | "api";

export const healthProviderValidator = v.union(
  v.literal("apple_health"),
  v.literal("health_connect"),
);

const PROVIDER_LABELS: Record<StoredHealthProvider, string> = {
  apple_health: "Apple Health",
  health_connect: "Health Connect",
  api: "API",
};

/**
 * Activity types that map cleanly onto a cardio exercise.
 *
 * The vocabulary is the slug set both native plugins emit
 * (`workoutActivityIdentifier` in AppleHealthPlugin.swift, `HealthActivityTypes`
 * on Android), so one list covers both platforms.
 *
 * The camelCase HealthKit enum names below are retained because rows imported
 * before the slug mapping existed still carry them; neither plugin emits them
 * today.
 */
const LINKABLE_ACTIVITY_TYPES = new Set([
  "running",
  "trail_running",
  "walking",
  "cycling",
  "swimming",
  "rowing",
  "hiking",
  "elliptical",
  // Slug forms of the four entries below. The camelCase names were never
  // actually emitted by the iOS plugin — `workoutActivityIdentifier` has always
  // returned slugs — so stairs, skiing and wheelchair sessions have silently
  // failed to be linkable until now.
  "stairs",
  "snow_sports",
  "wheelchair_run",
  "wheelchair_walk",
  // Retained for rows imported before this was noticed.
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

const SESSION_ID_PREFIX: Record<StoredHealthProvider, string> = {
  // Unchanged for Apple: existing workoutLogs rows already carry this prefix and
  // the id is the idempotency key for promotion.
  apple_health: "apple-health",
  health_connect: "health-connect",
  api: "api",
};

/** The session id a health workout always promotes onto, linked or not. */
export function healthSessionId(
  provider: StoredHealthProvider,
  externalId: string,
) {
  return `${SESSION_ID_PREFIX[provider]}:${externalId}`;
}

const healthWorkoutValidator = v.object({
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
  const enabled =
    existing?.healthSync?.healthSyncEnabled ??
    existing?.healthSync?.appleHealthEnabled ??
    true;
  const healthSync = {
    appleHealthEnabled: enabled,
    healthSyncEnabled: enabled,
    autoSyncOnForeground: existing?.healthSync?.autoSyncOnForeground ?? true,
    ...existing?.healthSync,
    ...patch,
  };
  // An explicit `lastSyncError: undefined` in the patch means "the sync
  // succeeded — clear the old failure". Convex patches cannot unset a field,
  // so the key is removed from the replacement object instead; the nested
  // patch replaces `healthSync` wholesale, so the key is gone from the
  // document. Without this, a stale "permission denied" row survives every
  // successful sync forever.
  for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
    if (patch[key] === undefined) {
      delete (healthSync as Record<string, unknown>)[key]
    }
  }
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
 * Idempotent upsert keyed on (provider, external id).
 *
 * Re-running the same pull is a no-op beyond metric revisions — both HealthKit
 * and Health Connect revise energy and heart rate after a workout has already
 * synced.
 */
export const importHealthWorkouts = mutation({
  args: {
    workouts: v.array(healthWorkoutValidator),
    provider: healthProviderValidator,
  },
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
          q
            .eq("userId", user._id)
            .eq("provider", args.provider)
            .eq("externalId", workout.uuid),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { ...fields, updatedAt: now });
        updated += 1;
      } else {
        await ctx.db.insert("healthWorkouts", {
          userId: user._id,
          provider: args.provider,
          externalId: workout.uuid,
          ...fields,
          importedAt: now,
          updatedAt: now,
        });
        imported += 1;
      }
    }

    await patchHealthSync(ctx, user._id, {
      lastSyncedAt: now,
      // A successful import is the strongest evidence the old error is
      // obsolete — clear it rather than nagging about a fixed problem.
      lastSyncError: undefined,
    });
    return { imported, updated, skipped };
  },
});

const enduranceSportValidator = v.union(
  v.literal("run"),
  v.literal("ride"),
  v.literal("swim"),
  v.literal("hike"),
  v.literal("walk"),
  v.literal("trail_run"),
  v.literal("row"),
);

const heartRateSampleValidator = v.object({
  elapsedSeconds: v.number(),
  bpm: v.number(),
});

/** Saves a foreground indoor or outdoor session recorded inside OneRep. */
export const recordEnduranceWorkout = mutation({
  args: {
    externalId: v.string(),
    sport: enduranceSportValidator,
    environment: v.optional(v.union(v.literal("outdoor"), v.literal("indoor"))),
    date: v.string(),
    startedAt: v.number(),
    endedAt: v.number(),
    durationSeconds: v.number(),
    totalDistanceMeters: v.number(),
    hasRoute: v.boolean(),
    routeName: v.optional(v.string()),
    avgHeartRateBpm: v.optional(v.number()),
    maxHeartRateBpm: v.optional(v.number()),
    activeEnergyKcal: v.optional(v.number()),
    routePoints: v.optional(v.array(trailPointValidator)),
    elevationGainMeters: v.optional(v.number()),
    heartRateSamples: v.optional(v.array(heartRateSampleValidator)),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
      throw new Error("Invalid workout date");
    }
    if (
      args.externalId.length < 1 ||
      args.externalId.length > 128 ||
      !Number.isFinite(args.startedAt) ||
      !Number.isFinite(args.endedAt) ||
      args.endedAt < args.startedAt ||
      !Number.isFinite(args.durationSeconds) ||
      args.durationSeconds < 0 ||
      !Number.isFinite(args.totalDistanceMeters) ||
      args.totalDistanceMeters < 0 ||
      (args.avgHeartRateBpm !== undefined &&
        (!Number.isFinite(args.avgHeartRateBpm) ||
          args.avgHeartRateBpm < 30 ||
          args.avgHeartRateBpm > 240)) ||
      (args.maxHeartRateBpm !== undefined &&
        (!Number.isFinite(args.maxHeartRateBpm) ||
          args.maxHeartRateBpm < 30 ||
          args.maxHeartRateBpm > 240)) ||
      (args.activeEnergyKcal !== undefined &&
        (!Number.isFinite(args.activeEnergyKcal) ||
          args.activeEnergyKcal < 0)) ||
      (args.heartRateSamples?.length ?? 0) > 900 ||
      args.heartRateSamples?.some(
        (sample) =>
          !Number.isFinite(sample.elapsedSeconds) ||
          sample.elapsedSeconds < 0 ||
          !Number.isFinite(sample.bpm) ||
          sample.bpm < 30 ||
          sample.bpm > 240,
      )
    ) {
      throw new Error("Invalid workout summary");
    }

    if (args.routePoints) validateTrailPoints(args.routePoints);
    if (
      args.elevationGainMeters !== undefined &&
      (!Number.isFinite(args.elevationGainMeters) ||
        args.elevationGainMeters < 0)
    )
      throw new Error("Invalid elevation gain");
    const activity = {
      hike: { type: "hiking", name: "Hike" },
      walk: { type: "walking", name: "Walk" },
      trail_run: { type: "trail_running", name: "Trail run" },
      row: { type: "rowing", name: "Row" },
      run: { type: "running", name: "Run" },
      ride: { type: "cycling", name: "Ride" },
      swim: { type: "swimming", name: "Swim" },
    }[args.sport];
    const now = Date.now();
    const fields = {
      activityType: activity.type,
      activityName: activity.name,
      date: args.date,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      durationSeconds: Math.round(args.durationSeconds),
      totalDistanceMeters: args.totalDistanceMeters,
      avgHeartRateBpm: args.avgHeartRateBpm,
      maxHeartRateBpm: args.maxHeartRateBpm,
      activeEnergyKcal: args.activeEnergyKcal,
      sourceName:
        args.environment === "indoor" ? "OneRep Indoor" : "OneRep GPS",
      hasRoute: args.hasRoute,
      routeName: args.routeName?.trim().slice(0, 120) || undefined,
      updatedAt: now,
    };
    const existing = await ctx.db
      .query("healthWorkouts")
      .withIndex("by_userId_and_externalId", (q) =>
        q
          .eq("userId", user._id)
          .eq("provider", "api")
          .eq("externalId", args.externalId),
      )
      .unique();

    let workoutId;
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      workoutId = existing._id;
    } else {
      workoutId = await ctx.db.insert("healthWorkouts", {
        userId: user._id,
        provider: "api",
        externalId: args.externalId,
        ...fields,
        importedAt: now,
      });
    }

    if (args.routePoints) {
      const existingRoute = await ctx.db
        .query("healthWorkoutRoutes")
        .withIndex("by_workoutId", (q) => q.eq("workoutId", workoutId))
        .unique();
      const route = {
        userId: user._id,
        workoutId,
        points: args.routePoints,
        elevationGainMeters: args.elevationGainMeters ?? 0,
      };
      if (existingRoute) await ctx.db.replace(existingRoute._id, route);
      else await ctx.db.insert("healthWorkoutRoutes", route);
    }
    if (args.heartRateSamples && args.heartRateSamples.length > 0) {
      const existingSeries = await ctx.db
        .query("healthWorkoutHeartRateSeries")
        .withIndex("by_workoutId", (q) => q.eq("workoutId", workoutId))
        .unique();
      const series = {
        userId: user._id,
        workoutId,
        samples: args.heartRateSamples,
        updatedAt: now,
      };
      if (existingSeries) {
        await ctx.db.replace(existingSeries._id, series);
      } else {
        await ctx.db.insert("healthWorkoutHeartRateSeries", series);
      }
    }

    return workoutId;
  },
});

export const getHeartRateSeries = query({
  args: { workoutId: v.id("healthWorkouts") },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    const workout = await ctx.db.get(args.workoutId);
    if (!workout || workout.userId !== user._id) return null;
    const series = await ctx.db
      .query("healthWorkoutHeartRateSeries")
      .withIndex("by_workoutId", (q) => q.eq("workoutId", args.workoutId))
      .unique();
    return series?.samples ?? [];
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

    const candidates = rows
      .filter((row) => row.dismissedAt === undefined)
      .slice(0, limit);

    return Promise.all(
      candidates.map(async (row) => ({
        _id: row._id,
        externalId: row.externalId,
        provider: row.provider,
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
        routeName: row.routeName,
        linked: row.linkedSessionId !== undefined,
        linkable: isLinkableActivity(row.activityType),
        // Recorded lifting with nothing to promote — the retro logger's cue.
        needsExercises:
          isStrengthActivity(row.activityType) &&
          row.linkedSessionId === undefined,
        // Nowhere left on that date, not even folded into a log that is
        // already there — so "Add" would fail and the client shows why
        // instead of offering a button that cannot work.
        dayFull:
          row.linkedSessionId === undefined &&
          isLinkableActivity(row.activityType)
            ? (await findCardioLinkTarget(
                ctx,
                user._id,
                row.date,
                healthSessionId(row.provider, row.externalId),
              )) === null
            : false,
      })),
    );
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
        healthSessionId(row.provider, row.externalId),
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
      provider: row.provider,
      sessionId: healthSessionId(row.provider, row.externalId),
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

/** The training-log exercise a recorded cardio session becomes. */
function cardioExercise(workout: Doc<"healthWorkouts">, sessionId: string) {
  return {
    id: sessionId,
    name: workout.activityName,
    category: "cardio",
    sets: [],
    cardio: {
      distanceMeters: workout.totalDistanceMeters,
      durationSeconds: workout.durationSeconds,
      avgHeartRateBpm: workout.avgHeartRateBpm,
      maxHeartRateBpm: workout.maxHeartRateBpm,
      ...(workout.hasRoute ? { route: { name: workout.routeName } } : {}),
      source: {
        provider: workout.provider,
        name: workout.sourceName ?? PROVIDER_LABELS[workout.provider],
        externalId: workout.externalId,
        importedAt: new Date(workout.importedAt).toISOString(),
      },
    },
  };
}

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

    const sessionId = healthSessionId(workout.provider, workout.externalId);

    // Already promoted (a previous attempt wrote the log but died before
    // marking this row linked): just finish the bookkeeping. Without this,
    // re-tapping Add would burn a second slot on the same session.
    const existing = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_and_date_and_sessionId", (q) =>
        q
          .eq("userId", user._id)
          .eq("date", workout.date)
          .eq("sessionId", sessionId),
      )
      .unique()
      .catch(() => undefined);
    if (existing) {
      await ctx.db.patch(args.id, {
        linkedSessionId: sessionId,
        linkedDate: workout.date,
        updatedAt: Date.now(),
      });
      return { sessionId, slot: existing.slot };
    }

    const exercise = cardioExercise(workout, sessionId);

    // A slot is mandatory: `logs.workouts.getLog` reads `.take(2)` per date, so
    // a slot-less third log would be silently invisible. When both are taken
    // the session folds into a log that is already there rather than failing.
    const target = await findCardioLinkTarget(
      ctx,
      user._id,
      workout.date,
      sessionId,
    );
    if (target === null) {
      throw new Error(
        "That day's sessions are already full. Remove one to add this.",
      );
    }

    if (target.kind === "fold") {
      const host = target.log;
      // Re-tapping Add on a folded session must not log the ride twice.
      const already = host.exercises.some(
        (entry) => (entry as { id?: string }).id === sessionId,
      );
      if (!already) {
        await ctx.db.patch(host._id, {
          exercises: [...host.exercises, exercise],
          durationSeconds: host.durationSeconds + workout.durationSeconds,
        });
      }
      await ctx.db.patch(args.id, {
        linkedSessionId: host.sessionId ?? sessionId,
        linkedDate: workout.date,
        updatedAt: Date.now(),
      });
      return { sessionId: host.sessionId ?? sessionId, slot: host.slot };
    }

    await upsertWorkoutLog(ctx, user._id, {
      date: workout.date,
      sessionId,
      slot: target.slot,
      durationSeconds: workout.durationSeconds,
      exercises: [exercise],
      // The hour the ride ended, not the hour somebody tapped Add. Without
      // this the log defaults to the write time, so a morning run adopted
      // that evening sat on the timeline after dinner.
      completedAt: workout.endedAt,
    });

    await ctx.db.patch(args.id, {
      linkedSessionId: sessionId,
      linkedDate: workout.date,
      updatedAt: Date.now(),
    });

    return { sessionId, slot: target.slot };
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

    if (log) {
      // A folded session shares its log with other rides. Removing this one
      // must leave the rest of the day standing.
      const sessionId = healthSessionId(workout.provider, workout.externalId);
      const remaining = log.exercises.filter(
        (entry) => (entry as { id?: string }).id !== sessionId,
      );
      if (remaining.length === 0 || remaining.length === log.exercises.length) {
        await ctx.db.delete(log._id);
      } else {
        await ctx.db.patch(log._id, {
          exercises: remaining,
          durationSeconds: Math.max(
            0,
            log.durationSeconds - workout.durationSeconds,
          ),
        });
      }
    }

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

export const getRoute = query({
  args: { workoutId: v.id("healthWorkouts") },
  handler: async (ctx, { workoutId }) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    const workout = await ctx.db.get(workoutId);
    if (workout?.userId !== user._id) return null;
    return await ctx.db
      .query("healthWorkoutRoutes")
      .withIndex("by_workoutId", (q) => q.eq("workoutId", workoutId))
      .unique();
  },
});
