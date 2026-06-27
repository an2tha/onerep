import { useMemo, useState, type ReactNode } from "react"
import {
  Aperture,
  Barcode,
  CaretDown,
  CaretRight,
  CheckCircle,
  ForkKnife,
  MagnifyingGlass,
  Pill,
  PintGlass,
  Plus,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
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
  DEFAULT_MEAL_CATEGORIES,
  type FoodLogEntry,
  type FoodMicronutrientKey,
} from "@/lib/food-log"
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
        <p className="text-[17px] font-bold">Custom water</p>
        <p className="mt-1 text-[12px] text-muted-foreground/58">
          Save any amount to today’s hydration log.
        </p>
        <div className="mt-4 flex items-center justify-between rounded-[1rem] bg-muted/35 p-1">
          <button
            type="button"
            onClick={() => setClamped(amount - 50)}
            className="flex h-11 w-11 items-center justify-center rounded-[0.8rem] bg-background text-[18px] font-bold"
          >
            −
          </button>
          <label className="min-w-0 flex-1 px-3 text-center">
            <span className="sr-only">Water amount in milliliters</span>
            <input
              type="number"
              inputMode="numeric"
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
    <div className="rounded-[1rem] border border-border/50 bg-muted/20 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-muted-foreground/72">
          {icon}
        </span>
        {complete && (
          <CheckCircle
            size={16}
            weight="fill"
            className="text-[var(--status-complete)]"
          />
        )}
      </div>
      <p className="mt-2 text-[15px] leading-none font-extrabold tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[10.5px] font-bold text-muted-foreground/62">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground/50">
        {detail}
      </p>
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
    <div className="flex items-center gap-3 border-t border-border/35 py-3 first:border-t-0">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          taken
            ? "bg-[var(--status-complete)]"
            : skipped
              ? "bg-muted-foreground/35"
              : "bg-[var(--status-caution)]"
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
          className="app-button app-button-quiet h-9 shrink-0"
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
  useBottomBarAction(() => setAddOpen(true))

  const preferences = useQuery(api.users.users.getPreferences, {})
  const timeZone = preferences?.lastActiveTimezone || "UTC"
  const todayKey = currentDateKey(timeZone)

  const effectiveGoals = useQuery(api.users.users.getEffectiveGoals, {
    date: todayKey,
  })
  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date: todayKey })
  const waterLogs = useQuery(api.logs.water.getDay, { date: todayKey })
  const supplementOverviewRaw = useQuery(api.logs.supplements.getOverview, {
    date: todayKey,
  })

  const addWaterEntry = useOfflineMutation(
    api.logs.water.addEntry,
    "logs.water.addEntry"
  )
  const logSupplementTaken = useOfflineMutation(
    api.logs.supplements.logTaken,
    "logs.supplements.logTaken"
  )

  const entries = useMemo(() => (foodLogs ?? []) as FoodLogEntry[], [foodLogs])
  const waterEntries = (waterLogs ?? []) as WaterLogEntry[]
  const overview = (supplementOverviewRaw ?? {
    items: [],
    logs: [],
    legacyEntries: [],
    recentLogs: [],
    nutritionTotals: {},
    isTrainingDay: false,
  }) as SupplementOverview

  const goals = effectiveGoals?.effective
  const calorieTarget = Math.round(goals?.calories ?? 2000)
  const macroTargets: Record<MacroKey, number> = {
    protein: Math.round(goals?.protein ?? 140),
    carbs: Math.round(goals?.carbs ?? 220),
    fat: Math.round(goals?.fat ?? 65),
  }
  const foodTotals = useMemo(() => totalFood(entries), [entries])
  const microTotals = useMemo(() => nutritionDetailTotals(entries), [entries])
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
  const caloriesLeft = calorieTarget - foodTotals.calories
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

  function takeSupplement(plan: SupplementDayPlanItem) {
    if (!plan.item._id) return
    void logSupplementTaken({
      supplementId: plan.item._id,
      date: todayKey,
      loggedAt: new Date().toISOString(),
      servingMultiplier: 1,
    })
  }

  return (
    <div className="desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <main className="app-page">
        <header className="app-header">
          <div className="min-w-0">
            <h1 className="app-title">Nutrition</h1>
            <p className="mt-1 text-[12px] text-muted-foreground/60">
              Food, water, and supplements in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="app-button app-header-action bg-foreground text-background"
            aria-label="Add nutrition entry"
          >
            <Plus size={13} weight="bold" /> Add
          </button>
        </header>

        <section className="app-surface p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="app-eyebrow">Daily goals</p>
              <p className="mt-2 text-[2.25rem] leading-none font-extrabold tabular-nums">
                {caloriesLeft >= 0
                  ? fmt(caloriesLeft)
                  : `+${fmt(Math.abs(caloriesLeft))}`}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground/58">
                kcal {caloriesLeft >= 0 ? "left" : "over"} · {loggedToday} logs
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

          <div className="mt-4 grid grid-cols-3 gap-2">
            <GoalTile
              label="Food"
              value={`${pct(foodTotals.calories, calorieTarget)}%`}
              detail={`${fmt(foodTotals.calories)} / ${fmt(calorieTarget)} kcal`}
              icon={<ForkKnife size={15} weight="bold" />}
              complete={entries.length > 0 && caloriesLeft >= 0}
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

        <section className="mt-3 grid gap-3 md:grid-cols-[1fr_0.82fr]">
          <div className="app-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="app-section-title">Food</p>
              <button
                type="button"
                onClick={() => navigate("/foods/search")}
                className="app-button app-button-quiet h-9"
              >
                Search
              </button>
            </div>
            <div className="space-y-2.5">
              {(Object.keys(macroTargets) as MacroKey[]).map((key) => (
                <ProgressLine
                  key={key}
                  label={key[0].toUpperCase() + key.slice(1)}
                  value={foodTotals[key]}
                  target={macroTargets[key]}
                  suffix="g"
                  color={MACRO_COLORS[key]}
                />
              ))}
            </div>
            <div className="mt-4 border-t border-border/35 pt-3">
              {recentFood.length > 0 ? (
                <div className="space-y-2">
                  {recentFood.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold">
                          {entry.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/55">
                          {timeLabel(entry.loggedAt)}
                        </p>
                      </div>
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

            <MicroBreakdown
              open={microsOpen}
              onToggle={() => setMicrosOpen((value) => !value)}
              totals={microTotals}
            />
          </div>

          <div className="grid gap-3">
            <div className="app-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="app-section-title">Water</p>
                <button
                  type="button"
                  onClick={() => navigate("/water")}
                  className="app-button app-button-quiet h-9"
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
              <div className="mt-3 grid grid-cols-2 gap-2 min-[390px]:grid-cols-4">
                {QUICK_WATER.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => addWater(amount)}
                    className="app-button app-button-quiet justify-center"
                  >
                    +{fmtWater(amount)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomWaterOpen(true)}
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
                  className="app-button app-button-quiet h-9"
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
                <p className="mt-2 text-[12px] leading-5 text-muted-foreground/58">
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
        >
          <div className="px-4 pt-1 pb-4">
            <div className="app-surface overflow-hidden">
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
                  action: () => navigate("/camera"),
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
              ].map(({ label, detail, Icon, action }, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
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
                  <CaretRight size={12} className="text-muted-foreground/35" />
                </button>
              ))}
            </div>
          </div>
        </MobileSheet>
      )}
    </div>
  )
}
