import { tr, translateError } from "@repo/ui/i18n"
import { toast } from "@repo/ui"

const DEFAULT_MUTATION_ERROR_MESSAGE = tr("Could not save change")

/**
 * The shaped prefix Convex puts on a failed function call. In production the
 * reason behind it is redacted, so what is left —
 * `[CONVEX M(logs/foodLogs:addEntry)] [Request ID: …] Server Error` — is a
 * support reference, not something a person can act on. Those tokens are
 * dropped so the fallback sentence is shown instead of a stack-trace fragment.
 */
const BACKEND_ERROR_NOISE =
  /\[CONVEX [^\]]*\]|\[Request ID: [^\]]*\]|\bServer Error\b/gi

/**
 * A save failure, in words the reader can use.
 *
 * A message the thrower wrote is kept — "Nutrition entry not found" is worth
 * showing. Only the backend's own scaffolding is removed, and anything left
 * empty falls back to `fallback`.
 */
export function offlineMutationErrorMessage(
  error: unknown,
  fallback = DEFAULT_MUTATION_ERROR_MESSAGE
) {
  if (!(error instanceof Error)) return fallback
  const readable = error.message
    .replace(BACKEND_ERROR_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim()
  return readable || fallback
}

export function reportOfflineMutationError(
  error: unknown,
  fallback = DEFAULT_MUTATION_ERROR_MESSAGE
) {
  toast.error(translateError(offlineMutationErrorMessage(error, fallback)))
}
