import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import {
  ArrowLeft,
  CaretDown,
  ForkKnife,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Star,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import {
  EmptyState,
  GroupedList,
  NavigationBar,
  PrimaryButton,
  SectionHeader,
  ToolbarButton,
  toast,
} from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { MobileSheet } from "@/components/mobile-sheet"
import { hapticSelection, hapticTap } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { cn } from "@/lib/utils"
import { useEnergyUnit } from "@/lib/use-energy-unit"
import { energyDisplay } from "@repo/ui"
import {
  currentDateKey,
  DEFAULT_MEAL_CATEGORIES,
  defaultMeal,
  FOOD_MICRONUTRIENT_KEYS,
} from "@/lib/food-log"
import {
  CUSTOM_FOOD_MACRO_KEYS,
  CUSTOM_FOOD_NUTRIENT_LABELS,
  caloriesFromMacros,
  customFoodDraftFromFood,
  customFoodNutrientsFromDraft,
  emptyCustomFoodDraft,
  filterCustomFoods,
  foodLogEntryFromCustomFood,
  macroCalorieMismatch,
  validateCustomFoodDraft,
  type CustomFood,
  type CustomFoodDraft,
} from "@/lib/custom-foods"

export default function CustomFoods() {
  const energyUnit = useEnergyUnit()
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const today = currentDateKey()

  const foodsQuery = useQuery(api.logs.customFoods.list, {})
  const saveFood = useOfflineMutation(
    api.logs.customFoods.save,
    "logs.customFoods.save"
  )
  const removeFood = useOfflineMutation(
    api.logs.customFoods.remove,
    "logs.customFoods.remove"
  )
  const markUsed = useOfflineMutation(
    api.logs.customFoods.markUsed,
    "logs.customFoods.markUsed"
  )
  const addFoodEntry = useOfflineMutation(
    api.logs.foodLogs.addEntry,
    "logs.foodLogs.addEntry"
  )

  const [query, setQuery] = useState("")
  // Arriving from a search that found nothing: the name the user typed is the
  // one thing we already know, so it goes in the field rather than being typed
  // twice. `log=1` means they were mid-log when the database let them down —
  // saving hands straight to the log sheet instead of ending on a list.
  const prefillName = searchParams.get("name")?.slice(0, 80).trim() ?? ""
  const logAfterSave = searchParams.get("log") === "1"
  const [draft, setDraft] = useState<CustomFoodDraft | null>(() =>
    searchParams.get("new") === "1" || prefillName
      ? { ...emptyCustomFoodDraft(), name: prefillName }
      : null
  )
  const [saving, setSaving] = useState(false)
  const [logTarget, setLogTarget] = useState<CustomFood | null>(null)

  const foods = (foodsQuery ?? []) as CustomFood[]
  const visibleFoods = useMemo(
    () => filterCustomFoods(foods, query),
    [foods, query]
  )
  const loading = foodsQuery === undefined

  async function handleSave() {
    if (!draft) return
    const validation = validateCustomFoodDraft(draft)
    if (!validation.valid) {
      toast.error(
        validation.errors.name ??
          validation.errors.servingLabel ??
          validation.errors.calories ??
          "Check the food details"
      )
      return
    }

    setSaving(true)
    try {
      const saved = await saveFood({
        id: draft.id ? (draft.id as Id<"customFoods">) : undefined,
        name: draft.name.trim(),
        brand: draft.brand.trim() || undefined,
        servingLabel: draft.servingLabel.trim(),
        servingGrams: draft.servingGrams.trim()
          ? Number(draft.servingGrams)
          : undefined,
        barcode: draft.barcode.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        favorite: draft.favorite,
        nutrientsPerServing: customFoodNutrientsFromDraft(draft),
      })
      toast.success(draft.id ? "Food updated" : "Custom food saved")
      if (!draft.id && logAfterSave) {
        // The offline queue resolves to nothing, so the id may be absent. The
        // log sheet only needs the nutrition, and logging offline queues too.
        const savedId =
          saved && typeof saved === "object" && "id" in saved
            ? String((saved as { id: unknown }).id)
            : undefined
        setLogTarget({
          ...(savedId ? { _id: savedId } : {}),
          name: draft.name.trim(),
          brand: draft.brand.trim() || undefined,
          servingLabel: draft.servingLabel.trim(),
          servingGrams: draft.servingGrams.trim()
            ? Number(draft.servingGrams)
            : undefined,
          nutrientsPerServing: customFoodNutrientsFromDraft(draft),
        })
      }
      setDraft(null)
    } catch (error) {
      reportOfflineMutationError(error, "Could not save this food")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(food: CustomFood) {
    const id = food.id ?? food._id
    if (!id) return
    try {
      await removeFood({ id: id as Id<"customFoods"> })
      toast.success("Food deleted")
      setDraft(null)
    } catch (error) {
      reportOfflineMutationError(error, "Could not delete this food")
    }
  }

  async function handleLog(
    food: CustomFood,
    options: { servings: number; meal: string }
  ) {
    const id = food.id ?? food._id
    hapticSelection()
    try {
      await addFoodEntry({
        date: today,
        entry: foodLogEntryFromCustomFood(food, {
          meal: options.meal,
          servings: options.servings,
        }),
      })
      if (id) await markUsed({ id: id as Id<"customFoods"> })
      toast.success(`Logged ${food.name}`)
      setLogTarget(null)
    } catch (error) {
      reportOfflineMutationError(error, "Could not log this food")
    }
  }

  return (
    <div className="native-page mx-auto min-h-svh w-full max-w-xl pb-[calc(var(--app-safe-bottom)+6rem)] text-foreground">
      <NavigationBar
        title="My foods"
        subtitle="Foods you entered yourself"
        leading={
          <ToolbarButton
            onClick={() => navigate(-1)}
            aria-label="Back to nutrition"
            className="-ml-2 px-0 text-muted-foreground"
          >
            <ArrowLeft size={19} weight="bold" />
          </ToolbarButton>
        }
        trailing={
          <ToolbarButton
            onClick={() => {
              hapticTap()
              setDraft(emptyCustomFoodDraft())
            }}
            aria-label="Create custom food"
          >
            <Plus size={19} weight="bold" />
          </ToolbarButton>
        }
      />

      {foods.length > 4 && (
        <div className="px-[var(--app-page-x)] pt-1 pb-2">
          <label className="relative block">
            <span className="sr-only">Search my foods</span>
            <MagnifyingGlass
              size={16}
              weight="bold"
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className="native-input pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search my foods"
            />
          </label>
        </div>
      )}

      {loading ? (
        <p className="px-[var(--app-page-x)] pt-8 text-[15px] text-muted-foreground">
          Loading your foods…
        </p>
      ) : visibleFoods.length === 0 ? (
        <div className="pt-6">
          <EmptyState
            icon={ForkKnife}
            tone="food"
            title={foods.length === 0 ? "No custom foods yet" : "No matches"}
            detail={
              foods.length === 0
                ? "Add the things the database gets wrong, such as your protein scoop, your usual takeaway, or grandma's stew. Save each one once, then log it in a tap."
                : "Try a different search."
            }
            action={
              foods.length === 0 ? (
                <PrimaryButton onClick={() => setDraft(emptyCustomFoodDraft())}>
                  Create a food
                </PrimaryButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="motion-content-in">
          <SectionHeader
            title={`${visibleFoods.length} food${
              visibleFoods.length === 1 ? "" : "s"
            }`}
          />
          <GroupedList label="Custom foods">
            {visibleFoods.map((food) => (
              <div
                key={food.id ?? food._id ?? food.name}
                className="native-list-row justify-between gap-2"
              >
                <button
                  type="button"
                  onClick={() => setLogTarget(food)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`Log ${food.name}`}
                >
                  <span className="native-row-title flex items-center gap-1.5 truncate">
                    {food.favorite && (
                      <Star
                        size={13}
                        weight="fill"
                        aria-label="Favorite"
                        className="shrink-0 text-[var(--accent-food)]"
                      />
                    )}
                    {food.name}
                  </span>
                  <span className="native-row-detail mt-0.5 block tabular-nums">
                    {energyDisplay(
                      food.nutrientsPerServing.calories,
                      energyUnit
                    )}{" "}
                    {energyUnit} · {food.nutrientsPerServing.protein} P ·{" "}
                    {food.nutrientsPerServing.carbs} C ·{" "}
                    {food.nutrientsPerServing.fat} F per {food.servingLabel}
                    {food.brand ? ` · ${food.brand}` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(customFoodDraftFromFood(food))}
                  className="native-toolbar-button h-11 w-11 shrink-0 px-0 text-muted-foreground"
                  aria-label={`Edit ${food.name}`}
                >
                  <PencilSimple size={16} weight="bold" />
                </button>
              </div>
            ))}
          </GroupedList>
        </div>
      )}

      {logTarget && (
        <LogCustomFoodSheet
          food={logTarget}
          onClose={() => setLogTarget(null)}
          onLog={(options) => void handleLog(logTarget, options)}
        />
      )}

      {draft && (
        <CustomFoodEditorSheet
          draft={draft}
          saving={saving}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={() => void handleSave()}
          onDelete={
            draft.id
              ? () => {
                  const food = foods.find(
                    (item) => (item.id ?? item._id) === draft.id
                  )
                  if (food) void handleDelete(food)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

// ─── Log sheet ────────────────────────────────────────────────────────────────

function LogCustomFoodSheet({
  food,
  onClose,
  onLog,
}: {
  food: CustomFood
  onClose: () => void
  onLog: (options: { servings: number; meal: string }) => void
}) {
  const energyUnit = useEnergyUnit()
  const [servings, setServings] = useState("1")
  const [meal, setMeal] = useState(defaultMeal())

  const parsed = Number(servings.replace(",", "."))
  const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  const preview = foodLogEntryFromCustomFood(food, {
    meal,
    servings: amount || 1,
  })

  return (
    <MobileSheet
      onClose={onClose}
      panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-2xl border-t border-border bg-card"
      maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
    >
      <div className="px-5 pt-4 pb-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-[21px] font-semibold">{food.name}</h2>
            <p className="native-row-detail">per {food.servingLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="native-toolbar-button -mt-1 -mr-2 px-0 text-muted-foreground"
            aria-label="Close log sheet"
          >
            <X size={17} weight="bold" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="native-field">
            <span className="native-field-label">Servings</span>
            <input
              className="native-input"
              inputMode="decimal"
              value={servings}
              onChange={(event) => setServings(event.target.value)}
            />
          </label>
          <label className="native-field">
            <span className="native-field-label">Meal</span>
            <select
              className="native-input"
              value={meal}
              onChange={(event) => setMeal(event.target.value)}
            >
              {DEFAULT_MEAL_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="native-field-hint mt-3 tabular-nums">
          {energyDisplay(preview.calories, energyUnit)} {energyUnit} ·{" "}
          {preview.protein} g protein · {preview.carbs} g carbs · {preview.fat}{" "}
          g fat
        </p>

        <PrimaryButton
          className="mt-5 w-full"
          disabled={amount <= 0}
          onClick={() => onLog({ servings: amount, meal })}
        >
          Log to diary
        </PrimaryButton>
      </div>
    </MobileSheet>
  )
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function CustomFoodEditorSheet({
  draft,
  saving,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  draft: CustomFoodDraft
  saving: boolean
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
            {draft.id ? "Edit food" : "New custom food"}
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
