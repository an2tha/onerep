import { useEffect, useRef } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { useAppAuth } from "./auth-client"
import {
  mergeCustomMealCategories,
  readCustomCategories,
  writeCustomCategories,
} from "./food-log"
import { useOfflineMutation } from "./use-offline-mutation"

/**
 * Keeps the localStorage copy of custom meal categories in step with the
 * server copy in `userPreferences.customMealCategories`.
 *
 * Custom categories used to live only in localStorage, but per-meal calorie
 * targets are normalised server-side against the known category ids — a
 * category the server cannot see would have its share dropped on every write.
 * This mirrors the two copies: server categories land locally, and any
 * local-only leftovers are pushed up once.
 */
export function useMealCategorySync(): void {
  const { user } = useAppAuth()
  const preferences = useQuery(
    api.users.users.getPreferences,
    user ? {} : "skip"
  )
  const setCustomMealCategories = useOfflineMutation(
    api.users.users.setCustomMealCategories,
    "users.users.setCustomMealCategories"
  )
  // The push is a one-shot backfill. Without this guard the mutation would
  // re-fire on every preferences update until the server round-trip lands.
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!user || preferences === undefined) return

    const { merged, needsPush } = mergeCustomMealCategories(
      readCustomCategories(),
      preferences?.customMealCategories
    )

    writeCustomCategories(merged)

    if (!needsPush || pushedRef.current) return
    pushedRef.current = true
    void setCustomMealCategories({ categories: merged }).catch(() => {
      // A failed backfill is not worth surfacing: the local copy still works
      // and the offline queue owns the retry when connectivity returns.
      pushedRef.current = false
    })
  }, [preferences, setCustomMealCategories, user])
}
