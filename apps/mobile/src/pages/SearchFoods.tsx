import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Fire,
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
import { searchFoods } from "@/lib/openfoodfacts"
import { useSmoothNavigate } from "@/lib/navigation"
import type { FoodDetail } from "@repo/models"
import { APP_ACCENT_COLORS, MACRO_COLORS } from "@/lib/design-tokens"
import {
  readRecentFoodSearches,
  nextRecentFoodSearches,
  visiblePopularFoodSearches,
  writeRecentFoodSearches,
} from "@/lib/food-search-recents"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"

type SearchState = "idle" | "loading" | "done" | "error"
type AddedState = { itemId: string }

type FoodSearchItem = Awaited<ReturnType<typeof searchFoods>>[number]

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function singularizeToken(token: string): string {
  if (token.length <= 3) return token
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`
  if (/(?:ches|shes|sses|xes|zes|oes)$/.test(token)) return token.slice(0, -2)
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1)
  return token
}

function normalizedTokens(value: string): string[] {
  return normalizeSearchText(value)
    .split(" ")
    .filter(Boolean)
    .map(singularizeToken)
}

function resultReferenceKey(item: FoodSearchItem): string {
  return normalizedTokens(item.name).join(" ")
}

function isUnknownBrand(brand?: string): boolean {
  const normalized = normalizeSearchText(brand ?? "")
  return normalized === "" || normalized === "unknown"
}

function relevanceScore(item: FoodSearchItem, query: string, index: number) {
  const queryTokens = normalizedTokens(query)
  if (queryTokens.length === 0) return -index

  const nameTokens = normalizedTokens(item.name)
  const brandTokens = normalizedTokens(item.brand ?? "")
  const queryKey = queryTokens.join(" ")
  const nameKey = nameTokens.join(" ")

  let score = 0
  if (nameKey === queryKey) score += 1000
  if (nameKey.startsWith(queryKey)) score += 650
  if (nameKey.includes(queryKey)) score += 350

  let nameMatches = 0
  let anyMatches = 0
  for (const token of queryTokens) {
    if (nameTokens.includes(token)) {
      score += 140
      nameMatches += 1
      anyMatches += 1
    } else if (nameTokens.some((nameToken) => nameToken.startsWith(token))) {
      score += 90
      nameMatches += 1
      anyMatches += 1
    } else if (brandTokens.includes(token)) {
      score += 35
      anyMatches += 1
    }
  }

  if (nameMatches === queryTokens.length) score += 280
  else if (anyMatches === queryTokens.length) score += 90
  if (!isUnknownBrand(item.brand)) score += 35

  score -= Math.min(nameTokens.length, 12) * 2
  return score - index * 0.001
}

function shouldOpenReviewAsPage() {
  return !(
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 768px)").matches
  )
}

function rankAndFilterResults(
  items: FoodSearchItem[],
  query: string
): FoodSearchItem[] {
  const knownReferenceKeys = new Set(
    items
      .filter((item) => !isUnknownBrand(item.brand))
      .map(resultReferenceKey)
      .filter(Boolean)
  )

  return items
    .filter((item) => {
      if (!isUnknownBrand(item.brand)) return true
      const key = resultReferenceKey(item)
      return !key || !knownReferenceKeys.has(key)
    })
    .map((item, index) => ({
      item,
      score: relevanceScore(item, query, index),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item)
}

const MEAL_CATEGORIES = DEFAULT_MEAL_CATEGORIES

export default function SearchFoods() {
  const navigate = useSmoothNavigate()
  const posthog = usePostHog()

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [searchState, setSearchState] = useState<SearchState>("idle")
  const [added, setAdded] = useState<AddedState | null>(null)
  const [detailItem, setDetailItem] = useState<FoodSearchItem | null>(null)
  const [pendingItem, setPendingItem] = useState<FoodSearchItem | null>(null)
  const addingFoodRef = useRef<string | null>(null)
  const [addingFoodId, setAddingFoodId] = useState<string | null>(null)
  const [recentSearches, setRecentSearches] = useState(() =>
    readRecentFoodSearches()
  )

  const preferences = useQuery(api.users.users.getPreferences)
  const date = currentDateKey(preferences?.lastActiveTimezone || detectTimeZone())
  const addFoodEntry = useOfflineMutation(
    api.logs.foodLogs.addEntry,
    "logs.foodLogs.addEntry"
  )

  const [searchResults, setSearchResults] = useState<FoodSearchItem[]>([])

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
          const nextRecent = nextRecentFoodSearches(current, q)
          writeRecentFoodSearches(nextRecent)
          return nextRecent
        })
      } catch {
        setSearchResults([])
        setSearchState("error")
      }
    }, 380)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, preferences?.foodSearchLanguage])

  const results = useMemo(
    () => rankAndFilterResults(searchResults ?? [], debouncedQuery || query),
    [searchResults, debouncedQuery, query]
  )
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
    const factor = grams / 100
    const round = (v: number) => Math.round(v * factor * 10) / 10

    try {
      const product = detail?.openFoodFacts ?? item.openFoodFacts
      const entry = stripUndefined({
        id: Math.random().toString(36).slice(2),
        name:
          grams === 100 && !portion
            ? item.name
            : `${item.name} (${portion ? foodPortionLabel(portion) : `${grams} g`})`,
        calories: Math.round(Number(item.calories) * factor),
        protein: round(Number(item.protein)),
        carbs: round(Number(item.carbs)),
        fat: round(Number(item.fat)),
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
        calories: Math.round(Number(item.calories) * factor),
        grams,
        meal,
        source: "search",
      })

      setAdded({ itemId: item.id })
      setTimeout(() => setAdded(null), 1800)
    } catch (error) {
      throw error
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

  function runSuggestedSearch(nextQuery: string) {
    setQuery(nextQuery)
    setDebouncedQuery("")
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

          <div className="mx-[var(--app-page-x)] h-px bg-border/40" />

          <div
            className="flex-1 overflow-y-auto px-[var(--app-page-x)] pt-3 [&::-webkit-scrollbar]:hidden"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
            }}
          >
            {searchState === "idle" && (
              <div className="mt-8 grid gap-5">
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
              <div className="app-empty mt-8 justify-center text-center">
                <Warning size={18} className="shrink-0 text-destructive/70" />
                <p className="text-[12.5px] font-medium text-muted-foreground/70">
                  Food search failed. Check your connection and try again.
                </p>
              </div>
            )}

            {showEmpty && (
              <div className="app-empty mt-8 justify-center text-center">
                <p className="text-[12.5px] font-medium text-muted-foreground/70">
                  No results for "{query}"
                </p>
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
                            if (!isAdded && addingFoodId === null)
                              setPendingItem(item)
                          }}
                          disabled={isAdded || addingFoodId !== null}
                          aria-busy={isAdding}
                          aria-label={
                            isAdded ? `${item.name} added` : `Add ${item.name}`
                          }
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-border/50 bg-muted/55 transition-all active:scale-[0.985] disabled:opacity-60"
                        >
                          {isAdded ? (
                            <span className="text-[11px] text-foreground/60">
                              ✓
                            </span>
                          ) : isAdding ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border border-muted-foreground/20 border-t-muted-foreground/60" />
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
      <p className="app-eyebrow mb-2 px-1 text-muted-foreground/55">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSelect(suggestion)}
            className="min-h-10 rounded-xl bg-muted/55 px-3.5 text-[12.5px] font-semibold text-foreground/75 transition-all active:scale-[0.985] active:bg-muted"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </section>
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
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
              {cat.id === suggested && (
                <span
                  className="text-[10px] font-medium"
                  style={{ color: cat.color, opacity: 0.6 }}
                >
                  suggested
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
