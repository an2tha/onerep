import { useMemo, useState } from "react"
import {
  ArrowLeft,
  BowlFood,
  Minus,
  PencilSimple,
  Plus,
  ShoppingCart,
  Snowflake,
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
  SummaryBlock,
  ToolbarButton,
  useTransientFlag,
  toast,
} from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { MobileSheet } from "@/components/mobile-sheet"
import { hapticSelection, hapticTap } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { carbLabelLower, displayCarbs } from "@/lib/carb-display"
import { useCarbDisplayMode } from "@/lib/use-carb-display"
import { cn } from "@/lib/utils"
import { useEnergyUnit } from "@/lib/use-energy-unit"
import { energyDisplay } from "@repo/ui"
import {
  currentDateKey,
  DEFAULT_MEAL_CATEGORIES,
  mealLabel,
  type Recipe,
} from "@/lib/food-log"
import {
  MEAL_PREP_STORAGE_OPTIONS,
  batchIsEmpty,
  emptyMealPrepDraft,
  foodLogEntryFromMealPrep,
  formatServings,
  mealPrepDraftFromBatch,
  mealPrepDraftFromRecipe,
  mealPrepFreshness,
  mealPrepInventory,
  resolveMealPrepDraft,
  servingsRemaining,
  sortMealPrepBatches,
  suggestedUseByDate,
  type MealPrepBatch,
  type MealPrepDraft,
  type MealPrepStorage,
} from "@/lib/meal-prep"

const SERVING_STEPS = [0.5, 1, 2]

export default function MealPrep() {
  const energyUnit = useEnergyUnit()
  const navigate = useSmoothNavigate()
  const today = currentDateKey()

  const batchesQuery = useQuery(api.logs.mealPrep.list, {})
  const recipesQuery = useQuery(api.logs.recipes.list, {})

  const saveBatch = useOfflineMutation(
    api.logs.mealPrep.save,
    "logs.mealPrep.save"
  )
  const consumeBatch = useOfflineMutation(
    api.logs.mealPrep.consume,
    "logs.mealPrep.consume"
  )
  const removeBatch = useOfflineMutation(
    api.logs.mealPrep.remove,
    "logs.mealPrep.remove"
  )
  const addFoodEntry = useOfflineMutation(
    api.logs.foodLogs.addEntry,
    "logs.foodLogs.addEntry"
  )

  const [editorDraft, setEditorDraft] = useState<MealPrepDraft | null>(null)
  const [recipePickerOpen, setRecipePickerOpen] = useState(false)
  const [savingBatch, setSavingBatch] = useState(false)
  const [busyBatchId, setBusyBatchId] = useState<string | null>(null)
  const [showEmptied, setShowEmptied] = useState(false)

  const batches = useMemo(
    () => sortMealPrepBatches((batchesQuery ?? []) as MealPrepBatch[], today),
    [batchesQuery, today]
  )
  const recipes = (recipesQuery ?? []) as Recipe[]
  const inventory = useMemo(
    () => mealPrepInventory(batches, today),
    [batches, today]
  )

  // A batch that just emptied is held in the active group for the length of
  // the collapse, so it animates out instead of teleporting to "Finished".
  const [collapsingId, setCollapsingId] = useState<string | null>(null)
  const loggedFlag = useTransientFlag()

  const activeBatches = batches.filter(
    (batch) => !batchIsEmpty(batch) || (batch.id ?? batch._id) === collapsingId
  )
  const emptiedBatches = batches.filter(
    (batch) => batchIsEmpty(batch) && (batch.id ?? batch._id) !== collapsingId
  )
  const loading = batchesQuery === undefined

  async function handleLogServings(batch: MealPrepBatch, servings: number) {
    const id = batch.id ?? batch._id
    if (!id) return

    const remaining = servingsRemaining(batch)
    if (servings > 0 && remaining <= 0) {
      toast.error("This batch is finished")
      return
    }

    const amount = servings > 0 ? Math.min(servings, remaining) : servings
    setBusyBatchId(id)
    hapticSelection()

    try {
      if (amount > 0) {
        await addFoodEntry({
          date: today,
          entry: foodLogEntryFromMealPrep(batch, { servings: amount }),
        })
      }
      await consumeBatch({ id: id as Id<"mealPrepBatches">, servings: amount })
      if (amount > 0) {
        loggedFlag.flag(id)
        if (amount >= remaining) {
          setCollapsingId(id)
          window.setTimeout(() => setCollapsingId(null), 320)
        }
      }
      toast.success(
        amount > 0
          ? `Logged ${formatServings(amount)} serving${
              amount === 1 ? "" : "s"
            } of ${batch.name}`
          : `Put back ${formatServings(Math.abs(amount))} serving${
              amount === -1 ? "" : "s"
            }`
      )
    } catch (error) {
      reportOfflineMutationError(error, "Could not update this batch")
    } finally {
      setBusyBatchId(null)
    }
  }

  async function handleSaveBatch() {
    if (!editorDraft) return
    const resolved = resolveMealPrepDraft(editorDraft)
    if (!resolved.valid) {
      toast.error(
        resolved.errors.name ??
          resolved.errors.servingsTotal ??
          resolved.errors.nutrition ??
          "Check the batch details"
      )
      return
    }

    setSavingBatch(true)
    try {
      await saveBatch({
        id: editorDraft.id
          ? (editorDraft.id as Id<"mealPrepBatches">)
          : undefined,
        name: editorDraft.name.trim(),
        meal: editorDraft.meal,
        notes: editorDraft.notes.trim() || undefined,
        preppedOn: editorDraft.preppedOn,
        useByOn: editorDraft.useByOn || undefined,
        storage: editorDraft.storage,
        servingsTotal: resolved.servingsTotal,
        nutrientsPerServing: resolved.nutrientsPerServing,
        sourceRecipeId: editorDraft.sourceRecipeId,
      })
      toast.success(editorDraft.id ? "Batch updated" : "Batch added")
      setEditorDraft(null)
    } catch (error) {
      reportOfflineMutationError(error, "Could not save this batch")
    } finally {
      setSavingBatch(false)
    }
  }

  async function handleRemoveBatch(batch: MealPrepBatch) {
    const id = batch.id ?? batch._id
    if (!id) return
    try {
      await removeBatch({ id: id as Id<"mealPrepBatches"> })
      toast.success("Batch deleted")
      setEditorDraft(null)
    } catch (error) {
      reportOfflineMutationError(error, "Could not delete this batch")
    }
  }

  return (
    <div className="native-page mx-auto min-h-svh w-full max-w-xl pb-[calc(var(--app-safe-bottom)+6rem)] text-foreground">
      <NavigationBar
        title="Meal prep"
        subtitle="Cook once, log all week"
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
              setEditorDraft(emptyMealPrepDraft(today))
            }}
            aria-label="Add meal prep batch"
          >
            <Plus size={19} weight="bold" />
          </ToolbarButton>
        }
      />

      <div className="px-[var(--app-page-x)] pt-2">
        <SummaryBlock
          tone="food"
          title="In the fridge"
          value={
            <span className="tabular-nums">
              {formatServings(inventory.servings)} serving
              {inventory.servings === 1 ? "" : "s"}
            </span>
          }
          detail={
            inventory.batches === 0
              ? "No prepped batches yet."
              : `${inventory.batches} batch${
                  inventory.batches === 1 ? "" : "es"
                } · ${energyDisplay(inventory.calories, energyUnit)} ${energyUnit} · ${inventory.protein} g protein ready to eat`
          }
        />
        {inventory.expiringSoon > 0 && (
          <p
            role="status"
            className="mt-2 flex items-center gap-2 text-[13px] text-[var(--accent-food)]"
          >
            <Warning size={15} weight="bold" aria-hidden />
            {inventory.expiringSoon} batch
            {inventory.expiringSoon === 1 ? "" : "es"} need eating soon
          </p>
        )}
      </div>

      {loading ? (
        <p className="px-[var(--app-page-x)] pt-8 text-[15px] text-muted-foreground">
          Loading batches…
        </p>
      ) : activeBatches.length === 0 ? (
        <div className="pt-6">
          <EmptyState
            icon={BowlFood}
            tone="food"
            title="No batches prepped"
            detail="Add what you cooked and how many servings it made. Logging a portion then takes one tap."
            action={
              <PrimaryButton
                onClick={() => setEditorDraft(emptyMealPrepDraft(today))}
              >
                Add a batch
              </PrimaryButton>
            }
          />
          {recipes.length > 0 && (
            <div className="px-[var(--app-page-x)] pt-4">
              <button
                type="button"
                onClick={() => setRecipePickerOpen(true)}
                className="native-secondary-button w-full"
              >
                Start from a saved recipe
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <SectionHeader
            title="Ready to eat"
            subtitle={`${activeBatches.length} batch${
              activeBatches.length === 1 ? "" : "es"
            }`}
            action={
              recipes.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setRecipePickerOpen(true)}
                  className="text-[14px] font-semibold text-[var(--accent-food)]"
                >
                  From recipe
                </button>
              ) : undefined
            }
          />
          <GroupedList label="Prepped batches">
            {activeBatches.map((batch) => {
              const batchId = batch.id ?? batch._id
              return (
                <BatchRow
                  key={batchId ?? batch.name}
                  batch={batch}
                  today={today}
                  busy={busyBatchId === batchId}
                  className={cn(
                    batchId &&
                      loggedFlag.flagged(batchId) &&
                      "motion-success-pop",
                    batchId === collapsingId && "motion-collapse-out"
                  )}
                  onLog={(servings) => void handleLogServings(batch, servings)}
                  onEdit={() => setEditorDraft(mealPrepDraftFromBatch(batch))}
                />
              )
            })}
          </GroupedList>
        </>
      )}

      {emptiedBatches.length > 0 && (
        <>
          <SectionHeader
            title="Finished"
            action={
              <button
                type="button"
                onClick={() => setShowEmptied((open) => !open)}
                className="text-[14px] font-semibold text-[var(--accent-food)]"
                aria-expanded={showEmptied}
              >
                {showEmptied ? "Hide" : `Show ${emptiedBatches.length}`}
              </button>
            }
          />
          {showEmptied && (
            <GroupedList label="Finished batches">
              {emptiedBatches.map((batch) => (
                <div
                  key={batch.id ?? batch._id ?? batch.name}
                  className="native-list-row justify-between opacity-70"
                >
                  <span className="min-w-0">
                    <span className="native-row-title block truncate">
                      {batch.name}
                    </span>
                    <span className="native-row-detail block">
                      Prepped {batch.preppedOn} · all{" "}
                      {formatServings(batch.servingsTotal)} servings eaten
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveBatch(batch)}
                    className="native-toolbar-button h-11 w-11 shrink-0 px-0 text-muted-foreground"
                    aria-label={`Delete ${batch.name}`}
                  >
                    <Trash size={17} weight="bold" />
                  </button>
                </div>
              ))}
            </GroupedList>
          )}
        </>
      )}

      {recipePickerOpen && (
        <MobileSheet
          onClose={() => setRecipePickerOpen(false)}
          panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-hidden rounded-t-2xl border-t border-border bg-card"
          maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
        >
          <div className="px-5 pt-4 pb-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-[21px] font-semibold">Prep from a recipe</h2>
              <button
                type="button"
                onClick={() => setRecipePickerOpen(false)}
                className="native-toolbar-button -mt-1 -mr-2 px-0 text-muted-foreground"
                aria-label="Close recipe picker"
              >
                <X size={17} weight="bold" />
              </button>
            </div>
            <div className="divide-y divide-border border-y border-border">
              {recipes.map((recipe) => (
                <button
                  key={recipe._id ?? recipe.name}
                  type="button"
                  onClick={() => {
                    setRecipePickerOpen(false)
                    setEditorDraft(mealPrepDraftFromRecipe(recipe, today))
                  }}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left active:bg-muted/40"
                >
                  <span className="min-w-0">
                    <span className="native-row-title block truncate">
                      {recipe.name}
                    </span>
                    <span className="native-row-detail block">
                      {recipe.ingredients.length} ingredient
                      {recipe.ingredients.length === 1 ? "" : "s"}
                      {recipe.servings ? ` · ${recipe.servings} servings` : ""}
                    </span>
                  </span>
                  <Plus size={17} weight="bold" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        </MobileSheet>
      )}

      {editorDraft && (
        <BatchEditorSheet
          draft={editorDraft}
          saving={savingBatch}
          onChange={setEditorDraft}
          onClose={() => setEditorDraft(null)}
          onSave={() => void handleSaveBatch()}
          onDelete={
            editorDraft.id
              ? () => {
                  const batch = batches.find(
                    (item) => (item.id ?? item._id) === editorDraft.id
                  )
                  if (batch) void handleRemoveBatch(batch)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

// ─── Batch row ────────────────────────────────────────────────────────────────

function BatchRow({
  batch,
  today,
  busy,
  className,
  onLog,
  onEdit,
}: {
  batch: MealPrepBatch
  today: string
  busy: boolean
  className?: string
  onLog: (servings: number) => void
  onEdit: () => void
}) {
  const energyUnit = useEnergyUnit()
  const navigate = useSmoothNavigate()
  const carbMode = useCarbDisplayMode()
  const remaining = servingsRemaining(batch)
  const freshness = mealPrepFreshness(batch, today)
  const perServing = batch.nutrientsPerServing

  return (
    <div
      className={cn("native-list-row flex-col items-stretch gap-3", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="native-row-title truncate">{batch.name}</p>
          <p className="native-row-detail mt-0.5 tabular-nums">
            {energyDisplay(perServing.calories, energyUnit)} {energyUnit} ·{" "}
            {perServing.protein} P ·{" "}
            {Math.round(displayCarbs(perServing, carbMode))}{" "}
            {carbMode === "net" ? "NC" : "C"} · {perServing.fat} F per serving
          </p>
          <p
            className={cn(
              "native-row-detail mt-0.5 flex items-center gap-1.5",
              freshness.status === "expired" && "text-destructive",
              freshness.status === "use-soon" && "text-[var(--accent-food)]"
            )}
          >
            {batch.storage === "freezer" && (
              <Snowflake size={13} weight="bold" aria-hidden />
            )}
            {freshness.label}
            {batch.meal ? ` · ${mealLabel(batch.meal)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="native-row-value tabular-nums">
            {formatServings(remaining)} left
          </span>
          {/* Only batches built from a recipe carry ingredients to shop for. */}
          {batch.sourceRecipeId && (
            <button
              type="button"
              onClick={() =>
                navigate(`/nutrition/groceries?recipe=${batch.sourceRecipeId}`)
              }
              className="native-toolbar-button h-10 w-10 px-0 text-muted-foreground"
              aria-label={`Shop for ${batch.name}`}
            >
              <ShoppingCart size={16} weight="bold" />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="native-toolbar-button h-10 w-10 px-0 text-muted-foreground"
            aria-label={`Edit ${batch.name}`}
          >
            <PencilSimple size={16} weight="bold" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onLog(-1)}
          disabled={busy || batch.servingsLogged <= 0}
          className="native-toolbar-button h-10 w-10 shrink-0 px-0 text-muted-foreground disabled:opacity-40"
          aria-label={`Undo one logged serving of ${batch.name}`}
        >
          <Minus size={16} weight="bold" />
        </button>
        {SERVING_STEPS.map((servings) => (
          <button
            key={servings}
            type="button"
            onClick={() => onLog(servings)}
            disabled={busy || remaining <= 0}
            aria-busy={busy}
            aria-label={`Log ${formatServings(servings)} serving${
              servings === 1 ? "" : "s"
            } of ${batch.name}`}
            className="native-secondary-button h-10 flex-1 text-[14px] font-semibold disabled:opacity-40"
          >
            +{formatServings(servings)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function BatchEditorSheet({
  draft,
  saving,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  draft: MealPrepDraft
  saving: boolean
  onChange: (draft: MealPrepDraft) => void
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
}) {
  const energyUnit = useEnergyUnit()
  const carbMode = useCarbDisplayMode()
  const resolved = resolveMealPrepDraft(draft)
  const perServing = resolved.nutrientsPerServing

  const update = (patch: Partial<MealPrepDraft>) =>
    onChange({ ...draft, ...patch })

  return (
    <MobileSheet
      onClose={onClose}
      panelClassName="sheet-panel mx-auto w-full max-w-sm overflow-y-auto rounded-t-2xl border-t border-border bg-card"
      maxHeight="calc(100svh - var(--app-safe-top) - 0.75rem)"
    >
      <div className="px-5 pt-4 pb-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-[21px] font-semibold">
            {draft.id ? "Edit batch" : "New batch"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="native-toolbar-button -mt-1 -mr-2 px-0 text-muted-foreground"
            aria-label="Close batch editor"
          >
            <X size={17} weight="bold" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="native-field">
            <span className="native-field-label">What did you cook?</span>
            <input
              className="native-input"
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="Chicken and rice"
              autoFocus={!draft.id}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="native-field">
              <span className="native-field-label">Servings made</span>
              <input
                className="native-input"
                inputMode="decimal"
                value={draft.servingsTotal}
                onChange={(event) =>
                  update({ servingsTotal: event.target.value })
                }
              />
            </label>
            <label className="native-field">
              <span className="native-field-label">Default meal</span>
              <select
                className="native-input"
                value={draft.meal}
                onChange={(event) => update({ meal: event.target.value })}
              >
                {DEFAULT_MEAL_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="native-field-label mb-2">
              Nutrition for the whole batch
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  // Editable field: stored in kcal, so labelled in kcal.
                  ["calories", "Calories (kcal)"],
                  ["protein", "Protein (g)"],
                  ["carbs", "Carbs (g)"],
                  ["fat", "Fat (g)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="native-field">
                  <span className="native-field-label">{label}</span>
                  <input
                    className="native-input"
                    inputMode="decimal"
                    value={draft.batchNutrients[key]}
                    onChange={(event) =>
                      update({
                        batchNutrients: {
                          ...draft.batchNutrients,
                          [key]: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <p className="native-field-hint mt-2 tabular-nums">
              Per serving: {energyDisplay(perServing.calories, energyUnit)}{" "}
              {energyUnit} · {perServing.protein} g protein ·{" "}
              {Math.round(displayCarbs(perServing, carbMode))} g{" "}
              {carbLabelLower(carbMode)} · {perServing.fat} g fat
            </p>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className="native-field">
              <span className="native-field-label">Prepped on</span>
              <input
                type="date"
                className="native-input"
                value={draft.preppedOn}
                onChange={(event) =>
                  update({
                    preppedOn: event.target.value,
                    useByOn: suggestedUseByDate(
                      event.target.value,
                      draft.storage
                    ),
                  })
                }
              />
            </label>
            <label className="native-field">
              <span className="native-field-label">Use by</span>
              <input
                type="date"
                className="native-input"
                value={draft.useByOn}
                onChange={(event) => update({ useByOn: event.target.value })}
              />
            </label>
          </div>

          <div>
            <span className="native-field-label">Stored in</span>
            <div className="mt-2 flex gap-2">
              {MEAL_PREP_STORAGE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={draft.storage === option.id}
                  onClick={() =>
                    update({
                      storage: option.id as MealPrepStorage,
                      useByOn: suggestedUseByDate(draft.preppedOn, option.id),
                    })
                  }
                  className={cn(
                    "native-secondary-button h-10 flex-1 text-[14px]",
                    draft.storage === option.id &&
                      "border-[var(--accent-food)] text-[var(--accent-food)]"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="native-field">
            <span className="native-field-label">Notes (optional)</span>
            <input
              className="native-input"
              value={draft.notes}
              onChange={(event) => update({ notes: event.target.value })}
              placeholder="Two containers in the top shelf"
            />
          </label>
        </div>

        <PrimaryButton
          className="mt-5 w-full"
          onClick={onSave}
          disabled={saving}
          aria-busy={saving}
        >
          {saving ? "Saving…" : draft.id ? "Save changes" : "Add batch"}
        </PrimaryButton>

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 text-[15px] font-semibold text-destructive"
          >
            <Trash size={16} weight="bold" aria-hidden />
            Delete batch
          </button>
        )}
      </div>
    </MobileSheet>
  )
}
