import { useEffect, useState } from "react"
import { Warning } from "@phosphor-icons/react"
import { useLocation, useParams } from "react-router"
import { usePostHog } from "@posthog/react"
import { useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../../convex/_generated/api"
import { FoodDetailSheet } from "@/components/food-detail-sheet"
import { useSmoothNavigate } from "@/lib/navigation"
import { getFoodDetail } from "@/lib/openfoodfacts"
import { scaledFoodMacros } from "@/lib/food-search-nutrition"
import {
  currentDateKey,
  defaultMeal,
  detectTimeZone,
  foodPortionLabel,
  stripUndefined,
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

  const preferences = useQuery(api.users.users.getPreferences, {})
  const date = currentDateKey(
    preferences?.lastActiveTimezone || detectTimeZone()
  )
  const addFoodEntry = useOfflineMutation(
    api.logs.foodLogs.addEntry,
    "logs.foodLogs.addEntry"
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
    meal = defaultMeal(),
    detail?: FoodDetail | null,
    portion?: FoodPortion
  ) {
    const macros = scaledFoodMacros(food, grams, detail)
    const product = detail?.openFoodFacts ?? food.openFoodFacts
    const entry = stripUndefined({
      id: Math.random().toString(36).slice(2),
      name:
        grams === 100 && !portion
          ? food.name
          : `${food.name} (${portion ? foodPortionLabel(portion) : `${grams} g`})`,
      ...macros,
      loggedAt: new Date().toISOString(),
      meal,
      source: "openfoodfacts" as const,
      foodCode: food.code,
      quantityGrams: grams,
      servingGrams: detail?.servingGrams ?? undefined,
      servingLabel: detail?.servingLabel ?? food.serving,
      imageUrl: detail?.imageUrl ?? food.imageUrl,
      openFoodFacts: product,
      ...micros,
    })

    await addFoodEntry({ date, entry })
    posthog.capture("food_logged", {
      food_name: food.name,
      calories: macros.calories,
      grams,
      meal,
      source: "search_review_page",
    })

    setAdded(true)
    window.setTimeout(() => navigate(-1), 650)
  }

  if (loading || failed || !item) {
    return (
      <main className="desktop-canvas min-h-svh bg-background px-[var(--app-page-x)] text-foreground">
        <section className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center py-[var(--app-safe-bottom-lg)]">
          <div className="border-y border-border py-6 text-center">
            {loading ? (
              <>
                <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
                <p className="mt-4 text-[15px] font-semibold">Loading food…</p>
              </>
            ) : (
              <>
                <Warning
                  size={24}
                  weight="bold"
                  className="mx-auto text-muted-foreground/60"
                />
                <p className="mt-4 text-[17px] font-semibold">
                  Couldn’t load this food.
                </p>
                <p className="mx-auto mt-1 max-w-xs text-[14px] leading-5 text-muted-foreground">
                  The item may be unavailable, or your connection may have
                  dropped.
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
      presentation="page"
      onAdd={(food, grams, micros, meal, detail, portion) => {
        void handleAdd(food, grams, micros, meal, detail, portion)
      }}
      onClose={() => navigate(-1)}
    />
  )
}
