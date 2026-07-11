import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { useSearchParams } from "react-router"
import {
  Aperture,
  Barcode,
  BookBookmark,
  CaretDown,
  CaretRight,
  CheckCircle,
  ForkKnife,
  MagnifyingGlass,
  PencilSimple,
  Pill,
  PintGlass,
  Plus,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { convexClient } from "@/lib/convex"
import { MobileSheet } from "@/components/mobile-sheet"
import { useBottomBarAction } from "@/components/bottom-bar"
import { AppTooltip, APP_TOOLTIP_IDS } from "@/components/tooltips"
import { DateSelectorButton } from "@/components/date-selector-button"
import { useSmoothNavigate } from "@/lib/navigation"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { cn } from "@/lib/utils"
import {
  FOOD_MICRONUTRIENT_KEYS,
  currentDateKey,
  defaultMeal,
  findSmartMealPresetSuggestion,
  foodLogEntriesFromMealPreset,
  nutritionDetailTotals,
  offsetDateKey,
  stripUndefined,
  DEFAULT_MEAL_CATEGORIES,
  type FoodLogEntry,
  type FoodMicronutrientKey,
  type MealPreset,
  type Recipe,
  type RecipeIngredient,
  type SmartMealPresetSuggestion,
} from "@/lib/food-log"
import type { NutritionPlan } from "@/lib/health-goals"
import {
  buildSupplementDayPlan,
  type SupplementDayPlanItem,
  type SupplementIntakeLog,
  type SupplementItem,
} from "@/lib/supplements"
import {
  filledWaterGlassCount,
  waterAmountNeededForGlass,
  WATER_GLASS_COUNT,
  waterGlassTargetMl,
} from "@/lib/water-glasses"
import {
  APP_ACCENT_COLORS,
  MACRO_COLORS,
  MICRO_COLORS,
} from "@/lib/design-tokens"
import { useAiFeatureGate } from "@/lib/ai-access"
import { buildQuickRepeatFoods } from "@/lib/food-quick-repeat"
import { hapticSelection } from "@/lib/haptics"
import {
  clampSnapGrams,
  snapDetectionsFromAiResult,
  type SnapAiResult,
  type SnapFoodMatch,
} from "@/lib/food-snap-review"
import type { FoodResult } from "@repo/models"
import { toast } from "sonner"

type WaterLogEntry = {
  id: string
  amountMl: number
  loggedAt: string
}

type SupplementOverview = {
  items: SupplementItem[]
  logs: SupplementIntakeLog[]
  legacyEntries: Array<{ id: string; name?: string; loggedAt: string }>
  recentLogs: SupplementIntakeLog[]
  nutritionTotals: Record<string, number>
  isTrainingDay: boolean
}

type MacroKey = "protein" | "carbs" | "fat"
type GoalOverride = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

type GoalField = keyof GoalOverride

const QUICK_WATER = [250, 500, 750]
const GOAL_FIELDS: {
  key: GoalField
  label: string
  unit: string
  step: number
  min: number
}[] = [
  { key: "calories", label: "Calories", unit: "kcal", step: 50, min: 500 },
  { key: "protein", label: "Protein", unit: "g", step: 5, min: 0 },
  { key: "carbs", label: "Carbs", unit: "g", step: 5, min: 0 },
  { key: "fat", label: "Fat", unit: "g", step: 5, min: 0 },
]

const MICRO_DETAILS: Record<
  FoodMicronutrientKey,
  { label: string; unit: "g" | "mg" | "mcg"; target?: number; color: string }
> = {
  fiber: { label: "Fiber", unit: "g", target: 30, color: MICRO_COLORS.fiber },
  sugar: { label: "Sugar", unit: "g", target: 50, color: MICRO_COLORS.sugar },
  saturatedFat: {
    label: "Saturated fat",
    unit: "g",
    target: 20,
    color: MICRO_COLORS.saturatedFat,
  },
  transFat: { label: "Trans fat", unit: "g", color: MICRO_COLORS.transFat },
  cholesterol: {
    label: "Cholesterol",
    unit: "mg",
    target: 300,
    color: MICRO_COLORS.cholesterol,
  },
  sodium: {
    label: "Sodium",
    unit: "mg",
    target: 2300,
    color: MICRO_COLORS.sodium,
  },
  potassium: {
    label: "Potassium",
    unit: "mg",
    target: 3400,
    color: MICRO_COLORS.potassium,
  },
  calcium: {
    label: "Calcium",
    unit: "mg",
    target: 1000,
    color: MICRO_COLORS.calcium,
  },
  iron: { label: "Iron", unit: "mg", target: 18, color: MICRO_COLORS.iron },
  magnesium: {
    label: "Magnesium",
    unit: "mg",
    target: 400,
    color: MICRO_COLORS.magnesium,
  },
  phosphorus: {
    label: "Phosphorus",
    unit: "mg",
    target: 700,
    color: MICRO_COLORS.phosphorus,
  },
  zinc: { label: "Zinc", unit: "mg", target: 11, color: MICRO_COLORS.zinc },
  vitaminC: {
    label: "Vitamin C",
    unit: "mg",
    target: 90,
    color: MICRO_COLORS.vitaminC,
  },
  vitaminA: {
    label: "Vitamin A",
    unit: "mcg",
    target: 900,
    color: MICRO_COLORS.vitaminA,
  },
  vitaminD: {
    label: "Vitamin D",
    unit: "mcg",
    target: 20,
    color: MICRO_COLORS.vitaminD,
  },
  vitaminB12: {
    label: "B12",
    unit: "mcg",
    target: 2.4,
    color: MICRO_COLORS.vitaminB12,
  },
  caffeine: {
    label: "Caffeine",
    unit: "mg",
    target: 400,
    color: MICRO_COLORS.caffeine,
  },
  alcohol: { label: "Alcohol", unit: "g", color: MICRO_COLORS.alcohol },
}

function pct(value: number, target: number) {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)))
}

function fmt(n: number) {
  return Math.round(n).toLocaleString("en-US")
}

function fmtWater(ml: number) {
  if (ml >= 1000) {
    const liters = ml / 1000
    return `${liters % 1 === 0 ? liters : liters.toFixed(1)} L`
  }
  return `${Math.round(ml)} ml`
}

function fmtMicro(value: number, unit: "g" | "mg" | "mcg") {
  if (!Number.isFinite(value) || value <= 0) return `0 ${unit}`
  if (unit === "g") {
    const rounded = value >= 10 ? Math.round(value) : Number(value.toFixed(1))
    return `${rounded.toLocaleString("en-US")} ${unit}`
  }
  if (value < 10)
    return `${Number(value.toFixed(1)).toLocaleString("en-US")} ${unit}`
  return `${Math.round(value).toLocaleString("en-US")} ${unit}`
}

function timeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDateLabel(dateKey: string, todayKey: string) {
  if (dateKey === todayKey) return "Today"
  const yesterday = offsetDateKey(todayKey, -1)
  if (dateKey === yesterday) return "Yesterday"
  const date = new Date(`${dateKey}T12:00:00Z`)
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function nutrientTotal(
  totals: Partial<Record<string, number>> | undefined,
  key: string
) {
  const value = totals?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function totalFood(entries: FoodLogEntry[]) {
  return entries.reduce(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      carbs: acc.carbs + entry.carbs,
      fat: acc.fat + entry.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function totalsForRecipe(ingredients: RecipeIngredient[]) {
  return ingredients.reduce(
    (acc, ingredient) => ({
      calories:
        acc.calories +
        Math.round((ingredient.caloriesPer100 * ingredient.grams) / 100),
      protein:
        acc.protein +
        Math.round((ingredient.proteinPer100 * ingredient.grams) / 100),
      carbs:
        acc.carbs +
        Math.round((ingredient.carbsPer100 * ingredient.grams) / 100),
      fat:
        acc.fat + Math.round((ingredient.fatPer100 * ingredient.grams) / 100),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function combineMacroTotals(
  food: ReturnType<typeof totalFood>,
  supplements: Partial<Record<string, number>> | undefined
) {
  return {
    calories: food.calories + nutrientTotal(supplements, "calories"),
    protein: food.protein + nutrientTotal(supplements, "protein"),
    carbs: food.carbs + nutrientTotal(supplements, "carbs"),
    fat: food.fat + nutrientTotal(supplements, "fat"),
  }
}

function combineMicronutrientTotals(
  food: Partial<Record<FoodMicronutrientKey, number>>,
  supplements: Partial<Record<string, number>> | undefined
) {
  const totals: Partial<Record<FoodMicronutrientKey, number>> = {}
  for (const key of FOOD_MICRONUTRIENT_KEYS) {
    const value = (food[key] ?? 0) + nutrientTotal(supplements, key)
    if (value > 0) totals[key] = value
  }
  return totals
}

function ProgressLine({
  label,
  value,
  target,
  suffix,
  color,
}: {
  label: string
  value: number
  target: number
  suffix: string
  color: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold text-muted-foreground/68">
          {label}
        </span>
        <span className="text-[11px] font-semibold text-foreground/72 tabular-nums">
          {fmt(value)} / {fmt(target)} {suffix}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct(value, target)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function MicroBreakdown({
  open,
  onToggle,
  totals,
}: {
  open: boolean
  onToggle: () => void
  totals: Partial<Record<FoodMicronutrientKey, number>>
}) {
  const rows = FOOD_MICRONUTRIENT_KEYS.map((key) => {
    const detail = MICRO_DETAILS[key]
    const value = totals[key] ?? 0
    return { key, value, ...detail }
  })
  const loggedCount = rows.filter((row) => row.value > 0).length
  const highlights = rows
    .filter((row) => row.value > 0)
    .sort((a, b) => {
      const aPct = a.target ? a.value / a.target : 0
      const bPct = b.target ? b.value / b.target : 0
      return bPct - aPct
    })
    .slice(0, 3)

  return (
    <div className="mt-4 border-t border-border/35 pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-10 w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-[12px] font-bold">Micros</span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/55">
            {loggedCount > 0
              ? `${loggedCount} nutrients with logged detail`
              : "No micronutrients logged yet"}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {highlights.length > 0 && (
            <span className="hidden max-w-[11rem] truncate text-[10.5px] font-semibold text-muted-foreground/55 tabular-nums min-[390px]:block">
              {highlights
                .map((row) => `${row.label} ${fmtMicro(row.value, row.unit)}`)
                .join(" · ")}
            </span>
          )}
          <CaretDown
            size={13}
            weight="bold"
            className={cn(
              "text-muted-foreground/45 transition-transform",
              open && "rotate-180"
            )}
          />
        </span>
      </button>

      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          open
            ? "mt-2 grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          {loggedCount === 0 ? (
            <p className="rounded-[0.9rem] bg-muted/25 px-3 py-3 text-[12px] leading-5 text-muted-foreground/58">
              Micros appear when logged foods include nutrition details.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {rows.map((row) => {
                const hasValue = row.value > 0
                const progress = row.target ? pct(row.value, row.target) : null
                return (
                  <div
                    key={row.key}
                    className={cn(
                      "rounded-[0.85rem] border border-border/45 px-3 py-2.5",
                      hasValue ? "bg-muted/20" : "bg-muted/10 opacity-55"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="truncate text-[11.5px] font-semibold">
                          {row.label}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-foreground/72 tabular-nums">
                        {fmtMicro(row.value, row.unit)}
                      </span>
                    </div>
                    {row.target && (
                      <>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${progress}%`,
                              backgroundColor: row.color,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[9.5px] text-muted-foreground/45 tabular-nums">
                          target {fmtMicro(row.target, row.unit)}
                        </p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CustomWaterSheet({
  amount,
  onAmountChange,
  onAdd,
  onClose,
}: {
  amount: number
  onAmountChange: (amount: number) => void
  onAdd: () => void | Promise<void>
  onClose: () => void
}) {
  function setClamped(next: number) {
    onAmountChange(Math.max(1, Math.min(5000, Math.round(next))))
  }

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/45 backdrop-blur-[6px]"
      panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)] md:!w-full md:!max-w-sm"
      panelStyle={{
        paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
      }}
    >
      <div className="px-5 pt-1 pb-4">
        <p className="text-[17px] font-bold">Custom water</p>
        <p className="mt-1 text-[12px] text-muted-foreground/58">
          Save any amount to today’s hydration log.
        </p>
        <div className="mt-4 flex items-center justify-between rounded-[1rem] bg-muted/35 p-1">
          <button
            type="button"
            onClick={() => setClamped(amount - 50)}
            aria-label="Decrease custom water amount"
            className="flex h-11 w-11 items-center justify-center rounded-[0.8rem] bg-background text-[18px] font-bold"
          >
            −
          </button>
          <label className="min-w-0 flex-1 px-3 text-center">
            <span className="sr-only">Water amount in milliliters</span>
            <input
              type="number"
              inputMode="numeric"
              name="nutrition-custom-water-ml"
              aria-label="Custom water amount in milliliters"
              min={1}
              max={5000}
              value={amount}
              onChange={(event) => setClamped(Number(event.target.value) || 0)}
              className="w-full bg-transparent text-center text-[1.75rem] leading-none font-extrabold tabular-nums outline-none"
            />
            <span className="mt-1 block text-[11px] font-semibold text-muted-foreground/55">
              milliliters
            </span>
          </label>
          <button
            type="button"
            onClick={() => setClamped(amount + 50)}
            aria-label="Increase custom water amount"
            className="flex h-11 w-11 items-center justify-center rounded-[0.8rem] bg-background text-[18px] font-bold"
          >
            +
          </button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[150, 250, 500, 1000].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setClamped(preset)}
              className="app-button app-button-quiet justify-center"
            >
              {fmtWater(preset)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="app-button mt-4 min-h-11 w-full justify-center bg-foreground text-background"
        >
          Add {fmtWater(amount)}
        </button>
      </div>
    </MobileSheet>
  )
}

function WaterGoalSheet({
  goalMl,
  saving,
  onSave,
  onClose,
}: {
  goalMl: number
  saving: boolean
  onSave: (ml: number) => Promise<boolean>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(goalMl)

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/40 backdrop-blur-[4px]"
      panelClassName="mx-auto w-full max-w-sm rounded-t-[28px] bg-card shadow-[0_-20px_60px_rgba(0,0,0,0.2)]"
      panelStyle={{
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
      }}
    >
      <div className="px-4 pt-1 pb-2">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[15px] font-semibold">Daily water goal</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close daily goal"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/50 active:opacity-60"
          >
            <X size={12} weight="bold" />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-[13px] font-medium">Water</span>
            <span className="text-[10px] text-muted-foreground/40">ml</span>
          </div>
          <div className="flex items-center rounded-xl bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setDraft((value) => Math.max(250, value - 250))}
              aria-label="Decrease daily water goal"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/60 active:bg-background active:text-foreground"
            >
              <span className="text-[15px] leading-none">-</span>
            </button>
            <input
              type="number"
              name="water-goal-ml"
              aria-label="Daily water goal in ml"
              value={draft}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value)
                if (!Number.isNaN(next)) setDraft(Math.max(250, next))
              }}
              className="h-10 w-20 bg-transparent text-center text-[13px] font-semibold tabular-nums outline-none"
            />
            <button
              type="button"
              onClick={() => setDraft((value) => value + 250)}
              aria-label="Increase daily water goal"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/60 active:bg-background active:text-foreground"
            >
              <span className="text-[15px] leading-none">+</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          aria-busy={saving}
          onClick={async () => {
            const saved = await onSave(draft)
            if (saved) onClose()
          }}
          className="mt-4 w-full rounded-xl bg-foreground py-3 text-[13px] font-semibold text-background active:opacity-75 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </MobileSheet>
  )
}

function WaterGlassControls({
  totalMl,
  goalMl,
  entries,
  onAdd,
  onRemoveLast,
  savingAmount,
}: {
  totalMl: number
  goalMl: number
  entries: WaterLogEntry[]
  onAdd: (amountMl: number) => void
  onRemoveLast: () => void
  savingAmount: number | null
}) {
  const [hoveredGlass, setHoveredGlass] = useState<number | null>(null)
  const filledCount = filledWaterGlassCount(totalMl, goalMl)
  const previewFilledCount =
    hoveredGlass === null
      ? filledCount
      : Math.max(filledCount, hoveredGlass + 1)

  function fillToGlass(index: number) {
    onAdd(waterAmountNeededForGlass(totalMl, goalMl, index + 1))
  }

  return (
    <div
      className="mt-4 grid grid-cols-4 gap-2 short-phone:gap-1.5"
      onPointerLeave={() => setHoveredGlass(null)}
    >
      {Array.from({ length: WATER_GLASS_COUNT }, (_, index) => {
        const filled = index < filledCount
        const previewFilled = index < previewFilledCount
        return (
          <button
            key={index}
            type="button"
            disabled={savingAmount !== null}
            onClick={
              filled && entries.length > 0
                ? onRemoveLast
                : () => fillToGlass(index)
            }
            onPointerEnter={() => setHoveredGlass(index)}
            onFocus={() => setHoveredGlass(index)}
            onBlur={() => setHoveredGlass(null)}
            className={cn(
              "motion-tactile flex items-center justify-center rounded-[10px] py-2.5 transition-all disabled:opacity-50 short-phone:py-2",
              previewFilled ? "" : "bg-muted/25"
            )}
            style={
              previewFilled
                ? { backgroundColor: APP_ACCENT_COLORS.water }
                : undefined
            }
            aria-label={
              filled
                ? "Remove last water entry"
                : `Fill to ${fmtWater(waterGlassTargetMl(goalMl, index + 1))}`
            }
          >
            <PintGlass
              size={22}
              weight={previewFilled ? "fill" : "regular"}
              className={
                previewFilled ? "text-background" : "text-muted-foreground/20"
              }
            />
          </button>
        )
      })}
    </div>
  )
}

function GoalsCardWrapper({
  goals,
  apiGoals,
  onSave,
}: {
  goals: GoalOverride
  apiGoals: GoalOverride | null
  onSave: (goals: GoalOverride) => void | Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<GoalOverride>(goals)

  useEffect(() => {
    setDraft(goals)
  }, [goals])

  function adjust(key: GoalField, delta: number) {
    const field = GOAL_FIELDS.find((item) => item.key === key)!
    setDraft((current) => ({
      ...current,
      [key]: Math.max(field.min, current[key] + delta),
    }))
  }

  return (
    <div className="mt-4 border-t border-border/35 pt-3">
      <button
        type="button"
        onClick={() => setEditing((open) => !open)}
        className="flex min-h-10 w-full items-center justify-between gap-3 text-left"
        aria-expanded={editing}
      >
        <span>
          <span className="block text-[12px] font-bold">Daily goals</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground/55">
            Edit persistent calorie and macro targets.
          </span>
        </span>
        <PencilSimple size={13} className="text-muted-foreground/45" />
      </button>

      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          editing
            ? "mt-2 grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2">
            {GOAL_FIELDS.map(({ key, label, unit, step, min }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-baseline gap-1">
                  <span className="text-[13px] font-medium">{label}</span>
                  <span className="text-[10px] text-muted-foreground/40">
                    {unit}
                  </span>
                </div>
                <div className="flex items-center rounded-[10px] bg-muted/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => adjust(key, -step)}
                    aria-label={`Decrease ${label.toLowerCase()} goal`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/60 active:bg-background active:text-foreground"
                  >
                    <span className="text-[15px] leading-none">-</span>
                  </button>
                  <input
                    type="number"
                    name={`food-goal-${key}`}
                    aria-label={`${label} goal`}
                    value={draft[key]}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value)
                      if (!Number.isNaN(value)) {
                        setDraft((current) => ({
                          ...current,
                          [key]: Math.max(min, value),
                        }))
                      }
                    }}
                    className="h-10 w-16 bg-transparent text-center text-[13px] font-semibold tabular-nums outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => adjust(key, step)}
                    aria-label={`Increase ${label.toLowerCase()} goal`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/60 active:bg-background active:text-foreground"
                  >
                    <span className="text-[15px] leading-none">+</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void onSave(draft)
                setEditing(false)
              }}
              className="app-button flex-1 justify-center bg-foreground text-background"
            >
              Save
            </button>
            {apiGoals && (
              <button
                type="button"
                onClick={() => {
                  setDraft(apiGoals)
                  void onSave(apiGoals)
                  setEditing(false)
                }}
                className="app-button app-button-secondary"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function mealPresetTotals(entries: SmartMealPresetSuggestion["entries"]) {
  return entries.reduce(
    (acc, entry) => {
      acc.calories += Number(entry.calories) || 0
      acc.protein += Number(entry.protein) || 0
      acc.carbs += Number(entry.carbs) || 0
      acc.fat += Number(entry.fat) || 0
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function mealPresetItemSummary(entries: SmartMealPresetSuggestion["entries"]) {
  const names = entries.map((entry) => entry.name).filter(Boolean)
  if (names.length <= 2) return names.join(", ")
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`
}

function SmartMealPresetCard({
  suggestion,
  onSave,
  onLog,
  onDismiss,
  busy,
}: {
  suggestion: SmartMealPresetSuggestion
  onSave: () => Promise<void>
  onLog: () => Promise<void>
  onDismiss: () => void
  busy: boolean
}) {
  const totals = mealPresetTotals(suggestion.entries)
  const summary = mealPresetItemSummary(suggestion.entries)
  const meal = suggestion.mealLabel.toLowerCase()
  const isSave = suggestion.kind === "save"
  const fallbackName =
    suggestion.kind === "save" ? suggestion.name : suggestion.preset.name

  return (
    <section
      className="app-surface p-4"
      style={{ "--rail-color": "var(--accent-food)" } as CSSProperties}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-muted/55">
          {isSave ? (
            <BookBookmark size={15} className="text-muted-foreground/55" />
          ) : (
            <ForkKnife size={15} className="text-muted-foreground/55" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-snug font-semibold">
            {isSave ? `Save usual ${meal}` : `Log usual ${meal}`}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/45">
            {summary || fallbackName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[10.5px] font-semibold text-muted-foreground/55 tabular-nums">
              {Math.round(totals.calories)} kcal
            </span>
            <span className="text-[10.5px] text-muted-foreground/40 tabular-nums">
              P{Math.round(totals.protein)} C{Math.round(totals.carbs)} F
              {Math.round(totals.fat)}g
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          aria-label="Dismiss smart meal suggestion"
          className="app-icon-button h-9 w-9 bg-transparent text-muted-foreground/45 disabled:opacity-35"
        >
          <X size={10} weight="bold" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          void (isSave ? onSave() : onLog())
        }}
        disabled={busy}
        aria-busy={busy}
        className="mt-3 flex min-h-10 w-full items-center justify-center rounded-xl bg-foreground px-3 text-[12.5px] font-semibold text-background transition-opacity active:opacity-75 disabled:opacity-55"
      >
        {busy
          ? isSave
            ? "Saving..."
            : "Logging..."
          : isSave
            ? "Save as preset"
            : `Log usual ${meal}`}
      </button>
    </section>
  )
}

const RECIPE_MICRO_PER100_KEYS = {
  fiber: "fiberPer100",
  sugar: "sugarPer100",
  saturatedFat: "saturatedFatPer100",
  transFat: "transFatPer100",
  cholesterol: "cholesterolPer100",
  sodium: "sodiumPer100",
  potassium: "potassiumPer100",
  calcium: "calciumPer100",
  iron: "ironPer100",
  magnesium: "magnesiumPer100",
  phosphorus: "phosphorusPer100",
  zinc: "zincPer100",
  vitaminC: "vitaminCPer100",
  vitaminA: "vitaminAPer100",
  vitaminD: "vitaminDPer100",
  vitaminB12: "vitaminB12Per100",
  caffeine: "caffeinePer100",
  alcohol: "alcoholPer100",
} satisfies Record<FoodMicronutrientKey, keyof RecipeIngredient>

function roundRecipeMicro(value: number) {
  if (value >= 100) return Math.round(value)
  if (value >= 10) return Math.round(value * 10) / 10
  return Math.round(value * 100) / 100
}

function recipeIngredientFromAiFood(
  food: FoodResult,
  grams: number
): RecipeIngredient {
  const round = (value: number) => Math.round(value * 10) / 10
  const safeGrams = clampSnapGrams(grams)
  return {
    id: Math.random().toString(36).slice(2),
    name: food.name,
    grams: safeGrams,
    displayAmount: safeGrams,
    displayUnit: "g",
    servingLabel: food.serving,
    caloriesPer100: Number(food.calories) || 0,
    proteinPer100: round(Number(food.protein) || 0),
    carbsPer100: round(Number(food.carbs) || 0),
    fatPer100: round(Number(food.fat) || 0),
  }
}

function tempRecipeFromAiDescription(
  result: { aiResult?: SnapAiResult; matches?: SnapFoodMatch[] },
  fallbackName: string
): Recipe | null {
  const aiResult = result.aiResult ?? {}
  const detections = snapDetectionsFromAiResult(aiResult)
  const matchesByIndex = new Map(
    (result.matches ?? []).map((match) => [match.detectionIndex, match])
  )
  const ingredients = detections
    .map((detection, index) => {
      const match = matchesByIndex.get(index)
      const food = match?.food ?? null
      if (!food) return null
      return recipeIngredientFromAiFood(food, detection.estimatedGrams ?? 100)
    })
    .filter((ingredient): ingredient is RecipeIngredient => ingredient !== null)

  if (ingredients.length === 0) return null

  const rawName =
    typeof aiResult.foodName === "string" && aiResult.foodName.trim()
      ? aiResult.foodName.trim()
      : fallbackName.trim()

  return {
    name: rawName.slice(0, 48) || "Described meal",
    createdAt: new Date().toISOString(),
    ingredients,
  }
}

function recipeTotals(ingredients: RecipeIngredient[]) {
  const totals = ingredients.reduce(
    (acc, ingredient) => {
      acc.calories += Math.round(
        (ingredient.caloriesPer100 * ingredient.grams) / 100
      )
      acc.protein += Math.round(
        (ingredient.proteinPer100 * ingredient.grams) / 100
      )
      acc.carbs += Math.round((ingredient.carbsPer100 * ingredient.grams) / 100)
      acc.fat += Math.round((ingredient.fatPer100 * ingredient.grams) / 100)

      for (const key of FOOD_MICRONUTRIENT_KEYS) {
        const per100Key = RECIPE_MICRO_PER100_KEYS[key]
        const value = Number(ingredient[per100Key])
        if (!Number.isFinite(value) || value <= 0) continue
        acc[key] = (acc[key] ?? 0) + (value * ingredient.grams) / 100
      }
      return acc
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    } as {
      calories: number
      protein: number
      carbs: number
      fat: number
    } & Partial<Record<FoodMicronutrientKey, number>>
  )

  for (const key of FOOD_MICRONUTRIENT_KEYS) {
    if (totals[key] !== undefined) totals[key] = roundRecipeMicro(totals[key])
  }

  return totals
}

function DescribeMealSheet({
  busy,
  onSubmit,
  onClose,
}: {
  busy: boolean
  onSubmit: (text: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState("")
  const canSubmit = text.trim().length >= 4 && !busy

  return (
    <MobileSheet
      onClose={busy ? () => {} : onClose}
      overlayClassName="bg-black/35 backdrop-blur-[3px]"
      panelClassName="mx-auto w-full max-w-sm rounded-t-[26px] bg-card px-4 pt-4 shadow-[0_-16px_50px_rgba(0,0,0,0.2)]"
      panelStyle={{
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
      }}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
          <Sparkle size={15} weight="fill" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-semibold">
            Describe meal
          </p>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground/58">
            AI creates a temporary recipe you can review before logging.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="app-icon-button h-9 w-9 disabled:opacity-40"
          aria-label="Close describe meal"
        >
          <X size={13} weight="bold" />
        </button>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={busy}
        aria-label="Describe meal"
        placeholder="chicken burrito bowl with rice, beans, salsa, cheese, and guacamole"
        className="min-h-36 w-full resize-none rounded-2xl border border-border/50 bg-muted/35 px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/35 focus:border-foreground/20 disabled:opacity-60"
      />

      <button
        type="button"
        disabled={!canSubmit}
        aria-busy={busy}
        onClick={() => onSubmit(text.trim())}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-[14px] font-bold text-background transition-opacity active:opacity-80 disabled:opacity-35"
      >
        <Sparkle
          size={14}
          weight="fill"
          className={busy ? "animate-spin" : undefined}
        />
        {busy ? "Building recipe..." : "Create temporary recipe"}
      </button>
    </MobileSheet>
  )
}

function RecipeLogSheet({
  recipe,
  savingMeal,
  onLog,
  onEdit,
  onClose,
}: {
  recipe: Recipe
  savingMeal: string | null
  onLog: (meal: string) => Promise<void>
  onEdit?: () => void
  onClose: () => void
}) {
  const totals = recipeTotals(recipe.ingredients)
  const suggested = defaultMeal()

  return (
    <MobileSheet
      onClose={savingMeal ? () => {} : onClose}
      overlayClassName="bg-black/30 backdrop-blur-[2px]"
      panelClassName="mx-auto w-full max-w-sm rounded-t-[24px] bg-card px-4 pt-4 shadow-[0_-16px_50px_rgba(0,0,0,0.18)]"
      panelStyle={{
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
      }}
    >
      <p className="text-[15px] leading-snug font-semibold">Log to...</p>
      <p className="mb-0.5 truncate text-[11.5px] text-muted-foreground/45">
        {recipe.name}
      </p>
      <p className="mb-3 text-[11px] text-muted-foreground/30 tabular-nums">
        {totals.calories} kcal · P{totals.protein} C{totals.carbs} F{totals.fat}
        g
      </p>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={Boolean(savingMeal)}
          className="mb-3 flex min-h-10 w-full items-center justify-center rounded-2xl bg-muted px-4 text-[13px] font-semibold text-foreground/75 transition-opacity active:opacity-75 disabled:opacity-50"
        >
          Edit recipe
        </button>
      )}
      <div className="flex flex-col gap-1.5">
        {DEFAULT_MEAL_CATEGORIES.map((cat) => {
          const saving = savingMeal === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              disabled={Boolean(savingMeal)}
              aria-busy={saving}
              onClick={() => {
                void onLog(cat.id)
              }}
              className="flex items-center justify-between rounded-2xl px-4 py-3 transition-all active:scale-[0.985] disabled:opacity-55"
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
                {saving ? "Logging..." : cat.label}
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
          )
        })}
      </div>
    </MobileSheet>
  )
}

function RecipeManagementBox({
  recipes,
  deletingRecipeId,
  onCreate,
  onEdit,
  onDelete,
}: {
  recipes: Recipe[]
  deletingRecipeId: string | null
  onCreate: () => void
  onEdit: (recipe: Recipe) => void
  onDelete: (recipe: Recipe) => void
}) {
  return (
    <section className="app-surface mt-3 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="app-section-title">Recipes</p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground/50">
            {recipes.length === 0
              ? "No saved recipes"
              : `${recipes.length} saved`}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="app-button app-button-quiet"
        >
          <Plus size={10} weight="bold" />
          New
        </button>
      </div>

      {recipes.length === 0 ? (
        <button
          type="button"
          onClick={onCreate}
          className="app-empty w-full transition-colors active:bg-muted/20"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-muted/60">
            <BookBookmark size={15} className="text-muted-foreground/40" />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-medium text-foreground/60">
              Create recipe
            </p>
            <p className="text-[11px] text-muted-foreground/35">
              Save repeat meals.
            </p>
          </div>
        </button>
      ) : (
        <div className="divide-y divide-border/30">
          {recipes.map((recipe) => {
            const totals = recipeTotals(recipe.ingredients)
            const deleting = deletingRecipeId === String(recipe._id)
            return (
              <div
                key={recipe._id ?? recipe.name}
                className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">
                    {recipe.name}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-muted-foreground/45 tabular-nums">
                    {totals.calories} kcal · {recipe.ingredients.length}{" "}
                    ingredient{recipe.ingredients.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(recipe)}
                  className="app-header-icon-action h-9 min-h-9 w-9 min-w-9 text-muted-foreground/70"
                  aria-label={`Edit ${recipe.name}`}
                >
                  <PencilSimple size={13} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(recipe)}
                  disabled={deleting || !recipe._id}
                  aria-busy={deleting}
                  className="app-header-icon-action h-9 min-h-9 w-9 min-w-9 text-destructive/70 disabled:opacity-45"
                  aria-label={`Delete ${recipe.name}`}
                >
                  <Trash size={13} weight="bold" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function GoalTile({
  label,
  value,
  detail,
  icon,
  complete,
}: {
  label: string
  value: string
  detail: string
  icon: ReactNode
  complete: boolean
}) {
  return (
    <div className="flex w-full items-center gap-3 rounded-[1rem] border border-border/50 bg-muted/20 px-4 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground/72">
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-none font-extrabold text-muted-foreground/70">
          {label}
        </p>

        <p className="mt-1 truncate text-[13px] text-muted-foreground/50">
          {detail}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <p className="text-[18px] leading-none font-extrabold tabular-nums">
          {value}
        </p>

        {complete && (
          <CheckCircle
            size={16}
            weight="fill"
            className="text-(--status-complete)"
          />
        )}
      </div>
    </div>
  )
}

function SupplementRow({
  plan,
  onTake,
  saving,
}: {
  plan: SupplementDayPlanItem
  onTake: (plan: SupplementDayPlanItem) => void
  saving: boolean
}) {
  const taken = plan.state === "taken"
  const skipped = plan.state === "skipped"
  return (
    <div className="flex items-center gap-3 border-t border-border/35 py-3 first:border-t-0">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          taken
            ? "bg-(--status-complete)"
            : skipped
              ? "bg-muted-foreground/35"
              : "bg-(--status-caution)"
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold">{plan.item.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/55">
          {taken ? "Taken" : skipped ? "Skipped" : "Due"} ·{" "}
          {plan.item.servingLabel ?? "1 serving"}
        </p>
      </div>
      {!taken && !skipped && (
        <button
          type="button"
          onClick={() => onTake(plan)}
          disabled={saving}
          aria-busy={saving}
          className="app-header-icon-action"
          aria-label={`Mark ${plan.item.name} taken`}
        >
          <CheckCircle weight="bold" />
        </button>
      )}
    </div>
  )
}

export default function Nutrition() {
  const navigate = useSmoothNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [addOpen, setAddOpen] = useState(false)
  const [microsOpen, setMicrosOpen] = useState(false)
  const [customWaterOpen, setCustomWaterOpen] = useState(false)
  const [dateSelectorOpen, setDateSelectorOpen] = useState(false)
  const [customWaterAmount, setCustomWaterAmount] = useState(350)
  const [waterGoalOpen, setWaterGoalOpen] = useState(false)
  const [savingWaterGoal, setSavingWaterGoal] = useState(false)
  const [loggingWaterAmount, setLoggingWaterAmount] = useState<number | null>(
    null
  )
  const [loggingSupplementId, setLoggingSupplementId] = useState<string | null>(
    null
  )
  const [quickRepeatBusyKey, setQuickRepeatBusyKey] = useState<string | null>(
    null
  )
  const [describeOpen, setDescribeOpen] = useState(false)
  const [describeBusy, setDescribeBusy] = useState(false)
  const [loggingRecipe, setLoggingRecipe] = useState<Recipe | null>(null)
  const [savingRecipeMeal, setSavingRecipeMeal] = useState<string | null>(null)
  const [deletingRecipeId, setDeletingRecipeId] = useState<string | null>(null)
  const [dismissedSmartMealKeys, setDismissedSmartMealKeys] = useState<
    string[]
  >([])
  const [smartMealBusyKey, setSmartMealBusyKey] = useState<string | null>(null)
  const [applyingCalibration, setApplyingCalibration] = useState(false)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  useBottomBarAction(() => setAddOpen(true))

  const preferences = useQuery(api.users.users.getPreferences, {})
  const timeZone = preferences?.lastActiveTimezone || "UTC"
  const todayKey = currentDateKey(timeZone)
  const [dateKey, setDateKey] = useState(todayKey)
  const isToday = dateKey === todayKey
  const dateLabel = formatDateLabel(dateKey, todayKey)

  const effectiveGoals = useQuery(api.users.users.getEffectiveGoals, {
    date: dateKey,
  })
  const nutritionPlanRaw = useQuery(api.users.users.getNutritionPlan, {
    date: dateKey,
  })
  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date: dateKey })
  const recipesQuery = useQuery(api.logs.recipes.list, {})
  const mealPresetsQuery = useQuery(api.logs.mealPresets.list, {})
  const recentFoodLogs = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: todayKey,
    limit: 21,
  })
  const waterLogs = useQuery(api.logs.water.getDay, { date: dateKey })
  const supplementOverviewRaw = useQuery(api.logs.supplements.getOverview, {
    date: dateKey,
  })

  const setFoodDay = useOfflineMutation(
    api.logs.foodLogs.setDay,
    "logs.foodLogs.setDay"
  )
  const addWaterEntry = useOfflineMutation(
    api.logs.water.addEntry,
    "logs.water.addEntry"
  )
  const setWaterDay = useOfflineMutation(
    api.logs.water.setDay,
    "logs.water.setDay"
  )
  const setWaterGoal = useOfflineMutation(
    api.users.users.setWaterGoal,
    "users.users.setWaterGoal"
  )
  const saveCustomGoals = useOfflineMutation(
    api.users.users.setCustomGoals,
    "users.users.setCustomGoals"
  )
  const createMealPresetMutation = useOfflineMutation(
    api.logs.mealPresets.create,
    "logs.mealPresets.create"
  )
  const removeRecipeMutation = useOfflineMutation(
    api.logs.recipes.remove,
    "logs.recipes.remove"
  )
  const logSupplementTaken = useOfflineMutation(
    api.logs.supplements.logTaken,
    "logs.supplements.logTaken"
  )
  const removeSupplementLog = useOfflineMutation(
    api.logs.supplements.removeLog,
    "logs.supplements.removeLog"
  )
  const applyCalibration = useMutation(
    api.users.users.applyNutritionCalibration
  )

  const entries = useMemo(() => (foodLogs ?? []) as FoodLogEntry[], [foodLogs])
  const recipes = useMemo(
    () => (recipesQuery ?? []) as unknown as Recipe[],
    [recipesQuery]
  )
  const mealPresets = useMemo(
    () => (mealPresetsQuery ?? []) as unknown as MealPreset[],
    [mealPresetsQuery]
  )
  const recentFoodLogDays = useMemo(
    () =>
      (recentFoodLogs ?? []) as unknown as {
        date: string
        entries: FoodLogEntry[]
      }[],
    [recentFoodLogs]
  )
  const waterEntries = (waterLogs ?? []) as WaterLogEntry[]
  const overview = useMemo(
    () =>
      (supplementOverviewRaw ?? {
        items: [],
        logs: [],
        legacyEntries: [],
        recentLogs: [],
        nutritionTotals: {},
        isTrainingDay: false,
      }) as SupplementOverview,
    [supplementOverviewRaw]
  )

  const goals = effectiveGoals?.effective
  const nutritionPlan = nutritionPlanRaw as NutritionPlan | null | undefined
  const compiledTarget = effectiveGoals?.health
  const targetGuidance = compiledTarget?.guidance?.slice(0, 3) ?? []
  const visibleMetrics = nutritionPlan?.visibleMetrics ?? {
    calories: true,
    macros: true,
    protein: true,
    micros: true,
    habits: false,
    water: true,
    streaks: true,
  }
  const calibration = nutritionPlan?.calibration
  const calorieTarget = Math.round(goals?.calories ?? 2000)
  const macroTargets: Record<MacroKey, number> = {
    protein: Math.round(goals?.protein ?? 140),
    carbs: Math.round(goals?.carbs ?? 220),
    fat: Math.round(goals?.fat ?? 65),
  }
  const customGoalTargets: GoalOverride = {
    calories: calorieTarget,
    protein: macroTargets.protein,
    carbs: macroTargets.carbs,
    fat: macroTargets.fat,
  }
  const apiGoals = useMemo((): GoalOverride | null => {
    if (!effectiveGoals) return null
    return {
      calories: Math.round(
        effectiveGoals.health?.calories ?? effectiveGoals.effective.calories
      ),
      protein: Math.round(
        effectiveGoals.health?.protein ?? effectiveGoals.effective.protein
      ),
      carbs: Math.round(
        effectiveGoals.health?.carbs ?? effectiveGoals.effective.carbs
      ),
      fat: Math.round(
        effectiveGoals.health?.fat ?? effectiveGoals.effective.fat
      ),
    }
  }, [effectiveGoals])
  const foodTotals = useMemo(() => totalFood(entries), [entries])
  const supplementNutritionTotals = overview.nutritionTotals
  const intakeTotals = useMemo(
    () => combineMacroTotals(foodTotals, supplementNutritionTotals),
    [foodTotals, supplementNutritionTotals]
  )
  const foodMicroTotals = useMemo(
    () => nutritionDetailTotals(entries),
    [entries]
  )
  const microTotals = useMemo(
    () =>
      combineMicronutrientTotals(foodMicroTotals, supplementNutritionTotals),
    [foodMicroTotals, supplementNutritionTotals]
  )
  const waterTotal = waterEntries.reduce(
    (sum, entry) => sum + entry.amountMl,
    0
  )
  const waterGoal = preferences?.waterGoalMl ?? 2500

  const supplementPlan = useMemo(
    () =>
      buildSupplementDayPlan({
        items: overview.items,
        logs: overview.logs,
        date: todayKey,
        today: todayKey,
        isTrainingDay: overview.isTrainingDay,
      }),
    [overview.isTrainingDay, overview.items, overview.logs, todayKey]
  )
  const scheduledSupplements = supplementPlan.filter((plan) => plan.isScheduled)
  const takenSupplements = supplementPlan.filter(
    (plan) => plan.state === "taken"
  )
  const supplementDone = takenSupplements.length + overview.legacyEntries.length
  const supplementTarget = Math.max(scheduledSupplements.length, supplementDone)
  const dueSupplements = supplementPlan.filter(
    (plan) => plan.state === "due" || plan.state === "missed"
  )
  const visibleSupplements =
    dueSupplements.length > 0 ? dueSupplements : supplementPlan.slice(0, 3)

  const currentMealLabel =
    DEFAULT_MEAL_CATEGORIES.find((meal) => meal.id === defaultMeal())?.label ??
    "Food"
  const caloriesLeft = calorieTarget - intakeTotals.calories
  const workoutCalories = Math.max(0, effectiveGoals?.burnedCalories ?? 0)
  const isTrainingDay = effectiveGoals?.isTrainingDay === true
  const workoutAdjustmentEnabled =
    effectiveGoals?.workoutAdjustmentEnabled === true
  const loggedToday = entries.length + waterEntries.length + supplementDone
  const recentFood = [...entries]
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
    .slice(0, 3)
  const quickRepeatFoods = useMemo(
    () => buildQuickRepeatFoods(recentFoodLogDays),
    [recentFoodLogDays]
  )
  const smartMealSuggestion = useMemo(
    () =>
      isToday
        ? findSmartMealPresetSuggestion({
            recentDays: recentFoodLogDays,
            presets: mealPresets,
            todayEntries: entries,
            currentMeal: defaultMeal(),
            dismissedKeys: dismissedSmartMealKeys,
          })
        : null,
    [dismissedSmartMealKeys, entries, isToday, mealPresets, recentFoodLogDays]
  )

  useEffect(() => {
    const requestedDate = searchParams.get("date")
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      setDateKey(requestedDate)
      const next = new URLSearchParams(searchParams)
      next.delete("date")
      setSearchParams(next, { replace: true })
      return
    }

    if (searchParams.get("describe") === "1") {
      if (requireAiAccess()) {
        setAddOpen(false)
        setDescribeOpen(true)
      }
      const next = new URLSearchParams(searchParams)
      next.delete("describe")
      setSearchParams(next, { replace: true })
    }

    if (searchParams.get("history") === "1") {
      setDateKey(offsetDateKey(todayKey, -1))
      const next = new URLSearchParams(searchParams)
      next.delete("history")
      setSearchParams(next, { replace: true })
    }
  }, [requireAiAccess, searchParams, setSearchParams, todayKey])

  async function addWater(amountMl: number) {
    if (amountMl <= 0 || loggingWaterAmount !== null) return false
    setLoggingWaterAmount(amountMl)
    try {
      await addWaterEntry({
        date: dateKey,
        entry: {
          id: crypto.randomUUID(),
          amountMl,
          loggedAt: new Date().toISOString(),
        },
      })
      hapticSelection()
      return true
    } finally {
      setLoggingWaterAmount(null)
    }
  }

  async function saveWaterGoal(ml: number) {
    if (savingWaterGoal) return false
    setSavingWaterGoal(true)
    try {
      await setWaterGoal({ goalMl: ml })
      return true
    } finally {
      setSavingWaterGoal(false)
    }
  }

  function removeLastWaterEntry() {
    const sorted = [...waterEntries].sort((a, b) =>
      b.loggedAt.localeCompare(a.loggedAt)
    )
    const [latest] = sorted
    if (!latest) return
    removeWaterEntry(latest.id)
  }

  function openSnapCamera() {
    if (!requireAiAccess()) return
    setAddOpen(false)
    navigate("/camera")
  }

  function openDescribeMeal() {
    if (!requireAiAccess()) return
    setAddOpen(false)
    setDescribeOpen(true)
  }

  async function handleDescribeMeal(text: string) {
    if (describeBusy || !requireAiAccess()) return
    setDescribeBusy(true)
    try {
      const result = (await convexClient.action(api.logs.snap.describeText, {
        text,
        language: preferences?.foodSearchLanguage ?? "en",
      })) as unknown as { aiResult?: SnapAiResult; matches?: SnapFoodMatch[] }
      const recipe = tempRecipeFromAiDescription(result, text)
      if (!recipe) {
        toast.message("I couldn't match enough ingredients to log that meal")
        return
      }
      setDescribeOpen(false)
      setLoggingRecipe(recipe)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not parse meal"
      )
    } finally {
      setDescribeBusy(false)
    }
  }

  async function logRecipeToMeal(recipe: Recipe, meal: string) {
    const totals = recipeTotals(recipe.ingredients)
    const entry = stripUndefined({
      id: crypto.randomUUID(),
      name: recipe.name,
      ...totals,
      loggedAt: new Date().toISOString(),
      meal,
      recipeId: recipe._id,
      recipeDraft: recipe._id
        ? undefined
        : {
            name: recipe.name,
            ingredients: recipe.ingredients,
          },
    })
    await setFoodDay({
      date: dateKey,
      entries: [...entries, entry],
    })
  }

  function logRecipe(recipe: Recipe) {
    setAddOpen(false)
    setLoggingRecipe(recipe)
  }

  function createRecipe() {
    navigate("/foods/recipe/new")
  }

  function editRecipe(recipe: Recipe) {
    if (!recipe._id) return
    navigate(`/foods/recipe/${recipe._id}`)
  }

  async function deleteRecipe(recipe: Recipe) {
    if (!recipe._id || deletingRecipeId !== null) return
    const id = recipe._id as Id<"recipes">
    setDeletingRecipeId(String(id))
    try {
      await removeRecipeMutation({ id })
    } finally {
      setDeletingRecipeId(null)
    }
  }

  function editRecipeFromLogEntry(entry: FoodLogEntry) {
    const replaceFoodLogEntry = { date: dateKey, entryId: entry.id }
    if (entry.recipeId) {
      navigate(`/foods/recipe/${entry.recipeId}`, {
        state: { replaceFoodLogEntry },
      })
      return
    }
    if (entry.recipeDraft) {
      navigate("/foods/recipe/new", {
        state: { draftRecipe: entry.recipeDraft, replaceFoodLogEntry },
      })
    }
  }

  async function takeSupplement(plan: SupplementDayPlanItem) {
    if (!plan.item._id || loggingSupplementId !== null) return
    const id = String(plan.item._id)
    setLoggingSupplementId(id)
    try {
      await logSupplementTaken({
        supplementId: plan.item._id as Id<"supplementItems">,
        date: dateKey,
        loggedAt: new Date().toISOString(),
        servingMultiplier: 1,
      })
    } finally {
      setLoggingSupplementId(null)
    }
  }

  function removeFoodEntry(entryId: string) {
    void setFoodDay({
      date: dateKey,
      entries: entries.filter((entry) => entry.id !== entryId),
    })
  }

  function removeWaterEntry(entryId: string) {
    void setWaterDay({
      date: dateKey,
      entries: waterEntries.filter((entry) => entry.id !== entryId),
    })
  }

  function removeSupplementEntry(logId: Id<"supplementIntakeLogs">) {
    void removeSupplementLog({ logId })
  }

  function dismissSmartMealSuggestion(key: string) {
    setDismissedSmartMealKeys((prev) =>
      prev.includes(key) ? prev : [...prev, key]
    )
  }

  async function saveSmartMealPreset(suggestion: SmartMealPresetSuggestion) {
    if (suggestion.kind !== "save" || smartMealBusyKey !== null) return
    setSmartMealBusyKey(suggestion.key)
    try {
      await createMealPresetMutation({
        name: suggestion.name,
        meal: suggestion.meal,
        signature: suggestion.signature,
        entries: suggestion.entries,
      })
      dismissSmartMealSuggestion(suggestion.key)
    } finally {
      setSmartMealBusyKey(null)
    }
  }

  async function logSmartMealPreset(suggestion: SmartMealPresetSuggestion) {
    if (suggestion.kind !== "log" || smartMealBusyKey !== null) return
    setSmartMealBusyKey(suggestion.key)
    try {
      const presetEntries = foodLogEntriesFromMealPreset(suggestion.preset, {
        meal: suggestion.meal,
      })
      await setFoodDay({
        date: dateKey,
        entries: [...entries, ...presetEntries],
      })
      dismissSmartMealSuggestion(suggestion.key)
    } finally {
      setSmartMealBusyKey(null)
    }
  }

  async function applyPlanCalibration() {
    if (!calibration?.canApply || !calibration.targets || applyingCalibration) {
      return
    }
    setApplyingCalibration(true)
    try {
      await applyCalibration(calibration.targets)
    } finally {
      setApplyingCalibration(false)
    }
  }

  function openSupplements() {
    hapticSelection()
    navigate("/supplements", { motion: "forward" })
  }

  function openFoodSearch() {
    navigate(isToday ? "/foods/search" : `/foods/search?date=${dateKey}`)
  }

  async function repeatFood(entry: FoodLogEntry, key: string) {
    if (quickRepeatBusyKey !== null) return
    setQuickRepeatBusyKey(key)
    try {
      const repeatedFood: FoodLogEntry = stripUndefined({
        ...entry,
        _id: undefined,
        id: crypto.randomUUID(),
        loggedAt: new Date().toISOString(),
        meal: defaultMeal(),
      })

      await setFoodDay({
        date: dateKey,
        entries: [...entries, repeatedFood],
      })
      hapticSelection()
      setAddOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not log that food"
      )
    } finally {
      setQuickRepeatBusyKey(null)
    }
  }

  return (
    <div className="desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <main className="app-page">
        <header className="app-header">
          <div className={cn("min-w-0")}>
            <h1 className="app-title">Nutrition</h1>
            <button
              type="button"
              onClick={openSupplements}
              className="mt-2 inline-flex min-h-7 items-center gap-1.5 rounded-full bg-muted/45 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground/72 transition-colors active:bg-muted/70 active:text-foreground"
            >
              Supplements
              <CaretRight size={12} weight="bold" className="shrink-0" />
            </button>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <DateSelectorButton
              value={dateKey}
              todayKey={todayKey}
              onChange={setDateKey}
              open={dateSelectorOpen}
              onOpenChange={setDateSelectorOpen}
              label="Nutrition date"
            />
            {isToday && (
              <>
                <AppTooltip
                  id={APP_TOOLTIP_IDS.nutritionAdd}
                  content="Use add to log food, water, supplements, or a saved recipe from one place."
                  targetClassName="inline-flex md:hidden"
                  side="bottom"
                  align="end"
                >
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="app-header-icon-action"
                    aria-label="Add nutrition entry"
                  >
                    <Plus weight="bold" />
                  </button>
                </AppTooltip>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="app-header-icon-action hidden md:inline-flex"
                  aria-label="Add nutrition entry"
                >
                  <Plus weight="bold" />
                </button>
              </>
            )}
          </div>
        </header>

        {!isToday && (
          <section className="app-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="app-eyebrow">{dateLabel}</p>
                <p className="mt-1 text-[1.55rem] leading-none font-extrabold tabular-nums">
                  {fmt(intakeTotals.calories)} kcal
                </p>
                <p className="mt-1 text-[11px] font-semibold text-muted-foreground/58">
                  {entries.length} food · {fmtWater(waterTotal)} water ·{" "}
                  {supplementDone} supps
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="app-header-icon-action"
                aria-label="Add nutrition entry"
              >
                <Plus weight="bold" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <GoalTile
                label="Protein"
                value={`${fmt(intakeTotals.protein)}g`}
                detail={`${pct(intakeTotals.protein, macroTargets.protein)}%`}
                icon={<ForkKnife size={15} weight="bold" />}
                complete={intakeTotals.protein >= macroTargets.protein}
              />
              <GoalTile
                label="Carbs"
                value={`${fmt(intakeTotals.carbs)}g`}
                detail={`${pct(intakeTotals.carbs, macroTargets.carbs)}%`}
                icon={<ForkKnife size={15} weight="bold" />}
                complete={intakeTotals.carbs >= macroTargets.carbs}
              />
              <GoalTile
                label="Fat"
                value={`${fmt(intakeTotals.fat)}g`}
                detail={`${pct(intakeTotals.fat, macroTargets.fat)}%`}
                icon={<ForkKnife size={15} weight="bold" />}
                complete={intakeTotals.fat >= macroTargets.fat}
              />
            </div>

            <div className="mt-4 space-y-4 border-t border-border/35 pt-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="app-section-title">Food</p>
                  <button
                    type="button"
                    onClick={openFoodSearch}
                    className="app-header-icon-action h-8 min-h-8 w-8 min-w-8"
                    aria-label="Add food"
                  >
                    <Plus size={13} weight="bold" />
                  </button>
                </div>
                {entries.length > 0 ? (
                  <div className="space-y-2">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-muted/35 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold">
                            {entry.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground/55">
                            {timeLabel(entry.loggedAt)} · {fmt(entry.calories)}{" "}
                            kcal
                          </p>
                        </div>
                        {(entry.recipeId || entry.recipeDraft) && (
                          <button
                            type="button"
                            onClick={() => editRecipeFromLogEntry(entry)}
                            className="app-header-icon-action h-8 min-h-8 w-8 min-w-8 text-muted-foreground/70"
                            aria-label={`Edit recipe for ${entry.name}`}
                          >
                            <PencilSimple size={12} weight="bold" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFoodEntry(entry.id)}
                          className="app-header-icon-action h-8 min-h-8 w-8 min-w-8 text-destructive/70"
                          aria-label={`Remove ${entry.name}`}
                        >
                          <Trash size={12} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] leading-5 text-muted-foreground/58">
                    No food logged for this day.
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="app-section-title">Water</p>
                  <button
                    type="button"
                    onClick={() => void addWater(250)}
                    disabled={loggingWaterAmount !== null}
                    className="app-button app-button-quiet h-8 px-3 text-[11px]"
                  >
                    {loggingWaterAmount === 250 ? "Adding..." : "+250 ml"}
                  </button>
                </div>
                {waterEntries.length > 0 ? (
                  <div className="space-y-2">
                    {waterEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-muted/35 px-3 py-2.5"
                      >
                        <div>
                          <p className="text-[13px] font-bold">
                            {fmtWater(entry.amountMl)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground/55">
                            {timeLabel(entry.loggedAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeWaterEntry(entry.id)}
                          className="app-header-icon-action h-8 min-h-8 w-8 min-w-8 text-destructive/70"
                          aria-label={`Remove ${fmtWater(entry.amountMl)}`}
                        >
                          <Trash size={12} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] leading-5 text-muted-foreground/58">
                    No water logged for this day.
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="app-section-title">Supplements</p>
                  <button
                    type="button"
                    onClick={() => navigate("/supplements")}
                    className="app-header-icon-action h-8 min-h-8 w-8 min-w-8"
                    aria-label="Manage supplements"
                  >
                    <Pill size={13} weight="bold" />
                  </button>
                </div>
                {overview.logs.length + overview.legacyEntries.length > 0 ? (
                  <div className="space-y-2">
                    {overview.logs.map((log) => (
                      <div
                        key={String(log._id)}
                        className="flex items-center justify-between gap-2 rounded-xl bg-muted/35 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold">
                            {log.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground/55">
                            {timeLabel(log.loggedAt)} · {log.servingLabel}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            removeSupplementEntry(
                              log._id as Id<"supplementIntakeLogs">
                            )
                          }
                          className="app-header-icon-action h-8 min-h-8 w-8 min-w-8 text-destructive/70"
                          aria-label={`Remove ${log.name}`}
                        >
                          <Trash size={12} weight="bold" />
                        </button>
                      </div>
                    ))}
                    {overview.legacyEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl bg-muted/35 px-3 py-2.5"
                      >
                        <p className="truncate text-[13px] font-bold">
                          {entry.name ?? "Supplement"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/55">
                          {timeLabel(entry.loggedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] leading-5 text-muted-foreground/58">
                    No supplements logged for this day.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {!isToday && (
          <RecipeManagementBox
            recipes={recipes}
            deletingRecipeId={deletingRecipeId}
            onCreate={createRecipe}
            onEdit={editRecipe}
            onDelete={(recipe) => void deleteRecipe(recipe)}
          />
        )}

        {!isToday ? null : (
          <>
            <section className="app-surface p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="mt-2 text-[2.25rem] leading-none font-extrabold tabular-nums">
                    {visibleMetrics.calories
                      ? caloriesLeft >= 0
                        ? fmt(caloriesLeft)
                        : `+${fmt(Math.abs(caloriesLeft))}`
                      : loggedToday}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-muted-foreground/58">
                    {visibleMetrics.calories
                      ? `kcal ${caloriesLeft >= 0 ? "left" : "over"} · ${loggedToday} logs`
                      : `logs today · ${nutritionPlan?.trackingMode ?? "habit"} mode`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openFoodSearch}
                  className="app-header-icon-action"
                  aria-label={`Log ${currentMealLabel.toLowerCase()}`}
                >
                  <Plus weight="bold" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2.5 min-[430px]:grid-cols-3">
                <GoalTile
                  label={visibleMetrics.calories ? "Intake" : "Meals"}
                  value={
                    visibleMetrics.calories
                      ? `${pct(intakeTotals.calories, calorieTarget)}%`
                      : String(entries.length)
                  }
                  detail={
                    visibleMetrics.calories
                      ? `${fmt(intakeTotals.calories)} / ${fmt(calorieTarget)} kcal`
                      : "food logs today"
                  }
                  icon={<ForkKnife size={15} weight="bold" />}
                  complete={
                    visibleMetrics.calories
                      ? intakeTotals.calories > 0 && caloriesLeft >= 0
                      : entries.length > 0
                  }
                />
                <GoalTile
                  label="Water"
                  value={`${pct(waterTotal, waterGoal)}%`}
                  detail={`${fmtWater(waterTotal)} / ${fmtWater(waterGoal)}`}
                  icon={<PintGlass size={15} weight="bold" />}
                  complete={waterTotal >= waterGoal}
                />
                <GoalTile
                  label="Supps"
                  value={`${supplementDone}/${supplementTarget || 0}`}
                  detail={
                    supplementTarget > 0 ? "planned taken" : "none planned"
                  }
                  icon={<Pill size={15} weight="bold" />}
                  complete={
                    supplementTarget > 0 && supplementDone >= supplementTarget
                  }
                />
              </div>

              {isTrainingDay && visibleMetrics.calories && (
                <button
                  type="button"
                  onClick={() => navigate("/workouts", { motion: "switch" })}
                  className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-border/35 bg-muted/25 px-3 py-2.5 text-left transition-colors active:bg-muted/45"
                  aria-label="Open today’s workout"
                >
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-bold text-foreground/82">
                      Workout and nutrition are linked
                    </p>
                    <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/62">
                      {workoutAdjustmentEnabled
                        ? `Today’s target includes about ${fmt(workoutCalories)} kcal for training.`
                        : `Training is logged. Your ${fmt(calorieTarget)} kcal target stays fixed because workout adjustment is off.`}
                    </p>
                  </div>
                  <CaretRight
                    size={14}
                    weight="bold"
                    className="shrink-0 text-muted-foreground/55"
                  />
                </button>
              )}
            </section>

            <RecipeManagementBox
              recipes={recipes}
              deletingRecipeId={deletingRecipeId}
              onCreate={createRecipe}
              onEdit={editRecipe}
              onDelete={(recipe) => void deleteRecipe(recipe)}
            />

            {smartMealSuggestion && (
              <div className="mt-3">
                <SmartMealPresetCard
                  suggestion={smartMealSuggestion}
                  onSave={() => saveSmartMealPreset(smartMealSuggestion)}
                  onLog={() => logSmartMealPreset(smartMealSuggestion)}
                  onDismiss={() =>
                    dismissSmartMealSuggestion(smartMealSuggestion.key)
                  }
                  busy={smartMealBusyKey === smartMealSuggestion.key}
                />
              </div>
            )}

            {(compiledTarget?.calorieStrategy || targetGuidance.length > 0) && (
              <section className="app-surface mt-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/45 text-foreground/72">
                    <Sparkle size={16} weight="bold" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="app-section-title">Personalized plan</p>
                      {compiledTarget.safetyMode && (
                        <span className="rounded-full bg-muted/55 px-2 py-1 text-[10px] font-bold text-muted-foreground/70 uppercase">
                          {compiledTarget.safetyMode}
                        </span>
                      )}
                    </div>
                    {compiledTarget.calorieStrategy && (
                      <p className="mt-2 text-[12.5px] leading-5 font-semibold text-foreground/78">
                        {compiledTarget.calorieStrategy}
                      </p>
                    )}
                    {targetGuidance.length > 0 && (
                      <div className="mt-3 grid gap-1.5">
                        {targetGuidance.map((item) => (
                          <p
                            key={item}
                            className="text-[12px] leading-5 text-muted-foreground/62"
                          >
                            {item}
                          </p>
                        ))}
                      </div>
                    )}
                    {(compiledTarget.fiber ||
                      compiledTarget.saturatedFatLimit ||
                      compiledTarget.sodiumLimit) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {compiledTarget.fiber && (
                          <span className="rounded-full bg-muted/45 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground/72">
                            Fiber {fmt(compiledTarget.fiber)}g
                          </span>
                        )}
                        {compiledTarget.saturatedFatLimit && (
                          <span className="rounded-full bg-muted/45 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground/72">
                            Sat fat &lt; {fmt(compiledTarget.saturatedFatLimit)}
                            g
                          </span>
                        )}
                        {compiledTarget.sodiumLimit && (
                          <span className="rounded-full bg-muted/45 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground/72">
                            Sodium &lt; {fmt(compiledTarget.sodiumLimit)}mg
                          </span>
                        )}
                      </div>
                    )}
                    {calibration && (
                      <div className="mt-3 rounded-[0.9rem] bg-muted/30 px-3 py-2.5">
                        <p className="text-[12px] font-bold text-foreground/78">
                          {calibration.title}
                        </p>
                        <p className="mt-1 text-[11.5px] leading-4 text-muted-foreground/60">
                          {calibration.detail}
                        </p>
                        {calibration.canApply && calibration.targets && (
                          <button
                            type="button"
                            onClick={() => void applyPlanCalibration()}
                            disabled={applyingCalibration}
                            className="app-header-icon-action mt-2"
                            aria-label={
                              applyingCalibration
                                ? "Applying nutrition adjustment"
                                : "Apply nutrition adjustment"
                            }
                          >
                            <Sparkle weight="bold" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}
            <section className="mt-3 grid gap-3 md:grid-cols-[1fr_0.82fr]">
              <div className="app-surface p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="app-section-title">Intake</p>
                  <button
                    type="button"
                    onClick={openFoodSearch}
                    className="app-header-icon-action"
                    aria-label="Log food"
                  >
                    <ForkKnife weight="bold" />
                  </button>
                </div>
                <div className="space-y-2.5">
                  {(Object.keys(macroTargets) as MacroKey[])
                    .filter((key) =>
                      visibleMetrics.macros
                        ? true
                        : key === "protein" && visibleMetrics.protein
                    )
                    .map((key) => (
                      <ProgressLine
                        key={key}
                        label={key[0].toUpperCase() + key.slice(1)}
                        value={intakeTotals[key]}
                        target={macroTargets[key]}
                        suffix="g"
                        color={MACRO_COLORS[key]}
                      />
                    ))}
                  {!visibleMetrics.macros && !visibleMetrics.protein && (
                    <p className="text-[12px] leading-5 text-muted-foreground/58">
                      This mode keeps nutrition feedback non-numeric. Log meals
                      when useful and focus on consistency.
                    </p>
                  )}
                </div>
                <div className="mt-4 border-t border-border/35 pt-3">
                  {recentFood.length > 0 ? (
                    <div className="space-y-2">
                      {recentFood.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-bold">
                              {entry.name}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground/55">
                              {timeLabel(entry.loggedAt)}
                            </p>
                          </div>
                          {(entry.recipeId || entry.recipeDraft) && (
                            <button
                              type="button"
                              onClick={() => editRecipeFromLogEntry(entry)}
                              className="app-header-icon-action h-8 min-h-8 w-8 min-w-8 text-muted-foreground/70"
                              aria-label={`Edit recipe for ${entry.name}`}
                            >
                              <PencilSimple size={12} weight="bold" />
                            </button>
                          )}
                          <span className="shrink-0 text-[12px] font-bold tabular-nums">
                            {fmt(entry.calories)} kcal
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] leading-5 text-muted-foreground/58">
                      No food logged yet. Search, scan, or snap a meal.
                    </p>
                  )}
                </div>

                {visibleMetrics.micros && (
                  <MicroBreakdown
                    open={microsOpen}
                    onToggle={() => setMicrosOpen((value) => !value)}
                    totals={microTotals}
                  />
                )}
                {(visibleMetrics.calories ||
                  visibleMetrics.macros ||
                  visibleMetrics.protein) && (
                  <GoalsCardWrapper
                    goals={customGoalTargets}
                    apiGoals={apiGoals}
                    onSave={async (nextGoals) => {
                      await saveCustomGoals(nextGoals)
                    }}
                  />
                )}
              </div>

              <div className="grid gap-3">
                <div className="app-surface p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="app-section-title">Water</p>
                    <button
                      type="button"
                      onClick={() => setWaterGoalOpen(true)}
                      className="app-header-icon-action"
                      aria-label="Edit water goal"
                    >
                      <PencilSimple weight="bold" />
                    </button>
                  </div>
                  <ProgressLine
                    label="Hydration"
                    value={waterTotal}
                    target={waterGoal}
                    suffix="ml"
                    color={APP_ACCENT_COLORS.water}
                  />
                  <WaterGlassControls
                    totalMl={waterTotal}
                    goalMl={waterGoal}
                    entries={waterEntries}
                    onAdd={(amountMl) => void addWater(amountMl)}
                    onRemoveLast={removeLastWaterEntry}
                    savingAmount={loggingWaterAmount}
                  />
                  <div className="mt-4 grid grid-cols-2 gap-2.5 min-[430px]:grid-cols-4">
                    {QUICK_WATER.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        disabled={loggingWaterAmount !== null}
                        aria-busy={loggingWaterAmount === amount}
                        onClick={() => void addWater(amount)}
                        className="app-button app-button-quiet justify-center"
                      >
                        {loggingWaterAmount === amount
                          ? "Adding..."
                          : `+${fmtWater(amount)}`}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCustomWaterOpen(true)}
                      disabled={loggingWaterAmount !== null}
                      className="app-button app-button-quiet justify-center"
                    >
                      Custom
                    </button>
                  </div>
                </div>

                <div className="app-surface p-4">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="app-section-title">Supplements</p>
                    <button
                      type="button"
                      onClick={() => navigate("/supplements")}
                      className="app-header-icon-action"
                      aria-label="Manage supplements"
                    >
                      <Pill weight="bold" />
                    </button>
                  </div>
                  {visibleSupplements.length > 0 ? (
                    <div>
                      {visibleSupplements.map((plan) => (
                        <SupplementRow
                          key={plan.item._id ?? plan.item.name}
                          plan={plan}
                          onTake={takeSupplement}
                          saving={loggingSupplementId === String(plan.item._id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[12px] leading-5 text-muted-foreground/58">
                      No active supplement plan. Add one when you need it.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {customWaterOpen && (
        <CustomWaterSheet
          amount={customWaterAmount}
          onAmountChange={setCustomWaterAmount}
          onAdd={async () => {
            const saved = await addWater(customWaterAmount)
            if (saved) setCustomWaterOpen(false)
          }}
          onClose={() => setCustomWaterOpen(false)}
        />
      )}

      {waterGoalOpen && (
        <WaterGoalSheet
          goalMl={waterGoal}
          saving={savingWaterGoal}
          onSave={saveWaterGoal}
          onClose={() => setWaterGoalOpen(false)}
        />
      )}

      {describeOpen && (
        <DescribeMealSheet
          busy={describeBusy}
          onSubmit={(text) => {
            void handleDescribeMeal(text)
          }}
          onClose={() => setDescribeOpen(false)}
        />
      )}

      {loggingRecipe && (
        <RecipeLogSheet
          recipe={loggingRecipe}
          savingMeal={savingRecipeMeal}
          onLog={async (meal) => {
            if (savingRecipeMeal) return
            setSavingRecipeMeal(meal)
            try {
              await logRecipeToMeal(loggingRecipe, meal)
              setLoggingRecipe(null)
            } finally {
              setSavingRecipeMeal(null)
            }
          }}
          onEdit={() => {
            const recipe = loggingRecipe
            setLoggingRecipe(null)
            if (recipe._id) {
              navigate(`/foods/recipe/${recipe._id}`)
              return
            }
            navigate("/foods/recipe/new", {
              state: { draftRecipe: recipe },
            })
          }}
          onClose={() => setLoggingRecipe(null)}
        />
      )}

      {addOpen && (
        <MobileSheet
          onClose={() => setAddOpen(false)}
          overlayClassName="bg-black/45 backdrop-blur-[6px]"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)] md:!w-full md:!max-w-sm"
          panelStyle={{
            paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
          }}
          maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
        >
          <div className="px-4 pt-1 pb-4">
            {quickRepeatFoods.length > 0 && (
              <section className="mb-3" aria-label="Repeat foods">
                <p className="mb-2 px-1 text-[10px] font-bold tracking-[0.14em] text-muted-foreground/38 uppercase">
                  Repeat
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {quickRepeatFoods.map((food) => {
                    const busy = quickRepeatBusyKey === food.key
                    return (
                      <button
                        key={food.key}
                        type="button"
                        onClick={() => void repeatFood(food.entry, food.key)}
                        disabled={quickRepeatBusyKey !== null}
                        aria-busy={busy}
                        aria-label={`Log ${food.entry.name} again, ${fmt(
                          food.entry.calories
                        )} kilocalories${
                          food.count > 1
                            ? `; logged ${food.count} times recently`
                            : ""
                        }`}
                        className="relative flex min-h-[5.2rem] min-w-0 flex-col items-center justify-center rounded-2xl bg-muted/45 px-1.5 text-center transition-colors active:bg-muted disabled:opacity-55"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background/65 text-muted-foreground/68">
                          {busy ? (
                            <span className="h-3 w-3 animate-spin rounded-full border border-muted-foreground/20 border-t-muted-foreground/70" />
                          ) : (
                            <ForkKnife size={13} weight="bold" />
                          )}
                        </span>
                        <span className="mt-1.5 w-full truncate text-[10.5px] font-semibold text-foreground/80">
                          {food.entry.name}
                        </span>
                        <span className="mt-0.5 text-[9px] font-semibold text-muted-foreground/42 tabular-nums">
                          {fmt(food.entry.calories)} kcal
                        </span>
                        {food.count > 1 && (
                          <span
                            aria-hidden="true"
                            className="absolute top-1.5 right-1.5 rounded-full bg-background/80 px-1 py-0.5 text-[8px] font-bold text-muted-foreground/55 tabular-nums"
                          >
                            {food.count}×
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
            <div className="app-surface overflow-hidden">
              {[
                {
                  label: "Search food",
                  detail: "Manual log",
                  Icon: MagnifyingGlass,
                  supportsHistory: true,
                  action: openFoodSearch,
                },
                {
                  label: "Scan barcode",
                  detail: "Packaged food",
                  Icon: Barcode,
                  action: () => navigate("/camera?mode=barcode"),
                },
                {
                  label: "Snap meal",
                  detail: "Estimate from photo",
                  Icon: Aperture,
                  requiresAiAccess: true,
                  action: openSnapCamera,
                },
                {
                  label: "Describe meal",
                  detail: "AI builds a temporary recipe",
                  Icon: Sparkle,
                  requiresAiAccess: true,
                  action: openDescribeMeal,
                },
                {
                  label: "Add 250 ml water",
                  detail: "Quick hydration",
                  Icon: PintGlass,
                  supportsHistory: true,
                  action: () => void addWater(250),
                },
                {
                  label: "Manage supplements",
                  detail: "Plan and log doses",
                  Icon: Pill,
                  action: () => navigate("/supplements"),
                },
              ]
                .filter((item) => isToday || item.supportsHistory)
                .map(
                  (
                    { label, detail, Icon, action, requiresAiAccess },
                    index
                  ) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        if (requiresAiAccess && !requireAiAccess()) return
                        setAddOpen(false)
                        action()
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors active:bg-muted/35",
                        index > 0 && "border-t border-border/40"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="app-icon-button pointer-events-none h-9 w-9 bg-muted/55 text-muted-foreground/70">
                          <Icon size={16} weight="bold" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold">
                            {label}
                          </span>
                          <span className="block text-[11.5px] text-muted-foreground/60">
                            {detail}
                          </span>
                        </span>
                      </span>
                      <CaretRight
                        size={12}
                        className="text-muted-foreground/35"
                      />
                    </button>
                  )
                )}
              {recipes.length > 0 && (
                <>
                  <div className="border-t border-border/40 px-4 pt-3 pb-1">
                    <p className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground/38 uppercase">
                      Saved recipes
                    </p>
                  </div>
                  {recipes.slice(0, 5).map((recipe) => {
                    const totals = totalsForRecipe(recipe.ingredients)
                    return (
                      <div
                        key={recipe._id ?? recipe.name}
                        className="flex w-full items-center gap-1 px-2 py-1"
                      >
                        <button
                          type="button"
                          onClick={() => logRecipe(recipe)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-colors active:bg-muted/40"
                        >
                          <div className="min-w-0 text-left">
                            <p className="truncate text-[13px] font-medium">
                              {recipe.name}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-muted-foreground/45">
                              {totals.calories} kcal ·{" "}
                              {recipe.ingredients.length} ingredient
                              {recipe.ingredients.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          <CaretRight
                            size={11}
                            className="shrink-0 text-muted-foreground/30"
                          />
                        </button>
                        {recipe._id && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddOpen(false)
                              navigate(`/foods/recipe/${recipe._id}`)
                            }}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground/50 transition-colors active:bg-muted/40"
                            aria-label={`Edit ${recipe.name}`}
                          >
                            <PencilSimple size={13} weight="bold" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </MobileSheet>
      )}

      {aiAccessModal}
    </div>
  )
}
