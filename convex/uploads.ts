import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { getAuthUser } from "./lib/auth";
import { claimRateLimit } from "./lib/rateLimits";
import {
  READY_UPLOAD_TTL_MS,
  UPLOAD_INTENT_TTL_MS,
  deleteOwnedUpload,
} from "./lib/uploads";

const MiB = 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PURPOSE_RULES = {
  recipe_photo: { types: IMAGE_TYPES, maxBytes: 8 * MiB },
  body_progress_photo: { types: IMAGE_TYPES, maxBytes: 8 * MiB },
  form_coach_landmarks: {
    types: new Set(["application/json"]),
    maxBytes: 5 * MiB,
  },
  coach_image: { types: IMAGE_TYPES, maxBytes: 12 * MiB },
} as const;

const purposeValidator = v.union(
  v.literal("recipe_photo"),
  v.literal("body_progress_photo"),
  v.literal("form_coach_landmarks"),
  v.literal("coach_image"),
);

function normalizedMimeType(value: string) {
  return value.trim().toLowerCase().split(";", 1)[0];
}

export const createIntent = mutation({
  args: {
    purpose: purposeValidator,
    fileName: v.optional(v.string()),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const mimeType = normalizedMimeType(args.mimeType);
    const rule = PURPOSE_RULES[args.purpose];
    if (!rule.types.has(mimeType as never)) throw new Error("Unsupported file type");
    if (!Number.isSafeInteger(args.size) || args.size <= 0 || args.size > rule.maxBytes) {
      throw new Error("Invalid file size");
    }

    await claimRateLimit(ctx, user._id, "upload_intent", 30, 60 * 60 * 1000);
    const pending = await ctx.db
      .query("fileUploads")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending"),
      )
      .take(21);
    const ready = await ctx.db
      .query("fileUploads")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", user._id).eq("status", "ready"),
      )
      .take(21);
    if (pending.length + ready.length >= 20) {
      throw new Error("UPLOAD_QUOTA_EXCEEDED");
    }

    const now = Date.now();
    const expiresAt = now + UPLOAD_INTENT_TTL_MS;
    const uploadId = await ctx.db.insert("fileUploads", {
      userId: user._id,
      purpose: args.purpose,
      status: "pending",
      expectedMimeType: mimeType,
      expectedSize: args.size,
      ...(args.fileName
        ? { fileName: args.fileName.trim().slice(0, 120) }
        : {}),
      createdAt: now,
      expiresAt,
    });
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { uploadId, uploadUrl, expiresAt };
  },
});

export const finalize = mutation({
  args: { uploadId: v.id("fileUploads"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.userId !== user._id) {
      throw new Error("Upload not found or access denied");
    }
    if (upload.status !== "pending" || upload.expiresAt <= Date.now()) {
      throw new Error("Upload intent has expired");
    }
    const existingOwner = await ctx.db
      .query("fileUploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (existingOwner) throw new Error("Uploaded file is already registered");

    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) throw new Error("Uploaded file not found");
    const actualMimeType = normalizedMimeType(metadata.contentType ?? "");
    if (
      metadata._creationTime < upload.createdAt ||
      metadata._creationTime > Date.now() ||
      metadata.size !== upload.expectedSize ||
      actualMimeType !== upload.expectedMimeType
    ) {
      // Never delete a client-supplied storage ID here. It may belong to a
      // different user and has not yet crossed the ownership boundary.
      throw new Error("Uploaded file does not match its intent");
    }
    const rule = PURPOSE_RULES[upload.purpose];
    if (!rule.types.has(actualMimeType as never) || metadata.size > rule.maxBytes) {
      throw new Error("Uploaded file violates purpose limits");
    }

    await ctx.db.patch(upload._id, {
      storageId: args.storageId,
      status: "ready",
      actualMimeType,
      actualSize: metadata.size,
      expiresAt: Date.now() + READY_UPLOAD_TTL_MS,
    });
    return { uploadId: upload._id };
  },
});

export const discard = mutation({
  args: { uploadId: v.id("fileUploads") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.userId !== user._id) {
      throw new Error("Upload not found or access denied");
    }
    if (upload.status === "attached") throw new Error("Attached uploads cannot be discarded");
    await deleteOwnedUpload(ctx, upload._id, user._id);
    return { ok: true };
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const candidates = await ctx.db
      .query("fileUploads")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(50);
    let deleted = 0;
    for (const upload of candidates) {
      if (upload.status === "attached") continue;
      if (upload.storageId) await ctx.storage.delete(upload.storageId);
      await ctx.db.delete(upload._id);
      deleted += 1;
    }
    return { deleted };
  },
});

export const cleanupRateLimitBuckets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(100);
    for (const bucket of expired) await ctx.db.delete(bucket._id);
    return { deleted: expired.length };
  },
});
