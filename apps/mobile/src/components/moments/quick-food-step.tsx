import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowClockwise,
  BookmarkSimple,
  CaretLeft,
  ForkKnife,
  MagnifyingGlass,
} from "@phosphor-icons/react"
import {
  MomentPrimaryAction,
  MomentRow,
  MomentScreen,
  MomentSecondaryAction,
  toast,
} from "@repo/ui"
import { api } from "../../../../../convex/_generated/api"
import { useSmoothNavigate } from "@/lib/navigation"
import { useEnergyUnit, type EnergyUnit } from "@/lib/use-energy-unit"
import { energyDisplay } from "@repo/ui"
import { hapticMedium, hapticSelection } from "@/lib/haptics"
import { createClientId, logDevWarn } from "@/lib/utils"
import { recipeTotals } from "@/lib/coach-chat"
import {
  defaultMeal,
  foodLogEntriesFromMealPreset,
  foodLogEntryFromFoodResult,
  stripUndefined,
  type FoodLogEntry,
  type FoodPortion,
  type LogMicros,
  type MealType,
} from "@/lib/food-log"
import { normalizeFoodSearchQuery } from "@/lib/food-search-url"
import type { FoodDetail, FoodResult } from "@repo/models"
import { buildQuickRepeatFoods } from "@/lib/food-quick-repeat"
import { searchFoodsAccurate } from "@/lib/openfoodfacts"
import { FoodDetailSheet } from "@/components/food-detail-sheet"
import type { FullScreenEventOutcome } from "@/lib/full-screen-events"

/** Enough to cover a day; more turns a shortcut back into a browse. */
const PER_SECTION = 5

/**
 * Shorter lists and a slightly lazier debounce than the search page: this is
 * a panel inside a nudge, not a screen somebody came to browse.
 */
const SEARCH_DEBOUNCE_MS = 340
const SEARCH_RESULT_LIMIT = 8
const SEARCH_FETCH_LIMIT = 24
const MIN_SEARCH_CHARS = 2

type Choice = {
  key: string
  name: string
  detail: string
  icon: "again" | "recipe" | "saved"
  /** Some sources are one entry, a saved meal is several. */
  entries: () => FoodLogEntry[]
}

function macroLine(
  entry: { calories?: number; protein?: number },
  energyUnit: EnergyUnit
) {
  const calories = Math.round(entry.calories ?? 0)
  const protein = Math.round(entry.protein ?? 0)
  return protein > 0
    ? `${energyDisplay(calories, energyUnit)} ${energyUnit} · ${protein}g protein`
    : `${energyDisplay(calories, energyUnit)} ${energyUnit}`
}

const ICONS = {
  again: <ArrowClockwise size={16} weight="bold" />,
  recipe: <ForkKnife size={16} weight="bold" />,
  saved: <BookmarkSimple size={16} weight="bold" />,
}

/**
 * The abridged food log: the things this account eats, one tap each.
 *
 * "I ate, I just didn't write it down" used to open the diary, which is a
 * search box and a decision about meals. Nearly all of that is unnecessary —
 * people eat the same forty things — so this lists them, filters them with a
 * box that touches no network, and writes on tap.
 *
 * It stays open. A missed day is rarely one item, and closing after the first
 * would make the second one somebody else's problem.
 */
export function QuickFoodStep({
  todayKey,
  recentFood,
  onBack,
  onClose,
}: {
  todayKey: string
  recentFood: Array<{ date: string; entries: FoodLogEntry[] }> | undefined
  onBack: () => void
  onClose: (outcome: FullScreenEventOutcome) => void
}) {
  const navigate = useSmoothNavigate()
  const energyUnit = useEnergyUnit()
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [logged, setLogged] = useState(0)

  const recipes = useQuery(api.logs.recipes.list, {}) as
    | Array<{
        _id: string
        name: string
        servings?: number
        ingredients: Parameters<typeof recipeTotals>[0]
      }>
    | undefined
  const mealPresets = useQuery(api.logs.mealPresets.list) as
    | Array<{ id: string; name: string; meal: string; entries: FoodLogEntry[] }>
    | undefined

  const addFood = useMutation(api.logs.foodLogs.addEntry)
  const removeFood = useMutation(api.logs.foodLogs.removeEntry)
  const preferences = useQuery(api.users.users.getPreferences)

  const [results, setResults] = useState<FoodResult[]>([])
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle")
  const [detailItem, setDetailItem] = useState<FoodResult | null>(null)
  const requestRef = useRef(0)

  /**
   * The real catalog, debounced, straight into the panel.
   *
   * Sending people to the search page to type the same word again was the
   * friction; a list of names with no way to set a portion would only move it.
   * So the results are real results, and tapping one opens the same detail
   * sheet the search page opens.
   */
  useEffect(() => {
    const needle = normalizeFoodSearchQuery(query)
    if (needle.length < MIN_SEARCH_CHARS) {
      setResults([])
      setSearchState("idle")
      return
    }

    const id = ++requestRef.current
    setSearchState("loading")
    const timer = window.setTimeout(() => {
      void searchFoodsAccurate(needle, {
        limit: SEARCH_RESULT_LIMIT,
        fetchLimit: SEARCH_FETCH_LIMIT,
        language: preferences?.foodSearchLanguage ?? "en",
      })
        .then((found) => {
          if (id !== requestRef.current) return
          setResults(found)
          setSearchState("done")
        })
        .catch(() => {
          if (id !== requestRef.current) return
          setResults([])
          setSearchState("error")
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [preferences?.foodSearchLanguage, query])

  const choices = useMemo<Choice[]>(() => {
    const items: Choice[] = []

    for (const food of buildQuickRepeatFoods(
      (recentFood ?? []).filter((day) => day.date !== todayKey),
      PER_SECTION
    )) {
      items.push({
        key: `again:${food.key}`,
        name: food.entry.name,
        detail: macroLine(food.entry, energyUnit),
        icon: "again",
        entries: () => [food.entry],
      })
    }

    for (const preset of (mealPresets ?? []).slice(0, PER_SECTION)) {
      const totals = preset.entries.reduce(
        (sum, entry) => ({
          calories: sum.calories + (entry.calories ?? 0),
          protein: sum.protein + (entry.protein ?? 0),
        }),
        { calories: 0, protein: 0 }
      )
      items.push({
        key: `saved:${preset.id}`,
        name: preset.name,
        detail: `${preset.entries.length} items · ${macroLine(totals, energyUnit)}`,
        icon: "saved",
        entries: () =>
          foodLogEntriesFromMealPreset({
            entries: preset.entries,
            meal: preset.meal,
          } as Parameters<typeof foodLogEntriesFromMealPreset>[0]),
      })
    }

    for (const recipe of (recipes ?? []).slice(0, PER_SECTION)) {
      const totals = recipeTotals(recipe.ingredients, recipe.servings ?? 1)
      items.push({
        key: `recipe:${recipe._id}`,
        name: recipe.name,
        detail: `One serving · ${macroLine(totals, energyUnit)}`,
        icon: "recipe",
        entries: () => [
          stripUndefined({
            id: createClientId(),
            name: recipe.name,
            ...totals,
            loggedAt: new Date().toISOString(),
            meal: defaultMeal(),
            recipeId: recipe._id,
          }) as FoodLogEntry,
        ],
      })
    }

    return items
  }, [mealPresets, recentFood, recipes, todayKey])

  /** Substring, over data already in memory. A search box that never waits. */
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return choices
    return choices.filter((choice) =>
      choice.name.toLowerCase().includes(needle)
    )
  }, [choices, query])

  async function log(choice: Choice) {
    if (busy) return
    const entries = choice.entries().map((entry) => ({
      ...entry,
      id: createClientId(),
      loggedAt: new Date().toISOString(),
      meal: entry.meal ?? defaultMeal(),
    }))

    setBusy(true)
    try {
      for (const entry of entries) {
        await addFood({ date: todayKey, entry })
      }
      hapticMedium()
      setLogged((count) => count + 1)
      toast.success(`${choice.name} logged`, {
        action: {
          label: "Undo",
          onClick: () => {
            setLogged((count) => Math.max(0, count - 1))
            void Promise.all(
              entries.map((entry) =>
                removeFood({ date: todayKey, entryId: entry.id })
              )
            ).catch(() => toast.error("Couldn't undo that"))
          },
        },
      })
    } catch (error) {
      logDevWarn("Failed to log food from a moment", error)
      toast.error("Couldn't log that. Try again.")
    } finally {
      setBusy(false)
    }
  }

  /** The detail sheet hands back a portion and a meal; this writes them. */
  async function logSearchResult(
    item: FoodResult,
    grams: number,
    micros: LogMicros,
    meal: MealType,
    detail?: FoodDetail | null,
    portion?: FoodPortion
  ) {
    const entry = foodLogEntryFromFoodResult(item, {
      grams,
      micros,
      meal,
      detail,
      portion,
    })

    setBusy(true)
    try {
      await addFood({ date: todayKey, entry })
      hapticMedium()
      setLogged((count) => count + 1)
      setDetailItem(null)
      toast.success(`${item.name} logged`, {
        action: {
          label: "Undo",
          onClick: () => {
            setLogged((count) => Math.max(0, count - 1))
            void removeFood({ date: todayKey, entryId: entry.id }).catch(() =>
              toast.error("Couldn't undo that")
            )
          },
        },
      })
    } catch (error) {
      logDevWarn("Failed to log a searched food from a moment", error)
      toast.error("Couldn't log that. Try again.")
    } finally {
      setBusy(false)
    }
  }

  /** Barcodes, filters, and the rest of what the full screen does. */
  function openSearch() {
    hapticSelection()
    onClose(logged > 0 ? "resolved" : "dismissed")
    navigate(
      query.trim()
        ? `/foods/search?q=${encodeURIComponent(query.trim())}`
        : "/foods/search",
      { motion: "forward" }
    )
  }

  const loading = recipes === undefined || mealPresets === undefined
  const searching = normalizeFoodSearchQuery(query).length >= MIN_SEARCH_CHARS

  return (
    <MomentScreen
      title="What did you eat?"
      subtitle="Your usual foods first, then everything else. One tap each."
      yielded={detailItem !== null}
      onClose={() => {
        hapticSelection()
        onClose(logged > 0 ? "resolved" : "dismissed")
      }}
      actions={
        <>
          <MomentPrimaryAction
            onClick={() => {
              hapticSelection()
              onClose(logged > 0 ? "resolved" : "dismissed")
            }}
          >
            {logged > 0 ? `Done · ${logged} logged` : "Done"}
          </MomentPrimaryAction>
          <MomentSecondaryAction
            onClick={() => {
              hapticSelection()
              onBack()
            }}
            className="bg-transparent text-muted-foreground active:bg-muted/40"
          >
            <CaretLeft size={13} weight="bold" className="mr-1.5" />
            Back
          </MomentSecondaryAction>
        </>
      }
    >
      <label className="flex items-center gap-2.5 rounded-2xl bg-muted/50 px-3.5">
        <MagnifyingGlass
          size={15}
          weight="bold"
          className="shrink-0 text-muted-foreground"
        />
        <span className="sr-only">Search foods</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your foods, or anything else"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
      </label>

      <div className="app-surface mt-3 overflow-hidden">
        {filtered.map((choice, index) => (
          <div key={choice.key}>
            {index > 0 && <div className="mx-4 h-px bg-border/50" />}
            <MomentRow
              icon={ICONS[choice.icon]}
              title={choice.name}
              detail={choice.detail}
              disabled={busy}
              onClick={() => void log(choice)}
            />
          </div>
        ))}
      </div>

      {searching && (
        <>
          <p className="mt-5 mb-2 px-1 text-[13px] text-muted-foreground">
            {searchState === "loading"
              ? "Searching…"
              : searchState === "error"
                ? "Search is not answering. Your own foods above still work."
                : results.length > 0
                  ? "From the food database"
                  : "Nothing in the database matched that."}
          </p>

          {results.length > 0 && (
            <div className="app-surface overflow-hidden">
              {results.map((item, index) => (
                <div key={item.id}>
                  {index > 0 && <div className="mx-4 h-px bg-border/50" />}
                  <MomentRow
                    icon={<MagnifyingGlass size={16} weight="bold" />}
                    title={item.name}
                    detail={[
                      item.brand,
                      item.serving,
                      `${energyDisplay(item.calories, energyUnit)} ${energyUnit}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    disabled={busy}
                    onClick={() => {
                      hapticSelection()
                      setDetailItem(item)
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {searchState === "loading" && (
            <div className="app-surface flex flex-col gap-2 px-4 py-4">
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="h-4 animate-pulse rounded bg-muted/60"
                  style={{ width: `${70 - row * 12}%` }}
                />
              ))}
            </div>
          )}
        </>
      )}

      <div className="app-surface mt-3 overflow-hidden">
        <MomentRow
          icon={<MagnifyingGlass size={16} weight="bold" />}
          title="Open the full search"
          detail="Barcode scanning, recipes and filters."
          onClick={openSearch}
        />
      </div>

      {detailItem && (
        <FoodDetailSheet
          item={detailItem}
          added={false}
          saving={busy}
          onClose={() => setDetailItem(null)}
          onAdd={(item, grams, micros, meal, detail, portion) =>
            void logSearchResult(item, grams, micros, meal, detail, portion)
          }
        />
      )}

      {!loading && choices.length === 0 && !searching && (
        <p className="mt-3 px-1 text-[13px] leading-snug text-muted-foreground">
          Nothing to repeat yet — your usual foods, saved meals and recipes will
          show up here once you have logged a few.
        </p>
      )}
    </MomentScreen>
  )
}
