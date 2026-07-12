import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import {
  ArrowLeft,
  CaretRight,
  MagnifyingGlass,
  Warning,
  X,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../../convex/_generated/api"
import { FoodDetailSheet } from "@/components/food-detail-sheet"
import { usePostHog } from "@posthog/react"
import {
  currentDateKey,
  detectTimeZone,
  DEFAULT_MEAL_CATEGORIES,
  defaultMeal,
  foodPortionLabel,
  logMicrosFromFoodDetail,
  stripUndefined,
  type FoodPortion,
  type LogMicros,
} from "@/lib/food-log"
import { searchFoodsAccurate } from "@/lib/openfoodfacts"
import { useSmoothNavigate } from "@/lib/navigation"
import type { FoodDetail } from "@repo/models"
import {
  readRecentFoodSearches,
  nextRecentFoodSearches,
  visiblePopularFoodSearches,
  writeRecentFoodSearches,
} from "@/lib/food-search-recents"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { hapticSelection } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { normalizeFoodSearchQuery } from "@/lib/food-search-url"
import { scaledFoodMacros } from "@/lib/food-search-nutrition"

type SearchState = "idle" | "loading" | "done" | "error"
type AddedState = { itemId: string }

type FoodSearchItem = Awaited<ReturnType<typeof searchFoodsAccurate>>[number]

function shouldOpenReviewAsPage() {
  return !(
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 768px)").matches
  )
}

const MEAL_CATEGORIES = DEFAULT_MEAL_CATEGORIES
const FOOD_SEARCH_DEBOUNCE_MS = 320
const FOOD_SEARCH_FETCH_LIMIT = 32
const FOOD_SEARCH_RESULT_LIMIT = 24

export default function SearchFoods() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const posthog = usePostHog()

  const inputRef = useRef<HTMLInputElement>(null)
  const latestSearchRequestRef = useRef(0)

  const [query, setQuery] = useState("")
  const [completedQuery, setCompletedQuery] = useState("")
  const [searchState, setSearchState] = useState<SearchState>("idle")
  const [retryNonce, setRetryNonce] = useState(0)
  const [added, setAdded] = useState<AddedState | null>(null)
  const [detailItem, setDetailItem] = useState<FoodSearchItem | null>(null)
  const [pendingItem, setPendingItem] = useState<FoodSearchItem | null>(null)
  const addingFoodRef = useRef<string | null>(null)
  const [addingFoodId, setAddingFoodId] = useState<string | null>(null)
  const [recentSearches, setRecentSearches] = useState(() =>
    readRecentFoodSearches()
  )

  const preferences = useQuery(api.users.users.getPreferences)
  const selectedDate = searchParams.get("date")
  const date =
    selectedDate ||
    currentDateKey(preferences?.lastActiveTimezone || detectTimeZone())
  const addFoodEntry = useOfflineMutation(
    api.logs.foodLogs.addEntry,
    "logs.foodLogs.addEntry"
  )

  const [searchResults, setSearchResults] = useState<FoodSearchItem[]>([])

  // The request id makes an already-started Convex action harmless when a
  // newer query supersedes it. Convex actions cannot be aborted from React,
  // but stale results must never replace the current search.
  useEffect(() => {
    const requestId = ++latestSearchRequestRef.current
    const q = normalizeFoodSearchQuery(query)
    if (q.length < 2) {
      setCompletedQuery("")
      setSearchState("idle")
      setSearchResults([])
      return
    }

    let cancelled = false
    setSearchState("loading")
    setSearchResults([])

    const timeout = setTimeout(() => {
      void searchFoodsAccurate(q, {
        limit: FOOD_SEARCH_RESULT_LIMIT,
        fetchLimit: FOOD_SEARCH_FETCH_LIMIT,
        language: preferences?.foodSearchLanguage ?? "en",
      })
        .then((results) => {
          if (cancelled || requestId !== latestSearchRequestRef.current) return
          setSearchResults(results)
          setCompletedQuery(q)
          setSearchState("done")
          setRecentSearches((current) => {
            const nextRecent = nextRecentFoodSearches(current, q)
            writeRecentFoodSearches(nextRecent)
            return nextRecent
          })
        })
        .catch(() => {
          if (cancelled || requestId !== latestSearchRequestRef.current) return
          setSearchResults([])
          setCompletedQuery(q)
          setSearchState("error")
        })
    }, FOOD_SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query, preferences?.foodSearchLanguage, retryNonce])

  const results = searchResults
  const popularSearches = useMemo(
    () => visiblePopularFoodSearches(recentSearches),
    [recentSearches]
  )

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [])

  async function handleAdd(
    item: FoodSearchItem,
    grams = 100,
    micros: LogMicros = {},
    meal = defaultMeal(),
    detail?: FoodDetail | null,
    portion?: FoodPortion
  ) {
    if (addingFoodRef.current) return
    addingFoodRef.current = item.id
    setAddingFoodId(item.id)
    try {
      const product = detail?.openFoodFacts ?? item.openFoodFacts
      const macros = scaledFoodMacros(item, grams, detail)
      const entry = stripUndefined({
        id: Math.random().toString(36).slice(2),
        name:
          grams === 100 && !portion
            ? item.name
            : `${item.name} (${portion ? foodPortionLabel(portion) : `${grams} g`})`,
        ...macros,
        loggedAt: new Date().toISOString(),
        meal,
        source: "openfoodfacts" as const,
        foodCode: item.code,
        quantityGrams: grams,
        servingGrams: detail?.servingGrams ?? undefined,
        servingLabel: detail?.servingLabel ?? item.serving,
        imageUrl: detail?.imageUrl ?? item.imageUrl,
        openFoodFacts: product,
        ...micros,
      })

      await addFoodEntry({ date, entry })

      posthog.capture("food_logged", {
        food_name: item.name,
        calories: macros.calories,
        grams,
        meal,
        source: "search",
      })

      setAdded({ itemId: item.id })
      hapticSelection()
      setTimeout(() => setAdded(null), 1800)
    } finally {
      addingFoodRef.current = null
      setAddingFoodId(null)
    }
  }

  const showEmpty =
    searchState === "done" && results.length === 0 && completedQuery !== ""
  const showResults = results.length > 0

  function openFoodReview(item: FoodSearchItem) {
    if (shouldOpenReviewAsPage()) {
      navigate(`/foods/review/${encodeURIComponent(item.id)}`, {
        state: { item },
      })
      return
    }

    setDetailItem(item)
  }

  function runSuggestedSearch(nextQuery: string) {
    hapticSelection()
    setQuery(normalizeFoodSearchQuery(nextQuery))
    setCompletedQuery("")
    setSearchResults([])
    setSearchState("loading")
    inputRef.current?.focus()
  }

  return (
    <>
      <div className="desktop-canvas flex min-h-svh flex-col bg-background">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col md:max-w-4xl">
          <div
            className="flex items-center gap-3 px-[var(--app-page-x)] pb-4"
            style={{
              paddingTop: "max(1.25rem, env(safe-area-inset-top, 1.25rem))",
            }}
          >
            <button
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="app-icon-button motion-tactile"
            >
              <ArrowLeft size={15} weight="bold" />
            </button>

            <div className="relative flex-1">
              {searchState === "loading" ? (
                <div className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border border-muted-foreground/20 border-t-muted-foreground/60" />
              ) : (
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                />
              )}
              <input
                type="text"
                name="food-search-query"
                placeholder="Search foods…"
                value={query}
                ref={inputRef}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={80}
                aria-label="Search foods"
                className="app-input h-11 w-full border-border bg-muted/45 pr-11 pl-8 text-[14px] placeholder:text-muted-foreground"
              />

              {query.length > 0 && (
                <button
                  onClick={() => {
                    setQuery("")
                    setCompletedQuery("")
                    setSearchResults([])
                    setSearchState("idle")
                  }}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors active:bg-muted"
                >
                  <X size={13} weight="bold" />
                </button>
              )}
            </div>
          </div>

          <div className="mx-[var(--app-page-x)] h-px bg-border/40" />

          <div
            className="flex-1 overflow-y-auto px-[var(--app-page-x)] pt-3 [&::-webkit-scrollbar]:hidden"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
            }}
          >
            {searchState === "idle" && (
              <div className="mt-7 grid gap-6">
                <div>
                  <h1 className="text-[20px] font-semibold">Find a food</h1>
                  <p className="mt-1 max-w-md text-[14px] leading-5 text-muted-foreground">
                    Search by food, brand, or the barcode number printed on the
                    package.
                  </p>
                </div>

                {recentSearches.length > 0 && (
                  <SearchSuggestionGroup
                    title="Recent"
                    suggestions={recentSearches}
                    onSelect={runSuggestedSearch}
                  />
                )}

                {popularSearches.length > 0 && (
                  <SearchSuggestionGroup
                    title="Popular"
                    suggestions={popularSearches}
                    onSelect={runSuggestedSearch}
                  />
                )}
              </div>
            )}

            {searchState === "error" && (
              <div className="mt-8 border-y border-border py-5 text-center">
                <Warning
                  size={22}
                  className="mx-auto text-destructive"
                  aria-hidden
                />
                <p className="mt-2 text-[15px] font-semibold">
                  Food search is unavailable
                </p>
                <p className="mx-auto mt-1 max-w-sm text-[14px] leading-5 text-muted-foreground">
                  Check your connection, then try the same search again.
                </p>
                <button
                  type="button"
                  onClick={() => setRetryNonce((value) => value + 1)}
                  className="native-toolbar-button mt-3 border border-border bg-card"
                >
                  Try again
                </button>
              </div>
            )}

            {showEmpty && (
              <div className="mt-8 border-y border-border py-5 text-center">
                <p className="text-[15px] font-semibold">
                  No foods found for “{completedQuery}”
                </p>
                <p className="mt-1 text-[14px] text-muted-foreground">
                  Check the spelling or try a shorter, more general name.
                </p>
              </div>
            )}

            {showResults && (
              <>
                <p className="native-supporting mt-1 mb-2">
                  {results.length} result{results.length !== 1 ? "s" : ""}
                </p>
                <div className="divide-y divide-border border-y border-border md:grid md:grid-cols-2 md:divide-y-0">
                  {results.map((item) => {
                    const isAdded = added?.itemId === item.id
                    const isAdding = addingFoodId === item.id
                    return (
                      <div
                        key={item.id}
                        className="flex min-h-[4.75rem] w-full items-center text-left md:border-b md:border-border md:odd:border-r"
                      >
                        <button
                          type="button"
                          onClick={() => openFoodReview(item)}
                          className="motion-list-row flex min-h-[4.75rem] min-w-0 flex-1 items-center gap-3 px-1 text-left active:bg-muted/30"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] leading-snug font-semibold">
                              {item.name}
                            </p>
                            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                              {[item.brand, item.serving]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
                              {Math.round(Number(item.calories))} kcal · Protein{" "}
                              {Math.round(Number(item.protein))} g · Carbs{" "}
                              {Math.round(Number(item.carbs))} g · Fat{" "}
                              {Math.round(Number(item.fat))} g
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!isAdded && addingFoodId === null)
                              setPendingItem(item)
                          }}
                          disabled={isAdded || addingFoodId !== null}
                          aria-busy={isAdding}
                          aria-label={
                            isAdded ? `${item.name} added` : `Add ${item.name}`
                          }
                          className={cn(
                            "motion-tactile mr-1 flex min-h-11 shrink-0 items-center justify-center px-3 text-[14px] font-semibold text-[var(--accent-food)] disabled:opacity-60",
                            isAdded && "motion-success-pop"
                          )}
                        >
                          {isAdded ? (
                            <span>Added</span>
                          ) : isAdding ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border border-muted-foreground/20 border-t-muted-foreground/60" />
                          ) : (
                            <span>Add</span>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {detailItem && (
        <FoodDetailSheet
          item={detailItem}
          added={added?.itemId === detailItem.id}
          onAdd={(item, grams, micros, meal, detail, portion) => {
            void handleAdd(
              detailItem,
              grams,
              micros,
              meal,
              detail ?? detailItem,
              portion
            ).catch(reportOfflineMutationError)
          }}
          onClose={() => setDetailItem(null)}
        />
      )}

      {pendingItem && (
        <MealSelectSheet
          item={pendingItem}
          onSelect={async (meal) => {
            try {
              await handleAdd(
                pendingItem,
                100,
                logMicrosFromFoodDetail(pendingItem, 100),
                meal,
                pendingItem
              )
              setPendingItem(null)
            } catch (error) {
              reportOfflineMutationError(error)
            }
          }}
          onClose={() => setPendingItem(null)}
        />
      )}
    </>
  )
}

function SearchSuggestionGroup({
  title,
  suggestions,
  onSelect,
}: {
  title: string
  suggestions: string[]
  onSelect: (query: string) => void
}) {
  return (
    <section>
      <h2 className="native-section-title mb-2">{title}</h2>
      <div className="divide-y divide-border border-y border-border">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSelect(suggestion)}
            className="motion-tactile flex min-h-12 w-full items-center gap-3 px-1 text-left text-[15px] font-medium active:bg-muted"
          >
            <MagnifyingGlass size={17} className="text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{suggestion}</span>
            <CaretRight size={17} className="text-muted-foreground" />
          </button>
        ))}
      </div>
    </section>
  )
}

function MealSelectSheet({
  item,
  onSelect,
  onClose,
}: {
  item: FoodSearchItem
  onSelect: (meal: string) => Promise<void>
  onClose: () => void
}) {
  const categories = MEAL_CATEGORIES
  const suggested = defaultMeal()
  const titleId = `meal-select-${item.id}`
  const [savingMeal, setSavingMeal] = useState<string | null>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/55" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[calc(100svh-1rem)] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-border bg-card px-5 pt-5 md:top-1/2 md:right-auto md:bottom-auto md:left-1/2 md:mx-0 md:w-[min(24rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
      >
        <p
          id={titleId}
          className="mb-0.5 text-[19px] leading-snug font-semibold tracking-[-0.01em]"
        >
          Add to…
        </p>
        <p className="mb-4 truncate text-[14px] text-muted-foreground">
          {item.name}
        </p>
        <div className="divide-y divide-border border-y border-border">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={async () => {
                if (savingMeal) return
                setSavingMeal(cat.id)
                try {
                  await onSelect(cat.id)
                } finally {
                  setSavingMeal(null)
                }
              }}
              disabled={Boolean(savingMeal)}
              aria-busy={savingMeal === cat.id}
              className="flex min-h-14 w-full items-center justify-between px-1 py-3 text-left transition-colors active:bg-muted"
            >
              <span className="text-[15px] font-semibold">{cat.label}</span>
              {cat.id === suggested && (
                <span className="text-[13px] font-medium text-muted-foreground">
                  Suggested
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
