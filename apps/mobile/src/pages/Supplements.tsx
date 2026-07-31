import React, { useMemo, useState } from "react"
import {
  Barcode,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Check,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { toast } from "@repo/ui"
import type { Id } from "../../../../convex/_generated/dataModel"
import { FoodDetailSheet } from "@/components/food-detail-sheet"
import { MobileSheet } from "@/components/mobile-sheet"
import { SlideToDeleteRow } from "@repo/ui"
import { useBottomBarAction } from "@/components/bottom-bar"
import { AnimatedAccordion } from "@repo/ui"
import { useSmoothNavigate } from "@/lib/navigation"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
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
  loggableSupplementPlanItems,
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
import { hapticSelection } from "@/lib/haptics"
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
  { id: 1, label: "M", full: "Monday" },
  { id: 2, label: "T", full: "Tuesday" },
  { id: 3, label: "W", full: "Wednesday" },
  { id: 4, label: "T", full: "Thursday" },
  { id: 5, label: "F", full: "Friday" },
  { id: 6, label: "S", full: "Saturday" },
  { id: 0, label: "S", full: "Sunday" },
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
        "text-[13px] font-semibold tabular-nums",
        state === "taken" && "text-[var(--accent-supplement)]",
        state === "missed" && "text-destructive",
        state === "skipped" && "text-muted-foreground",
        (state === "due" || state === "unscheduled") && "text-muted-foreground"
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
  dateLabel,
  isToday,
}: {
  plan: ReturnType<typeof buildSupplementDayPlan>
  logs: SupplementIntakeLog[]
  legacyCount: number
  dateLabel: string
  isToday: boolean
}) {
  const taken = plan.filter((item) => item.state === "taken").length
  const due = plan.filter((item) => item.state === "due").length
  const missed = plan.filter((item) => item.state === "missed").length
  const scheduled = plan.filter((item) => item.isScheduled).length
  const totalLogs = logs.length + legacyCount

  return (
    <section
      className="border-y border-border py-5 md:col-span-2"
      aria-labelledby="supplement-summary-title"
    >
      <p className="text-[13px] font-medium text-muted-foreground">
        {isToday ? "Today’s adherence" : `${dateLabel} adherence`}
      </p>
      <h2
        id="supplement-summary-title"
        className="mt-1 text-[1.75rem] leading-tight font-bold tracking-tight"
      >
        {scheduled === 0
          ? "No supplements scheduled"
          : `${taken} of ${scheduled} taken`}
      </h2>
      <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
        {scheduled === 0
          ? `Add a schedule in My supplements to build ${isToday ? "today’s" : "this day’s"} plan.`
          : due > 0
            ? `${due} still due${missed > 0 ? ` · ${missed} missed` : ""}`
            : missed > 0
              ? `${missed} missed today`
              : "Everything scheduled is accounted for."}
      </p>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-4">
        {[
          ["Taken", taken],
          ["Due", due],
          ["Logs", totalLogs],
        ].map(([label, value]) => (
          <div key={label} className="px-3 first:pl-0 last:pr-0">
            <dt className="text-[13px] text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-[18px] font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function TodayRow({
  plan,
  consistency,
  onTake,
  onCustom,
  onSkip,
  onOpen,
  taking,
  recentlyLogged,
}: {
  plan: ReturnType<typeof buildSupplementDayPlan>[number]
  consistency: ReturnType<typeof supplementConsistency>
  onTake: () => void
  onCustom: () => void
  onSkip: () => void
  onOpen: () => void
  taking: boolean
  recentlyLogged: boolean
}) {
  const { item, state, logs } = plan
  const latest = [...logs].sort((a, b) =>
    b.loggedAt.localeCompare(a.loggedAt)
  )[0]
  const shownNutrients = nutrientEntries(
    scaleSupplementNutrients(item.nutrientsPerServing, 1)
  ).slice(0, 3)

  return (
    <div
      className={cn(
        "motion-list-row border-b border-border py-4 last:border-b-0",
        recentlyLogged && "motion-success-pop"
      )}
    >
      <div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="motion-tactile-subtle min-w-0 text-left"
            >
              <p className="truncate text-[16px] leading-tight font-semibold">
                {item.name}
              </p>
              <p className="mt-1 truncate text-[13px] text-muted-foreground">
                {item.brand ? `${item.brand} · ` : ""}
                {item.servingLabel}
                {item.schedule.preferredTime
                  ? ` · ${item.schedule.preferredTime}`
                  : ""}
              </p>
            </button>
            <StatePill state={state} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            <span className="font-medium tabular-nums">
              {consistency.takenThisWeek} taken this week
            </span>
            <span className="font-medium tabular-nums">
              {consistency.currentStreak} day streak
            </span>
            {latest && (
              <span className="font-medium tabular-nums">
                Last logged {fmtTime(latest.loggedAt)}
              </span>
            )}
          </div>

          {shownNutrients.length > 0 && (
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
              {shownNutrients.map(({ key, value, detail }) => (
                <span key={key} className="mr-3 inline-block tabular-nums">
                  {detail.label} {formatNutrientValue(value)}
                  {detail.unit}
                </span>
              ))}
            </p>
          )}

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <button
              type="button"
              onClick={onTake}
              disabled={state === "taken" || taking}
              aria-busy={taking}
              className="app-button app-button-primary motion-tactile min-h-11 disabled:opacity-45"
            >
              <Check size={12} weight="bold" />
              {taking
                ? "Logging..."
                : state === "taken"
                  ? "Taken"
                  : "Taken now"}
            </button>
            <button
              type="button"
              onClick={onCustom}
              className="app-button app-button-quiet motion-tactile min-h-11 px-3"
              aria-label={`Custom log ${item.name}`}
            >
              Custom
            </button>
            <button
              type="button"
              onClick={onSkip}
              disabled={
                !plan.isScheduled || state === "taken" || state === "skipped"
              }
              className="app-button app-button-quiet motion-tactile min-h-11 px-3 disabled:opacity-25"
              aria-label={`Mark ${item.name} skipped`}
            >
              Skip
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
  quickLogging,
  recentlyLogged,
}: {
  item: SupplementItem
  consistency: ReturnType<typeof supplementConsistency>
  onEdit: () => void
  onOpen: () => void
  onQuickLog: () => void
  onToggleActive: () => void
  onDelete: () => void
  quickLogging: boolean
  recentlyLogged: boolean
}) {
  const detail = supplementCategoryDetail(item.category)
  const nutrientCount = Object.values(item.nutrientsPerServing ?? {}).filter(
    (value) => typeof value === "number" && value > 0
  ).length

  return (
    <div className="motion-list-row border-b border-border py-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="motion-tactile-subtle min-w-0 flex-1 text-left"
        >
          <p className="truncate text-[16px] font-semibold text-foreground">
            {item.name}
          </p>
          <p className="mt-1 truncate text-[13px] text-muted-foreground">
            {detail.label} · {scheduleLabel(item)} · {nutrientCount} nutrient
            {nutrientCount === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
            {consistency.lastTaken
              ? `Last ${consistency.lastTaken}`
              : "No history yet"}
          </p>
        </button>
        <button
          type="button"
          onClick={onToggleActive}
          className={cn(
            "min-h-11 shrink-0 px-3 text-[13px] font-semibold",
            item.active
              ? "text-[var(--accent-supplement)]"
              : "text-muted-foreground"
          )}
          aria-label={`${item.active ? "Pause" : "Track"} ${item.name}`}
        >
          {item.active ? "Tracking" : "Paused"}
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 divide-x divide-border border-t border-border">
        <button
          type="button"
          onClick={onQuickLog}
          disabled={quickLogging}
          aria-busy={quickLogging}
          className={cn(
            "motion-tactile flex min-h-11 items-center justify-center gap-2 text-[13px] font-semibold disabled:opacity-45",
            recentlyLogged && "motion-success-pop"
          )}
          aria-label={`Log ${item.name}`}
        >
          {quickLogging ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground/25 border-t-foreground/70" />
          ) : (
            <Check size={14} weight="bold" />
          )}
          Log
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="motion-tactile flex min-h-11 items-center justify-center gap-2 text-[13px] font-semibold text-muted-foreground"
          aria-label={`Edit ${item.name}`}
        >
          <PencilSimple size={14} weight="bold" />
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex min-h-11 items-center justify-center gap-2 text-[13px] font-semibold text-destructive active:bg-destructive/10"
          aria-label={`Delete ${item.name}`}
        >
          <Trash size={14} weight="bold" />
          Delete
        </button>
      </div>
    </div>
  )
}

function ImportNotice({ imported }: { imported: boolean }) {
  if (!imported) return null
  return (
    <div className="mb-3 flex items-start gap-2 border-y border-border py-3 text-[13px] leading-5 text-muted-foreground">
      <Barcode size={13} weight="bold" className="mt-0.5 shrink-0" />
      <span>
        Data from USDA FoodData Central. Nutrients are read-only and scale from
        the serving size you enter.
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
    if (searchBusy) return
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
      if (results.length === 0) setSearchError("No results found.")
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
    if (importingCode) return
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
    if (barcodeBusy) return
    const code = draft.barcode?.trim()
    if (!code) return
    setBarcodeBusy(true)
    setBarcodeError(null)
    try {
      const detail = await getFoodDetail(code)
      if (!detail) {
        setBarcodeError("No product found.")
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
    if (saving) return
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
      ? "Search foods"
      : entryMode === "manual"
        ? "Custom supplement"
        : "Add supplement"

  return (
    <>
      <MobileSheet
        onClose={saving ? () => {} : onClose}
        closeOnBackdrop={!saving}
        showHandle={!saving}
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
                disabled={
                  saving || !draft.name.trim() || !draft.servingLabel.trim()
                }
                aria-busy={saving}
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
              type="button"
              onClick={saving ? undefined : onClose}
              disabled={saving}
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
                  <span className="mt-1 block truncate text-[13px] text-muted-foreground">
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
                    Search foods
                  </span>
                  <span className="mt-1 block truncate text-[13px] text-muted-foreground">
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
                  <span className="text-[13px] font-medium text-muted-foreground">
                    Product search
                  </span>
                  <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2">
                    <input
                      name="supplement-product-search"
                      aria-label="Supplement product search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Creatine, whey, magnesium..."
                      className="h-11 min-w-0 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                    />
                    <button
                      type="submit"
                      disabled={searchBusy}
                      aria-busy={searchBusy}
                      className="app-icon-button h-11 w-11 disabled:opacity-40"
                      aria-label="Search foods"
                    >
                      <MagnifyingGlass size={14} weight="bold" />
                    </button>
                  </div>
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[13px] font-medium text-muted-foreground">
                    Barcode
                  </span>
                  <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2">
                    <input
                      name="supplement-product-barcode"
                      aria-label="Supplement product barcode"
                      value={draft.barcode ?? ""}
                      inputMode="numeric"
                      onChange={(e) => update("barcode", e.target.value)}
                      className="h-11 min-w-0 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                    />
                    <button
                      type="button"
                      onClick={importBarcode}
                      disabled={barcodeBusy}
                      aria-busy={barcodeBusy}
                      className="app-icon-button h-11 w-11 disabled:opacity-40"
                      aria-label="Lookup barcode"
                    >
                      <Barcode size={14} weight="bold" />
                    </button>
                  </div>
                </label>
              </form>

              {(searchError || barcodeError) && (
                <p className="border-y border-destructive/30 bg-destructive/10 px-3 py-3 text-[13px] text-destructive">
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
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-muted/45 text-muted-foreground">
                            <Barcode size={14} weight="bold" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold">
                            {result.name}
                          </p>
                          <p className="mt-1 truncate text-[13px] text-muted-foreground">
                            {result.brand ? `${result.brand} · ` : ""}
                            {result.serving}
                          </p>
                          <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
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
                        disabled={importingCode !== null}
                        aria-busy={importingCode === result.code}
                        className="app-button app-button-secondary min-h-11 shrink-0 px-3 disabled:opacity-45"
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
                  Search foods
                </button>
              )}

              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-medium text-muted-foreground">
                    Name
                  </span>
                  <input
                    name="supplement-name"
                    aria-label="Supplement name"
                    value={draft.name}
                    onChange={(e) => update("name", e.target.value)}
                    className="h-11 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1.5">
                    <span className="text-[13px] font-medium text-muted-foreground">
                      Brand
                    </span>
                    <input
                      name="supplement-brand"
                      aria-label="Supplement brand"
                      value={draft.brand ?? ""}
                      onChange={(e) => update("brand", e.target.value)}
                      className="h-11 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[13px] font-medium text-muted-foreground">
                      Barcode
                    </span>
                    <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2">
                      <input
                        name="supplement-barcode"
                        aria-label="Supplement barcode"
                        value={draft.barcode ?? ""}
                        inputMode="numeric"
                        onChange={(e) => update("barcode", e.target.value)}
                        className="h-11 min-w-0 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                      />
                      <button
                        type="button"
                        onClick={importBarcode}
                        disabled={barcodeBusy}
                        aria-busy={barcodeBusy}
                        className="app-icon-button h-11 w-11 disabled:opacity-40"
                        aria-label="Lookup barcode"
                      >
                        <Barcode size={14} weight="bold" />
                      </button>
                    </div>
                  </label>
                </div>

                {barcodeError && (
                  <p className="border-y border-destructive/30 bg-destructive/10 px-3 py-3 text-[13px] text-destructive">
                    {barcodeError}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1.5">
                    <span className="text-[13px] font-medium text-muted-foreground">
                      Category
                    </span>
                    <select
                      name="supplement-category"
                      aria-label="Supplement category"
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
                    <span className="text-[13px] font-medium text-muted-foreground">
                      Form
                    </span>
                    <select
                      name="supplement-form"
                      aria-label="Supplement form"
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
                  <span className="text-[13px] font-medium text-muted-foreground">
                    Serving size
                  </span>
                  <input
                    name="supplement-serving-size"
                    aria-label="Supplement serving size"
                    value={draft.servingLabel}
                    placeholder={servingLabelForForm(draft.form)}
                    onChange={(e) => updateServingLabel(e.target.value)}
                    className="h-11 rounded-xl bg-muted/45 px-3 text-[13px] outline-none"
                  />
                </label>

                <ScheduleEditor draft={draft} update={update} />

                <AnimatedAccordion
                  className="rounded-[16px] border border-border/35 bg-muted/15"
                  triggerClassName="px-3 py-3"
                  summary={
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-muted-foreground">
                        Advanced
                      </span>
                      <span className="mt-1 block truncate text-[13px] text-muted-foreground">
                        {nutrientCount > 0
                          ? `${nutrientCount} ${
                              nutrientCount === 1 ? "nutrient" : "nutrients"
                            } per serving`
                          : "Optional nutrients per serving"}
                      </span>
                    </span>
                  }
                >
                  <div className="border-t border-border/25 px-3 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[13px] font-medium text-muted-foreground">
                        Nutrients per serving
                      </p>
                      <span className="text-[13px] text-muted-foreground">
                        Read-only
                      </span>
                    </div>
                    {draft.source === "openfoodfacts" && (
                      <p className="mb-2 border-y border-border bg-muted/35 px-3 py-3 text-[13px] text-muted-foreground">
                        Imported nutrients stay locked and recalculate from your
                        serving size.
                      </p>
                    )}
                    {advancedNutrients.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                        {advancedNutrients.map(({ key, value, detail }) => (
                          <div
                            key={key}
                            className="grid gap-1 rounded-xl bg-muted/35 px-2.5 py-2"
                          >
                            <span className="truncate text-[13px] font-medium text-muted-foreground">
                              {detail.label}
                            </span>
                            <span className="text-[15px] font-semibold tabular-nums">
                              {formatSupplementNutrient(key, value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="border-y border-border bg-muted/30 px-3 py-4 text-center text-[15px] text-muted-foreground">
                        No nutrient data for this supplement.
                      </p>
                    )}
                  </div>
                </AnimatedAccordion>

                <label className="grid gap-1.5">
                  <span className="text-[13px] font-medium text-muted-foreground">
                    Notes
                  </span>
                  <textarea
                    name="supplement-notes"
                    aria-label="Supplement notes"
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
          <span className="text-[13px] font-medium text-muted-foreground">
            Schedule
          </span>
          <select
            name="supplement-schedule-type"
            aria-label="Supplement schedule"
            value={draft.schedule.type}
            onChange={(e) =>
              setSchedule({ type: e.target.value as SupplementScheduleType })
            }
            className="h-11 rounded-xl bg-background/80 px-3 text-[15px] outline-none"
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
          <span className="text-[13px] font-medium text-muted-foreground">
            Time
          </span>
          <input
            type="time"
            name="supplement-preferred-time"
            aria-label="Supplement preferred time"
            value={draft.schedule.preferredTime ?? ""}
            onChange={(e) => setSchedule({ preferredTime: e.target.value })}
            className="h-11 rounded-xl bg-background/80 px-2 text-[15px] outline-none"
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
                aria-pressed={active}
                aria-label={`${active ? "Remove" : "Add"} ${day.full} schedule day`}
                className={cn(
                  "h-11 text-[13px] font-semibold",
                  active
                    ? "bg-foreground text-background"
                    : "bg-background/70 text-muted-foreground"
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
            <p className="mt-1 truncate text-[13px] text-muted-foreground">
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
          <span className="text-[13px] font-medium text-muted-foreground">
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
              name="supplement-serving-multiplier"
              aria-label="Supplement serving multiplier"
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
            <p className="mb-2 text-[13px] font-medium text-muted-foreground">
              This log adds
            </p>
            <div className="grid grid-cols-2 gap-2">
              {nutrientEntries(scaled)
                .slice(0, 8)
                .map(({ key, value, detail }) => (
                  <div key={key} className="min-w-0">
                    <p className="truncate text-[13px] text-muted-foreground">
                      {detail.label}
                    </p>
                    <p className="text-[15px] font-semibold tabular-nums">
                      {formatNutrientValue(value)}
                      <span className="ml-1 text-[13px] font-normal text-muted-foreground">
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
            <p className="mt-1 truncate text-[13px] text-muted-foreground">
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
              <p className="mt-1 text-[13px] font-medium text-muted-foreground">
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
                    <span className="flex min-w-0 items-center gap-2 text-[15px]">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: detail.color }}
                      />
                      <span className="truncate">{detail.label}</span>
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums">
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
              <CalendarBlank size={18} className="text-muted-foreground" />
              <p className="text-[15px] text-muted-foreground">No logs yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/25 rounded-[14px] bg-muted/25 px-3">
              {sortedLogs.map((log) => {
                const content = (
                  <>
                    <StatePill state={log.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{log.date}</p>
                      <p className="text-[13px] text-muted-foreground">
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
  onConfirm: () => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      await onConfirm()
    } catch (error) {
      reportOfflineMutationError(error)
      setDeleting(false)
    }
  }

  return (
    <MobileSheet
      onClose={deleting ? () => {} : onCancel}
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
            onClick={() => void confirmDelete()}
            disabled={deleting}
            aria-busy={deleting}
            className="h-12 w-full rounded-xl bg-destructive text-[14px] font-bold text-white transition-opacity active:opacity-80 disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete supplement"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="h-12 w-full rounded-xl bg-muted text-[14px] font-bold text-foreground transition-opacity active:opacity-80 disabled:opacity-50"
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
    <div className="flex items-start gap-3 border-y border-border py-4 text-[15px] leading-6 text-muted-foreground md:col-span-2">
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
  const [bulkLogging, setBulkLogging] = useState(false)
  const [quickLoggingId, setQuickLoggingId] = useState<string | null>(null)
  const [loggedFeedbackId, setLoggedFeedbackId] = useState<string | null>(null)
  const [bulkLoggedFeedback, setBulkLoggedFeedback] = useState(false)
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
  const overviewLoading = overviewRaw === undefined

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
  const remainingScheduledPlans = useMemo(
    () => loggableSupplementPlanItems(dayPlan),
    [dayPlan]
  )
  const remainingScheduledCount = remainingScheduledPlans.length
  const dateLabel = formatDateLabel(dateKey, todayKey)
  const isToday = dateKey === todayKey

  async function saveSupplement(
    id: string | undefined,
    draft: SupplementItemDraft
  ) {
    await saveItem(
      stripUndefined({
        id: id as Id<"supplementItems"> | undefined,
        ...draft,
        nutrientsPerServing: cleanSupplementNutrients(
          draft.nutrientsPerServing
        ),
      })
    )
  }

  async function takeNow(item: SupplementItem, servingMultiplier = 1) {
    if (!item._id || quickLoggingId !== null) return
    const supplementId = item._id
    setQuickLoggingId(supplementId)
    try {
      await logTaken({
        supplementId: supplementId as Id<"supplementItems">,
        date: dateKey,
        loggedAt: new Date().toISOString(),
        servingMultiplier,
      })
      hapticSelection()
      setLoggedFeedbackId(supplementId)
      window.setTimeout(() => setLoggedFeedbackId(null), 520)
    } finally {
      setQuickLoggingId(null)
    }
  }

  async function takeRemainingScheduled() {
    if (bulkLogging || remainingScheduledPlans.length === 0) return

    setBulkLogging(true)
    try {
      const loggedAt = new Date().toISOString()
      for (const plan of remainingScheduledPlans) {
        if (!plan.item._id) continue
        await logTaken({
          supplementId: plan.item._id as Id<"supplementItems">,
          date: dateKey,
          loggedAt,
          servingMultiplier: 1,
        })
      }
      toast.success(
        `${remainingScheduledPlans.length} supplement${
          remainingScheduledPlans.length === 1 ? "" : "s"
        } logged`
      )
      hapticSelection()
      setBulkLoggedFeedback(true)
      window.setTimeout(() => setBulkLoggedFeedback(false), 520)
    } catch {
      toast.error("Could not log remaining supplements")
    } finally {
      setBulkLogging(false)
    }
  }

  function skipItem(item: SupplementItem) {
    if (!item._id) return
    void markSkipped({
      supplementId: item._id as Id<"supplementItems">,
      date: dateKey,
      loggedAt: new Date().toISOString(),
    }).catch(reportOfflineMutationError)
  }

  function toggleActive(item: SupplementItem) {
    if (!item._id) return
    void setItemActive({
      id: item._id as Id<"supplementItems">,
      active: !item.active,
    }).catch(reportOfflineMutationError)
  }

  function deleteLog(logId: string) {
    void removeLog({ logId: logId as Id<"supplementIntakeLogs"> }).catch(
      reportOfflineMutationError
    )
  }

  function deleteDayEntry(id: string) {
    void removeEntry({ date: dateKey, id }).catch(reportOfflineMutationError)
  }

  async function deleteSupplement(item: SupplementItem) {
    if (!item._id) return
    await removeItem({ id: item._id as Id<"supplementItems"> })
    setConfirmDeleteItem(null)
    if (sheet?.kind === "detail" && sheet.item._id === item._id) {
      setSheet(null)
    }
  }

  const dayLogs = overview.logs.map(supplementLogFromIntake)

  return (
    <div className="supplement-ledger-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <div className="mx-auto flex w-full max-w-lg flex-col pb-[calc(var(--app-safe-bottom-lg)+6.5rem)] md:max-w-6xl md:pb-10">
        <header className="flex items-end justify-between px-[var(--app-page-x)] pt-[var(--app-safe-top)] pb-5 md:px-6 md:pt-10 short-phone:pb-4">
          <div>
            <button
              type="button"
              onClick={() => navigate("/nutrition")}
              className="mb-1 flex min-h-11 items-center gap-1 pr-3 text-[13px] font-medium text-muted-foreground transition-colors active:text-foreground"
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
              className="flex h-11 w-11 items-center justify-center text-muted-foreground active:bg-muted active:text-foreground"
              aria-label="Previous day"
            >
              <CaretLeft size={13} weight="bold" />
            </button>
            <span className="min-w-[72px] text-center text-[13px] font-medium text-muted-foreground">
              {dateLabel}
            </span>
            <button
              onClick={() => setDateKey((d) => offsetDateKey(d, 1))}
              disabled={isToday}
              className="flex h-11 w-11 items-center justify-center text-muted-foreground active:bg-muted active:text-foreground disabled:opacity-30"
              aria-label="Next day"
            >
              <CaretRight size={13} weight="bold" />
            </button>
          </div>
        </header>

        <div className="px-[var(--app-page-x)] md:px-6">
          <div
            className="grid grid-cols-2 border-b border-border"
            role="tablist"
            aria-label="Supplement views"
          >
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
                    "min-h-11 border-b-2 text-[15px] font-semibold transition-colors",
                    active
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground"
                  )}
                  role="tab"
                  aria-selected={active}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4 px-[var(--app-page-x)] md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-5 md:px-6 short-phone:gap-3">
          {tab === "today" ? (
            <>
              <SummaryStrip
                plan={dayPlan}
                logs={overview.logs}
                legacyCount={overview.legacyEntries.length}
                dateLabel={dateLabel}
                isToday={dateKey === todayKey}
              />
              <Warnings totals={supplementNutrientTotals(overview.logs)} />

              <div className="md:col-span-2">
                <SectionHeader
                  title={
                    dateKey === todayKey ? "Today’s plan" : `${dateLabel} plan`
                  }
                  sub={
                    overview.isTrainingDay
                      ? "Training-day schedules are active."
                      : "Rest-day schedules are active."
                  }
                  action={
                    <div className="flex shrink-0 items-center gap-2">
                      {remainingScheduledCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            void takeRemainingScheduled().catch(
                              reportOfflineMutationError
                            )
                          }
                          disabled={bulkLogging}
                          aria-busy={bulkLogging}
                          className={cn(
                            "app-button app-button-primary motion-tactile px-3 disabled:opacity-45",
                            bulkLoggedFeedback && "motion-success-pop"
                          )}
                          aria-label={`Log ${remainingScheduledCount} remaining scheduled supplement${
                            remainingScheduledCount === 1 ? "" : "s"
                          }`}
                        >
                          <Check size={11} weight="bold" />
                          {bulkLogging
                            ? "Logging"
                            : `Take ${remainingScheduledCount}`}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTab("catalog")
                          setSheet({ kind: "edit" })
                        }}
                        className="app-button app-button-secondary motion-tactile"
                      >
                        <Plus size={11} weight="bold" />
                        Add
                      </button>
                    </div>
                  }
                />
                {overviewLoading ? (
                  <div
                    className="border-y border-border py-8 text-[15px] text-muted-foreground"
                    role="status"
                  >
                    Loading today’s supplements…
                  </div>
                ) : activeItems.length === 0 ? (
                  <div className="border-y border-border py-8">
                    <h3 className="text-[16px] font-semibold">
                      No supplements to take
                    </h3>
                    <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
                      Add a supplement and choose its schedule to see it here.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setTab("catalog")
                        setSheet({ kind: "edit" })
                      }}
                      className="app-button app-button-primary mt-4 min-h-11"
                    >
                      Add supplement
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-border border-y border-border">
                    {dayPlan.map((plan) => (
                      <TodayRow
                        key={plan.item._id ?? plan.item.name}
                        plan={plan}
                        consistency={supplementConsistency(
                          plan.item,
                          allLogs,
                          todayKey
                        )}
                        onTake={() =>
                          void takeNow(plan.item).catch(
                            reportOfflineMutationError
                          )
                        }
                        taking={quickLoggingId === plan.item._id}
                        recentlyLogged={loggedFeedbackId === plan.item._id}
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
                <section className="border-y border-border py-5 md:col-span-2">
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
                            <p className="truncate text-[15px] font-semibold">
                              {entry.name}
                            </p>
                            <p className="mt-1 text-[13px] text-muted-foreground">
                              {entry.status === "skipped"
                                ? "Skipped"
                                : (entry.servingLabel ?? "Logged")}{" "}
                              · {fmtTime(entry.loggedAt)}
                            </p>
                          </div>
                          <span className="shrink-0 text-[13px] font-medium text-muted-foreground tabular-nums">
                            {entry.servingMultiplier
                              ? `${formatNutrientValue(entry.servingMultiplier)}x`
                              : ""}
                          </span>
                        </SlideToDeleteRow>
                      ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              <section className="border-y border-border py-5 md:col-span-2">
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
                {overviewLoading ? (
                  <div
                    className="py-8 text-[15px] text-muted-foreground"
                    role="status"
                  >
                    Loading your supplements…
                  </div>
                ) : overview.items.length === 0 ? (
                  <div className="py-8">
                    <h3 className="text-[16px] font-semibold">
                      Your supplement library is empty
                    </h3>
                    <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
                      Add a product manually, search by name, or scan its
                      barcode.
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
                        onQuickLog={() =>
                          void takeNow(item).catch(reportOfflineMutationError)
                        }
                        quickLogging={quickLoggingId === item._id}
                        recentlyLogged={loggedFeedbackId === item._id}
                        onToggleActive={() => toggleActive(item)}
                        onDelete={() => setConfirmDeleteItem(item)}
                      />
                    ))}
                  </div>
                )}
              </section>
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
          onLog={(multiplier) =>
            takeNow(sheet.item, multiplier).catch(reportOfflineMutationError)
          }
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
