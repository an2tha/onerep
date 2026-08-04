import { useCallback } from "react"
import { useMutation } from "convex/react"
import type { FunctionArgs, FunctionReference } from "convex/server"
import type { OfflineMutationName } from "./offline-queue"
import {
  enqueueOfflineMutation,
  flushOfflineQueue,
  isBrowserOnline,
  isOfflineLikeError,
} from "./offline-queue"
import { logDevWarn } from "./utils"

export function useOfflineMutation<
  Mutation extends FunctionReference<"mutation">,
>(functionReference: Mutation, name: OfflineMutationName) {
  const mutate = useMutation(functionReference)

  return useCallback(
    async (args: FunctionArgs<Mutation>) => {
      if (!isBrowserOnline()) {
        return enqueueOfflineMutation(name, args)
      }

      try {
        const result = await mutate(args)
        void flushOfflineQueue().catch((error) => {
          logDevWarn("Failed to flush offline queue after mutation", error)
        })
        return result
      } catch (error) {
        if (isOfflineLikeError(error)) {
          return enqueueOfflineMutation(name, args)
        }
        throw error
      }
    },
    [mutate, name]
  )
}
