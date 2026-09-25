import { tr } from "@repo/ui/i18n"
/** ConvexError.data is the intended public message; Error.message includes transport diagnostics. */
export function coachErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    typeof error.data === "string" &&
    error.data.trim()
  )
    return error.data
  if (error instanceof Error && !error.message.includes("[CONVEX "))
    return error.message
  return tr("Coach couldn’t answer right now. Please try again in a moment.")
}
