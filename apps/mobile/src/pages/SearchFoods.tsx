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
import { hapticSelection } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { GooeyInput } from "@/components/ui/gooey-input"

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
      hapticSelection()
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
    hapticSelection()
    setQuery(nextQuery)
    setDebouncedQuery("")
    setSearchResults([])
    setSearchState("loading")
    inputRef.current?.focus()
  }

  return (
    <>
      <div className="flex flex-col bg-background min-h-svh desktop-canvas">
        <div className="flex flex-col flex-1 mx-auto w-full max-w-lg md:max-w-4xl">
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
                <div className="top-1/2 left-3 absolute border border-muted-foreground/20 border-t-muted-foreground/60 rounded-full w-3.5 h-3.5 -translate-y-1/2 animate-spin pointer-events-none" />
              ) : (
                <MagnifyingGlass
                  size={14}
                  className="top-1/2 left-3 absolute text-muted-foreground/50 -translate-y-1/2 pointer-events-none"
                />
              )}
              <input
                type="text"
                name="food-search-query"
                placeholder="Search foods…"
                value={query}
                ref={inputRef}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search foods"
                className="bg-muted/45 pr-10 pl-8 border-border/60 w-full h-11 text-[14px] placeholder:text-muted-foreground/40 app-input"
              />

              
              {query.length > 0 && (
                <button
                  onClick={() => {
                    setQuery("")
                    setDebouncedQuery("")
                    setSearchState("idle")
                  }}
                  aria-label="Clear search"
                  className="top-1/2 right-0 absolute flex justify-center items-center active:opacity-60 w-10 h-10 text-muted-foreground/40 transition-opacity -translate-y-1/2"
                >
                  <X size={13} weight="bold" />
                </button>
              )}
            </div>
          </div>

          <div className="mx-[var(--app-page-x)] bg-border/40 h-px" />

          <div
            className="[&::-webkit-scrollbar]:hidden flex-1 px-[var(--app-page-x)] pt-3 overflow-y-auto"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
            }}
          >
            {searchState === "idle" && (
              <div className="gap-5 grid mt-8">
                <div className="justify-center text-center app-empty">
                  <MagnifyingGlass
                    size={18}
                    className="text-muted-foreground/35 shrink-0"
                  />
                  <p className="font-medium text-[12.5px] text-muted-foreground/70">
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
              <div className="justify-center mt-8 text-center app-empty">
                <Warning size={18} className="text-destructive/70 shrink-0" />
                <p className="font-medium text-[12.5px] text-muted-foreground/70">
                  Food search failed. Check your connection and try again.
                </p>
              </div>
            )}

            {showEmpty && (
              <div className="justify-center mt-8 text-center app-empty">
                <p className="font-medium text-[12.5px] text-muted-foreground/70">
                  No results for "{query}"
                </p>
              </div>
            )}

            {showResults && (
              <>
                <p className="mt-1 mb-2 px-1 text-muted-foreground/55 app-eyebrow">
                  {results.length} result{results.length !== 1 ? "s" : ""}
                </p>
                <div className="md:gap-0 md:grid md:grid-cols-2 app-ledger">
                  {results.map((item) => {
                    const isAdded = added?.itemId === item.id
                    const isAdding = addingFoodId === item.id
                    return (
                      <div
                        key={item.id}
                        className="w-full text-left app-ledger-row"
                      >
                        <button
                          type="button"
                          onClick={() => openFoodReview(item)}
                          className="flex flex-1 items-center gap-3 active:bg-muted/30 min-w-0 text-left motion-list-row"
                        >
                          <CalorieBadge calories={Number(item.calories)} />

                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[13.5px] truncate leading-snug">
                              {item.name}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {item.brand && (
                                <span className="text-[10.5px] text-muted-foreground/40 truncate">
                                  {item.brand}
                                </span>
                              )}
                              {item.brand && (
                                <span className="text-[10px] text-muted-foreground/25">
                                  ·
                                </span>
                              )}
                              <span className="text-[10.5px] text-muted-foreground/40 shrink-0">
                                {item.serving}
                              </span>
                            </div>
                            <div className="flex gap-2.5 mt-1">
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
                          className={cn(
                            "flex justify-center items-center bg-muted/55 disabled:opacity-60 border border-border/50 rounded-[8px] w-10 h-10 motion-tactile shrink-0",
                            isAdded && "motion-success-pop"
                          )}
                        >
                          {isAdded ? (
                            <span className="text-[11px] text-foreground/60">
                              ✓
                            </span>
                          ) : isAdding ? (
                            <span className="border border-muted-foreground/20 border-t-muted-foreground/60 rounded-full w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <span className="font-light text-[18px] text-foreground/50 leading-none">
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
      <p className="mb-2 px-1 text-muted-foreground/55 app-eyebrow">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSelect(suggestion)}
            className="bg-muted/55 active:bg-muted px-3.5 rounded-xl min-h-10 font-semibold text-[12.5px] text-foreground/75 motion-tactile"
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
    <div className="flex flex-col justify-center items-center bg-muted/60 rounded-[9px] w-14 h-14 text-center shrink-0">
      <div
        className="flex items-center gap-0.5"
        style={{ color: APP_ACCENT_COLORS.food }}
      >
        <Fire size={13} weight="fill" />
        <span className="font-semibold tabular-nums text-[13px] leading-none">
          {Math.round(calories)}
        </span>
      </div>
      <span className="mt-0.5 font-semibold text-[8.5px] text-muted-foreground/40 uppercase tracking-[0.08em]">
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
        className="font-semibold text-[9.5px]"
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
        className="z-40 fixed inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="md:top-1/2 md:right-auto bottom-0 md:bottom-auto md:left-1/2 z-50 fixed inset-x-0 bg-card shadow-[0_-16px_50px_rgba(0,0,0,0.18)] md:shadow-2xl mx-auto md:mx-0 px-4 pt-4 border border-border/40 md:rounded-[28px] rounded-t-[24px] w-full md:w-[min(24rem,calc(100vw-2rem))] max-w-sm max-h-[calc(100svh-1rem)] overflow-y-auto md:-translate-x-1/2 md:-translate-y-1/2"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
      >
        <div className="bg-foreground/10 mx-auto mb-3 rounded-full w-8 h-1" />
        <p
          id={titleId}
          className="mb-0.5 font-semibold text-[15px] leading-snug tracking-[-0.01em]"
        >
          Add to…
        </p>
        <p className="mb-4 text-[11.5px] text-muted-foreground/45 truncate">
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
              className="flex justify-between items-center px-4 py-3 rounded-2xl active:scale-[0.985] transition-all"
              style={{
                backgroundColor: cat.id === suggested ? cat.bg : "var(--muted)",
                outline:
                  cat.id === suggested ? `1.5px solid ${cat.color}` : "none",
                outlineOffset: "1px",
              }}
            >
              <span
                className="font-semibold text-[13.5px]"
                style={{
                  color: cat.id === suggested ? cat.color : "var(--foreground)",
                  opacity: cat.id === suggested ? 1 : 0.75,
                }}
              >
                {cat.label}
              </span>
              {cat.id === suggested && (
                <span
                  className="font-medium text-[10px]"
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
