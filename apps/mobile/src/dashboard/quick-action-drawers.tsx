/**
 * The quick-action drawers.
 *
 * Every fan option on the dashboard used to jump straight to a full page,
 * which turned "drink some water" into a navigation round trip. Now each
 * option opens a small drawer instead: the one interaction people actually
 * came for happens right there — a glass poured, a meal repeated, a fast
 * started — and the full page stays reachable as the escape hatch for the
 * long tail.
 *
 * Each drawer owns its own data hooks, so the host renders only the open
 * one and no drawer pays for another's queries.
 */

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowClockwise,
  Barbell,
  BookmarkSimple,
  CalendarBlank,
  CaretRight,
  Check,
  CookingPot,
  ForkKnife,
  MagnifyingGlass,
  PintGlass,
  Play,
  Pill,
  Timer,
} from "@phosphor-icons/react"
import { MobileSheet, toast, tint, useReplayKey } from "@repo/ui"

import { api } from "../../../../convex/_generated/api"
import { useSmoothNavigate } from "@/lib/navigation"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { hapticMedium, hapticRain, hapticTap } from "@/lib/haptics"
import { createClientId, logDevWarn } from "@/lib/utils"
import {
  defaultMeal,
  foodLogEntriesFromMealPreset,
  stripUndefined,
  type FoodLogEntry,
  DEFAULT_MEAL_CATEGORIES,
} from "@/lib/food-log"
import { recipeTotals } from "@/lib/coach-chat"
import { buildQuickRepeatFoods } from "@/lib/food-quick-repeat"
import { useEnergyUnit, type EnergyUnit } from "@/lib/use-energy-unit"
import { energyDisplay } from "@repo/ui"
import { WATER_BG, WATER_COLOR } from "./constants"
import { fmtWater } from "./helpers"

export type QuickActionId =
  | "workout"
  | "food"
  | "recipe-create"
  | "recipes"
  | "water"
  | "fasting"
  | "supplements"

// ─── Shared pieces ───────────────────────────────────────────────────────────

function DrawerIntro({
  title,
  detail,
}: {
  title: string
  detail: string
}) {
  return (
    <div className="pb-1">
      <h2 className="native-section-title">{title}</h2>
      <p className="native-row-detail mt-0.5">{detail}</p>
    </div>
  )
}

function DrawerRow({
  icon,
  title,
  detail,
  onClick,
  disabled,
  accent,
}: {
  icon: React.ReactNode
  title: string
  detail?: string
  onClick: () => void
  disabled?: boolean
  accent?: string
}) {
  return (
    <button
      type="button"
      onClick={() => {
        hapticTap()
        onClick()
      }}
      disabled={disabled}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-muted/50 disabled:opacity-45"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={
          accent
            ? { backgroundColor: tint(accent, 12), color: accent }
            : { backgroundColor: "var(--muted)", color: "var(--foreground)" }
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="native-row-title block truncate">{title}</span>
        {detail && (
          <span className="native-row-detail mt-0.5 block truncate">
            {detail}
          </span>
        )}
      </span>
      <CaretRight size={15} className="shrink-0 text-muted-foreground" />
    </button>
  )
}

function RowDivider() {
  return <div className="mx-4 h-px bg-border/50" />
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

// ─── Water ───────────────────────────────────────────────────────────────────

type WaterEntry = { id: string; amountMl: number; loggedAt: string }

const WATER_CHIPS = [150, 330, 500, 750]
const WATER_CUSTOM_MAX = 3000

/**
 * A glass you can pour into. The day's water fills it from the bottom, so
 * the visual is reporting rather than decorating, and every control writes
 * immediately: one chip tap, one logged.
 */
function WaterDrawer({
  dateKey,
  onClose,
}: {
  dateKey: string
  onClose: () => void
}) {
  const navigate = useSmoothNavigate()
  const preferences = useQuery(api.users.users.getPreferences)
  const rawEntries = useQuery(api.logs.water.getDay, { date: dateKey })
  const setWaterDay = useOfflineMutation(
    api.logs.water.setDay,
    "logs.water.setDay"
  )
  const rain = useReplayKey(1100)
  const [custom, setCustom] = useState("")

  const entries = (rawEntries ?? []) as WaterEntry[]
  const totalMl = entries.reduce((sum, entry) => sum + entry.amountMl, 0)
  const goalMl = preferences?.waterGoalMl ?? 2500
  const percent = Math.min(100, Math.round((totalMl / Math.max(1, goalMl)) * 100))

  function add(amountMl: number) {
    if (amountMl <= 0 || Number.isNaN(amountMl)) return
    const clamped = Math.min(WATER_CUSTOM_MAX, Math.round(amountMl))
    // Drops first, write second — same order as the widget, for the same
    // reason: the network can take its time, the hand cannot.
    rain.replay()
    hapticRain()
    const entry = {
      id: crypto.randomUUID(),
      amountMl: clamped,
      loggedAt: new Date().toISOString(),
    }
    void setWaterDay({ date: dateKey, entries: [...entries, entry] })
    toast.success(`${fmtWater(clamped)} of water logged`)
  }

  function submitCustom() {
    const parsed = Number.parseInt(custom, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    add(parsed)
    setCustom("")
  }

  const fillOverText = percent >= 76

  return (
    <div className="flex flex-col gap-4 p-4">
      <DrawerIntro
        title="Water"
        detail={`${fmtWater(totalMl)} of ${fmtWater(goalMl)} today`}
      />

      {/* The glass. Fill height is the day's real number. */}
      <div
        className="relative mx-auto flex h-48 w-32 items-stretch justify-center overflow-hidden rounded-t-xl rounded-b-[2.5rem] border-2 transition-colors"
        style={{
          borderColor: tint(WATER_COLOR, 35),
          backgroundColor: tint(WATER_COLOR, 4),
        }}
        role="img"
        aria-label={`Water glass ${percent} percent full`}
      >
        {rain.active && (
          <span key={rain.key} className="water-rain" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} />
            ))}
          </span>
        )}
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
          style={{
            height: `${percent}%`,
            background: `linear-gradient(to top, ${WATER_COLOR}, ${tint(WATER_COLOR, 40)})`,
          }}
          aria-hidden="true"
        />
        {[25, 50, 75].map((mark) => (
          <span
            key={mark}
            className="absolute right-2.5 h-px w-3"
            style={{
              bottom: `${mark}%`,
              backgroundColor: tint(WATER_COLOR, mark < percent ? 70 : 40),
            }}
            aria-hidden="true"
          />
        ))}
        <span
          className="absolute inset-x-0 top-3 text-center text-[15px] font-bold tabular-nums"
          style={{ color: fillOverText ? "#fff" : WATER_COLOR }}
        >
          {percent}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => add(250)}
          className="motion-tactile col-span-2 flex min-h-14 items-center justify-center gap-2 rounded-2xl text-[17px] font-bold"
          style={{ backgroundColor: WATER_BG, color: WATER_COLOR }}
        >
          <PintGlass size={19} weight="bold" />
          Add 250 ml
        </button>
        {WATER_CHIPS.map((ml) => (
          <button
            key={ml}
            type="button"
            onClick={() => add(ml)}
            className="motion-tactile flex min-h-11 items-center justify-center rounded-xl bg-muted/55 text-[14px] font-semibold text-foreground active:bg-muted"
          >
            +{fmtWater(ml)}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 rounded-2xl bg-muted/50 px-3.5">
        <span className="native-field-label shrink-0">Custom</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={WATER_CUSTOM_MAX}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitCustom()
          }}
          placeholder="Amount in ml"
          aria-label="Custom water amount in millilitres"
          className="h-12 min-w-0 flex-1 bg-transparent text-right text-[15px] tabular-nums outline-none placeholder:text-muted-foreground placeholder:text-left"
        />
        <button
          type="button"
          onClick={submitCustom}
          disabled={!Number.parseInt(custom, 10)}
          className="-mr-1 flex min-h-9 items-center rounded-xl bg-foreground px-3.5 text-[13px] font-bold text-background disabled:opacity-40"
        >
          Add
        </button>
      </label>

      <DrawerRow
        icon={<CalendarBlank size={16} weight="bold" />}
        title="See the whole week"
        detail="History, goals and trends."
        onClick={() => {
          onClose()
          navigate("/nutrition", { motion: "forward" })
        }}
      />
    </div>
  )
}

// ─── Food ────────────────────────────────────────────────────────────────────

/**
 * The abridged food log: this account's usual foods, one tap each. Search
 * stays one row away for everything the list can't do.
 */
function FoodDrawer({
  dateKey,
  onClose,
  editEntry,
}: {
  dateKey: string
  onClose: () => void
  editEntry?: FoodLogEntry | null
}) {
  const navigate = useSmoothNavigate()
  const energyUnit = useEnergyUnit()
  const recentFood = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: dateKey,
  })
  const mealPresets = useQuery(api.logs.mealPresets.list) as
    | Array<{ id: string; name: string; meal: string; entries: FoodLogEntry[] }>
    | undefined
  const addFood = useMutation(api.logs.foodLogs.addEntry)
  const removeFood = useMutation(api.logs.foodLogs.removeEntry)
  const [busy, setBusy] = useState(false)

  const choices = useMemo(() => {
    const repeats = buildQuickRepeatFoods(
      (recentFood ?? []).filter(
        (day) => day.date !== dateKey
      ) as Parameters<typeof buildQuickRepeatFoods>[0],
      5
    )
    return [
      ...repeats.map((food) => ({
        key: `again:${food.key}`,
        name: food.entry.name,
        detail: macroLine(food.entry, energyUnit),
        icon: <ArrowClockwise size={16} weight="bold" />,
        entries: () => [food.entry],
      })),
      ...(mealPresets ?? []).slice(0, 5).map((preset) => {
        const totals = preset.entries.reduce(
          (sum, entry) => ({
            calories: sum.calories + (entry.calories ?? 0),
            protein: sum.protein + (entry.protein ?? 0),
          }),
          { calories: 0, protein: 0 }
        )
        return {
          key: `saved:${preset.id}`,
          name: preset.name,
          detail: `${preset.entries.length} items · ${macroLine(totals, energyUnit)}`,
          icon: <BookmarkSimple size={16} weight="bold" />,
          entries: () =>
            foodLogEntriesFromMealPreset({
              entries: preset.entries,
              meal: preset.meal,
            } as Parameters<typeof foodLogEntriesFromMealPreset>[0]),
        }
      }),
    ]
  }, [dateKey, energyUnit, mealPresets, recentFood])

  async function log(choice: (typeof choices)[number]) {
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
        await addFood({ date: dateKey, entry })
      }
      hapticMedium()
      toast.success(`${choice.name} logged`, {
        action: {
          label: "Undo",
          onClick: () => {
            void Promise.all(
              entries.map((entry) =>
                removeFood({ date: dateKey, entryId: entry.id })
              )
            ).catch(() => toast.error("Couldn't undo that"))
          },
        },
      })
    } catch (error) {
      logDevWarn("Failed to log food from the quick-action drawer", error)
      toast.error("Couldn't log that. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const loading = recentFood === undefined || mealPresets === undefined

  if (editEntry) {
    return (
      <FoodEntryEditor
        entry={editEntry}
        dateKey={dateKey}
        energyUnit={energyUnit}
        onClose={onClose}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <DrawerIntro
        title="Log food"
        detail="Your usual foods, one tap each."
      />

      <div className="app-surface overflow-hidden">
        {!loading && choices.length === 0 && (
          <p className="px-4 py-3 text-[13px] leading-snug text-muted-foreground">
            Nothing to repeat yet — foods you log will show up here.
          </p>
        )}
        {choices.map((choice, index) => (
          <div key={choice.key}>
            {index > 0 && <RowDivider />}
            <DrawerRow
              icon={choice.icon}
              title={choice.name}
              detail={choice.detail}
              disabled={busy}
              onClick={() => void log(choice)}
            />
          </div>
        ))}
      </div>

      <div className="app-surface overflow-hidden">
        <DrawerRow
          icon={<MagnifyingGlass size={16} weight="bold" />}
          title="Search all foods"
          detail="Barcode scanning, portions and filters."
          onClick={() => {
            onClose()
            navigate("/foods/search", { motion: "forward" })
          }}
        />
      </div>
    </div>
  )
}

function FoodEntryEditor({
  entry,
  dateKey,
  energyUnit,
  onClose,
}: {
  entry: FoodLogEntry
  dateKey: string
  energyUnit: EnergyUnit
  onClose: () => void
}) {
  const updateFood = useMutation(api.logs.foodLogs.updateEntry)
  const [meal, setMeal] = useState(entry.meal)
  const [serving, setServing] = useState(entry.servingLabel ?? "")
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    setBusy(true)
    try {
      const patch: FoodLogEntry = { ...entry, meal: meal || defaultMeal() }
      patch.servingLabel = serving ? serving : undefined
      delete patch._id
      await updateFood({ date: dateKey, entry: patch })
      hapticMedium()
      toast.success(`${entry.name} updated`)
      onClose()
    } catch (error) {
      logDevWarn("Failed to edit food entry from drawer", error)
      toast.error("Couldn't save that.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <DrawerIntro title={entry.name} detail={macroLine(entry, energyUnit)} />

      <div className="app-surface overflow-hidden">
        <div className="px-4 py-3">
          <label className="block text-[12px] font-medium text-muted-foreground">
            Meal
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {DEFAULT_MEAL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setMeal(cat.id)}
                className={`motion-tactile flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                  meal === cat.id
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="app-surface overflow-hidden px-4 py-3">
        <label className="block text-[12px] font-medium text-muted-foreground">
          Serving
        </label>
        <input
          type="text"
          value={serving}
          onChange={(event) => setServing(event.target.value)}
          placeholder={entry.servingLabel ? undefined : "e.g. 1 cup, 2 slices"}
          className="mt-2 w-full text-[15px] text-foreground outline-none"
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="motion-tactile flex-1 rounded-xl bg-foreground py-3 font-bold text-background"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  )
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

/**
 * Recipes worth repeating, logged as one serving straight from the drawer;
 * creating stays one row away.
 */
function RecipesDrawer({
  dateKey,
  onClose,
}: {
  dateKey: string
  onClose: () => void
}) {
  const navigate = useSmoothNavigate()
  const energyUnit = useEnergyUnit()
  const recipes = useQuery(api.logs.recipes.list, {}) as
    | Array<{
        _id: string
        name: string
        servings?: number
        ingredients: Parameters<typeof recipeTotals>[0]
      }>
    | undefined
  const addFood = useMutation(api.logs.foodLogs.addEntry)
  const [busy, setBusy] = useState(false)

  async function logRecipe(recipe: (NonNullable<typeof recipes>)[number]) {
    if (busy) return
    const totals = recipeTotals(recipe.ingredients, recipe.servings ?? 1)
    const entry = stripUndefined({
      id: createClientId(),
      name: recipe.name,
      ...totals,
      loggedAt: new Date().toISOString(),
      meal: defaultMeal(),
      recipeId: recipe._id,
    }) as FoodLogEntry
    setBusy(true)
    try {
      await addFood({ date: dateKey, entry })
      hapticMedium()
      toast.success(`${recipe.name} logged`)
    } catch (error) {
      logDevWarn("Failed to log a recipe from the drawer", error)
      toast.error("Couldn't log that. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const loading = recipes === undefined

  return (
    <div className="flex flex-col gap-3 p-4">
      <DrawerIntro
        title="Recipes"
        detail="Log a serving of one of yours, or go browsing."
      />

      <div className="app-surface overflow-hidden">
        {!loading && (recipes ?? []).length === 0 && (
          <p className="px-4 py-3 text-[13px] leading-snug text-muted-foreground">
            No recipes yet — create your first one below.
          </p>
        )}
        {(recipes ?? []).slice(0, 5).map((recipe, index) => (
          <div key={recipe._id}>
            {index > 0 && <RowDivider />}
            <DrawerRow
              icon={<ForkKnife size={16} weight="bold" />}
              title={recipe.name}
              detail={`One serving · ${macroLine(
                recipeTotals(recipe.ingredients, recipe.servings ?? 1),
                energyUnit
              )}`}
              disabled={busy}
              onClick={() => void logRecipe(recipe)}
            />
          </div>
        ))}
      </div>

      <div className="app-surface overflow-hidden">
        <DrawerRow
          icon={<CookingPot size={16} weight="bold" />}
          title="Create a recipe"
          onClick={() => {
            onClose()
            navigate("/foods/recipe/new", { motion: "forward" })
          }}
        />
        <RowDivider />
        <DrawerRow
          icon={<MagnifyingGlass size={16} weight="bold" />}
          title="Browse all recipes"
          onClick={() => {
            onClose()
            navigate("/recipes", { motion: "forward" })
          }}
        />
      </div>
    </div>
  )
}

function CreateRecipeDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useSmoothNavigate()
  return (
    <div className="flex flex-col gap-3 p-4">
      <DrawerIntro
        title="New recipe"
        detail="Build it once, then log it in a tap forever."
      />
      <div className="app-surface overflow-hidden">
        <DrawerRow
          icon={<CookingPot size={16} weight="bold" />}
          title="Start from scratch"
          detail="Name, ingredients, servings."
          onClick={() => {
            onClose()
            navigate("/foods/recipe/new", { motion: "forward" })
          }}
        />
        <RowDivider />
        <DrawerRow
          icon={<MagnifyingGlass size={16} weight="bold" />}
          title="Find inspiration first"
          detail="Browse saved recipes and ideas."
          onClick={() => {
            onClose()
            navigate("/recipes", { motion: "forward" })
          }}
        />
      </div>
    </div>
  )
}

// ─── Workout ─────────────────────────────────────────────────────────────────

function WorkoutDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useSmoothNavigate()
  return (
    <div className="flex flex-col gap-3 p-4">
      <DrawerIntro
        title="Workout"
        detail="Start now, or write down one that already happened."
      />
      <div className="app-surface overflow-hidden">
        <DrawerRow
          accent="var(--foreground)"
          icon={<Play size={16} weight="bold" />}
          title="Start an empty session"
          detail="Exercises added as you go."
          onClick={() => {
            onClose()
            navigate("/workout/active", { motion: "forward" })
          }}
        />
        <RowDivider />
        <DrawerRow
          icon={<Barbell size={16} weight="bold" />}
          title="Log a past workout"
          detail="Pick a routine and a time."
          onClick={() => {
            onClose()
            navigate("/workouts", { motion: "switch" })
          }}
        />
      </div>
    </div>
  )
}

// ─── Fasting ────────────────────────────────────────────────────────────────

const FAST_PRESETS = [
  { hours: 12, protocol: "12:12" },
  { hours: 16, protocol: "16:8" },
  { hours: 18, protocol: "18:6" },
  { hours: 24, protocol: "24h" },
]

function FastingDrawer({
  dateKey,
  onClose,
}: {
  dateKey: string
  onClose: () => void
}) {
  const navigate = useSmoothNavigate()
  const active = useQuery(api.logs.fasting.getActive, {})
  const startFast = useMutation(api.logs.fasting.start)
  const stopFast = useMutation(api.logs.fasting.stop)
  const [busy, setBusy] = useState(false)
  // Ticking clock, read outside render so re-renders stay pure.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  async function start(hours: number, protocol: string) {
    if (busy) return
    setBusy(true)
    try {
      await startFast({
        targetMinutes: hours * 60,
        protocol,
        startDate: dateKey,
      })
      hapticMedium()
      toast.success(`${protocol} fast started`)
    } catch (error) {
      logDevWarn("Failed to start a fast from the drawer", error)
      toast.error("Couldn't start the fast. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function endEarly() {
    if (!active || busy) return
    setBusy(true)
    try {
      await stopFast({ id: active.id, endDate: dateKey })
      hapticMedium()
      toast.success("Fast ended")
    } catch (error) {
      logDevWarn("Failed to end a fast from the drawer", error)
      toast.error("Couldn't end the fast. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const elapsedMinutes = active
    ? Math.max(0, Math.round((now - active.startedAt) / 60000))
    : 0

  return (
    <div className="flex flex-col gap-3 p-4">
      <DrawerIntro
        title="Fasting"
        detail={
          active
            ? "A fast is already running."
            : "Pick a window. It starts the moment you tap."
        }
      />

      {active ? (
        <div className="app-surface overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <Timer size={16} weight="bold" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="native-row-title block">{active.protocol}</span>
              <span className="native-row-detail mt-0.5 block tabular-nums">
                Running for {Math.floor(elapsedMinutes / 60)}h{" "}
                {elapsedMinutes % 60}m
              </span>
            </span>
          </div>
          <RowDivider />
          <DrawerRow
            icon={<Timer size={16} weight="bold" />}
            title="End the fast"
            onClick={() => void endEarly()}
            disabled={busy}
          />
          <RowDivider />
          <DrawerRow
            icon={<CalendarBlank size={16} weight="bold" />}
            title="Open fasting"
            onClick={() => {
              onClose()
              navigate("/nutrition/fasting", { motion: "switch" })
            }}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {FAST_PRESETS.map((preset) => (
              <button
                key={preset.protocol}
                type="button"
                disabled={busy}
                onClick={() => {
                  hapticTap()
                  void start(preset.hours, preset.protocol)
                }}
                className="motion-tactile flex min-h-20 flex-col items-center justify-center rounded-2xl bg-muted/55 active:bg-muted disabled:opacity-45"
              >
                <span className="text-[17px] font-bold tabular-nums">
                  {preset.protocol}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {preset.hours} hours
                </span>
              </button>
            ))}
          </div>
          <div className="app-surface overflow-hidden">
            <DrawerRow
              icon={<CalendarBlank size={16} weight="bold" />}
              title="More protocols"
              detail="Custom windows and history."
              onClick={() => {
                onClose()
                navigate("/nutrition/fasting", { motion: "switch" })
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Supplements ─────────────────────────────────────────────────────────────

type SupplementItemShape = {
  _id: string
  name: string
  servingLabel?: string
  active: boolean
}

type SupplementOverviewShape = {
  items: SupplementItemShape[]
  logs: Array<{
    supplementId: string
    date: string
    status: "taken" | "skipped"
  }>
}

/**
 * Today's active supplements. Untaken ones take in a tap; taken ones stay
 * visible so the drawer reads as the day, not as a queue that empties.
 */
function SupplementsDrawer({
  dateKey,
  onClose,
}: {
  dateKey: string
  onClose: () => void
}) {
  const navigate = useSmoothNavigate()
  const overviewRaw = useQuery(api.logs.supplements.getOverview, {
    date: dateKey,
  })
  const logTaken = useOfflineMutation(
    api.logs.supplements.logTaken,
    "logs.supplements.logTaken"
  )
  const overview = (overviewRaw ?? undefined) as
    | SupplementOverviewShape
    | undefined
  const [busyId, setBusyId] = useState<string | null>(null)

  const takenIds = useMemo(() => {
    const taken = new Set<string>()
    for (const log of overview?.logs ?? []) {
      if (log.date === dateKey && log.status === "taken") {
        taken.add(log.supplementId)
      }
    }
    return taken
  }, [overview, dateKey])

  const items = useMemo(
    () => (overview?.items ?? []).filter((item) => item.active),
    [overview]
  )

  async function take(item: SupplementItemShape) {
    if (busyId) return
    setBusyId(item._id)
    try {
      await logTaken({ supplementId: item._id, date: dateKey })
      hapticMedium()
      toast.success(`${item.name} taken`)
    } catch (error) {
      logDevWarn("Failed to log a supplement from the drawer", error)
      toast.error("Couldn't log that. Try again.")
    } finally {
      setBusyId(null)
    }
  }

  const loading = overview === undefined

  return (
    <div className="flex flex-col gap-3 p-4">
      <DrawerIntro
        title="Supplements"
        detail={
          loading
            ? "Checking today's plan…"
            : items.length === 0
              ? "Nothing scheduled. Add some in the cabinet."
              : `${items.length - takenIds.size} of ${items.length} still to take today.`
        }
      />

      <div className="app-surface overflow-hidden">
        {!loading && items.length === 0 && (
          <p className="px-4 py-3 text-[13px] leading-snug text-muted-foreground">
            Your supplement cabinet is empty or paused.
          </p>
        )}
        {items.map((item, index) => {
          const taken = takenIds.has(item._id)
          return (
            <div key={item._id}>
              {index > 0 && <RowDivider />}
              <div className="flex min-h-14 items-center gap-3 px-4 py-2">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full"
                  style={
                    taken
                      ? {
                          backgroundColor: "var(--status-success-bg, var(--muted))",
                          color: "var(--status-success)",
                        }
                      : {
                          backgroundColor: "var(--muted)",
                          color: "var(--foreground)",
                        }
                  }
                >
                  {taken ? (
                    <Check size={16} weight="bold" />
                  ) : (
                    <Pill size={16} weight="bold" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="native-row-title block truncate">
                    {item.name}
                  </span>
                  {item.servingLabel && (
                    <span className="native-row-detail mt-0.5 block truncate">
                      {item.servingLabel}
                    </span>
                  )}
                </span>
                {!taken && (
                  <button
                    type="button"
                    onClick={() => void take(item)}
                    disabled={busyId === item._id}
                    className="motion-tactile flex min-h-10 shrink-0 items-center rounded-xl bg-foreground px-3.5 text-[13px] font-bold text-background disabled:opacity-40"
                  >
                    Take
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="app-surface overflow-hidden">
        <DrawerRow
          icon={<Pill size={16} weight="bold" />}
          title="Open the cabinet"
          detail="Schedule, history and editing."
          onClick={() => {
            onClose()
            navigate("/supplements", { motion: "switch" })
          }}
        />
      </div>
    </div>
  )
}

// ─── Host ────────────────────────────────────────────────────────────────────

const DRAWER_LABELS: Record<QuickActionId, string> = {
  workout: "Workout",
  food: "Log food",
  "recipe-create": "New recipe",
  recipes: "Recipes",
  water: "Water",
  fasting: "Fasting",
  supplements: "Supplements",
}

export function QuickActionDrawer({
  id,
  dateKey,
  onClose,
  editEntry,
}: {
  id: QuickActionId | null
  dateKey: string
  onClose: () => void
  editEntry?: FoodLogEntry | null
}) {
  if (!id) return null

  return (
    <MobileSheet onClose={onClose} ariaLabel={`${DRAWER_LABELS[id]} drawer`}>
      {id === "water" && <WaterDrawer dateKey={dateKey} onClose={onClose} />}
      {id === "food" && <FoodDrawer dateKey={dateKey} onClose={onClose} editEntry={editEntry} />}
      {id === "recipes" && <RecipesDrawer dateKey={dateKey} onClose={onClose} />}
      {id === "recipe-create" && <CreateRecipeDrawer onClose={onClose} />}
      {id === "workout" && <WorkoutDrawer onClose={onClose} />}
      {id === "fasting" && <FastingDrawer dateKey={dateKey} onClose={onClose} />}
      {id === "supplements" && (
        <SupplementsDrawer dateKey={dateKey} onClose={onClose} />
      )}
    </MobileSheet>
  )
}
