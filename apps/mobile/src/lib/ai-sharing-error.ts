import { translateError } from "@repo/ui/i18n"

export function aiSharingErrorMessage(error: unknown, fallback: string): string {
  // ConvexError.data contains the public recovery instruction. Transport
  // errors can include diagnostics, so retain the fallback for those.
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    typeof error.data === "string" &&
    error.data.trim()
  ) {
    return translateError(error.data)
  }
  return fallback
}
