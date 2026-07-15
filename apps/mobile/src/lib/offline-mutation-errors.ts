import { toast } from "@repo/ui"

const DEFAULT_MUTATION_ERROR_MESSAGE = "Could not save change"

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
  toast.error(offlineMutationErrorMessage(error, fallback))
}
