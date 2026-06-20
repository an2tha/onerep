import { useCallback } from "react"
import { useMutation } from "convex/react"
import type { OfflineMutationName } from "./offline-queue"
import {
  enqueueOfflineMutation,
  flushOfflineQueue,
  isOfflineLikeError,
} from "./offline-queue"

export function useOfflineMutation(functionReference: any, name: OfflineMutationName) {
  const mutate = useMutation(functionReference)

  return useCallback(
    async (args: any) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return enqueueOfflineMutation(name, args)
      }

      try {
        const result = await mutate(args)
        void flushOfflineQueue()
        return result
      } catch (error) {
        if (isOfflineLikeError(error)) {
          return enqueueOfflineMutation(name, args)
        }
        throw error
      }
    },
    [mutate, name],
  )
}
