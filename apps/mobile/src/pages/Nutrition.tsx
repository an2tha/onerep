import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useSearchParams } from "react-router"
import { createPortal } from "react-dom"
import {
  Aperture,
  ArrowCounterClockwise,
  Barcode,
  BookBookmark,
  BowlFood,
  CaretDown,
  CaretRight,
  CheckCircle,
  Clock,
  ForkKnife,
  MagnifyingGlass,
  PencilSimple,
  Pill,
  Plus,
  Printer,
  ShoppingCart,
  Sparkle,
  Timer,
  Trash,
  X,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { convexClient } from "@/lib/convex"
import { MobileSheet } from "@/components/mobile-sheet"
import { CoachSheet } from "@/components/coach-sheet"
import { FastingSheet } from "@/components/fasting-sheet"
import { useBottomBarAction } from "@/components/bottom-bar"
import { SlideToDeleteRow } from "@repo/ui"
import { TourAnchor, useTourAnchor } from "@/components/walkthrough/tour-anchor"
import { DateSelectorButton } from "@repo/ui"
import { useSmoothNavigate } from "@/lib/navigation"
import { updateOneRepWidgets } from "@/lib/home-widgets"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { cn, safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"
import {
  FOOD_MICRONUTRIENT_KEYS,
  currentDateKey,
  defaultMeal,
  findSmartMealPresetSuggestion,
  foodLogEntriesFromMealPreset,
  mealLabel,
  nutritionDetailTotals,
  offsetDateKey,
  stripUndefined,
  DEFAULT_MEAL_CATEGORIES,
  type FoodLogEntry,
  type FoodMicronutrientKey,
  type MealPreset,
  type MealType,
  type Recipe,
  type RecipeIngredient,
  type RepeatMeal,
  type SmartMealPresetSuggestion,
} from "@/lib/food-log"
import type { NutritionPlan } from "@/lib/health-goals"
import {
  carbLabel,
  displayCarbGoal,
  netCarbs,
  type CarbDisplayMode,
} from "@/lib/carb-display"
import { mealTargetProgress } from "@/lib/meal-targets"
import { formatFastDuration } from "@/lib/fasting"
import { useFastTimer } from "@/lib/use-fast-timer"
import {
  buildSupplementDayPlan,
  combineMacroTotals,
  combineMicronutrientTotals,
  type SupplementDayPlanItem,
  type SupplementIntakeLog,
  type SupplementItem,
} from "@/lib/supplements"
import { APP_ACCENT_COLORS, MACRO_COLORS, MICRO_COLORS } from "@repo/ui"
import { useAiFeatureGate } from "@/lib/ai-access"
import { buildQuickRepeatFoods } from "@/lib/food-quick-repeat"
import { hapticMedium, hapticSelection, hapticTap } from "@/lib/haptics"
import { COACH_RECIPE_PLACEHOLDER } from "@/lib/recipe-images"
import {
  clampSnapGrams,
  snapDetectionsFromAiResult,
  type SnapAiResult,
  type SnapFoodMatch,
} from "@/lib/food-snap-review"
import type { FoodResult } from "@repo/models"
import { toast } from "@repo/ui"

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

const QUICK_WATER = [250]
const FAST_RING_R = 33
const FAST_RING_C = 2 * Math.PI * FAST_RING_R
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

/** Coarse countdown for the fasting ring: "3h 47m", or "12m" under the hour. */
function fmtFastRemaining(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60))
  const hours = Math.floor(minutes / 60)
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`
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

function ProgressLine({
  label,
  value,
  target,
  suffix,
  color,
  format,
  animateChanges = false,
  rainKey = 0,
}: {
  label: string
  value: number
  target: number
  suffix: string
  color: string
  format?: (n: number) => string
  animateChanges?: boolean
  rainKey?: number
}) {
  const display = (n: number) => (format ? format(n) : fmt(n))
  return (
    <div className="relative overflow-hidden">
      {rainKey > 0 && (
        <span
          key={rainKey}
          className="water-rain nutrient-micro-rain"
          style={{ "--nutrient-rain-color": color } as CSSProperties}
          aria-hidden
        >
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} />
          ))}
        </span>
      )}
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">
          {label}
        </span>
        <span
          key={animateChanges ? value : undefined}
          className={cn(
            "text-[13px] font-semibold text-foreground tabular-nums",
            animateChanges && "motion-number-refresh"
          )}
        >
          {display(value)}
          <span className="font-medium text-muted-foreground">
            {" "}
            / {display(target)}
            {format ? "" : ` ${suffix}`}
          </span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            animateChanges && "water-progress-refresh"
          )}
          style={{ width: `${pct(value, target)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ─── The day, as three dials ───────────────────────────────────────────────
// Protein takes the centre and the larger ring because it is the number people
// actually chase; calories and fat flank it, tucked behind its edges so the
// three read as one instrument rather than three widgets in a row.
const DIAL_RADIUS = 44
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS

function MacroDial({
  name,
  value,
  target,
  suffix,
  color,
  size,
  stroke,
  mirrored = false,
  emphasis = false,
  compact = false,
  className,
  style,
  rainKey = 0,
}: {
  name: string
  value: number
  target: number
  suffix: string
  color: string
  size: number
  stroke: number
  /**
   * Mirrors the sweep so a flanking dial fills away from the centre one.
   * Without it the arc runs straight under its neighbour and comes out the
   * far side as a floating sliver.
   */
  mirrored?: boolean
  /** The centre dial states its goal outright; the flanking two stay terse. */
  emphasis?: boolean
  /** Shrunk to a bare ring, for when something else owns the hero. */
  compact?: boolean
  className?: string
  style?: CSSProperties
  rainKey?: number
}) {
  const reached = target > 0 ? Math.min(1, value / target) : 0
  // The glass pane fills the ring exactly: the track's inner edge is the
  // radius minus half its own stroke, in the same 100-unit space the svg uses.
  const glassInset = `${50 - (DIAL_RADIUS - stroke / 2)}%`
  return (
    <div
      className={cn(
        // The halo sits a hair outside the drawn ring, so where two dials
        // overlap the front one cuts a clean gap instead of colliding.
        "relative shrink-0 rounded-full shadow-[0_0_0_4px_var(--background)]",
        className
      )}
      style={{ width: size, height: size, ...style }}
      role="img"
      aria-label={`${name}: ${fmt(value)} of ${fmt(target)}${suffix}, ${target > 0 ? pct(value, target) : 0}% of goal`}
    >
      {rainKey > 0 && (
        <span
          key={rainKey}
          className="water-rain nutrient-micro-rain"
          style={{ "--nutrient-rain-color": color } as CSSProperties}
          aria-hidden
        >
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} />
          ))}
        </span>
      )}
      <span
        className="macro-dial-glass"
        style={{ inset: glassInset }}
        aria-hidden="true"
      />
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full"
        style={{
          transform: mirrored ? "scaleX(-1) rotate(-90deg)" : "rotate(-90deg)",
        }}
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={DIAL_RADIUS}
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity={0.08}
          strokeWidth={stroke}
        />
        <circle
          cx="50"
          cy="50"
          r={DIAL_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={DIAL_CIRCUMFERENCE}
          strokeDashoffset={DIAL_CIRCUMFERENCE * (1 - reached)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      {!compact && (
        <div className="absolute inset-[18%] flex flex-col items-center justify-center overflow-hidden">
          <p
            className={cn(
              "leading-none font-extrabold tabular-nums",
              emphasis ? "text-[2rem]" : "text-[1.15rem]"
            )}
            aria-hidden="true"
          >
            <span key={value} className="motion-number-refresh inline-block">
              {fmt(value)}
            </span>
            <span
              className={cn(
                "font-bold",
                emphasis ? "text-[15px]" : "text-[12px]"
              )}
              style={{ color }}
            >
              {suffix}
            </span>
          </p>
          <p
            className={cn(
              "mt-1 leading-tight text-muted-foreground",
              emphasis ? "text-[12px]" : "text-[11px]"
            )}
            aria-hidden="true"
          >
            {name}
          </p>
          {emphasis && (
            <p
              className="text-[11px] leading-tight text-muted-foreground/80 tabular-nums"
              aria-hidden="true"
            >
              of {fmt(target)}
              {suffix}
            </p>
          )}
        </div>
      )}
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
        <span className="text-[15px] font-semibold">Micronutrients</span>
        <span className="flex items-center gap-2">
          {highlights.length > 0 && (
            <span className="hidden max-w-[11rem] truncate text-[13px] font-medium text-muted-foreground tabular-nums min-[390px]:block">
              {highlights
                .map((row) => `${row.label} ${fmtMicro(row.value, row.unit)}`)
                .join(" · ")}
            </span>
          )}
          <CaretDown
            size={13}
            weight="bold"
            className={cn(
              "text-muted-foreground transition-transform",
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
            <p className="border-t border-border py-3 text-[14px] leading-5 text-muted-foreground">
              Nothing logged yet.
            </p>
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {rows.map((row) => {
                const hasValue = row.value > 0
                const progress = row.target ? pct(row.value, row.target) : null
                return (
                  <div
                    key={row.key}
                    className={cn(
                      "min-h-12 px-1 py-2.5",
                      !hasValue && "opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="truncate text-[14px] font-medium">
                          {row.label}
                        </span>
                      </span>
                      <span className="shrink-0 text-[14px] font-semibold tabular-nums">
                        {fmtMicro(row.value, row.unit)}
                        {row.target && (
                          <span className="font-medium text-muted-foreground">
                            {" "}
                            / {fmtMicro(row.target, row.unit)}
                          </span>
                        )}
                      </span>
                    </div>
                    {row.target && (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                        <div
                          className="h-full rounded-full transition-[width] duration-500 ease-out"
                          style={{
                            width: `${progress}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
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
            <span className="mt-1 block text-[13px] font-medium text-muted-foreground">
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
            className="flex h-11 w-11 items-center justify-center rounded-[10px] text-muted-foreground transition-colors active:bg-muted"
          >
            <X size={12} weight="bold" />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-[13px] font-medium">Water</span>
            <span className="text-[13px] text-muted-foreground">ml</span>
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

/**
 * Per-meal calorie budget.
 *
 * The food list on this page is flat rather than grouped into meal sections,
 * so the budget renders as its own panel instead of as per-section headers.
 */
function MealBudgetPanel({
  entries,
  targets,
}: {
  entries: FoodLogEntry[]
  targets: { meal: string; percent: number; calories: number }[]
}) {
  const consumedByMeal = useMemo(() => {
    const totals = new Map<string, number>()
    for (const entry of entries) {
      const meal = entry.meal || "other"
      const calories =
        Number.isFinite(entry.calories) && entry.calories > 0
          ? entry.calories
          : 0
      totals.set(meal, (totals.get(meal) ?? 0) + calories)
    }
    return totals
  }, [entries])

  // A meal with neither a budget nor anything logged is noise; hide it.
  const rows = targets.filter(
    (target) =>
      target.calories > 0 || (consumedByMeal.get(target.meal) ?? 0) > 0
  )
  if (rows.length === 0) return null

  return (
    <div>
      <p className="app-section-title mb-2">Calories by meal</p>
      <div
        className="divide-y divide-border border-y border-border"
        aria-label="Calories by meal"
      >
        {rows.map((target) => {
          const consumed = Math.round(consumedByMeal.get(target.meal) ?? 0)
          const { ratio, state } = mealTargetProgress(consumed, target.calories)
          return (
            <div key={target.meal} className="px-1 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="native-row-title">
                  {mealLabel(target.meal)}
                </span>
                <span
                  className="native-row-detail tabular-nums"
                  aria-label={`${mealLabel(target.meal)}: ${consumed} of ${
                    target.calories
                  } kcal`}
                >
                  {consumed} / {target.calories} kcal
                </span>
              </div>
              <div
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
                role="presentation"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-300",
                    state === "over" ? "bg-destructive" : "bg-foreground"
                  )}
                  style={{ width: `${Math.min(100, ratio * 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GoalsCardWrapper({
  goals,
  apiGoals,
  onSave,
  carbMode,
}: {
  goals: GoalOverride
  apiGoals: GoalOverride | null
  onSave: (goals: GoalOverride) => void | Promise<void>
  carbMode: CarbDisplayMode
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
        <span className="text-[15px] font-semibold">Daily goals</span>
        <CaretDown
          size={13}
          weight="bold"
          className={cn(
            "text-muted-foreground transition-transform",
            editing && "rotate-180"
          )}
        />
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
                  <span className="text-[13px] text-muted-foreground">
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
          {carbMode === "net" && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Carbs is your total-carb goal. Net carbs display subtracts your
              fiber target from it.
            </p>
          )}
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
    <section className="border-y border-border px-1 py-3">
      <div className="flex items-start gap-3">
        {isSave ? (
          <BookBookmark
            size={18}
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
        ) : (
          <ForkKnife
            size={18}
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-snug font-semibold">
            {isSave ? `Save usual ${meal}` : `Log usual ${meal}`}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {summary || fallbackName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[13px] font-medium text-muted-foreground tabular-nums">
              {Math.round(totals.calories)} kcal
            </span>
            <span className="text-[13px] text-muted-foreground tabular-nums">
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
          className="app-icon-button h-11 w-11 bg-transparent text-muted-foreground disabled:opacity-35"
        >
          <X size={10} weight="bold" />
        </button>
      </div>

      <div className="mt-2 pl-7">
        <button
          type="button"
          onClick={() => {
            void (isSave ? onSave() : onLog())
          }}
          disabled={busy}
          aria-busy={busy}
          className="min-h-10 text-[13px] font-semibold text-[var(--accent-food)] disabled:opacity-55"
        >
          {busy
            ? isSave
              ? "Saving..."
              : "Logging..."
            : isSave
              ? "Save as preset"
              : `Log usual ${meal}`}
        </button>
      </div>
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
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
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
        className="min-h-36 w-full resize-none rounded-[10px] border border-border bg-muted/35 px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground focus:border-foreground disabled:opacity-60"
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
      <p className="mb-0.5 truncate text-[13px] text-muted-foreground">
        {recipe.name}
      </p>
      <p className="mb-3 text-[13px] text-muted-foreground tabular-nums">
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
                  className="text-[13px] font-medium"
                  style={{ color: cat.color }}
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
  embedded = false,
}: {
  recipes: Recipe[]
  deletingRecipeId: string | null
  onCreate: () => void
  onEdit: (recipe: Recipe) => void
  onDelete: (recipe: Recipe) => void
  embedded?: boolean
}) {
  return (
    <section
      className={cn(embedded ? "py-3" : "mt-4 border-y border-border py-4")}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="app-section-title">Recipes</p>
          <p className="native-row-detail mt-0.5">
            {recipes.length === 0
              ? "No saved recipes"
              : `${recipes.length} saved`}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="native-toolbar-button border-border hover:bg-card"
        >
          <Plus size={16} weight="bold" />
          New
        </button>
      </div>

      {recipes.length === 0 ? (
        <button
          type="button"
          onClick={onCreate}
          className="flex min-h-16 w-full items-center gap-3 border-y border-border px-1 text-left transition-colors active:bg-muted/20"
        >
          <BookBookmark size={20} className="text-muted-foreground" />
          <div className="text-left">
            <p className="native-row-title">Create recipe</p>
            <p className="native-row-detail">Save a meal you log regularly.</p>
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
                {(recipe.photoUrls?.[0] || recipe.placeholderImage) && (
                  <img
                    src={recipe.photoUrls?.[0] ?? COACH_RECIPE_PLACEHOLDER}
                    alt=""
                    className="size-12 shrink-0 rounded-xl object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="native-row-title truncate">{recipe.name}</p>
                  <p className="native-row-detail mt-0.5 tabular-nums">
                    {totals.calories} kcal · {recipe.ingredients.length}{" "}
                    ingredient{recipe.ingredients.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(recipe)}
                  className="native-toolbar-button h-11 w-11 px-0 text-muted-foreground"
                  aria-label={`Edit ${recipe.name}`}
                >
                  <PencilSimple size={17} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(recipe)}
                  disabled={deleting || !recipe._id}
                  aria-busy={deleting}
                  className="native-toolbar-button h-11 w-11 px-0 text-destructive disabled:opacity-45"
                  aria-label={`Delete ${recipe.name}`}
                >
                  <Trash size={17} weight="bold" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function formatRepeatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/** Fields the repeat-meal template keeps from a logged entry. */
function repeatMealTemplateEntry(entry: FoodLogEntry) {
  return {
    id: entry.id,
    name: entry.name,
    calories: entry.calories || 0,
    protein: entry.protein || 0,
    carbs: entry.carbs || 0,
    fat: entry.fat || 0,
    meal: entry.meal,
    loggedAt: entry.loggedAt,
    ...(entry.quantityGrams != null
      ? { quantityGrams: entry.quantityGrams }
      : {}),
    ...(entry.servingGrams != null ? { servingGrams: entry.servingGrams } : {}),
    ...(entry.servingLabel ? { servingLabel: entry.servingLabel } : {}),
  }
}

/**
 * Repeat meals: foods the server logs for you at the same local time daily.
 *
 * Creation deliberately starts from something already logged today — a meal
 * you can see — rather than a second food-search flow: describe when it should
 * repeat, not what food is.
 */
function RepeatMealBox({
  todaysEntries,
  embedded = false,
}: {
  todaysEntries: FoodLogEntry[]
  embedded?: boolean
}) {
  const repeatMealsQuery = useQuery(api.logs.repeatMeals.list, {})
  const saveRepeatMeal = useOfflineMutation(
    api.logs.repeatMeals.save,
    "logs.repeatMeals.save"
  )
  const setRepeatMealEnabled = useOfflineMutation(
    api.logs.repeatMeals.setEnabled,
    "logs.repeatMeals.setEnabled"
  )
  const removeRepeatMeal = useOfflineMutation(
    api.logs.repeatMeals.remove,
    "logs.repeatMeals.remove"
  )

  const meals = (repeatMealsQuery ?? []) as RepeatMeal[]
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState("")
  const [draftMeal, setDraftMeal] = useState<MealType>(
    DEFAULT_MEAL_CATEGORIES[0]?.id ?? "breakfast"
  )
  const [draftTime, setDraftTime] = useState("07:00")
  const [saving, setSaving] = useState(false)

  const sourceEntries = todaysEntries.filter(
    (entry) => (entry.meal || "other") === draftMeal
  )
  const canSave =
    draftName.trim().length > 0 && sourceEntries.length > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    const [hour, minute] = draftTime.split(":").map(Number)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return
    setSaving(true)
    try {
      await saveRepeatMeal({
        name: draftName.trim(),
        meal: draftMeal,
        hour,
        minute,
        entries: sourceEntries.map(repeatMealTemplateEntry),
      })
      setCreating(false)
      setDraftName("")
      toast.success("It logs itself from tomorrow")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save this meal"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className={cn(embedded ? "py-3" : "mt-4 border-y border-border py-4")}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="app-section-title">Repeat meals</p>
          <p className="native-row-detail mt-0.5">
            Logged for you at the same time every day
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            hapticTap()
            setCreating((current) => !current)
          }}
          aria-label={creating ? "Close new repeat meal" : "New repeat meal"}
          aria-expanded={creating}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted active:text-foreground"
        >
          {creating ? (
            <X size={16} weight="bold" />
          ) : (
            <Plus size={16} weight="bold" />
          )}
        </button>
      </div>

      {creating && (
        <div className="mb-3 rounded-2xl border border-border/60 p-3">
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Name it — “weekday breakfast”"
            aria-label="Repeat meal name"
            className="h-11 w-full rounded-xl border border-border bg-transparent px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
          />
          <div className="mt-2 flex items-center gap-2">
            <select
              value={draftMeal}
              onChange={(event) => setDraftMeal(event.target.value)}
              aria-label="Meal to log into"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-transparent px-3 text-[14px] font-medium outline-none"
            >
              {DEFAULT_MEAL_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={draftTime}
              onChange={(event) => setDraftTime(event.target.value)}
              aria-label="Time of day to log it"
              className="h-11 rounded-xl border border-border bg-transparent px-3 text-[14px] font-medium tabular-nums outline-none"
            />
          </div>
          <p className="native-row-detail mt-2">
            {sourceEntries.length > 0
              ? `Uses today's ${mealLabel(draftMeal).toLowerCase()}: ${sourceEntries
                  .map((entry) => entry.name)
                  .join(", ")}`
              : `Log today's ${mealLabel(draftMeal).toLowerCase()} first — the repeat copies it.`}
          </p>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            aria-busy={saving}
            className="mt-3 h-11 w-full rounded-xl bg-foreground text-[14px] font-semibold text-background transition-opacity active:opacity-85 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Repeat this meal daily"}
          </button>
        </div>
      )}

      {meals.length === 0 && !creating ? (
        <p className="native-row-detail border-y border-border/60 px-1 py-4">
          Nothing repeats yet. Log a meal you eat every day, then save it here
          and stop typing it.
        </p>
      ) : (
        <div className="divide-y divide-border/30 border-y border-border/60">
          {meals.map((meal) => (
            <div
              key={meal.id ?? meal._id}
              className={cn(
                "flex min-h-16 items-center gap-3 px-1 py-2.5",
                !meal.enabled && "opacity-55"
              )}
            >
              <Clock size={17} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="native-row-title truncate">{meal.name}</p>
                <p className="native-row-detail mt-0.5 truncate">
                  {formatRepeatTime(meal.hour, meal.minute)} ·{" "}
                  {mealLabel(meal.meal)} · {meal.entries.length} food
                  {meal.entries.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void setRepeatMealEnabled({
                    id: meal._id as Id<"repeatMeals">,
                    enabled: !meal.enabled,
                  }).catch(() => toast.error("Could not update this meal"))
                }
                aria-pressed={meal.enabled}
                aria-label={`${meal.enabled ? "Pause" : "Resume"} ${meal.name}`}
                className={cn(
                  "h-9 shrink-0 rounded-xl px-3 text-[12px] font-semibold transition-colors",
                  meal.enabled
                    ? "bg-muted/50 text-foreground/75 active:bg-muted"
                    : "bg-foreground text-background active:opacity-85"
                )}
              >
                {meal.enabled ? "Pause" : "Resume"}
              </button>
              <button
                type="button"
                onClick={() =>
                  void removeRepeatMeal({
                    id: meal._id as Id<"repeatMeals">,
                  }).catch(() => toast.error("Could not delete this meal"))
                }
                aria-label={`Delete ${meal.name}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-destructive/10 active:text-destructive"
              >
                <Trash size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function GoalTile({
  label,
  value,
  detail,
  complete,
}: {
  label: string
  value: string
  detail: string
  complete: boolean
}) {
  return (
    <div className="flex min-h-14 w-full items-center gap-3 px-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{label}</p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {detail} of target
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <p className="text-[17px] font-semibold tabular-nums">{value}</p>

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
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
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
  const nutritionHeaderRef = useTourAnchor("nutrition-header")
  const [searchParams, setSearchParams] = useSearchParams()
  const [addOpen, setAddOpen] = useState(false)
  const [microsOpen, setMicrosOpen] = useState(false)
  const [fastingOpen, setFastingOpen] = useState(false)
  const [showAllFood, setShowAllFood] = useState(false)
  const [customWaterOpen, setCustomWaterOpen] = useState(false)
  const [dateSelectorOpen, setDateSelectorOpen] = useState(false)
  const [customWaterAmount, setCustomWaterAmount] = useState(350)
  const [waterGoalOpen, setWaterGoalOpen] = useState(false)
  const [savingWaterGoal, setSavingWaterGoal] = useState(false)
  const [loggingWaterAmount, setLoggingWaterAmount] = useState<number | null>(
    null
  )
  const [waterRainKey, setWaterRainKey] = useState(0)
  const [waterGoalCelebration, setWaterGoalCelebration] = useState(false)
  const [calorieGoalCelebration, setCalorieGoalCelebration] = useState(false)
  const [nutrientRainKeys, setNutrientRainKeys] = useState({
    protein: 0,
    carbs: 0,
    fat: 0,
  })
  const [supplementRainKey, setSupplementRainKey] = useState(0)
  const [loggingSupplementId, setLoggingSupplementId] = useState<string | null>(
    null
  )
  const [quickRepeatBusyKey, setQuickRepeatBusyKey] = useState<string | null>(
    null
  )
  const [describeOpen, setDescribeOpen] = useState(false)
  const [coachOpen, setCoachOpen] = useState(false)
  const [describeBusy, setDescribeBusy] = useState(false)
  const [loggingRecipe, setLoggingRecipe] = useState<Recipe | null>(null)
  const [savingRecipeMeal, setSavingRecipeMeal] = useState<string | null>(null)
  const [deletingRecipeId, setDeletingRecipeId] = useState<string | null>(null)
  const [dismissedSmartMealKeys, setDismissedSmartMealKeys] = useState<
    string[]
  >([])
  const [smartMealBusyKey, setSmartMealBusyKey] = useState<string | null>(null)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  useBottomBarAction(() => setAddOpen(true))

  const preferences = useQuery(api.users.users.getPreferences, {})
  // Derived from the preferences we already subscribe to, rather than
  // useCarbDisplayMode(), to avoid a second subscription on this page.
  const carbMode: CarbDisplayMode = preferences?.netCarbsEnabled
    ? "net"
    : "total"
  const timeZone = preferences?.lastActiveTimezone || "UTC"
  const todayKey = currentDateKey(timeZone)
  const [dateKey, setDateKey] = useState(todayKey)
  // `todayKey` is first computed with the "UTC" fallback, before preferences
  // load. Re-sync to the real timezone unless the user picked a date already.
  const datePickedRef = useRef(false)
  useEffect(() => {
    if (datePickedRef.current) return
    setDateKey(todayKey)
  }, [todayKey])
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
  const visibleMetrics = nutritionPlan?.visibleMetrics ?? {
    calories: true,
    macros: true,
    protein: true,
    micros: true,
    habits: false,
    water: true,
    streaks: true,
  }
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
  // Net carbs are derived at the day level: max(0, total carbs − total fiber).
  // The goal loses the fiber target to match, so both sides of the ratio are net.
  const displayedCarbs =
    carbMode === "net"
      ? netCarbs({ carbs: intakeTotals.carbs, fiber: microTotals.fiber })
      : intakeTotals.carbs
  const displayedCarbGoal = displayCarbGoal(
    macroTargets.carbs,
    effectiveGoals?.health?.fiber,
    carbMode
  )
  // A running fast gets a live ring on the page; the full timer, streak and
  // history live on /nutrition/fasting.
  const activeFast = useQuery(api.logs.fasting.getActive, {})
  const fastElapsed = useFastTimer(activeFast?.startedAt ?? null)
  const fastTargetSeconds = Math.max(0, (activeFast?.targetMinutes ?? 0) * 60)
  // A custom fast can have no target at all, in which case the ring stays a
  // plain track rather than reading as instantly complete.
  const fastProgress =
    fastTargetSeconds > 0 ? Math.min(1, fastElapsed / fastTargetSeconds) : 0
  const fastRemaining = Math.max(0, fastTargetSeconds - fastElapsed)
  // A running fast takes the hero: it is the thing with a deadline.
  const fastingHero = Boolean(activeFast)
  const mealTargetsEnabled = effectiveGoals?.mealTargetsEnabled ?? false
  const mealTargets = useMemo(
    () => effectiveGoals?.mealTargets ?? [],
    [effectiveGoals]
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
        date: dateKey,
        today: todayKey,
        isTrainingDay: overview.isTrainingDay,
      }),
    [overview.isTrainingDay, overview.items, overview.logs, dateKey, todayKey]
  )
  const scheduledSupplements = supplementPlan.filter((plan) => plan.isScheduled)
  const takenSupplements = supplementPlan.filter(
    (plan) => plan.state === "taken"
  )
  const supplementDone = takenSupplements.length + overview.legacyEntries.length
  const supplementTarget = Math.max(scheduledSupplements.length, supplementDone)
  // A quiet tail on the hero's context line. Silent when nothing is scheduled
  // and nothing has been taken — an empty count is not a hint, it is noise.
  const supplementHint =
    supplementTarget === 0
      ? ""
      : supplementDone >= supplementTarget
        ? `${supplementDone} supplement${supplementDone === 1 ? "" : "s"} taken`
        : `${supplementDone} of ${supplementTarget} supplements`
  const dueSupplements = supplementPlan.filter(
    (plan) => plan.state === "due" || plan.state === "missed"
  )
  const visibleSupplements =
    dueSupplements.length > 0 ? dueSupplements : supplementPlan.slice(0, 3)

  const caloriesLeft = calorieTarget - intakeTotals.calories
  const previousNutrients = useRef({
    calories: intakeTotals.calories,
    protein: intakeTotals.protein,
    carbs: intakeTotals.carbs,
    fat: intakeTotals.fat,
  })

  useEffect(() => {
    const previous = previousNutrients.current
    if (isToday) {
      if (
        previous.calories < calorieTarget &&
        intakeTotals.calories >= calorieTarget
      ) {
        setCalorieGoalCelebration(true)
      }
      setNutrientRainKeys((current) => ({
        protein:
          previous.protein < macroTargets.protein &&
          intakeTotals.protein >= macroTargets.protein
            ? current.protein + 1
            : current.protein,
        carbs:
          previous.carbs < macroTargets.carbs &&
          intakeTotals.carbs >= macroTargets.carbs
            ? current.carbs + 1
            : current.carbs,
        fat:
          previous.fat < macroTargets.fat &&
          intakeTotals.fat >= macroTargets.fat
            ? current.fat + 1
            : current.fat,
      }))
    }
    previousNutrients.current = {
      calories: intakeTotals.calories,
      protein: intakeTotals.protein,
      carbs: intakeTotals.carbs,
      fat: intakeTotals.fat,
    }
  }, [
    calorieTarget,
    intakeTotals.calories,
    intakeTotals.carbs,
    intakeTotals.protein,
    intakeTotals.fat,
    isToday,
    macroTargets.carbs,
    macroTargets.protein,
    macroTargets.fat,
  ])

  const workoutCalories = Math.max(0, effectiveGoals?.burnedCalories ?? 0)
  const isTrainingDay = effectiveGoals?.isTrainingDay === true
  const workoutAdjustmentEnabled =
    effectiveGoals?.workoutAdjustmentEnabled === true

  useEffect(() => {
    if (!isToday || !goals) return
    void updateOneRepWidgets({
      calories: Math.round(intakeTotals.calories),
      calorieGoal: Math.round(calorieTarget),
      caloriesLeft: Math.round(caloriesLeft),
      protein: Math.round(intakeTotals.protein),
      proteinGoal: Math.round(goals.protein),
      carbs: Math.round(intakeTotals.carbs),
      carbsGoal: Math.round(goals.carbs),
      fat: Math.round(intakeTotals.fat),
      fatGoal: Math.round(goals.fat),
      foodsLogged:
        entries.length > 0
          ? entries
              .slice(-4)
              .map((entry) => entry.name)
              .join(" · ")
          : "No food logged yet",
    })
  }, [calorieTarget, caloriesLeft, entries, goals, intakeTotals, isToday])

  const loggedToday = entries.length + waterEntries.length + supplementDone
  const sortedFood = useMemo(
    () => [...entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)),
    [entries]
  )
  const recentFood = showAllFood ? sortedFood : sortedFood.slice(0, 3)
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
      datePickedRef.current = true
      setDateKey(requestedDate)
      const next = new URLSearchParams(searchParams)
      next.delete("date")
      setSearchParams(next, { replace: true })
      return
    }

    if (searchParams.get("describe") === "1") {
      if (requireAiAccess(1, "describe_meal")) {
        setAddOpen(false)
        setDescribeOpen(true)
      }
      const next = new URLSearchParams(searchParams)
      next.delete("describe")
      setSearchParams(next, { replace: true })
    }

    if (searchParams.get("history") === "1") {
      datePickedRef.current = true
      setDateKey(offsetDateKey(todayKey, -1))
      const next = new URLSearchParams(searchParams)
      next.delete("history")
      setSearchParams(next, { replace: true })
    }
  }, [requireAiAccess, searchParams, setSearchParams, todayKey])

  async function addWater(amountMl: number) {
    if (amountMl <= 0 || loggingWaterAmount !== null) return false
    const completesGoal =
      waterTotal < waterGoal && waterTotal + amountMl >= waterGoal
    setLoggingWaterAmount(amountMl)
    hapticSelection()
    setWaterRainKey((value) => value + 1)
    try {
      await addWaterEntry({
        date: dateKey,
        entry: {
          id: crypto.randomUUID(),
          amountMl,
          loggedAt: new Date().toISOString(),
        },
      })
      if (completesGoal) setWaterGoalCelebration(true)
      return true
    } catch {
      toast.error("Could not add water. Try again.")
      return false
    } finally {
      setLoggingWaterAmount(null)
    }
  }

  useEffect(() => {
    if (!waterGoalCelebration) return
    document.documentElement.dataset.waterGoalCelebration = "true"
    hapticMedium()
    const secondHaptic = window.setTimeout(hapticSelection, 140)
    const thirdHaptic = window.setTimeout(hapticMedium, 300)
    const close = window.setTimeout(() => setWaterGoalCelebration(false), 2600)
    return () => {
      delete document.documentElement.dataset.waterGoalCelebration
      window.clearTimeout(secondHaptic)
      window.clearTimeout(thirdHaptic)
      window.clearTimeout(close)
    }
  }, [waterGoalCelebration])

  useEffect(() => {
    if (!calorieGoalCelebration) return
    document.documentElement.dataset.calorieGoalCelebration = "true"
    hapticMedium()
    const secondHaptic = window.setTimeout(hapticSelection, 150)
    const thirdHaptic = window.setTimeout(hapticMedium, 320)
    const close = window.setTimeout(
      () => setCalorieGoalCelebration(false),
      2600
    )
    return () => {
      delete document.documentElement.dataset.calorieGoalCelebration
      window.clearTimeout(secondHaptic)
      window.clearTimeout(thirdHaptic)
      window.clearTimeout(close)
    }
  }, [calorieGoalCelebration])

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

  function openSnapCamera() {
    if (!requireAiAccess(1, "snap_camera")) return
    setAddOpen(false)
    navigate("/camera")
  }

  // The same sheet the live workout opens, over the diary instead of over a
  // set: describing a meal in a textarea only ever produced a recipe, and
  // half the things people type at it are questions.
  function openCoach() {
    // Ungated, exactly like the coach bubble in a live workout and the Coach
    // tab itself: the screen behind the door decides who gets served.
    setAddOpen(false)
    setCoachOpen(true)
  }

  function openDescribeMeal() {
    if (!requireAiAccess(1, "describe_meal")) return
    setAddOpen(false)
    setDescribeOpen(true)
  }

  async function handleDescribeMeal(text: string) {
    if (describeBusy || !requireAiAccess(1, "describe_meal")) return
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
        error instanceof Error
          ? error.message
          : "Couldn't read that description. Try adding more detail."
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
      hapticSelection()
      if (dueSupplements.length === 1) {
        setSupplementRainKey((value) => value + 1)
        hapticMedium()
      }
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

  // Logging methods, the fasting timer and the food library used to be buried in
  // the "Add to diary" sheet. They live on the page now; these blocks keep the
  // today and past-day branches rendering the same thing.
  const logMethods = (
    <section
      className="progress-tab-enter mt-6 grid grid-cols-4 gap-2"
      aria-label="Log a meal"
    >
      {[
        {
          label: "Search",
          Icon: MagnifyingGlass,
          action: openFoodSearch,
        },
        {
          label: "Barcode",
          Icon: Barcode,
          action: () => navigate("/camera?mode=barcode"),
        },
        {
          label: "Snap",
          Icon: Aperture,
          requiresAiAccess: true,
          action: openSnapCamera,
        },
        {
          label: "Coach",
          Icon: Sparkle,
          action: openCoach,
        },
      ].map(({ label, Icon, action, requiresAiAccess }) => (
        <button
          key={label}
          type="button"
          onClick={() => {
            if (requiresAiAccess && !requireAiAccess(1, "nutrition_action"))
              return
            action()
          }}
          className="motion-tactile flex flex-col items-center gap-2 rounded-xl px-1 py-1 text-[13px] font-semibold"
        >
          <span className="app-translucent flex h-14 w-14 items-center justify-center rounded-full text-foreground transition-colors">
            <Icon size={21} weight="bold" />
          </span>
          <span>{label}</span>
        </button>
      ))}
    </section>
  )

  const fastingCard = (
    <TourAnchor
      anchor="nutrition-fasting-pill"
      className="progress-tab-enter block border-y border-border py-4"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="app-section-title">Fasting</p>
        <button
          type="button"
          onClick={() => navigate("/nutrition/fasting")}
          className="native-toolbar-button px-0 text-muted-foreground"
          aria-label="Open the fasting timer"
        >
          <CaretRight size={16} weight="bold" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setFastingOpen(true)}
        aria-label={
          activeFast
            ? `Fasting for ${formatFastDuration(
                fastElapsed
              )}, open the fasting timer`
            : "Start a fast"
        }
        className="mt-2 flex w-full items-center gap-4 text-left active:opacity-70"
      >
        <span className="relative size-19 shrink-0">
          <svg viewBox="0 0 76 76" className="size-full -rotate-90" aria-hidden>
            <circle
              cx="38"
              cy="38"
              r={FAST_RING_R}
              fill="none"
              strokeWidth="5"
              className="stroke-foreground/[0.09]"
            />
            {activeFast && (
              <circle
                cx="38"
                cy="38"
                r={FAST_RING_R}
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={FAST_RING_C}
                strokeDashoffset={FAST_RING_C * (1 - fastProgress)}
                style={{
                  stroke: "var(--accent-food)",
                  transition:
                    "stroke-dashoffset var(--motion-medium) var(--motion-ease-out)",
                }}
              />
            )}
          </svg>
          <span className="absolute inset-0 grid place-items-center">
            <Timer
              size={20}
              weight="bold"
              className={
                activeFast
                  ? "text-[var(--accent-food)]"
                  : "text-muted-foreground/50"
              }
            />
          </span>
        </span>

        <span className="min-w-0 flex-1">
          {activeFast ? (
            <>
              <span
                className="block text-[1.35rem] leading-none font-bold tracking-tight tabular-nums"
                aria-live="polite"
              >
                {formatFastDuration(fastElapsed)}
              </span>
              <span className="native-row-detail mt-1.5 block">
                {fastTargetSeconds === 0
                  ? "Open-ended"
                  : fastRemaining > 0
                    ? `${fmtFastRemaining(fastRemaining)} to go`
                    : "Target reached"}
              </span>
              <span className="native-row-detail block">
                {activeFast.protocol} fast
              </span>
            </>
          ) : (
            <>
              <span className="native-row-title block">Start a fast</span>
              <span className="native-row-detail mt-1 block">
                16:8, 18:6, or a window you set.
              </span>
            </>
          )}
        </span>
      </button>
    </TourAnchor>
  )

  const foodLibrary = (
    <div className="mt-4 border-t border-border pt-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            label: "My foods",
            Icon: ForkKnife,
            action: () => navigate("/foods/custom"),
          },
          {
            label: "Meal prep",
            Icon: BowlFood,
            action: () => navigate("/nutrition/meal-prep"),
          },
          {
            label: "Groceries",
            Icon: ShoppingCart,
            action: () => navigate("/nutrition/groceries"),
          },
        ].map(({ label, Icon, action }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            className="app-button app-button-quiet gap-1.5 px-2"
          >
            <Icon size={17} weight="bold" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
      <RecipeManagementBox
        recipes={recipes}
        deletingRecipeId={deletingRecipeId}
        onCreate={createRecipe}
        onEdit={editRecipe}
        onDelete={(recipe) => void deleteRecipe(recipe)}
        embedded
      />
      <RepeatMealBox todaysEntries={entries} embedded />
    </div>
  )

  return (
    <div
      className={cn(
        "desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72",
        // The wash starts at the very top of the page, so the title row and the
        // log buttons sit inside it rather than on either side of a seam.
        isToday && "nutrition-hero"
      )}
      style={
        isToday
          ? ({
              "--hero-fill": Math.min(
                100,
                calorieTarget > 0
                  ? Math.round((intakeTotals.calories / calorieTarget) * 100)
                  : 0
              ),
            } as CSSProperties)
          : undefined
      }
    >
      {isToday && <span className="nutrition-hero-wash" aria-hidden="true" />}
      <main className="app-page">
        <header className="app-header" ref={nutritionHeaderRef}>
          <div className={cn("min-w-0")}>
            <h1 className="app-title">Nutrition</h1>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <DateSelectorButton
              onInteract={hapticSelection}
              value={dateKey}
              todayKey={todayKey}
              onChange={(next) => {
                datePickedRef.current = true
                setDateKey(next)
              }}
              open={dateSelectorOpen}
              onOpenChange={setDateSelectorOpen}
              label="Nutrition date"
            />
            <button
              type="button"
              onClick={() => navigate("/nutrition/report")}
              className="app-header-icon-action"
              aria-label="Nutrition report"
            >
              <Printer weight="bold" />
            </button>
            {isToday && (
              <>
                <TourAnchor
                  anchor="nutrition-add"
                  className="inline-flex md:hidden"
                >
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="native-toolbar-button"
                    aria-label="Add nutrition entry"
                  >
                    <Plus weight="bold" />
                    <span>Add</span>
                  </button>
                </TourAnchor>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="native-toolbar-button hidden hover:bg-card md:inline-flex"
                  aria-label="Add nutrition entry"
                >
                  <Plus weight="bold" />
                  <span className="ml-1">Add</span>
                </button>
              </>
            )}
          </div>
        </header>

        {!isToday && (
          <section className="progress-tab-enter border-y border-border py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="native-supporting">{dateLabel}</p>
                <p className="mt-1 text-[1.55rem] leading-none font-extrabold tabular-nums">
                  {fmt(intakeTotals.calories)} kcal
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {entries.length} food{" "}
                  {entries.length === 1 ? "entry" : "entries"} ·{" "}
                  {fmtWater(waterTotal)} water · {supplementDone} supplements
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

            <TourAnchor
              anchor="nutrition-macros"
              className="mt-4 block divide-y divide-border border-y border-border"
            >
              <GoalTile
                label="Protein"
                value={`${fmt(intakeTotals.protein)}g`}
                detail={`${pct(intakeTotals.protein, macroTargets.protein)}%`}
                complete={intakeTotals.protein >= macroTargets.protein}
              />
              <GoalTile
                label={carbLabel(carbMode)}
                value={`${fmt(displayedCarbs)}g`}
                detail={`${pct(displayedCarbs, displayedCarbGoal)}%`}
                complete={displayedCarbs >= displayedCarbGoal}
              />
              <GoalTile
                label="Fat"
                value={`${fmt(intakeTotals.fat)}g`}
                detail={`${pct(intakeTotals.fat, macroTargets.fat)}%`}
                complete={intakeTotals.fat >= macroTargets.fat}
              />
            </TourAnchor>

            <div className="mt-4 space-y-4 border-t border-border/35 pt-4">
              {mealTargetsEnabled && (
                <TourAnchor anchor="nutrition-meal-budget" className="block">
                  <MealBudgetPanel entries={entries} targets={mealTargets} />
                </TourAnchor>
              )}
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="app-section-title">Food</p>
                  <button
                    type="button"
                    onClick={openFoodSearch}
                    className="native-toolbar-button h-11 px-3"
                    aria-label="Add food"
                  >
                    <Plus size={16} weight="bold" />
                    Add food
                  </button>
                </div>
                {entries.length > 0 ? (
                  <div className="divide-y divide-border border-y border-border">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex min-h-14 items-center justify-between gap-2 px-1 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="native-row-title truncate">
                            {entry.name}
                          </p>
                          <p className="native-row-detail mt-0.5">
                            {timeLabel(entry.loggedAt)} · {fmt(entry.calories)}{" "}
                            kcal
                          </p>
                        </div>
                        {(entry.recipeId || entry.recipeDraft) && (
                          <button
                            type="button"
                            onClick={() => editRecipeFromLogEntry(entry)}
                            className="native-toolbar-button h-11 w-11 px-0 text-muted-foreground"
                            aria-label={`Edit recipe for ${entry.name}`}
                          >
                            <PencilSimple size={17} weight="bold" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFoodEntry(entry.id)}
                          className="native-toolbar-button h-11 w-11 px-0 text-destructive"
                          aria-label={`Remove ${entry.name}`}
                        >
                          <Trash size={17} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-[14px] leading-5 text-muted-foreground">
                    No food was logged on this day.
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
                    className="native-toolbar-button h-11 border border-border bg-card px-3"
                  >
                    {loggingWaterAmount === 250 ? "Adding..." : "+250 ml"}
                  </button>
                </div>
                {waterEntries.length > 0 ? (
                  <div className="divide-y divide-border border-y border-border">
                    {waterEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex min-h-14 items-center justify-between gap-2 px-1 py-2.5"
                      >
                        <div>
                          <p className="native-row-title">
                            {fmtWater(entry.amountMl)}
                          </p>
                          <p className="native-row-detail mt-0.5">
                            {timeLabel(entry.loggedAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeWaterEntry(entry.id)}
                          className="native-toolbar-button h-11 w-11 px-0 text-destructive"
                          aria-label={`Remove ${fmtWater(entry.amountMl)}`}
                        >
                          <Trash size={17} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-[14px] leading-5 text-muted-foreground">
                    No water was logged on this day.
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="app-section-title">Supplements</p>
                  <button
                    type="button"
                    onClick={() => navigate("/supplements")}
                    className="native-toolbar-button h-11 px-3"
                    aria-label="Manage supplements"
                  >
                    <Pill size={17} weight="bold" />
                    Manage
                  </button>
                </div>
                {overview.logs.length + overview.legacyEntries.length > 0 ? (
                  <div className="divide-y divide-border border-y border-border">
                    {overview.logs.map((log) => (
                      <div
                        key={String(log._id)}
                        className="flex min-h-14 items-center justify-between gap-2 px-1 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="native-row-title truncate">
                            {log.name}
                          </p>
                          <p className="native-row-detail mt-0.5">
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
                          className="native-toolbar-button h-11 w-11 px-0 text-destructive"
                          aria-label={`Remove ${log.name}`}
                        >
                          <Trash size={17} weight="bold" />
                        </button>
                      </div>
                    ))}
                    {overview.legacyEntries.map((entry) => (
                      <div key={entry.id} className="min-h-14 px-1 py-2.5">
                        <p className="native-row-title truncate">
                          {entry.name ?? "Supplement"}
                        </p>
                        <p className="native-row-detail mt-0.5">
                          {timeLabel(entry.loggedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-[14px] leading-5 text-muted-foreground">
                    No supplements were logged on this day.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {!isToday && (
          <>
            <div className="mt-4">{fastingCard}</div>
            {foodLibrary}
          </>
        )}

        {!isToday ? null : (
          <>
            {/* The hero runs edge to edge, leads with the one number the page
                exists to answer, and sits on a wash that shifts with the day's
                own numbers before fading out into the page — a soft edge
                instead of a drawn one. */}
            <section
              className={cn(
                "app-hero-frame progress-tab-enter relative flex flex-col justify-center pt-3 pb-4",
                fastingHero ? "text-left" : "text-center"
              )}
            >
              {fastingHero ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setFastingOpen(true)}
                      className="motion-tactile -ml-1 inline-flex min-h-9 items-center gap-1.5 px-1 text-[13px] font-semibold text-muted-foreground active:text-foreground"
                      aria-label="Open the fasting timer"
                    >
                      <Timer size={15} weight="bold" aria-hidden="true" />
                      Fasting
                    </button>
                    <p className="mt-1.5 flex items-baseline gap-1.5">
                      <span
                        key={Math.round(fastRemaining / 60)}
                        className="motion-number-refresh text-[2.9rem] leading-none font-extrabold tracking-tight tabular-nums"
                      >
                        {fastTargetSeconds > 0
                          ? fmtFastRemaining(fastRemaining)
                          : formatFastDuration(fastElapsed)}
                      </span>
                      <span className="text-[1rem] font-semibold text-muted-foreground">
                        {fastTargetSeconds > 0
                          ? fastRemaining > 0
                            ? "left"
                            : "over"
                          : "elapsed"}
                      </span>
                    </p>
                    <p className="mt-1.5 text-[13px] text-muted-foreground tabular-nums">
                      {formatFastDuration(fastElapsed)} in
                      {fastTargetSeconds > 0
                        ? ` of ${formatFastDuration(fastTargetSeconds)}`
                        : ""}
                      {visibleMetrics.calories
                        ? ` · ${fmt(intakeTotals.calories)} kcal logged`
                        : ""}
                      {supplementHint ? ` · ${supplementHint}` : ""}
                    </p>
                  </div>

                  {/* The macros are still true, just not the point while the
                      clock is running: they shrink to grey rings and give the
                      hero over to the fast. */}
                  {(visibleMetrics.calories ||
                    visibleMetrics.macros ||
                    visibleMetrics.protein) && (
                    <div
                      className="flex shrink-0 items-center opacity-40 grayscale"
                      aria-label={`Macros so far: ${fmt(intakeTotals.calories)} of ${fmt(calorieTarget)} calories, ${fmt(intakeTotals.protein)} of ${fmt(macroTargets.protein)} grams protein, ${fmt(intakeTotals.fat)} of ${fmt(macroTargets.fat)} grams fat`}
                      role="img"
                    >
                      <MacroDial
                        name="Calories"
                        value={intakeTotals.calories}
                        target={calorieTarget}
                        suffix=""
                        color={APP_ACCENT_COLORS.neutral}
                        size={38}
                        stroke={9}
                        mirrored
                        compact
                        className="z-0 -mr-1.5"
                      />
                      <MacroDial
                        name="Protein"
                        value={intakeTotals.protein}
                        target={macroTargets.protein}
                        suffix="g"
                        color={MACRO_COLORS.protein}
                        size={52}
                        stroke={9}
                        compact
                        className="z-10"
                      />
                      <MacroDial
                        name="Fat"
                        value={intakeTotals.fat}
                        target={macroTargets.fat}
                        suffix="g"
                        color={MACRO_COLORS.fat}
                        size={38}
                        stroke={9}
                        compact
                        className="z-0 -ml-1.5"
                      />
                    </div>
                  )}
                </div>
              ) : visibleMetrics.calories ? (
                <>
                  <p className="flex items-baseline justify-center gap-1.5">
                    <span
                      key={caloriesLeft}
                      className="motion-number-refresh text-[3.25rem] leading-none font-extrabold tracking-tight tabular-nums"
                    >
                      {fmt(Math.abs(caloriesLeft))}
                    </span>
                    <span className="text-[1.05rem] font-semibold text-muted-foreground">
                      kcal {caloriesLeft >= 0 ? "left" : "over"}
                    </span>
                  </p>
                  <p className="mt-1.5 text-[13px] text-muted-foreground tabular-nums">
                    {fmt(intakeTotals.calories)} of {fmt(calorieTarget)} kcal ·{" "}
                    {loggedToday} entries
                    {supplementHint ? ` · ${supplementHint}` : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[2.4rem] leading-none font-extrabold tabular-nums">
                    {loggedToday}
                  </p>
                  <p className="mt-1.5 text-[13px] text-muted-foreground">
                    logged today · {nutritionPlan?.trackingMode ?? "habit"}{" "}
                    tracking mode
                    {supplementHint ? ` · ${supplementHint}` : ""}
                  </p>
                </>
              )}

              {fastingHero ? null : visibleMetrics.calories ||
                visibleMetrics.macros ||
                visibleMetrics.protein ? (
                <div className="relative mt-7 flex items-center justify-center pb-2">
                  {visibleMetrics.calories && (
                    <MacroDial
                      name="Calories"
                      value={intakeTotals.calories}
                      target={calorieTarget}
                      suffix=""
                      color={APP_ACCENT_COLORS.neutral}
                      size={104}
                      stroke={7}
                      mirrored
                      className="z-0 -mr-3.5"
                    />
                  )}
                  {(visibleMetrics.macros || visibleMetrics.protein) && (
                    <MacroDial
                      name="Protein"
                      value={intakeTotals.protein}
                      target={macroTargets.protein}
                      suffix="g"
                      color={MACRO_COLORS.protein}
                      size={158}
                      stroke={8}
                      emphasis
                      className="z-10"
                      rainKey={nutrientRainKeys.protein}
                    />
                  )}
                  {visibleMetrics.macros && (
                    <MacroDial
                      name="Fat"
                      value={intakeTotals.fat}
                      target={macroTargets.fat}
                      suffix="g"
                      color={MACRO_COLORS.fat}
                      size={104}
                      stroke={7}
                      className="z-0 -ml-3.5"
                      rainKey={nutrientRainKeys.fat}
                    />
                  )}
                </div>
              ) : (
                <p className="mt-4 pb-2 text-[14px] leading-5 text-muted-foreground">
                  Log meals and focus on consistency.
                </p>
              )}

              {isTrainingDay && visibleMetrics.calories && (
                <button
                  type="button"
                  onClick={() => navigate("/workouts", { motion: "switch" })}
                  className="mt-3 flex min-h-14 w-full items-center justify-between gap-3 border-y border-border px-1 py-2.5 text-left transition-colors active:bg-muted/45"
                  aria-label="Open today’s workout"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold">
                      Training-day target
                    </p>
                    <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground tabular-nums">
                      {workoutAdjustmentEnabled
                        ? `+${fmt(workoutCalories)} kcal for training`
                        : "Fixed target, workout adjustment off"}
                    </p>
                  </div>
                  <CaretRight
                    size={14}
                    weight="bold"
                    className="shrink-0 text-muted-foreground"
                  />
                </button>
              )}
            </section>

            {logMethods}

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

            <section className="mt-7 grid gap-6 md:grid-cols-[1fr_0.82fr]">
              <div
                className="progress-tab-enter border-y border-border py-4"
                style={{ animationDelay: "120ms" }}
              >
                <p className="app-section-title mb-3">Intake</p>
                <div>
                  {recentFood.length > 0 ? (
                    <div className="space-y-2">
                      {recentFood.map((entry) => (
                        <SlideToDeleteRow
                          key={entry.id}
                          deleteLabel={`Delete ${entry.name}`}
                          onDelete={() => removeFoodEntry(entry.id)}
                          className="-mx-1 rounded-lg"
                          actionClassName="rounded-r-lg"
                          rowClassName="flex items-center justify-between gap-3 bg-background px-1"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="native-row-title truncate">
                              {entry.name}
                            </p>
                            <p className="native-row-detail mt-0.5">
                              {timeLabel(entry.loggedAt)}
                            </p>
                          </div>
                          {(entry.recipeId || entry.recipeDraft) && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                editRecipeFromLogEntry(entry)
                              }}
                              className="native-toolbar-button h-11 w-11 px-0 text-muted-foreground"
                              aria-label={`Edit recipe for ${entry.name}`}
                            >
                              <PencilSimple size={17} weight="bold" />
                            </button>
                          )}
                          <span className="shrink-0 text-[14px] font-semibold tabular-nums">
                            {fmt(entry.calories)} kcal
                          </span>
                        </SlideToDeleteRow>
                      ))}
                      {entries.length > 3 && (
                        <button
                          type="button"
                          onClick={() => setShowAllFood((value) => !value)}
                          aria-expanded={showAllFood}
                          className="-mx-1 flex min-h-11 w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors active:text-foreground"
                        >
                          <span>
                            {showAllFood
                              ? "Show less"
                              : `Show all ${entries.length}`}
                          </span>
                          <CaretDown
                            size={14}
                            weight="bold"
                            className={cn(
                              "transition-transform",
                              showAllFood && "rotate-180"
                            )}
                          />
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-[14px] leading-5 text-muted-foreground">
                      Nothing logged yet. Pick a way to log above.
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
                    carbMode={carbMode}
                  />
                )}
                {foodLibrary}
              </div>

              <div className="grid content-start gap-6 self-start">
                <div
                  className="progress-tab-enter relative overflow-hidden border-y border-border py-4"
                  style={{ animationDelay: "160ms" }}
                >
                  {waterRainKey > 0 && (
                    <span
                      key={waterRainKey}
                      className="water-rain water-rain-nutrition"
                      aria-hidden
                    >
                      {Array.from({ length: 9 }, (_, index) => (
                        <span key={index} />
                      ))}
                    </span>
                  )}
                  <div className="relative z-10 mb-3 flex items-center justify-between gap-3">
                    <p className="app-section-title">Water</p>
                    <button
                      type="button"
                      onClick={() => setWaterGoalOpen(true)}
                      className="native-toolbar-button px-0 text-muted-foreground"
                      aria-label="Edit water goal"
                    >
                      <PencilSimple size={17} weight="bold" />
                    </button>
                  </div>
                  <ProgressLine
                    label="Hydration"
                    value={waterTotal}
                    target={waterGoal}
                    suffix="ml"
                    format={fmtWater}
                    color={APP_ACCENT_COLORS.water}
                    animateChanges
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
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

                <div
                  className="progress-tab-enter relative overflow-hidden border-y border-border py-4"
                  style={{ animationDelay: "200ms" }}
                >
                  {supplementRainKey > 0 && (
                    <span
                      key={supplementRainKey}
                      className="water-rain water-rain-nutrition nutrient-micro-rain"
                      style={
                        {
                          "--nutrient-rain-color": "var(--accent-supplement)",
                        } as CSSProperties
                      }
                      aria-hidden
                    >
                      {Array.from({ length: 9 }, (_, index) => (
                        <span key={index} />
                      ))}
                    </span>
                  )}
                  <div className="relative z-10 mb-1 flex items-center justify-between gap-3">
                    <p className="app-section-title">Supplements</p>
                    <button
                      type="button"
                      onClick={() => navigate("/supplements")}
                      className="native-toolbar-button px-0 text-muted-foreground"
                      aria-label="Manage supplements"
                    >
                      <CaretRight size={16} weight="bold" />
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
                    <p className="mt-2 text-[14px] leading-5 text-muted-foreground">
                      No supplements planned.
                    </p>
                  )}
                </div>

                {fastingCard}
              </div>
            </section>
          </>
        )}
      </main>

      {waterGoalCelebration &&
        createPortal(
          <div
            className="water-goal-celebration fixed inset-0 z-[200] flex items-center justify-center"
            role="status"
            onClick={() => setWaterGoalCelebration(false)}
            aria-live="assertive"
          >
            <button
              type="button"
              className="absolute top-[calc(var(--app-safe-top)+1rem)] right-4 z-20 grid size-11 place-items-center rounded-full bg-white/10 text-white"
              aria-label="Dismiss hydration celebration"
              onClick={() => setWaterGoalCelebration(false)}
            >
              <X size={20} weight="bold" />
            </button>
            <div className="water-goal-rain" aria-hidden>
              {Array.from({ length: 32 }, (_, index) => (
                <span
                  key={index}
                  style={{
                    left: `${(index * 37) % 101}%`,
                    animationDelay: `${(index * 73) % 640}ms`,
                    animationDuration: `${1050 + ((index * 97) % 700)}ms`,
                  }}
                />
              ))}
            </div>
            <div className="relative z-10 flex flex-col items-center gap-3 px-5 text-center">
              <CheckCircle
                size={42}
                weight="fill"
                className="water-goal-check text-emerald-400"
                aria-hidden
              />
              <p className="water-goal-complete-text max-w-[18rem] text-[clamp(1.25rem,4vw,2.25rem)] font-semibold tracking-tight text-white">
                Hydration goal complete
              </p>
            </div>
          </div>,
          document.body
        )}

      {calorieGoalCelebration &&
        createPortal(
          <div
            className="water-goal-celebration calorie-goal-celebration fixed inset-0 z-[200] flex items-center justify-center"
            role="status"
            onClick={() => setCalorieGoalCelebration(false)}
            aria-live="assertive"
          >
            <button
              type="button"
              className="absolute top-[calc(var(--app-safe-top)+1rem)] right-4 z-20 grid size-11 place-items-center rounded-full bg-white/10 text-white"
              aria-label="Dismiss calorie celebration"
              onClick={() => setCalorieGoalCelebration(false)}
            >
              <X size={20} weight="bold" />
            </button>
            <div className="water-goal-rain calorie-goal-rain" aria-hidden>
              {Array.from({ length: 32 }, (_, index) => (
                <span
                  key={index}
                  style={{
                    left: `${(index * 37) % 101}%`,
                    animationDelay: `${(index * 73) % 640}ms`,
                    animationDuration: `${1050 + ((index * 97) % 700)}ms`,
                  }}
                />
              ))}
            </div>
            <div className="relative z-10 flex flex-col items-center gap-3 px-5 text-center">
              <CheckCircle
                size={42}
                weight="fill"
                className="water-goal-check text-[var(--accent-food)]"
                aria-hidden
              />
              <p className="water-goal-complete-text max-w-[18rem] text-[clamp(1.25rem,4vw,2.25rem)] font-semibold tracking-tight text-white">
                Calorie goal complete
              </p>
            </div>
          </div>,
          document.body
        )}

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

      {coachOpen && (
        <CoachSheet
          onClose={() => setCoachOpen(false)}
          initialInput="Create a recipe: "
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
          overlayClassName="bg-black/55"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-2xl border-t border-border bg-card md:!w-full md:!max-w-sm"
          panelStyle={{
            paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
          }}
          maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
        >
          <div className="px-5 pt-4 pb-4">
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 className="text-[21px] font-semibold">Add to diary</h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="native-toolbar-button -mt-1 -mr-2 px-0 text-muted-foreground"
                aria-label="Close add menu"
              >
                <X size={17} weight="bold" />
              </button>
            </div>
            {quickRepeatFoods.length > 0 && (
              <section className="mb-5" aria-label="Recent foods">
                <h3 className="native-section-title mb-2">Log again</h3>
                <div className="divide-y divide-border border-y border-border">
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
                        className="flex min-h-14 w-full items-center gap-3 px-1 text-left transition-colors active:bg-muted disabled:opacity-55"
                      >
                        <span className="flex h-6 w-6 items-center justify-center text-muted-foreground">
                          {busy ? (
                            <span className="h-3 w-3 animate-spin rounded-full border border-muted-foreground/20 border-t-muted-foreground/70" />
                          ) : (
                            <ForkKnife size={17} weight="bold" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="native-row-title block truncate">
                            {food.entry.name}
                          </span>
                          <span className="native-row-detail block tabular-nums">
                            {fmt(food.entry.calories)} kcal
                            {food.count > 1
                              ? ` · logged ${food.count} times recently`
                              : ""}
                          </span>
                        </span>
                        <span className="text-[14px] font-semibold text-[var(--accent-food)]">
                          Log
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
            <div className="divide-y divide-border border-y border-border">
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
              ]
                .filter((item) => isToday || item.supportsHistory)
                .map(({ label, detail, Icon, action, requiresAiAccess }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (
                        requiresAiAccess &&
                        !requireAiAccess(1, "nutrition_action")
                      )
                        return
                      setAddOpen(false)
                      action()
                    }}
                    className={cn(
                      "flex min-h-16 w-full items-center justify-between gap-3 px-1 py-3 text-left transition-colors active:bg-muted/35"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="w-6 shrink-0 text-muted-foreground">
                        <Icon size={19} weight="bold" />
                      </span>
                      <span className="min-w-0">
                        <span className="native-row-title block">{label}</span>
                        <span className="native-row-detail block">
                          {detail}
                        </span>
                      </span>
                    </span>
                    <CaretRight size={18} className="text-muted-foreground" />
                  </button>
                ))}
              {recipes.length > 0 && (
                <>
                  <div className="px-1 pt-5 pb-2">
                    <p className="native-section-title">Saved recipes</p>
                  </div>
                  {recipes.slice(0, 5).map((recipe) => {
                    const totals = totalsForRecipe(recipe.ingredients)
                    return (
                      <div
                        key={recipe._id ?? recipe.name}
                        className="flex min-h-14 w-full items-center gap-1 border-t border-border"
                      >
                        <button
                          type="button"
                          onClick={() => logRecipe(recipe)}
                          className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 px-1 py-2 text-left transition-colors active:bg-muted/40"
                        >
                          <div className="min-w-0 text-left">
                            <p className="native-row-title truncate">
                              {recipe.name}
                            </p>
                            <p className="native-row-detail mt-0.5">
                              {totals.calories} kcal ·{" "}
                              {recipe.ingredients.length} ingredient
                              {recipe.ingredients.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          <CaretRight
                            size={18}
                            className="shrink-0 text-muted-foreground"
                          />
                        </button>
                        {recipe._id && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddOpen(false)
                              navigate(`/foods/recipe/${recipe._id}`)
                            }}
                            className="native-toolbar-button h-11 w-11 shrink-0 px-0 text-muted-foreground"
                            aria-label={`Edit ${recipe.name}`}
                          >
                            <PencilSimple size={17} weight="bold" />
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

      {fastingOpen && <FastingSheet onClose={() => setFastingOpen(false)} />}
      {aiAccessModal}
    </div>
  )
}
