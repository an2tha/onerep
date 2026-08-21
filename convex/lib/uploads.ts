import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const APP_UPDATE_REQUIRED = "APP_UPDATE_REQUIRED";
export const UPLOAD_INTENT_TTL_MS = 15 * 60 * 1000;
export const READY_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export type UploadPurpose = Doc<"fileUploads">["purpose"];
export type UploadAttachmentTable = NonNullable<
  Doc<"fileUploads">["attachedTable"]
>;

type UploadReadableCtx = Pick<QueryCtx, "db" | "storage">;

export async function requireReadyUpload(
  ctx: Pick<MutationCtx, "db">,
  args: {
    uploadId: Id<"fileUploads">;
    userId: string;
    purpose: UploadPurpose;
    attachment?: {
      table: UploadAttachmentTable;
      documentId: string;
    };
  },
) {
  const upload = await ctx.db.get(args.uploadId);
  if (!upload || upload.userId !== args.userId) {
    throw new Error("Upload not found or access denied");
  }
  if (upload.purpose !== args.purpose)
    throw new Error("Invalid upload purpose");
  if (!upload.storageId) throw new Error("Upload is incomplete");

  if (upload.status === "attached" && args.attachment) {
    const isSameAttachment =
      upload.attachedTable === args.attachment.table &&
      upload.attachedDocumentId === args.attachment.documentId;
    if (isSameAttachment) return upload;
  }
  if (upload.status !== "ready" || upload.expiresAt <= Date.now()) {
    throw new Error("Upload is not ready");
  }
  return upload;
}

export async function attachUpload(
  ctx: MutationCtx,
  uploadId: Id<"fileUploads">,
  userId: string,
  purpose: UploadPurpose,
  table: UploadAttachmentTable,
  documentId: string,
) {
  await requireReadyUpload(ctx, {
    uploadId,
    userId,
    purpose,
    attachment: { table, documentId },
  });
  const upload = await ctx.db.get(uploadId);
  if (upload?.status === "attached") return;
  await ctx.db.patch(uploadId, {
    status: "attached",
    attachedTable: table,
    attachedDocumentId: documentId,
    attachedAt: Date.now(),
  });
}

/** Delete only a blob reached through an ownership row controlled by userId. */
export async function deleteOwnedUpload(
  ctx: MutationCtx,
  uploadId: Id<"fileUploads">,
  userId: string,
  expectedAttachment?: { table: UploadAttachmentTable; documentId: string },
) {
  const upload = await ctx.db.get(uploadId);
  if (!upload || upload.userId !== userId) return false;
  if (
    expectedAttachment &&
    (upload.attachedTable !== expectedAttachment.table ||
      upload.attachedDocumentId !== expectedAttachment.documentId)
  ) {
    throw new Error("Upload attachment does not match");
  }
  if (upload.storageId) await ctx.storage.delete(upload.storageId);
  await ctx.db.delete(upload._id);
  return true;
}

export async function getUploadUrl(
  ctx: UploadReadableCtx,
  uploadId: Id<"fileUploads">,
  userId?: string,
) {
  const upload = await ctx.db.get(uploadId);
  if (!upload || !upload.storageId) return null;
  if (userId !== undefined && upload.userId !== userId) return null;
  return await ctx.storage.getUrl(upload.storageId);
}
