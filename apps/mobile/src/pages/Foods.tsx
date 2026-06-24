import React, { useMemo, useState } from "react"
import {
  Aperture,
  Barbell,
  Barcode,
  BookBookmark,
  CalendarBlank,
  CaretDown,
  CaretRight,
  ForkKnife,
  MagnifyingGlass,
  PencilSimple,
  PintGlass,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { BottomBar } from "@/components/bottom-bar"
import { MobileSheet } from "@/components/mobile-sheet"
import { useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  FOOD_MICRONUTRIENT_KEYS,
  currentDateKey,
  defaultMeal,
  type FoodLogEntry,
  type Recipe,
  type RecipeIngredient,
  DEFAULT_MEAL_CATEGORIES,
  nutritionDetailTotals,
  type FoodMicronutrientKey,
} from "@/lib/food-log"
import {
  filledWaterGlassCount,
  waterAmountNeededForGlass,
  WATER_GLASS_COUNT,
  waterGlassTargetMl,
} from "@/lib/water-glasses"

// ─── Types ────────────────────────────────────────────────────────────────────

type CalorieInfo = {
  target: number
  protein: number
  carbs: number
  fat: number
  bmr: number
  tdee: number
}
type GoalOverride = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

type GoalField = keyof GoalOverride

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtKcal(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n))
}

const MACRO_COLOR = {
  protein: { solid: "#f59e0b", bg: "rgba(245,158,11,0.13)" },
  carbs: { solid: "#38bdf8", bg: "rgba(56,189,248,0.13)" },
  fat: { solid: "#a78bfa", bg: "rgba(167,139,250,0.13)" },
}

function SectionHeader({
  title,
  sub,
  action,
}: {
  title: string
  sub?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[13px] font-semibold tracking-[0.01em]">{title}</h2>
        {sub && (
          <p className="mt-0.5 text-[11px] text-muted-foreground/60">{sub}</p>
        )}
      </div>
      {action}
    </div>
  )
}

function FoodActionRow({
  onSearch,
  onScan,
  onSnap,
}: {
  onSearch: () => void
  onScan: () => void
  onSnap: () => void
}) {
  return (
    <section className="grid w-full grid-cols-[minmax(0,1fr)_3rem_3rem] gap-2 px-4 pb-3 md:px-6 short-phone:gap-1.5 short-phone:pb-2">
      <button
        type="button"
        onClick={onSearch}
        className="flex min-h-11 min-w-0 items-center gap-3 rounded-[18px] border border-border/60 bg-card px-3.5 text-left text-foreground transition-transform active:scale-[0.99] short-phone:min-h-10"
      >
        <MagnifyingGlass size={17} weight="bold" className="shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold">
            Search food
          </span>
          <span className="block truncate text-[11px] text-muted-foreground/60">
            Name, brand, meal
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onScan}
        className="flex min-h-11 w-12 items-center justify-center rounded-[18px] border border-border/60 bg-card text-muted-foreground transition-colors active:bg-muted/70 short-phone:min-h-10"
        aria-label="Scan barcode"
      >
        <Barcode size={18} weight="bold" />
      </button>
      <button
        type="button"
        onClick={onSnap}
        className="flex min-h-11 w-12 items-center justify-center rounded-[18px] border border-border/60 bg-card text-muted-foreground transition-colors active:bg-muted/70 short-phone:min-h-10"
        aria-label="Snap meal"
      >
        <Aperture size={18} weight="bold" />
      </button>
    </section>
  )
}

// ─── Swipeable entry row ──────────────────────────────────────────────────────

function SwipeRow({
  entry,
  onDelete,
}: {
  entry: FoodLogEntry
  onDelete: () => void
}) {
  const [tx, setTx] = React.useState(0)
  const startX = React.useRef(0)
  const txRef = React.useRef(0)
  const dragging = React.useRef(false)
  const ACTION_WIDTH = 72

  function setTranslate(next: number) {
    txRef.current = next
    setTx(next)
  }

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX
    dragging.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    setTranslate(
      Math.max(-ACTION_WIDTH, Math.min(0, e.clientX - startX.current))
    )
  }

  function onPointerUp() {
    dragging.current = false
    setTranslate(txRef.current <= -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0)
  }

  const revealed = tx <= -ACTION_WIDTH

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onDelete}
        disabled={!revealed}
        tabIndex={revealed ? 0 : -1}
        aria-label={`Delete ${entry.name}`}
        className="absolute inset-y-0 right-0 flex w-[72px] items-center justify-center bg-destructive/90 text-white transition-opacity disabled:pointer-events-none disabled:opacity-0"
        style={{ borderRadius: "0 8px 8px 0" }}
      >
        <Trash size={14} weight="fill" className="text-white" />
      </button>

      {/* The row itself */}
      <div
        className="relative flex touch-pan-y items-center gap-2 bg-card py-[5px] transition-transform duration-150 ease-out"
        style={{ transform: `translateX(${tx}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/80">
          {entry.name}
        </p>
        <span className="shrink-0 text-[12px] font-medium text-foreground/55 tabular-nums">
          {entry.calories}
        </span>
      </div>
    </div>
  )
}

// ─── Grouped diary entries ────────────────────────────────────────────────────

function DiaryEntries({
  entries,
  dateKey: _dateKey,
  onDelete,
}: {
  entries: FoodLogEntry[]
  dateKey: string
  onDelete?: (index: number) => void
}) {
  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.loggedAt.localeCompare(b.entry.loggedAt))
  const cats = DEFAULT_MEAL_CATEGORIES
  const byMeal = new Map<string, { entry: FoodLogEntry; index: number }[]>()
  for (const item of sorted) {
    if (!byMeal.has(item.entry.meal)) byMeal.set(item.entry.meal, [])
    byMeal.get(item.entry.meal)!.push(item)
  }
  const groups = cats
    .filter((c) => byMeal.has(c.id))
    .map((c) => ({ cfg: c, entries: byMeal.get(c.id)! }))

  const total = entries.reduce(
    (a, e) => ({
      kcal: a.kcal + e.calories,
      p: a.p + (e.protein || 0),
      c: a.c + (e.carbs || 0),
      f: a.f + (e.fat || 0),
    }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  )

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map(({ cfg, entries: ge }) => {
        const gKcal = ge.reduce((s, item) => s + item.entry.calories, 0)
        return (
          <div key={cfg.label}>
            <div className="mb-0.5 flex items-center justify-between">
              <span
                className="text-[9.5px] font-semibold tracking-[0.13em] uppercase"
                style={{ color: cfg.color }}
              >
                {cfg.label}
              </span>
              <span className="text-[9.5px] text-muted-foreground/35 tabular-nums">
                {gKcal} kcal
              </span>
            </div>
            {ge.map(({ entry, index }) =>
              onDelete ? (
                <SwipeRow
                  key={`${entry.id}-${index}`}
                  entry={entry}
                  onDelete={() => onDelete(index)}
                />
              ) : (
                <div
                  key={`${entry.id}-${index}`}
                  className="flex items-center gap-2 py-[5px]"
                >
                  <p className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/80">
                    {entry.name}
                  </p>
                  <span className="shrink-0 text-[12px] font-medium text-foreground/55 tabular-nums">
                    {entry.calories}
                  </span>
                </div>
              )
            )}
          </div>
        )
      })}
      <div className="flex items-center justify-between border-t border-border/25 pt-2">
        <span className="text-[9.5px] font-semibold tracking-[0.13em] text-muted-foreground/40 uppercase">
          Total
        </span>
        <div className="flex items-baseline gap-2">
          {total.p > 0 && (
            <span className="text-[9.5px] text-muted-foreground/35 tabular-nums">
              P{Math.round(total.p)} C{Math.round(total.c)} F
              {Math.round(total.f)}g
            </span>
          )}
          <span className="text-[13px] font-semibold tabular-nums">
            {total.kcal}
            <span className="ml-0.5 text-[9.5px] font-normal text-muted-foreground/40">
              {" "}
              kcal
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Today's diary card ───────────────────────────────────────────────────────

function TodayDiaryCard({
  entries,
  dateKey,
  onDelete,
}: {
  entries: FoodLogEntry[]
  dateKey: string
  onDelete: (index: number) => void
}) {
  return (
    <div className="rounded-[18px] border border-border/50 bg-card px-4 py-3.5">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
          Today
        </p>
        <span className="text-[11px] text-muted-foreground/35 tabular-nums">
          {entries.reduce((s, e) => s + e.calories, 0)} kcal
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="flex items-center gap-2 py-2">
          <ForkKnife size={13} className="text-muted-foreground/20" />
          <p className="text-[12px] text-muted-foreground/35">
            Nothing logged yet — tap + to add
          </p>
        </div>
      ) : (
        <DiaryEntries entries={entries} dateKey={dateKey} onDelete={onDelete} />
      )}
    </div>
  )
}

// ─── History sheet ────────────────────────────────────────────────────────────

function HistorySheet({ onClose }: { onClose: () => void }) {
  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/40 backdrop-blur-[4px]"
      panelClassName="mx-auto w-full max-w-sm rounded-t-[28px] bg-card shadow-[0_-20px_60px_rgba(0,0,0,0.2)] max-h-[88svh] flex flex-col"
      panelStyle={{
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
      }}
    >
      <div className="flex-1 overflow-y-auto px-4 pt-1 [&::-webkit-scrollbar]:hidden">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[15px] font-semibold">History</p>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/50 active:opacity-60"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <CalendarBlank size={28} className="text-muted-foreground/20" />
          <p className="text-[13px] text-muted-foreground/40">
            Visit Home to see past days
          </p>
        </div>
      </div>
    </MobileSheet>
  )
}

// ─── Compact stats bar ────────────────────────────────────────────────────────

function StatsBar({
  entries,
  goals,
  loading,
}: {
  entries: FoodLogEntry[]
  goals: GoalOverride
  loading: boolean
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(false)
    const t = setTimeout(() => setMounted(true), 100)
    return () => clearTimeout(t)
  }, [loading])

  const consumed = entries.reduce((s, e) => s + e.calories, 0)
  const protein = entries.reduce((s, e) => s + (e.protein || 0), 0)
  const carbs = entries.reduce((s, e) => s + (e.carbs || 0), 0)
  const fat = entries.reduce((s, e) => s + (e.fat || 0), 0)
  const calPct =
    goals.calories > 0 ? Math.min(100, (consumed / goals.calories) * 100) : 0
  const over = consumed > goals.calories

  const macros = [
    {
      key: "protein" as const,
      val: protein,
      target: goals.protein,
      label: "P",
    },
    { key: "carbs" as const, val: carbs, target: goals.carbs, label: "C" },
    { key: "fat" as const, val: fat, target: goals.fat, label: "F" },
  ]

  if (loading) {
    return (
      <div className="rounded-[20px] bg-card px-4 py-3.5 ring-1 ring-border/40 short-phone:rounded-[18px] short-phone:px-3.5 short-phone:py-3">
        <div className="flex gap-3">
          <div className="h-12 w-20 animate-pulse rounded-lg bg-muted/50" />
          <div className="flex flex-1 flex-col gap-1.5 pt-1">
            {[60, 80, 50].map((w, i) => (
              <div
                key={i}
                className="h-2 animate-pulse rounded bg-muted/40"
                style={{ width: w }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[20px] bg-card px-4 py-3.5 ring-1 ring-border/40 short-phone:rounded-[18px] short-phone:px-3.5 short-phone:py-3">
      <div className="flex items-start gap-4">
        {/* Calorie block */}
        <div className="min-w-0 shrink-0">
          <span
            className={cn(
              "text-[2rem] leading-none font-bold tracking-tight tabular-nums",
              over && "text-destructive/80"
            )}
          >
            {fmtKcal(consumed)}
          </span>
          <p className="mt-0.5 text-[9.5px] text-muted-foreground/40">
            <span className="tabular-nums">
              {fmtKcal(Math.abs(goals.calories - consumed))}
            </span>{" "}
            {over ? "over" : "left"}
          </p>
          {/* Calorie progress bar */}
          <div className="relative mt-2 h-[2px] w-20 rounded-sm bg-muted/40">
            <div
              className="absolute inset-y-0 left-0 rounded-sm transition-all duration-700 ease-out"
              style={{
                width: mounted ? `${calPct}%` : "0%",
                backgroundColor: over ? "#ef4444" : "var(--foreground)",
                opacity: 0.5,
              }}
            />
          </div>
          <p className="mt-0.5 text-[9px] text-muted-foreground/30 tabular-nums">
            of {fmtKcal(goals.calories)}
          </p>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch bg-border/25" />

        {/* Macro columns */}
        <div className="flex flex-1 justify-between">
          {macros.map(({ key, val, target, label }) => {
            const pct = target > 0 ? Math.min(100, (val / target) * 100) : 0
            const macOver = val > target
            return (
              <div key={key} className="flex flex-col items-center">
                <span className="text-[9px] font-semibold tracking-[0.12em] text-muted-foreground/40 uppercase">
                  {label}
                </span>
                <span
                  className="mt-0.5 text-[16px] leading-none font-semibold tabular-nums"
                  style={{
                    color: macOver ? "#ef4444" : MACRO_COLOR[key].solid,
                  }}
                >
                  {Math.round(val)}
                </span>
                <span className="text-[8.5px] text-muted-foreground/30 tabular-nums">
                  /{target}g
                </span>
                <div className="relative mt-1.5 h-[2px] w-10 rounded-sm bg-muted/40">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm transition-all duration-500 ease-out"
                    style={{
                      width: mounted ? `${pct}%` : "0%",
                      backgroundColor: macOver
                        ? "#ef4444"
                        : MACRO_COLOR[key].solid,
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Goals card ───────────────────────────────────────────────────────────────

// ─── Micronutrients card ──────────────────────────────────────────────────────

type MicroDetail = {
  label: string
  unit: string
  color: string
  dv?: number
}

const MICRO_DETAILS: Record<FoodMicronutrientKey, MicroDetail> = {
  fiber: { label: "Fiber", unit: "g", dv: 28, color: "#22c55e" },
  sugar: { label: "Total sugar", unit: "g", dv: 50, color: "#f59e0b" },
  saturatedFat: { label: "Saturated fat", unit: "g", dv: 20, color: "#fb7185" },
  transFat: { label: "Trans fat", unit: "g", color: "#f43f5e" },
  cholesterol: { label: "Cholesterol", unit: "mg", dv: 300, color: "#f97316" },
  sodium: { label: "Sodium", unit: "mg", dv: 2300, color: "#38bdf8" },
  potassium: { label: "Potassium", unit: "mg", dv: 4700, color: "#34d399" },
  calcium: { label: "Calcium", unit: "mg", dv: 1300, color: "#60a5fa" },
  iron: { label: "Iron", unit: "mg", dv: 18, color: "#a78bfa" },
  magnesium: { label: "Magnesium", unit: "mg", dv: 420, color: "#2dd4bf" },
  phosphorus: { label: "Phosphorus", unit: "mg", dv: 1250, color: "#818cf8" },
  zinc: { label: "Zinc", unit: "mg", dv: 11, color: "#eab308" },
  vitaminC: { label: "Vitamin C", unit: "mg", dv: 90, color: "#facc15" },
  vitaminA: { label: "Vitamin A", unit: "mcg", dv: 900, color: "#fb923c" },
  vitaminD: { label: "Vitamin D", unit: "mcg", dv: 20, color: "#fbbf24" },
  vitaminB12: { label: "Vitamin B12", unit: "mcg", dv: 2.4, color: "#c084fc" },
  caffeine: { label: "Caffeine", unit: "mg", color: "#94a3b8" },
  alcohol: { label: "Alcohol", unit: "g", color: "#f87171" },
}

function dailyValueFor(cfg: MicroDetail) {
  return "dv" in cfg ? cfg.dv : undefined
}

type NutritionDetailDisplayKey = FoodMicronutrientKey

const MICRO_GROUPS = [
  { label: "Carbs", keys: ["fiber", "sugar"] },
  { label: "Fats", keys: ["saturatedFat", "transFat", "cholesterol"] },
  {
    label: "Minerals",
    keys: [
      "sodium",
      "potassium",
      "calcium",
      "iron",
      "magnesium",
      "phosphorus",
      "zinc",
    ],
  },
  {
    label: "Vitamins",
    keys: ["vitaminC", "vitaminA", "vitaminD", "vitaminB12"],
  },
  { label: "Other", keys: ["caffeine", "alcohol"] },
] satisfies { label: string; keys: NutritionDetailDisplayKey[] }[]

function formatMicroValue(value: number) {
  if (value >= 100) return Math.round(value).toLocaleString("en-US")
  if (value >= 10) return value.toFixed(1).replace(/\.0$/, "")
  if (value >= 1) return value.toFixed(1)
  return value.toFixed(2).replace(/0$/, "")
}

function formatDailyValuePercent(percent: number) {
  if (percent > 0 && percent < 1) return "<1%"
  return `${Math.round(percent)}%`
}

function MicronutrientsCard({ entries }: { entries: FoodLogEntry[] }) {
  const [open, setOpen] = useState(true)
  const totals = useMemo(() => nutritionDetailTotals(entries), [entries])

  const keys = FOOD_MICRONUTRIENT_KEYS.filter((k) => totals[k] != null)
  const groups = MICRO_GROUPS.map((group) => ({
    ...group,
    keys: group.keys.filter((key) => totals[key] != null),
  })).filter((group) => group.keys.length > 0)

  if (keys.length === 0) {
    return (
      <div className="rounded-[20px] bg-card px-4 py-3.5 ring-1 ring-border/40 short-phone:rounded-[18px] short-phone:px-3.5 short-phone:py-3">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
          Micronutrients
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground/40">
          {entries.length === 0
            ? "No food logged today."
            : "No micronutrient data available for today's foods."}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[20px] bg-card px-4 py-3.5 ring-1 ring-border/40 short-phone:rounded-[18px] short-phone:px-3.5 short-phone:py-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
            Micronutrients
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground/30">
            {keys.length} tracked breakdown{keys.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-muted/45 px-2 py-0.5 text-[9.5px] font-semibold text-muted-foreground/45 tabular-nums">
            {keys.length}
          </span>
          <CaretDown
            size={9}
            weight="bold"
            className={cn(
              "text-muted-foreground/30 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {!open && (
        <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {keys.slice(0, 5).map((k) => {
            const cfg = MICRO_DETAILS[k]
            const val = totals[k] ?? 0
            const dailyValue = dailyValueFor(cfg)
            const pct = dailyValue ? (val / dailyValue) * 100 : null
            return (
              <div key={k} className="min-w-0">
                <span className="block truncate text-[9px] font-medium text-muted-foreground/35">
                  {cfg.label}
                </span>
                <p className="mt-0.5 text-[13px] leading-none font-semibold tabular-nums">
                  {formatMicroValue(val)}
                  <span className="ml-0.5 text-[8.5px] font-normal text-muted-foreground/35">
                    {cfg.unit}
                  </span>
                </p>
                {pct !== null && (
                  <span className="text-[9px] text-muted-foreground/30 tabular-nums">
                    {formatDailyValuePercent(pct)} DV
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          open
            ? "mt-3 grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 text-[9px] font-semibold tracking-[0.16em] text-muted-foreground/30 uppercase">
                  {group.label}
                </p>
                <div className="divide-y divide-border/25">
                  {group.keys.map((k) => {
                    const cfg = MICRO_DETAILS[k]
                    const val = totals[k] ?? 0
                    const dailyValue = dailyValueFor(cfg)
                    const pct = dailyValue ? (val / dailyValue) * 100 : null
                    const cappedPct = pct === null ? 0 : Math.min(100, pct)
                    const barPct = pct === null ? 0 : Math.max(3, cappedPct)
                    const over = dailyValue ? val > dailyValue : false
                    return (
                      <div key={k} className="py-2 first:pt-0 last:pb-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2 text-[12px] leading-none text-foreground/85">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: cfg.color }}
                            />
                            <span className="truncate">{cfg.label}</span>
                          </span>
                          <span className="shrink-0 text-[12px] font-semibold tabular-nums">
                            {formatMicroValue(val)}
                            <span className="ml-0.5 text-[9px] font-normal text-muted-foreground/35">
                              {cfg.unit}
                            </span>
                          </span>
                        </div>
                        {pct !== null ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="relative h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-muted/40">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full"
                                style={{
                                  width: `${barPct}%`,
                                  backgroundColor: over ? "#f59e0b" : cfg.color,
                                  opacity: over ? 0.7 : 0.55,
                                }}
                              />
                            </div>
                            <span
                              className={cn(
                                "w-9 text-right text-[9.5px] tabular-nums",
                                over
                                  ? "text-amber-500/75"
                                  : "text-muted-foreground/30"
                              )}
                            >
                              {formatDailyValuePercent(pct)}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1.5 h-px bg-border/20" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <p className="mt-0.5 text-[9px] text-muted-foreground/25">
              % Daily Value based on FDA 2,000 kcal reference.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Recipe helpers ───────────────────────────────────────────────────────────

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

function recipeTotals(ingredients: RecipeIngredient[]) {
  const totals = ingredients.reduce(
    (acc, i) => {
      acc.calories += Math.round((i.caloriesPer100 * i.grams) / 100)
      acc.protein += Math.round((i.proteinPer100 * i.grams) / 100)
      acc.carbs += Math.round((i.carbsPer100 * i.grams) / 100)
      acc.fat += Math.round((i.fatPer100 * i.grams) / 100)

      for (const key of FOOD_MICRONUTRIENT_KEYS) {
        const per100Key = RECIPE_MICRO_PER100_KEYS[key]
        const value = Number(i[per100Key])
        if (!Number.isFinite(value) || value <= 0) continue
        acc[key] = (acc[key] ?? 0) + (value * i.grams) / 100
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

const RECIPE_MACRO_PILLS = [
  { label: "P", key: "protein" as const, color: "#60a5fa" },
  { label: "C", key: "carbs" as const, color: "#a78bfa" },
  { label: "F", key: "fat" as const, color: "#fb923c" },
]

// ─── Recipe log sheet ─────────────────────────────────────────────────────────

function RecipeLogSheet({
  recipe,
  onLog,
  onClose,
}: {
  recipe: Recipe
  onLog: (meal: string) => void
  onClose: () => void
}) {
  const categories = DEFAULT_MEAL_CATEGORIES
  const suggested = defaultMeal()
  const totals = recipeTotals(recipe.ingredients)

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
        <p className="text-[15px] leading-snug font-semibold">Log to…</p>
        <p className="mb-0.5 truncate text-[11.5px] text-muted-foreground/45">
          {recipe.name}
        </p>
        <p className="mb-4 text-[11px] text-muted-foreground/30 tabular-nums">
          {totals.calories} kcal · P{totals.protein} C{totals.carbs} F
          {totals.fat}g
        </p>
        <div className="flex flex-col gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onLog(cat.id)}
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

// ─── Recipe card ──────────────────────────────────────────────────────────────

function RecipeCard({
  recipe,
  onEdit,
  onDelete,
  onLog,
}: {
  recipe: Recipe
  onEdit: () => void
  onDelete: () => void
  onLog: () => void
}) {
  const totals = recipeTotals(recipe.ingredients)

  return (
    <div className="rounded-[20px] bg-card px-4 py-3.5 ring-1 ring-border/40 short-phone:rounded-[18px] short-phone:px-3.5 short-phone:py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold">{recipe.name}</p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground/40">
            {recipe.ingredients.length} ingredient
            {recipe.ingredients.length !== 1 ? "s" : ""}
          </p>
          <div className="mt-1.5 flex gap-2.5">
            {RECIPE_MACRO_PILLS.map(({ label, key, color }) => (
              <span key={label} className="flex items-baseline gap-0.5">
                <span
                  className="text-[9.5px] font-semibold"
                  style={{ color, opacity: 0.75 }}
                >
                  {label}
                </span>
                <span className="text-[10.5px] text-muted-foreground/50">
                  {totals[key]}g
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-[17px] leading-none font-bold tabular-nums">
            {totals.calories}
          </span>
          <span className="mt-0.5 text-[8.5px] text-muted-foreground/35">
            kcal
          </span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-xl border border-border/50 px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground/50 transition-colors active:bg-muted/40"
        >
          <PencilSimple size={10} />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="flex items-center justify-center rounded-xl border border-border/50 px-3 py-1.5 text-[11.5px] text-muted-foreground/40 transition-colors active:bg-muted/40"
        >
          <Trash size={11} />
        </button>
        <button
          onClick={onLog}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-foreground/[0.07] py-1.5 text-[12px] font-semibold transition-colors active:bg-foreground/[0.12]"
        >
          Log to diary
          <CaretRight
            size={10}
            weight="bold"
            className="text-muted-foreground/40"
          />
        </button>
      </div>
    </div>
  )
}

// ─── Constants for Goals ───────────────────────────────────────────────────────

function GoalsCardWrapper({
  goals,
  apiGoals,
  onSave,
}: {
  goals: GoalOverride
  apiGoals: CalorieInfo | null
  onSave: (g: GoalOverride) => void | Promise<void>
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<GoalOverride>(goals)
  React.useEffect(() => {
    setDraft(goals)
  }, [goals])

  function adjust(key: GoalField, delta: number) {
    const f = GOAL_FIELDS.find((f) => f.key === key)!
    setDraft((prev) => ({ ...prev, [key]: Math.max(f.min, prev[key] + delta) }))
  }

  return (
    <div className="rounded-[20px] bg-card px-4 py-3.5 ring-1 ring-border/40 short-phone:rounded-[18px] short-phone:px-3.5 short-phone:py-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
          Daily goals
        </p>
        <button
          onClick={() => setEditing((o) => !o)}
          className="flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground/40 active:text-muted-foreground/70"
        >
          {editing ? <X size={9} weight="bold" /> : <PencilSimple size={10} />}
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground/45">
        Edits are saved as persistent food goals.
      </p>

      {/* Summary row */}
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          editing
            ? "mt-0 grid-rows-[0fr] opacity-0"
            : "mt-2.5 grid-rows-[1fr] opacity-100"
        )}
      >
        <div className="overflow-hidden">
          <div className="flex items-baseline gap-4">
            {GOAL_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex flex-col">
                <span className="text-[14px] leading-none font-semibold tabular-nums">
                  {goals[key]}
                </span>
                <span className="mt-0.5 text-[9px] font-medium tracking-[0.1em] text-muted-foreground/35 uppercase">
                  {key === "calories" ? "kcal" : label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          editing
            ? "mt-3 grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2">
            {GOAL_FIELDS.map(({ key, label, unit, step, min }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-[13px] font-medium">{label}</span>
                  <span className="text-[10px] text-muted-foreground/40">
                    {unit}
                  </span>
                </div>
                <div className="flex items-center rounded-lg bg-muted/50 p-0.5">
                  <button
                    onClick={() => adjust(key, -step)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 active:bg-background active:text-foreground"
                  >
                    <span className="text-[15px] leading-none">−</span>
                  </button>
                  <input
                    type="number"
                    value={draft[key]}
                    onChange={(e) => {
                      const v = parseInt(e.target.value)
                      if (!isNaN(v))
                        setDraft((p) => ({ ...p, [key]: Math.max(min, v) }))
                    }}
                    className="w-14 bg-transparent text-center text-[13px] font-semibold tabular-nums outline-none"
                  />
                  <button
                    onClick={() => adjust(key, step)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 active:bg-background active:text-foreground"
                  >
                    <span className="text-[15px] leading-none">+</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                onSave(draft)
                setEditing(false)
              }}
              className="flex-1 rounded-lg bg-foreground py-2 text-[12.5px] font-semibold text-background active:opacity-75"
            >
              Save
            </button>
            {apiGoals && (
              <button
                onClick={() => {
                  const r = {
                    calories: apiGoals.target,
                    protein: apiGoals.protein,
                    carbs: apiGoals.carbs,
                    fat: apiGoals.fat,
                  }
                  setDraft(r)
                  onSave(r)
                  setEditing(false)
                }}
                className="rounded-lg border border-border/50 px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground/60 active:bg-muted/40"
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

// ─── Water card ───────────────────────────────────────────────────────────────

function fmtWater(ml: number): string {
  if (ml >= 1000) {
    const l = ml / 1000
    return l % 1 === 0 ? `${l} L` : `${l.toFixed(1)} L`
  }
  return `${ml} ml`
}

function WaterCard({ dateKey }: { dateKey: string }) {
  const navigate = useSmoothNavigate()
  const [hoveredGlass, setHoveredGlass] = useState<number | null>(null)
  const preferences = useQuery(api.users.users.getPreferences)
  const goalMl = preferences?.waterGoalMl ?? 2500

  const rawEntries = useQuery(api.logs.water.getDay, { date: dateKey })
  const setWaterDay = useOfflineMutation(
    api.logs.water.setDay,
    "logs.water.setDay"
  )

  const entries = (rawEntries ?? []) as {
    id: string
    amountMl: number
    loggedAt: string
  }[]
  const totalMl = entries.reduce((s, e) => s + e.amountMl, 0)
  const mlPerGlass = waterGlassTargetMl(goalMl, 1)
  const filledCount = filledWaterGlassCount(totalMl, goalMl)
  const previewFilledCount =
    hoveredGlass === null
      ? filledCount
      : Math.max(filledCount, hoveredGlass + 1)

  function addWater(amountMl: number) {
    if (amountMl <= 0) return
    const entry = {
      id: crypto.randomUUID(),
      amountMl,
      loggedAt: new Date().toISOString(),
    }
    void setWaterDay({ date: dateKey, entries: [...entries, entry] })
  }

  function addGlass() {
    if (filledCount >= WATER_GLASS_COUNT) {
      addWater(mlPerGlass)
      return
    }
    addWater(waterAmountNeededForGlass(totalMl, goalMl, filledCount + 1))
  }

  function fillToGlass(index: number) {
    addWater(waterAmountNeededForGlass(totalMl, goalMl, index + 1))
  }

  function removeLastEntry() {
    if (entries.length === 0) return
    const sorted = [...entries].sort((a, b) =>
      b.loggedAt.localeCompare(a.loggedAt)
    )
    void setWaterDay({ date: dateKey, entries: sorted.slice(1) })
  }

  return (
    <div className="rounded-[20px] bg-card px-4 py-3.5 ring-1 ring-border/40 short-phone:rounded-[18px] short-phone:px-3.5 short-phone:py-3">
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
          Hydration
        </p>
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground/40 active:text-muted-foreground/70"
        >
          <PencilSimple size={10} />
          Goal
        </button>
      </div>

      {/* Glass grid */}
      <div
        className="grid grid-cols-4 gap-2 short-phone:gap-1.5"
        onPointerLeave={() => setHoveredGlass(null)}
      >
        {Array.from({ length: WATER_GLASS_COUNT }, (_, i) => {
          const filled = i < filledCount
          const previewFilled = i < previewFilledCount
          return (
            <button
              key={i}
              onClick={filled ? removeLastEntry : () => fillToGlass(i)}
              onPointerEnter={() => setHoveredGlass(i)}
              onFocus={() => setHoveredGlass(i)}
              onBlur={() => setHoveredGlass(null)}
              className={cn(
                "flex items-center justify-center rounded-xl py-2.5 transition-all active:scale-95 short-phone:py-2",
                previewFilled ? "bg-[rgba(56,189,248,0.13)]" : "bg-muted/25"
              )}
              aria-label={
                filled
                  ? "Remove last water entry"
                  : `Fill to ${fmtWater(waterGlassTargetMl(goalMl, i + 1))}`
              }
            >
              <PintGlass
                size={22}
                weight={previewFilled ? "fill" : "regular"}
                style={{ color: previewFilled ? "#38bdf8" : undefined }}
                className={
                  previewFilled ? undefined : "text-muted-foreground/20"
                }
              />
            </button>
          )
        })}
      </div>

      {/* Summary */}
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground/40 tabular-nums">
          {fmtWater(totalMl)} / {fmtWater(goalMl)}
        </p>
        <button
          onClick={addGlass}
          className="rounded-lg bg-muted/40 px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground/60 active:bg-muted/70"
        >
          + More water
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Foods() {
  const navigate = useSmoothNavigate()

  const preferences = useQuery(api.users.users.getPreferences, {})
  const recipesQuery = useQuery(api.logs.recipes.list, {})

  const setDay = useOfflineMutation(
    api.logs.foodLogs.setDay,
    "logs.foodLogs.setDay"
  )
  const saveCustomGoals = useOfflineMutation(
    api.users.users.setCustomGoals,
    "users.users.setCustomGoals"
  )
  const removeRecipeMutation = useOfflineMutation(
    api.logs.recipes.remove,
    "logs.recipes.remove"
  )

  const activeTimezone = preferences?.lastActiveTimezone || "UTC"
  const todayKey = currentDateKey(activeTimezone)
  const goalsRes = useQuery(api.users.users.getEffectiveGoals, {
    date: todayKey,
  })

  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date: todayKey })
  const todayEntries = (foodLogs ?? []) as FoodLogEntry[]
  const recipes = (recipesQuery ?? []) as unknown as Recipe[]

  const [addOpen, setAddOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snapOffline, setSnapOffline] = useState(false)
  const [loggingRecipe, setLoggingRecipe] = useState<Recipe | null>(null)

  const apiGoals = useMemo(() => {
    if (!goalsRes) return null
    return {
      target: Math.round(
        goalsRes.health?.calories ?? goalsRes.effective.calories
      ),
      protein: Math.round(
        goalsRes.health?.protein ?? goalsRes.effective.protein
      ),
      carbs: Math.round(goalsRes.health?.carbs ?? goalsRes.effective.carbs),
      fat: Math.round(goalsRes.health?.fat ?? goalsRes.effective.fat),
      bmr: Math.round(goalsRes.health?.bmr ?? 0),
      tdee: Math.round(goalsRes.health?.tdee ?? 0),
    }
  }, [goalsRes])

  const loading = goalsRes === undefined || preferences === undefined

  const goals: GoalOverride = {
    calories: Math.round(goalsRes?.effective.calories ?? 2000),
    protein: Math.round(goalsRes?.effective.protein ?? 150),
    carbs: Math.round(goalsRes?.effective.carbs ?? 200),
    fat: Math.round(goalsRes?.effective.fat ?? 65),
  }

  return (
    <div className="desktop-canvas min-h-svh overflow-x-hidden bg-background md:pr-8 md:pl-72">
      <div className="mx-auto flex w-full max-w-lg flex-col pb-[calc(var(--app-safe-bottom-lg)+5rem)] md:max-w-6xl md:pb-10">
        {/* Header */}
        <header className="flex items-end justify-between px-4 pt-[var(--app-safe-top)] pb-3 md:px-6 md:pt-10 short-phone:pb-2">
          <div>
            <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground/50 uppercase">
              Diary
            </p>
            <h1 className="mt-1 text-[1.5rem] leading-[1.15] font-semibold tracking-tight md:text-[1.75rem] short-phone:text-[1.32rem]">
              Food
            </h1>
          </div>
          <div className="flex items-center gap-1.5 pb-0.5">
            <button
              onClick={() => setHistoryOpen(true)}
              aria-label="Open food history"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/70 transition-colors active:bg-muted"
            >
              <CalendarBlank size={15} />
            </button>
            <button
              onClick={() => navigate("/camera")}
              aria-label="Snap meal"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/70 transition-colors active:bg-muted"
            >
              <Aperture size={15} />
            </button>
            <button
              onClick={() => navigate("/foods/search")}
              aria-label="Search foods"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/70 transition-colors active:bg-muted"
            >
              <MagnifyingGlass size={15} />
            </button>
          </div>
        </header>

        <FoodActionRow
          onSearch={() => navigate("/foods/search")}
          onScan={() => navigate("/camera?mode=barcode")}
          onSnap={() => {
            if (!navigator.onLine) {
              setSnapOffline(true)
              return
            }
            setSnapOffline(false)
            navigate("/camera")
          }}
        />

        <div className="flex flex-col gap-4 px-4 md:grid md:grid-cols-2 md:items-start md:gap-5 md:px-6 short-phone:gap-3">
          <section>
            <SectionHeader title="Today's diary" />
            <TodayDiaryCard
              entries={todayEntries}
              dateKey={todayKey}
              onDelete={(index) => {
                void setDay({
                  date: todayKey,
                  entries: todayEntries.filter((_, i) => i !== index),
                })
              }}
            />
          </section>

          <section>
            <SectionHeader title="Calories and macros" />
            <div className="flex flex-col gap-2.5">
              <StatsBar
                entries={todayEntries}
                goals={goals}
                loading={loading}
              />
              <GoalsCardWrapper
                goals={goals}
                apiGoals={apiGoals}
                onSave={(g) => {
                  void saveCustomGoals(g)
                }}
              />
            </div>
          </section>

          <section>
            <SectionHeader
              title="Recipes"
              action={
                <button
                  onClick={() => navigate("/foods/recipe/new")}
                  className="flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground/40 active:text-muted-foreground/70"
                >
                  <Plus size={10} weight="bold" />
                  New
                </button>
              }
            />
            {recipes.length === 0 ? (
              <button
                onClick={() => navigate("/foods/recipe/new")}
                className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border/50 px-4 py-5 transition-colors active:bg-muted/20"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60">
                  <BookBookmark
                    size={15}
                    className="text-muted-foreground/40"
                  />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-medium text-foreground/60">
                    Create your first recipe
                  </p>
                  <p className="text-[11px] text-muted-foreground/35">
                    Stack ingredients, save for quick logging
                  </p>
                </div>
              </button>
            ) : (
              <div className="flex flex-col gap-2.5">
                {recipes.map((recipe) => (
                  <RecipeCard
                    key={recipe._id}
                    recipe={recipe}
                    onEdit={() => navigate(`/foods/recipe/${recipe._id}`)}
                    onDelete={() => {
                      if (recipe._id) {
                        void removeRecipeMutation({
                          id: recipe._id as Id<"recipes">,
                        })
                      }
                    }}
                    onLog={() => setLoggingRecipe(recipe)}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionHeader title="Nutrition details" />
            <MicronutrientsCard entries={todayEntries} />
          </section>

          <section>
            <WaterCard dateKey={todayKey} />
          </section>
        </div>
      </div>

      <BottomBar onAdd={() => setAddOpen(true)} />

      {/* History sheet */}
      {historyOpen && <HistorySheet onClose={() => setHistoryOpen(false)} />}

      {/* Recipe log sheet */}
      {loggingRecipe && (
        <RecipeLogSheet
          recipe={loggingRecipe}
          onLog={(meal) => {
            const totals = recipeTotals(loggingRecipe.ingredients)
            const entry = {
              id: Math.random().toString(36).slice(2),
              name: loggingRecipe.name,
              ...totals,
              loggedAt: new Date().toISOString(),
              meal,
            }
            void setDay({
              date: todayKey,
              entries: [...todayEntries, entry],
            })
            setLoggingRecipe(null)
          }}
          onClose={() => setLoggingRecipe(null)}
        />
      )}

      {addOpen && (
        <MobileSheet
          onClose={() => setAddOpen(false)}
          overlayClassName="bg-black/50 backdrop-blur-[8px]"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
          panelStyle={{
            paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
          }}
        >
          <div className="px-4 pt-1 pb-4">
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setAddOpen(false)
                  navigate("/camera?mode=barcode")
                }}
                className="relative overflow-hidden rounded-2xl bg-foreground px-4 pt-3.5 pb-4 text-left text-background transition-opacity active:opacity-75"
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.055]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, currentColor 0, currentColor 1.5px, transparent 1.5px, transparent 5px)",
                  }}
                />
                <div className="scan-line pointer-events-none absolute right-3 left-3 h-px bg-background/50" />
                <p className="relative text-[9px] font-semibold tracking-[0.18em] uppercase opacity-40">
                  Capture
                </p>
                <p className="relative mt-1.5 text-[15px] leading-snug font-semibold tracking-tight">
                  Scan
                  <br />
                  Barcode
                </p>
                <Barcode
                  size={15}
                  weight="bold"
                  className="absolute right-3.5 bottom-3.5 opacity-25"
                />
              </button>

              <button
                onClick={() => {
                  if (!navigator.onLine) {
                    setSnapOffline(true)
                    return
                  }
                  setSnapOffline(false)
                  setAddOpen(false)
                  navigate("/camera")
                }}
                className="relative overflow-hidden rounded-2xl bg-foreground/[0.055] px-5 pt-5 pb-6 text-left ring-1 ring-foreground/[0.07] transition-colors active:bg-foreground/[0.10]"
              >
                <div className="pointer-events-none absolute top-3 left-3 h-4 w-4 border-t-[1.5px] border-l-[1.5px] border-foreground/30" />
                <div className="pointer-events-none absolute top-3 right-3 h-4 w-4 border-t-[1.5px] border-r-[1.5px] border-foreground/30" />
                <div className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 border-b-[1.5px] border-l-[1.5px] border-foreground/30" />
                <div className="pointer-events-none absolute right-3 bottom-3 h-4 w-4 border-r-[1.5px] border-b-[1.5px] border-foreground/30" />
                <p className="relative text-[9px] font-semibold tracking-[0.18em] text-muted-foreground/50 uppercase">
                  Capture
                </p>
                <p className="relative mt-5 text-[15px] leading-snug font-semibold tracking-tight">
                  Snap
                  <br />
                  and Log
                </p>
                <Aperture
                  size={18}
                  weight="light"
                  className="absolute right-4 bottom-4 opacity-20"
                />
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/50">
              <button
                onClick={() => {
                  setAddOpen(false)
                  navigate("/foods/search")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-muted/40"
              >
                <div className="flex items-center gap-2.5">
                  <MagnifyingGlass
                    size={13}
                    className="shrink-0 text-muted-foreground/50"
                  />
                  <span className="text-[13px] font-medium">Search Food</span>
                </div>
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
              <div className="mx-4 h-px bg-border/50" />
              <button
                onClick={() => {
                  setAddOpen(false)
                  navigate("/foods/recipe/new")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-muted/40"
              >
                <div className="flex items-center gap-2.5">
                  <BookBookmark
                    size={13}
                    className="shrink-0 text-muted-foreground/50"
                  />
                  <span className="text-[13px] font-medium">New Recipe</span>
                </div>
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
              <div className="mx-4 h-px bg-border/50" />
              <button
                onClick={() => {
                  setAddOpen(false)
                  navigate("/workout/active")
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-muted/40"
              >
                <div className="flex items-center gap-2.5">
                  <Barbell
                    size={13}
                    className="shrink-0 text-muted-foreground/50"
                  />
                  <span className="text-[13px] font-medium">Log Workout</span>
                </div>
                <CaretRight size={11} className="text-muted-foreground/30" />
              </button>
            </div>
          </div>

          {snapOffline && (
            <div className="mx-4 mb-1 flex items-center gap-2 rounded-xl bg-destructive/10 px-3.5 py-2.5">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
              <p className="text-[12px] font-medium text-destructive">
                No internet connection. Connect and try again.
              </p>
            </div>
          )}
        </MobileSheet>
      )}
    </div>
  )
}
