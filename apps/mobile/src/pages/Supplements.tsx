import React, { useMemo, useState } from "react"
import {
  Barcode,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Clock,
  MagnifyingGlass,
  PencilSimple,
  Pill,
  Plus,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { FoodDetailSheet } from "@/components/food-detail-sheet"
import { MobileSheet } from "@/components/mobile-sheet"
import { SlideToDeleteRow } from "@/components/slide-to-delete-row"
import { useBottomBarAction } from "@/components/bottom-bar"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  currentDateKey,
  foodPortionLabel,
  offsetDateKey,
  parseFoodPortionLabel,
  stripUndefined,
  type FoodPortion,
} from "@/lib/food-log"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { getFoodDetail, searchFoods } from "@/lib/openfoodfacts"
import {
  SUPPLEMENT_CATEGORIES,
  SUPPLEMENT_FORMS,
  SUPPLEMENT_NUTRIENT_DETAILS,
  SUPPLEMENT_SUMMARY_NUTRIENT_KEYS,
  buildSupplementDayPlan,
  cleanSupplementNutrients,
  defaultServingQuantityFromLabel,
  defaultSupplementDraft,
  formatNutrientValue,
  formatSupplementNutrient,
  scaleSupplementNutrients,
  supplementCategoryDetail,
  supplementConsistency,
  supplementDraftFromFoodDetail,
  supplementDraftFromFoodResult,
  supplementLogFromIntake,
  supplementNutrientTotals,
  type SupplementCategory,
  type SupplementForm,
  type SupplementIntakeLog,
  type SupplementItem,
  type SupplementItemDraft,
  type SupplementNutrientKey,
  type SupplementNutrients,
  type SupplementScheduleType,
} from "@/lib/supplements"
import { cn } from "@/lib/utils"
import type { FoodDetail, FoodResult } from "@repo/models"
import { api } from "../../../../convex/_generated/api"

const EDITOR_NUTRIENT_KEYS: SupplementNutrientKey[] = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "fiber",
  "sugar",
  "saturatedFat",
  "sodium",
  "potassium",
  "calcium",
  "iron",
  "magnesium",
  "phosphorus",
  "zinc",
  "vitaminA",
  "vitaminC",
  "vitaminD",
  "vitaminB12",
  "caffeine",
  "creatine",
  "omega3",
  "epa",
  "dha",
]

const WEEKDAYS = [
  { id: 1, label: "M" },
  { id: 2, label: "T" },
  { id: 3, label: "W" },
  { id: 4, label: "T" },
  { id: 5, label: "F" },
  { id: 6, label: "S" },
  { id: 0, label: "S" },
]

type Overview = {
  items: SupplementItem[]
  logs: SupplementIntakeLog[]
  legacyEntries: ReturnType<typeof supplementLogFromIntake>[]
  recentLogs: SupplementIntakeLog[]
  nutritionTotals: SupplementNutrients
  isTrainingDay: boolean
}

type SheetMode =
  | { kind: "edit"; item?: SupplementItem }
  | { kind: "log"; item: SupplementItem }
  | { kind: "detail"; item: SupplementItem }
  | null

type ItemEntryMode = "choose" | "manual" | "search"

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDateLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today"
  const yesterday = offsetDateKey(todayKey, -1)
  if (dateKey === yesterday) return "Yesterday"
  const d = new Date(`${dateKey}T12:00:00Z`)
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function scheduleLabel(item: SupplementItem) {
  const schedule = item.schedule
  if (schedule.type === "none") return "No schedule"
  if (schedule.type === "daily") return "Daily"
  if (schedule.type === "training_days") return "Training days"
  if (schedule.type === "rest_days") return "Rest days"
  const labels = WEEKDAYS.filter((day) =>
    (schedule.weekdays ?? []).includes(day.id)
  ).map((day) => day.label)
  return labels.length > 0 ? labels.join(" ") : "Selected days"
}

function nutrientEntries(nutrients: SupplementNutrients) {
  return SUPPLEMENT_SUMMARY_NUTRIENT_KEYS.filter(
    (key) => (nutrients[key] ?? 0) > 0
  ).map((key) => ({
    key,
    value: nutrients[key] ?? 0,
    detail: SUPPLEMENT_NUTRIENT_DETAILS[key],
  }))
}

const FORM_SERVING_UNITS: Record<
  SupplementForm,
  { singular: string; plural: string }
> = {
  capsule: { singular: "capsule", plural: "capsules" },
  tablet: { singular: "unit", plural: "units" },
  powder: { singular: "scoop", plural: "scoops" },
  liquid: { singular: "serving", plural: "servings" },
  gummy: { singular: "gummy", plural: "gummies" },
  softgel: { singular: "softgel", plural: "softgels" },
  other: { singular: "serving", plural: "servings" },
}

const FORM_BASED_SERVING_RE =
  /^\s*[0-9]+(?:[.,][0-9]+)?\s*(?:units?|tablets?|capsules?|caplets?|gumm(?:y|ies)|soft\s*gels?|softgels?|scoops?|servings?)\s*$/i

function formatServingQuantity(quantity: number) {
  const safe = Number.isFinite(quantity) && quantity > 0 ? quantity : 1
  return Number.isInteger(safe)
    ? String(safe)
    : safe.toFixed(2).replace(/\.?0+$/, "")
}

function servingLabelForForm(form: SupplementForm, quantity = 1) {
  const unit = FORM_SERVING_UNITS[form] ?? FORM_SERVING_UNITS.other
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1
  const label = safeQuantity === 1 ? unit.singular : unit.plural
  return `${formatServingQuantity(safeQuantity)} ${label}`
}

function isDefaultServingLabel(label?: string) {
  const normalized = label?.trim().toLowerCase()
  if (!normalized) return true
  return (
    SUPPLEMENT_CATEGORIES.some(
      (item) => item.defaultServingLabel.toLowerCase() === normalized
    ) ||
    SUPPLEMENT_FORMS.some(
      (item) => servingLabelForForm(item.id).toLowerCase() === normalized
    )
  )
}

function isFormBasedServingLabel(label?: string) {
  return FORM_BASED_SERVING_RE.test(label ?? "")
}

function shouldRefreshServingForForm(label?: string) {
  return isDefaultServingLabel(label) || isFormBasedServingLabel(label)
}

type NutrientScaleBase = {
  servingLabel: string
  nutrients: SupplementNutrients
}

function parseServingMassMg(label?: string) {
  const match = label?.match(
    /([0-9]+(?:[.,][0-9]+)?)\s*(micrograms?|mcg|µg|ug|milligrams?|mg|kilograms?|kg|grams?|g)\b/i
  )
  if (!match) return null

  const amount = Number(match[1].replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0) return null

  const unit = match[2].toLowerCase().replace("µ", "u")
  if (unit === "kg" || unit.startsWith("kilogram")) return amount * 1_000_000
  if (unit === "g" || unit.startsWith("gram")) return amount * 1_000
  if (unit === "ug" || unit === "mcg" || unit.startsWith("microgram"))
    return amount / 1_000
  return amount
}

function parseSupplementDoseCount(label?: string) {
  const unitMatch = label?.match(
    /([0-9]+(?:[.,][0-9]+)?)\s*(units?|pills?|tabs?|tablets?|caps?|capsules?|caplets?|soft\s*gels?|softgels?|gumm(?:y|ies)|scoops?|servings?)\b/i
  )
  const numberOnlyMatch = label?.match(/^\s*([0-9]+(?:[.,][0-9]+)?)\s*$/)
  const rawAmount = unitMatch?.[1] ?? numberOnlyMatch?.[1]
  if (!rawAmount) return null

  const amount = Number(rawAmount.replace(",", "."))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function servingScaleFromLabels(baseLabel: string, servingLabel: string) {
  const baseMass = parseServingMassMg(baseLabel)
  const nextMass = parseServingMassMg(servingLabel)
  if (baseMass && nextMass) return nextMass / baseMass

  const basePortion = parseFoodPortionLabel(baseLabel)
  const nextPortion = parseFoodPortionLabel(servingLabel)
  if (basePortion?.grams && nextPortion?.grams) {
    return nextPortion.grams / basePortion.grams
  }

  const baseCount = parseSupplementDoseCount(baseLabel)
  const nextCount = parseSupplementDoseCount(servingLabel)
  if (baseCount && nextCount) return nextCount / baseCount

  return 1
}

function scaledNutrientsForServing(
  base: NutrientScaleBase,
  servingLabel: string
) {
  return scaleSupplementNutrients(
    base.nutrients,
    servingScaleFromLabels(base.servingLabel, servingLabel)
  )
}

function sameSupplementNutrients(
  left: SupplementNutrients,
  right: SupplementNutrients
) {
  return (
    JSON.stringify(cleanSupplementNutrients(left)) ===
    JSON.stringify(cleanSupplementNutrients(right))
  )
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
    <div className="app-section-header">
      <div className="min-w-0">
        <h2 className="app-section-title">{title}</h2>
        {sub && <p className="app-section-subtitle">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

function StatePill({ state }: { state: string }) {
  const label =
    state === "taken"
      ? "Taken"
      : state === "skipped"
        ? "Skipped"
        : state === "missed"
          ? "Missed"
          : state === "due"
            ? "Due"
            : "Optional"
  return (
    <span
      className={cn(
        "rounded-[9px] px-2 py-1 text-[10px] font-semibold tabular-nums",
        state === "taken" &&
          "bg-[var(--accent-supplement-bg)] text-[var(--accent-supplement)]",
        state === "missed" && "bg-destructive/10 text-destructive/80",
        state === "skipped" && "bg-muted/60 text-muted-foreground/60",
        (state === "due" || state === "unscheduled") &&
          "bg-muted/45 text-muted-foreground/55"
      )}
    >
      {label}
    </span>
  )
}

function SummaryStrip({
  plan,
  logs,
  legacyCount,
}: {
  plan: ReturnType<typeof buildSupplementDayPlan>
  logs: SupplementIntakeLog[]
  legacyCount: number
}) {
  const taken = plan.filter((item) => item.state === "taken").length
  const due = plan.filter((item) => item.state === "due").length
  const missed = plan.filter((item) => item.state === "missed").length
  const nutrientTotals = supplementNutrientTotals(logs)
  const highlights = [
    "protein",
    "creatine",
    "caffeine",
    "sodium",
  ] as SupplementNutrientKey[]

  return (
    <div className="app-surface px-4 py-3.5 short-phone:px-3.5 short-phone:py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="app-eyebrow">Today</p>
          <div className="mt-2 flex items-end gap-1">
            <span className="text-[2rem] leading-none font-bold tabular-nums">
              {taken}
            </span>
            <span className="pb-0.5 text-[11px] font-semibold text-muted-foreground/40">
              taken
            </span>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-2 text-center">
          {[
            ["Due", due],
            ["Missed", missed],
            ["Logs", logs.length + legacyCount],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-12 rounded-[12px] bg-muted/35 px-2 py-2"
            >
              <p className="text-[14px] leading-none font-bold tabular-nums">
                {value}
              </p>
              <p className="mt-1 text-[8.5px] font-semibold tracking-[0.12em] text-muted-foreground/35 uppercase">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {highlights.map((key) => {
          const value = nutrientTotals[key] ?? 0
          const detail = SUPPLEMENT_NUTRIENT_DETAILS[key]
          return (
            <div key={key} className="min-w-0">
              <p className="truncate text-[9px] font-semibold text-muted-foreground/35">
                {detail.label}
              </p>
              <p className="mt-0.5 text-[13px] leading-none font-semibold tabular-nums">
                {formatNutrientValue(value)}
                <span className="ml-0.5 text-[8.5px] font-normal text-muted-foreground/35">
                  {detail.unit}
                </span>
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TodayRow({
  plan,
  consistency,
  onTake,
  onCustom,
  onSkip,
  onOpen,
}: {
  plan: ReturnType<typeof buildSupplementDayPlan>[number]
  consistency: ReturnType<typeof supplementConsistency>
  onTake: () => void
  onCustom: () => void
  onSkip: () => void
  onOpen: () => void
}) {
  const { item, state, logs } = plan
  const detail = supplementCategoryDetail(item.category)
  const latest = [...logs].sort((a, b) =>
    b.loggedAt.localeCompare(a.loggedAt)
  )[0]
  const shownNutrients = nutrientEntries(
    scaleSupplementNutrients(item.nutrientsPerServing, 1)
  ).slice(0, 3)

  return (
    <div className="app-surface px-3.5 py-3 short-phone:px-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="app-icon-button h-10 w-10 shrink-0 bg-muted/55 text-muted-foreground/70"
          aria-label={`Open ${item.name}`}
        >
          <Pill size={16} weight="bold" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="min-w-0 text-left"
            >
              <p className="truncate text-[14px] leading-tight font-semibold">
                {item.name}
              </p>
              <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground/42">
                {item.brand ? `${item.brand} · ` : ""}
                {item.servingLabel}
                {item.schedule.preferredTime
                  ? ` · ${item.schedule.preferredTime}`
                  : ""}
              </p>
            </button>
            <StatePill state={state} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[10px] font-medium text-muted-foreground/40 tabular-nums">
              {consistency.takenThisWeek}x this week
            </span>
            <span className="text-[10px] font-medium text-muted-foreground/40 tabular-nums">
              {consistency.currentStreak} day streak
            </span>
            {latest && (
              <span className="text-[10px] font-medium text-muted-foreground/40 tabular-nums">
                {fmtTime(latest.loggedAt)}
              </span>
            )}
          </div>

          {shownNutrients.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {shownNutrients.map(({ key, value, detail }) => (
                <span
                  key={key}
                  className="rounded-[8px] bg-muted/40 px-2 py-1 text-[9.5px] font-semibold text-muted-foreground/60 tabular-nums"
                >
                  {detail.label} {formatNutrientValue(value)}
                  {detail.unit}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem] gap-2">
            <button
              type="button"
              onClick={onTake}
              disabled={state === "taken"}
              className="app-button app-button-primary min-h-10 disabled:opacity-45"
            >
              <Check size={12} weight="bold" />
              {state === "taken" ? "Taken" : "Taken now"}
            </button>
            <button
              type="button"
              onClick={onCustom}
              className="app-icon-button h-10 w-10"
              aria-label={`Custom log ${item.name}`}
            >
              <Plus size={12} weight="bold" />
            </button>
            <button
              type="button"
              onClick={onSkip}
              disabled={
                !plan.isScheduled || state === "taken" || state === "skipped"
              }
              className="app-icon-button h-10 w-10 disabled:opacity-25"
              aria-label={`Mark ${item.name} skipped`}
            >
              <X size={10} weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CatalogRow({
  item,
  consistency,
  onEdit,
  onOpen,
  onQuickLog,
  onToggleActive,
  onDelete,
}: {
  item: SupplementItem
  consistency: ReturnType<typeof supplementConsistency>
  onEdit: () => void
  onOpen: () => void
  onQuickLog: () => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  const detail = supplementCategoryDetail(item.category)
  const nutrientCount = Object.values(item.nutrientsPerServing ?? {}).filter(
    (value) => typeof value === "number" && value > 0
  ).length

  return (
    <div className="flex items-center gap-3 border-b border-border/25 py-3 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="app-icon-button h-10 w-10 shrink-0 bg-muted/55 text-muted-foreground/70"
        aria-label={`Open ${item.name}`}
      >
        <Pill size={16} weight="bold" />
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-[13.5px] font-semibold text-foreground/90">
          {item.name}
        </p>
        <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground/42">
          {detail.label} · {scheduleLabel(item)} · {nutrientCount} nutrient
          {nutrientCount === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground/35 tabular-nums">
          {consistency.lastTaken
            ? `Last ${consistency.lastTaken}`
            : "No history yet"}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onQuickLog}
          className="app-icon-button h-9 w-9"
          aria-label={`Log ${item.name}`}
        >
          <Check size={11} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="app-icon-button h-9 w-9"
          aria-label={`Edit ${item.name}`}
        >
          <PencilSimple size={12} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="app-icon-button h-9 w-9 text-muted-foreground/45 active:bg-destructive/10 active:text-destructive"
          aria-label={`Delete ${item.name}`}
        >
          <Trash size={12} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onToggleActive}
          className={cn(
            "h-9 min-w-12 rounded-[10px] px-2 text-[10px] font-semibold",
            item.active
              ? "bg-[var(--accent-supplement-bg)] text-[var(--accent-supplement)]"
              : "bg-muted/45 text-muted-foreground/45"
          )}
        >
          {item.active ? "On" : "Off"}
        </button>
      </div>
    </div>
  )
}

function ImportNotice({ imported }: { imported: boolean }) {
  if (!imported) return null
  return (
    <div className="mb-3 flex items-start gap-2 rounded-[12px] bg-muted/45 px-3 py-2 text-[11px] text-muted-foreground/60">
      <Barcode size={13} weight="bold" className="mt-0.5 shrink-0" />
      <span>
        OpenFoodFacts data imported. Nutrients are read-only and scale from the
        serving size you enter.
      </span>
    </div>
  )
}

function ItemSheet({
  item,
  onClose,
  onSave,
}: {
  item?: SupplementItem
  onClose: () => void
  onSave: (id: string | undefined, draft: SupplementItemDraft) => Promise<void>
}) {
  const initialDraft: SupplementItemDraft = item
    ? {
        name: item.name,
        brand: item.brand,
        category: item.category,
        form: item.form,
        servingLabel: item.servingLabel,
        defaultServingQuantity: item.defaultServingQuantity,
        barcode: item.barcode,
        notes: item.notes,
        active: item.active,
        schedule: item.schedule,
        nutrientsPerServing: item.nutrientsPerServing ?? {},
        source: item.source ?? "manual",
        importedOpenFoodFacts: item.importedOpenFoodFacts,
      }
    : defaultSupplementDraft("creatine")

  const [draft, setDraft] = useState<SupplementItemDraft>(() => initialDraft)
  const [entryMode, setEntryMode] = useState<ItemEntryMode>(
    item ? "manual" : "choose"
  )
  const [barcodeBusy, setBarcodeBusy] = useState(false)
  const [barcodeError, setBarcodeError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<FoodResult[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<FoodResult | null>(null)
  const [importingCode, setImportingCode] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [nutrientScaleBase, setNutrientScaleBase] =
    useState<NutrientScaleBase | null>(() =>
      item?.source === "openfoodfacts"
        ? {
            servingLabel: item.servingLabel,
            nutrients: cleanSupplementNutrients(item.nutrientsPerServing ?? {}),
          }
        : null
    )

  function applyImportedDraft(nextDraft: SupplementItemDraft) {
    setNutrientScaleBase({
      servingLabel: nextDraft.servingLabel,
      nutrients: cleanSupplementNutrients(nextDraft.nutrientsPerServing ?? {}),
    })
    setDraft((prev) => ({
      ...nextDraft,
      schedule: prev.schedule,
      active: prev.active,
    }))
    setShowAdvanced(false)
    setBarcodeError(null)
    setSearchError(null)
    setEntryMode("manual")
  }

  function applyFoodDetail(detail: FoodDetail, portion?: FoodPortion) {
    if (!portion) {
      applyImportedDraft(supplementDraftFromFoodDetail(detail))
      return
    }

    const servingLabel = foodPortionLabel(portion)
    applyImportedDraft(
      supplementDraftFromFoodDetail({
        ...detail,
        serving: servingLabel,
        servingLabel,
        servingGrams: portion.grams,
      })
    )
  }

  function update<K extends keyof SupplementItemDraft>(
    key: K,
    value: SupplementItemDraft[K]
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function withServingLabel(
    prev: SupplementItemDraft,
    servingLabel: string
  ): SupplementItemDraft {
    return {
      ...prev,
      servingLabel,
      defaultServingQuantity: defaultServingQuantityFromLabel(servingLabel),
      nutrientsPerServing:
        prev.source === "openfoodfacts" && nutrientScaleBase
          ? scaledNutrientsForServing(nutrientScaleBase, servingLabel)
          : prev.nutrientsPerServing,
    }
  }

  function updateCategory(nextCategory: SupplementCategory) {
    const next = supplementCategoryDetail(nextCategory)
    setDraft((prev) => {
      const previous = supplementCategoryDetail(prev.category)
      const shouldUseServingDefaults =
        prev.form === previous.defaultForm &&
        isDefaultServingLabel(prev.servingLabel)
      const shouldUseDefaultNutrients =
        prev.source !== "openfoodfacts" &&
        sameSupplementNutrients(
          prev.nutrientsPerServing,
          defaultSupplementDraft(prev.category).nutrientsPerServing
        )

      if (!shouldUseServingDefaults) {
        return {
          ...prev,
          category: nextCategory,
          nutrientsPerServing: shouldUseDefaultNutrients
            ? defaultSupplementDraft(nextCategory).nutrientsPerServing
            : prev.nutrientsPerServing,
        }
      }

      const servingLabel =
        next.defaultForm === "tablet"
          ? servingLabelForForm(next.defaultForm)
          : next.defaultServingLabel
      const updated = withServingLabel(prev, servingLabel)
      return {
        ...updated,
        category: nextCategory,
        form: next.defaultForm,
        nutrientsPerServing: shouldUseDefaultNutrients
          ? defaultSupplementDraft(nextCategory).nutrientsPerServing
          : updated.nutrientsPerServing,
      }
    })
  }

  function updateForm(nextForm: SupplementForm) {
    setDraft((prev) => {
      if (!shouldRefreshServingForForm(prev.servingLabel)) {
        return { ...prev, form: nextForm }
      }

      const quantity = isFormBasedServingLabel(prev.servingLabel)
        ? defaultServingQuantityFromLabel(prev.servingLabel)
        : 1
      const servingLabel = servingLabelForForm(nextForm, quantity)
      return { ...withServingLabel(prev, servingLabel), form: nextForm }
    })
  }

  function updateServingLabel(servingLabel: string) {
    setDraft((prev) => withServingLabel(prev, servingLabel))
  }

  async function runSearch(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const query = searchQuery.trim()
    if (query.length < 2) {
      setSearchResults([])
      setSearchError(query ? "Use at least 2 characters." : null)
      return
    }

    setSearchBusy(true)
    setSearchError(null)
    try {
      const results = await searchFoods(query, 30)
      setSearchResults(results)
      if (results.length === 0)
        setSearchError("No OpenFoodFacts results found.")
    } catch {
      setSearchResults([])
      setSearchError("Search failed. You can still add it manually.")
    } finally {
      setSearchBusy(false)
    }
  }

  function importFoodResult(
    result: FoodResult,
    detail?: FoodDetail | null,
    portion?: FoodPortion
  ) {
    if (detail) applyFoodDetail(detail, portion)
    else applyImportedDraft(supplementDraftFromFoodResult(result))
    setPreviewItem(null)
  }

  async function importSearchResult(result: FoodResult) {
    setImportingCode(result.code)
    setSearchError(null)
    try {
      const detail = await getFoodDetail(result.code)
      importFoodResult(result, detail)
    } catch {
      importFoodResult(result)
    } finally {
      setImportingCode(null)
    }
  }

  async function importBarcode() {
    const code = draft.barcode?.trim()
    if (!code) return
    setBarcodeBusy(true)
    setBarcodeError(null)
    try {
      const detail = await getFoodDetail(code)
      if (!detail) {
        setBarcodeError("No OpenFoodFacts product found.")
        return
      }
      applyFoodDetail(detail)
    } catch {
      setBarcodeError("Lookup failed. You can still enter it manually.")
    } finally {
      setBarcodeBusy(false)
    }
  }

  async function submit() {
    if (!draft.name.trim() || !draft.servingLabel.trim()) return
    const finalDraft =
      draft.source === "openfoodfacts" && nutrientScaleBase
        ? {
            ...draft,
            nutrientsPerServing: scaledNutrientsForServing(
              nutrientScaleBase,
              draft.servingLabel
            ),
          }
        : draft
    setSaving(true)
    try {
      await onSave(item?._id, finalDraft)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const advancedNutrients = EDITOR_NUTRIENT_KEYS.map((key) => ({
    key,
    value: draft.nutrientsPerServing[key] ?? 0,
    detail: SUPPLEMENT_NUTRIENT_DETAILS[key],
  })).filter((entry) => entry.value > 0)
  const nutrientCount = advancedNutrients.length
  const title = item
    ? "Edit supplement"
    : entryMode === "search"
      ? "Search OpenFoodFacts"
      : entryMode === "manual"
        ? "Custom supplement"
        : "Add supplement"

  return (
    <>
      <MobileSheet
        onClose={onClose}
        overlayClassName="bg-black/40 backdrop-blur-[4px]"
        panelClassName="mx-auto w-full max-w-lg overflow-hidden rounded-t-[28px] bg-card shadow-[0_-20px_60px_rgba(0,0,0,0.2)]"
        maxHeight="92svh"
        bottom={
          entryMode === "manual" ? (
            <div
              className="border-t border-border/35 bg-card px-4 pt-3"
              style={{
                paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))",
              }}
            >
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="app-button app-button-primary min-h-11 w-full"
              >
                {saving ? "Saving..." : "Save supplement"}
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="px-4 pt-1 pb-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              {!item && entryMode !== "choose" && (
                <button
                  type="button"
                  onClick={() => setEntryMode("choose")}
                  className="app-icon-button h-9 w-9"
                  aria-label="Back"
                >
                  <CaretLeft size={12} weight="bold" />
                </button>
              )}
              <p className="truncate text-[15px] font-semibold">{title}</p>
            </div>
            <button
              onClick={onClose}
              className="app-icon-button h-10 w-10"
              aria-label="Close"
            >
              <X size={12} weight="bold" />
            </button>
          </div>

          {entryMode === "choose" && (
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => setEntryMode("manual")}
                className="flex items-center gap-3 rounded-[16px] border border-border/45 bg-muted/20 px-3.5 py-3 text-left"
              >
                <span className="app-icon-button pointer-events-none h-10 w-10 bg-muted/55 text-muted-foreground/70">
                  <Plus size={15} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">
                    Custom supplement
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/45">
                    Manual serving, schedule, and notes
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setEntryMode("search")}
                className="flex items-center gap-3 rounded-[16px] border border-border/45 bg-muted/20 px-3.5 py-3 text-left"
              >
                <span className="app-icon-button pointer-events-none h-10 w-10 bg-muted/55 text-muted-foreground/70">
                  <MagnifyingGlass size={15} weight="bold" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">
                    Search OpenFoodFacts
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/45">
                    Import product data, then edit
                  </span>
                </span>
              </button>
            </div>
          )}

          {entryMode === "search" && (
            <div className="grid gap-4">
              <form onSubmit={runSearch} className="grid gap-2">
                <label className="grid gap-1.5">
                  <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
                    Product search
                  </span>
                  <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2">
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Creatine, whey, magnesium..."
                      className="h-11 min-w-0 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                    />
                    <button
                      type="submit"
                      disabled={searchBusy}
                      className="app-icon-button h-11 w-11 disabled:opacity-40"
                      aria-label="Search OpenFoodFacts"
                    >
                      <MagnifyingGlass size={14} weight="bold" />
                    </button>
                  </div>
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
                    Barcode
                  </span>
                  <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2">
                    <input
                      value={draft.barcode ?? ""}
                      inputMode="numeric"
                      onChange={(e) => update("barcode", e.target.value)}
                      className="h-11 min-w-0 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                    />
                    <button
                      type="button"
                      onClick={importBarcode}
                      disabled={barcodeBusy}
                      className="app-icon-button h-11 w-11 disabled:opacity-40"
                      aria-label="Lookup barcode"
                    >
                      <Barcode size={14} weight="bold" />
                    </button>
                  </div>
                </label>
              </form>

              {(searchError || barcodeError) && (
                <p className="rounded-[10px] bg-destructive/10 px-3 py-2 text-[11px] text-destructive/80">
                  {searchError ?? barcodeError}
                </p>
              )}

              {searchResults.length > 0 && (
                <div className="rounded-[16px] border border-border/35">
                  {searchResults.map((result) => (
                    <div
                      key={result.id}
                      className="flex items-center gap-3 border-b border-border/25 px-3 py-2.5 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewItem(result)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors active:bg-muted/30"
                      >
                        {result.imageUrl ? (
                          <img
                            src={result.imageUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-[10px] object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-muted/45 text-muted-foreground/45">
                            <Barcode size={14} weight="bold" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold">
                            {result.name}
                          </p>
                          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground/45">
                            {result.brand ? `${result.brand} · ` : ""}
                            {result.serving}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground/35 tabular-nums">
                            {result.calories} kcal · P{" "}
                            {formatNutrientValue(result.protein)}g · C{" "}
                            {formatNutrientValue(result.carbs)}g · F{" "}
                            {formatNutrientValue(result.fat)}g
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => importSearchResult(result)}
                        disabled={importingCode === result.code}
                        className="app-button app-button-secondary min-h-9 shrink-0 px-3 text-[11px] disabled:opacity-45"
                      >
                        <Plus size={11} weight="bold" />
                        {importingCode === result.code ? "Importing" : "Import"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {entryMode === "manual" && (
            <>
              <ImportNotice imported={draft.source === "openfoodfacts"} />

              {!item && (
                <button
                  type="button"
                  onClick={() => setEntryMode("search")}
                  className="app-button app-button-secondary mb-3 min-h-10 w-full"
                >
                  <MagnifyingGlass size={13} weight="bold" />
                  Search OpenFoodFacts
                </button>
              )}

              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
                    Name
                  </span>
                  <input
                    value={draft.name}
                    onChange={(e) => update("name", e.target.value)}
                    className="h-11 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
                      Brand
                    </span>
                    <input
                      value={draft.brand ?? ""}
                      onChange={(e) => update("brand", e.target.value)}
                      className="h-11 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
                      Barcode
                    </span>
                    <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2">
                      <input
                        value={draft.barcode ?? ""}
                        inputMode="numeric"
                        onChange={(e) => update("barcode", e.target.value)}
                        className="h-11 min-w-0 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                      />
                      <button
                        type="button"
                        onClick={importBarcode}
                        disabled={barcodeBusy}
                        className="app-icon-button h-11 w-11 disabled:opacity-40"
                        aria-label="Lookup barcode"
                      >
                        <Barcode size={14} weight="bold" />
                      </button>
                    </div>
                  </label>
                </div>

                {barcodeError && (
                  <p className="rounded-[10px] bg-destructive/10 px-3 py-2 text-[11px] text-destructive/80">
                    {barcodeError}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
                      Category
                    </span>
                    <select
                      value={draft.category}
                      onChange={(e) =>
                        updateCategory(e.target.value as SupplementCategory)
                      }
                      className="h-11 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                    >
                      {SUPPLEMENT_CATEGORIES.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
                      Form
                    </span>
                    <select
                      value={draft.form}
                      onChange={(e) =>
                        updateForm(e.target.value as SupplementForm)
                      }
                      className="h-11 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                    >
                      {SUPPLEMENT_FORMS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="grid gap-1.5">
                  <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
                    Serving size
                  </span>
                  <input
                    value={draft.servingLabel}
                    placeholder={servingLabelForForm(draft.form)}
                    onChange={(e) => updateServingLabel(e.target.value)}
                    className="h-11 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                  />
                </label>

                <ScheduleEditor draft={draft} update={update} />

                <div className="rounded-[16px] border border-border/35 bg-muted/15">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((value) => !value)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
                        Advanced
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/45">
                        {nutrientCount > 0
                          ? `${nutrientCount} ${
                              nutrientCount === 1 ? "nutrient" : "nutrients"
                            } per serving`
                          : "Optional nutrients per serving"}
                      </span>
                    </span>
                    <CaretDown
                      size={14}
                      weight="bold"
                      className={cn(
                        "shrink-0 text-muted-foreground/40 transition-transform",
                        showAdvanced && "rotate-180"
                      )}
                    />
                  </button>

                  {showAdvanced && (
                    <div className="border-t border-border/25 px-3 py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
                          Nutrients per serving
                        </p>
                        <span className="text-[10px] text-muted-foreground/35">
                          Read-only
                        </span>
                      </div>
                      {draft.source === "openfoodfacts" && (
                        <p className="mb-2 rounded-[10px] bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground/55">
                          Imported nutrients stay locked and recalculate from
                          your serving size.
                        </p>
                      )}
                      {advancedNutrients.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                          {advancedNutrients.map(({ key, value, detail }) => (
                            <div
                              key={key}
                              className="grid gap-1 rounded-xl bg-muted/35 px-2.5 py-2"
                            >
                              <span className="truncate text-[10px] font-medium text-muted-foreground/50">
                                {detail.label}
                              </span>
                              <span className="text-[12px] font-semibold tabular-nums">
                                {formatSupplementNutrient(key, value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-xl bg-muted/30 px-3 py-4 text-center text-[11px] text-muted-foreground/45">
                          No nutrient data for this supplement.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <label className="grid gap-1.5">
                  <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
                    Notes
                  </span>
                  <textarea
                    value={draft.notes ?? ""}
                    onChange={(e) => update("notes", e.target.value)}
                    rows={3}
                    className="resize-none rounded-xl bg-muted/45 px-3 py-2 text-[13px] outline-none"
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </MobileSheet>

      {previewItem && (
        <FoodDetailSheet
          item={previewItem}
          added={false}
          showMealPicker={false}
          actionLabel={(_, _mealLabel, portion) =>
            `Import ${foodPortionLabel(portion)} as supplement`
          }
          onAdd={(food, _grams, _micros, _meal, detail, portion) => {
            importFoodResult(food, detail, portion)
          }}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </>
  )
}

function ScheduleEditor({
  draft,
  update,
}: {
  draft: SupplementItemDraft
  update: <K extends keyof SupplementItemDraft>(
    key: K,
    value: SupplementItemDraft[K]
  ) => void
}) {
  function setSchedule(patch: Partial<SupplementItemDraft["schedule"]>) {
    update("schedule", { ...draft.schedule, ...patch })
  }

  return (
    <div className="rounded-[14px] bg-muted/30 p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_6.25rem] gap-2">
        <label className="grid gap-1.5">
          <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
            Schedule
          </span>
          <select
            value={draft.schedule.type}
            onChange={(e) =>
              setSchedule({ type: e.target.value as SupplementScheduleType })
            }
            className="h-10 rounded-xl bg-background/80 px-3 text-[12px] outline-none"
          >
            {[
              ["none", "No schedule"],
              ["daily", "Daily"],
              ["weekdays", "Selected days"],
              ["training_days", "Training days"],
              ["rest_days", "Rest days"],
            ].map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
            Time
          </span>
          <input
            type="time"
            value={draft.schedule.preferredTime ?? ""}
            onChange={(e) => setSchedule({ preferredTime: e.target.value })}
            className="h-10 rounded-xl bg-background/80 px-2 text-[12px] outline-none"
          />
        </label>
      </div>

      {draft.schedule.type === "weekdays" && (
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((day) => {
            const active = (draft.schedule.weekdays ?? []).includes(day.id)
            return (
              <button
                key={`${day.id}-${day.label}`}
                type="button"
                onClick={() => {
                  const days = new Set(draft.schedule.weekdays ?? [])
                  if (active) days.delete(day.id)
                  else days.add(day.id)
                  setSchedule({ weekdays: [...days].sort((a, b) => a - b) })
                }}
                className={cn(
                  "h-8 rounded-[9px] text-[11px] font-bold",
                  active
                    ? "bg-foreground text-background"
                    : "bg-background/70 text-muted-foreground/45"
                )}
              >
                {day.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function numberFromInput(value: string) {
  const parsed = Number(value.replace(",", "."))
  return Number.isFinite(parsed) ? parsed : 0
}

function LogSheet({
  item,
  date,
  onClose,
  onLog,
}: {
  item: SupplementItem
  date: string
  onClose: () => void
  onLog: (multiplier: number) => Promise<void>
}) {
  const [multiplier, setMultiplier] = useState("1")
  const [busy, setBusy] = useState(false)
  const parsed = Math.max(0.01, numberFromInput(multiplier))
  const scaled = scaleSupplementNutrients(item.nutrientsPerServing, parsed)

  async function submit() {
    setBusy(true)
    try {
      await onLog(parsed)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/40 backdrop-blur-[4px]"
      panelClassName="mx-auto w-full max-w-sm rounded-t-[28px] bg-card shadow-[0_-20px_60px_rgba(0,0,0,0.2)]"
      panelStyle={{
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
      }}
    >
      <div className="px-4 pt-1">
        <div className="mb-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{item.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/45">
              {date} · {item.servingLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="app-icon-button h-10 w-10"
            aria-label="Close"
          >
            <X size={12} weight="bold" />
          </button>
        </div>

        <label className="grid gap-1.5">
          <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
            Serving multiplier
          </span>
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] gap-2">
            <button
              type="button"
              onClick={() =>
                setMultiplier(String(Math.max(0.25, parsed - 0.25)))
              }
              className="app-icon-button h-11 w-11"
              aria-label="Decrease"
            >
              -
            </button>
            <input
              value={multiplier}
              inputMode="decimal"
              onChange={(e) => setMultiplier(e.target.value)}
              className="h-11 rounded-xl bg-muted/45 px-3 text-center text-[16px] font-semibold outline-none"
            />
            <button
              type="button"
              onClick={() => setMultiplier(String(parsed + 0.25))}
              className="app-icon-button h-11 w-11"
              aria-label="Increase"
            >
              +
            </button>
          </div>
        </label>

        {nutrientEntries(scaled).length > 0 && (
          <div className="mt-4 rounded-[14px] bg-muted/30 p-3">
            <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
              This log adds
            </p>
            <div className="grid grid-cols-2 gap-2">
              {nutrientEntries(scaled)
                .slice(0, 8)
                .map(({ key, value, detail }) => (
                  <div key={key} className="min-w-0">
                    <p className="truncate text-[10px] text-muted-foreground/45">
                      {detail.label}
                    </p>
                    <p className="text-[12px] font-semibold tabular-nums">
                      {formatNutrientValue(value)}
                      <span className="ml-0.5 text-[9px] font-normal text-muted-foreground/35">
                        {detail.unit}
                      </span>
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="app-button app-button-primary mt-4 min-h-11 w-full"
        >
          <Check size={12} weight="bold" />
          {busy ? "Logging..." : "Log supplement"}
        </button>
      </div>
    </MobileSheet>
  )
}

function DetailSheet({
  item,
  logs,
  today,
  onClose,
  onEdit,
  onDeleteLog,
}: {
  item: SupplementItem
  logs: SupplementIntakeLog[]
  today: string
  onClose: () => void
  onEdit: () => void
  onDeleteLog: (id: string) => void
}) {
  const detail = supplementCategoryDetail(item.category)
  const consistency = supplementConsistency(item, logs, today)
  const sortedLogs = [...logs]
    .filter((log) => log.supplementId === item._id)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
    .slice(0, 30)

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/40 backdrop-blur-[4px]"
      panelClassName="mx-auto w-full max-w-lg rounded-t-[28px] bg-card shadow-[0_-20px_60px_rgba(0,0,0,0.2)] max-h-[90svh] flex flex-col"
      panelStyle={{
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
      }}
    >
      <div className="flex-1 overflow-y-auto px-4 pt-1 [&::-webkit-scrollbar]:hidden">
        <div className="mb-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-[17px] leading-tight font-semibold">
              {item.name}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/45">
              {detail.label} · {item.servingLabel}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={onEdit}
              className="app-icon-button h-10 w-10"
              aria-label="Edit"
            >
              <PencilSimple size={12} weight="bold" />
            </button>
            <button
              onClick={onClose}
              className="app-icon-button h-10 w-10"
              aria-label="Close"
            >
              <X size={12} weight="bold" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            ["This week", consistency.takenThisWeek],
            ["Streak", consistency.currentStreak],
            ["History", sortedLogs.length],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[12px] bg-muted/35 px-3 py-2">
              <p className="text-[15px] font-bold tabular-nums">{value}</p>
              <p className="mt-0.5 text-[9px] font-semibold text-muted-foreground/35">
                {label}
              </p>
            </div>
          ))}
        </div>

        {nutrientEntries(item.nutrientsPerServing).length > 0 && (
          <div className="mt-4">
            <SectionHeader title="Per Serving" sub={item.servingLabel} />
            <div className="divide-y divide-border/25 rounded-[14px] bg-muted/25 px-3">
              {nutrientEntries(item.nutrientsPerServing).map(
                ({ key, value, detail }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-[12px]">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: detail.color }}
                      />
                      <span className="truncate">{detail.label}</span>
                    </span>
                    <span className="shrink-0 text-[12px] font-semibold tabular-nums">
                      {formatSupplementNutrient(
                        key as SupplementNutrientKey,
                        value
                      )}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <SectionHeader title="History" sub={scheduleLabel(item)} />
          {sortedLogs.length === 0 ? (
            <div className="app-empty py-8">
              <CalendarBlank size={18} className="text-muted-foreground/20" />
              <p className="text-[12px] text-muted-foreground/35">
                No logs yet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/25 rounded-[14px] bg-muted/25 px-3">
              {sortedLogs.map((log) => {
                const content = (
                  <>
                    <StatePill state={log.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold">{log.date}</p>
                      <p className="text-[10px] text-muted-foreground/40">
                        {fmtTime(log.loggedAt)} · {log.servingMultiplier}x
                      </p>
                    </div>
                  </>
                )

                if (!log._id) {
                  return (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 py-2.5"
                    >
                      {content}
                    </div>
                  )
                }

                return (
                  <SlideToDeleteRow
                    key={log._id}
                    deleteLabel="Delete log"
                    onDelete={() => onDeleteLog(log._id!)}
                    rowClassName="flex items-center gap-3 bg-muted/25 py-2.5"
                  >
                    {content}
                  </SlideToDeleteRow>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </MobileSheet>
  )
}

function ConfirmDeleteSheet({
  item,
  onCancel,
  onConfirm,
}: {
  item: SupplementItem
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <MobileSheet
      onClose={onCancel}
      overlayClassName="bg-black/45 backdrop-blur-[6px]"
      panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
      panelStyle={{
        paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
      }}
    >
      <div className="px-5 pt-1 pb-4">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border/60" />
        <h2 className="text-[17px] font-bold">Delete supplement?</h2>
        <p className="mt-2 text-[13px] leading-5 text-muted-foreground/68">
          This removes{" "}
          <span className="font-semibold text-foreground">{item.name}</span>{" "}
          from your supplement list. Past logged entries stay in your history.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="h-12 w-full rounded-xl bg-destructive text-[14px] font-bold text-white transition-opacity active:opacity-80"
          >
            Delete supplement
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-12 w-full rounded-xl bg-muted text-[14px] font-bold text-foreground transition-opacity active:opacity-80"
          >
            Cancel
          </button>
        </div>
      </div>
    </MobileSheet>
  )
}

function Warnings({ totals }: { totals: SupplementNutrients }) {
  const warnings = SUPPLEMENT_SUMMARY_NUTRIENT_KEYS.filter((key) => {
    const caution = SUPPLEMENT_NUTRIENT_DETAILS[key].supplementCautionAt
    return caution && (totals[key] ?? 0) >= caution
  })

  if (warnings.length === 0) return null

  return (
    <div className="app-surface flex items-start gap-2 px-4 py-3 text-[11px] text-muted-foreground/60">
      <Warning
        size={14}
        weight="bold"
        className="mt-0.5 shrink-0 text-[var(--status-caution)]"
      />
      <p>
        Supplement intake is high for{" "}
        {warnings
          .map((key) => SUPPLEMENT_NUTRIENT_DETAILS[key].label.toLowerCase())
          .join(", ")}
        . Check labels and keep entries current.
      </p>
    </div>
  )
}

export default function Supplements() {
  const navigate = useSmoothNavigate()
  const preferences = useQuery(api.users.users.getPreferences, {})
  const activeTimezone = preferences?.lastActiveTimezone ?? "UTC"
  const todayKey = currentDateKey(activeTimezone)
  const [dateKey, setDateKey] = useState(todayKey)
  const [tab, setTab] = useState<"today" | "catalog">("today")
  const [sheet, setSheet] = useState<SheetMode>(null)
  const [confirmDeleteItem, setConfirmDeleteItem] =
    useState<SupplementItem | null>(null)

  useBottomBarAction(() => {
    setTab("catalog")
    setSheet({ kind: "edit" })
  })

  const overviewRaw = useQuery(api.logs.supplements.getOverview, {
    date: dateKey,
  })
  const overview = (overviewRaw ?? {
    items: [],
    logs: [],
    legacyEntries: [],
    recentLogs: [],
    nutritionTotals: {},
    isTrainingDay: false,
  }) as Overview

  const saveItem = useOfflineMutation(
    api.logs.supplements.saveItem,
    "logs.supplements.saveItem"
  )
  const setItemActive = useOfflineMutation(
    api.logs.supplements.setItemActive,
    "logs.supplements.setItemActive"
  )
  const removeItem = useOfflineMutation(
    api.logs.supplements.removeItem,
    "logs.supplements.removeItem"
  )
  const logTaken = useOfflineMutation(
    api.logs.supplements.logTaken,
    "logs.supplements.logTaken"
  )
  const markSkipped = useOfflineMutation(
    api.logs.supplements.markSkipped,
    "logs.supplements.markSkipped"
  )
  const removeLog = useOfflineMutation(
    api.logs.supplements.removeLog,
    "logs.supplements.removeLog"
  )
  const removeEntry = useOfflineMutation(
    api.logs.supplements.removeEntry,
    "logs.supplements.removeEntry"
  )

  const activeItems = useMemo(
    () => overview.items.filter((item) => item.active),
    [overview.items]
  )
  const dayPlan = useMemo(
    () =>
      buildSupplementDayPlan({
        items: overview.items,
        logs: overview.logs,
        date: dateKey,
        today: todayKey,
        isTrainingDay: overview.isTrainingDay,
      }),
    [dateKey, overview.isTrainingDay, overview.items, overview.logs, todayKey]
  )
  const allLogs = useMemo(
    () => [...overview.logs, ...overview.recentLogs],
    [overview.logs, overview.recentLogs]
  )
  const dateLabel = formatDateLabel(dateKey, todayKey)
  const isToday = dateKey === todayKey

  async function saveSupplement(
    id: string | undefined,
    draft: SupplementItemDraft
  ) {
    await saveItem(
      stripUndefined({
        id,
        ...draft,
        nutrientsPerServing: cleanSupplementNutrients(
          draft.nutrientsPerServing
        ),
      })
    )
  }

  function takeNow(item: SupplementItem, servingMultiplier = 1) {
    if (!item._id) return Promise.resolve()
    return logTaken({
      supplementId: item._id,
      date: dateKey,
      loggedAt: new Date().toISOString(),
      servingMultiplier,
    }) as Promise<void>
  }

  function skipItem(item: SupplementItem) {
    if (!item._id) return
    void markSkipped({
      supplementId: item._id,
      date: dateKey,
      loggedAt: new Date().toISOString(),
    })
  }

  function toggleActive(item: SupplementItem) {
    if (!item._id) return
    void setItemActive({ id: item._id, active: !item.active })
  }

  function deleteLog(logId: string) {
    void removeLog({ logId })
  }

  function deleteDayEntry(id: string) {
    void removeEntry({ date: dateKey, id })
  }

  function deleteSupplement(item: SupplementItem) {
    if (!item._id) return
    void removeItem({ id: item._id })
    setConfirmDeleteItem(null)
    if (sheet?.kind === "detail" && sheet.item._id === item._id) {
      setSheet(null)
    }
  }

  const dayLogs = overview.logs.map(supplementLogFromIntake)

  return (
    <div className="supplement-ledger-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <div className="mx-auto flex max-w-lg flex-col pb-[calc(var(--app-safe-bottom-lg)+5rem)] md:max-w-6xl md:pb-10">
        <header className="flex items-end justify-between px-5 pt-[var(--app-safe-top)] pb-4 md:px-6 md:pt-10 short-phone:pb-3">
          <div>
            <button
              type="button"
              onClick={() => navigate("/nutrition")}
              className="mb-1 flex min-h-9 items-center gap-1 rounded-full pr-3 text-[11px] font-semibold text-muted-foreground/60 transition-colors active:text-foreground"
              aria-label="Back to Nutrition"
            >
              <CaretLeft size={12} weight="bold" />
              Nutrition
            </button>
            <h1 className="text-[1.65rem] leading-[1.15] font-semibold tracking-tight short-phone:text-[1.42rem]">
              Supplements
            </h1>
          </div>

          <div className="flex items-center gap-1 pb-0.5">
            <button
              onClick={() => setDateKey((d) => offsetDateKey(d, -1))}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground/50 active:bg-foreground/[0.07] active:text-foreground"
              aria-label="Previous day"
            >
              <CaretLeft size={13} weight="bold" />
            </button>
            <span className="min-w-[56px] text-center text-[11px] font-medium text-muted-foreground/60">
              {dateLabel}
            </span>
            <button
              onClick={() => setDateKey((d) => offsetDateKey(d, 1))}
              disabled={isToday}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground/50 active:bg-foreground/[0.07] active:text-foreground disabled:opacity-20"
              aria-label="Next day"
            >
              <CaretRight size={13} weight="bold" />
            </button>
          </div>
        </header>

        <div className="px-4 md:px-6">
          <div className="grid grid-cols-2 rounded-[14px] bg-muted/35 p-1">
            {[
              ["today", "Today"],
              ["catalog", "My supplements"],
            ].map(([id, label]) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id as typeof tab)}
                  className={cn(
                    "h-9 rounded-[11px] text-[12px] font-semibold transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground/50"
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 px-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-5 md:px-6 short-phone:gap-2.5">
          {tab === "today" ? (
            <>
              <SummaryStrip
                plan={dayPlan}
                logs={overview.logs}
                legacyCount={overview.legacyEntries.length}
              />
              <Warnings totals={supplementNutrientTotals(overview.logs)} />

              <div className="md:col-span-2">
                <SectionHeader
                  title="Today Plan"
                  sub={
                    overview.isTrainingDay
                      ? "Training-day schedules are active."
                      : "Rest-day schedules are active."
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        setTab("catalog")
                        setSheet({ kind: "edit" })
                      }}
                      className="app-button app-button-secondary"
                    >
                      <Plus size={11} weight="bold" />
                      Add
                    </button>
                  }
                />
                {activeItems.length === 0 ? (
                  <div className="app-empty py-12">
                    <Pill size={22} className="text-muted-foreground/20" />
                    <p className="text-[12px] text-muted-foreground/35">
                      Add a supplement to start tracking nutrients and timing.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {dayPlan.map((plan) => (
                      <TodayRow
                        key={plan.item._id ?? plan.item.name}
                        plan={plan}
                        consistency={supplementConsistency(
                          plan.item,
                          allLogs,
                          todayKey
                        )}
                        onTake={() => void takeNow(plan.item)}
                        onCustom={() =>
                          setSheet({ kind: "log", item: plan.item })
                        }
                        onSkip={() => skipItem(plan.item)}
                        onOpen={() =>
                          setSheet({ kind: "detail", item: plan.item })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {(dayLogs.length > 0 || overview.legacyEntries.length > 0) && (
                <div className="app-surface px-4 py-3.5 md:col-span-2">
                  <SectionHeader
                    title="Timeline"
                    sub={`${dayLogs.length + overview.legacyEntries.length} supplement log${
                      dayLogs.length + overview.legacyEntries.length === 1
                        ? ""
                        : "s"
                    }`}
                  />
                  <div className="divide-y divide-border/25">
                    {[...dayLogs, ...overview.legacyEntries]
                      .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
                      .map((entry) => (
                        <SlideToDeleteRow
                          key={entry.id}
                          deleteLabel={`Delete ${entry.name ?? "supplement log"}`}
                          onDelete={() => deleteDayEntry(entry.id)}
                          rowClassName="flex items-center justify-between gap-3 bg-card py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-semibold">
                              {entry.name}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground/40">
                              {entry.status === "skipped"
                                ? "Skipped"
                                : (entry.servingLabel ?? "Logged")}{" "}
                              · {fmtTime(entry.loggedAt)}
                            </p>
                          </div>
                          <span className="shrink-0 text-[10px] font-semibold text-muted-foreground/45 tabular-nums">
                            {entry.servingMultiplier
                              ? `${formatNutrientValue(entry.servingMultiplier)}x`
                              : ""}
                          </span>
                        </SlideToDeleteRow>
                      ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="app-surface px-4 py-3.5 md:col-span-2">
                <SectionHeader
                  title="My Supplements"
                  sub={`${overview.items.length} saved · ${activeItems.length} active`}
                  action={
                    <button
                      type="button"
                      onClick={() => setSheet({ kind: "edit" })}
                      className="app-button app-button-primary"
                    >
                      <Plus size={11} weight="bold" />
                      Add
                    </button>
                  }
                />
                {overview.items.length === 0 ? (
                  <div className="app-empty py-12">
                    <Barcode size={22} className="text-muted-foreground/20" />
                    <p className="text-[12px] text-muted-foreground/35">
                      Create one manually or import from a barcode.
                    </p>
                  </div>
                ) : (
                  <div>
                    {overview.items.map((item) => (
                      <CatalogRow
                        key={item._id ?? item.name}
                        item={item}
                        consistency={supplementConsistency(
                          item,
                          allLogs,
                          todayKey
                        )}
                        onEdit={() => setSheet({ kind: "edit", item })}
                        onOpen={() => setSheet({ kind: "detail", item })}
                        onQuickLog={() => void takeNow(item)}
                        onToggleActive={() => toggleActive(item)}
                        onDelete={() => setConfirmDeleteItem(item)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {confirmDeleteItem && (
        <ConfirmDeleteSheet
          item={confirmDeleteItem}
          onCancel={() => setConfirmDeleteItem(null)}
          onConfirm={() => deleteSupplement(confirmDeleteItem)}
        />
      )}

      {sheet?.kind === "edit" && (
        <ItemSheet
          item={sheet.item}
          onClose={() => setSheet(null)}
          onSave={saveSupplement}
        />
      )}
      {sheet?.kind === "log" && (
        <LogSheet
          item={sheet.item}
          date={dateKey}
          onClose={() => setSheet(null)}
          onLog={(multiplier) => takeNow(sheet.item, multiplier)}
        />
      )}
      {sheet?.kind === "detail" && (
        <DetailSheet
          item={sheet.item}
          logs={allLogs}
          today={todayKey}
          onClose={() => setSheet(null)}
          onEdit={() => setSheet({ kind: "edit", item: sheet.item })}
          onDeleteLog={deleteLog}
        />
      )}
    </div>
  )
}
