import type { FunctionReference } from "convex/server"
import { convexClient } from "@/lib/convex"
import { currentDateKey } from "@/lib/food-log"
import {
  enqueueOfflineMutation,
  flushOfflineQueue,
  isBrowserOnline,
  isOfflineLikeError,
  type OfflineMutationName,
} from "@/lib/offline-queue"
import {
  getFoodByBarcode,
  getFoodDetail,
  searchFoodsAccurate,
} from "@/lib/openfoodfacts"
import { createClientId, logDevWarn } from "@/lib/utils"
import type { QuickActionDeps } from "./deps"

/**
 * The only file in this directory that knows the app exists.
 *
 * Everything else takes `QuickActionDeps` and is therefore testable without a
 * Convex server, a network or a render. This is where that ends: real client,
 * real queue, real catalogue.
 */
export function quickActionDeps(options: {
  navigate: (path: string) => void
  language?: () => string | undefined
}): QuickActionDeps {
  return {
    async query(reference, args) {
      // The generated `OptionalRestArgs` is per-function, and this signature is
      // deliberately one function for all of them — the tools hold their own
      // argument types and the deps object exists to be swapped for a stub.
      return await convexClient.query(reference, args as never)
    },

    /**
     * The same rule `useOfflineMutation` follows, minus the hook.
     *
     * Offline-first only where the registry knows the mutation. Everything else
     * throws, which is right: a tool that cannot write should say so in the
     * loop rather than quietly pretend, and the model will report the failure
     * back to the user in the same breath.
     */
    async mutate(
      reference: FunctionReference<"mutation">,
      args: Record<string, unknown>,
      offlineAs?: OfflineMutationName
    ) {
      if (offlineAs && !isBrowserOnline()) {
        return enqueueOfflineMutation(offlineAs, args)
      }
      try {
        const result = await convexClient.mutation(reference, args)
        if (offlineAs) {
          void flushOfflineQueue().catch((error) => {
            logDevWarn(
              "Failed to flush offline queue after a quick action",
              error
            )
          })
        }
        return result
      } catch (error) {
        if (offlineAs && isOfflineLikeError(error)) {
          return enqueueOfflineMutation(offlineAs, args)
        }
        throw error
      }
    },

    today: () => currentDateKey(),
    now: () => new Date().toISOString(),
    id: () => createClientId(),

    searchFoods: (query, limit) =>
      searchFoodsAccurate(query, { limit, language: options.language?.() }),
    foodByCode: (code) => getFoodDetail(code),
    foodByBarcode: (code) => getFoodByBarcode(code),

    navigate: options.navigate,
  }
}
