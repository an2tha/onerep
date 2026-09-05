import {
  foodLogContextParams,
  foodLogTimestamp,
  isFoodLogDate,
} from "@/lib/food-log-context"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { FoodAttribution } from "@repo/ui"
import {
  ArrowLeft,
  CaretRight,
  Check,
  ChefHat,
  Clock,
  ForkKnife,
  MagnifyingGlass,
  Plus,
  Warning,
  X,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../../convex/_generated/api"
import { FoodDetailSheet } from "@/components/food-detail-sheet"
import { usePostHog } from "@posthog/react"
import { captureFeatureUsage } from "@/lib/analytics"
import {
  currentDateKey,
  detectTimeZone,
  defaultMeal,
  foodPortionLabel,
  stripUndefined,
  type FoodPortion,
  type LogMicros,
} from "@/lib/food-log"
import { foodSources, searchFoodsAccurate } from "@/lib/openfoodfacts"
import { useSmoothNavigate } from "@/lib/navigation"
import type { FoodDetail } from "@repo/models"
import {
  readRecentFoodSearches,
  nextRecentFoodSearches,
  visiblePopularFoodSearches,
  writeRecentFoodSearches,
} from "@/lib/food-search-recents"
import { promoteLoggedFoods } from "@/lib/food-search-ranking"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { hapticSelection } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { useEnergyUnit } from "@/lib/use-energy-unit"
import { energyDisplay } from "@repo/ui"
import { normalizeFoodSearchQuery } from "@/lib/food-search-url"
import { foodCardMacros, scaledFoodMacros } from "@/lib/food-search-nutrition"
import type { Recipe } from "@/lib/food-log"
import { STARTER_RECIPES, type StarterRecipe } from "@/pages/RecipesHub"
import { COACH_RECIPE_PLACEHOLDER } from "@/lib/recipe-images"

type SearchState = "idle" | "loading" | "done" | "error"
type AddedState = { itemId: string }

type FoodSearchItem = Awaited<ReturnType<typeof searchFoodsAccurate>>[number]
type RecipeSearchItem =
  | { kind: "official"; recipe: StarterRecipe }
  | { kind: "saved" | "community"; recipe: Recipe }
type MixedSearchItem =
  | { kind: "food"; item: FoodSearchItem }
  | { kind: "recipe"; item: RecipeSearchItem }

function shouldOpenReviewAsPage() {
  return !(
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 768px)").matches
  )
}

const FOOD_SEARCH_DEBOUNCE_MS = 320
const FOOD_SEARCH_FETCH_LIMIT = 32
const FOOD_SEARCH_RESULT_LIMIT = 24

function recipeMatches(recipe: StarterRecipe | Recipe, query: string) {
  const needle = query.trim().toLocaleLowerCase()
  if (needle.length < 2) return false
  const ingredients = recipe.ingredients.map((ingredient) =>
    typeof ingredient === "string" ? ingredient : ingredient.name
  )
  return [
    recipe.name,
    recipe.description,
    recipe.category,
    ...(recipe.tags ?? []),
    ...ingredients,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(needle)
}

function interleaveSearchResults(
  foods: FoodSearchItem[],
  recipes: RecipeSearchItem[]
): MixedSearchItem[] {
  if (foods.length === 0) {
    return recipes.map((item) => ({ kind: "recipe", item }))
  }
  const mixed: MixedSearchItem[] = []
  let recipeIndex = 0
  foods.forEach((item, index) => {
    mixed.push({ kind: "food", item })
    if (
      (index === 3 || (index > 3 && (index - 3) % 8 === 0)) &&
      recipes[recipeIndex]
    ) {
      mixed.push({ kind: "recipe", item: recipes[recipeIndex] })
      recipeIndex += 1
    }
  })
  if (recipeIndex === 0 && recipes[0]) {
    mixed.push({ kind: "recipe", item: recipes[0] })
  }
  return mixed
}

export default function SearchFoods() {
  const navigate = useSmoothNavigate()
  const energyUnit = useEnergyUnit()
  // The database not having a drink is not the end of the log. Carry the name
  // across so the entry the user came here to make is one screen away, not a
  // second search for a page they have never seen.
  const createCustomFood = (name: string) =>
    navigate(
      `/foods/custom?new=1&log=1&${foodLogContextParams(date, searchParams.get("time"))}${name ? `&name=${encodeURIComponent(name)}` : ""}`,
      { motion: "forward" }
    )
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
  const addingFoodRef = useRef<string | null>(null)
  const [addingFoodId, setAddingFoodId] = useState<string | null>(null)
  const [recentSearches, setRecentSearches] = useState(() =>
    readRecentFoodSearches()
  )

  const preferences = useQuery(api.users.users.getPreferences)
  const savedRecipes = (useQuery(api.logs.recipes.list, {}) ?? []) as Recipe[]
  const communityRecipes = (useQuery(api.logs.recipes.listCommunity, {
    limit: 60,
  }) ?? []) as Recipe[]
  const selectedDate = searchParams.get("date")
  const date = isFoodLogDate(selectedDate)
    ? selectedDate
    : currentDateKey(preferences?.lastActiveTimezone || detectTimeZone())
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

  // Everything the diary has seen lately, by name. The search catalogue has
  // no idea what this person eats; this is the only place that does.
  const recentLoggedDays = useQuery(api.logs.foodLogs.getRecent, {})
  const loggedNames = useMemo(
    () =>
      (
        (recentLoggedDays ?? []) as Array<{
          entries?: Array<{ name?: string }>
        }>
      )
        .flatMap((day) => day.entries ?? [])
        .map((entry) => entry.name ?? "")
        .filter(Boolean),
    [recentLoggedDays]
  )
  const results = useMemo(
    () => promoteLoggedFoods(searchResults, loggedNames),
    [loggedNames, searchResults]
  )
  // A search can span catalogs, so credit whichever ones actually answered it
  // rather than naming one and hoping.
  const resultSources = useMemo(
    () => foodSources(results.map((result) => result.code)),
    [results]
  )
  const recipeResults = useMemo(() => {
    if (!completedQuery) return []
    const savedIds = new Set(savedRecipes.map((recipe) => String(recipe._id)))
    const official: RecipeSearchItem[] = STARTER_RECIPES.filter((recipe) =>
      recipeMatches(recipe, completedQuery)
    ).map((recipe) => ({ kind: "official", recipe }))
    const saved: RecipeSearchItem[] = savedRecipes
      .filter((recipe) => recipeMatches(recipe, completedQuery))
      .map((recipe) => ({ kind: "saved", recipe }))
    const community: RecipeSearchItem[] = communityRecipes
      .filter(
        (recipe) =>
          !savedIds.has(String(recipe._id)) &&
          recipeMatches(recipe, completedQuery)
      )
      .map((recipe) => ({ kind: "community", recipe }))
    return [...saved, ...official, ...community].slice(0, 3)
  }, [communityRecipes, completedQuery, savedRecipes])
  const mixedResults = useMemo(
    () => interleaveSearchResults(results, recipeResults),
    [recipeResults, results]
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
        loggedAt: foodLogTimestamp(date, searchParams.get("time")),
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

      captureFeatureUsage(posthog, "food_logged", {
        item_count: 1,
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
    searchState === "done" &&
    results.length === 0 &&
    recipeResults.length === 0 &&
    completedQuery !== ""
  const showResults = results.length > 0 || recipeResults.length > 0

  function openFoodReview(item: FoodSearchItem) {
    if (shouldOpenReviewAsPage()) {
      const dateParam = `?${foodLogContextParams(date, searchParams.get("time"))}`
      navigate(`/foods/review/${encodeURIComponent(item.id)}${dateParam}`, {
        state: { item },
      })
      return
    }

    setDetailItem(item)
  }

  function openRecipe(item: RecipeSearchItem) {
    hapticSelection()
    if (item.kind === "saved") {
      navigate(`/foods/recipe/${item.recipe._id}`, { motion: "forward" })
      return
    }
    navigate("/recipes", {
      motion: "forward",
      state:
        item.kind === "official"
          ? { openStarterRecipeId: item.recipe.id }
          : { openCommunityRecipeId: String(item.recipe._id) },
    })
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

          <div className="flex items-center justify-between gap-3 px-[var(--app-page-x)] pb-3">
            <p className="text-[14px] text-muted-foreground">
              Logging for{" "}
              {new Date(`${date}T12:00:00`).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })}
              {searchParams.get("time")
                ? ` at ${searchParams.get("time")}`
                : ""}
            </p>
            <button
              type="button"
              className="app-button app-button-quiet shrink-0"
              onClick={() =>
                navigate(
                  `/foods/custom?${foodLogContextParams(date, searchParams.get("time"))}`
                )
              }
            >
              My foods
            </button>
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
                  Check the spelling, or enter it yourself once and it is there
                  for good.
                </p>
                <button
                  type="button"
                  onClick={() => createCustomFood(completedQuery)}
                  className="native-toolbar-button mt-3 border border-border bg-card"
                >
                  <Plus size={15} weight="bold" />
                  Add “{completedQuery}” yourself
                </button>
              </div>
            )}

            {showResults && (
              <>
                <div className="mt-1 mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h1 className="text-[18px] font-semibold tracking-[-0.02em]">
                      Results
                    </h1>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {results.length} food{results.length === 1 ? "" : "s"}
                      {recipeResults.length > 0
                        ? ` · ${recipeResults.length} recipe${recipeResults.length === 1 ? "" : "s"}`
                        : ""}{" "}
                      for “{completedQuery}”
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => createCustomFood(completedQuery)}
                    className="min-h-11 shrink-0 text-[11px] font-semibold text-muted-foreground"
                  >
                    Not here? Add it
                  </button>
                </div>
                <div className="grid gap-2.5 md:auto-rows-[5.5rem] md:grid-cols-2 md:gap-3">
                  {mixedResults.map((result) => {
                    if (result.kind === "recipe") {
                      return (
                        <RecipeSearchCard
                          key={`recipe-${result.item.kind}-${"id" in result.item.recipe ? result.item.recipe.id : result.item.recipe._id}`}
                          item={result.item}
                          onOpen={() => openRecipe(result.item)}
                        />
                      )
                    }
                    const item = result.item
                    const card = foodCardMacros(item)
                    const isAdded = added?.itemId === item.id
                    const isAdding = addingFoodId === item.id
                    return (
                      <div
                        key={item.id}
                        className="flex min-h-[5.5rem] w-full items-center gap-2 overflow-hidden rounded-2xl border border-border bg-card p-2 text-left transition-colors hover:bg-muted/20"
                      >
                        <button
                          type="button"
                          onClick={() => openFoodReview(item)}
                          className="motion-list-row flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt=""
                              loading="lazy"
                              className="size-14 shrink-0 rounded-xl bg-muted object-cover"
                            />
                          ) : (
                            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
                              <ForkKnife size={19} />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] leading-snug font-semibold">
                              {item.name}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {[item.brand, card.servingLabel]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground tabular-nums">
                              <strong className="font-semibold text-foreground">
                                {energyDisplay(card.calories, energyUnit)}{" "}
                                {energyUnit}
                              </strong>
                              <span>P {Math.round(card.protein)}g</span>
                              <span>C {Math.round(card.carbs)}g</span>
                              <span>F {Math.round(card.fat)}g</span>
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!isAdded && addingFoodId === null)
                              openFoodReview(item)
                          }}
                          disabled={isAdded || addingFoodId !== null}
                          aria-busy={isAdding}
                          aria-label={
                            isAdded ? `${item.name} added` : `Add ${item.name}`
                          }
                          className={cn(
                            "motion-tactile grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground disabled:opacity-60",
                            isAdded && "motion-success-pop"
                          )}
                        >
                          {isAdded ? (
                            <Check
                              size={16}
                              weight="bold"
                              className="text-[var(--status-success)]"
                            />
                          ) : isAdding ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border border-muted-foreground/20 border-t-muted-foreground/60" />
                          ) : (
                            <Plus size={16} weight="bold" />
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
                <FoodAttribution sources={resultSources} className="mt-3" />
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
    </>
  )
}

function RecipeSearchCard({
  item,
  onOpen,
}: {
  item: RecipeSearchItem
  onOpen: () => void
}) {
  const energyUnit = useEnergyUnit()
  const recipe = item.recipe
  const official = item.kind === "official"
  const image = official
    ? item.recipe.image
    : (item.recipe.photoUrls?.[0] ??
      (item.recipe.placeholderImage ? COACH_RECIPE_PLACEHOLDER : undefined))
  const nutrition = official
    ? { calories: item.recipe.calories, protein: item.recipe.protein }
    : item.recipe.ingredients.reduce(
        (total, ingredient) => ({
          calories:
            total.calories +
            (ingredient.caloriesPer100 * ingredient.grams) / 100,
          protein:
            total.protein + (ingredient.proteinPer100 * ingredient.grams) / 100,
        }),
        { calories: 0, protein: 0 }
      )
  const servings = official ? 1 : Math.max(1, item.recipe.servings ?? 1)
  const totalMinutes = official
    ? item.recipe.time
    : (item.recipe.prepMinutes ?? 0) + (item.recipe.cookMinutes ?? 0)
  const source =
    item.kind === "official"
      ? "OneRep recipe"
      : item.kind === "saved"
        ? "Your recipe"
        : `By ${item.recipe.communityAuthorName ?? "OneRep community"}`

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex h-[11.625rem] w-full overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:bg-muted/20 md:row-span-2 md:h-auto md:min-h-0"
      aria-label={`Open recipe ${recipe.name}`}
    >
      <span className="relative w-[42%] shrink-0 overflow-hidden bg-muted/55">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
          />
        ) : (
          <span className="grid h-full place-items-center text-muted-foreground">
            <ChefHat size={28} />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col self-stretch p-4">
        <span className="text-[11px] font-medium text-muted-foreground">
          {source}
        </span>
        <strong className="mt-2 line-clamp-2 text-[17px] leading-5 font-semibold tracking-[-0.02em]">
          {recipe.name}
        </strong>
        {recipe.description ? (
          <span className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {recipe.description}
          </span>
        ) : null}
        <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
          {totalMinutes > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} /> {totalMinutes} min
            </span>
          ) : null}
          <span>
            {energyDisplay(nutrition.calories / servings, energyUnit)}{" "}
            {energyUnit}
          </span>
          <span>{Math.round(nutrition.protein / servings)}g Protein</span>
        </span>
      </span>
    </button>
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
