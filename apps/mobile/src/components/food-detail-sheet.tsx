import { useEffect, useRef, useState } from "react"
import { CaretDown, Check, Minus, Plus, X } from "@phosphor-icons/react"
import { MobileSheet } from "./mobile-sheet"
import {
  FOOD_PORTION_UNITS,
  amountFromFoodPortionGrams,
  defaultMeal,
  defaultFoodPortion,
  foodPortionLabel,
  foodPortionUnitLabel,
  gramsFromFoodPortion,
  readAllMealCategories,
  addMealCategory,
  removeMealCategory,
  type FoodPortion,
  type FoodPortionUnit,
  type MealCategory,
  type LogMicros,
} from "@/lib/food-log"
import type { FoodResult, FoodDetail } from "@repo/models"
import { getFoodDetail } from "@/lib/openfoodfacts"

type Detail = FoodDetail | null | undefined

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Scale a per-100g value to the selected gram amount, rounded sensibly. */
function scale(per100g: number, grams: number): number {
  const v = (per100g * grams) / 100
  if (v >= 10) return Math.round(v)
  if (v >= 1) return Math.round(v * 10) / 10
  return Math.round(v * 100) / 100
}

const MICRO_TARGET_UNITS: Partial<Record<keyof LogMicros, "g" | "mg" | "mcg">> =
  {
    fiber: "g",
    sugar: "g",
    saturatedFat: "g",
    transFat: "g",
    cholesterol: "mg",
    sodium: "mg",
    potassium: "mg",
    calcium: "mg",
    iron: "mg",
    magnesium: "mg",
    phosphorus: "mg",
    zinc: "mg",
    vitaminC: "mg",
    vitaminA: "mcg",
    vitaminD: "mcg",
    vitaminB12: "mcg",
    caffeine: "mg",
    alcohol: "g",
  }

function normalizeMass(
  value: number,
  fromUnit: string,
  toUnit: "g" | "mg" | "mcg"
) {
  const normalized = fromUnit.toLowerCase().replace("µ", "u").trim()
  const inMg =
    normalized === "g"
      ? value * 1000
      : normalized === "ug" || normalized === "mcg"
        ? value / 1000
        : value

  if (toUnit === "g") return inMg / 1000
  if (toUnit === "mcg") return inMg * 1000
  return inMg
}

function roundMicro(value: number) {
  if (value >= 100) return Math.round(value)
  if (value >= 10) return Math.round(value * 10) / 10
  return Math.round(value * 100) / 100
}

/** Extract scaled micronutrients from the detail response for a given gram amount. */
function extractMicros(detail: Detail, grams: number): LogMicros {
  if (!detail) return {}
  const all = [...(detail.nutrients ?? []), ...(detail.extraNutrients ?? [])]
  const get = (
    sourceKey: string,
    targetKey: keyof LogMicros
  ): number | undefined => {
    const n = all.find((n) => n.key === sourceKey)
    if (!n) return undefined
    const targetUnit = MICRO_TARGET_UNITS[targetKey]
    const scaled = scale(n.per100g, grams)
    const v = targetUnit
      ? roundMicro(normalizeMass(scaled, n.unit, targetUnit))
      : scaled
    return v > 0 ? v : undefined
  }
  return {
    fiber: get("fiber", "fiber"),
    sugar: get("sugar", "sugar"),
    saturatedFat: get("satFat", "saturatedFat"),
    transFat: get("trans-fat", "transFat"),
    cholesterol: get("cholesterol", "cholesterol"),
    sodium: get("sodium", "sodium"),
    potassium: get("potassium", "potassium"),
    calcium: get("calcium", "calcium"),
    iron: get("iron", "iron"),
    magnesium: get("magnesium", "magnesium"),
    phosphorus: get("phosphorus", "phosphorus"),
    zinc: get("zinc", "zinc"),
    vitaminC: get("vitaminC", "vitaminC"),
    vitaminA: get("vitamin-a", "vitaminA"),
    vitaminD: get("vitamin-d", "vitaminD"),
    vitaminB12: get("vitamin-b12", "vitaminB12"),
    caffeine: get("caffeine", "caffeine"),
    alcohol: get("alcohol", "alcohol"),
  }
}

const MACRO_CFG = [
  { key: "proteins", label: "Protein", color: "#60a5fa", kcalPerG: 4 },
  { key: "carbohydrates", label: "Carbs", color: "#a78bfa", kcalPerG: 4 },
  { key: "fat", label: "Fat", color: "#fb923c", kcalPerG: 9 },
]

// ─── Donut ────────────────────────────────────────────────────────────────────

const R = 48
const SW = 9
const CX = 60
const CIRC = 2 * Math.PI * R
const GAP = 3.5

function DonutRing({
  protein,
  carbs,
  fat,
  calories,
}: {
  protein: number
  carbs: number
  fat: number
  calories: number
}) {
  const [drawn, setDrawn] = useState(false)
  const fracs = (() => {
    const cP = protein * 4,
      cC = carbs * 4,
      cF = fat * 9
    const total = cP + cC + cF || 1
    return [cP / total, cC / total, cF / total]
  })()
  const COLORS = MACRO_CFG.map((m) => m.color)

  let cursor = -CIRC / 4
  const arcs = fracs.map((f, i) => {
    const len = Math.max(f * CIRC - GAP, 0)
    const offset = -cursor
    cursor += f * CIRC
    return { color: COLORS[i], len, offset }
  })

  useEffect(() => {
    requestAnimationFrame(() => setDrawn(true))
  }, [])

  return (
    <div
      className="relative shrink-0"
      style={{ width: CX * 2, height: CX * 2 }}
    >
      <svg width={CX * 2} height={CX * 2} viewBox={`0 0 ${CX * 2} ${CX * 2}`}>
        <circle
          cx={CX}
          cy={CX}
          r={R}
          fill="none"
          strokeWidth={SW}
          stroke="currentColor"
          className="text-foreground/[0.06]"
        />
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={CX}
            cy={CX}
            r={R}
            fill="none"
            strokeWidth={SW}
            strokeLinecap="butt"
            stroke={a.color}
            strokeDasharray={`${drawn ? a.len : 0} ${CIRC}`}
            strokeDashoffset={a.offset}
            style={{
              transition: drawn
                ? `stroke-dasharray 650ms cubic-bezier(0.4,0,0.2,1) ${i * 70}ms`
                : "none",
            }}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] leading-none font-bold tabular-nums">
          {calories}
        </span>
        <span className="mt-1 text-[9px] font-semibold tracking-[0.15em] text-muted-foreground/40 uppercase">
          kcal
        </span>
      </div>
    </div>
  )
}

// ─── Macro cards ─────────────────────────────────────────────────────────────

function MacroStack({
  protein,
  carbs,
  fat,
}: {
  protein: number
  carbs: number
  fat: number
}) {
  const vals = [protein, carbs, fat]
  const cals = vals.map((v, i) => v * MACRO_CFG[i].kcalPerG)
  const total = cals.reduce((a, b) => a + b, 0) || 1
  return (
    <div className="flex flex-1 flex-col gap-2">
      {MACRO_CFG.map((m, i) => {
        const pct = Math.round((cals[i] / total) * 100)
        return (
          <div key={m.key} className="rounded-xl bg-muted/40 px-3 py-2">
            <div className="mb-1.5 h-[3px] w-full overflow-hidden rounded-full bg-foreground/[0.07]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: m.color,
                  opacity: 0.85,
                }}
              />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[9.5px] font-medium text-muted-foreground/50">
                {m.label}
              </span>
              <span
                className="text-[13px] font-semibold tabular-nums"
                style={{ color: m.color }}
              >
                {vals[i]}
                <span className="text-[9px] font-medium text-muted-foreground/40">
                  {" "}
                  g
                </span>
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Portion picker ───────────────────────────────────────────────────────────

type Preset = {
  label: string
  grams: number
  unit?: FoodPortionUnit
  sub?: string
}

function stepFor(g: number) {
  if (g < 10) return 1
  if (g < 50) return 5
  if (g < 200) return 10
  return 25
}

function PortionPicker({
  grams,
  unit,
  onChange,
  presets,
}: {
  grams: number
  unit: FoodPortionUnit
  onChange: (g: number, unit?: FoodPortionUnit) => void
  presets: Preset[]
}) {
  const amount = amountFromFoodPortionGrams(grams, unit)
  const unitLabel = foodPortionUnitLabel(unit)
  const [inputVal, setInputVal] = useState(formatInputAmount(amount))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setInputVal(formatInputAmount(amount))
  }, [amount, focused])

  function formatInputAmount(value: number) {
    if (Math.abs(value - Math.round(value)) < 0.01)
      return String(Math.round(value))
    return String(value)
      .replace(/\.0+$/, "")
      .replace(/(\.\d*?)0+$/, "$1")
  }

  function commit(raw: string) {
    const cleaned = raw.replace(/[^\d.]/g, "")
    const n = parseFloat(cleaned)
    if (!isNaN(n) && n > 0 && n <= 9999) {
      onChange(gramsFromFoodPortion(n, unit))
    } else {
      setInputVal(formatInputAmount(amount))
    }
    setFocused(false)
  }

  function stepAmount(dir: 1 | -1) {
    const configuredStep =
      unit === "g" || unit === "ml"
        ? stepFor(grams)
        : (FOOD_PORTION_UNITS.find((option) => option.id === unit)?.step ?? 1)
    const nextAmount = Math.max(configuredStep, amount + dir * configuredStep)
    onChange(gramsFromFoodPortion(nextAmount, unit))
  }

  const secondaryHint =
    unit === "g"
      ? `${amountFromFoodPortionGrams(grams, "oz")} oz`
      : `${Math.round(grams)} g`

  return (
    <div className="mt-4 px-4">
      <div className="mb-3 flex gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
        {presets.map((p) => {
          const active = Math.abs(grams - p.grams) < 0.1
          return (
            <button
              key={`${p.label}-${p.grams}-${p.unit ?? ""}`}
              onClick={() => onChange(p.grams, p.unit)}
              className="flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition-all active:scale-95"
              style={
                active
                  ? {
                      borderColor: "var(--foreground)",
                      backgroundColor: "var(--foreground)",
                      color: "var(--background)",
                    }
                  : {
                      borderColor: "var(--border)",
                      backgroundColor: "transparent",
                      color: "var(--foreground)",
                    }
              }
            >
              <span className="text-[12px] leading-none font-semibold">
                {p.label}
              </span>
              {p.sub && (
                <span
                  className="mt-0.5 text-[9.5px] leading-none"
                  style={{ opacity: active ? 0.6 : 0.4 }}
                >
                  {p.sub}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
        {FOOD_PORTION_UNITS.map((option) => {
          const active = option.id === unit
          return (
            <button
              key={option.id}
              onClick={() => onChange(grams, option.id)}
              className="h-7 shrink-0 rounded-lg px-2.5 text-[11px] font-semibold transition-all active:scale-95"
              style={
                active
                  ? {
                      backgroundColor: "var(--foreground)",
                      color: "var(--background)",
                    }
                  : {
                      backgroundColor: "var(--muted)",
                      color: "var(--muted-foreground)",
                      opacity: 0.62,
                    }
              }
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-stretch gap-2">
        <button
          onPointerDown={(e) => {
            e.preventDefault()
            stepAmount(-1)
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground/60 transition-all active:scale-95 active:bg-muted"
        >
          <Minus size={14} weight="bold" />
        </button>

        <div className="relative flex flex-1 items-center rounded-xl bg-muted/50">
          <input
            type="text"
            inputMode="decimal"
            value={
              focused ? inputVal : `${formatInputAmount(amount)} ${unitLabel}`
            }
            onChange={(e) => setInputVal(e.target.value)}
            onFocus={() => {
              setFocused(true)
              setInputVal(formatInputAmount(amount))
            }}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="h-11 w-full bg-transparent px-3 text-center text-[17px] font-semibold tabular-nums outline-none"
          />
          <span className="pointer-events-none absolute right-3 text-[10px] text-muted-foreground/30">
            {secondaryHint}
          </span>
        </div>

        <button
          onPointerDown={(e) => {
            e.preventDefault()
            stepAmount(1)
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground/60 transition-all active:scale-95 active:bg-muted"
        >
          <Plus size={14} weight="bold" />
        </button>
      </div>
    </div>
  )
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

const NS_COLORS: Record<string, string> = {
  a: "#1e8f4e",
  b: "#85bb2f",
  c: "#fecb02",
  d: "#ee8100",
  e: "#e63e11",
}
const NOVA_COLORS = ["#1e8f4e", "#85bb2f", "#ee8100", "#e63e11"]
const NOVA_LABELS = ["Unprocessed", "Culinary", "Processed", "Ultra-proc."]

function ScoresBadges({
  nutriscoreGrade,
  novaGroup,
}: {
  nutriscoreGrade?: string
  novaGroup?: number
}) {
  if (!nutriscoreGrade && !novaGroup) return null
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 px-4">
      {nutriscoreGrade && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground/40 uppercase">
            Nutri
          </span>
          <div className="flex gap-0.5">
            {["a", "b", "c", "d", "e"].map((l) => {
              const active = l === nutriscoreGrade.toLowerCase()
              return (
                <div
                  key={l}
                  className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-[9px] font-bold text-white"
                  style={{
                    backgroundColor: NS_COLORS[l],
                    opacity: active ? 1 : 0.18,
                    transform: active ? "scale(1.12)" : "scale(1)",
                  }}
                >
                  {l.toUpperCase()}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {novaGroup && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground/40 uppercase">
            Nova
          </span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4].map((n) => {
              const active = n === novaGroup
              return (
                <div
                  key={n}
                  className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-[9px] font-bold text-white"
                  style={{
                    backgroundColor: NOVA_COLORS[n - 1],
                    opacity: active ? 1 : 0.18,
                    transform: active ? "scale(1.12)" : "scale(1)",
                  }}
                >
                  {n}
                </div>
              )
            })}
          </div>
          <span className="text-[10px] text-muted-foreground/35">
            {NOVA_LABELS[novaGroup - 1]}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Nutrition row ────────────────────────────────────────────────────────────

function NutrRow({
  label,
  value,
  unit,
  indent,
  bold,
}: {
  label: string
  value: number
  unit: string
  indent?: boolean
  bold?: boolean
}) {
  return (
    <div
      className="flex items-baseline justify-between py-[9px]"
      style={{ paddingLeft: indent ? 16 : 0 }}
    >
      <span
        className={`text-[13px] leading-none ${bold ? "font-semibold" : indent ? "text-muted-foreground/60" : ""}`}
      >
        {label}
      </span>
      <span
        className={`text-[13px] leading-none tabular-nums ${indent ? "text-muted-foreground/60" : bold ? "font-semibold" : ""}`}
      >
        {value}
        <span className="ml-[2px] text-[10px] text-muted-foreground/35">
          {unit}
        </span>
      </span>
    </div>
  )
}

// ─── Meal picker ─────────────────────────────────────────────────────────────

function MealPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  const [categories, setCategories] = useState<MealCategory[]>(() =>
    readAllMealCategories()
  )
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) setTimeout(() => inputRef.current?.focus(), 50)
  }, [adding])

  function startLongPress(id: string) {
    longPressRef.current = setTimeout(() => {
      setPendingDelete(id)
    }, 500)
  }

  function cancelLongPress() {
    if (longPressRef.current) clearTimeout(longPressRef.current)
  }

  function handleDelete(id: string) {
    removeMealCategory(id)
    const next = readAllMealCategories()
    setCategories(next)
    setPendingDelete(null)
    // If we deleted the selected one, pick the first available
    if (value === id) onChange(next[0]?.id ?? "breakfast")
  }

  function handleAdd() {
    const label = newLabel.trim()
    if (!label) {
      setAdding(false)
      return
    }
    addMealCategory(label)
    const next = readAllMealCategories()
    const created = next[next.length - 1]
    setCategories(next)
    onChange(created.id)
    setAdding(false)
    setNewLabel("")
  }

  return (
    <div
      className="px-4 pt-3"
      onClick={() => pendingDelete && setPendingDelete(null)}
    >
      <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/40 uppercase">
        Log to
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
        {categories.map((cat) => {
          const isSelected = value === cat.id
          const isDeleteTarget = pendingDelete === cat.id

          return (
            <div key={cat.id} className="relative shrink-0">
              <button
                onPointerDown={(e) => {
                  e.stopPropagation()
                  cancelLongPress()
                  if (!cat.isDefault) startLongPress(cat.id)
                }}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!isDeleteTarget) {
                    setPendingDelete(null)
                    onChange(cat.id)
                  }
                }}
                className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all active:scale-95"
                style={
                  isSelected
                    ? {
                        backgroundColor: cat.bg,
                        color: cat.color,
                        outline: `1.5px solid ${cat.color}`,
                        outlineOffset: "1px",
                      }
                    : {
                        backgroundColor: "var(--muted)",
                        color: "var(--muted-foreground)",
                        opacity: 0.6,
                      }
                }
              >
                {cat.label}
              </button>

              {/* Delete overlay — only for custom categories */}
              {isDeleteTarget && !cat.isDefault && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(cat.id)
                  }}
                  className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive shadow-sm"
                >
                  <X size={8} weight="bold" className="text-white" />
                </button>
              )}
            </div>
          )
        })}

        {/* Add new */}
        {adding ? (
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-muted/60 pr-1 pl-3">
            <input
              ref={inputRef}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd()
                if (e.key === "Escape") {
                  setAdding(false)
                  setNewLabel("")
                }
              }}
              placeholder="Name…"
              className="w-20 bg-transparent text-[11.5px] outline-none placeholder:text-muted-foreground/30"
            />
            <button
              onClick={handleAdd}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground/80 transition-opacity active:opacity-60"
            >
              <Check size={9} weight="bold" className="text-background" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/40 transition-opacity active:opacity-60"
          >
            <Plus size={12} weight="bold" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main sheet ───────────────────────────────────────────────────────────────

type Props = {
  item: FoodResult
  onClose: () => void
  onAdd: (
    item: FoodResult,
    grams: number,
    micros: LogMicros,
    meal: string,
    detail?: FoodDetail | null,
    portion?: FoodPortion
  ) => void
  added: boolean
  showMealPicker?: boolean
  actionLabel?: (
    grams: number,
    mealLabel: string,
    portion: FoodPortion
  ) => string
  addedLabel?: (mealLabel: string, portion: FoodPortion) => string
}

/**
 * Renders a mobile sheet UI for viewing food details, selecting a portion, and logging the food to a meal.
 *
 * Fetches detailed nutrition for the provided `item`, lets the user choose grams (with presets), shows macros,
 * nutrition facts and extra nutrients (expandable), lets the user pick or create a meal category, and calls the
 * provided `onAdd` callback when the user logs the food.
 *
 * @param item - The food item to display (used to fetch detail by `item.id` and as fallback macro/calorie sources).
 * @param onClose - Callback invoked to close the sheet.
 * @param onAdd - Callback invoked when the user logs the food. Called as `onAdd(item, grams, micros, meal, detail)` where
 *                `micros` is the micronutrient object scaled to the selected `grams` (empty object if no detail).
 * @param added - When true, the log button shows a confirmed "Logged" state for the currently selected meal.
 */
export function FoodDetailSheet({
  item,
  onClose,
  onAdd,
  added,
  showMealPicker = true,
  actionLabel,
  addedLabel,
}: Props) {
  const [detail, setDetail] = useState<Detail>(null)
  const [loading, setLoading] = useState(true)
  const [grams, setGrams] = useState(100)
  const [unit, setUnit] = useState<FoodPortionUnit>(
    () => defaultFoodPortion(item.serving, item.name).unit
  )
  const [showExtra, setShowExtra] = useState(false)
  const [meal, setMeal] = useState<string>(() => defaultMeal())
  const extraRef = useRef<HTMLDivElement>(null)
  const mealCfg = readAllMealCategories().find((c) => c.id === meal) ?? {
    label: meal,
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.12)",
  }

  useEffect(() => {
    setLoading(true)
    setShowExtra(false)
    getFoodDetail(item.id)
      .then((d) => {
        setDetail(d)
        const nextPortion = defaultFoodPortion(
          d?.servingLabel ?? item.serving,
          item.name,
          d?.servingGrams ?? 100
        )
        setUnit(nextPortion.unit)
        setGrams(nextPortion.grams)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [item.id, item.name, item.serving])

  useEffect(() => {
    const el = extraRef.current
    if (!el) return
    el.style.maxHeight = showExtra ? el.scrollHeight + "px" : "0px"
  }, [showExtra, detail])

  // ── Scaled values ─────────────────────────────────────────────────────────

  const nutriRow = (key: string) => detail?.nutrients.find((n) => n.key === key)

  const s = (key: string) => {
    const r = nutriRow(key)
    return r ? scale(r.per100g, grams) : 0
  }

  const calories = s("energy") || scale(Number(item.calories), grams)
  const protein = s("protein") || scale(Number(item.protein), grams)
  const carbs = s("carbs") || scale(Number(item.carbs), grams)
  const fat = s("fat") || scale(Number(item.fat), grams)
  const portion: FoodPortion = {
    amount: amountFromFoodPortionGrams(grams, unit),
    unit,
    grams,
  }

  // ── Portion presets ───────────────────────────────────────────────────────

  const presets: Preset[] = []
  const seenPresets = new Set<string>()
  const addPreset = (next: FoodPortion, label?: string, sub?: string) => {
    const key = `${Math.round(next.grams * 10) / 10}-${next.unit}`
    if (seenPresets.has(key)) return
    seenPresets.add(key)
    presets.push({
      label: label ?? foodPortionLabel(next),
      sub,
      grams: next.grams,
      unit: next.unit,
    })
  }

  const servingPortion = defaultFoodPortion(
    detail?.servingLabel ?? item.serving,
    item.name,
    detail?.servingGrams ?? 100
  )
  addPreset(servingPortion, detail?.servingLabel ?? item.serving)

  for (const next of [
    defaultFoodPortion("50 g", item.name),
    defaultFoodPortion("100 g", item.name),
    defaultFoodPortion("1 oz", item.name),
    defaultFoodPortion("100 ml", item.name),
    defaultFoodPortion("250 ml", item.name),
    defaultFoodPortion("1 cup", item.name),
    defaultFoodPortion("1 tbsp", item.name),
  ]) {
    addPreset(next)
  }

  const ctaLabel = added
    ? (addedLabel?.(mealCfg.label, portion) ?? `✓ Logged to ${mealCfg.label}`)
    : (actionLabel?.(grams, mealCfg.label, portion) ??
      `Log ${foodPortionLabel(portion)} to ${mealCfg.label}`)

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/25 backdrop-blur-[3px]"
      panelClassName="mx-auto w-[calc(100vw-1rem)] max-w-sm overflow-hidden rounded-t-[28px] bg-card shadow-[0_-20px_60px_rgba(0,0,0,0.18)] md:!w-full md:!max-w-sm"
      maxHeight="90vh"
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="px-5 pt-1 pb-3">
        <h2 className="text-[17px] leading-snug font-semibold tracking-[-0.01em]">
          {item.name}
        </h2>
        {item.brand && (
          <p className="mt-0.5 text-[11.5px] text-muted-foreground/50">
            {item.brand}
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 px-4 pb-8">
          {[128, 80, 48, 48, 48].map((w, i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded-full bg-muted/50"
              style={{ width: w }}
            />
          ))}
        </div>
      ) : (
        <>
          {/* ── Portion picker ────────────────────────────────────────── */}
          <PortionPicker
            grams={grams}
            unit={unit}
            onChange={(nextGrams, nextUnit) => {
              setGrams(nextGrams)
              if (nextUnit) setUnit(nextUnit)
            }}
            presets={presets}
          />

          {/* ── Donut + macros ────────────────────────────────────────── */}
          <div className="mt-4 flex items-center gap-3 px-4">
            <DonutRing
              protein={protein}
              carbs={carbs}
              fat={fat}
              calories={calories}
            />
            <MacroStack protein={protein} carbs={carbs} fat={fat} />
          </div>

          {/* ── Scores ───────────────────────────────────────────────── */}
          <ScoresBadges
            nutriscoreGrade={detail?.nutriscoreGrade}
            novaGroup={detail?.novaGroup}
          />

          {/* ── Nutrition table ───────────────────────────────────────── */}
          {detail?.nutrients && detail.nutrients.length > 0 && (
            <div className="mx-4 mt-5 overflow-hidden rounded-2xl border border-border/50">
              <div className="border-b-[3px] border-foreground/80 px-4 py-3">
                <p className="text-[13px] font-black tracking-[-0.01em] uppercase">
                  Nutrition Facts
                </p>
                <p className="text-[10px] text-muted-foreground/50">
                  Per {foodPortionLabel(portion)}
                </p>
              </div>

              <div className="px-4">
                {/* Calories hero row */}
                <div className="flex items-baseline justify-between border-b border-border/40 py-2.5">
                  <span className="text-[12px] font-bold tracking-wide text-muted-foreground/60 uppercase">
                    Calories
                  </span>
                  <span className="text-[22px] leading-none font-black tabular-nums">
                    {calories}
                  </span>
                </div>
                <div className="flex justify-end py-1">
                  <span className="text-[9.5px] font-semibold text-muted-foreground/35">
                    % Daily Value*
                  </span>
                </div>

                {detail.nutrients
                  .filter((n) => n.key !== "energy" && n.key !== "salt")
                  .map((n, i, arr) => (
                    <div
                      key={n.key}
                      className={
                        i < arr.length - 1 ? "border-b border-border/30" : ""
                      }
                    >
                      <NutrRow
                        label={n.name}
                        value={scale(n.per100g, grams)}
                        unit={n.unit}
                        indent={n.indent}
                        bold={!n.indent}
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ── More nutrients ────────────────────────────────────────── */}
          {detail?.extraNutrients && detail.extraNutrients.length > 0 && (
            <div className="mx-4 mt-2 overflow-hidden rounded-2xl border border-border/50">
              <button
                onClick={() => setShowExtra((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 transition-colors active:bg-muted/40"
              >
                <span className="text-[12px] font-semibold text-muted-foreground/70">
                  More nutrients
                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground/35">
                    ({detail.extraNutrients.length})
                  </span>
                </span>
                <CaretDown
                  size={13}
                  weight="bold"
                  className="text-muted-foreground/40 transition-transform duration-300"
                  style={{
                    transform: showExtra ? "rotate(180deg)" : "rotate(0)",
                  }}
                />
              </button>
              <div
                ref={extraRef}
                className="overflow-hidden px-4"
                style={{
                  maxHeight: 0,
                  transition: "max-height 300ms cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                <div className="border-t border-border/30">
                  {detail.extraNutrients.map((n, i, arr) => (
                    <div
                      key={n.key}
                      className={
                        i < arr.length - 1
                          ? "border-b border-border/30"
                          : "pb-1"
                      }
                    >
                      <NutrRow
                        label={n.name}
                        value={scale(n.per100g, grams)}
                        unit={n.unit}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <p className="mt-3 px-5 text-[9px] leading-relaxed text-muted-foreground/25">
            * Based on a 2,000 kcal diet. Data from Open Food Facts.
          </p>

          {/* ── Meal picker ───────────────────────────────────────────── */}
          {showMealPicker && (
            <div className="mx-4 mt-3 rounded-2xl bg-muted/30 pb-3">
              <MealPicker value={meal} onChange={setMeal} />
            </div>
          )}

          {/* ── Log Food button ───────────────────────────────────────── */}
          <div
            className="sticky bottom-0 z-10 mt-3 bg-card/95 px-4 pt-3 backdrop-blur-sm"
            style={{
              paddingBottom:
                "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))",
            }}
          >
            <button
              onClick={() =>
                onAdd(
                  item,
                  grams,
                  extractMicros(detail, grams),
                  meal,
                  detail,
                  portion
                )
              }
              className="flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-center text-[14px] font-semibold tracking-tight transition-all active:scale-[0.98]"
              style={{
                backgroundColor: added ? mealCfg.bg : "var(--foreground)",
                color: added ? mealCfg.color : "var(--background)",
              }}
            >
              <span className="min-w-0 truncate">{ctaLabel}</span>
            </button>
          </div>
        </>
      )}
    </MobileSheet>
  )
}
