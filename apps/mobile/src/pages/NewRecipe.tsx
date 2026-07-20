import { useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent } from "react"
import { useLocation, useParams } from "react-router"
import {
  ArrowLeft,
  Camera,
  Check,
  ChefHat,
  Clock,
  ForkKnife,
  MagnifyingGlass,
  Minus,
  NotePencil,
  Plus,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react"
import { FoodDetailSheet } from "@/components/food-detail-sheet"
import { searchFoods } from "@/lib/openfoodfacts"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  FOOD_PORTION_UNITS,
  amountFromFoodPortionGrams,
  defaultFoodPortion,
  foodPortionLabel,
  gramsFromFoodPortion,
  stripUndefined,
  type FoodPortion,
  type FoodLogEntry,
  type FoodPortionUnit,
  type LogMicros,
  type Recipe,
  type RecipeIngredient,
} from "@/lib/food-log"
import { useMutation, useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { COACH_RECIPE_PLACEHOLDER } from "@/lib/recipe-images"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import type { FoodDetail, FoodResult } from "@repo/models"
import { APP_ACCENT_COLORS, MACRO_COLORS, MICRO_COLORS } from "@repo/ui"

type SearchState = "idle" | "loading" | "done" | "error"
type RecipeRouteState = {
  draftRecipe?: Pick<Recipe, "name" | "ingredients">
  replaceFoodLogEntry?: {
    date: string
    entryId: string
  }
}
type AddedState = { itemId: string }
type FoodSearchItem = Awaited<ReturnType<typeof searchFoods>>[number]
type StoredRecipeIngredient = Omit<RecipeIngredient, "displayUnit"> & {
  displayUnit?: string
}
type RecipeType = "quick" | "detailed"
type DraftPhoto = {
  id: string
  file?: File
  url: string
  storageId?: Id<"_storage">
  placeholder?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFoodPortionUnit(value: unknown): value is FoodPortionUnit {
  return (
    typeof value === "string" &&
    FOOD_PORTION_UNITS.some((unit) => unit.id === value)
  )
}

function normalizeRecipeIngredients(input: unknown): RecipeIngredient[] {
  if (!Array.isArray(input)) return []
  return input.map((ingredient) => {
    const next = { ...(ingredient as StoredRecipeIngredient) }
    if (next.displayUnit && !isFoodPortionUnit(next.displayUnit)) {
      delete next.displayUnit
    }
    return next as RecipeIngredient
  })
}

function recipeTotals(ingredients: RecipeIngredient[]) {
  return ingredients.reduce(
    (acc, i) => ({
      calories: acc.calories + Math.round((i.caloriesPer100 * i.grams) / 100),
      protein: acc.protein + Math.round((i.proteinPer100 * i.grams) / 100),
      carbs: acc.carbs + Math.round((i.carbsPer100 * i.grams) / 100),
      fat: acc.fat + Math.round((i.fatPer100 * i.grams) / 100),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function positiveNumber(value: string): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function dominantMacroColor(ing: RecipeIngredient) {
  const cP = ((ing.proteinPer100 * ing.grams) / 100) * 4
  const cC = ((ing.carbsPer100 * ing.grams) / 100) * 4
  const cF = ((ing.fatPer100 * ing.grams) / 100) * 9
  const max = Math.max(cP, cC, cF)
  if (max === 0) return APP_ACCENT_COLORS.neutral
  if (max === cP) return MACRO_COLORS.protein
  if (max === cC) return MACRO_COLORS.carbs
  return MACRO_COLORS.fat
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

type MicroKey = keyof LogMicros

const MICRO_FIELDS: {
  key: MicroKey
  per100Key: keyof RecipeIngredient
  label: string
  unit: string
  color: string
}[] = [
  {
    key: "fiber",
    per100Key: "fiberPer100",
    label: "Fiber",
    unit: "g",
    color: MICRO_COLORS.fiber,
  },
  {
    key: "sugar",
    per100Key: "sugarPer100",
    label: "Sugar",
    unit: "g",
    color: MICRO_COLORS.sugar,
  },
  {
    key: "saturatedFat",
    per100Key: "saturatedFatPer100",
    label: "Sat. fat",
    unit: "g",
    color: MICRO_COLORS.saturatedFat,
  },
  {
    key: "transFat",
    per100Key: "transFatPer100",
    label: "Trans fat",
    unit: "g",
    color: MICRO_COLORS.transFat,
  },
  {
    key: "cholesterol",
    per100Key: "cholesterolPer100",
    label: "Cholesterol",
    unit: "mg",
    color: MICRO_COLORS.cholesterol,
  },
  {
    key: "sodium",
    per100Key: "sodiumPer100",
    label: "Sodium",
    unit: "mg",
    color: MICRO_COLORS.sodium,
  },
  {
    key: "potassium",
    per100Key: "potassiumPer100",
    label: "Potassium",
    unit: "mg",
    color: MICRO_COLORS.potassium,
  },
  {
    key: "calcium",
    per100Key: "calciumPer100",
    label: "Calcium",
    unit: "mg",
    color: MICRO_COLORS.calcium,
  },
  {
    key: "iron",
    per100Key: "ironPer100",
    label: "Iron",
    unit: "mg",
    color: MICRO_COLORS.iron,
  },
  {
    key: "magnesium",
    per100Key: "magnesiumPer100",
    label: "Magnesium",
    unit: "mg",
    color: MICRO_COLORS.magnesium,
  },
  {
    key: "phosphorus",
    per100Key: "phosphorusPer100",
    label: "Phosphorus",
    unit: "mg",
    color: MICRO_COLORS.phosphorus,
  },
  {
    key: "zinc",
    per100Key: "zincPer100",
    label: "Zinc",
    unit: "mg",
    color: MICRO_COLORS.zinc,
  },
  {
    key: "vitaminC",
    per100Key: "vitaminCPer100",
    label: "Vitamin C",
    unit: "mg",
    color: MICRO_COLORS.vitaminC,
  },
  {
    key: "vitaminA",
    per100Key: "vitaminAPer100",
    label: "Vitamin A",
    unit: "mcg",
    color: MICRO_COLORS.vitaminA,
  },
  {
    key: "vitaminD",
    per100Key: "vitaminDPer100",
    label: "Vitamin D",
    unit: "mcg",
    color: MICRO_COLORS.vitaminD,
  },
  {
    key: "vitaminB12",
    per100Key: "vitaminB12Per100",
    label: "Vitamin B12",
    unit: "mcg",
    color: MICRO_COLORS.vitaminB12,
  },
  {
    key: "caffeine",
    per100Key: "caffeinePer100",
    label: "Caffeine",
    unit: "mg",
    color: MICRO_COLORS.caffeine,
  },
  {
    key: "alcohol",
    per100Key: "alcoholPer100",
    label: "Alcohol",
    unit: "g",
    color: MICRO_COLORS.alcohol,
  },
]

function roundFoodValue(value: number) {
  if (value >= 100) return Math.round(value)
  if (value >= 10) return Math.round(value * 10) / 10
  return Math.round(value * 100) / 100
}

function scaledPer100(value: unknown, grams: number) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return roundFoodValue((n * grams) / 100)
}

function recipeMicros(ingredients: RecipeIngredient[]) {
  return MICRO_FIELDS.map((field) => {
    const value = ingredients.reduce(
      (sum, ingredient) =>
        sum + scaledPer100(ingredient[field.per100Key], ingredient.grams),
      0
    )
    return { ...field, value: roundFoodValue(value) }
  }).filter((field) => field.value > 0)
}

function microsPer100(
  micros: LogMicros,
  grams: number
): Partial<RecipeIngredient> {
  if (grams <= 0) return {}
  const entries: Partial<RecipeIngredient> = {}
  const set = (key: keyof RecipeIngredient, value?: number) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      return
    ;(entries as Record<string, number>)[key] = roundFoodValue(
      (value / grams) * 100
    )
  }

  set("fiberPer100", micros.fiber)
  set("sugarPer100", micros.sugar)
  set("saturatedFatPer100", micros.saturatedFat)
  set("transFatPer100", micros.transFat)
  set("cholesterolPer100", micros.cholesterol)
  set("sodiumPer100", micros.sodium)
  set("potassiumPer100", micros.potassium)
  set("calciumPer100", micros.calcium)
  set("ironPer100", micros.iron)
  set("magnesiumPer100", micros.magnesium)
  set("phosphorusPer100", micros.phosphorus)
  set("zincPer100", micros.zinc)
  set("vitaminCPer100", micros.vitaminC)
  set("vitaminAPer100", micros.vitaminA)
  set("vitaminDPer100", micros.vitaminD)
  set("vitaminB12Per100", micros.vitaminB12)
  set("caffeinePer100", micros.caffeine)
  set("alcoholPer100", micros.alcohol)

  return entries
}

// ─── Ingredient card ──────────────────────────────────────────────────────────

function IngredientCard({
  ingredient,
  index,
  calShare,
  onPortionChange,
  onDelete,
}: {
  ingredient: RecipeIngredient
  index: number
  calShare: number
  onPortionChange: (portion: FoodPortion) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const unit = ingredient.displayUnit ?? "g"
  const amount =
    ingredient.displayAmount ??
    amountFromFoodPortionGrams(ingredient.grams, unit)
  const [inputVal, setInputVal] = useState(String(amount))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (!editing) setInputVal(String(amount))
  }, [amount, editing])

  const cals = Math.round((ingredient.caloriesPer100 * ingredient.grams) / 100)
  const accent = dominantMacroColor(ingredient)
  const protein = scaledPer100(ingredient.proteinPer100, ingredient.grams)
  const carbs = scaledPer100(ingredient.carbsPer100, ingredient.grams)
  const fat = scaledPer100(ingredient.fatPer100, ingredient.grams)

  function applyPortion(nextAmount: number, nextUnit: FoodPortionUnit) {
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) return
    const roundedAmount = roundFoodValue(nextAmount)
    onPortionChange({
      amount: roundedAmount,
      unit: nextUnit,
      grams: gramsFromFoodPortion(roundedAmount, nextUnit),
    })
  }

  function commit(raw: string) {
    const n = parseFloat(raw.replace(/[^\d.]/g, ""))
    if (!isNaN(n) && n > 0 && n <= 9999) applyPortion(n, unit)
    setInputVal(String(amount))
    setEditing(false)
  }

  function step(dir: 1 | -1) {
    const configuredStep =
      unit === "g" || unit === "ml"
        ? ingredient.grams < 50
          ? 5
          : ingredient.grams < 200
            ? 10
            : 25
        : (FOOD_PORTION_UNITS.find((option) => option.id === unit)?.step ?? 1)
    applyPortion(Math.max(configuredStep, amount + dir * configuredStep), unit)
  }

  return (
    <div className="py-4">
      <div className="flex items-start gap-3 px-1">
        <span className="mt-0.5 w-5 shrink-0 text-[13px] font-semibold text-muted-foreground tabular-nums">
          {index + 1}.
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] leading-snug font-semibold">
                {ingredient.name}
              </p>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground tabular-nums">
                Protein {protein} g · Carbs {carbs} g · Fat {fat} g
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[14px] font-semibold text-foreground tabular-nums">
                {cals} kcal
              </span>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onDelete}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors active:bg-muted active:text-destructive"
                aria-label={`Remove ${ingredient.name}`}
              >
                <X size={17} weight="bold" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <div
              className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]"
              aria-hidden="true"
            >
              <div
                className="motion-progress-fill h-full rounded-full"
                style={{
                  width: `${calShare}%`,
                  backgroundColor: accent,
                  opacity: 0.75,
                }}
              />
            </div>
            <span className="w-28 text-right text-[13px] text-muted-foreground tabular-nums">
              {calShare}% of calories
            </span>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault()
                step(-1)
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors active:bg-muted/70"
              aria-label={`Decrease ${ingredient.name} amount`}
            >
              <Minus size={15} weight="bold" />
            </button>

            {editing ? (
              <input
                ref={inputRef}
                type="text"
                name={`ingredient-${ingredient.id}-amount`}
                inputMode="decimal"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onBlur={(e) => commit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur()
                  if (e.key === "Escape") {
                    setInputVal(String(amount))
                    setEditing(false)
                  }
                }}
                className="h-11 w-20 rounded-lg bg-muted px-1.5 text-center text-[15px] font-semibold tabular-nums outline-none"
                aria-label={`${ingredient.name} amount`}
              />
            ) : (
              <button
                onClick={() => {
                  setInputVal(String(amount))
                  setEditing(true)
                }}
                className="h-11 min-w-[64px] rounded-lg bg-muted px-2.5 text-center text-[15px] font-semibold tabular-nums transition-colors active:bg-muted/70"
                aria-label={`Edit ${ingredient.name} amount`}
              >
                {amount}
              </button>
            )}

            <select
              value={unit}
              onChange={(e) => {
                const nextUnit = e.target.value as FoodPortionUnit
                applyPortion(
                  amountFromFoodPortionGrams(ingredient.grams, nextUnit),
                  nextUnit
                )
              }}
              className="h-11 rounded-lg bg-muted px-2 text-[14px] font-semibold outline-none"
              name={`ingredient-${ingredient.id}-unit`}
              aria-label={`${ingredient.name} unit`}
            >
              {FOOD_PORTION_UNITS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault()
                step(1)
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors active:bg-muted/70"
              aria-label={`Increase ${ingredient.name} amount`}
            >
              <Plus size={15} weight="bold" />
            </button>
            <span className="ml-auto hidden text-[13px] text-muted-foreground tabular-nums sm:inline">
              {Math.round(ingredient.grams)} g
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function SearchOverlay({
  onAdd,
  onClose,
}: {
  onAdd: (
    item: FoodSearchItem,
    grams: number,
    micros?: LogMicros,
    detail?: FoodDetail | null,
    portion?: FoodPortion
  ) => void
  onClose: () => void
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [searchState, setSearchState] = useState<SearchState>("idle")
  const [added, setAdded] = useState<AddedState | null>(null)
  const [detailItem, setDetailItem] = useState<FoodSearchItem | null>(null)
  const [searchResults, setSearchResults] = useState<FoodSearchItem[]>([])
  const preferences = useQuery(api.users.users.getPreferences)

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

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    return () => {
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current)
    }
  }, [])

  function handleAdd(
    item: FoodSearchItem,
    grams?: number,
    micros: LogMicros = {},
    detail?: FoodDetail | null,
    portion?: FoodPortion
  ) {
    const fallbackPortion = defaultFoodPortion(item.serving, item.name)
    const selectedPortion =
      portion ??
      (typeof grams === "number"
        ? {
            amount: amountFromFoodPortionGrams(grams, fallbackPortion.unit),
            unit: fallbackPortion.unit,
            grams,
          }
        : fallbackPortion)
    const selectedGrams = grams ?? selectedPortion.grams

    onAdd(
      {
        ...item,
        calories: Number(item.calories) || 0,
        protein: Number(item.protein) || 0,
        carbs: Number(item.carbs) || 0,
        fat: Number(item.fat) || 0,
      },
      selectedGrams,
      micros,
      detail,
      selectedPortion
    )
    setDetailItem(null)
    setAdded({ itemId: item.id })
    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current)
    addedTimeoutRef.current = setTimeout(() => setAdded(null), 1800)
  }

  const showEmpty =
    searchState === "done" && results.length === 0 && debouncedQuery !== ""
  const showResults = results.length > 0

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background">
        <div className="desktop-canvas flex min-h-svh flex-col bg-background">
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col md:max-w-4xl">
            <div
              className="flex items-center gap-3 px-[var(--app-page-x)] pb-4"
              style={{
                paddingTop: "max(1.25rem, env(safe-area-inset-top, 1.25rem))",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                className="native-toolbar-button shrink-0 px-0"
                aria-label="Close ingredient search"
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
                  ref={inputRef}
                  type="text"
                  name="ingredient-search-query"
                  placeholder="Search foods…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="app-input h-11 w-full bg-muted pr-10 pl-8 text-[15px] outline-none placeholder:text-muted-foreground"
                  aria-label="Search foods"
                />
                {query.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("")
                      setDebouncedQuery("")
                      setSearchState("idle")
                    }}
                    className="absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors active:bg-muted"
                    aria-label="Clear search"
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
                <div className="pt-8">
                  <h2 className="text-[19px] font-semibold">
                    Find an ingredient
                  </h2>
                  <p className="mt-1 max-w-md text-[14px] leading-5 text-muted-foreground">
                    Search by food or brand. You can adjust the amount after
                    adding it to the recipe.
                  </p>
                </div>
              )}

              {searchState === "error" && (
                <div className="border-y border-border py-6 text-center">
                  <Warning size={24} className="mx-auto text-destructive" />
                  <p className="mt-2 text-[15px] font-semibold">
                    Ingredient search failed
                  </p>
                  <p className="mt-1 text-[14px] text-muted-foreground">
                    Check your connection and change the search to try again.
                  </p>
                </div>
              )}

              {showEmpty && (
                <div className="border-y border-border py-6 text-center">
                  <p className="text-[15px] font-semibold">
                    No ingredients found for “{query}”
                  </p>
                  <p className="mt-1 text-[14px] text-muted-foreground">
                    Try a shorter or more general food name.
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
                      return (
                        <div
                          key={item.id}
                          className="flex min-h-[4.75rem] w-full items-center gap-3 text-left transition-colors active:bg-muted/30 md:border-b md:border-border md:odd:border-r"
                        >
                          <button
                            type="button"
                            onClick={() => setDetailItem(item)}
                            className="flex min-h-[4.75rem] min-w-0 flex-1 items-center px-1 text-left"
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
                                {Math.round(Number(item.calories))} kcal ·
                                Protein {Math.round(Number(item.protein))} g ·
                                Carbs {Math.round(Number(item.carbs))} g · Fat{" "}
                                {Math.round(Number(item.fat))} g
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!isAdded) handleAdd(item)
                            }}
                            disabled={isAdded}
                            aria-label={
                              isAdded
                                ? `${item.name} added`
                                : `Add ${item.name}`
                            }
                            className="mr-1 flex min-h-11 shrink-0 items-center justify-center px-3 text-[14px] font-semibold text-[var(--accent-food)] disabled:opacity-60"
                          >
                            {isAdded ? <span>Added</span> : <span>Add</span>}
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
      </div>

      {detailItem && (
        <FoodDetailSheet
          item={detailItem}
          added={added?.itemId === detailItem.id}
          showMealPicker={false}
          actionLabel={(_, _mealLabel, portion) =>
            `Add ${foodPortionLabel(portion)} to recipe`
          }
          addedLabel={() => "✓ Added to recipe"}
          onAdd={(_item, grams, micros, _meal, detail, portion) => {
            handleAdd(detailItem, grams, micros, detail ?? detailItem, portion)
          }}
          onClose={() => setDetailItem(null)}
        />
      )}
    </>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

import {
  RecipeEmptyState as EmptyState,
  RecipeMetadataField as MetadataField,
  RecipeMicrosPanel as MicrosPanel,
  RecipeSummary,
} from "@repo/ui"

export default function NewRecipe() {
  const navigate = useSmoothNavigate()
  const { id } = useParams<{ id?: string }>()
  const location = useLocation()
  const routeState = (location.state as RecipeRouteState | null) ?? null
  const draftRecipe = !id ? (routeState?.draftRecipe ?? null) : null
  const editLogTarget = routeState?.replaceFoodLogEntry ?? null
  const draftInitialized = useRef(false)

  const recipesQuery = useQuery(api.logs.recipes.list, {})
  const targetFoodLogs = useQuery(
    api.logs.foodLogs.getDay,
    editLogTarget ? { date: editLogTarget.date } : "skip"
  )
  const saveRecipeMutation = useOfflineMutation(
    api.logs.recipes.save,
    "logs.recipes.save"
  )
  const generateUploadUrl = useMutation(api.logs.recipes.generateUploadUrl)
  const setFoodDay = useOfflineMutation(
    api.logs.foodLogs.setDay,
    "logs.foodLogs.setDay"
  )

  const initial =
    id && recipesQuery
      ? recipesQuery.find((r) => String(r._id) === id)
      : undefined

  const [name, setName] = useState("")
  const [recipeType, setRecipeType] = useState<RecipeType>("quick")
  const [description, setDescription] = useState("")
  const [servings, setServings] = useState("")
  const [prepMinutes, setPrepMinutes] = useState("")
  const [cookMinutes, setCookMinutes] = useState("")
  const [category, setCategory] = useState("")
  const [notes, setNotes] = useState("")
  const [placeholderImage, setPlaceholderImage] = useState("")
  const [tags, setTags] = useState("")
  const [steps, setSteps] = useState<string[]>([""])
  const [photos, setPhotos] = useState<DraftPhoto[]>([])
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showMicros, setShowMicros] = useState(false)
  const savingRef = useRef(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (initial) {
      setName(initial.name)
      setRecipeType(initial.recipeType ?? "quick")
      setDescription(initial.description ?? "")
      setServings(initial.servings ? String(initial.servings) : "")
      setPrepMinutes(initial.prepMinutes ? String(initial.prepMinutes) : "")
      setCookMinutes(initial.cookMinutes ? String(initial.cookMinutes) : "")
      setCategory(initial.category ?? "")
      setNotes(initial.notes ?? "")
      setPlaceholderImage(initial.placeholderImage ?? "")
      setTags(initial.tags?.join(", ") ?? "")
      setSteps(initial.steps?.length ? initial.steps : [""])
      const storedPhotos: DraftPhoto[] = (initial.photoStorageIds ?? [])
        .map((storageId, index) => ({
          id: String(storageId),
          storageId,
          url: initial.photoUrls?.[index] ?? "",
        }))
        .filter((photo) => Boolean(photo.url))
      setPhotos(
        storedPhotos.length === 0 && initial.placeholderImage
          ? [
              {
                id: "coach-placeholder",
                url: COACH_RECIPE_PLACEHOLDER,
                placeholder: true,
              },
            ]
          : storedPhotos
      )
      setIngredients(normalizeRecipeIngredients(initial.ingredients))
      draftInitialized.current = true
      return
    }

    if (!id && draftRecipe && !draftInitialized.current) {
      setName(draftRecipe.name ?? "")
      setIngredients(normalizeRecipeIngredients(draftRecipe.ingredients))
      draftInitialized.current = true
    }
  }, [draftRecipe, id, initial])

  const totals = recipeTotals(ingredients)
  const totalCal = totals.calories || 1
  const microTotals = useMemo(() => recipeMicros(ingredients), [ingredients])
  const targetEntries = (targetFoodLogs ?? []) as FoodLogEntry[]

  async function handleSave() {
    if (savingRef.current || saved || !canSave) return
    savingRef.current = true
    setSaving(true)
    setSaved(true)
    try {
      const recipeName = name.trim() || "My Recipe"
      const cleanedIngredients = stripUndefined(ingredients)
      const photoStorageIds = await Promise.all(
        photos
          .filter((photo) => !photo.placeholder)
          .map(async (photo) => {
            if (photo.storageId) return photo.storageId
            if (!photo.file) throw new Error("Photo file is unavailable")
            const uploadUrl = await generateUploadUrl({})
            const response = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": photo.file.type || "image/jpeg" },
              body: photo.file,
            })
            if (!response.ok) throw new Error("Photo upload failed")
            const result = (await response.json()) as {
              storageId: Id<"_storage">
            }
            return result.storageId
          })
      )
      const savedRecipeId = await saveRecipeMutation({
        id: id as Id<"recipes"> | undefined,
        name: recipeName,
        recipeType,
        description: description.trim() || undefined,
        servings: positiveNumber(servings),
        prepMinutes: positiveNumber(prepMinutes),
        cookMinutes: positiveNumber(cookMinutes),
        category: category.trim() || undefined,
        notes: notes.trim() || undefined,
        placeholderImage,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        steps:
          recipeType === "detailed"
            ? steps.map((step) => step.trim()).filter(Boolean)
            : undefined,
        photoStorageIds,
        ingredients: cleanedIngredients,
      })
      const nextRecipeId =
        id ?? (typeof savedRecipeId === "string" ? savedRecipeId : undefined)

      if (editLogTarget && targetFoodLogs !== undefined) {
        const nextTotals = recipeTotals(cleanedIngredients)
        await setFoodDay({
          date: editLogTarget.date,
          entries: targetEntries.map((entry) =>
            entry.id === editLogTarget.entryId
              ? stripUndefined({
                  ...entry,
                  name: recipeName,
                  ...nextTotals,
                  recipeId: nextRecipeId,
                  recipeDraft: nextRecipeId
                    ? undefined
                    : {
                        name: recipeName,
                        ingredients: cleanedIngredients,
                      },
                })
              : entry
          ),
        })
      }

      navigate(-1)
    } catch (err) {
      console.error("Failed to save recipe:", err)
      setSaved(false)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(
      0,
      6 - photos.length
    )
    if (!files.length) return
    setPlaceholderImage("")
    setPhotos((current) => [
      ...current.filter((photo) => !photo.placeholder),
      ...files.map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ])
    event.target.value = ""
  }

  function addIngredient(
    item: FoodResult,
    grams: number,
    micros: LogMicros = {},
    detail?: FoodDetail | null,
    portion?: FoodPortion
  ) {
    const r = (v: number) => Math.round(v * 10) / 10
    const selectedPortion =
      portion ??
      defaultFoodPortion(detail?.servingLabel ?? item.serving, item.name, grams)
    setIngredients((prev) => [
      ...prev,
      stripUndefined({
        id: Math.random().toString(36).slice(2),
        name: item.name,
        grams: selectedPortion.grams,
        displayAmount: selectedPortion.amount,
        displayUnit: selectedPortion.unit,
        servingLabel: detail?.servingLabel ?? item.serving,
        caloriesPer100: Number(item.calories) || 0,
        proteinPer100: r(Number(item.protein) || 0),
        carbsPer100: r(Number(item.carbs) || 0),
        fatPer100: r(Number(item.fat) || 0),
        ...microsPer100(micros, selectedPortion.grams),
      }),
    ])
  }

  const canSave =
    ingredients.length > 0 &&
    name.trim().length > 0 &&
    (!editLogTarget || targetFoodLogs !== undefined)

  return (
    <>
      <div className="desktop-canvas flex min-h-svh flex-col bg-background">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col md:max-w-3xl">
          {/* ── Header ────────────────────────────────────────────────── */}
          <header
            className="flex items-center gap-3 px-[var(--app-page-x)] pb-4 md:px-8"
            style={{
              paddingTop: "max(1.25rem, env(safe-area-inset-top, 1.25rem))",
            }}
          >
            <button onClick={() => navigate(-1)} className="app-icon-button">
              <ArrowLeft size={15} weight="bold" />
            </button>

            <h1 className="flex-1 text-[17px] font-semibold">
              {initial ? "Edit recipe" : "New recipe"}
            </h1>

            <button
              onClick={handleSave}
              disabled={!canSave || saving || saved}
              aria-busy={saving}
              className="app-header-icon-action disabled:opacity-25 md:hidden"
              aria-label="Save recipe"
            >
              {saved ? (
                <Check
                  weight="bold"
                  style={{ color: APP_ACCENT_COLORS.complete }}
                />
              ) : (
                <Check weight="bold" />
              )}
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving || saved}
              aria-busy={saving}
              className="app-button app-button-primary hidden h-11 px-4 text-[15px] disabled:opacity-40 md:inline-flex"
            >
              {saved ? (
                <Check
                  size={12}
                  weight="bold"
                  style={{ color: APP_ACCENT_COLORS.complete }}
                />
              ) : (
                <Check size={11} weight="bold" />
              )}
              {saving ? "Saving..." : "Save"}
            </button>
          </header>

          <div className="px-[var(--app-page-x)] pb-6 md:px-8">
            <div
              className="grid grid-cols-2 rounded-2xl bg-muted/55 p-1"
              role="radiogroup"
              aria-label="Recipe detail level"
            >
              {(["quick", "detailed"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={recipeType === type}
                  onClick={() => setRecipeType(type)}
                  className={`min-h-11 rounded-xl px-3 text-[14px] font-semibold transition-all ${recipeType === type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  {type === "quick" ? "Quick recipe" : "Detailed recipe"}
                </button>
              ))}
            </div>
            <p className="mt-2 px-1 text-[12px] leading-5 text-muted-foreground">
              {recipeType === "quick"
                ? "Just the essentials. Add extra details only when they help."
                : "Build a recipe with photos, method, notes, and serving details."}
            </p>
            {!initial && (
              <button
                type="button"
                onClick={() =>
                  navigate("/coach", {
                    motion: "forward",
                    state: {
                      coachMode: "chef",
                      guidedIntent: {
                        kind: "create_recipe",
                        title: "What are you cooking?",
                        detail:
                          "Describe the ingredients, style, or nutrition target and Coach will shape it into a complete recipe.",
                        examples: [
                          "A quick dinner with chicken and rice",
                          "A vegetarian lunch with 30g protein",
                          "Use up spinach, eggs, and feta",
                        ],
                      },
                    },
                  })
                }
                className="mt-3 flex min-h-12 w-full items-center justify-between rounded-2xl border border-border bg-background px-4 text-left transition-colors active:bg-muted/35"
              >
                <span className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    <ChefHat size={17} />
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold">
                      Create with Chef Coach
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Describe what you want; Coach fills in the recipe.
                    </span>
                  </span>
                </span>
                <ArrowLeft
                  size={15}
                  className="rotate-180 text-muted-foreground"
                />
              </button>
            )}
          </div>

          <div className="px-[var(--app-page-x)] pb-6 md:px-8">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={handlePhotoSelection}
              aria-label="Add recipe photos"
            />
            {photos.length === 0 ? (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex min-h-28 w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/45"
              >
                <Camera size={21} /> Add a cover photo
              </button>
            ) : (
              <div className="flex snap-x gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className="relative h-32 min-w-[76%] snap-start overflow-hidden rounded-2xl bg-muted sm:min-w-52"
                  >
                    <img
                      src={photo.url}
                      alt={
                        index === 0
                          ? "Recipe cover"
                          : `Recipe photo ${index + 1}`
                      }
                      className="h-full w-full object-cover"
                    />
                    {index === 0 && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                        Cover
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (photo.placeholder) setPlaceholderImage("")
                        setPhotos((current) =>
                          current.filter((item) => item.id !== photo.id)
                        )
                      }}
                      className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
                      aria-label={`Remove recipe photo ${index + 1}`}
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                ))}
                {photos.length < 6 && (
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="grid h-32 min-w-24 place-items-center rounded-2xl border border-dashed border-border text-muted-foreground"
                    aria-label="Add another recipe photo"
                  >
                    <Plus size={20} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Recipe name ─────────────────────────────────────────────── */}
          <div className="px-[var(--app-page-x)] pb-6 md:px-8">
            <input
              type="text"
              name="recipe-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Recipe name"
              aria-label="Recipe name"
              className="app-display min-h-12 w-full bg-transparent text-[2rem] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {/* Ruler line — always visible, like a recipe card */}
            <div className="mt-3 h-px bg-border/50" />
          </div>

          <div className="space-y-4 px-[var(--app-page-x)] pb-7 md:px-8">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short description (optional)"
              aria-label="Recipe description"
              rows={2}
              className="w-full resize-none border-b border-border bg-transparent py-3 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <MetadataField
                icon={<Clock size={16} />}
                label="Prep time"
                value={prepMinutes}
                onChange={setPrepMinutes}
                suffix="min"
                inputMode="numeric"
              />
              <MetadataField
                icon={<ForkKnife size={16} />}
                label="Cook time"
                value={cookMinutes}
                onChange={setCookMinutes}
                suffix="min"
                inputMode="numeric"
              />
              <MetadataField
                label="Servings"
                value={servings}
                onChange={setServings}
                inputMode="numeric"
              />
              <MetadataField
                label="Category"
                value={category}
                onChange={setCategory}
                placeholder="Dinner"
              />
            </div>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="Tags, separated by commas (optional)"
              aria-label="Recipe tags"
              className="min-h-12 w-full border-b border-border bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
            />
          </div>

          {ingredients.length > 0 && (
            <RecipeSummary
              totals={totals}
              ingredientCount={ingredients.length}
              microCount={microTotals.length}
            />
          )}

          {/* ── Ingredient list ─────────────────────────────────────────── */}
          <div
            className="flex-1 overflow-y-auto px-[var(--app-page-x)] md:px-8 [&::-webkit-scrollbar]:hidden"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
            }}
          >
            {ingredients.length === 0 ? (
              <EmptyState onAdd={() => setSearchOpen(true)} />
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="native-section-title">Ingredients</h2>
                  <span className="text-[13px] text-muted-foreground">
                    {ingredients.length} item
                    {ingredients.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="divide-y divide-border border-y border-border">
                  {ingredients.map((ing, idx) => {
                    const ingCal = Math.round(
                      (ing.caloriesPer100 * ing.grams) / 100
                    )
                    const share = Math.round((ingCal / totalCal) * 100)
                    return (
                      <IngredientCard
                        key={ing.id}
                        ingredient={ing}
                        index={idx}
                        calShare={share}
                        onPortionChange={(portion) =>
                          setIngredients((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    grams: portion.grams,
                                    displayAmount: portion.amount,
                                    displayUnit: portion.unit,
                                  }
                                : x
                            )
                          )
                        }
                        onDelete={() =>
                          setIngredients((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                      />
                    )
                  })}
                </div>

                {/* Add ingredient button */}
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 text-[15px] font-semibold text-[var(--accent-food)] transition-colors active:bg-muted/25"
                >
                  <Plus size={16} className="text-muted-foreground" />
                  Add ingredient
                </button>

                <MicrosPanel
                  micros={microTotals}
                  open={showMicros}
                  onToggle={() => setShowMicros((value) => !value)}
                />

                {recipeType === "detailed" && (
                  <section
                    className="mt-8 border-t border-border pt-6"
                    aria-labelledby="recipe-method-title"
                  >
                    <div className="flex items-center gap-2">
                      <NotePencil size={19} className="text-muted-foreground" />
                      <h2
                        id="recipe-method-title"
                        className="native-section-title"
                      >
                        Cooking instructions
                      </h2>
                    </div>
                    <div className="mt-4 space-y-3">
                      {steps.map((step, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <span className="mt-3 grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                            {index + 1}
                          </span>
                          <textarea
                            value={step}
                            onChange={(event) =>
                              setSteps((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? event.target.value
                                    : item
                                )
                              )
                            }
                            placeholder={
                              index === 0
                                ? "Describe the first step…"
                                : "Next step…"
                            }
                            aria-label={`Cooking instruction ${index + 1}`}
                            rows={2}
                            className="min-h-14 flex-1 resize-none border-b border-border bg-transparent py-2 text-[14px] leading-5 outline-none placeholder:text-muted-foreground"
                          />
                          {steps.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setSteps((current) =>
                                  current.filter(
                                    (_, itemIndex) => itemIndex !== index
                                  )
                                )
                              }
                              className="app-icon-button mt-1"
                              aria-label={`Remove cooking instruction ${index + 1}`}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSteps((current) => [...current, ""])}
                      className="mt-3 flex min-h-11 items-center gap-2 px-1 text-[14px] font-semibold text-[var(--accent-food)]"
                    >
                      <Plus size={15} /> Add step
                    </button>

                    <label className="mt-6 block">
                      <span className="text-[12px] font-semibold text-muted-foreground">
                        Notes
                      </span>
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Substitutions, serving ideas, storage notes…"
                        aria-label="Recipe notes"
                        rows={3}
                        className="mt-2 w-full resize-none rounded-2xl border border-border bg-muted/20 p-4 text-[14px] leading-6 outline-none placeholder:text-muted-foreground focus:border-foreground/30"
                      />
                    </label>
                  </section>
                )}

                {/* Save button at bottom */}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave || saving || saved}
                  aria-busy={saving}
                  className="native-primary-button mt-5 w-full"
                >
                  {saving
                    ? "Saving..."
                    : saved
                      ? "Saved ✓"
                      : initial
                        ? "Save Changes"
                        : "Save Recipe"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <SearchOverlay
          onAdd={addIngredient}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </>
  )
}
