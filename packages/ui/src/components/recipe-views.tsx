import { CaretDown, Plus } from "@phosphor-icons/react"
import type { ReactNode } from "react"

export type RecipeMicronutrientView = {
  key: string
  label: string
  value: number | string
  unit: string
  color: string
}

export function RecipeEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border-y border-border py-8 text-center">
      <h2 className="text-[17px] font-semibold">Add your first ingredient</h2>
      <p className="mx-auto mt-1 max-w-sm text-[14px] leading-5 text-muted-foreground">
        Search for each food in the recipe, then adjust its amount or serving
        unit.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="native-primary-button mx-auto mt-4"
      >
        <Plus size={16} weight="bold" />
        Add ingredient
      </button>
    </div>
  )
}

export function RecipeSummary({
  totals,
  ingredientCount,
  microCount,
}: {
  totals: { calories: number; protein: number; carbs: number; fat: number }
  ingredientCount: number
  microCount: number
}) {
  return (
    <section className="mx-[var(--app-page-x)] mb-5 border-y border-border py-4 md:mx-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="native-section-title">Recipe nutrition</h2>
          <p className="native-row-detail mt-0.5">
            {ingredientCount} ingredient{ingredientCount !== 1 ? "s" : ""}
            {microCount > 0 ? ` · ${microCount} micronutrients available` : ""}
          </p>
        </div>
        <p className="text-right text-[22px] font-semibold tabular-nums">
          {totals.calories}
          <span className="ml-1 text-[13px] font-medium text-muted-foreground">
            kcal
          </span>
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-y border-border py-3 text-center">
        {[
          { key: "protein" as const, label: "Protein" },
          { key: "carbs" as const, label: "Carbs" },
          { key: "fat" as const, label: "Fat" },
        ].map(({ key, label }) => (
          <div key={key}>
            <dt className="text-[13px] text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-[15px] font-semibold tabular-nums">
              {totals[key]} g
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function RecipeMicrosPanel({
  micros,
  open,
  onToggle,
}: {
  micros: RecipeMicronutrientView[]
  open: boolean
  onToggle: () => void
}) {
  if (micros.length === 0) return null

  const shown = open ? micros : micros.slice(0, 4)

  return (
    <section className="mt-5 border-y border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-14 w-full items-center justify-between px-1 py-3 text-left transition-colors active:bg-muted/30"
        aria-expanded={open}
      >
        <div>
          <p className="text-[15px] font-semibold">Micronutrients</p>
          <p className="text-[13px] text-muted-foreground">
            {micros.length} tracked nutrient{micros.length !== 1 ? "s" : ""}
          </p>
        </div>
        <CaretDown
          size={14}
          weight="bold"
          className="text-muted-foreground transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      <dl className="divide-y divide-border border-t border-border">
        {shown.map((item) => (
          <div
            key={item.key}
            className="flex min-h-12 items-center justify-between gap-3 px-1 py-2"
          >
            <dt className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              <span className="truncate text-[14px] font-medium">
                {item.label}
              </span>
            </dt>
            <dd className="text-[14px] font-semibold tabular-nums">
              {item.value}
              <span className="ml-1 font-medium text-muted-foreground">
                {item.unit}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// ─── Search overlay ───────────────────────────────────────────────────────────

export function RecipeMetadataField({
  icon,
  label,
  value,
  onChange,
  suffix,
  placeholder,
  inputMode,
}: {
  icon?: ReactNode
  label: string
  value: string
  onChange: (value: string) => void
  suffix?: string
  placeholder?: string
  inputMode?: "numeric"
}) {
  return (
    <label className="min-w-0 border-b border-border pb-2">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="mt-1 flex items-baseline gap-1">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode={inputMode}
          aria-label={label}
          placeholder={placeholder ?? "—"}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-muted-foreground/60"
        />
        {suffix && value && (
          <span className="text-[11px] text-muted-foreground">{suffix}</span>
        )}
      </span>
    </label>
  )
}
