import type { Id } from "../../../../convex/_generated/dataModel"
import { api } from "../../../../convex/_generated/api"
import { convexClient } from "./convex"

export type UploadPurpose =
  | "recipe_photo"
  | "body_progress_photo"
  | "form_coach_landmarks"
  | "coach_image"

export async function uploadOwnedFile(
  file: Blob,
  purpose: UploadPurpose,
  fileName?: string
): Promise<Id<"fileUploads">> {
  const mimeType = file.type.split(";", 1)[0].trim().toLowerCase()
  const intent = await convexClient.mutation(api.uploads.createIntent, {
    purpose,
    fileName,
    mimeType,
    size: file.size,
  })
  const response = await fetch(intent.uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: file,
  })
  if (!response.ok) throw new Error("File upload failed")
  const payload = (await response.json()) as { storageId?: string }
  if (!payload.storageId) throw new Error("Upload response was incomplete")
  const finalized = await convexClient.mutation(api.uploads.finalize, {
    uploadId: intent.uploadId,
    storageId: payload.storageId as Id<"_storage">,
  })
  return finalized.uploadId
}

