import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  CaretDown,
  Check,
  Minus,
  Plus,
  X,
} from "@phosphor-icons/react"
import { MobileSheet } from "./mobile-sheet"
import { AnimatedAccordion } from "@repo/ui"
import {
  FoodMacroStack as MacroStack,
  FoodNutrientRow as NutrRow,
  FoodProductHeader as ProductHeader,
} from "@repo/ui"
import {
  FOOD_PORTION_UNITS,
  amountFromFoodPortionGrams,
  defaultMeal,
  defaultFoodPortion,
  foodPortionLabel,
  gramsFromFoodPortion,
  logMicrosFromFoodDetail,
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
import { scaledFoodMacros } from "@/lib/food-search-nutrition"
import { APP_ACCENT_COLORS, tint } from "@repo/ui"

type Detail = FoodDetail | null | undefined

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Scale a per-100g value to the selected gram amount, rounded sensibly. */
function scale(per100g: number, grams: number): number {
  const v = (per100g * grams) / 100
  if (v >= 10) return Math.round(v)
  if (v >= 1) return Math.round(v * 10) / 10
  return Math.round(v * 100) / 100
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  const safeValue = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits:
      Math.abs(safeValue) >= 100 ? 0 : maximumFractionDigits,
  }).format(safeValue)
}

function initialFoodDetail(item: FoodResult): FoodDetail | null {
  const maybeDetail = item as Partial<FoodDetail>
  return Array.isArray(maybeDetail.nutrients) ? (item as FoodDetail) : null
}

const VOLUME_UNITS = new Set<FoodPortionUnit>(["ml", "fl_oz"])
const LIQUID_TEXT_RE =
  /\b(?:ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|cl|fl\s*oz|fluid\s*ounces?)\b/i

function foodLooksLiquid(
  item: FoodResult,
  detail: Detail,
  servingPortion?: FoodPortion
) {
  if (servingPortion && VOLUME_UNITS.has(servingPortion.unit)) return true
  return LIQUID_TEXT_RE.test(
    [
      detail?.servingLabel,
      item.serving,
      item.openFoodFacts?.quantity,
      item.openFoodFacts?.serving_size,
    ]
      .filter(Boolean)
      .join(" ")
  )
}

// ─── Macro summary ───────────────────────────────────────────────────────────

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
  showVolumeUnits,
}: {
  grams: number
  unit: FoodPortionUnit
  onChange: (g: number, unit?: FoodPortionUnit) => void
  presets: Preset[]
  showVolumeUnits: boolean
}) {
  const amount = amountFromFoodPortionGrams(grams, unit)
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

  const visibleUnits = showVolumeUnits
    ? FOOD_PORTION_UNITS
    : FOOD_PORTION_UNITS.filter((option) => !VOLUME_UNITS.has(option.id))

  return (
    <section className="mx-4 mt-2 rounded-3xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold">How much?</h3>
        </div>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
        {presets.map((p) => {
          const active = Math.abs(grams - p.grams) < 0.1 && p.unit === unit
          return (
            <button
              key={`${p.label}-${p.grams}-${p.unit ?? ""}`}
              type="button"
              onClick={() => onChange(p.grams, p.unit)}
              aria-pressed={active}
              className="flex min-h-10 max-w-36 shrink-0 items-center rounded-full border px-3 text-left text-[12px] font-semibold transition-colors active:bg-muted"
              style={
                active
                  ? {
                      borderColor:
                        "color-mix(in srgb, var(--foreground) 72%, transparent)",
                      backgroundColor: "var(--foreground)",
                      color: "var(--background)",
                    }
                  : {
                      borderColor:
                        "color-mix(in srgb, var(--border) 76%, transparent)",
                      backgroundColor: "var(--background)",
                      color: "var(--foreground)",
                    }
              }
            >
              <span className="max-w-full truncate leading-none">
                {p.label}
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto_2.75rem] items-stretch gap-2">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault()
            stepAmount(-1)
          }}
          aria-label="Decrease portion"
          className="flex h-12 items-center justify-center rounded-[10px] border border-border bg-background text-foreground transition-colors active:bg-muted"
        >
          <Minus size={14} weight="bold" />
        </button>

        <div className="flex min-w-0 items-center rounded-xl bg-muted/35 px-3">
          <input
            type="text"
            name="food-portion-amount"
            aria-label="Food portion amount"
            inputMode="decimal"
            value={focused ? inputVal : formatInputAmount(amount)}
            onChange={(e) => setInputVal(e.target.value)}
            onFocus={() => {
              setFocused(true)
              setInputVal(formatInputAmount(amount))
            }}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="h-10 w-full min-w-0 bg-transparent text-right text-[18px] font-bold tabular-nums outline-none"
          />
        </div>

        <select
          value={unit}
          onChange={(event) =>
            onChange(grams, event.target.value as FoodPortionUnit)
          }
          aria-label="Serving unit"
          className="rounded-xl bg-muted/35 px-2 text-[13px] font-semibold outline-none"
        >
          {visibleUnits.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault()
            stepAmount(1)
          }}
          aria-label="Increase portion"
          className="flex h-12 items-center justify-center rounded-[10px] border border-border bg-background text-foreground transition-colors active:bg-muted"
        >
          <Plus size={14} weight="bold" />
        </button>
      </div>
    </section>
  )
}

// ─── Nutrition row ────────────────────────────────────────────────────────────

// ─── Header
// ─── Header + highlights ─────────────────────────────────────────────────────

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
      className="px-3 pt-3"
      onClick={() => pendingDelete && setPendingDelete(null)}
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <p className="text-[16px] font-semibold">Meal</p>
        <p className="truncate text-[13px] text-muted-foreground">
          {categories.find((cat) => cat.id === value)?.label ?? "Selected"}
        </p>
      </div>
      <div className="flex [scrollbar-width:none] gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:!hidden">
        {categories.map((cat) => {
          const isSelected = value === cat.id
          const isDeleteTarget = pendingDelete === cat.id

          return (
            <div key={cat.id} className="relative shrink-0">
              <button
                type="button"
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
                aria-pressed={isSelected}
                className="flex h-11 min-w-20 items-center justify-center rounded-[10px] border px-3 text-[13px] font-semibold transition-colors active:bg-muted"
                style={
                  isSelected
                    ? {
                        backgroundColor: cat.bg,
                        color: cat.color,
                        borderColor: cat.color,
                      }
                    : {
                        backgroundColor: "var(--background)",
                        borderColor:
                          "color-mix(in srgb, var(--border) 72%, transparent)",
                        color: "var(--muted-foreground)",
                        opacity: 0.72,
                      }
                }
              >
                {cat.label}
              </button>

              {/* Delete overlay — only for custom categories */}
              {isDeleteTarget && !cat.isDefault && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(cat.id)
                  }}
                  aria-label={`Delete ${cat.label} meal category`}
                  className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive shadow-sm"
                >
                  <X size={8} weight="bold" className="text-white" />
                </button>
              )}
            </div>
          )
        })}

        {/* Add new */}
        {adding ? (
          <div className="flex h-11 shrink-0 items-center gap-1 rounded-[10px] border border-border bg-background pr-1.5 pl-3">
            <input
              ref={inputRef}
              name="new-meal-category"
              aria-label="New meal category name"
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
              className="w-24 bg-transparent text-[13px] font-semibold outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={handleAdd}
              aria-label="Save meal category"
              className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-foreground transition-opacity active:opacity-70"
            >
              <Check size={9} weight="bold" className="text-background" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add meal category"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-border bg-background text-muted-foreground transition-colors active:bg-muted"
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
  saving?: boolean
  showMealPicker?: boolean
  presentation?: "sheet" | "page"
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
  saving = false,
  showMealPicker = true,
  presentation = "sheet",
  actionLabel,
  addedLabel,
}: Props) {
  const [detail, setDetail] = useState<Detail>(() => initialFoodDetail(item))
  const [loading, setLoading] = useState(() => !initialFoodDetail(item))
  const [grams, setGrams] = useState(100)
  const [unit, setUnit] = useState<FoodPortionUnit>(
    () => defaultFoodPortion(item.serving, item.name).unit
  )
  const [showExtra, setShowExtra] = useState(false)
  const [meal, setMeal] = useState<string>(() => defaultMeal())
  const extraRef = useRef<HTMLDivElement>(null)
  const mealCfg = readAllMealCategories().find((c) => c.id === meal) ?? {
    label: meal,
    color: APP_ACCENT_COLORS.neutral,
    bg: tint(APP_ACCENT_COLORS.neutral, 12),
  }

  useEffect(() => {
    const embeddedDetail = initialFoodDetail(item)
    setShowExtra(false)
    if (embeddedDetail) {
      const nextPortion = defaultFoodPortion(
        embeddedDetail.servingLabel ?? item.serving,
        item.name,
        embeddedDetail.servingGrams ?? 100
      )
      setDetail(embeddedDetail)
      setUnit(nextPortion.unit)
      setGrams(nextPortion.grams)
      setLoading(false)
      return
    }

    setLoading(true)
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
  }, [item, item.id, item.name, item.serving])

  useEffect(() => {
    const el = extraRef.current
    if (!el) return
    el.style.maxHeight = showExtra ? el.scrollHeight + "px" : "0px"
  }, [showExtra, detail])

  // ── Scaled values ─────────────────────────────────────────────────────────

  const { calories, protein, carbs, fat } = scaledFoodMacros(
    item,
    grams,
    detail
  )
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
  const showVolumeUnits = foodLooksLiquid(item, detail, servingPortion)
  addPreset(servingPortion, detail?.servingLabel ?? item.serving)

  const presetLabels = [
    "50 g",
    "100 g",
    "1 oz",
    ...(showVolumeUnits ? ["100 ml", "250 ml"] : []),
    "1 cup",
    "1 tbsp",
  ]

  for (const label of presetLabels) {
    addPreset(defaultFoodPortion(label, item.name))
  }

  const ctaLabel = saving
    ? "Logging..."
    : added
      ? (addedLabel?.(mealCfg.label, portion) ?? `✓ Logged to ${mealCfg.label}`)
      : (actionLabel?.(grams, mealCfg.label, portion) ??
        `Log ${foodPortionLabel(portion)} to ${mealCfg.label}`)
  const isPage = presentation === "page"

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName={isPage ? "hidden" : "bg-black/32 backdrop-blur-[4px]"}
      panelClassName={
        isPage
          ? "app-sheet-panel sheet-panel-fullscreen mx-auto !h-svh !min-h-svh !max-h-svh !w-full !max-w-none !rounded-none !border-0 bg-background md:!max-w-none"
          : "app-sheet-panel mx-auto w-[calc(100vw-0.75rem)] max-w-[30rem] overflow-hidden border border-border/55 md:!w-[min(92vw,44rem)] md:!max-w-[44rem]"
      }
      minHeight={isPage ? "100svh" : undefined}
      maxHeight={isPage ? "100svh" : "94vh"}
      showHandle={!isPage}
      closeOnBackdrop={!isPage}
      top={
        isPage ? (
          <div className="flex shrink-0 items-center gap-3 border-b border-border/45 bg-background/96 px-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-3 backdrop-blur-xl md:px-8">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to food search"
              className="app-icon-button"
            >
              <ArrowLeft size={15} weight="bold" />
            </button>
            <span className="text-[13px] font-extrabold text-muted-foreground/72">
              Review serving
            </span>
          </div>
        ) : undefined
      }
      bottom={
        loading ? undefined : (
          <div
            className="border-t border-border/45 bg-card/95 px-4 pt-3 backdrop-blur-xl"
            style={{
              paddingBottom:
                "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))",
            }}
          >
            <button
              type="button"
              disabled={saving || added}
              aria-busy={saving}
              onClick={() =>
                onAdd(
                  item,
                  grams,
                  logMicrosFromFoodDetail(detail, grams),
                  meal,
                  detail,
                  portion
                )
              }
              className="flex min-h-[58px] w-full min-w-0 items-center justify-between gap-3 rounded-[17px] px-4 py-3.5 text-left text-[15px] font-extrabold transition-all active:scale-[0.985] disabled:scale-100 disabled:opacity-75"
              style={{
                backgroundColor: added ? mealCfg.bg : "var(--foreground)",
                color: added ? mealCfg.color : "var(--background)",
              }}
            >
              <span className="min-w-0 truncate">{ctaLabel}</span>
              <span className="shrink-0 text-[18px] tabular-nums">
                +{formatNumber(calories, 0)}
              </span>
            </button>
          </div>
        )
      }
    >
      <ProductHeader
        name={item.name}
        brand={item.brand}
        calories={calories}
        portionLabel={foodPortionLabel(portion)}
        presentation={presentation}
      />

      {loading ? (
        <div className="space-y-3 px-4 pb-8">
          <div className="app-surface app-surface-muted p-3">
            <div className="h-3 w-28 animate-pulse rounded-full bg-muted" />
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-[16px] bg-muted/70"
                />
              ))}
            </div>
          </div>
          <div className="h-40 animate-pulse rounded-[24px] bg-muted/45" />
          <div className="h-28 animate-pulse rounded-[20px] bg-muted/35" />
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
            showVolumeUnits={showVolumeUnits}
          />

          {/* ── Nutrition summary ─────────────────────────────────────── */}
          <section className="mx-4 mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-[14px] font-semibold">Nutrition</h3>
              <p className="text-[12px] text-muted-foreground">
                {foodPortionLabel(portion)}
              </p>
            </div>
            <MacroStack protein={protein} carbs={carbs} fat={fat} />
          </section>

          {/* ── Nutrition table ───────────────────────────────────────── */}
          {detail?.nutrients && detail.nutrients.length > 0 && (
            <AnimatedAccordion
              summary="Full nutrition details"
              className="mx-4 mt-4 overflow-hidden rounded-2xl border border-border bg-card"
              triggerClassName="px-4 py-3 text-[13px] font-semibold"
            >
              <div className="border-t border-border px-4">
                {/* Calories hero row */}
                <div className="flex items-baseline justify-between border-b border-border/40 py-2.5">
                  <span className="text-[13px] font-semibold text-muted-foreground">
                    Calories
                  </span>
                  <span className="text-[22px] leading-none font-black tabular-nums">
                    {formatNumber(calories, 0)}
                  </span>
                </div>
                <div className="flex justify-end py-1.5">
                  <span className="text-[13px] text-muted-foreground">
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
            </AnimatedAccordion>
          )}

          {/* ── More nutrients ────────────────────────────────────────── */}
          {detail?.extraNutrients && detail.extraNutrients.length > 0 && (
            <div className="mx-4 mt-3 overflow-hidden border-y border-border">
              <button
                type="button"
                onClick={() => setShowExtra((v) => !v)}
                aria-expanded={showExtra}
                aria-label={
                  showExtra
                    ? "Collapse minerals and vitamins"
                    : "Expand minerals and vitamins"
                }
                className="flex w-full items-center justify-between px-4 py-3 transition-colors active:bg-muted/40"
              >
                <span className="text-[15px] font-semibold">
                  Minerals & vitamins
                  <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">
                    ({detail.extraNutrients.length})
                  </span>
                </span>
                <CaretDown
                  size={13}
                  weight="bold"
                  className="text-muted-foreground transition-transform duration-300"
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
                  transition:
                    "max-height var(--motion-panel) var(--motion-ease-out)",
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

          {/* ── Meal picker ───────────────────────────────────────────── */}
          {showMealPicker && (
            <div className="mx-4 mt-4 border-y border-border pb-3">
              <MealPicker value={meal} onChange={setMeal} />
            </div>
          )}
          <p className="mx-4 mt-4 text-center text-[11px] text-muted-foreground">
            Food data powered by{" "}
            <a
              href="https://www.fatsecret.com"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              FatSecret
            </a>
          </p>
        </>
      )}
    </MobileSheet>
  )
}
