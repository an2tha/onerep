import { ConvexError } from "convex/values"
import { tr } from "@repo/ui/i18n"

export function guideErrorMessage(reason: unknown) {
  if (reason instanceof ConvexError) {
    const data = reason.data
    if (
      data && typeof data === "object" && "code" in data && "message" in data &&
      ["GUIDE_DETAILS", "GUIDE_GENERATION"].includes(String(data.code)) &&
      typeof data.message === "string" && data.message.length <= 240
    ) return data.message
  }
  const message = reason instanceof Error ? reason.message : ""
  const expected = [
    tr("Enable AI access, then continue. Your answers are kept."),
    tr("Enable AI access, then try again. Your answers are kept."),
    tr("Connection lost. Your answers are kept. Try again."),
  ]
  return expected.includes(message)
    ? message
    : tr("Couldn’t build this workout. Your answers are saved. Try again.")
}
