import { useMemo, useRef, useState, type ReactNode } from "react"
import {
  Aperture,
  Barcode,
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
} from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { MobileSheet } from "@/components/mobile-sheet"
import { useBottomBarAction } from "@/components/bottom-bar"
import { useSmoothNavigate } from "@/lib/navigation"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { cn } from "@/lib/utils"
import {
  FOOD_MICRONUTRIENT_KEYS,
  currentDateKey,
  defaultMeal,
  nutritionDetailTotals,
  stripUndefined,
  DEFAULT_MEAL_CATEGORIES,
  type FoodLogEntry,
  type FoodMicronutrientKey,
  type Recipe,
  type RecipeIngredient,
} from "@/lib/food-log"
import type { NutritionPlan } from "@/lib/health-goals"
import {
  buildSupplementDayPlan,
  type SupplementDayPlanItem,
  type SupplementIntakeLog,
  type SupplementItem,
} from "@/lib/supplements"
import {
  APP_ACCENT_COLORS,
  MACRO_COLORS,
  MICRO_COLORS,
} from "@/lib/design-tokens"
import { useAiFeatureGate } from "@/lib/ai-access"
import { hapticSelection } from "@/lib/haptics"
import { useIsMobile } from "@/lib/is-mobile"

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

const QUICK_WATER = [250, 500, 750]
const SUPPLEMENT_SWIPE_THRESHOLD = 64

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
      <div className="flex justify-between items-baseline gap-2 mb-1">
        <span className="font-bold text-[11px] text-muted-foreground/68">
          {label}
        </span>
        <span className="font-semibold tabular-nums text-[11px] text-foreground/72">
          {fmt(value)} / {fmt(target)} {suffix}
        </span>
      </div>
      <div className="bg-foreground/[0.07] rounded-full h-1.5 overflow-hidden">
        <div
          className="rounded-full h-full"
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
    <div className="mt-4 pt-3 border-border/35 border-t">
      <button
        type="button"
        onClick={onToggle}
        className="flex justify-between items-center gap-3 w-full min-h-10 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block font-bold text-[12px]">Micros</span>
          <span className="block mt-0.5 text-[11px] text-muted-foreground/55 truncate">
            {loggedCount > 0
              ? `${loggedCount} nutrients with logged detail`
              : "No micronutrients logged yet"}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {highlights.length > 0 && (
            <span className="hidden min-[390px]:block max-w-[11rem] font-semibold tabular-nums text-[10.5px] text-muted-foreground/55 truncate">
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
            <p className="bg-muted/25 px-3 py-3 rounded-[0.9rem] text-[12px] text-muted-foreground/58 leading-5">
              Micros appear when logged foods include nutrition details.
            </p>
          ) : (
            <div className="gap-2 grid sm:grid-cols-2">
              {rows.map((row) => {
                const hasValue = row.value > 0
                const progress = row.target ? pct(row.value, row.target) : null
                return (
                  <div
                    key={row.key}
                    className={cn(
                      "px-3 py-2.5 border border-border/45 rounded-[0.85rem]",
                      hasValue ? "bg-muted/20" : "bg-muted/10 opacity-55"
                    )}
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="rounded-full w-1.5 h-1.5 shrink-0"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="font-semibold text-[11.5px] truncate">
                          {row.label}
                        </span>
                      </span>
                      <span className="font-bold tabular-nums text-[11px] text-foreground/72 shrink-0">
                        {fmtMicro(row.value, row.unit)}
                      </span>
                    </div>
                    {row.target && (
                      <>
                        <div className="bg-foreground/[0.07] mt-2 rounded-full h-1 overflow-hidden">
                          <div
                            className="rounded-full h-full"
                            style={{
                              width: `${progress}%`,
                              backgroundColor: row.color,
                            }}
                          />
                        </div>
                        <p className="mt-1 tabular-nums text-[9.5px] text-muted-foreground/45">
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
  onAdd: () => void
  onClose: () => void
}) {
  function setClamped(next: number) {
    onAmountChange(Math.max(1, Math.min(5000, Math.round(next))))
  }

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/45 backdrop-blur-[6px]"
      panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
      panelStyle={{
        paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
      }}
    >
      <div className="px-5 pt-1 pb-4">
        <p className="font-bold text-[17px]">Custom water</p>
        <p className="mt-1 text-[12px] text-muted-foreground/58">
          Save any amount to today’s hydration log.
        </p>
        <div className="flex justify-between items-center bg-muted/35 mt-4 p-1 rounded-[1rem]">
          <button
            type="button"
            onClick={() => setClamped(amount - 50)}
            className="flex justify-center items-center bg-background rounded-[0.8rem] w-11 h-11 font-bold text-[18px]"
          >
            −
          </button>
          <label className="flex-1 px-3 min-w-0 text-center">
            <span className="sr-only">Water amount in milliliters</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              value={amount}
              onChange={(event) => setClamped(Number(event.target.value) || 0)}
              className="bg-transparent outline-none w-full font-extrabold tabular-nums text-[1.75rem] text-center leading-none"
            />
            <span className="block mt-1 font-semibold text-[11px] text-muted-foreground/55">
              milliliters
            </span>
          </label>
          <button
            type="button"
            onClick={() => setClamped(amount + 50)}
            className="flex justify-center items-center bg-background rounded-[0.8rem] w-11 h-11 font-bold text-[18px]"
          >
            +
          </button>
        </div>
        <div className="gap-2 grid grid-cols-4 mt-3">
          {[150, 250, 500, 1000].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setClamped(preset)}
              className="justify-center app-button app-button-quiet"
            >
              {fmtWater(preset)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="justify-center bg-foreground mt-4 w-full min-h-11 text-background app-button"
        >
          Add {fmtWater(amount)}
        </button>
      </div>
    </MobileSheet>
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
    <div className="flex items-center gap-3 bg-muted/20 px-4 py-4 border border-border/50 rounded-[1rem] w-full">
      <span className="flex justify-center items-center bg-background rounded-full w-10 h-10 text-muted-foreground/72 shrink-0">
        {icon}
      </span>

      <div className="flex-1 min-w-0">
        <p className="font-extrabold text-[14px] text-muted-foreground/70 leading-none">
          {label}
        </p>

        <p className="mt-1 text-[13px] text-muted-foreground/50 truncate">
          {detail}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <p className="font-extrabold tabular-nums text-[18px] leading-none">
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
}: {
  plan: SupplementDayPlanItem
  onTake: (plan: SupplementDayPlanItem) => void
}) {
  const taken = plan.state === "taken"
  const skipped = plan.state === "skipped"
  return (
    <div className="flex items-center gap-3 py-3 border-border/35 border-t first:border-t-0">
      <span
        className={cn(
          "rounded-full w-2 h-2 shrink-0",
          taken
            ? "bg-(--status-complete)"
            : skipped
              ? "bg-muted-foreground/35"
              : "bg-(--status-caution)"
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[13px] truncate">{plan.item.name}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/55 truncate">
          {taken ? "Taken" : skipped ? "Skipped" : "Due"} ·{" "}
          {plan.item.servingLabel ?? "1 serving"}
        </p>
      </div>
      {!taken && !skipped && (
        <button
          type="button"
          onClick={() => onTake(plan)}
          className="h-9 app-button app-button-quiet shrink-0"
        >
          Take
        </button>
      )}
    </div>
  )
}

export default function Nutrition() {
  const navigate = useSmoothNavigate()
  const [addOpen, setAddOpen] = useState(false)
  const [microsOpen, setMicrosOpen] = useState(false)
  const [customWaterOpen, setCustomWaterOpen] = useState(false)
  const [customWaterAmount, setCustomWaterAmount] = useState(350)
  const [applyingCalibration, setApplyingCalibration] = useState(false)
  const supplementSwipeStart = useRef<{ x: number; y: number } | null>(null)
  const suppressSupplementClick = useRef(false)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  useBottomBarAction(() => setAddOpen(true))

  const preferences = useQuery(api.users.users.getPreferences, {})
  const timeZone = preferences?.lastActiveTimezone || "UTC"
  const todayKey = currentDateKey(timeZone)

  const effectiveGoals = useQuery(api.users.users.getEffectiveGoals, {
    date: todayKey,
  })
  const nutritionPlanRaw = useQuery(api.users.users.getNutritionPlan, {
    date: todayKey,
  })
  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date: todayKey })
  const recipesQuery = useQuery(api.logs.recipes.list, {})
  const waterLogs = useQuery(api.logs.water.getDay, { date: todayKey })
  const supplementOverviewRaw = useQuery(api.logs.supplements.getOverview, {
    date: todayKey,
  })

  const setFoodDay = useOfflineMutation(
    api.logs.foodLogs.setDay,
    "logs.foodLogs.setDay"
  )
  const addWaterEntry = useOfflineMutation(
    api.logs.water.addEntry,
    "logs.water.addEntry"
  )
  const logSupplementTaken = useOfflineMutation(
    api.logs.supplements.logTaken,
    "logs.supplements.logTaken"
  )
  const applyCalibration = useMutation(
    api.users.users.applyNutritionCalibration
  )

  const entries = useMemo(() => (foodLogs ?? []) as FoodLogEntry[], [foodLogs])
  const recipes = useMemo(
    () => (recipesQuery ?? []) as unknown as Recipe[],
    [recipesQuery]
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
  const mealSuggestions = nutritionPlan?.mealSuggestions ?? []
  const calibration = nutritionPlan?.calibration
  const calorieTarget = Math.round(goals?.calories ?? 2000)
  const macroTargets: Record<MacroKey, number> = {
    protein: Math.round(goals?.protein ?? 140),
    carbs: Math.round(goals?.carbs ?? 220),
    fat: Math.round(goals?.fat ?? 65),
  }
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
  const loggedToday = entries.length + waterEntries.length + supplementDone
  const recentFood = [...entries]
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
    .slice(0, 3)

  function addWater(amountMl: number) {
    if (amountMl <= 0) return
    void addWaterEntry({
      date: todayKey,
      entry: {
        id: crypto.randomUUID(),
        amountMl,
        loggedAt: new Date().toISOString(),
      },
    })
  }

  function logRecipe(recipe: Recipe) {
    const totals = totalsForRecipe(recipe.ingredients)
    void setFoodDay({
      date: todayKey,
      entries: [
        ...entries,
        stripUndefined({
          id: crypto.randomUUID(),
          name: recipe.name,
          ...totals,
          loggedAt: new Date().toISOString(),
          meal: defaultMeal(),
          recipeId: recipe._id,
        }),
      ],
    })
    setAddOpen(false)
  }

  function editRecipeFromLogEntry(entry: FoodLogEntry) {
    const replaceFoodLogEntry = { date: todayKey, entryId: entry.id }
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

  function takeSupplement(plan: SupplementDayPlanItem) {
    if (!plan.item._id) return
    void logSupplementTaken({
      supplementId: plan.item._id as Id<"supplementItems">,
      date: todayKey,
      loggedAt: new Date().toISOString(),
      servingMultiplier: 1,
    })
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

  function runMealSuggestion(
    suggestion: NutritionPlan["mealSuggestions"][number]
  ) {
    if (suggestion.action === "create_recipe") {
      navigate("/foods/recipe/new")
      return
    }
    if (suggestion.action === "photo_log") {
      navigate("/camera")
      return
    }
    if (suggestion.action === "search_food") {
      navigate("/foods/search")
      return
    }
    if (suggestion.action === "log_recipe" && suggestion.recipeId) {
      const recipe = recipes.find(
        (item) => String(item._id) === suggestion.recipeId
      )
      if (recipe) {
        logRecipe(recipe)
        return
      }
    }
    navigate("/foods")
  }

  function openSupplements() {
    hapticSelection()
    navigate("/supplements", { motion: "forward" })
  }

  function onSupplementSwipeStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    supplementSwipeStart.current = { x: touch.clientX, y: touch.clientY }
  }

  function onSupplementSwipeEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (!supplementSwipeStart.current) return

    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - supplementSwipeStart.current.x
    const deltaY = touch.clientY - supplementSwipeStart.current.y
    supplementSwipeStart.current = null

    if (
      deltaX <= -SUPPLEMENT_SWIPE_THRESHOLD &&
      Math.abs(deltaY) < Math.abs(deltaX) * 0.75
    ) {
      suppressSupplementClick.current = true
      openSupplements()
    }
  }

  function onSupplementShortcutClick() {
    if (suppressSupplementClick.current) {
      suppressSupplementClick.current = false
      return
    }
    openSupplements()
  }

  function onSupplementShortcutKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    openSupplements()
  }

  const isMobile = useIsMobile()

  return (
    <div className="bg-background lg:pr-8 lg:pl-72 min-h-svh desktop-canvas">
      <main className="app-page">
        <header className="app-header">
          <div
            className={cn(
              "group min-w-0 flex-1 cursor-pointer touch-pan-y select-none"
            )}
            role="button"
            tabIndex={0}
            aria-label="Swipe left or press Enter to view supplements"
            onClick={onSupplementShortcutClick}
            onKeyDown={onSupplementShortcutKey}
            onTouchStart={onSupplementSwipeStart}
            onTouchEnd={onSupplementSwipeEnd}
          >
            <h1 className="app-title">Nutrition</h1>
            <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-border/45 bg-foreground/[0.045] py-1.5 pr-2 pl-2.5 text-[11px] font-semibold text-muted-foreground/68 transition-colors group-active:bg-foreground/[0.08] group-active:text-foreground/78">
              <Pill size={13} weight="bold" className="shrink-0" />
              <span className="min-w-0 truncate">
                Swipe left to view supplements
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/35" />
                <span className="h-1.5 w-4 rounded-full bg-foreground/70" />
              </span>
              <CaretRight size={12} weight="bold" className="shrink-0" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="md:hidden app-header-icon-action"
            aria-label="Add nutrition entry"
          >
            <Plus weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="hidden md:inline-flex bg-foreground text-background app-button"
            aria-label="Add nutrition entry"
          >
            <Plus size={13} weight="bold" /> Add
          </button>
        </header>

        <section className="p-4 app-surface">
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0">
              <p className="mt-2 font-extrabold tabular-nums text-[2.25rem] leading-none">
                {visibleMetrics.calories
                  ? caloriesLeft >= 0
                    ? fmt(caloriesLeft)
                    : `+${fmt(Math.abs(caloriesLeft))}`
                  : loggedToday}
              </p>
              <p className="mt-1 font-semibold text-[11px] text-muted-foreground/58">
                {visibleMetrics.calories
                  ? `kcal ${caloriesLeft >= 0 ? "left" : "over"} · ${loggedToday} logs`
                  : `logs today · ${nutritionPlan?.trackingMode ?? "habit"} mode`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/foods/search")}
              className="app-button app-button-quiet shrink-0"
            >
              Log {currentMealLabel.toLowerCase()}
            </button>
          </div>

          <div className="gap-2.5 grid grid-cols-1 min-[430px]:grid-cols-3 mt-5">
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
              detail={supplementTarget > 0 ? "planned taken" : "none planned"}
              icon={<Pill size={15} weight="bold" />}
              complete={
                supplementTarget > 0 && supplementDone >= supplementTarget
              }
            />
          </div>
        </section>

        {(compiledTarget?.calorieStrategy || targetGuidance.length > 0) && (
          <section className="mt-3 p-4 app-surface">
            <div className="flex items-start gap-3">
              <span className="flex justify-center items-center bg-muted/45 rounded-full w-9 h-9 text-foreground/72 shrink-0">
                <Sparkle size={16} weight="bold" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="app-section-title">Personalized plan</p>
                  {compiledTarget.safetyMode && (
                    <span className="bg-muted/55 px-2 py-1 rounded-full font-bold text-[10px] text-muted-foreground/70 uppercase">
                      {compiledTarget.safetyMode}
                    </span>
                  )}
                </div>
                {compiledTarget.calorieStrategy && (
                  <p className="mt-2 font-semibold text-[12.5px] text-foreground/78 leading-5">
                    {compiledTarget.calorieStrategy}
                  </p>
                )}
                {targetGuidance.length > 0 && (
                  <div className="gap-1.5 grid mt-3">
                    {targetGuidance.map((item) => (
                      <p
                        key={item}
                        className="text-[12px] text-muted-foreground/62 leading-5"
                      >
                        {item}
                      </p>
                    ))}
                  </div>
                )}
                {(compiledTarget.fiber ||
                  compiledTarget.saturatedFatLimit ||
                  compiledTarget.sodiumLimit) && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {compiledTarget.fiber && (
                      <span className="bg-muted/45 px-2.5 py-1 rounded-full font-semibold text-[11px] text-muted-foreground/72">
                        Fiber {fmt(compiledTarget.fiber)}g
                      </span>
                    )}
                    {compiledTarget.saturatedFatLimit && (
                      <span className="bg-muted/45 px-2.5 py-1 rounded-full font-semibold text-[11px] text-muted-foreground/72">
                        Sat fat &lt; {fmt(compiledTarget.saturatedFatLimit)}g
                      </span>
                    )}
                    {compiledTarget.sodiumLimit && (
                      <span className="bg-muted/45 px-2.5 py-1 rounded-full font-semibold text-[11px] text-muted-foreground/72">
                        Sodium &lt; {fmt(compiledTarget.sodiumLimit)}mg
                      </span>
                    )}
                  </div>
                )}
                {calibration && (
                  <div className="bg-muted/30 mt-3 px-3 py-2.5 rounded-[0.9rem]">
                    <p className="font-bold text-[12px] text-foreground/78">
                      {calibration.title}
                    </p>
                    <p className="mt-1 text-[11.5px] text-muted-foreground/60 leading-4">
                      {calibration.detail}
                    </p>
                    {calibration.canApply && calibration.targets && (
                      <button
                        type="button"
                        onClick={() => void applyPlanCalibration()}
                        disabled={applyingCalibration}
                        className="bg-foreground mt-2 h-9 text-background app-button"
                      >
                        {applyingCalibration
                          ? "Applying..."
                          : "Apply adjustment"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
        <section className="gap-3 grid md:grid-cols-[1fr_0.82fr] mt-3">
          <div className="p-4 app-surface">
            <div className="flex justify-between items-center gap-3 mb-3">
              <p className="app-section-title">Intake</p>
              <button
                type="button"
                onClick={() => navigate("/foods")}
                className="h-9 app-button app-button-quiet"
              >
                Diary
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
                <p className="text-[12px] text-muted-foreground/58 leading-5">
                  This mode keeps nutrition feedback non-numeric. Log meals when
                  useful and focus on consistency.
                </p>
              )}
            </div>
            <div className="mt-4 pt-3 border-border/35 border-t">
              {recentFood.length > 0 ? (
                <div className="space-y-2">
                  {recentFood.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex justify-between items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[13px] truncate">
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
                          className="flex justify-center items-center bg-muted/55 active:opacity-70 rounded-full w-8 h-8 text-muted-foreground/55 transition-opacity shrink-0"
                          aria-label={`Edit recipe for ${entry.name}`}
                        >
                          <PencilSimple size={12} weight="bold" />
                        </button>
                      )}
                      <span className="font-bold tabular-nums text-[12px] shrink-0">
                        {fmt(entry.calories)} kcal
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground/58 leading-5">
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
          </div>

          <div className="gap-3 grid">
            <div className="p-4 app-surface">
              <div className="flex justify-between items-center gap-3 mb-3">
                <p className="app-section-title">Water</p>
                <button
                  type="button"
                  onClick={() => navigate("/water")}
                  className="h-9 app-button app-button-quiet"
                >
                  Details
                </button>
              </div>
              <ProgressLine
                label="Hydration"
                value={waterTotal}
                target={waterGoal}
                suffix="ml"
                color={APP_ACCENT_COLORS.water}
              />
              <div className="gap-2.5 grid grid-cols-2 min-[430px]:grid-cols-4 mt-4">
                {QUICK_WATER.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => addWater(amount)}
                    className="justify-center app-button app-button-quiet"
                  >
                    +{fmtWater(amount)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomWaterOpen(true)}
                  className="justify-center app-button app-button-quiet"
                >
                  Custom
                </button>
              </div>
            </div>

            <div className="p-4 app-surface">
              <div className="flex justify-between items-center gap-3 mb-1">
                <p className="app-section-title">Supplements</p>
                <button
                  type="button"
                  onClick={() => navigate("/supplements")}
                  className="h-9 app-button app-button-quiet"
                >
                  Manage
                </button>
              </div>
              {visibleSupplements.length > 0 ? (
                <div>
                  {visibleSupplements.map((plan) => (
                    <SupplementRow
                      key={plan.item._id ?? plan.item.name}
                      plan={plan}
                      onTake={takeSupplement}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-muted-foreground/58 leading-5">
                  No active supplement plan. Add one when you need it.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>

      {customWaterOpen && (
        <CustomWaterSheet
          amount={customWaterAmount}
          onAmountChange={setCustomWaterAmount}
          onAdd={() => {
            addWater(customWaterAmount)
            setCustomWaterOpen(false)
          }}
          onClose={() => setCustomWaterOpen(false)}
        />
      )}

      {addOpen && (
        <MobileSheet
          onClose={() => setAddOpen(false)}
          overlayClassName="bg-black/45 backdrop-blur-[6px]"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
          panelStyle={{
            paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
          }}
          maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
        >
          <div className="px-4 pt-1 pb-4">
            <div className="overflow-hidden app-surface">
              {[
                {
                  label: "Search food",
                  detail: "Manual log",
                  Icon: MagnifyingGlass,
                  action: () => navigate("/foods/search"),
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
                  action: () => navigate("/camera"),
                },
                {
                  label: "Describe meal",
                  detail: "AI builds a temporary recipe",
                  Icon: Sparkle,
                  requiresAiAccess: true,
                  action: () => navigate("/foods?describe=1"),
                },
                {
                  label: "Add 250 ml water",
                  detail: "Quick hydration",
                  Icon: PintGlass,
                  action: () => addWater(250),
                },
                {
                  label: "Manage supplements",
                  detail: "Plan and log doses",
                  Icon: Pill,
                  action: () => navigate("/supplements"),
                },
              ].map(
                ({ label, detail, Icon, action, requiresAiAccess }, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (requiresAiAccess && !requireAiAccess()) return
                      setAddOpen(false)
                      action()
                    }}
                    className={cn(
                      "flex justify-between items-center gap-3 active:bg-muted/35 px-4 py-3.5 w-full text-left transition-colors",
                      index > 0 && "border-t border-border/40"
                    )}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="bg-muted/55 w-9 h-9 text-muted-foreground/70 pointer-events-none app-icon-button">
                        <Icon size={16} weight="bold" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-[13px]">
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
                  <div className="px-4 pt-3 pb-1 border-border/40 border-t">
                    <p className="font-bold text-[10px] text-muted-foreground/38 uppercase tracking-[0.14em]">
                      Saved recipes
                    </p>
                  </div>
                  {recipes.slice(0, 5).map((recipe) => {
                    const totals = totalsForRecipe(recipe.ingredients)
                    return (
                      <div
                        key={recipe._id ?? recipe.name}
                        className="flex items-center gap-1 px-2 py-1 w-full"
                      >
                        <button
                          type="button"
                          onClick={() => logRecipe(recipe)}
                          className="flex flex-1 justify-between items-center gap-3 active:bg-muted/40 px-2 py-2 rounded-xl min-w-0 text-left transition-colors"
                        >
                          <div className="min-w-0 text-left">
                            <p className="font-medium text-[13px] truncate">
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
                            className="text-muted-foreground/30 shrink-0"
                          />
                        </button>
                        {recipe._id && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddOpen(false)
                              navigate(`/foods/recipe/${recipe._id}`)
                            }}
                            className="flex justify-center items-center active:bg-muted/40 rounded-xl w-10 h-10 text-muted-foreground/50 transition-colors shrink-0"
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
