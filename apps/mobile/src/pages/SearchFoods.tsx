import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Barcode,
  Camera,
  Fire,
  MagnifyingGlass,
  Warning,
  X,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { useSearchParams } from "react-router"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { isBrowserOnline } from "@/lib/offline-queue"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { foodCapturePath } from "@/lib/food-capture"
import { api } from "../../../../convex/_generated/api"
import { FoodDetailSheet } from "@/components/food-detail-sheet"
import { usePostHog } from "@posthog/react"
import {
  currentDateKey,
  DEFAULT_MEAL_CATEGORIES,
  defaultMeal,
  foodLogEntryFromFoodResult,
  logMicrosFromFoodDetail,
  type FoodPortion,
  type LogMicros,
} from "@/lib/food-log"
import { searchFoods } from "@/lib/openfoodfacts"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  foodSearchParamsForQuery,
  normalizeFoodSearchQuery,
  readFoodSearchQuery,
} from "@/lib/food-search-url"
import {
  POPULAR_FOOD_SEARCHES,
  clearRecentFoodSearches,
  nextRecentFoodSearches,
  readRecentFoodSearches,
  visiblePopularFoodSearches,
  writeRecentFoodSearches,
} from "@/lib/food-search-recents"
import { rankAndFilterFoodSearchResults } from "@/lib/food-search-ranking"
import type { FoodDetail } from "@repo/models"
import { APP_ACCENT_COLORS, MACRO_COLORS } from "@/lib/design-tokens"

type SearchState = "idle" | "loading" | "done" | "error"
type AddedState = { itemId: string }

type FoodSearchItem = Awaited<ReturnType<typeof searchFoods>>[number]

function shouldOpenReviewAsPage() {
  return !(
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 768px)").matches
  )
}

const MEAL_CATEGORIES = DEFAULT_MEAL_CATEGORIES
export default function SearchFoods() {
  const navigate = useSmoothNavigate()
  const posthog = usePostHog()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsString = searchParams.toString()
  const urlQuery = useMemo(
    () => readFoodSearchQuery(new URLSearchParams(searchParamsString)),
    [searchParamsString]
  )

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const urlSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addingFoodRef = useRef<string | null>(null)

  const [query, setQuery] = useState(() => urlQuery)
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [searchState, setSearchState] = useState<SearchState>("idle")
  const [added, setAdded] = useState<AddedState | null>(null)
  const [detailItem, setDetailItem] = useState<FoodSearchItem | null>(null)
  const [pendingItem, setPendingItem] = useState<FoodSearchItem | null>(null)
  const [addingFoodId, setAddingFoodId] = useState<string | null>(null)
  const [snapOffline, setSnapOffline] = useState(false)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [recentSearches, setRecentSearches] = useState(() =>
    readRecentFoodSearches()
  )

  const date = currentDateKey()
  const preferences = useQuery(api.users.users.getPreferences)
  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date })
  const setDay = useOfflineMutation(
    api.logs.foodLogs.setDay,
    "logs.foodLogs.setDay"
  )

  const [searchResults, setSearchResults] = useState<FoodSearchItem[]>([])

  useEffect(() => {
    setQuery((current) => (current === urlQuery ? current : urlQuery))
  }, [urlQuery])

  useEffect(() => {
    const normalizedQuery = normalizeFoodSearchQuery(query)
    if (normalizedQuery === urlQuery) return

    if (urlSyncRef.current) clearTimeout(urlSyncRef.current)
    urlSyncRef.current = setTimeout(() => {
      setSearchParams(
        foodSearchParamsForQuery(
          new URLSearchParams(searchParamsString),
          normalizedQuery
        ),
        { replace: true }
      )
    }, 180)

    return () => {
      if (urlSyncRef.current) clearTimeout(urlSyncRef.current)
    }
  }, [query, searchParamsString, setSearchParams, urlQuery])

  // Debounce: update debouncedQuery 380ms after the user stops typing
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setDebouncedQuery("")
      setSearchState("idle")
      setSearchResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSearchState("loading")
    debounceRef.current = setTimeout(async () => {
      setDebouncedQuery(q)
      try {
        const results = await searchFoods(
          q,
          50,
          preferences?.foodSearchLanguage ?? "en"
        )
        setSearchResults(results ?? [])
        setSearchState("done")
        setRecentSearches((current) => {
          const next = nextRecentFoodSearches(current, q)
          writeRecentFoodSearches(next)
          return next
        })
      } catch {
        setSearchResults([])
        setSearchState("error")
      }
    }, 380)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, preferences?.foodSearchLanguage, searchAttempt])

  const results = useMemo(
    () =>
      rankAndFilterFoodSearchResults(searchResults ?? [], debouncedQuery || query),
    [searchResults, debouncedQuery, query]
  )

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [])

  async function handleAdd(
    item: FoodSearchItem,
    grams = 100,
    micros: LogMicros = {},
    meal = "breakfast",
    detail?: FoodDetail | null,
    portion?: FoodPortion
  ) {
    if (addingFoodRef.current) return

    addingFoodRef.current = item.id
    setAddingFoodId(item.id)
    try {
      const entry = foodLogEntryFromFoodResult(item, {
        grams,
        micros,
        meal,
        detail,
        portion,
      })

      const existingEntries = foodLogs ?? []
      await setDay({ date, entries: [...existingEntries, entry] })

      posthog.capture("food_logged", {
        food_name: item.name,
        calories: entry.calories,
        grams,
        meal,
        source: "search",
      })

      setAdded({ itemId: item.id })
      setTimeout(() => setAdded(null), 1800)
    } finally {
      addingFoodRef.current = null
      setAddingFoodId(null)
    }
  }

  const showEmpty =
    searchState === "done" && results.length === 0 && debouncedQuery !== ""
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

  function handleScanBarcode() {
    setSnapOffline(false)
    navigate(foodCapturePath("barcode"))
  }

  function handleSnapMeal() {
    if (!isBrowserOnline()) {
      setSnapOffline(true)
      return
    }

    setSnapOffline(false)
    navigate(foodCapturePath("snap"))
  }

  const quickActions = (
    <FoodSearchQuickActions
      offline={snapOffline}
      onScan={handleScanBarcode}
      onSnap={handleSnapMeal}
    />
  )

  function chooseSearchSuggestion(suggestion: string) {
    setQuery(suggestion)
    inputRef.current?.focus()
  }

  function clearRecentSearches() {
    clearRecentFoodSearches()
    setRecentSearches([])
  }

  function retrySearch() {
    if (query.trim().length < 2) return
    setSearchAttempt((current) => current + 1)
  }

  const fallbackSuggestions = visiblePopularFoodSearches(
    recentSearches,
    POPULAR_FOOD_SEARCHES
  )

  return (
    <>
      <div className="desktop-canvas flex min-h-svh flex-col bg-background">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col md:max-w-4xl">
          <div
            className="flex items-center gap-3 px-4 pb-3"
            style={{
              paddingTop: "max(1.25rem, env(safe-area-inset-top, 1.25rem))",
            }}
          >
            <button
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="app-icon-button"
            >
              <ArrowLeft size={15} weight="bold" />
            </button>

            <div className="relative flex-1">
              {searchState === "loading" ? (
                <div className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border border-muted-foreground/20 border-t-muted-foreground/60" />
              ) : (
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground/50"
                />
              )}
              <input
                ref={inputRef}
                type="text"
                name="food-search-query"
                placeholder="Search foods…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search foods"
                className="app-input h-11 w-full border-border/60 bg-muted/45 pr-10 pl-8 text-[14px] placeholder:text-muted-foreground/40"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    setDebouncedQuery("")
                    setSearchState("idle")
                  }}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-0 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted-foreground/40 transition-opacity active:opacity-60"
                >
                  <X size={13} weight="bold" />
                </button>
              )}
            </div>
          </div>

          <div className="mx-4 h-px bg-border/40" />

          <div
            className="flex-1 overflow-y-auto px-4 pt-2 [&::-webkit-scrollbar]:hidden"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
            }}
          >
            {searchState === "idle" && (
              <div className="mt-8">
                <div className="app-empty justify-center text-center">
                  <MagnifyingGlass
                    size={18}
                    className="shrink-0 text-muted-foreground/35"
                  />
                  <p className="text-[12.5px] font-medium text-muted-foreground/70">
                    Type a food, brand, or barcode number.
                  </p>
                </div>
                {recentSearches.length > 0 && (
                  <SearchSuggestionChips
                    label="Recent"
                    suggestions={recentSearches}
                    onChoose={chooseSearchSuggestion}
                    onClear={clearRecentSearches}
                  />
                )}
                <SearchSuggestionChips
                  label="Popular"
                  suggestions={visiblePopularFoodSearches(
                    recentSearches,
                    POPULAR_FOOD_SEARCHES
                  )}
                  onChoose={chooseSearchSuggestion}
                />
                {quickActions}
              </div>
            )}

            {searchState === "error" && (
              <div className="mt-8">
                <div className="app-empty justify-center text-center">
                  <Warning
                    size={18}
                    className="shrink-0 text-destructive/70"
                  />
                  <p className="text-[12.5px] font-medium text-muted-foreground/70">
                    Food search failed. Check your connection and try again.
                  </p>
                  <button
                    type="button"
                    onClick={retrySearch}
                    className="mt-1 min-h-9 rounded-[10px] bg-foreground px-4 text-[12px] font-semibold text-background active:opacity-85"
                  >
                    Retry search
                  </button>
                </div>
                <SearchSuggestionChips
                  label="Try instead"
                  suggestions={fallbackSuggestions}
                  onChoose={chooseSearchSuggestion}
                />
                {quickActions}
              </div>
            )}

            {showEmpty && (
              <div className="mt-8">
                <div className="app-empty justify-center text-center">
                  <p className="text-[12.5px] font-medium text-muted-foreground/70">
                    No results for "{query}"
                  </p>
                </div>
                <SearchSuggestionChips
                  label="Try instead"
                  suggestions={fallbackSuggestions}
                  onChoose={chooseSearchSuggestion}
                />
                {quickActions}
              </div>
            )}

            {showResults && (
              <>
                <p className="app-eyebrow mt-1 mb-2 px-1 text-muted-foreground/55">
                  {results.length} result{results.length !== 1 ? "s" : ""}
                </p>
                <div className="app-ledger md:grid md:grid-cols-2 md:gap-0">
                  {results.map((item) => {
                    const isAdded = added?.itemId === item.id
                    const isAdding = addingFoodId === item.id
                    return (
                      <div
                        key={item.id}
                        className="app-ledger-row w-full text-left"
                      >
                        <button
                          type="button"
                          onClick={() => openFoodReview(item)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors active:bg-muted/30"
                        >
                          <CalorieBadge calories={Number(item.calories)} />

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] leading-snug font-medium">
                              {item.name}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              {item.brand && (
                                <span className="truncate text-[10.5px] text-muted-foreground/40">
                                  {item.brand}
                                </span>
                              )}
                              {item.brand && (
                                <span className="text-[10px] text-muted-foreground/25">
                                  ·
                                </span>
                              )}
                              <span className="shrink-0 text-[10.5px] text-muted-foreground/40">
                                {item.serving}
                              </span>
                            </div>
                            <div className="mt-1 flex gap-2.5">
                              <MacroPill
                                label="P"
                                value={Number(item.protein)}
                                color={MACRO_COLORS.protein}
                              />
                              <MacroPill
                                label="C"
                                value={Number(item.carbs)}
                                color={MACRO_COLORS.carbs}
                              />
                              <MacroPill
                                label="F"
                                value={Number(item.fat)}
                                color={MACRO_COLORS.fat}
                              />
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!isAdded && !addingFoodId) setPendingItem(item)
                          }}
                          disabled={isAdded || addingFoodId !== null}
                          aria-busy={isAdding}
                          aria-label={
                            isAdding
                              ? `Adding ${item.name}`
                              : isAdded
                                ? `${item.name} added`
                                : `Add ${item.name}`
                          }
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-border/50 bg-muted/55 transition-all active:scale-[0.985] disabled:opacity-60"
                        >
                          {isAdding ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border border-foreground/15 border-t-foreground/45" />
                          ) : isAdded ? (
                            <span className="text-[11px] text-foreground/60">
                              ✓
                            </span>
                          ) : (
                            <span className="text-[18px] leading-none font-light text-foreground/50">
                              +
                            </span>
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
          added={
            added?.itemId === detailItem.id || addingFoodId === detailItem.id
          }
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
            await handleAdd(
              pendingItem,
              100,
              logMicrosFromFoodDetail(pendingItem, 100),
              meal,
              pendingItem
            )
            setPendingItem(null)
          }}
          onClose={() => setPendingItem(null)}
        />
      )}
    </>
  )
}

function SearchSuggestionChips({
  label,
  suggestions,
  onChoose,
  onClear,
}: {
  label: string
  suggestions: string[]
  onChoose: (suggestion: string) => void
  onClear?: () => void
}) {
  if (suggestions.length === 0) return null

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <p className="app-eyebrow text-muted-foreground/45">{label}</p>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-7 px-1 text-[11px] font-semibold text-muted-foreground/45 active:text-foreground/70"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onChoose(suggestion)}
            className="min-h-9 rounded-[10px] border border-border/50 bg-muted/45 px-3 text-[12px] font-semibold text-foreground/75 transition-all active:scale-[0.985] active:bg-muted/70"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}

function FoodSearchQuickActions({
  offline,
  onScan,
  onSnap,
}: {
  offline: boolean
  onScan: () => void
  onSnap: () => void
}) {
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onScan}
          className="flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-border/55 bg-muted/45 px-3 text-[12.5px] font-semibold text-foreground/80 transition-all active:scale-[0.985] active:bg-muted/70"
        >
          <Barcode size={16} weight="bold" />
          Scan barcode
        </button>
        <button
          type="button"
          onClick={onSnap}
          className="flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-border/55 bg-muted/45 px-3 text-[12.5px] font-semibold text-foreground/80 transition-all active:scale-[0.985] active:bg-muted/70"
        >
          <Camera size={16} weight="bold" />
          Snap meal
        </button>
      </div>
      {offline && (
        <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-destructive/15 bg-destructive/8 px-3 py-2 text-left">
          <Warning size={13} weight="bold" className="shrink-0 text-destructive" />
          <p className="text-[11.5px] leading-4 font-medium text-destructive">
            Snap meal needs an internet connection. Search and barcode scan are
            still available.
          </p>
        </div>
      )}
    </>
  )
}

function CalorieBadge({ calories }: { calories: number }) {
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[9px] bg-muted/60 text-center">
      <div
        className="flex items-center gap-0.5"
        style={{ color: APP_ACCENT_COLORS.food }}
      >
        <Fire size={13} weight="fill" />
        <span className="text-[13px] leading-none font-semibold tabular-nums">
          {Math.round(calories)}
        </span>
      </div>
      <span className="mt-0.5 text-[8.5px] font-semibold tracking-[0.08em] text-muted-foreground/40 uppercase">
        kcal
      </span>
    </div>
  )
}

function MacroPill({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <span className="flex items-baseline gap-0.5">
      <span
        className="text-[9.5px] font-semibold"
        style={{ color, opacity: 0.7 }}
      >
        {label}
      </span>
      <span className="text-[10px] text-muted-foreground/50">{value}g</span>
    </span>
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

  async function selectMeal(meal: string) {
    if (savingMeal) return
    setSavingMeal(meal)
    try {
      await onSelect(meal)
    } catch (error) {
      reportOfflineMutationError(error)
      setSavingMeal(null)
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !savingMeal) onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, savingMeal])

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={savingMeal ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[calc(100svh-1rem)] w-full max-w-sm overflow-y-auto rounded-t-[24px] border border-border/40 bg-card px-4 pt-4 shadow-[0_-16px_50px_rgba(0,0,0,0.18)] md:top-1/2 md:right-auto md:bottom-auto md:left-1/2 md:mx-0 md:w-[min(24rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:shadow-2xl"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
      >
        <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-foreground/10" />
        <p
          id={titleId}
          className="mb-0.5 text-[15px] leading-snug font-semibold tracking-[-0.01em]"
        >
          Add to…
        </p>
        <p className="mb-4 truncate text-[11.5px] text-muted-foreground/45">
          {item.name}
        </p>
        <div className="flex flex-col gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => void selectMeal(cat.id)}
              disabled={Boolean(savingMeal)}
              aria-busy={savingMeal === cat.id}
              className="flex items-center justify-between rounded-2xl px-4 py-3 transition-all active:scale-[0.985]"
              style={{
                backgroundColor: cat.id === suggested ? cat.bg : "var(--muted)",
                outline:
                  cat.id === suggested ? `1.5px solid ${cat.color}` : "none",
                outlineOffset: "1px",
              }}
            >
              <span
                className="text-[13.5px] font-semibold"
                style={{
                  color: cat.id === suggested ? cat.color : "var(--foreground)",
                  opacity: cat.id === suggested ? 1 : 0.75,
                }}
              >
                {cat.label}
              </span>
              {savingMeal === cat.id ? (
                <span className="text-[10px] font-medium text-muted-foreground/50">
                  saving
                </span>
              ) : cat.id === suggested ? (
                <span
                  className="text-[10px] font-medium"
                  style={{ color: cat.color, opacity: 0.6 }}
                >
                  suggested
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
