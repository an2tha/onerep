import React, { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
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
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { useBottomBarAction } from "@/components/bottom-bar"
import { MobileSheet } from "@/components/mobile-sheet"
import { SlideToDeleteRow } from "@/components/slide-to-delete-row"
import { convexClient } from "@/lib/convex"
import { useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  FOOD_MICRONUTRIENT_KEYS,
  currentDateKey,
  defaultMeal,
  findSmartMealPresetSuggestion,
  foodLogEntriesFromMealPreset,
  stripUndefined,
  type FoodLogEntry,
  type MealPreset,
  type Recipe,
  type RecipeIngredient,
  DEFAULT_MEAL_CATEGORIES,
  nutritionDetailTotals,
  type FoodMicronutrientKey,
  type SmartMealPresetSuggestion,
} from "@/lib/food-log"
import {
  SUPPLEMENT_NUTRIENT_DETAILS,
  SUPPLEMENT_SUMMARY_NUTRIENT_KEYS,
  mergeNutritionTotals,
  type NutritionSummaryKey,
  type SupplementNutrients,
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
  MACRO_TONES,
  MICRO_COLORS,
  tint,
} from "@/lib/design-tokens"
import { useAiFeatureGate } from "@/lib/ai-access"
import {
  clampSnapGrams,
  snapDetectionsFromAiResult,
  type SnapAiResult,
  type SnapFoodMatch,
} from "@/lib/food-snap-review"
import type { FoodResult } from "@repo/models"
import { toast } from "sonner"

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

const MACRO_COLOR = MACRO_TONES
const WATER_COLOR = APP_ACCENT_COLORS.water
const WATER_BG = tint(WATER_COLOR, 13)
const DANGER_COLOR = APP_ACCENT_COLORS.danger
const CAUTION_COLOR = APP_ACCENT_COLORS.caution

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
    <div className="app-section-header">
      <div>
        <h2 className="app-section-title">{title}</h2>
        {sub && (
          <p className="app-section-subtitle">{sub}</p>
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
    <section className="px-[var(--app-page-x)] pb-5 md:px-8 short-phone:pb-4">
      <div className="food-search-shell flex min-h-14 items-center gap-2 px-2.5 py-2 short-phone:min-h-12">
        <button
          type="button"
          onClick={onSearch}
          className="motion-pressable flex min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-left active:bg-foreground/[0.045]"
        >
          <MagnifyingGlass
            size={16}
            weight="bold"
            className="shrink-0 text-muted-foreground/55"
          />
          <span className="truncate text-[14px] font-medium text-muted-foreground/72">
            Search foods
          </span>
        </button>
        <button
          type="button"
          onClick={onScan}
          className="app-icon-button h-9 w-9 bg-transparent text-muted-foreground/65"
          aria-label="Scan barcode"
        >
          <Barcode size={17} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onSnap}
          className="app-icon-button h-9 w-9 bg-transparent text-muted-foreground/65"
          aria-label="Snap meal"
        >
          <Aperture size={17} weight="bold" />
        </button>
      </div>
    </section>
  )
}

// ─── Swipeable entry row ──────────────────────────────────────────────────────

function SwipeRow({
  entry,
  onDelete,
  onEditRecipe,
}: {
  entry: FoodLogEntry
  onDelete: () => void
  onEditRecipe?: () => void
}) {
  return (
    <SlideToDeleteRow
      deleteLabel={`Delete ${entry.name}`}
      onDelete={onDelete}
      actionClassName="rounded-r-lg"
      rowClassName="flex items-center gap-2 bg-card py-[5px]"
    >
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/80">
        {entry.name}
      </p>
      {onEditRecipe && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onEditRecipe()
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/55 text-muted-foreground/55 transition-opacity active:opacity-70"
          aria-label={`Edit recipe for ${entry.name}`}
        >
          <PencilSimple size={11} weight="bold" />
        </button>
      )}
      <span className="shrink-0 text-[12px] font-medium text-foreground/55 tabular-nums">
        {entry.calories}
      </span>
    </SlideToDeleteRow>
  )
}

// ─── Grouped diary entries ────────────────────────────────────────────────────

function DiaryEntries({
  entries,
  dateKey: _dateKey,
  onDelete,
  onEditRecipe,
}: {
  entries: FoodLogEntry[]
  dateKey: string
  onDelete?: (index: number) => void
  onEditRecipe?: (entry: FoodLogEntry) => void
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
                  onEditRecipe={
                    onEditRecipe && (entry.recipeId || entry.recipeDraft)
                      ? () => onEditRecipe(entry)
                      : undefined
                  }
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
  onEditRecipe,
}: {
  entries: FoodLogEntry[]
  dateKey: string
  onDelete: (index: number) => void
  onEditRecipe?: (entry: FoodLogEntry) => void
}) {
  return (
    <div
      className="app-rail-surface px-4 py-3.5"
      style={{ "--rail-color": "var(--accent-food)" } as React.CSSProperties}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <p className="app-eyebrow">
          Today
        </p>
        <span className="text-[11px] text-muted-foreground/35 tabular-nums">
          {entries.reduce((s, e) => s + e.calories, 0)} kcal
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="app-empty py-3">
          <ForkKnife size={13} className="text-muted-foreground/20" />
          <p className="text-[12px] text-muted-foreground/35">
            No food logged. Search, scan, or snap a meal.
          </p>
        </div>
      ) : (
        <DiaryEntries
          entries={entries}
          dateKey={dateKey}
          onDelete={onDelete}
          onEditRecipe={onEditRecipe}
        />
      )}
    </div>
  )
}

// ─── Smart meal preset card ───────────────────────────────────────────────────

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
  onSave: () => void
  onLog: () => void
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
    <div
      className="app-rail-surface px-4 py-3.5 short-phone:px-3.5 short-phone:py-3"
      style={{ "--rail-color": "var(--accent-food)" } as React.CSSProperties}
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
            {suggestion.kind === "save" && (
              <span className="text-[10.5px] text-muted-foreground/35 tabular-nums">
                {suggestion.count}x recently
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss smart meal suggestion"
          className="app-icon-button h-9 w-9 bg-transparent text-muted-foreground/45"
        >
          <X size={10} weight="bold" />
        </button>
      </div>

      <button
        type="button"
        onClick={isSave ? onSave : onLog}
        disabled={busy}
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
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/50 active:opacity-60"
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
  supplementTotals,
  goals,
  loading,
}: {
  entries: FoodLogEntry[]
  supplementTotals: SupplementNutrients
  goals: GoalOverride
  loading: boolean
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(false)
    const t = setTimeout(() => setMounted(true), 100)
    return () => clearTimeout(t)
  }, [loading])

  const consumed =
    entries.reduce((s, e) => s + e.calories, 0) +
    (supplementTotals.calories ?? 0)
  const protein =
    entries.reduce((s, e) => s + (e.protein || 0), 0) +
    (supplementTotals.protein ?? 0)
  const carbs =
    entries.reduce((s, e) => s + (e.carbs || 0), 0) +
    (supplementTotals.carbs ?? 0)
  const fat =
    entries.reduce((s, e) => s + (e.fat || 0), 0) +
    (supplementTotals.fat ?? 0)
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
      <div className="app-surface px-4 py-3.5 short-phone:px-3.5 short-phone:py-3">
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
    <div
      className="app-rail-surface px-4 py-3.5 short-phone:px-3.5 short-phone:py-3"
      style={{ "--rail-color": "var(--accent-food)" } as React.CSSProperties}
    >
      <div className="flex items-start gap-4">
        {/* Calorie block */}
        <div className="min-w-0 shrink-0">
          <span
            className={cn(
              "app-display text-[2.1rem] tabular-nums",
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
              className="motion-progress-fill absolute inset-y-0 left-0 rounded-sm"
              style={{
                width: mounted ? `${calPct}%` : "0%",
                backgroundColor: over ? DANGER_COLOR : "var(--foreground)",
                opacity: 0.5,
              }}
            />
          </div>
          <p className="mt-0.5 text-[9px] text-muted-foreground/30 tabular-nums">
            of {fmtKcal(goals.calories)}
          </p>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch bg-border/35" />

        {/* Macro columns */}
        <div className="flex flex-1 justify-between">
          {macros.map(({ key, val, target, label }) => {
            const pct = target > 0 ? Math.min(100, (val / target) * 100) : 0
            const macOver = val > target
            return (
              <div key={key} className="flex flex-col items-center">
                <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase">
                  {label}
                </span>
                <span
                  className="mt-0.5 text-[16px] leading-none font-semibold tabular-nums"
                  style={{
                    color: macOver ? DANGER_COLOR : MACRO_COLOR[key].solid,
                  }}
                >
                  {Math.round(val)}
                </span>
                <span className="text-[8.5px] text-muted-foreground/30 tabular-nums">
                  /{target}g
                </span>
                <div className="relative mt-1.5 h-[2px] w-10 rounded-sm bg-muted/40">
                  <div
                    className="motion-progress-fill absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: mounted ? `${pct}%` : "0%",
                      backgroundColor: macOver
                        ? DANGER_COLOR
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
  supplementCautionAt?: number
}

const MICRO_DETAILS: Record<NutritionSummaryKey, MicroDetail> = {
  fiber: { label: "Fiber", unit: "g", dv: 28, color: MICRO_COLORS.fiber },
  sugar: { label: "Total sugar", unit: "g", dv: 50, color: MICRO_COLORS.sugar },
  saturatedFat: {
    label: "Saturated fat",
    unit: "g",
    dv: 20,
    color: MICRO_COLORS.saturatedFat,
  },
  transFat: { label: "Trans fat", unit: "g", color: MICRO_COLORS.transFat },
  cholesterol: {
    label: "Cholesterol",
    unit: "mg",
    dv: 300,
    color: MICRO_COLORS.cholesterol,
  },
  sodium: { label: "Sodium", unit: "mg", dv: 2300, color: MICRO_COLORS.sodium },
  potassium: {
    label: "Potassium",
    unit: "mg",
    dv: 4700,
    color: MICRO_COLORS.potassium,
  },
  calcium: {
    label: "Calcium",
    unit: "mg",
    dv: 1300,
    color: MICRO_COLORS.calcium,
  },
  iron: { label: "Iron", unit: "mg", dv: 18, color: MICRO_COLORS.iron },
  magnesium: {
    label: "Magnesium",
    unit: "mg",
    dv: 420,
    color: MICRO_COLORS.magnesium,
  },
  phosphorus: {
    label: "Phosphorus",
    unit: "mg",
    dv: 1250,
    color: MICRO_COLORS.phosphorus,
  },
  zinc: { label: "Zinc", unit: "mg", dv: 11, color: MICRO_COLORS.zinc },
  vitaminC: {
    label: "Vitamin C",
    unit: "mg",
    dv: 90,
    color: MICRO_COLORS.vitaminC,
  },
  vitaminA: {
    label: "Vitamin A",
    unit: "mcg",
    dv: 900,
    color: MICRO_COLORS.vitaminA,
  },
  vitaminD: {
    label: "Vitamin D",
    unit: "mcg",
    dv: 20,
    color: MICRO_COLORS.vitaminD,
  },
  vitaminB12: {
    label: "Vitamin B12",
    unit: "mcg",
    dv: 2.4,
    color: MICRO_COLORS.vitaminB12,
  },
  caffeine: { label: "Caffeine", unit: "mg", color: MICRO_COLORS.caffeine },
  alcohol: { label: "Alcohol", unit: "g", color: MICRO_COLORS.alcohol },
  creatine: {
    label: SUPPLEMENT_NUTRIENT_DETAILS.creatine.label,
    unit: SUPPLEMENT_NUTRIENT_DETAILS.creatine.unit,
    color: SUPPLEMENT_NUTRIENT_DETAILS.creatine.color,
  },
  omega3: {
    label: SUPPLEMENT_NUTRIENT_DETAILS.omega3.label,
    unit: SUPPLEMENT_NUTRIENT_DETAILS.omega3.unit,
    color: SUPPLEMENT_NUTRIENT_DETAILS.omega3.color,
  },
  epa: {
    label: SUPPLEMENT_NUTRIENT_DETAILS.epa.label,
    unit: SUPPLEMENT_NUTRIENT_DETAILS.epa.unit,
    color: SUPPLEMENT_NUTRIENT_DETAILS.epa.color,
  },
  dha: {
    label: SUPPLEMENT_NUTRIENT_DETAILS.dha.label,
    unit: SUPPLEMENT_NUTRIENT_DETAILS.dha.unit,
    color: SUPPLEMENT_NUTRIENT_DETAILS.dha.color,
  },
}

function dailyValueFor(cfg: MicroDetail) {
  return "dv" in cfg ? cfg.dv : undefined
}

type NutritionDetailDisplayKey = NutritionSummaryKey

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
  {
    label: "Supplements",
    keys: ["creatine", "omega3", "epa", "dha"],
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

function MicronutrientsCard({
  entries,
  supplementTotals,
}: {
  entries: FoodLogEntry[]
  supplementTotals: SupplementNutrients
}) {
  const [open, setOpen] = useState(true)
  const foodTotals = useMemo(() => nutritionDetailTotals(entries), [entries])
  const totals = useMemo(
    () => mergeNutritionTotals(foodTotals, supplementTotals),
    [foodTotals, supplementTotals]
  )

  const keys = SUPPLEMENT_SUMMARY_NUTRIENT_KEYS.filter((k) => totals[k] != null)
  const groups = MICRO_GROUPS.map((group) => ({
    ...group,
    keys: group.keys.filter((key) => totals[key] != null),
  })).filter((group) => group.keys.length > 0)
  const supplementKeyCount = SUPPLEMENT_SUMMARY_NUTRIENT_KEYS.filter(
    (key) => (supplementTotals[key] ?? 0) > 0
  ).length
  const highSupplementKeys = SUPPLEMENT_SUMMARY_NUTRIENT_KEYS.filter((key) => {
    const caution = SUPPLEMENT_NUTRIENT_DETAILS[key]?.supplementCautionAt
    return caution && (supplementTotals[key] ?? 0) >= caution
  })

  if (keys.length === 0) {
    return (
      <div className="app-surface px-4 py-3.5 short-phone:px-3.5 short-phone:py-3">
        <p className="app-eyebrow">
          Micronutrients
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground/40">
          {entries.length === 0
            ? "No food or supplement nutrients logged today."
            : "No micronutrient details on today’s items."}
        </p>
      </div>
    )
  }

  return (
    <div className="app-surface px-4 py-3.5 short-phone:px-3.5 short-phone:py-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <p className="app-eyebrow">
            Micronutrients
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground/30">
            {keys.length} total · {supplementKeyCount} from supplements
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-[8px] bg-muted/45 px-2 py-0.5 text-[9.5px] font-semibold text-muted-foreground/45 tabular-nums">
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
                <p className="mb-1.5 text-[9px] font-semibold text-muted-foreground/35 uppercase">
                  {group.label}
                </p>
                <div className="divide-y divide-border/25">
                  {group.keys.map((k) => {
                    const cfg = MICRO_DETAILS[k]
                    const val = totals[k] ?? 0
                    const supplementVal = supplementTotals[k] ?? 0
                    const foodVal =
                      k in foodTotals
                        ? (foodTotals[k as FoodMicronutrientKey] ?? 0)
                        : 0
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
                        {supplementVal > 0 && (
                          <p className="mt-1 text-[9px] text-muted-foreground/30 tabular-nums">
                            Food {formatMicroValue(foodVal)}
                            {cfg.unit} · Supplement{" "}
                            {formatMicroValue(supplementVal)}
                            {cfg.unit}
                          </p>
                        )}
                        {pct !== null ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="relative h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-muted/40">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full"
                                style={{
                                  width: `${barPct}%`,
                                  backgroundColor: over
                                    ? CAUTION_COLOR
                                    : cfg.color,
                                  opacity: over ? 0.7 : 0.55,
                                }}
                              />
                            </div>
                            <span
                              className="w-9 text-right text-[9.5px] text-muted-foreground/30 tabular-nums"
                              style={
                                over ? { color: CAUTION_COLOR } : undefined
                              }
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
            {highSupplementKeys.length > 0 && (
              <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground/35">
                Supplement intake is high for{" "}
                {highSupplementKeys
                  .map((key) => MICRO_DETAILS[key].label.toLowerCase())
                  .join(", ")}
                . Check labels and totals before adding more.
              </p>
            )}
            <p className="mt-0.5 text-[9px] text-muted-foreground/25">
              Totals combine food and supplements. % Daily Value based on FDA
              2,000 kcal reference.
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

function recipeIngredientFromAiFood(
  food: FoodResult,
  grams: number
): RecipeIngredient {
  const r = (value: number) => Math.round(value * 10) / 10
  const safeGrams = clampSnapGrams(grams)
  return {
    id: Math.random().toString(36).slice(2),
    name: food.name,
    grams: safeGrams,
    displayAmount: safeGrams,
    displayUnit: "g",
    servingLabel: food.serving,
    caloriesPer100: Number(food.calories) || 0,
    proteinPer100: r(Number(food.protein) || 0),
    carbsPer100: r(Number(food.carbs) || 0),
    fatPer100: r(Number(food.fat) || 0),
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
      return recipeIngredientFromAiFood(
        food,
        detection.estimatedGrams ?? 100
      )
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
  { label: "P", key: "protein" as const, color: MACRO_COLORS.protein },
  { label: "C", key: "carbs" as const, color: MACRO_COLORS.carbs },
  { label: "F", key: "fat" as const, color: MACRO_COLORS.fat },
]

// ─── Describe-to-log sheet ───────────────────────────────────────────────────

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
    <>
      <div
        className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[3px]"
        onClick={busy ? undefined : onClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-sm rounded-t-[26px] bg-card px-4 pt-4 shadow-[0_-16px_50px_rgba(0,0,0,0.2)]"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-foreground/10" />
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
            <Sparkle size={15} weight="fill" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug font-semibold">
              Describe to log
            </p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground/58">
              Tell AI what you ate. It will split the meal into ingredients and
              create a temporary recipe you can review before logging.
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
          placeholder="e.g. chicken burrito bowl with rice, black beans, salsa, cheese, and guacamole"
          className="min-h-36 w-full resize-none rounded-2xl border border-border/50 bg-muted/35 px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/35 focus:border-foreground/20 disabled:opacity-60"
        />

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(text.trim())}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-[14px] font-bold text-background transition-opacity active:opacity-80 disabled:opacity-35"
        >
          <Sparkle
            size={14}
            weight="fill"
            className={busy ? "animate-spin" : undefined}
          />
          {busy ? "Building recipe…" : "Create temporary recipe"}
        </button>
      </div>
    </>
  )
}

// ─── Recipe log sheet ─────────────────────────────────────────────────────────

function RecipeLogSheet({
  recipe,
  onLog,
  onEdit,
  onClose,
}: {
  recipe: Recipe
  onLog: (meal: string) => void
  onEdit?: () => void
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
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-sm rounded-t-[24px] bg-card px-4 pt-4 pb-[calc(var(--app-safe-bottom-lg)+5.25rem)] shadow-[0_-16px_50px_rgba(0,0,0,0.18)] md:pb-6">
        <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-foreground/10" />
        <p className="text-[15px] leading-snug font-semibold">Log to…</p>
        <p className="mb-0.5 truncate text-[11.5px] text-muted-foreground/45">
          {recipe.name}
        </p>
        <p className="mb-3 text-[11px] text-muted-foreground/30 tabular-nums">
          {totals.calories} kcal · P{totals.protein} C{totals.carbs} F
          {totals.fat}g
        </p>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="mb-3 flex min-h-10 w-full items-center justify-center rounded-2xl bg-muted px-4 text-[13px] font-semibold text-foreground/75 transition-opacity active:opacity-75"
          >
            Edit recipe
          </button>
        )}
        <div className="flex flex-col gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onLog(cat.id)}
              className="flex items-center justify-between rounded-2xl px-4 py-3 transition-all active:scale-[0.985]"
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
    <div className="app-surface px-4 py-3.5 short-phone:px-3.5 short-phone:py-3">
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
          className="app-button app-button-secondary text-muted-foreground/70"
        >
          <PencilSimple size={10} />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="app-button app-button-secondary px-3 text-muted-foreground/55"
          aria-label={`Delete ${recipe.name}`}
        >
          <Trash size={11} />
        </button>
        <button
          onClick={onLog}
          className="app-button app-button-quiet flex-1"
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
    <div className="app-surface px-4 py-3.5 short-phone:px-3.5 short-phone:py-3">
      <div className="flex items-center justify-between">
        <p className="app-eyebrow">
          Daily goals
        </p>
        <button
          onClick={() => setEditing((o) => !o)}
          className="app-button app-button-quiet"
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
                <span className="mt-0.5 text-[9px] font-medium text-muted-foreground/35 uppercase">
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
                <div className="flex items-center rounded-[10px] bg-muted/50 p-0.5">
                  <button
                    onClick={() => adjust(key, -step)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/60 active:bg-background active:text-foreground"
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
                    className="h-10 w-16 bg-transparent text-center text-[13px] font-semibold tabular-nums outline-none"
                  />
                  <button
                    onClick={() => adjust(key, step)}
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
              onClick={() => {
                onSave(draft)
                setEditing(false)
              }}
              className="app-button app-button-primary flex-1"
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
                className="app-button app-button-secondary text-muted-foreground/70"
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
    <div className="app-surface px-4 py-3.5 short-phone:px-3.5 short-phone:py-3">
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between">
        <p className="app-eyebrow">
          Hydration
        </p>
        <button
          onClick={() => navigate("/settings")}
          className="app-button app-button-quiet"
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
                "flex items-center justify-center rounded-[10px] py-2.5 transition-all active:scale-[0.985] short-phone:py-2",
                previewFilled ? "" : "bg-muted/25"
              )}
              style={previewFilled ? { backgroundColor: WATER_BG } : undefined}
              aria-label={
                filled
                  ? "Remove last water entry"
                  : `Fill to ${fmtWater(waterGlassTargetMl(goalMl, i + 1))}`
              }
            >
              <PintGlass
                size={22}
                weight={previewFilled ? "fill" : "regular"}
                style={{ color: previewFilled ? WATER_COLOR : undefined }}
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
          className="app-button app-button-quiet"
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
  const [searchParams, setSearchParams] = useSearchParams()

  const preferences = useQuery(api.users.users.getPreferences, {})
  const recipesQuery = useQuery(api.logs.recipes.list, {})
  const mealPresetsQuery = useQuery(api.logs.mealPresets.list, {})

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
  const createMealPresetMutation = useOfflineMutation(
    api.logs.mealPresets.create,
    "logs.mealPresets.create"
  )

  const activeTimezone = preferences?.lastActiveTimezone || "UTC"
  const todayKey = currentDateKey(activeTimezone)
  const goalsRes = useQuery(api.users.users.getEffectiveGoals, {
    date: todayKey,
  })

  const foodLogs = useQuery(api.logs.foodLogs.getDay, { date: todayKey })
  const supplementNutrition = useQuery(api.logs.supplements.getDayNutrition, {
    date: todayKey,
  })
  const recentFoodLogs = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: todayKey,
    limit: 21,
  })
  const todayEntries = (foodLogs ?? []) as FoodLogEntry[]
  const todaySupplementTotals = (supplementNutrition ??
    {}) as SupplementNutrients
  const recipes = (recipesQuery ?? []) as unknown as Recipe[]
  const mealPresets = (mealPresetsQuery ?? []) as unknown as MealPreset[]
  const recentFoodLogDays = (recentFoodLogs ?? []) as unknown as {
    date: string
    entries: FoodLogEntry[]
  }[]

  const [addOpen, setAddOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snapOffline, setSnapOffline] = useState(false)
  const [describeOpen, setDescribeOpen] = useState(false)
  const [describeBusy, setDescribeBusy] = useState(false)
  const [loggingRecipe, setLoggingRecipe] = useState<Recipe | null>(null)
  const [dismissedSmartMealKeys, setDismissedSmartMealKeys] = useState<
    string[]
  >([])
  const [smartMealBusyKey, setSmartMealBusyKey] = useState<string | null>(null)
  const { requireAiAccess, aiAccessModal } = useAiFeatureGate()
  useBottomBarAction(() => setAddOpen(true))

  function openSnapCamera() {
    if (!requireAiAccess()) return
    if (!navigator.onLine) {
      setSnapOffline(true)
      return
    }
    setSnapOffline(false)
    setAddOpen(false)
    navigate("/camera")
  }

  function openDescribeMeal() {
    if (!requireAiAccess()) return
    setAddOpen(false)
    setDescribeOpen(true)
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

  useEffect(() => {
    if (searchParams.get("describe") !== "1") return
    if (requireAiAccess()) {
      setAddOpen(false)
      setDescribeOpen(true)
    }
    const next = new URLSearchParams(searchParams)
    next.delete("describe")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, requireAiAccess])

  async function handleDescribeMeal(text: string) {
    if (describeBusy || !requireAiAccess()) return
    setDescribeBusy(true)
    try {
      const result = (await convexClient.action(
        (api.logs.snap as any).describeText,
        {
          text,
          language: preferences?.foodSearchLanguage ?? "en",
        }
      )) as unknown as { aiResult?: SnapAiResult; matches?: SnapFoodMatch[] }
      const recipe = tempRecipeFromAiDescription(result, text)
      if (!recipe) {
        toast.message("I couldn't match enough ingredients to log that meal")
        return
      }
      setDescribeOpen(false)
      setLoggingRecipe(recipe)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not parse meal")
    } finally {
      setDescribeBusy(false)
    }
  }

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

  const smartMealSuggestion = useMemo(
    () =>
      findSmartMealPresetSuggestion({
        recentDays: recentFoodLogDays,
        presets: mealPresets,
        todayEntries,
        currentMeal: defaultMeal(),
        dismissedKeys: dismissedSmartMealKeys,
      }),
    [dismissedSmartMealKeys, mealPresets, recentFoodLogDays, todayEntries]
  )

  function dismissSmartMealSuggestion(key: string) {
    setDismissedSmartMealKeys((prev) =>
      prev.includes(key) ? prev : [...prev, key]
    )
  }

  async function saveSmartMealPreset(suggestion: SmartMealPresetSuggestion) {
    if (suggestion.kind !== "save") return
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
    if (suggestion.kind !== "log") return
    setSmartMealBusyKey(suggestion.key)
    try {
      const presetEntries = foodLogEntriesFromMealPreset(suggestion.preset, {
        meal: suggestion.meal,
      })
      await setDay({
        date: todayKey,
        entries: [...todayEntries, ...presetEntries],
      })
      dismissSmartMealSuggestion(suggestion.key)
    } finally {
      setSmartMealBusyKey(null)
    }
  }

  return (
    <div className="desktop-canvas min-h-svh overflow-x-hidden bg-background lg:pr-8 lg:pl-72">
      <div className="mx-auto flex w-full max-w-lg flex-col pb-[calc(var(--app-safe-bottom-lg)+6.5rem)] md:max-w-6xl md:pb-10">
        {/* Header */}
        <header className="app-header px-[var(--app-page-x)] md:px-8 short-phone:pb-4">
          <div>
            <p className="app-eyebrow">
              Diary
            </p>
            <h1 className="app-title short-phone:text-[1.32rem]">
              Food
            </h1>
          </div>
          <div className="flex items-center gap-1.5 pb-0.5">
            <button
              onClick={() => setHistoryOpen(true)}
              aria-label="Open food history"
              className="app-icon-button"
            >
              <CalendarBlank size={15} />
            </button>
            <button
              onClick={openSnapCamera}
              aria-label="Snap meal"
              className="app-icon-button"
            >
              <Aperture size={15} />
            </button>
            <button
              onClick={() => navigate("/foods/search")}
              aria-label="Search foods"
              className="app-icon-button"
            >
              <MagnifyingGlass size={15} />
            </button>
          </div>
        </header>

        <FoodActionRow
          onSearch={() => navigate("/foods/search")}
          onScan={() => navigate("/camera?mode=barcode")}
          onSnap={openSnapCamera}
        />

        <div className="app-grid px-[var(--app-page-x)] md:px-8 short-phone:gap-3">
          {smartMealSuggestion && (
            <section className="md:col-span-2">
              <SmartMealPresetCard
                suggestion={smartMealSuggestion}
                onSave={() => {
                  void saveSmartMealPreset(smartMealSuggestion)
                }}
                onLog={() => {
                  void logSmartMealPreset(smartMealSuggestion)
                }}
                onDismiss={() =>
                  dismissSmartMealSuggestion(smartMealSuggestion.key)
                }
                busy={smartMealBusyKey === smartMealSuggestion.key}
              />
            </section>
          )}

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
              onEditRecipe={editRecipeFromLogEntry}
            />
          </section>

          <section>
            <SectionHeader title="Calories and macros" />
            <div className="flex flex-col gap-2.5">
              <StatsBar
                entries={todayEntries}
                supplementTotals={todaySupplementTotals}
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
                  className="app-button app-button-quiet"
                >
                  <Plus size={10} weight="bold" />
                  New
                </button>
              }
            />
            {recipes.length === 0 ? (
              <button
                onClick={() => navigate("/foods/recipe/new")}
                className="app-empty w-full transition-colors active:bg-muted/20"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-muted/60">
                  <BookBookmark
                    size={15}
                    className="text-muted-foreground/40"
                  />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-medium text-foreground/60">
                    No recipes saved
                  </p>
                  <p className="text-[11px] text-muted-foreground/35">
                    Create one for repeat meals.
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
            <MicronutrientsCard
              entries={todayEntries}
              supplementTotals={todaySupplementTotals}
            />
          </section>

          <section>
            <WaterCard dateKey={todayKey} />
          </section>
        </div>
      </div>

      {/* History sheet */}
      {historyOpen && <HistorySheet onClose={() => setHistoryOpen(false)} />}

      {describeOpen && (
        <DescribeMealSheet
          busy={describeBusy}
          onSubmit={(text) => {
            void handleDescribeMeal(text)
          }}
          onClose={() => setDescribeOpen(false)}
        />
      )}

      {/* Recipe log sheet */}
      {loggingRecipe && (
        <RecipeLogSheet
          recipe={loggingRecipe}
          onLog={(meal) => {
            const totals = recipeTotals(loggingRecipe.ingredients)
            const entry = stripUndefined({
              id: Math.random().toString(36).slice(2),
              name: loggingRecipe.name,
              ...totals,
              loggedAt: new Date().toISOString(),
              meal,
              recipeId: loggingRecipe._id,
              recipeDraft: loggingRecipe._id
                ? undefined
                : {
                    name: loggingRecipe.name,
                    ingredients: loggingRecipe.ingredients,
                  },
            })
            void setDay({
              date: todayKey,
              entries: [...todayEntries, entry],
            })
            setLoggingRecipe(null)
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
          overlayClassName="bg-black/50 backdrop-blur-[8px]"
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
          panelStyle={{
            paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
          }}
          maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
        >
          <div className="px-4 pt-1 pb-4">
            <div className="mb-3 app-surface overflow-hidden">
              <button
                onClick={() => {
                  setAddOpen(false)
                  navigate("/camera?mode=barcode")
                }}
                className="flex w-full items-center justify-between gap-3 border-b border-border/40 px-4 py-3.5 text-left transition-colors active:bg-muted/35"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="app-icon-button pointer-events-none h-9 w-9 bg-[var(--accent-food-bg)] text-[var(--accent-food)]">
                    <Barcode size={16} weight="bold" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">
                      Scan barcode
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground/60">
                      Packaged food
                    </span>
                  </span>
                </span>
                <CaretRight size={12} className="text-muted-foreground/35" />
              </button>

              <button
                onClick={openSnapCamera}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors active:bg-muted/35"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="app-icon-button pointer-events-none h-9 w-9 bg-muted/60 text-muted-foreground/70">
                    <Aperture size={17} weight="bold" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">
                      Snap meal
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground/60">
                      Estimate from photo
                    </span>
                  </span>
                </span>
                <CaretRight size={12} className="text-muted-foreground/35" />
              </button>

              <button
                onClick={openDescribeMeal}
                className="flex w-full items-center justify-between gap-3 border-t border-border/40 px-4 py-3.5 text-left transition-colors active:bg-muted/35"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="app-icon-button pointer-events-none h-9 w-9 bg-muted/60 text-muted-foreground/70">
                    <Sparkle size={16} weight="fill" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">
                      Describe meal
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground/60">
                      AI builds a temporary recipe
                    </span>
                  </span>
                </span>
                <CaretRight size={12} className="text-muted-foreground/35" />
              </button>
            </div>

            <div className="app-surface overflow-hidden">
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
              {recipes.length > 0 && (
                <>
                  <div className="mx-4 h-px bg-border/50" />
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground/38 uppercase">
                      Saved recipes
                    </p>
                  </div>
                  {recipes.slice(0, 5).map((recipe) => {
                    const totals = recipeTotals(recipe.ingredients)
                    return (
                      <div
                        key={recipe._id ?? recipe.name}
                        className="flex w-full items-center gap-1 px-2 py-1"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setAddOpen(false)
                            setLoggingRecipe(recipe)
                          }}
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-colors active:bg-muted/40"
                        >
                          <div className="min-w-0 text-left">
                            <p className="truncate text-[13px] font-medium">
                              {recipe.name}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-muted-foreground/45">
                              {totals.calories} kcal · {recipe.ingredients.length} ingredient
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

      {aiAccessModal}
    </div>
  )
}
