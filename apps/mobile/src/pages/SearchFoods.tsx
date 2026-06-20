import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
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
import { currentDateKey, defaultMeal, type LogMicros } from "@/lib/food-log"
import { searchFoods } from "@/lib/openfoodfacts"

type SearchState = "idle" | "loading" | "done" | "error"
type AddedState = { itemId: string }

type FoodSearchItem = {
  id: string
  name: string
  brand?: string
  serving: string
  calories: number
  protein: number
  carbs: number
  fat: number
  imageUrl?: string
}

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
  if (item.imageUrl) score += 8

  score -= Math.min(nameTokens.length, 12) * 2
  return score - index * 0.001
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

function openFoodFactsImageUrls(item: FoodSearchItem): string[] {
  const urls = new Set<string>()
  if (item.imageUrl) urls.add(item.imageUrl)

  const digits = String(item.id ?? "").replace(/\D/g, "")
  if (digits.length > 0) {
    const barcode = digits.padStart(13, "0")
    const path = [
      barcode.slice(0, 3),
      barcode.slice(3, 6),
      barcode.slice(6, 9),
      barcode.slice(9),
    ].join("/")

    urls.add(
      `https://images.openfoodfacts.org/images/products/${path}/front_en.400.jpg`
    )
    urls.add(
      `https://images.openfoodfacts.org/images/products/${path}/front.400.jpg`
    )
  }

  return [...urls]
}

const MEAL_CATEGORIES = [
  {
    id: "breakfast",
    label: "Breakfast",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
  },
  {
    id: "lunch",
    label: "Lunch",
    color: "#0ea5e9",
    bg: "rgba(14,165,233,0.12)",
  },
  {
    id: "dinner",
    label: "Dinner",
    color: "#818cf8",
    bg: "rgba(129,140,248,0.12)",
  },
  {
    id: "snack",
    label: "Snack",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
  },
]

export default function SearchFoods() {
  const navigate = useNavigate()
  const posthog = usePostHog()

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [searchState, setSearchState] = useState<SearchState>("idle")
  const [added, setAdded] = useState<AddedState | null>(null)
  const [detailItem, setDetailItem] = useState<FoodSearchItem | null>(null)
  const [pendingItem, setPendingItem] = useState<FoodSearchItem | null>(null)

  const date = currentDateKey()
  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date })
  const setDay = useOfflineMutation(
    api.logs.foodLogs.setDay,
    "logs.foodLogs.setDay"
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
        const results = await searchFoods(q, 50)
        setSearchResults(results ?? [])
        setSearchState("done")
      } catch {
        setSearchResults([])
        setSearchState("error")
      }
    }, 380)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const results = useMemo(
    () => rankAndFilterResults(searchResults ?? [], debouncedQuery || query),
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
    meal = "breakfast"
  ) {
    const factor = grams / 100
    const round = (v: number) => Math.round(v * factor * 10) / 10

    const entry = {
      id: Math.random().toString(36).slice(2),
      name: grams === 100 ? item.name : `${item.name} (${grams} g)`,
      calories: Math.round(Number(item.calories) * factor),
      protein: round(Number(item.protein)),
      carbs: round(Number(item.carbs)),
      fat: round(Number(item.fat)),
      loggedAt: new Date().toISOString(),
      meal,
      ...micros,
    }

    const existingEntries = foodLogs ?? []
    await setDay({ date, entries: [...existingEntries, entry] })

    posthog.capture("food_logged", {
      food_name: item.name,
      calories: Math.round(Number(item.calories) * factor),
      grams,
      meal,
      source: "search",
    })

    setAdded({ itemId: item.id })
    setTimeout(() => setAdded(null), 1800)
  }

  const showEmpty =
    searchState === "done" && results.length === 0 && debouncedQuery !== ""
  const showResults = results.length > 0

  return (
    <>
      <div className="page-enter flex min-h-svh flex-col bg-background">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
          <div
            className="flex items-center gap-3 px-4 pb-3"
            style={{
              paddingTop: "max(1.25rem, env(safe-area-inset-top, 1.25rem))",
            }}
          >
            <button
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60 transition-opacity active:opacity-60"
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
                placeholder="Search foods…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-full rounded-xl bg-muted/60 pr-8 pl-8 text-[14px] outline-none placeholder:text-muted-foreground/40"
              />
              {query.length > 0 && (
                <button
                  onClick={() => {
                    setQuery("")
                    setDebouncedQuery("")
                    setSearchState("idle")
                  }}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground/40 transition-opacity active:opacity-60"
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
              <div className="flex flex-col items-center justify-center gap-2 pt-20 text-center">
                <MagnifyingGlass
                  size={28}
                  className="text-muted-foreground/20"
                />
                <p className="text-[13px] font-medium text-muted-foreground/40">
                  Search millions of foods
                </p>
                <p className="text-[11px] text-muted-foreground/25">
                  Powered by OneRep Foods
                </p>
              </div>
            )}

            {searchState === "error" && (
              <div className="flex flex-col items-center justify-center gap-2 pt-20 text-center">
                <Warning size={28} className="text-muted-foreground/30" />
                <p className="text-[13px] font-medium text-muted-foreground/50">
                  Search failed
                </p>
              </div>
            )}

            {showEmpty && (
              <div className="flex flex-col items-center justify-center gap-2 pt-20 text-center">
                <p className="text-[13px] font-medium text-muted-foreground/50">
                  No results for "{query}"
                </p>
              </div>
            )}

            {showResults && (
              <>
                <p className="mt-1 mb-2 px-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/35 uppercase">
                  {results.length} result{results.length !== 1 ? "s" : ""}
                </p>
                <div className="divide-y divide-border/30">
                  {results.map((item) => {
                    const isAdded = added?.itemId === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => setDetailItem(item)}
                        className="flex w-full items-center gap-3 py-3 text-left transition-colors active:bg-muted/30"
                      >
                        <FoodImage item={item} />

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
                              color="#60a5fa"
                            />
                            <MacroPill
                              label="C"
                              value={Number(item.carbs)}
                              color="#a78bfa"
                            />
                            <MacroPill
                              label="F"
                              value={Number(item.fat)}
                              color="#f59e0b"
                            />
                          </div>
                        </div>

                        <div
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!isAdded) setPendingItem(item)
                          }}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted transition-all active:scale-90"
                        >
                          {isAdded ? (
                            <span className="text-[11px] text-foreground/60">
                              ✓
                            </span>
                          ) : (
                            <span className="text-[18px] leading-none font-light text-foreground/50">
                              +
                            </span>
                          )}
                        </div>
                      </button>
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
          onAdd={(item, grams, micros, meal) => {
            void handleAdd(item, grams, micros, meal)
          }}
          onClose={() => setDetailItem(null)}
        />
      )}

      {pendingItem && (
        <MealSelectSheet
          item={pendingItem}
          onSelect={(meal) => {
            void handleAdd(pendingItem, 100, {}, meal)
            setPendingItem(null)
          }}
          onClose={() => setPendingItem(null)}
        />
      )}
    </>
  )
}

function FoodImage({ item }: { item: FoodSearchItem }) {
  const imageKey = `${item.id}|${item.name}|${item.brand ?? ""}`
  const candidates = openFoodFactsImageUrls(item)
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [imageFailed, setImageFailed] = useState(candidates.length === 0)

  useEffect(() => {
    setCandidateIndex(0)
    setImageFailed(candidates.length === 0)
  }, [imageKey, candidates.length])

  const src = imageFailed ? null : candidates[candidateIndex]

  function handleImageError() {
    if (candidateIndex < candidates.length - 1) {
      setCandidateIndex((index) => index + 1)
      return
    }

    setImageFailed(true)
  }

  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-muted/50">
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={handleImageError}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/50">
          <Fire size={16} weight="fill" className="text-orange-400/55" />
        </div>
      )}
      <div className="absolute right-1 bottom-1 rounded-full bg-background/90 px-1.5 py-0.5 text-[9.5px] font-semibold text-foreground/75 shadow-sm backdrop-blur-sm">
        {item.calories}
      </div>
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
  onSelect: (meal: string) => void
  onClose: () => void
}) {
  const categories = MEAL_CATEGORIES
  const suggested = defaultMeal()

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-sm rounded-t-[24px] bg-card px-4 pt-4 shadow-[0_-16px_50px_rgba(0,0,0,0.18)]"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
      >
        <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-foreground/10" />
        <p className="mb-0.5 text-[15px] leading-snug font-semibold tracking-[-0.01em]">
          Add to…
        </p>
        <p className="mb-4 truncate text-[11.5px] text-muted-foreground/45">
          {item.name}
        </p>
        <div className="flex flex-col gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className="flex items-center justify-between rounded-2xl px-4 py-3 transition-all active:scale-[0.98]"
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
