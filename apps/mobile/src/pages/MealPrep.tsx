import { Message, choice, tr, translateError } from "@repo/ui/i18n"
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
import { announceOrbActivity } from "@/lib/orb-activity"
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
      toast.error(translateError(tr("This batch is finished")))
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
        announceOrbActivity("log")
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
          ? tr("Logged {{value0}} serving{{value1}} of {{value2}}", {
              value0: formatServings(amount),
              value1: amount === 1 ? "" : "s",
              value2: batch.name,
            })
          : tr("Put back {{value0}} serving{{value1}}", {
              value0: formatServings(Math.abs(amount)),
              value1: amount === -1 ? "" : "s",
            })
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
        translateError(
          resolved.errors.name ??
            resolved.errors.servingsTotal ??
            resolved.errors.nutrition ??
            tr("Check the batch details")
        )
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
      toast.success(editorDraft.id ? tr("Batch updated") : tr("Batch added"))
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
      toast.success(tr("Batch deleted"))
      setEditorDraft(null)
    } catch (error) {
      reportOfflineMutationError(error, "Could not delete this batch")
    }
  }

  return (
    <div className="native-page mx-auto min-h-svh w-full max-w-xl pb-[calc(var(--app-safe-bottom)+6rem)] text-foreground">
      <NavigationBar
        title={tr("Meal prep")}
        subtitle={tr("Cook once, log all week")}
        leading={
          <ToolbarButton
            onClick={() => navigate(-1)}
            aria-label={tr("Back to nutrition")}
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
            aria-label={tr("Add meal prep batch")}
          >
            <Plus size={19} weight="bold" />
          </ToolbarButton>
        }
      />

      <div className="px-[var(--app-page-x)] pt-2">
        <SummaryBlock
          tone="food"
          title={tr("In the fridge")}
          value={
            <span className="tabular-nums">
              <Message
                text={"{{value0}} serving{{value1}}"}
                values={{
                  value0: formatServings(inventory.servings),
                  value1: inventory.servings === 1 ? "" : "s",
                }}
              />
            </span>
          }
          detail={
            inventory.batches === 0
              ? tr("No prepped batches yet.")
              : tr(
                  "{{value0}} batch{{value1}} · {{value2}} {{value3}} · {{value4}} g protein ready to eat",
                  {
                    value0: inventory.batches,
                    value1: choice(inventory.batches === 1 ? "" : "es"),
                    value2: energyDisplay(inventory.calories, energyUnit),
                    value3: energyUnit,
                    value4: inventory.protein,
                  }
                )
          }
        />
        {inventory.expiringSoon > 0 && (
          <p
            role="status"
            className="mt-2 flex items-center gap-2 text-[13px] text-[var(--accent-food)]"
          >
            <Message
              text={"{{value0}}{{value1}} batch{{value2}} need eating soon"}
              values={{
                value0: <Warning size={15} weight="bold" aria-hidden />,
                value1: inventory.expiringSoon,
                value2: choice(inventory.expiringSoon === 1 ? "" : "es"),
              }}
            />
          </p>
        )}
      </div>

      {loading ? (
        <p className="px-[var(--app-page-x)] pt-8 text-[15px] text-muted-foreground">
          {tr("Loading batches…")}
        </p>
      ) : activeBatches.length === 0 ? (
        <div className="pt-6">
          <EmptyState
            icon={BowlFood}
            tone="food"
            title={tr("No batches prepped")}
            detail={tr(
              "Add what you cooked and how many servings it made. Logging a portion then takes one tap."
            )}
            action={
              <PrimaryButton
                onClick={() => setEditorDraft(emptyMealPrepDraft(today))}
              >
                {tr("Add a batch")}
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
                {tr("Start from a saved recipe")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <SectionHeader
            title={tr("Ready to eat")}
            subtitle={tr("{{value0}} batch{{value1}}", {
              value0: activeBatches.length,
              value1: choice(activeBatches.length === 1 ? "" : "es"),
            })}
            action={
              recipes.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setRecipePickerOpen(true)}
                  className="text-[14px] font-semibold text-[var(--accent-food)]"
                >
                  {tr("From recipe")}
                </button>
              ) : undefined
            }
          />
          <GroupedList label={tr("Prepped batches")}>
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
            title={tr("Finished")}
            action={
              <button
                type="button"
                onClick={() => setShowEmptied((open) => !open)}
                className="text-[14px] font-semibold text-[var(--accent-food)]"
                aria-expanded={showEmptied}
              >
                {showEmptied
                  ? tr("Hide")
                  : tr("Show {{value0}}", { value0: emptiedBatches.length })}
              </button>
            }
          />
          {showEmptied && (
            <GroupedList label={tr("Finished batches")}>
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
                      <Message
                        text={
                          "Prepped {{value0}} · all {{value1}} servings eaten"
                        }
                        values={{
                          value0: batch.preppedOn,
                          value1: formatServings(batch.servingsTotal),
                        }}
                      />
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveBatch(batch)}
                    className="native-toolbar-button h-11 w-11 shrink-0 px-0 text-muted-foreground"
                    aria-label={tr("Delete {{value0}}", { value0: batch.name })}
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
              <h2 className="text-[21px] font-semibold">
                {tr("Prep from a recipe")}
              </h2>
              <button
                type="button"
                onClick={() => setRecipePickerOpen(false)}
                className="native-toolbar-button -mt-1 -mr-2 px-0 text-muted-foreground"
                aria-label={tr("Close recipe picker")}
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
                      <Message
                        text={"{{value0}} ingredient{{value1}}{{value2}}"}
                        values={{
                          value0: recipe.ingredients.length,
                          value1: recipe.ingredients.length === 1 ? "" : "s",
                          value2: recipe.servings
                            ? tr(" · {{value0}} servings", {
                                value0: recipe.servings,
                              })
                            : "",
                        }}
                      />
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
            <Message
              text={
                "{{value0}}  {{value1}} · {{value2}} P · {{value3}} {{value4}} · {{value5}} F per serving"
              }
              values={{
                value0: energyDisplay(perServing.calories, energyUnit),
                value1: energyUnit,
                value2: perServing.protein,
                value3: Math.round(displayCarbs(perServing, carbMode)),
                value4: choice(carbMode === "net" ? "NC" : "C"),
                value5: perServing.fat,
              }}
            />
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
            {batch.meal
              ? tr(" · {{value0}}", { value0: mealLabel(batch.meal) })
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="native-row-value tabular-nums">
            <Message
              text={"{{value0}} left"}
              values={{ value0: formatServings(remaining) }}
            />
          </span>
          {/* Only batches built from a recipe carry ingredients to shop for. */}
          {batch.sourceRecipeId && (
            <button
              type="button"
              onClick={() =>
                navigate(`/nutrition/groceries?recipe=${batch.sourceRecipeId}`)
              }
              className="native-toolbar-button h-10 w-10 px-0 text-muted-foreground"
              aria-label={tr("Shop for {{value0}}", { value0: batch.name })}
            >
              <ShoppingCart size={16} weight="bold" />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="native-toolbar-button h-10 w-10 px-0 text-muted-foreground"
            aria-label={tr("Edit {{value0}}", { value0: batch.name })}
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
          aria-label={tr("Undo one logged serving of {{value0}}", {
            value0: batch.name,
          })}
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
            aria-label={tr("Log {{value0}} serving{{value1}} of {{value2}}", {
              value0: formatServings(servings),
              value1: servings === 1 ? "" : "s",
              value2: batch.name,
            })}
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
            {draft.id ? tr("Edit batch") : tr("New batch")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="native-toolbar-button -mt-1 -mr-2 px-0 text-muted-foreground"
            aria-label={tr("Close batch editor")}
          >
            <X size={17} weight="bold" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="native-field">
            <span className="native-field-label">
              {tr("What did you cook?")}
            </span>
            <input
              className="native-input"
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder={tr("Chicken and rice")}
              autoFocus={!draft.id}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="native-field">
              <span className="native-field-label">{tr("Servings made")}</span>
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
              <span className="native-field-label">{tr("Default meal")}</span>
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
              {tr("Nutrition for the whole batch")}
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
              <Message
                text={
                  "Per serving: {{value0}} {{value1}} · {{value2}} g protein · {{value3}} g {{value4}} · {{value5}} g fat"
                }
                values={{
                  value0: energyDisplay(perServing.calories, energyUnit),
                  value1: energyUnit,
                  value2: perServing.protein,
                  value3: Math.round(displayCarbs(perServing, carbMode)),
                  value4: carbLabelLower(carbMode),
                  value5: perServing.fat,
                }}
              />
            </p>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className="native-field">
              <span className="native-field-label">{tr("Prepped on")}</span>
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
              <span className="native-field-label">{tr("Use by")}</span>
              <input
                type="date"
                className="native-input"
                value={draft.useByOn}
                onChange={(event) => update({ useByOn: event.target.value })}
              />
            </label>
          </div>

          <div>
            <span className="native-field-label">{tr("Stored in")}</span>
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
            <span className="native-field-label">{tr("Notes (optional)")}</span>
            <input
              className="native-input"
              value={draft.notes}
              onChange={(event) => update({ notes: event.target.value })}
              placeholder={tr("Two containers in the top shelf")}
            />
          </label>
        </div>

        <PrimaryButton
          className="mt-5 w-full"
          onClick={onSave}
          disabled={saving}
          aria-busy={saving}
        >
          {saving
            ? tr("Saving…")
            : draft.id
              ? tr("Save changes")
              : tr("Add batch")}
        </PrimaryButton>

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 text-[15px] font-semibold text-destructive"
          >
            <Message
              text={"{{value0}}Delete batch"}
              values={{ value0: <Trash size={16} weight="bold" aria-hidden /> }}
            />
          </button>
        )}
      </div>
    </MobileSheet>
  )
}
