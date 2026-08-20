import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUser, safeGetAuthUser } from "./lib/auth";
import { listBodyMeasurements } from "./lib/bodyMeasurements";
import {
  APP_UPDATE_REQUIRED,
  attachUpload,
  deleteOwnedUpload,
  getUploadUrl,
  requireReadyUpload,
} from "./lib/uploads";

// ── list ──────────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    // Bounded read, then sorted ascending for the charts. 400 covers well over
    // a year of weekly check-ins; the previous unbounded `.collect()` grew
    // without limit.
    const docs = await listBodyMeasurements(ctx, user._id, 400);

    const sorted = docs.sort((a, b) => {
      const byDate = a.loggedAt.localeCompare(b.loggedAt);
      return byDate !== 0 ? byDate : a.createdAt - b.createdAt;
    });

    return await Promise.all(
      sorted.map(async ({ userId: _userId, photoStorageId, ...rest }) => ({
        ...rest,
        photoUrl: rest.photoUploadId
          ? await getUploadUrl(ctx, rest.photoUploadId, user._id)
          : photoStorageId
            ? await ctx.storage.getUrl(photoStorageId)
            : undefined,
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    throw new Error(APP_UPDATE_REQUIRED);
  },
});

/** Every numeric or text field a check-in carries, in one place. */
const MEASUREMENT_FIELDS = [
  "weightKg",
  "bodyFatPct",
  "waistCm",
  "hipsCm",
  "chestCm",
  "armsCm",
  "thighsCm",
  "calvesCm",
  "neckCm",
  "leanBodyMassKg",
  "boneMassKg",
  "basalMetabolicRateKcal",
  "notes",
] as const;

function definedMeasurementFields(args: Record<string, unknown>) {
  const fields: Record<string, unknown> = {};
  for (const key of MEASUREMENT_FIELDS) {
    if (args[key] !== undefined) fields[key] = args[key];
  }
  return fields;
}

function clearedMeasurementFields(clearFields: string[] | undefined) {
  const fields: Record<string, undefined> = {};
  for (const key of clearFields ?? []) {
    if ((MEASUREMENT_FIELDS as readonly string[]).includes(key)) {
      fields[key] = undefined;
    }
  }
  return fields;
}

// ── save ──────────────────────────────────────────────────────────────────────

export const save = mutation({
  args: {
    clientId: v.string(),
    loggedAt: v.string(),
    weightKg: v.optional(v.number()),
    bodyFatPct: v.optional(v.number()),
    waistCm: v.optional(v.number()),
    hipsCm: v.optional(v.number()),
    chestCm: v.optional(v.number()),
    armsCm: v.optional(v.number()),
    thighsCm: v.optional(v.number()),
    calvesCm: v.optional(v.number()),
    neckCm: v.optional(v.number()),
    notes: v.optional(v.string()),
    photoStorageId: v.optional(v.id("_storage")),
    photoDataUrl: v.optional(v.string()),
    photoUploadId: v.optional(v.id("fileUploads")),
    photoTakenAt: v.optional(v.number()),
    leanBodyMassKg: v.optional(v.number()),
    boneMassKg: v.optional(v.number()),
    basalMetabolicRateKcal: v.optional(v.number()),
    /**
     * Fields to blank, named explicitly. Omission used to mean "delete this",
     * which made every partial write a data-loss risk and forced callers to
     * echo back fields they had no interest in. Now omission means "leave it".
     */
    clearFields: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    if (args.photoStorageId !== undefined || args.photoDataUrl !== undefined) {
      throw new Error(APP_UPDATE_REQUIRED);
    }

    const existing = await ctx.db
      .query("bodyMeasurements")
      .withIndex("by_userId_clientId", (q) =>
        q.eq("userId", user._id).eq("clientId", args.clientId),
      )
      .unique();

    const now = Date.now();
    if (args.photoUploadId) {
      await requireReadyUpload(ctx, {
        uploadId: args.photoUploadId,
        userId: user._id,
        purpose: "body_progress_photo",
        ...(existing
          ? {
              attachment: {
                table: "bodyMeasurements" as const,
                documentId: String(existing._id),
              },
            }
          : {}),
      });
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        loggedAt: args.loggedAt,
        ...definedMeasurementFields(args),
        ...clearedMeasurementFields(args.clearFields),
        ...(args.photoUploadId !== undefined
          ? { photoUploadId: args.photoUploadId }
          : {}),
        ...(args.photoTakenAt !== undefined
          ? { photoTakenAt: args.photoTakenAt }
          : {}),
        // Editing a scale reading makes it a decision someone made, so later
        // syncs stop treating the row as theirs to overwrite.
        source: "manual",
        updatedAt: now,
      });
      if (args.photoUploadId) {
        await attachUpload(
          ctx,
          args.photoUploadId,
          user._id,
          "body_progress_photo",
          "bodyMeasurements",
          String(existing._id),
        );
      }
      if (
        args.photoUploadId !== undefined &&
        existing.photoUploadId &&
        existing.photoUploadId !== args.photoUploadId
      ) {
        await deleteOwnedUpload(ctx, existing.photoUploadId, user._id, {
          table: "bodyMeasurements",
          documentId: String(existing._id),
        });
      }
    } else {
      const measurementId = await ctx.db.insert("bodyMeasurements", {
        userId: user._id,
        clientId: args.clientId,
        loggedAt: args.loggedAt,
        // Marks the row as hand-entered so the health sync will not overwrite
        // it with a later scale reading for the same day.
        source: "manual",
        ...definedMeasurementFields(args),
        photoUploadId: args.photoUploadId,
        photoTakenAt: args.photoTakenAt,
        createdAt: now,
        updatedAt: now,
      });
      if (args.photoUploadId) {
        await attachUpload(
          ctx,
          args.photoUploadId,
          user._id,
          "body_progress_photo",
          "bodyMeasurements",
          String(measurementId),
        );
      }
    }
  },
});

// ── remove ────────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("bodyMeasurements")
      .withIndex("by_userId_clientId", (q) =>
        q.eq("userId", user._id).eq("clientId", args.clientId),
      )
      .unique();

    if (existing) {
      if (existing.photoUploadId) {
        await deleteOwnedUpload(ctx, existing.photoUploadId, user._id, {
          table: "bodyMeasurements",
          documentId: String(existing._id),
        });
      }
      await ctx.db.delete(existing._id);
    }
    return { ok: true };
  },
});
