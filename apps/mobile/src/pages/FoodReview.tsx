import { useEffect, useRef, useState } from "react"
import { Warning } from "@phosphor-icons/react"
import { useLocation, useParams } from "react-router"
import { usePostHog } from "@posthog/react"
import { useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../../convex/_generated/api"
import { FoodDetailSheet } from "@/components/food-detail-sheet"
import { useSmoothNavigate } from "@/lib/navigation"
import { getFoodDetail } from "@/lib/openfoodfacts"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import {
  currentDateKey,
  foodLogEntryFromFoodResult,
  type FoodPortion,
  type LogMicros,
} from "@/lib/food-log"
import type { FoodDetail, FoodResult } from "@repo/models"

type FoodReviewLocationState = {
  item?: FoodResult
} | null

export default function FoodReview() {
  const navigate = useSmoothNavigate()
  const posthog = usePostHog()
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const stateItem = (location.state as FoodReviewLocationState)?.item
  const [item, setItem] = useState<FoodResult | null>(stateItem ?? null)
  const [loading, setLoading] = useState(!stateItem)
  const [failed, setFailed] = useState(false)
  const [added, setAdded] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const date = currentDateKey()
  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date })
  const setDay = useOfflineMutation(
    api.logs.foodLogs.setDay,
    "logs.foodLogs.setDay"
  )

  useEffect(() => {
    if (stateItem) {
      setItem(stateItem)
      setLoading(false)
      setFailed(false)
      return
    }

    if (!id) {
      setLoading(false)
      setFailed(true)
      return
    }

    let cancelled = false
    setLoading(true)
    setFailed(false)
    void getFoodDetail(id)
      .then((detail) => {
        if (cancelled) return
        setItem(detail)
        setFailed(!detail)
      })
      .catch(() => {
        if (cancelled) return
        setItem(null)
        setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, stateItem])

  async function handleAdd(
    food: FoodResult,
    grams = 100,
    micros: LogMicros = {},
    meal = "breakfast",
    detail?: FoodDetail | null,
    portion?: FoodPortion
  ) {
    if (savingRef.current || added) return
    savingRef.current = true
    setSaving(true)
    const entry = foodLogEntryFromFoodResult(food, {
      grams,
      micros,
      meal,
      detail,
      portion,
    })

    try {
      await setDay({ date, entries: [...(foodLogs ?? []), entry] })
      posthog.capture("food_logged", {
        food_name: food.name,
        calories: entry.calories,
        grams,
        meal,
        source: "search_review_page",
      })

      setAdded(true)
      window.setTimeout(() => navigate(-1), 650)
    } catch (error) {
      savingRef.current = false
      setSaving(false)
      reportOfflineMutationError(error)
    }
  }

  if (loading || failed || !item) {
    return (
      <main className="desktop-canvas min-h-svh bg-background px-4 text-foreground">
        <section className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center py-[var(--app-safe-bottom-lg)]">
          <div className="app-surface p-5 text-center">
            {loading ? (
              <>
                <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
                <p className="mt-4 text-[14px] font-bold">Loading food…</p>
              </>
            ) : (
              <>
                <Warning
                  size={24}
                  weight="bold"
                  className="mx-auto text-muted-foreground/60"
                />
                <p className="mt-4 text-[14px] font-bold">
                  Couldn’t load this food.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="app-button app-button-primary mt-4"
                >
                  Back to search
                </button>
              </>
            )}
          </div>
        </section>
      </main>
    )
  }

  return (
    <FoodDetailSheet
      item={item}
      added={added}
      saving={saving}
      presentation="page"
      onAdd={(food, grams, micros, meal, detail, portion) => {
        void handleAdd(food, grams, micros, meal, detail, portion)
      }}
      onClose={() => navigate(-1)}
    />
  )
}
