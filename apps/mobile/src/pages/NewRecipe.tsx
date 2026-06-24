import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import {
  ArrowLeft,
  CaretDown,
  Check,
  Fire,
  MagnifyingGlass,
  Minus,
  Plus,
  Warning,
  X,
} from "@phosphor-icons/react"
import { FoodDetailSheet } from "@/components/food-detail-sheet"
import { searchFoods } from "@/lib/openfoodfacts"
import {
  FOOD_PORTION_UNITS,
  amountFromFoodPortionGrams,
  defaultFoodPortion,
  foodPortionLabel,
  gramsFromFoodPortion,
  stripUndefined,
  type FoodPortion,
  type FoodPortionUnit,
  type LogMicros,
  type RecipeIngredient,
} from "@/lib/food-log"
import { useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import type { FoodDetail, FoodResult } from "@repo/models"

type SearchState = "idle" | "loading" | "done" | "error"
type AddedState = { itemId: string }
type FoodSearchItem = Awaited<ReturnType<typeof searchFoods>>[number]
type StoredRecipeIngredient = Omit<RecipeIngredient, "displayUnit"> & {
  displayUnit?: string
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

function dominantMacroColor(ing: RecipeIngredient) {
  const cP = ((ing.proteinPer100 * ing.grams) / 100) * 4
  const cC = ((ing.carbsPer100 * ing.grams) / 100) * 4
  const cF = ((ing.fatPer100 * ing.grams) / 100) * 9
  const max = Math.max(cP, cC, cF)
  if (max === 0) return "#94a3b8"
  if (max === cP) return "#60a5fa"
  if (max === cC) return "#a78bfa"
  return "#fb923c"
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
    color: "#22c55e",
  },
  {
    key: "sugar",
    per100Key: "sugarPer100",
    label: "Sugar",
    unit: "g",
    color: "#f59e0b",
  },
  {
    key: "saturatedFat",
    per100Key: "saturatedFatPer100",
    label: "Sat. fat",
    unit: "g",
    color: "#fb7185",
  },
  {
    key: "transFat",
    per100Key: "transFatPer100",
    label: "Trans fat",
    unit: "g",
    color: "#f43f5e",
  },
  {
    key: "cholesterol",
    per100Key: "cholesterolPer100",
    label: "Cholesterol",
    unit: "mg",
    color: "#f97316",
  },
  {
    key: "sodium",
    per100Key: "sodiumPer100",
    label: "Sodium",
    unit: "mg",
    color: "#38bdf8",
  },
  {
    key: "potassium",
    per100Key: "potassiumPer100",
    label: "Potassium",
    unit: "mg",
    color: "#34d399",
  },
  {
    key: "calcium",
    per100Key: "calciumPer100",
    label: "Calcium",
    unit: "mg",
    color: "#60a5fa",
  },
  {
    key: "iron",
    per100Key: "ironPer100",
    label: "Iron",
    unit: "mg",
    color: "#a78bfa",
  },
  {
    key: "magnesium",
    per100Key: "magnesiumPer100",
    label: "Magnesium",
    unit: "mg",
    color: "#2dd4bf",
  },
  {
    key: "phosphorus",
    per100Key: "phosphorusPer100",
    label: "Phosphorus",
    unit: "mg",
    color: "#818cf8",
  },
  {
    key: "zinc",
    per100Key: "zincPer100",
    label: "Zinc",
    unit: "mg",
    color: "#eab308",
  },
  {
    key: "vitaminC",
    per100Key: "vitaminCPer100",
    label: "Vitamin C",
    unit: "mg",
    color: "#facc15",
  },
  {
    key: "vitaminA",
    per100Key: "vitaminAPer100",
    label: "Vitamin A",
    unit: "mcg",
    color: "#fb923c",
  },
  {
    key: "vitaminD",
    per100Key: "vitaminDPer100",
    label: "Vitamin D",
    unit: "mcg",
    color: "#fbbf24",
  },
  {
    key: "vitaminB12",
    per100Key: "vitaminB12Per100",
    label: "Vitamin B12",
    unit: "mcg",
    color: "#c084fc",
  },
  {
    key: "caffeine",
    per100Key: "caffeinePer100",
    label: "Caffeine",
    unit: "mg",
    color: "#94a3b8",
  },
  {
    key: "alcohol",
    per100Key: "alcoholPer100",
    label: "Alcohol",
    unit: "g",
    color: "#f87171",
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

// ─── Macro ring ───────────────────────────────────────────────────────────────

const RING_R = 46
const RING_SW = 9
const RING_CX = 56
const RING_CIRC = 2 * Math.PI * RING_R
const RING_GAP = 3.5

const MACRO_ARCS = [
  { key: "protein" as const, color: "#60a5fa", kcalPerG: 4 },
  { key: "carbs" as const, color: "#a78bfa", kcalPerG: 4 },
  { key: "fat" as const, color: "#fb923c", kcalPerG: 9 },
]

function MacroRing({
  totals,
}: {
  totals: { calories: number; protein: number; carbs: number; fat: number }
}) {
  const [drawn, setDrawn] = useState(false)

  const cP = totals.protein * 4
  const cC = totals.carbs * 4
  const cF = totals.fat * 9
  const total = cP + cC + cF || 1
  const fracs = [cP / total, cC / total, cF / total]

  // recalculate arcs whenever totals change
  let cursor = -RING_CIRC / 4
  const arcs = fracs.map((f, i) => {
    const len = Math.max(f * RING_CIRC - RING_GAP, 0)
    const offset = -cursor
    cursor += f * RING_CIRC
    return { color: MACRO_ARCS[i].color, len, offset }
  })

  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // re-trigger draw on ingredient change
  useEffect(() => {
    setDrawn(false)
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [totals.protein, totals.carbs, totals.fat])

  return (
    <div
      className="relative shrink-0"
      style={{ width: RING_CX * 2, height: RING_CX * 2 }}
    >
      <svg
        width={RING_CX * 2}
        height={RING_CX * 2}
        viewBox={`0 0 ${RING_CX * 2} ${RING_CX * 2}`}
      >
        {/* Track */}
        <circle
          cx={RING_CX}
          cy={RING_CX}
          r={RING_R}
          fill="none"
          strokeWidth={RING_SW}
          stroke="currentColor"
          className="text-foreground/[0.06]"
        />
        {/* Arcs */}
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={RING_CX}
            cy={RING_CX}
            r={RING_R}
            fill="none"
            strokeWidth={RING_SW}
            strokeLinecap="butt"
            stroke={a.color}
            strokeDasharray={`${drawn ? a.len : 0} ${RING_CIRC}`}
            strokeDashoffset={a.offset}
            style={{
              transition: drawn
                ? `stroke-dasharray 600ms cubic-bezier(0.4,0,0.2,1) ${i * 80}ms`
                : "none",
            }}
          />
        ))}
      </svg>
      {/* Centre label */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] leading-none font-bold tabular-nums">
          {totals.calories}
        </span>
        <span className="mt-0.5 text-[8px] font-semibold tracking-[0.15em] text-muted-foreground/40 uppercase">
          kcal
        </span>
      </div>
    </div>
  )
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
    <div className="overflow-hidden rounded-xl border border-border/45 bg-card/90">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tabular-nums"
          style={{ backgroundColor: `${accent}20`, color: accent }}
        >
          {String(index + 1).padStart(2, "0")}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] leading-snug font-semibold">
                {ingredient.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <MacroPill label="P" value={protein} color="#60a5fa" />
                <MacroPill label="C" value={carbs} color="#a78bfa" />
                <MacroPill label="F" value={fat} color="#f59e0b" />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[13px] font-bold text-foreground/70 tabular-nums">
                {cals}
              </span>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onDelete}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors active:bg-muted/60 active:text-destructive/70"
              >
                <X size={11} weight="bold" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <div
              className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${calShare}%`,
                  backgroundColor: accent,
                  opacity: 0.75,
                }}
              />
            </div>
            <span className="w-9 text-right text-[10px] text-muted-foreground/35 tabular-nums">
              {calShare}%
            </span>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                step(-1)
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/45 text-muted-foreground/55 transition-all active:scale-95 active:bg-muted"
            >
              <Minus size={11} weight="bold" />
            </button>

            {editing ? (
              <input
                ref={inputRef}
                type="text"
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
                className="h-8 w-20 rounded-lg bg-muted/60 px-1.5 text-center text-[12px] font-semibold tabular-nums outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setInputVal(String(amount))
                  setEditing(true)
                }}
                className="h-8 min-w-[64px] rounded-lg bg-muted/50 px-2.5 text-center text-[12px] font-semibold text-muted-foreground/75 tabular-nums transition-colors active:bg-muted"
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
              className="h-8 rounded-lg bg-muted/50 px-2 text-[11px] font-semibold text-muted-foreground/75 outline-none"
            >
              {FOOD_PORTION_UNITS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              onPointerDown={(e) => {
                e.preventDefault()
                step(1)
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/45 text-muted-foreground/55 transition-all active:scale-95 active:bg-muted"
            >
              <Plus size={11} weight="bold" />
            </button>
            <span className="ml-auto hidden text-[10px] text-muted-foreground/30 tabular-nums sm:inline">
              {Math.round(ingredient.grams)} g
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="py-10">
      <button
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-card/45 px-5 py-8 text-[14px] font-semibold text-foreground/65 transition-colors active:bg-muted/30"
      >
        <Plus size={16} weight="bold" />
        Add ingredient
      </button>
    </div>
  )
}

function RecipeSummary({
  totals,
  ingredientCount,
  microCount,
}: {
  totals: { calories: number; protein: number; carbs: number; fat: number }
  ingredientCount: number
  microCount: number
}) {
  const maxMacro = Math.max(totals.protein, totals.carbs, totals.fat, 1)

  return (
    <div className="mx-4 mb-4 rounded-xl border border-border/45 bg-card/75 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative -m-3 scale-75">
          <MacroRing totals={totals} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
                Recipe total
              </p>
              <p className="text-[11px] text-muted-foreground/35">
                {ingredientCount} ingredient{ingredientCount !== 1 ? "s" : ""}
                {microCount > 0 ? ` · ${microCount} micros` : ""}
              </p>
            </div>
            <span className="text-[24px] leading-none font-black tabular-nums">
              {totals.calories}
              <span className="ml-1 text-[10px] font-semibold text-muted-foreground/35">
                kcal
              </span>
            </span>
          </div>

          {[
            { key: "protein" as const, label: "P", color: "#60a5fa" },
            { key: "carbs" as const, label: "C", color: "#a78bfa" },
            { key: "fat" as const, label: "F", color: "#fb923c" },
          ].map(({ key, label, color }) => {
            const value = totals[key]
            return (
              <div key={key} className="mb-1.5 last:mb-0">
                <div className="flex items-center gap-2">
                  <span className="w-3 text-[10px] font-bold" style={{ color }}>
                    {label}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (value / maxMacro) * 100)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-[11px] font-semibold text-muted-foreground/55 tabular-nums">
                    {value}g
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MicrosPanel({
  micros,
  open,
  onToggle,
}: {
  micros: ReturnType<typeof recipeMicros>
  open: boolean
  onToggle: () => void
}) {
  if (micros.length === 0) return null

  const shown = open ? micros : micros.slice(0, 4)

  return (
    <div className="mt-3 rounded-xl border border-border/45 bg-card/60">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3.5 py-3 text-left transition-colors active:bg-muted/30"
      >
        <div>
          <p className="text-[12px] font-bold text-foreground/75">Micros</p>
          <p className="text-[10.5px] text-muted-foreground/35">
            {micros.length} tracked nutrient{micros.length !== 1 ? "s" : ""}
          </p>
        </div>
        <CaretDown
          size={14}
          weight="bold"
          className="text-muted-foreground/40 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      <div className="grid grid-cols-2 gap-2 px-3.5 pb-3 md:grid-cols-4">
        {shown.map((item) => (
          <div key={item.key} className="rounded-lg bg-muted/35 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-[10.5px] font-medium text-muted-foreground/55">
                {item.label}
              </span>
            </div>
            <p className="text-[13px] font-bold tabular-nums">
              {item.value}
              <span className="ml-0.5 text-[10px] font-medium text-muted-foreground/35">
                {item.unit}
              </span>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Search overlay ───────────────────────────────────────────────────────────

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
              className="flex items-center gap-3 px-4 pb-3"
              style={{
                paddingTop: "max(1.25rem, env(safe-area-inset-top, 1.25rem))",
              }}
            >
              <button
                onClick={onClose}
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
                  <div className="divide-y divide-border/30 md:grid md:grid-cols-2 md:gap-3 md:divide-y-0">
                    {results.map((item) => {
                      const isAdded = added?.itemId === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => setDetailItem(item)}
                          className="flex w-full items-center gap-3 py-3 text-left transition-colors active:bg-muted/30 md:rounded-2xl md:border md:border-border/50 md:bg-card md:px-3 md:shadow-sm"
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
                              if (!isAdded) handleAdd(item)
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
          onAdd={(item, grams, micros, _meal, detail, portion) => {
            handleAdd(item, grams, micros, detail, portion)
          }}
          onClose={() => setDetailItem(null)}
        />
      )}
    </>
  )
}

function CalorieBadge({ calories }: { calories: number }) {
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-muted/60 text-center">
      <div className="flex items-center gap-0.5 text-orange-400/80">
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

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function NewRecipe() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()

  const recipesQuery = useQuery(api.logs.recipes.list, {})
  const saveRecipeMutation = useOfflineMutation(
    api.logs.recipes.save,
    "logs.recipes.save"
  )

  const initial =
    id && recipesQuery
      ? recipesQuery.find((r) => String(r._id) === id)
      : undefined

  const [name, setName] = useState("")
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showMicros, setShowMicros] = useState(false)

  useEffect(() => {
    if (initial) {
      setName(initial.name)
      setIngredients(normalizeRecipeIngredients(initial.ingredients))
    }
  }, [initial])

  const totals = recipeTotals(ingredients)
  const totalCal = totals.calories || 1
  const microTotals = useMemo(() => recipeMicros(ingredients), [ingredients])

  async function handleSave() {
    setSaved(true)
    try {
      await saveRecipeMutation({
        id: id as Id<"recipes"> | undefined,
        name: name.trim() || "My Recipe",
        ingredients: stripUndefined(ingredients),
      })
      navigate(-1)
    } catch (err) {
      console.error("Failed to save recipe:", err)
      setSaved(false)
    }
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
    setSearchOpen(false)
  }

  const canSave = ingredients.length > 0 && name.trim().length > 0

  return (
    <>
      <div className="desktop-canvas flex min-h-svh flex-col bg-background">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col md:max-w-3xl">
          {/* ── Header ────────────────────────────────────────────────── */}
          <header
            className="flex items-center gap-3 px-4 pb-4"
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

            <p className="flex-1 text-[10px] font-semibold tracking-[0.22em] text-muted-foreground/40 uppercase">
              {initial ? "Edit Recipe" : "New Recipe"}
            </p>

            <button
              onClick={handleSave}
              disabled={!canSave || saved}
              className="flex h-8 items-center gap-1.5 rounded-full bg-foreground px-4 text-[12px] font-semibold text-background transition-all active:scale-95 active:opacity-75 disabled:opacity-25"
            >
              {saved ? (
                <Check size={12} weight="bold" className="text-green-400" />
              ) : (
                <Check size={11} weight="bold" />
              )}
              Save
            </button>
          </header>

          {/* ── Recipe name ─────────────────────────────────────────────── */}
          <div className="px-5 pb-5">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Untitled Recipe"
              className="w-full bg-transparent text-[2rem] leading-[1.12] font-bold tracking-[-0.025em] text-foreground outline-none placeholder:text-foreground/18"
            />
            {/* Ruler line — always visible, like a recipe card */}
            <div className="mt-3 h-px bg-border/50" />
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
            className="flex-1 overflow-y-auto px-4 [&::-webkit-scrollbar]:hidden"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
            }}
          >
            {ingredients.length === 0 ? (
              <EmptyState onAdd={() => setSearchOpen(true)} />
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground/35 uppercase">
                    Ingredients
                  </span>
                  <span className="text-[10px] text-muted-foreground/30">
                    {ingredients.length} item
                    {ingredients.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
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
                  onClick={() => setSearchOpen(true)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-3.5 text-[13px] font-semibold text-muted-foreground/55 transition-colors active:bg-muted/25"
                >
                  <Plus size={13} className="text-muted-foreground/35" />
                  Add ingredient
                </button>

                <MicrosPanel
                  micros={microTotals}
                  open={showMicros}
                  onToggle={() => setShowMicros((value) => !value)}
                />

                <div className="mt-4 flex items-center justify-between px-1">
                  <span className="text-[10px] text-muted-foreground/30">
                    {ingredients.length} ingredient
                    {ingredients.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] text-muted-foreground/30 tabular-nums">
                      P{totals.protein} C{totals.carbs} F{totals.fat}g
                    </span>
                    <span className="text-[13px] font-bold text-foreground/60 tabular-nums">
                      {totals.calories}
                      <span className="ml-0.5 text-[9.5px] font-normal text-muted-foreground/35">
                        kcal
                      </span>
                    </span>
                  </div>
                </div>

                {/* Save button at bottom */}
                <button
                  onClick={handleSave}
                  disabled={!canSave || saved}
                  className="mt-4 w-full rounded-xl bg-foreground py-4 text-[14px] font-semibold text-background transition-all active:scale-[0.98] active:opacity-75 disabled:opacity-25"
                >
                  {saved ? "Saved ✓" : initial ? "Save Changes" : "Save Recipe"}
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
