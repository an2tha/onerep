import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { TourAnchor } from "@/components/walkthrough/tour-anchor"
import {
  ArrowLeft,
  Check,
  Printer,
  ShareNetwork,
  ShoppingCart,
  Trash,
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
  ParticleBurst,
  useReplayKey,
  toast,
} from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { hapticMedium, hapticSelection, hapticTap } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { cn } from "@/lib/utils"
import { downloadBlob } from "@/lib/data-export"
import type { Recipe } from "@/lib/food-log"
import {
  buildGroceryList,
  groceryItemAmount,
  groceryListToText,
  manualGroceryItem,
  sortGroceryItems,
  type GroceryItem,
} from "@/lib/grocery-list"

type StoredList = {
  _id: Id<"groceryLists">
  id?: string
  name: string
  items: GroceryItem[]
  updatedAt: number
}

type MealPrepBatch = {
  _id: string
  id?: string
  name: string
  servingsTotal: number
  sourceRecipeId?: string
}

/** Index route: existing lists plus the builder. */
export default function GroceryLists() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()

  const listsQuery = useQuery(api.logs.groceryLists.list, {})
  const recipesQuery = useQuery(api.logs.recipes.list, {})
  const batchesQuery = useQuery(api.logs.mealPrep.list, {})

  const saveList = useOfflineMutation(
    api.logs.groceryLists.save,
    "logs.groceryLists.save"
  )
  const removeList = useOfflineMutation(
    api.logs.groceryLists.remove,
    "logs.groceryLists.remove"
  )

  const recipes = useMemo(
    () => (recipesQuery ?? []) as Recipe[],
    [recipesQuery]
  )
  const batches = useMemo(
    () => (batchesQuery ?? []) as MealPrepBatch[],
    [batchesQuery]
  )
  const lists = (listsQuery ?? []) as StoredList[]

  const [selectedRecipes, setSelectedRecipes] = useState<
    Record<string, number>
  >({})
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set())
  const [name, setName] = useState("Grocery list")
  const [saving, setSaving] = useState(false)

  // Deep link from a recipe card: /nutrition/groceries?recipe=<id>
  const deepLinkRecipe = searchParams.get("recipe")
  useEffect(() => {
    if (!deepLinkRecipe) return
    setSelectedRecipes((current) =>
      current[deepLinkRecipe] === undefined
        ? { ...current, [deepLinkRecipe]: 0 }
        : current
    )
  }, [deepLinkRecipe])

  const recipesById = useMemo(
    () =>
      new Map(
        recipes
          .filter((recipe) => recipe._id)
          .map((recipe) => [recipe._id as string, recipe])
      ),
    [recipes]
  )

  const preview = useMemo(
    () =>
      buildGroceryList({
        recipes: Object.entries(selectedRecipes).flatMap(([id, servings]) => {
          const found = recipesById.get(id)
          return found
            ? [{ recipe: found, servings: servings > 0 ? servings : undefined }]
            : []
        }),
        batches: batches
          .filter((batch) => selectedBatches.has(batch._id))
          .map((batch) => ({
            sourceRecipeId: batch.sourceRecipeId,
            servingsTotal: batch.servingsTotal,
            name: batch.name,
          })),
        recipesById,
      }),
    [selectedRecipes, selectedBatches, batches, recipesById]
  )

  const nothingSelected =
    Object.keys(selectedRecipes).length === 0 && selectedBatches.size === 0

  async function handleCreate() {
    if (preview.items.length === 0) {
      toast.error("Pick at least one recipe with ingredients")
      return
    }
    setSaving(true)
    try {
      const id = await saveList({
        name,
        items: preview.items,
        sourceRecipeIds: Object.keys(selectedRecipes),
        sourceBatchIds: [...selectedBatches],
      })
      hapticSelection()
      toast.success("Grocery list created")
      setSelectedRecipes({})
      setSelectedBatches(new Set())
      if (id) navigate(`/nutrition/groceries/${id}`)
    } catch (error) {
      reportOfflineMutationError(error, "Could not create this list")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="native-page mx-auto min-h-svh w-full max-w-xl pb-[calc(var(--app-safe-bottom)+6rem)] text-foreground">
      <NavigationBar
        title="Grocery lists"
        subtitle="Build a shopping list from recipes"
        leading={
          <ToolbarButton
            onClick={() => navigate(-1)}
            aria-label="Back to nutrition"
            className="-ml-2 px-0 text-muted-foreground"
          >
            <ArrowLeft size={19} weight="bold" />
          </ToolbarButton>
        }
      />

      <div className="px-[var(--app-page-x)] pt-2">
        {lists.length > 0 && (
          <>
            <SectionHeader title="Your lists" />
            <GroupedList label="Saved grocery lists">
              {lists.map((stored) => {
                const remaining = stored.items.filter(
                  (entry) => !entry.checked
                ).length
                return (
                  <div
                    key={stored._id}
                    className="flex min-h-14 items-center justify-between gap-2 px-1 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/nutrition/groceries/${stored._id}`)
                      }
                      aria-label={`Open ${stored.name}`}
                      className="min-w-0 flex-1 text-left active:opacity-70"
                    >
                      <p className="native-row-title truncate">{stored.name}</p>
                      <p className="native-row-detail mt-0.5 tabular-nums">
                        {remaining} of {stored.items.length} left to buy
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await removeList({ id: stored._id })
                          toast.success("List deleted")
                        } catch (error) {
                          reportOfflineMutationError(
                            error,
                            "Could not delete this list"
                          )
                        }
                      }}
                      aria-label={`Delete ${stored.name}`}
                      className="native-toolbar-button h-11 w-11 px-0 text-destructive"
                    >
                      <Trash size={17} weight="bold" />
                    </button>
                  </div>
                )
              })}
            </GroupedList>
          </>
        )}

        <SectionHeader title="New list" />
        <label className="native-field">
          <span className="native-field-label">List name</span>
          <input
            value={name}
            aria-label="Grocery list name"
            onChange={(event) => setName(event.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-transparent px-3 outline-none"
          />
        </label>

        <TourAnchor anchor="groceries-sources" className="block">
          <SectionHeader title="Recipes" />
          {recipes.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              tone="food"
              title="No recipes yet"
              detail="Save a recipe with ingredients and it can feed a grocery list."
            />
          ) : (
            <GroupedList label="Recipes to shop for">
              {recipes.map((recipe) => {
                const id = recipe._id as string
                const selected = selectedRecipes[id] !== undefined
                const ingredientCount = recipe.ingredients?.length ?? 0
                return (
                  <div
                    key={id}
                    className="flex min-h-14 items-center justify-between gap-2 px-1 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        hapticTap()
                        setSelectedRecipes((current) => {
                          const next = { ...current }
                          if (selected) delete next[id]
                          else next[id] = 0
                          return next
                        })
                      }}
                      aria-label={`${selected ? "Remove" : "Add"} ${
                        recipe.name
                      } to the list`}
                      aria-pressed={selected}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-70"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border"
                        )}
                      >
                        {selected && <Check size={13} weight="bold" />}
                      </span>
                      <span className="min-w-0">
                        <span className="native-row-title block truncate">
                          {recipe.name}
                        </span>
                        <span className="native-row-detail block">
                          {ingredientCount === 0
                            ? "No ingredient data"
                            : `${ingredientCount} ingredients`}
                        </span>
                      </span>
                    </button>
                    {selected && (
                      <input
                        type="number"
                        min={1}
                        max={50}
                        placeholder={String(recipe.servings ?? 1)}
                        value={selectedRecipes[id] || ""}
                        aria-label={`Servings of ${recipe.name}`}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          setSelectedRecipes((current) => ({
                            ...current,
                            [id]: Number.isFinite(value) ? value : 0,
                          }))
                        }}
                        className="h-11 w-16 rounded-xl border border-border bg-transparent px-2 text-center tabular-nums outline-none"
                      />
                    )}
                  </div>
                )
              })}
            </GroupedList>
          )}

          {batches.length > 0 && (
            <>
              <SectionHeader title="Meal prep batches" />
              <GroupedList label="Batches to shop for">
                {batches.map((batch) => {
                  const shoppable = Boolean(batch.sourceRecipeId)
                  const selected = selectedBatches.has(batch._id)
                  return (
                    <button
                      key={batch._id}
                      type="button"
                      disabled={!shoppable}
                      onClick={() => {
                        hapticTap()
                        setSelectedBatches((current) => {
                          const next = new Set(current)
                          if (next.has(batch._id)) next.delete(batch._id)
                          else next.add(batch._id)
                          return next
                        })
                      }}
                      aria-pressed={selected}
                      aria-label={`${selected ? "Remove" : "Add"} ${
                        batch.name
                      } to the list`}
                      className="flex min-h-14 w-full items-center gap-2 px-1 py-2.5 text-left active:opacity-70 disabled:opacity-50"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border"
                        )}
                      >
                        {selected && <Check size={13} weight="bold" />}
                      </span>
                      <span className="min-w-0">
                        <span className="native-row-title block truncate">
                          {batch.name}
                        </span>
                        <span className="native-row-detail block">
                          {shoppable
                            ? `${batch.servingsTotal} servings`
                            : "No ingredient data: built without a recipe"}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </GroupedList>
            </>
          )}
        </TourAnchor>

        {!nothingSelected && (
          <>
            <SectionHeader title="Preview" />
            <SummaryBlock
              tone="food"
              title="Merged list"
              value={
                <span className="tabular-nums">
                  {preview.items.length} item
                  {preview.items.length === 1 ? "" : "s"}
                </span>
              }
              detail={
                preview.skippedBatches.length > 0
                  ? `Skipped: ${preview.skippedBatches.join(", ")}. No ingredient data.`
                  : "Ingredients naming the same food were combined."
              }
            />
            <PrimaryButton
              onClick={handleCreate}
              disabled={saving || preview.items.length === 0}
              aria-label="Create grocery list"
              className="mt-3 w-full"
            >
              {saving ? "Creating..." : "Create list"}
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  )
}

/** Detail route: the checkable list itself. */
export function GroceryListDetail() {
  const navigate = useSmoothNavigate()
  const params = useParams()
  const listId = params.id as Id<"groceryLists"> | undefined

  const listQuery = useQuery(
    api.logs.groceryLists.get,
    listId ? { id: listId } : "skip"
  )

  const setItemChecked = useOfflineMutation(
    api.logs.groceryLists.setItemChecked,
    "logs.groceryLists.setItemChecked"
  )
  const addItem = useOfflineMutation(
    api.logs.groceryLists.addItem,
    "logs.groceryLists.addItem"
  )
  const removeItem = useOfflineMutation(
    api.logs.groceryLists.removeItem,
    "logs.groceryLists.removeItem"
  )
  const clearChecked = useOfflineMutation(
    api.logs.groceryLists.clearChecked,
    "logs.groceryLists.clearChecked"
  )

  const [newItem, setNewItem] = useState("")

  const stored = (listQuery ?? undefined) as StoredList | null | undefined
  const items = useMemo(
    () => sortGroceryItems(stored?.items ?? []),
    [stored?.items]
  )

  // Clearing the list is worth marking, but you are standing in a shop — a
  // full-screen takeover would block the thing you came here to read.
  const clearedBurst = useReplayKey(1100)
  const replayCleared = clearedBurst.replay
  const everythingChecked =
    items.length > 0 && items.every((item) => item.checked)
  const previouslyCleared = useRef(everythingChecked)
  useEffect(() => {
    if (everythingChecked && !previouslyCleared.current) {
      replayCleared()
      hapticMedium()
    }
    previouslyCleared.current = everythingChecked
  }, [everythingChecked, replayCleared])

  // Grouped by aisle so the list matches the walk around the shop.
  const grouped = useMemo(() => {
    const map = new Map<string, GroceryItem[]>()
    for (const item of items) {
      const category = item.category ?? "Other"
      const bucket = map.get(category)
      if (bucket) bucket.push(item)
      else map.set(category, [item])
    }
    return [...map.entries()]
  }, [items])

  async function handleShare() {
    if (!stored) return
    const text = groceryListToText({ name: stored.name, items: stored.items })
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: stored.name, text })
        return
      }
      downloadBlob(
        new Blob([text], { type: "text/plain" }),
        `${stored.name.replace(/\s+/g, "-").toLowerCase()}.txt`
      )
    } catch (error) {
      // A user dismissing the share sheet is not a failure worth shouting about.
      if ((error as Error)?.name !== "AbortError") {
        toast.error("Could not share this list")
      }
    }
  }

  function handlePrint() {
    if (typeof window.print !== "function") {
      toast.error("Printing is not available on this device")
      return
    }
    window.print()
  }

  if (stored === null) {
    return (
      <div className="native-page mx-auto min-h-svh w-full max-w-xl text-foreground">
        <NavigationBar
          title="Grocery list"
          leading={
            <ToolbarButton
              onClick={() => navigate("/nutrition/groceries")}
              aria-label="Back to grocery lists"
              className="-ml-2 px-0 text-muted-foreground"
            >
              <ArrowLeft size={19} weight="bold" />
            </ToolbarButton>
          }
        />
        <EmptyState
          icon={ShoppingCart}
          title="List not found"
          detail="It may have been deleted."
        />
      </div>
    )
  }

  const remaining = items.filter((item) => !item.checked).length

  return (
    <div className="native-page print-sheet relative mx-auto min-h-svh w-full max-w-xl pb-[calc(var(--app-safe-bottom)+6rem)] text-foreground">
      <ParticleBurst
        replayKey={clearedBurst.active ? clearedBurst.key : 0}
        variant="rise"
        count={12}
        color="var(--accent-food)"
        className="print-hidden h-32"
      />
      <NavigationBar
        className="print-hidden"
        title={stored?.name ?? "Grocery list"}
        subtitle={stored ? `${remaining} left to buy` : undefined}
        leading={
          <ToolbarButton
            onClick={() => navigate("/nutrition/groceries")}
            aria-label="Back to grocery lists"
            className="-ml-2 px-0 text-muted-foreground"
          >
            <ArrowLeft size={19} weight="bold" />
          </ToolbarButton>
        }
        trailing={
          <div className="flex items-center gap-1">
            <ToolbarButton
              onClick={handleShare}
              aria-label="Share grocery list"
            >
              <ShareNetwork size={19} weight="bold" />
            </ToolbarButton>
            <ToolbarButton
              onClick={handlePrint}
              aria-label="Print grocery list"
            >
              <Printer size={19} weight="bold" />
            </ToolbarButton>
          </div>
        }
      />

      <div className="px-[var(--app-page-x)] pt-2">
        <div className="print-hidden flex items-center gap-2">
          <input
            value={newItem}
            placeholder="Add an item"
            aria-label="Add a grocery item"
            onChange={(event) => setNewItem(event.target.value)}
            className="h-11 flex-1 rounded-xl border border-border bg-transparent px-3 outline-none"
          />
          <PrimaryButton
            aria-label="Add item to list"
            onClick={async () => {
              const created = manualGroceryItem(newItem)
              if (!created || !listId) return
              try {
                await addItem({ id: listId, item: created })
                setNewItem("")
              } catch (error) {
                reportOfflineMutationError(error, "Could not add this item")
              }
            }}
          >
            Add
          </PrimaryButton>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            tone="food"
            title="Nothing on this list"
            detail="Add an item above, or build a new list from your recipes."
          />
        ) : (
          grouped.map(([category, categoryItems]) => (
            <div key={category} className="print-block">
              <SectionHeader title={category} />
              <GroupedList label={`${category} items`}>
                {categoryItems.map((item) => {
                  const amount = groceryItemAmount(item)
                  return (
                    <div
                      key={item.id}
                      className="flex min-h-14 items-center gap-2 px-1 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          if (!listId) return
                          hapticTap()
                          try {
                            await setItemChecked({
                              id: listId,
                              itemId: item.id,
                              checked: !item.checked,
                            })
                          } catch (error) {
                            reportOfflineMutationError(
                              error,
                              "Could not update this item"
                            )
                          }
                        }}
                        role="checkbox"
                        aria-checked={item.checked}
                        aria-label={`Toggle ${item.name}`}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-70"
                      >
                        <span
                          data-checked={item.checked}
                          className={cn(
                            "motion-checkbox flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                            item.checked
                              ? "border-foreground bg-foreground text-background"
                              : "border-border"
                          )}
                        >
                          {item.checked && <Check size={13} weight="bold" />}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "motion-row-checked native-row-title block truncate",
                              item.checked &&
                                "text-muted-foreground line-through"
                            )}
                          >
                            {item.name}
                          </span>
                          {(amount || item.sources?.length) && (
                            <span className="native-row-detail block truncate tabular-nums">
                              {amount}
                              {amount && item.sources?.length ? " · " : ""}
                              {item.sources?.join(", ")}
                            </span>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!listId) return
                          try {
                            await removeItem({ id: listId, itemId: item.id })
                          } catch (error) {
                            reportOfflineMutationError(
                              error,
                              "Could not remove this item"
                            )
                          }
                        }}
                        aria-label={`Remove ${item.name}`}
                        className="native-toolbar-button print-hidden h-11 w-11 px-0 text-destructive"
                      >
                        <Trash size={17} weight="bold" />
                      </button>
                    </div>
                  )
                })}
              </GroupedList>
            </div>
          ))
        )}

        {items.some((item) => item.checked) && (
          <button
            type="button"
            onClick={async () => {
              if (!listId) return
              try {
                await clearChecked({ id: listId })
                toast.success("Cleared what you already have")
              } catch (error) {
                reportOfflineMutationError(error, "Could not clear these items")
              }
            }}
            aria-label="Clear checked items"
            className="native-toolbar-button print-hidden mt-3 h-11 w-full justify-center px-3"
          >
            Clear checked
          </button>
        )}
      </div>
    </div>
  )
}
