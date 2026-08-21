import type { Id } from "../../../../convex/_generated/dataModel"
import { api } from "../../../../convex/_generated/api"
import { convexClient } from "./convex"

export type UploadPurpose =
  | "recipe_photo"
  | "body_progress_photo"
  | "form_coach_landmarks"
  | "coach_image"
  | "data_import"

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
  // CapacitorHttp proxies every non-GET fetch through native, and its bridge
  // only knows how to serialize File (not plain Blob) bodies — a Blob crosses
  // as an empty object and the request dies with CapacitorUrlRequestError 0.
  // File extends Blob, so wrapping is free on web too.
  const body =
    file instanceof File
      ? file
      : new File([file], fileName ?? "upload", { type: file.type })
  const response = await fetch(intent.uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body,
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
