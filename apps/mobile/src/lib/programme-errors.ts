import { tr, translateError } from "@repo/ui/i18n"

export function programmeErrorMessage(
  error: unknown,
  fallback?: string,
): string {
  const data =
    error && typeof error === "object" && "data" in error
      ? error.data
      : undefined
  let message =
    typeof data === "string"
      ? data
      : error instanceof Error
        ? error.message
        : ""
  for (let depth = 0; depth < 2 && message.startsWith('"'); depth++) {
    try {
      const parsed = JSON.parse(message)
      if (typeof parsed !== "string") break
      message = parsed
    } catch {
      break
    }
  }
  if (message.includes("nutrition profile requires an individual plan"))
    return tr(
      "Review your nutrition profile. Some settings require a supervised plan.",
    )
  // Transport diagnostics are developer information, never recovery copy.
  if (
    !message ||
    /\[CONVEX|\bUncaught\b|\n\s+at\s|Called by client/.test(message)
  )
    return (
      fallback ??
      tr(
        "Could not prepare your programme. Your answers are saved. Please try again.",
      )
    )
  return translateError(message)
}
