import { useState } from "react"
import { CaretDown, Star, Trash, Warning, X } from "@phosphor-icons/react"
import { PrimaryButton } from "@repo/ui"
import { MobileSheet } from "@/components/mobile-sheet"
import { cn } from "@/lib/utils"
import { FOOD_MICRONUTRIENT_KEYS } from "@/lib/food-log"
import {
  caloriesFromMacros,
  customFoodNutrientsFromDraft,
  CUSTOM_FOOD_MACRO_KEYS,
  CUSTOM_FOOD_NUTRIENT_LABELS,
  macroCalorieMismatch,
  validateCustomFoodDraft,
  type CustomFoodDraft,
} from "@/lib/custom-foods"
import { useEnergyUnit } from "@/lib/use-energy-unit"

/**
 * The custom-food editor, shared by the My foods page and the "correct these
 * values" flow on the food detail sheet. Pure presentation: it edits a draft
 * and reports saves; persistence belongs to the caller.
 */
export function CustomFoodEditorSheet({
  draft,
  saving,
  title,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  draft: CustomFoodDraft
  saving: boolean
  title?: string
  onChange: (draft: CustomFoodDraft) => void
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
}) {
  const energyUnit = useEnergyUnit()
  const [microsOpen, setMicrosOpen] = useState(false)
  const validation = validateCustomFoodDraft(draft)
  const nutrients = customFoodNutrientsFromDraft(draft)
  const mismatch = macroCalorieMismatch(nutrients)

  const update = (patch: Partial<CustomFoodDraft>) =>
    onChange({ ...draft, ...patch })
  const updateNutrient = (key: string, value: string) =>
    onChange({ ...draft, nutrients: { ...draft.nutrients, [key]: value } })

  return (
    <MobileSheet
      onClose={onClose}
      panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-y-auto rounded-t-2xl border-t border-border bg-card"
      maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
    >
      <div className="px-5 pt-4 pb-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-[21px] font-semibold">
            {title ?? (draft.id ? "Edit food" : "New custom food")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="native-toolbar-button -mt-1 -mr-2 px-0 text-muted-foreground"
            aria-label="Close food editor"
          >
            <X size={17} weight="bold" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="native-field">
            <span className="native-field-label">Name</span>
            <input
              className="native-input"
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="Protein shake"
              autoFocus={!draft.id}
            />
            {validation.errors.name && (
              <span className="native-field-error" role="alert">
                {validation.errors.name}
              </span>
            )}
          </label>

          <label className="native-field">
            <span className="native-field-label">Brand (optional)</span>
            <input
              className="native-input"
              value={draft.brand}
              onChange={(event) => update({ brand: event.target.value })}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="native-field">
              <span className="native-field-label">One serving is</span>
              <input
                className="native-input"
                value={draft.servingLabel}
                onChange={(event) =>
                  update({ servingLabel: event.target.value })
                }
                placeholder="1 scoop"
              />
              {validation.errors.servingLabel && (
                <span className="native-field-error" role="alert">
                  {validation.errors.servingLabel}
                </span>
              )}
            </label>
            <label className="native-field">
              <span className="native-field-label">Grams (optional)</span>
              <input
                className="native-input"
                inputMode="decimal"
                value={draft.servingGrams}
                onChange={(event) =>
                  update({ servingGrams: event.target.value })
                }
              />
            </label>
          </div>

          <fieldset>
            <legend className="native-field-label mb-2">Per serving</legend>
            <div className="grid grid-cols-2 gap-3">
              {CUSTOM_FOOD_MACRO_KEYS.map((key) => {
                const meta = CUSTOM_FOOD_NUTRIENT_LABELS[key]
                return (
                  <label key={key} className="native-field">
                    <span className="native-field-label">
                      {meta.label} ({meta.unit})
                    </span>
                    <input
                      className="native-input"
                      inputMode="decimal"
                      value={draft.nutrients[key]}
                      onChange={(event) =>
                        updateNutrient(key, event.target.value)
                      }
                    />
                  </label>
                )
              })}
            </div>
            {validation.errors.calories && (
              <span className="native-field-error mt-2 block" role="alert">
                {validation.errors.calories}
              </span>
            )}
            {mismatch && (
              <p
                role="status"
                className="native-field-hint mt-2 flex items-center gap-1.5 text-[var(--accent-food)]"
              >
                <Warning size={14} weight="bold" aria-hidden />
                Macros add up to {caloriesFromMacros(nutrients)} kcal. Double
                check the numbers.
              </p>
            )}
          </fieldset>

          <div>
            <button
              type="button"
              onClick={() => setMicrosOpen((open) => !open)}
              aria-expanded={microsOpen}
              className="flex min-h-11 w-full items-center justify-between text-left"
            >
              <span className="native-field-label">
                Micronutrients (optional)
              </span>
              <CaretDown
                size={16}
                weight="bold"
                aria-hidden
                className={cn(
                  "text-muted-foreground transition-transform",
                  microsOpen && "rotate-180"
                )}
              />
            </button>
            {microsOpen && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                {FOOD_MICRONUTRIENT_KEYS.map((key) => {
                  const meta = CUSTOM_FOOD_NUTRIENT_LABELS[key]
                  return (
                    <label key={key} className="native-field">
                      <span className="native-field-label">
                        {meta.label} ({meta.unit})
                      </span>
                      <input
                        className="native-input"
                        inputMode="decimal"
                        value={draft.nutrients[key]}
                        onChange={(event) =>
                          updateNutrient(key, event.target.value)
                        }
                      />
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => update({ favorite: !draft.favorite })}
            aria-pressed={draft.favorite}
            className="flex min-h-11 w-full items-center gap-2 text-[15px] font-semibold"
          >
            <Star
              size={17}
              weight={draft.favorite ? "fill" : "bold"}
              aria-hidden
              className={draft.favorite ? "text-[var(--accent-food)]" : ""}
            />
            {draft.favorite ? "Pinned to the top" : "Pin to the top"}
          </button>
        </div>

        <PrimaryButton
          className="mt-5 w-full"
          onClick={onSave}
          disabled={saving}
          aria-busy={saving}
        >
          {saving ? "Saving…" : draft.id ? "Save changes" : "Save food"}
        </PrimaryButton>

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 text-[15px] font-semibold text-destructive"
          >
            <Trash size={16} weight="bold" aria-hidden />
            Delete food
          </button>
        )}
      </div>
    </MobileSheet>
  )
}
