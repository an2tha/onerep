import React, { useMemo, useState } from "react"
import { useNavigate } from "react-router"
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
import { BottomBar } from "@/components/bottom-bar"
import { MobileSheet } from "@/components/mobile-sheet"
import { useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  currentDateKey,
  defaultMeal,
  type FoodLogEntry,
  type Recipe,
  type RecipeIngredient,
  DEFAULT_MEAL_CATEGORIES,
} from "@/lib/food-log"

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

const GOAL_FIELDS: { key: GoalField; label: string; unit: string; step: number; min: number }[] = [
  { key: "calories", label: "Calories", unit: "kcal", step: 50,  min: 500  },
  { key: "protein",  label: "Protein",  unit: "g",    step: 5,   min: 0    },
  { key: "carbs",    label: "Carbs",    unit: "g",    step: 5,   min: 0    },
  { key: "fat",      label: "Fat",      unit: "g",    step: 5,   min: 0    },
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
  const dragging = React.useRef(false)
  const THRESHOLD = 72

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX
    dragging.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    const delta = Math.min(0, e.clientX - startX.current)
    setTx(delta)
  }

  function onPointerUp() {
    dragging.current = false
    if (tx < -THRESHOLD) {
      setTx(-THRESHOLD) // snap open
    } else {
      setTx(0) // snap closed
    }
  }

  const revealed = tx <= -THRESHOLD

  return (
    <div className="relative overflow-hidden">
      {/* Delete zone behind the row */}
      <div
        className="absolute inset-y-0 right-0 flex w-16 items-center justify-center bg-destructive/90"
        style={{ borderRadius: "0 8px 8px 0" }}
      >
        <Trash size={14} weight="fill" className="text-white" />
      </div>

      {/* The row itself */}
      <div
        className="relative flex touch-pan-y items-center gap-2 bg-background py-[5px] transition-transform duration-150 ease-out"
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
        {revealed && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
            className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive transition-colors active:bg-destructive/30"
          >
            <X size={9} weight="bold" />
          </button>
        )}
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
  onDelete?: (id: string) => void
}) {
  const sorted = [...entries].sort((a, b) =>
    a.loggedAt.localeCompare(b.loggedAt)
  )
  const cats = DEFAULT_MEAL_CATEGORIES
  const byMeal = new Map<string, FoodLogEntry[]>()
  for (const e of sorted) {
    if (!byMeal.has(e.meal)) byMeal.set(e.meal, [])
    byMeal.get(e.meal)!.push(e)
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
        const gKcal = ge.reduce((s, e) => s + e.calories, 0)
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
            {ge.map((entry) =>
              onDelete ? (
                <SwipeRow
                  key={entry.id}
                  entry={entry}
                  onDelete={() => onDelete(entry.id)}
                />
              ) : (
                <div
                  key={entry.id}
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
  onDelete: (id: string) => void
}) {
  return (
    <div className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border/30">
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
        <DiaryEntries
          entries={entries}
          dateKey={dateKey}
          onDelete={onDelete}
        />
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
      <div className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border/30">
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
    <div className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border/30">
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

const MICRO_DV: Record<string, { label: string; unit: string; dv: number }> = {
  fiber: { label: "Fiber", unit: "g", dv: 28 },
  sugar: { label: "Sugar", unit: "g", dv: 50 },
  saturatedFat: { label: "Sat. fat", unit: "g", dv: 20 },
  cholesterol: { label: "Cholesterol", unit: "mg", dv: 300 },
  sodium: { label: "Sodium", unit: "mg", dv: 2300 },
  potassium: { label: "Potassium", unit: "mg", dv: 4700 },
  calcium: { label: "Calcium", unit: "mg", dv: 1300 },
  iron: { label: "Iron", unit: "mg", dv: 18 },
  vitaminC: { label: "Vitamin C", unit: "mg", dv: 90 },
  vitaminD: { label: "Vitamin D", unit: "µg", dv: 20 },
  vitaminB12: { label: "B12", unit: "µg", dv: 2.4 },
}

function MicronutrientsCard({ entries }: { entries: FoodLogEntry[] }) {
  const [open, setOpen] = useState(false)
  const totals = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const e of entries)
      for (const k of Object.keys(MICRO_DV)) {
        const v = (e as any)[k] as number | undefined
        if (v != null && v > 0) acc[k] = (acc[k] ?? 0) + v
      }
    return acc
  }, [entries])

  const keys = Object.keys(MICRO_DV).filter((k) => totals[k] != null)
  if (keys.length === 0) return null

  return (
    <div className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border/30">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between"
      >
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
          Micronutrients
        </p>
        <CaretDown
          size={9}
          weight="bold"
          className={cn(
            "text-muted-foreground/30 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {!open && (
        <div className="mt-2.5 flex gap-4 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {keys.slice(0, 5).map((k) => {
            const cfg = MICRO_DV[k]
            const val = totals[k]
            const pct = Math.min(100, Math.round((val / cfg.dv) * 100))
            return (
              <div key={k} className="shrink-0">
                <span className="text-[9px] font-medium text-muted-foreground/35">
                  {cfg.label}
                </span>
                <p className="mt-0.5 text-[13px] leading-none font-semibold tabular-nums">
                  {val < 10 ? val.toFixed(1) : Math.round(val)}
                  <span className="ml-0.5 text-[8.5px] font-normal text-muted-foreground/35">
                    {cfg.unit}
                  </span>
                </p>
                <span className="text-[9px] text-muted-foreground/30 tabular-nums">
                  {pct}% DV
                </span>
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
          <div className="flex flex-col gap-2">
            {keys.map((k) => {
              const cfg = MICRO_DV[k]
              const val = totals[k]
              const pct = Math.min(100, (val / cfg.dv) * 100)
              const over = val > cfg.dv
              return (
                <div key={k}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px]">{cfg.label}</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[12px] font-semibold tabular-nums">
                        {val < 10 ? val.toFixed(1) : Math.round(val)}
                        <span className="ml-0.5 text-[9px] font-normal text-muted-foreground/35">
                          {cfg.unit}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "text-[9.5px] tabular-nums",
                          over
                            ? "text-amber-500/70"
                            : "text-muted-foreground/30"
                        )}
                      >
                        {Math.round(pct)}%
                      </span>
                    </div>
                  </div>
                  <div className="relative mt-1 h-[2px] rounded-sm bg-muted/40">
                    <div
                      className="absolute inset-y-0 left-0 rounded-sm"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: over ? "#f59e0b" : "var(--foreground)",
                        opacity: over ? 0.5 : 0.22,
                      }}
                    />
                  </div>
                </div>
              )
            })}
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

function recipeTotals(ingredients: RecipeIngredient[]) {
  return ingredients.reduce(
    (acc, i) => ({
      calories: acc.calories + Math.round((i.caloriesPer100 * i.grams) / 100),
      protein:  acc.protein  + Math.round((i.proteinPer100  * i.grams) / 100),
      carbs:    acc.carbs    + Math.round((i.carbsPer100    * i.grams) / 100),
      fat:      acc.fat      + Math.round((i.fatPer100      * i.grams) / 100),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

const RECIPE_MACRO_PILLS = [
  { label: "P", key: "protein" as const, color: "#60a5fa" },
  { label: "C", key: "carbs"   as const, color: "#a78bfa" },
  { label: "F", key: "fat"     as const, color: "#fb923c" },
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
  const suggested  = defaultMeal()
  const totals     = recipeTotals(recipe.ingredients)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-sm rounded-t-[24px] bg-card px-4 pt-4 shadow-[0_-16px_50px_rgba(0,0,0,0.18)]"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}
      >
        <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-foreground/10" />
        <p className="text-[15px] font-semibold leading-snug">Log to…</p>
        <p className="mb-0.5 truncate text-[11.5px] text-muted-foreground/45">{recipe.name}</p>
        <p className="mb-4 text-[11px] text-muted-foreground/30 tabular-nums">
          {totals.calories} kcal · P{totals.protein} C{totals.carbs} F{totals.fat}g
        </p>
        <div className="flex flex-col gap-1.5">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => onLog(cat.id)}
              className="flex items-center justify-between rounded-2xl px-4 py-3 transition-all active:scale-[0.98]"
              style={{
                backgroundColor: cat.id === suggested ? cat.bg : "var(--muted)",
                outline: cat.id === suggested ? `1.5px solid ${cat.color}` : "none",
                outlineOffset: "1px",
              }}
            >
              <span
                className="text-[13.5px] font-semibold"
                style={{ color: cat.id === suggested ? cat.color : "var(--foreground)", opacity: cat.id === suggested ? 1 : 0.75 }}
              >
                {cat.label}
              </span>
              {cat.id === suggested && (
                <span className="text-[10px] font-medium" style={{ color: cat.color, opacity: 0.6 }}>
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
    <div className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border/30">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold">{recipe.name}</p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground/40">
            {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? "s" : ""}
          </p>
          <div className="mt-1.5 flex gap-2.5">
            {RECIPE_MACRO_PILLS.map(({ label, key, color }) => (
              <span key={label} className="flex items-baseline gap-0.5">
                <span className="text-[9.5px] font-semibold" style={{ color, opacity: 0.75 }}>{label}</span>
                <span className="text-[10.5px] text-muted-foreground/50">{totals[key]}g</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-[17px] leading-none font-bold tabular-nums">{totals.calories}</span>
          <span className="mt-0.5 text-[8.5px] text-muted-foreground/35">kcal</span>
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
          <CaretRight size={10} weight="bold" className="text-muted-foreground/40" />
        </button>
      </div>
    </div>
  )
}

// ─── Constants for Goals ───────────────────────────────────────────────────────

function GoalsCardWrapper({ goals, apiGoals, onSave }: { goals: GoalOverride, apiGoals: CalorieInfo | null, onSave: (g: GoalOverride) => void }) {
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
      <div className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border/30">
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

const WATER_GLASS_COUNT = 8

function fmtWater(ml: number): string {
  if (ml >= 1000) {
    const l = ml / 1000
    return l % 1 === 0 ? `${l} L` : `${l.toFixed(1)} L`
  }
  return `${ml} ml`
}

function WaterCard({ dateKey }: { dateKey: string }) {
  const navigate = useNavigate()
  const preferences = useQuery(api.users.users.getPreferences)
  const goalMl = preferences?.waterGoalMl ?? 2500

  const rawEntries = useQuery(api.logs.water.getDay, { date: dateKey })
  const setWaterDay = useOfflineMutation(api.logs.water.setDay, "logs.water.setDay")

  const entries = (rawEntries ?? []) as { id: string; amountMl: number; loggedAt: string }[]
  const totalMl = entries.reduce((s, e) => s + e.amountMl, 0)
  const mlPerGlass = Math.round(goalMl / WATER_GLASS_COUNT)
  const filledCount = Math.min(WATER_GLASS_COUNT, Math.floor(totalMl / mlPerGlass))

  function addGlass() {
    const entry = { id: crypto.randomUUID(), amountMl: mlPerGlass, loggedAt: new Date().toISOString() }
    void setWaterDay({ date: dateKey, entries: [...entries, entry] })
  }

  function removeLastEntry() {
    if (entries.length === 0) return
    const sorted = [...entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
    void setWaterDay({ date: dateKey, entries: sorted.slice(1) })
  }

  return (
    <div className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border/30">
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
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: WATER_GLASS_COUNT }, (_, i) => {
          const filled = i < filledCount
          return (
            <button
              key={i}
              onClick={filled ? removeLastEntry : addGlass}
              className={cn(
                "flex items-center justify-center rounded-xl py-2.5 transition-all active:scale-95",
                filled ? "bg-[rgba(56,189,248,0.13)]" : "bg-muted/25"
              )}
              aria-label={filled ? "Remove last water entry" : `Add ${mlPerGlass} ml`}
            >
              <PintGlass
                size={22}
                weight={filled ? "fill" : "regular"}
                style={{ color: filled ? "#38bdf8" : undefined }}
                className={filled ? undefined : "text-muted-foreground/20"}
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
  const navigate = useNavigate()

  const goalsRes = useQuery(api.logs.calories.getGoals, {})
  const preferences = useQuery(api.users.users.getPreferences, {})
  const recipesQuery = useQuery(api.logs.recipes.list, {})

  const setDay = useOfflineMutation(api.logs.foodLogs.setDay, "logs.foodLogs.setDay")
  const removeRecipeMutation = useOfflineMutation(api.logs.recipes.remove, "logs.recipes.remove")

  const activeTimezone = preferences?.lastActiveTimezone || "UTC"
  const todayKey = currentDateKey(activeTimezone)

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
      target: Math.round(goalsRes.targetCalories),
      protein: Math.round(goalsRes.protein),
      carbs: Math.round(goalsRes.carbs),
      fat: Math.round(goalsRes.fat),
      bmr: Math.round(goalsRes.bmr),
      tdee: Math.round(goalsRes.tdee),
    }
  }, [goalsRes])

  // Preferences might handle custom goals too, but for now let's keep GoalOverride local or in preferences
  const [customGoals, setCustomGoals] = useState<GoalOverride | null>(null)

  const loading = goalsRes === undefined || preferences === undefined

  const goals: GoalOverride = customGoals ?? {
    calories: apiGoals?.target ?? 2000,
    protein: apiGoals?.protein ?? 150,
    carbs: apiGoals?.carbs ?? 200,
    fat: apiGoals?.fat ?? 65,
  }

  return (
    <div className="desktop-canvas min-h-svh bg-background md:pl-72 md:pr-8">
      <div className="page-enter mx-auto flex max-w-lg flex-col pb-24 md:max-w-5xl md:pb-10">
        {/* Header */}
        <header className="flex items-end justify-between px-5 pt-14 pb-4 md:px-6 md:pt-10">
          <div>
            <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground/50 uppercase">
              Diary
            </p>
            <h1 className="mt-1 text-[1.9rem] leading-[1.15] font-semibold tracking-tight">
              Foods.
            </h1>
          </div>
          <div className="flex items-center gap-1.5 pb-0.5">
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/70 transition-colors active:bg-muted"
            >
              <CalendarBlank size={15} />
            </button>
            <button
              onClick={() => navigate("/camera")}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/70 transition-colors active:bg-muted"
            >
              <Aperture size={15} />
            </button>
            <button
              onClick={() => navigate("/foods/search")}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/70 transition-colors active:bg-muted"
            >
              <MagnifyingGlass size={15} />
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-4 px-4 md:grid md:grid-cols-2 md:items-start md:gap-5 md:px-6">
          <section>
            <SectionHeader title="Stats" />
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
                  setCustomGoals(g)
                }}
              />
              <MicronutrientsCard entries={todayEntries} />
            </div>
          </section>

          <section>
            <WaterCard dateKey={todayKey} />
          </section>

          <section>
            <SectionHeader title="Today's diary" />
            <TodayDiaryCard
                entries={todayEntries} 
                dateKey={todayKey} 
                onDelete={(id) => {
                    void setDay({ date: todayKey, entries: todayEntries.filter(e => e.id !== id) })
                }}
            />
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
                  <BookBookmark size={15} className="text-muted-foreground/40" />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-medium text-foreground/60">Create your first recipe</p>
                  <p className="text-[11px] text-muted-foreground/35">Stack ingredients, save for quick logging</p>
                </div>
              </button>
            ) : (
              <div className="flex flex-col gap-2.5">
                {recipes.map(recipe => (
                  <RecipeCard
                    key={recipe._id}
                    recipe={recipe}
                    onEdit={() => navigate(`/foods/recipe/${recipe._id}`)}
                    onDelete={() => {
                      if (recipe._id) {
                        void removeRecipeMutation({ id: recipe._id as Id<"recipes"> })
                      }
                    }}
                    onLog={() => setLoggingRecipe(recipe)}
                  />
                ))}
              </div>
            )}
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
              name:     loggingRecipe.name,
              calories: totals.calories,
              protein:  totals.protein,
              carbs:    totals.carbs,
              fat:      totals.fat,
              loggedAt: new Date().toISOString(),
              meal,
            }
            void setDay({
                date: todayKey,
                entries: [...todayEntries, entry]
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