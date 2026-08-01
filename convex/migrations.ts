import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

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
