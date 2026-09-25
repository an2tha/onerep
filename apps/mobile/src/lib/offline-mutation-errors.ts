import { tr, translateError } from "@repo/ui/i18n"
import { toast } from "@repo/ui"

const DEFAULT_MUTATION_ERROR_MESSAGE = tr("Could not save change")

export function offlineMutationErrorMessage(
  error: unknown,
  fallback = DEFAULT_MUTATION_ERROR_MESSAGE
) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback
}

export function reportOfflineMutationError(
  error: unknown,
  fallback = DEFAULT_MUTATION_ERROR_MESSAGE
) {
  toast.error(translateError(offlineMutationErrorMessage(error, fallback)))
}
