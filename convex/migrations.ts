import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { recomputeRollupFor } from "./billing/store";

export const migrations = new Migrations<DataModel>(components.migrations);

async function isRegisteredUpload(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  const owned = await ctx.db
    .query("fileUploads")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (owned) return true;
  const legacyCoach = await ctx.db
    .query("coachUploads")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  return legacyCoach !== null;
}

async function deleteIfUnregistered(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  if (await isRegisteredUpload(ctx, storageId)) return;
  const blob = await ctx.db.system.get("_storage", storageId);
  if (blob) await ctx.storage.delete(storageId);
}

export const deleteLegacyRecipePhotos = migrations.define({
  table: "recipes",
  batchSize: 10,
  migrateOne: async (ctx, recipe) => {
    for (const storageId of recipe.photoStorageIds ?? []) {
      await deleteIfUnregistered(ctx, storageId);
    }
    if (recipe.photoStorageIds !== undefined) {
      await ctx.db.patch(recipe._id, { photoStorageIds: undefined });
    }
  },
});

export const deleteLegacyBodyPhotos = migrations.define({
  table: "bodyMeasurements",
  batchSize: 10,
  migrateOne: async (ctx, measurement) => {
    if (measurement.photoStorageId) {
      await deleteIfUnregistered(ctx, measurement.photoStorageId);
      await ctx.db.patch(measurement._id, {
        photoStorageId: undefined,
        photoDataUrl: undefined,
      });
    } else if (measurement.photoDataUrl !== undefined) {
      await ctx.db.patch(measurement._id, { photoDataUrl: undefined });
    }
  },
});

export const deleteLegacyFormCaptures = migrations.define({
  table: "formCoachSessions",
  batchSize: 10,
  migrateOne: async (ctx, session) => {
    if (!session.landmarksStorageId) return;
    await deleteIfUnregistered(ctx, session.landmarksStorageId);
    await ctx.db.patch(session._id, { landmarksStorageId: undefined });
  },
});

export const runLegacyMediaDeletion = migrations.runner([
  internal.migrations.deleteLegacyRecipePhotos,
  internal.migrations.deleteLegacyBodyPhotos,
  internal.migrations.deleteLegacyFormCaptures,
]);

/**
 * Delete the App Store and Play rows left behind by in-app purchases.
 *
 * `subscriptionGrantsAccess` already ignores non-Stripe rows, so access is cut
 * off the moment that ships; this migration is the cleanup that makes it
 * possible to narrow `billingPlatform` to `stripe` and drop `billingIdentities`
 * from the schema afterwards.
 *
 * The rollup is recomputed per affected user rather than left to the nightly
 * `reconcileRollups` cron, so `subscriptionStates` stops advertising an
 * `app_store`/`play_store` origin as soon as the row backing it is gone.
 */
export const deleteStoreSubscriptions = migrations.define({
  table: "billingSubscriptions",
  batchSize: 50,
  migrateOne: async (ctx, subscription) => {
    if (subscription.platform === "stripe") return;
    const { userId } = subscription;
    await ctx.db.delete(subscription._id);
    await recomputeRollupFor(ctx, userId);
  },
});

/** The `appAccountToken` mappings only ever served StoreKit and Play. */
export const deleteStoreIdentities = migrations.define({
  table: "billingIdentities",
  batchSize: 50,
  migrateOne: async (ctx, identity) => {
    await ctx.db.delete(identity._id);
  },
});

export const runStorePurchasePurge = migrations.runner([
  internal.migrations.deleteStoreSubscriptions,
  internal.migrations.deleteStoreIdentities,
]);

/**
 * Backfill `healthSync.healthSyncEnabled` from the legacy `appleHealthEnabled`.
 *
 * The field was named for the only platform that had a health store at the
 * time; Health Connect made that name wrong rather than merely ugly. This is
 * the backfill step of widen → dual-write → backfill → narrow: writers already
 * set both fields, readers already prefer the new one, and once this has run
 * everywhere `appleHealthEnabled` can be dropped from the schema and the `??`
 * fallbacks removed from Settings.tsx and health-sync.tsx.
 *
 * Idempotent: rows that already carry the new field are skipped.
 */
export const backfillHealthSyncEnabled = migrations.define({
  table: "userPreferences",
  batchSize: 100,
  migrateOne: async (ctx, preferences) => {
    const healthSync = preferences.healthSync;
    if (!healthSync) return;
    if (healthSync.healthSyncEnabled !== undefined) return;
    await ctx.db.patch(preferences._id, {
      healthSync: {
        ...healthSync,
        healthSyncEnabled: healthSync.appleHealthEnabled,
      },
    });
  },
});

export const runHealthSyncRename = migrations.runner([
  internal.migrations.backfillHealthSyncEnabled,
]);

/**
 * `loggedAt` on a check-in is the day key, `YYYY-MM-DD`. Progress.tsx used to
 * write a full UTC ISO timestamp into it, so rows written either side of
 * midnight UTC disagreed with every reader — all of which slice to ten
 * characters and compare against the user's *local* day.
 *
 * The slice is deliberately all this does. Readers already truncate, so
 * shortening the stored value moves nothing on screen; it only makes the value
 * match the format the MCP and import paths look up by, so a weigh-in logged
 * through Gemini and one logged in the app finally land on the same row.
 *
 * Re-dating rows into the user's timezone would correct the historical
 * off-by-one, but it would also move readings using a timezone we only know
 * today, on evidence we do not have for the day in question. Wrong-but-stable
 * beats silently rewritten history in a body-weight log.
 *
 * Idempotent: rows already ten characters long are skipped.
 */
export const normalizeBodyMeasurementLoggedAt = migrations.define({
  table: "bodyMeasurements",
  batchSize: 100,
  migrateOne: async (ctx, measurement) => {
    const loggedAt = measurement.loggedAt;
    if (loggedAt.length <= 10) return;
    await ctx.db.patch(measurement._id, { loggedAt: loggedAt.slice(0, 10) });
  },
});

export const runBodyMeasurementDateKey = migrations.runner([
  internal.migrations.normalizeBodyMeasurementLoggedAt,
]);
