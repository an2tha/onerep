import { MACRO_COLORS } from "../lib/design-tokens"

const MACROS = [
  {
    key: "protein",
    label: "Protein",
    color: MACRO_COLORS.protein,
    kcalPerG: 4,
  },
  { key: "carbs", label: "Carbs", color: MACRO_COLORS.carbs, kcalPerG: 4 },
  { key: "fat", label: "Fat", color: MACRO_COLORS.fat, kcalPerG: 9 },
] as const

function formatNutrient(value: number, maximumFractionDigits = 1) {
  const safe = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(safe) >= 100 ? 0 : maximumFractionDigits,
  }).format(safe)
}

export function FoodMacroStack({
  protein,
  carbs,
  fat,
}: {
  protein: number
  carbs: number
  fat: number
}) {
  const values = [protein, carbs, fat]
  const calories = values.map((value, index) => value * MACROS[index].kcalPerG)
  const total = calories.reduce((sum, value) => sum + value, 0) || 1
  return (
    <div className="grid grid-cols-3 gap-2">
      {MACROS.map((macro, index) => (
        <div key={macro.key} className="rounded-2xl bg-muted/45 px-3 py-3">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: macro.color }}
              aria-hidden
            />
            {macro.label}
          </span>
          <strong className="mt-2 block text-[18px] leading-none tabular-nums">
            {formatNutrient(values[index])} g
          </strong>
          <span className="mt-1 block text-[10px] text-muted-foreground tabular-nums">
            {Math.round((calories[index] / total) * 100)}% of energy
          </span>
        </div>
      ))}
    </div>
  )
}

export function FoodNutrientRow({
  label,
  value,
  unit,
  indent,
  bold,
}: {
  label: string
  value: number
  unit: string
  indent?: boolean
  bold?: boolean
}) {
  const tone = indent ? "text-muted-foreground/60" : ""
  return (
    <div
      className="flex items-baseline justify-between gap-3 py-[9px]"
      style={{ paddingLeft: indent ? 16 : 0 }}
    >
      <span
        className={`min-w-0 truncate text-[13px] leading-none ${bold ? "font-semibold" : tone}`}
      >
        {label}
      </span>
      <span
        className={`shrink-0 text-[13px] leading-none tabular-nums ${bold ? "font-semibold" : tone}`}
      >
        {formatNutrient(value, Math.abs(value) < 10 ? 2 : 1)}
        <span className="ml-1 text-[13px] text-muted-foreground">{unit}</span>
      </span>
    </div>
  )
}

export function FoodProductHeader({
  name,
  brand,
  calories,
  portionLabel,
  presentation,
}: {
  name: string
  brand?: string
  calories: number
  portionLabel: string
  presentation: "sheet" | "page"
}) {
  return (
    <header
      className={
        presentation === "page"
          ? "px-4 pt-5 pb-4 md:px-8 md:pt-8"
          : "px-4 pb-4 md:px-8 md:pt-8"
      }
    >
      {presentation !== "page" && (
        <h2 className="text-[26px] leading-tight font-bold tracking-[-0.035em]">
          {name}
        </h2>
      )}
      <div className="mt-2 flex items-baseline gap-2 text-[13px] text-muted-foreground">
        {brand && <span className="truncate">{brand}</span>}
        {brand && <span aria-hidden>·</span>}
        <span>{portionLabel}</span>
        <span aria-hidden>·</span>
        <strong className="font-semibold text-foreground tabular-nums">
          {formatNutrient(calories, 0)} kcal
        </strong>
      </div>
    </header>
  )
}
