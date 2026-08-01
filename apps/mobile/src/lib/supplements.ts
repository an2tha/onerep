import type {
  FoodDetail,
  FoodResult,
  NutrientRow,
  SupplementCategory,
  SupplementForm,
  SupplementIntakeLog,
  SupplementIntakeStatus,
  SupplementItem,
  SupplementNutrients,
  SupplementSchedule,
  SupplementScheduleType,
} from "@repo/models"
import {
  APP_ACCENT_COLORS,
  MACRO_COLORS,
  MICRO_COLORS,
  ONE_REP_PALETTE,
  SUPPLEMENT_TONES,
  tint,
} from "@repo/ui"
import {
  FOOD_MICRONUTRIENT_KEYS,
  parseFoodPortionLabel,
  type FoodMicronutrientKey,
} from "./food-log"

export type {
  SupplementCategory,
  SupplementForm,
  SupplementIntakeLog,
  SupplementIntakeStatus,
  SupplementItem,
  SupplementNutrients,
  SupplementSchedule,
  SupplementScheduleType,
} from "@repo/models"

export const SUPPLEMENT_KINDS = [
  "creatine",
  "protein",
  "vitamins",
  "caffeine",
] as const

export type SupplementKind = (typeof SUPPLEMENT_KINDS)[number]
export type SupplementUnit = "g" | "mg" | "serving"

export type SupplementLogEntry = {
  id: string
  kind: SupplementKind
  amount: number
  unit: SupplementUnit
  loggedAt: string
  note?: string
  category?: SupplementCategory
  supplementId?: string
  name?: string
  brand?: string
  status?: SupplementIntakeStatus
  servingMultiplier?: number
  servingLabel?: string
  nutrients?: SupplementNutrients
}

export type SupplementDefinition = {
  kind: SupplementKind
  label: string
  shortLabel: string
  defaultAmount: number
  unit: SupplementUnit
  color: string
  bg: string
}

export const SUPPLEMENT_DEFINITIONS: Record<
  SupplementKind,
  SupplementDefinition
> = {
  creatine: {
    kind: "creatine",
    label: "Creatine",
    shortLabel: "Creatine",
    defaultAmount: 5,
    unit: "g",
    color: SUPPLEMENT_TONES.creatine.color,
    bg: SUPPLEMENT_TONES.creatine.bg,
  },
  protein: {
    kind: "protein",
    label: "Protein",
    shortLabel: "Protein",
    defaultAmount: 25,
    unit: "g",
    color: SUPPLEMENT_TONES.protein.color,
    bg: SUPPLEMENT_TONES.protein.bg,
  },
  vitamins: {
    kind: "vitamins",
    label: "Vitamins",
    shortLabel: "Vits",
    defaultAmount: 1,
    unit: "serving",
    color: SUPPLEMENT_TONES.vitamins.color,
    bg: SUPPLEMENT_TONES.vitamins.bg,
  },
  caffeine: {
    kind: "caffeine",
    label: "Caffeine",
    shortLabel: "Caffeine",
    defaultAmount: 100,
    unit: "mg",
    color: SUPPLEMENT_TONES.caffeine.color,
    bg: SUPPLEMENT_TONES.caffeine.bg,
  },
}

export const SUPPLEMENT_LIST = SUPPLEMENT_KINDS.map(
  (kind) => SUPPLEMENT_DEFINITIONS[kind]
)

export const SUPPLEMENT_CATEGORIES: {
  id: SupplementCategory
  label: string
  shortLabel: string
  color: string
  bg: string
  defaultForm: SupplementForm
  defaultServingLabel: string
}[] = [
  {
    id: "protein",
    label: "Protein",
    shortLabel: "Protein",
    color: MACRO_COLORS.protein,
    bg: tint(MACRO_COLORS.protein, 13),
    defaultForm: "powder",
    defaultServingLabel: "1 scoop",
  },
  {
    id: "creatine",
    label: "Creatine",
    shortLabel: "Creatine",
    color: SUPPLEMENT_TONES.creatine.color,
    bg: SUPPLEMENT_TONES.creatine.bg,
    defaultForm: "powder",
    defaultServingLabel: "5 g",
  },
  {
    id: "multivitamin",
    label: "Multivitamin",
    shortLabel: "Multi",
    color: ONE_REP_PALETTE.violet,
    bg: tint(ONE_REP_PALETTE.violet, 13),
    defaultForm: "tablet",
    defaultServingLabel: "1 tablet",
  },
  {
    id: "vitamin_mineral",
    label: "Vitamin/mineral",
    shortLabel: "Vitamin",
    color: MICRO_COLORS.vitaminD,
    bg: tint(MICRO_COLORS.vitaminD, 13),
    defaultForm: "capsule",
    defaultServingLabel: "1 capsule",
  },
  {
    id: "electrolyte",
    label: "Electrolyte",
    shortLabel: "Electrolyte",
    color: MICRO_COLORS.sodium,
    bg: tint(MICRO_COLORS.sodium, 13),
    defaultForm: "powder",
    defaultServingLabel: "1 scoop",
  },
  {
    id: "caffeine_pre_workout",
    label: "Caffeine/pre-workout",
    shortLabel: "Pre-workout",
    color: SUPPLEMENT_TONES.caffeine.color,
    bg: SUPPLEMENT_TONES.caffeine.bg,
    defaultForm: "powder",
    defaultServingLabel: "1 scoop",
  },
  {
    id: "omega_3",
    label: "Omega-3",
    shortLabel: "Omega-3",
    color: ONE_REP_PALETTE.plate,
    bg: tint(ONE_REP_PALETTE.plate, 13),
    defaultForm: "softgel",
    defaultServingLabel: "2 softgels",
  },
  {
    id: "fiber",
    label: "Fiber",
    shortLabel: "Fiber",
    color: MICRO_COLORS.fiber,
    bg: tint(MICRO_COLORS.fiber, 13),
    defaultForm: "powder",
    defaultServingLabel: "1 scoop",
  },
  {
    id: "other",
    label: "Other",
    shortLabel: "Other",
    color: APP_ACCENT_COLORS.neutral,
    bg: tint(APP_ACCENT_COLORS.neutral, 12),
    defaultForm: "other",
    defaultServingLabel: "1 serving",
  },
]

export const SUPPLEMENT_FORMS: { id: SupplementForm; label: string }[] = [
  { id: "capsule", label: "Capsule" },
  { id: "tablet", label: "Tablet" },
  { id: "powder", label: "Powder" },
  { id: "liquid", label: "Liquid" },
  { id: "gummy", label: "Gummy" },
  { id: "softgel", label: "Softgel" },
  { id: "other", label: "Other" },
]

export const SUPPLEMENT_SCHEDULES: {
  id: SupplementScheduleType
  label: string
}[] = [
  { id: "none", label: "No schedule" },
  { id: "daily", label: "Daily" },
  { id: "weekdays", label: "Selected days" },
  { id: "training_days", label: "Training days" },
  { id: "rest_days", label: "Rest days" },
]

export const SUPPLEMENT_SPECIFIC_NUTRIENT_KEYS = [
  "creatine",
  "omega3",
  "epa",
  "dha",
] as const

export const SUPPLEMENT_NUTRIENT_KEYS = [
  "calories",
  "protein",
  "carbs",
  "fat",
  ...FOOD_MICRONUTRIENT_KEYS,
  ...SUPPLEMENT_SPECIFIC_NUTRIENT_KEYS,
] as const

export type SupplementNutrientKey = (typeof SUPPLEMENT_NUTRIENT_KEYS)[number]
export type SupplementSpecificNutrientKey =
  (typeof SUPPLEMENT_SPECIFIC_NUTRIENT_KEYS)[number]
export type NutritionSummaryKey =
  | FoodMicronutrientKey
  | SupplementSpecificNutrientKey

export const SUPPLEMENT_SUMMARY_NUTRIENT_KEYS = [
  ...FOOD_MICRONUTRIENT_KEYS,
  ...SUPPLEMENT_SPECIFIC_NUTRIENT_KEYS,
] as const satisfies readonly NutritionSummaryKey[]

type NutrientUnit = "kcal" | "g" | "mg" | "mcg"

export const SUPPLEMENT_NUTRIENT_DETAILS: Record<
  SupplementNutrientKey,
  {
    label: string
    unit: NutrientUnit
    color: string
    supplementCautionAt?: number
  }
> = {
  calories: { label: "Calories", unit: "kcal", color: APP_ACCENT_COLORS.food },
  protein: { label: "Protein", unit: "g", color: MACRO_COLORS.protein },
  carbs: { label: "Carbs", unit: "g", color: MACRO_COLORS.carbs },
  fat: { label: "Fat", unit: "g", color: MACRO_COLORS.fat },
  fiber: { label: "Fiber", unit: "g", color: MICRO_COLORS.fiber },
  sugar: { label: "Total sugar", unit: "g", color: MICRO_COLORS.sugar },
  saturatedFat: {
    label: "Saturated fat",
    unit: "g",
    color: MICRO_COLORS.saturatedFat,
  },
  transFat: { label: "Trans fat", unit: "g", color: MICRO_COLORS.transFat },
  cholesterol: {
    label: "Cholesterol",
    unit: "mg",
    color: MICRO_COLORS.cholesterol,
  },
  sodium: {
    label: "Sodium",
    unit: "mg",
    color: MICRO_COLORS.sodium,
    supplementCautionAt: 1000,
  },
  potassium: {
    label: "Potassium",
    unit: "mg",
    color: MICRO_COLORS.potassium,
  },
  calcium: {
    label: "Calcium",
    unit: "mg",
    color: MICRO_COLORS.calcium,
    supplementCautionAt: 1000,
  },
  iron: {
    label: "Iron",
    unit: "mg",
    color: MICRO_COLORS.iron,
    supplementCautionAt: 18,
  },
  magnesium: {
    label: "Magnesium",
    unit: "mg",
    color: MICRO_COLORS.magnesium,
    supplementCautionAt: 350,
  },
  phosphorus: {
    label: "Phosphorus",
    unit: "mg",
    color: MICRO_COLORS.phosphorus,
  },
  zinc: {
    label: "Zinc",
    unit: "mg",
    color: MICRO_COLORS.zinc,
    supplementCautionAt: 25,
  },
  vitaminC: { label: "Vitamin C", unit: "mg", color: MICRO_COLORS.vitaminC },
  vitaminA: {
    label: "Vitamin A",
    unit: "mcg",
    color: MICRO_COLORS.vitaminA,
    supplementCautionAt: 1500,
  },
  vitaminD: {
    label: "Vitamin D",
    unit: "mcg",
    color: MICRO_COLORS.vitaminD,
    supplementCautionAt: 75,
  },
  vitaminB12: {
    label: "Vitamin B12",
    unit: "mcg",
    color: MICRO_COLORS.vitaminB12,
  },
  caffeine: {
    label: "Caffeine",
    unit: "mg",
    color: MICRO_COLORS.caffeine,
    supplementCautionAt: 300,
  },
  alcohol: { label: "Alcohol", unit: "g", color: MICRO_COLORS.alcohol },
  creatine: {
    label: "Creatine",
    unit: "g",
    color: SUPPLEMENT_TONES.creatine.color,
  },
  omega3: { label: "Omega-3", unit: "mg", color: ONE_REP_PALETTE.plate },
  epa: { label: "EPA", unit: "mg", color: ONE_REP_PALETTE.patina },
  dha: { label: "DHA", unit: "mg", color: ONE_REP_PALETTE.violet },
}

const OPEN_FOOD_FACTS_TO_SUPPLEMENT: Partial<
  Record<
    SupplementNutrientKey,
    { detailKey: string; sourceUnit: NutrientUnit; targetUnit: NutrientUnit }
  >
> = {
  calories: { detailKey: "energy", sourceUnit: "kcal", targetUnit: "kcal" },
  protein: { detailKey: "protein", sourceUnit: "g", targetUnit: "g" },
  carbs: { detailKey: "carbs", sourceUnit: "g", targetUnit: "g" },
  fat: { detailKey: "fat", sourceUnit: "g", targetUnit: "g" },
  fiber: { detailKey: "fiber", sourceUnit: "g", targetUnit: "g" },
  sugar: { detailKey: "sugar", sourceUnit: "g", targetUnit: "g" },
  saturatedFat: { detailKey: "satFat", sourceUnit: "g", targetUnit: "g" },
  transFat: { detailKey: "trans-fat", sourceUnit: "g", targetUnit: "g" },
  cholesterol: {
    detailKey: "cholesterol",
    sourceUnit: "mg",
    targetUnit: "mg",
  },
  sodium: { detailKey: "sodium", sourceUnit: "g", targetUnit: "mg" },
  potassium: { detailKey: "potassium", sourceUnit: "mg", targetUnit: "mg" },
  calcium: { detailKey: "calcium", sourceUnit: "mg", targetUnit: "mg" },
  iron: { detailKey: "iron", sourceUnit: "mg", targetUnit: "mg" },
  magnesium: { detailKey: "magnesium", sourceUnit: "mg", targetUnit: "mg" },
  phosphorus: { detailKey: "phosphorus", sourceUnit: "mg", targetUnit: "mg" },
  zinc: { detailKey: "zinc", sourceUnit: "mg", targetUnit: "mg" },
  vitaminC: { detailKey: "vitaminC", sourceUnit: "mg", targetUnit: "mg" },
  vitaminA: { detailKey: "vitamin-a", sourceUnit: "mcg", targetUnit: "mcg" },
  vitaminD: { detailKey: "vitamin-d", sourceUnit: "mcg", targetUnit: "mcg" },
  vitaminB12: {
    detailKey: "vitamin-b12",
    sourceUnit: "mcg",
    targetUnit: "mcg",
  },
  caffeine: { detailKey: "caffeine", sourceUnit: "mg", targetUnit: "mg" },
  alcohol: { detailKey: "alcohol", sourceUnit: "g", targetUnit: "g" },
  omega3: { detailKey: "omega-3-fat", sourceUnit: "mg", targetUnit: "mg" },
  epa: { detailKey: "eicosapentaenoic-acid", sourceUnit: "mg", targetUnit: "mg" },
  dha: { detailKey: "docosahexaenoic-acid", sourceUnit: "mg", targetUnit: "mg" },
}

export type SupplementDayPlanItem = {
  item: SupplementItem
  logs: SupplementIntakeLog[]
  isScheduled: boolean
  state: "taken" | "skipped" | "missed" | "due" | "unscheduled"
  preferredSort: number
}

export type SupplementConsistency = {
  takenThisWeek: number
  currentStreak: number
  lastTaken?: string
}

export type SupplementItemDraft = Omit<
  SupplementItem,
  "_id" | "userId" | "createdAt" | "updatedAt"
>

function roundNutrient(value: number) {
  if (value >= 100) return Math.round(value)
  if (value >= 10) return Math.round(value * 10) / 10
  return Math.round(value * 100) / 100
}

function normalizeMass(
  value: number,
  fromUnit: string,
  toUnit: NutrientUnit
) {
  if (toUnit === "kcal") return value
  const normalized = fromUnit.toLowerCase().replace("µ", "u").trim()
  const inMg =
    normalized === "g"
      ? value * 1000
      : normalized === "ug" || normalized === "mcg"
        ? value / 1000
        : value

  if (toUnit === "g") return inMg / 1000
  if (toUnit === "mcg") return inMg * 1000
  return inMg
}

export function cleanSupplementNutrients(
  nutrients: SupplementNutrients
): SupplementNutrients {
  const cleaned: SupplementNutrients = {}
  for (const key of SUPPLEMENT_NUTRIENT_KEYS) {
    const value = nutrients[key]
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      continue
    cleaned[key] = roundNutrient(value)
  }
  return cleaned
}

export function scaleSupplementNutrients(
  nutrients: SupplementNutrients,
  servingMultiplier: number
): SupplementNutrients {
  if (!Number.isFinite(servingMultiplier) || servingMultiplier <= 0) return {}
  const scaled: SupplementNutrients = {}
  for (const key of SUPPLEMENT_NUTRIENT_KEYS) {
    const value = nutrients[key]
    if (typeof value !== "number" || value <= 0) continue
    scaled[key] = roundNutrient(value * servingMultiplier)
  }
  return scaled
}

export function supplementNutrientTotals(
  logs: Array<Pick<SupplementIntakeLog, "status" | "nutrients">>
): SupplementNutrients {
  const totals: SupplementNutrients = {}
  for (const log of logs) {
    if (log.status !== "taken") continue
    for (const key of SUPPLEMENT_NUTRIENT_KEYS) {
      const value = log.nutrients?.[key]
      if (typeof value !== "number" || value <= 0) continue
      totals[key] = (totals[key] ?? 0) + value
    }
  }
  return cleanSupplementNutrients(totals)
}

/** Reads one nutrient off a sparse totals record, treating anything non-finite as 0. */
export function nutrientTotal(
  totals: Partial<Record<string, number>> | undefined,
  key: string
) {
  const value = totals?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 * Adds supplement macros onto food macros.
 *
 * Distinct from `mergeNutritionTotals`, which rounds over the report-shaped
 * `SUPPLEMENT_SUMMARY_NUTRIENT_KEYS`. This one is the raw day-total sum that
 * the Today dashboard and Nutrition page both display.
 */
export function combineMacroTotals<
  T extends { calories: number; protein: number; carbs: number; fat: number },
>(food: T, supplements: Partial<Record<string, number>> | undefined) {
  return {
    calories: food.calories + nutrientTotal(supplements, "calories"),
    protein: food.protein + nutrientTotal(supplements, "protein"),
    carbs: food.carbs + nutrientTotal(supplements, "carbs"),
    fat: food.fat + nutrientTotal(supplements, "fat"),
  }
}

export function combineMicronutrientTotals(
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

export function mergeNutritionTotals(
  foodTotals: Partial<Record<FoodMicronutrientKey, number>>,
  supplementTotals: SupplementNutrients
): Partial<Record<NutritionSummaryKey, number>> {
  const totals: Partial<Record<NutritionSummaryKey, number>> = {}
  for (const key of SUPPLEMENT_SUMMARY_NUTRIENT_KEYS) {
    const food = key in foodTotals ? (foodTotals[key as FoodMicronutrientKey] ?? 0) : 0
    const supplement = supplementTotals[key] ?? 0
    const total = food + supplement
    if (total > 0) totals[key] = roundNutrient(total)
  }
  return totals
}

export function isSupplementKind(value: string): value is SupplementKind {
  return (SUPPLEMENT_KINDS as readonly string[]).includes(value)
}

export function supplementCategoryDetail(category?: SupplementCategory) {
  return (
    SUPPLEMENT_CATEGORIES.find((item) => item.id === category) ??
    SUPPLEMENT_CATEGORIES[SUPPLEMENT_CATEGORIES.length - 1]
  )
}

export function categoryToSupplementKind(
  category?: SupplementCategory
): SupplementKind {
  if (category === "creatine") return "creatine"
  if (category === "protein") return "protein"
  if (category === "caffeine_pre_workout") return "caffeine"
  return "vitamins"
}

export function formatSupplementAmount(amount: number, unit: SupplementUnit) {
  const safe = Number.isFinite(amount) ? amount : 0
  const rounded = Number.isInteger(safe)
    ? String(safe)
    : safe.toFixed(1).replace(/\.0$/, "")

  if (unit === "serving") {
    return `${rounded} serving${safe === 1 ? "" : "s"}`
  }

  return `${rounded} ${unit}`
}

export function formatNutrientValue(value: number) {
  if (!Number.isFinite(value)) return "0"
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString("en-US")
  if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\.0$/, "")
  if (Math.abs(value) >= 1) return value.toFixed(1).replace(/\.0$/, "")
  return value.toFixed(2).replace(/0$/, "")
}

export function formatSupplementNutrient(
  key: SupplementNutrientKey,
  value: number
) {
  const detail = SUPPLEMENT_NUTRIENT_DETAILS[key]
  return `${formatNutrientValue(value)} ${detail.unit}`
}

export function supplementTotals(entries: SupplementLogEntry[]) {
  return SUPPLEMENT_KINDS.reduce(
    (acc, kind) => {
      acc[kind] = entries
        .filter((entry) => {
          const entryKind = entry.kind ?? categoryToSupplementKind(entry.category)
          return entryKind === kind && (entry.status ?? "taken") === "taken"
        })
        .reduce((sum, entry) => sum + entry.amount, 0)
      return acc
    },
    {} as Record<SupplementKind, number>
  )
}

export function completedSupplementCount(entries: SupplementLogEntry[]) {
  return new Set(
    entries
      .filter((entry) => (entry.status ?? "taken") === "taken")
      .map((entry) => entry.supplementId ?? entry.kind)
  ).size
}

export function supplementEntryLabel(entry: SupplementLogEntry) {
  const name =
    entry.name ??
    SUPPLEMENT_DEFINITIONS[entry.kind]?.label ??
    supplementCategoryDetail(entry.category).label
  if (entry.status === "skipped") return `${name} skipped`
  if (entry.servingLabel && entry.servingMultiplier) {
    return `${name} ${formatNutrientValue(entry.servingMultiplier)}x`
  }
  return `${name} ${formatSupplementAmount(entry.amount, entry.unit)}`
}

export function defaultSupplementDraft(
  category: SupplementCategory = "creatine"
): SupplementItemDraft {
  const detail = supplementCategoryDetail(category)
  return {
    name: detail.label,
    category,
    form: detail.defaultForm,
    servingLabel: detail.defaultServingLabel,
    defaultServingQuantity: defaultServingQuantityFromLabel(
      detail.defaultServingLabel
    ),
    active: true,
    schedule: { type: "daily" },
    nutrientsPerServing:
      category === "creatine"
        ? { creatine: 5 }
        : category === "protein"
          ? { protein: 25 }
          : category === "caffeine_pre_workout"
            ? { caffeine: 100 }
            : {},
    source: "manual",
  }
}

export function defaultServingQuantityFromLabel(label?: string) {
  const match = label?.match(/([0-9]+(?:[.,][0-9]+)?)/)
  const parsed = match ? Number(match[1].replace(",", ".")) : 1
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function dateFromKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`)
}

function offsetDateKey(dateKey: string, offset: number) {
  const date = dateFromKey(dateKey)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function startOfWeekKey(dateKey: string) {
  const date = dateFromKey(dateKey)
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1))
  return date.toISOString().slice(0, 10)
}

function preferredMinutes(schedule: SupplementSchedule) {
  const match = schedule.preferredTime?.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return 24 * 60
  return Number(match[1]) * 60 + Number(match[2])
}

function preferredTimePassed(
  dateKey: string,
  schedule: SupplementSchedule,
  now: Date
) {
  if (!schedule.preferredTime) return false
  const target = new Date(`${dateKey}T${schedule.preferredTime}:00`)
  return now.getTime() > target.getTime()
}

export function isSupplementScheduledForDate({
  item,
  date,
  isTrainingDay,
}: {
  item: Pick<SupplementItem, "active" | "schedule">
  date: string
  isTrainingDay: boolean
}) {
  if (!item.active) return false
  const schedule = item.schedule
  if (!schedule || schedule.type === "none") return false
  if (schedule.type === "daily") return true
  if (schedule.type === "training_days") return isTrainingDay
  if (schedule.type === "rest_days") return !isTrainingDay
  const day = dateFromKey(date).getUTCDay()
  return (schedule.weekdays ?? []).includes(day)
}

export function buildSupplementDayPlan({
  items,
  logs,
  date,
  today,
  isTrainingDay,
  now = new Date(),
}: {
  items: SupplementItem[]
  logs: SupplementIntakeLog[]
  date: string
  today: string
  isTrainingDay: boolean
  now?: Date
}): SupplementDayPlanItem[] {
  return items
    .filter((item) => item.active)
    .map((item) => {
      const id = item._id ?? ""
      const itemLogs = logs.filter((log) => log.supplementId === id)
      const hasTaken = itemLogs.some((log) => log.status === "taken")
      const hasSkipped = itemLogs.some((log) => log.status === "skipped")
      const isScheduled = isSupplementScheduledForDate({
        item,
        date,
        isTrainingDay,
      })
      const isPast = date < today
      const state: SupplementDayPlanItem["state"] = hasTaken
        ? "taken"
        : hasSkipped
          ? "skipped"
          : isScheduled && (isPast || preferredTimePassed(date, item.schedule, now))
            ? "missed"
            : isScheduled
              ? "due"
              : "unscheduled"

      return {
        item,
        logs: itemLogs,
        isScheduled,
        state,
        preferredSort: preferredMinutes(item.schedule),
      }
    })
    .sort((a, b) => {
      const aScheduled = a.isScheduled ? 0 : 1
      const bScheduled = b.isScheduled ? 0 : 1
      if (aScheduled !== bScheduled) return aScheduled - bScheduled
      if (a.preferredSort !== b.preferredSort)
        return a.preferredSort - b.preferredSort
      return a.item.name.localeCompare(b.item.name)
    })
}

export function loggableSupplementPlanItems(plan: SupplementDayPlanItem[]) {
  return plan.filter(
    (entry) =>
      entry.isScheduled &&
      (entry.state === "due" || entry.state === "missed") &&
      Boolean(entry.item._id)
  )
}

export function supplementConsistency(
  item: Pick<SupplementItem, "_id">,
  logs: SupplementIntakeLog[],
  today: string
): SupplementConsistency {
  const id = item._id ?? ""
  const takenDates = new Set(
    logs
      .filter((log) => log.supplementId === id && log.status === "taken")
      .map((log) => log.date)
  )
  const weekStart = startOfWeekKey(today)
  const takenThisWeek = [...takenDates].filter(
    (date) => date >= weekStart && date <= today
  ).length
  const lastTaken = [...takenDates].sort().at(-1)

  let currentStreak = 0
  let cursor = today
  while (takenDates.has(cursor)) {
    currentStreak += 1
    cursor = offsetDateKey(cursor, -1)
  }

  return { takenThisWeek, currentStreak, lastTaken }
}

function allNutrientRows(detail: FoodDetail): NutrientRow[] {
  return [...(detail.nutrients ?? []), ...(detail.extraNutrients ?? [])]
}

function servingGramsFromFoodResult(result: FoodResult): number | null {
  const parsedPortion = parseFoodPortionLabel(result.serving)
  if (parsedPortion) return parsedPortion.grams

  const match = result.serving.match(/([0-9]+(?:[.,][0-9]+)?)\s*(g|ml)\b/i)
  if (!match) return null
  const parsed = Number(match[1].replace(",", "."))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function nutrientFromDetail(
  detail: FoodDetail,
  key: SupplementNutrientKey,
  servingGrams: number
) {
  const mapping = OPEN_FOOD_FACTS_TO_SUPPLEMENT[key]
  if (!mapping) return 0
  const row = allNutrientRows(detail).find((item) => item.key === mapping.detailKey)
  if (!row || row.per100g <= 0) return 0
  const scaled = (row.per100g * servingGrams) / 100
  return normalizeMass(scaled, row.unit || mapping.sourceUnit, mapping.targetUnit)
}

function inferCategoryFromText(text: string): SupplementCategory {
  const value = text.toLowerCase()
  if (/\b(creatine|monohydrate)\b/.test(value)) return "creatine"
  if (/\b(whey|protein|casein|isolate|mass gainer)\b/.test(value))
    return "protein"
  if (/\b(multivitamin|multi vitamin|multi-vitamin)\b/.test(value))
    return "multivitamin"
  if (/\b(omega|fish oil|epa|dha)\b/.test(value)) return "omega_3"
  if (/\b(electrolyte|hydration|sodium|potassium)\b/.test(value))
    return "electrolyte"
  if (/\b(caffeine|pre workout|pre-workout|energy)\b/.test(value))
    return "caffeine_pre_workout"
  if (/\b(fiber|psyllium|inulin)\b/.test(value)) return "fiber"
  if (/\b(vitamin|mineral|magnesium|zinc|iron|calcium|b12|d3)\b/.test(value))
    return "vitamin_mineral"
  return "other"
}

function inferFormFromText(text: string): SupplementForm {
  const value = text.toLowerCase()
  if (/\b(softgels?|soft gels?)\b/.test(value)) return "softgel"
  if (/\b(capsule|capsules|caplets)\b/.test(value)) return "capsule"
  if (/\b(tablet|tablets)\b/.test(value)) return "tablet"
  if (/\b(gummy|gummies)\b/.test(value)) return "gummy"
  if (/\b(liquid|drops|drink|shot)\b/.test(value)) return "liquid"
  if (/\b(powder|scoop|g\b|gram)\b/.test(value)) return "powder"
  return "other"
}

export function supplementDraftFromFoodDetail(
  detail: FoodDetail
): SupplementItemDraft {
  const servingGrams = detail.servingGrams ?? 100
  const text = `${detail.name} ${detail.brand ?? ""} ${detail.servingLabel}`
  const category = inferCategoryFromText(text)
  const servingLabel = detail.servingLabel || detail.serving || "1 serving"
  const nutrients: SupplementNutrients = {}

  for (const key of SUPPLEMENT_NUTRIENT_KEYS) {
    const value = nutrientFromDetail(detail, key, servingGrams)
    if (value > 0) nutrients[key] = roundNutrient(value)
  }

  return {
    name: detail.name,
    brand: detail.brand,
    category,
    form: inferFormFromText(text),
    servingLabel,
    defaultServingQuantity: defaultServingQuantityFromLabel(servingLabel),
    barcode: detail.code,
    active: true,
    schedule: { type: "daily" },
    nutrientsPerServing: cleanSupplementNutrients(nutrients),
    source: "openfoodfacts",
    importedOpenFoodFacts: detail.openFoodFacts,
  }
}

export function supplementDraftFromFoodResult(
  result: FoodResult
): SupplementItemDraft {
  const detail: FoodDetail = {
    ...result,
    servingGrams: servingGramsFromFoodResult(result),
    servingLabel: result.serving,
    nutrients: [
      { key: "energy", name: "Calories", per100g: result.calories, unit: "kcal" },
      { key: "protein", name: "Protein", per100g: result.protein, unit: "g" },
      { key: "carbs", name: "Carbohydrates", per100g: result.carbs, unit: "g" },
      { key: "fat", name: "Total Fat", per100g: result.fat, unit: "g" },
    ].filter((row) => row.per100g > 0),
    extraNutrients: [],
  }
  return supplementDraftFromFoodDetail(detail)
}

export function supplementLogFromIntake(log: SupplementIntakeLog): SupplementLogEntry {
  const kind = categoryToSupplementKind(log.category)
  const definition = SUPPLEMENT_DEFINITIONS[kind]
  const amount =
    kind === "creatine"
      ? (log.nutrients.creatine ?? definition.defaultAmount * log.servingMultiplier)
      : kind === "protein"
        ? (log.nutrients.protein ?? definition.defaultAmount * log.servingMultiplier)
        : kind === "caffeine"
          ? (log.nutrients.caffeine ?? definition.defaultAmount * log.servingMultiplier)
          : log.servingMultiplier
  return {
    id: log.id ?? log._id ?? log.clientId ?? `${log.supplementId}-${log.loggedAt}`,
    kind,
    category: log.category,
    supplementId: log.supplementId,
    name: log.name,
    brand: log.brand,
    amount,
    unit: definition.unit,
    loggedAt: log.loggedAt,
    status: log.status,
    servingMultiplier: log.servingMultiplier,
    servingLabel: log.servingLabel,
    nutrients: log.nutrients,
    note: log.note,
  }
}
