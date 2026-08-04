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
