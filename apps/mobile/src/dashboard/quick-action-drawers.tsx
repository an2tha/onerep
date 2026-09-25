import { Message, tr, translateError, uiLocale } from "@repo/ui/i18n"
import {
  foodLogContextParams,
  foodLogTime,
  foodLogTimestamp,
  foodLogTimestampForMeal,
} from "@/lib/food-log-context"
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

import { useEffect, useMemo, useRef, useState } from "react"
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
  Trash,
} from "@phosphor-icons/react"
import { MobileSheet, toast, tint, useReplayKey } from "@repo/ui"

import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { useSmoothNavigate } from "@/lib/navigation"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { hapticMedium, hapticRain, hapticTap } from "@/lib/haptics"
import { createClientId, logDevWarn } from "@/lib/utils"
import { announceOrbActivity } from "@/lib/orb-activity"
import {
  defaultMeal,
  foodLogEntriesFromMealPreset,
  stripUndefined,
  type FoodLogEntry,
  DEFAULT_MEAL_CATEGORIES,
} from "@/lib/food-log"
import { recipeTotals } from "@/lib/coach-chat"
import { buildQuickRepeatFoods } from "@/lib/food-quick-repeat"
import { searchFoodsAccurate } from "@/lib/openfoodfacts"
import { FoodModeDial } from "./food-mode-dial"
import { QuickFoodCamera } from "./quick-food-camera"
import { useEnergyUnit, type EnergyUnit } from "@/lib/use-energy-unit"
import { energyDisplay } from "@repo/ui"
import { WATER_BG, WATER_COLOR } from "./constants"
import { formatWater, flOzToMl, mlToFlOz } from "@/lib/measurement-system"
import { useWaterUnit } from "@/lib/use-water-unit"
import { oneGlassWaterMl, waterPoursMl } from "@/lib/water-amounts"

export type QuickActionId =
  | "workout"
  | "food"
  | "recipe-create"
  | "recipes"
  | "water"
  | "fasting"
  | "supplements"

// ─── Shared pieces ───────────────────────────────────────────────────────────

function DrawerIntro({ title, detail }: { title: string; detail: string }) {
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
    ? tr("{{value0}} {{value1}} · {{value2}}g protein", {
        value0: energyDisplay(calories, energyUnit),
        value1: energyUnit,
        value2: protein,
      })
    : `${energyDisplay(calories, energyUnit)} ${energyUnit}`
}

// ─── Water ───────────────────────────────────────────────────────────────────

type WaterEntry = { id: string; amountMl: number; loggedAt: string }

/** Metric chip sizes, and the round fl-oz sizes they stand in for. */
const WATER_CHIPS_ML = [150, 330, 500, 750]
const WATER_CHIPS_FL_OZ = [5, 8, 12, 16]
const WATER_CUSTOM_MAX = 3000

/**
 * A glass you can pour into. The day's water fills it from the bottom, so
 * the visual is reporting rather than decorating, and every control writes
 * immediately: one chip tap, one logged.
 */
/**
 * The moment an entry belongs to.
 *
 * An explicit minute comes from the timeline. Otherwise use the current
 * clock time, always on the day being viewed.
 */
export function stampAt(dateKey: string, atMinutes?: number) {
  return foodLogTimestamp(
    dateKey,
    atMinutes === undefined ? undefined : foodLogTime(atMinutes)
  )
}

function WaterDrawer({
  dateKey,
  atMinutes,
  onClose,
}: {
  dateKey: string
  atMinutes?: number
  onClose: () => void
}) {
  const navigate = useSmoothNavigate()
  const preferences = useQuery(api.users.users.getPreferences)
  const rawEntries = useQuery(api.logs.water.getDay, { date: dateKey })
  // Targeted add/remove, not a whole-day setDay rewrite — a rewrite drops any
  // glass logged from a widget or the Nutrition page between read and write.
  const addWaterEntry = useOfflineMutation(
    api.logs.water.addEntry,
    "logs.water.addEntry"
  )
  // Targeted, so taking one glass back never rewrites the day around it.
  const removeWaterEntry = useOfflineMutation(
    api.logs.water.removeEntry,
    "logs.water.removeEntry"
  )
  const rain = useReplayKey(1100)
  const [custom, setCustom] = useState("")

  const entries = (rawEntries ?? []) as WaterEntry[]
  const totalMl = entries.reduce((sum, entry) => sum + entry.amountMl, 0)
  const goalMl = preferences?.waterGoalMl ?? 2500
  // The custom field speaks the user's chosen water unit; storage stays ml
  // underneath.
  const waterUnit = useWaterUnit()
  const fmtWater = (ml: number) => formatWater(ml, waterUnit)
  const imperialWater = waterUnit === "fl oz"
  const oneGlassMl = oneGlassWaterMl(waterUnit)
  const waterChips = waterPoursMl(waterUnit, WATER_CHIPS_ML, WATER_CHIPS_FL_OZ)
  const percent = Math.min(
    100,
    Math.round((totalMl / Math.max(1, goalMl)) * 100)
  )

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
      loggedAt: stampAt(dateKey, atMinutes),
    }
    void addWaterEntry({ date: dateKey, entry })
    toast.success(
      tr("{{value0}} of water logged", { value0: fmtWater(clamped) }),
      {
        action: {
          label: tr("Undo"),
          onClick: () => {
            void removeWaterEntry({ date: dateKey, id: entry.id }).catch(() => {
              toast.error(translateError(tr("Couldn't undo that")))
            })
          },
        },
      }
    )
  }

  function submitCustom() {
    const parsed = Number.parseFloat(custom)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    // The field speaks the system's unit; storage stays ml.
    add(imperialWater ? flOzToMl(parsed) : parsed)
    setCustom("")
  }

  function removeEntry(id: string) {
    // Targeted removeEntry, not a setDay rewrite — same reason the food
    // drawer switched: a day-rewrite races any glass added in between.
    void removeWaterEntry({ date: dateKey, id }).catch(() => {
      toast.error(translateError(tr("Couldn't remove that")))
    })
  }

  const fillOverText = percent >= 76

  return (
    <div className="flex flex-col gap-4 p-4">
      <DrawerIntro
        title={tr("Water")}
        detail={tr("{{value0}} of {{value1}} today", {
          value0: fmtWater(totalMl),
          value1: fmtWater(goalMl),
        })}
      />

      {/* The glass. Fill height is the day's real number. */}
      <div
        className="relative mx-auto flex h-48 w-32 items-stretch justify-center overflow-hidden rounded-t-xl rounded-b-[2.5rem] border-2 transition-colors"
        style={{
          borderColor: tint(WATER_COLOR, 35),
          backgroundColor: tint(WATER_COLOR, 4),
        }}
        role="img"
        aria-label={tr("Water glass {{value0}} percent full", {
          value0: percent,
        })}
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
          onClick={() => add(oneGlassMl)}
          className="motion-tactile col-span-2 flex min-h-14 items-center justify-center gap-2 rounded-2xl text-[17px] font-bold"
          style={{ backgroundColor: WATER_BG, color: WATER_COLOR }}
        >
          <Message
            text={"{{value0}}Add {{value1}}"}
            values={{
              value0: <PintGlass size={19} weight="bold" />,
              value1: fmtWater(oneGlassMl),
            }}
          />
        </button>
        {waterChips.map((ml) => (
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
        <span className="native-field-label shrink-0">{tr("Custom")}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={
            imperialWater
              ? Math.round(mlToFlOz(WATER_CUSTOM_MAX))
              : WATER_CUSTOM_MAX
          }
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitCustom()
          }}
          placeholder={
            imperialWater ? tr("Amount in fl oz") : tr("Amount in ml")
          }
          aria-label={
            imperialWater
              ? tr("Custom water amount in fluid ounces")
              : tr("Custom water amount in millilitres")
          }
          className="h-12 min-w-0 flex-1 bg-transparent text-right text-[15px] tabular-nums outline-none placeholder:text-left placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={submitCustom}
          disabled={!Number.parseInt(custom, 10)}
          className="-mr-1 flex min-h-9 items-center rounded-xl bg-foreground px-3.5 text-[13px] font-bold text-background disabled:opacity-40"
        >
          {tr("Add")}
        </button>
      </label>

      {/* The day's entries, each one removable right here. Undo toasts are
          transient; a wrong glass should not survive the toast. */}
      {entries.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {entries
            .slice()
            .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
            .map((entry) => (
              <div
                key={entry.id}
                className="flex min-h-11 items-center justify-between gap-2 px-3.5 py-2"
              >
                <p className="native-row-detail tabular-nums">
                  {fmtWater(entry.amountMl)} ·{" "}
                  {new Date(entry.loggedAt).toLocaleTimeString(uiLocale(), {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => removeEntry(entry.id)}
                  className="flex size-9 items-center justify-center rounded-lg text-muted-foreground active:bg-muted active:text-destructive"
                  aria-label={tr("Remove {{value0}} water entry", {
                    value0: fmtWater(entry.amountMl),
                  })}
                >
                  <Trash size={15} weight="bold" />
                </button>
              </div>
            ))}
        </div>
      )}

      <DrawerRow
        icon={<CalendarBlank size={16} weight="bold" />}
        title={tr("See the whole week")}
        detail={tr("History, goals and trends.")}
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
  atMinutes,
  onClose,
  editEntry,
}: {
  dateKey: string
  atMinutes?: number
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
  const [mode, setMode] = useState<"snap" | "repeat" | "search">("repeat")
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [searchResults, setSearchResults] = useState<
    Awaited<ReturnType<typeof searchFoodsAccurate>>
  >([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchRequestRef = useRef(0)

  const choices = useMemo(() => {
    const repeats = buildQuickRepeatFoods(
      (recentFood ?? []).filter((day) => day.date !== dateKey) as Parameters<
        typeof buildQuickRepeatFoods
      >[0],
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
          detail: tr("{{value0}} items · {{value1}}", {
            value0: preset.entries.length,
            value1: macroLine(totals, energyUnit),
          }),
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
      meal: entry.meal ?? defaultMeal(),
      // The timeline's explicit minute wins; otherwise the meal tag supplies
      // the default time ("breakfast" lands at the breakfast hour).
      loggedAt:
        atMinutes !== undefined
          ? stampAt(dateKey, atMinutes)
          : foodLogTimestampForMeal(dateKey, entry.meal ?? defaultMeal()),
    }))
    setBusy(true)
    try {
      // Entries carry unique client ids and the server dedupes by id, so the
      // batch can go out together instead of serialised: a 4-item preset logs
      // in one round trip, not four.
      await Promise.all(
        entries.map((entry) => addFood({ date: dateKey, entry }))
      )
      announceOrbActivity("log", Math.min(entries.length, 3))
      hapticMedium()
      toast.success(tr("{{value0}} logged", { value0: choice.name }), {
        action: {
          label: tr("Undo"),
          onClick: () => {
            announceOrbActivity("delete", Math.min(entries.length, 3))
            void Promise.all(
              entries.map((entry) =>
                removeFood({ date: dateKey, entryId: entry.id })
              )
            ).catch(() => toast.error(translateError(tr("Couldn't undo that"))))
          },
        },
      })
    } catch (error) {
      logDevWarn("Failed to log food from the quick-action drawer", error)
      toast.error(translateError(tr("Couldn't log that. Try again.")))
    } finally {
      setBusy(false)
    }
  }

  const loading = recentFood === undefined || mealPresets === undefined

  const context = foodLogContextParams(
    dateKey,
    atMinutes === undefined ? undefined : foodLogTime(atMinutes)
  )

  function selectMode(next: "snap" | "repeat" | "search") {
    if (next === mode) return
    setMode(next)
  }

  useEffect(() => {
    const requestId = ++searchRequestRef.current
    const trimmed = query.trim()
    if (mode !== "search" || trimmed.length < 2) {
      setSearchResults([])
      setSearching(false)
      setSearchError(false)
      return
    }

    setSearching(true)
    setSearchError(false)
    const timeout = window.setTimeout(() => {
      void searchFoodsAccurate(trimmed, { limit: 8, fetchLimit: 24 })
        .then((results) => {
          if (requestId !== searchRequestRef.current) return
          setSearchResults(results)
          setSearching(false)
        })
        .catch(() => {
          if (requestId !== searchRequestRef.current) return
          setSearchResults([])
          setSearching(false)
          setSearchError(true)
        })
    }, 280)

    return () => window.clearTimeout(timeout)
  }, [mode, query])

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
    <div className="quick-food-log flex min-h-[35rem] flex-col px-4 pt-1 pb-4">
      <FoodModeDial value={mode} onChange={selectMode} />

      <div className="quick-food-log__stage" data-mode={mode}>
        {mode === "snap" && (
          <QuickFoodCamera
            onCapture={(snapCapture) => {
              onClose()
              navigate(`/camera?${context}`, {
                motion: "forward",
                state: { snapCapture },
              })
            }}
            onCamera={() => {
              onClose()
              navigate(`/camera?${context}`, { motion: "forward" })
            }}
            onLibrary={() => {
              hapticMedium()
              onClose()
              navigate(`/camera?source=library&${context}`, {
                motion: "forward",
              })
            }}
          />
        )}

        {mode === "repeat" && (
          <div className="flex h-full flex-col">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
                {tr("Your usuals")}
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {tr("Log the same portion again with one tap.")}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
              {!loading && choices.length === 0 && (
                <p className="px-4 py-8 text-center text-[14px] leading-5 text-muted-foreground">
                  {tr(
                    "Nothing to repeat yet. Foods and saved meals appear here after you log them."
                  )}
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
          </div>
        )}

        {mode === "search" && (
          <div className="flex h-full flex-col">
            <div className="p-3 pb-2">
              <label className="quick-food-log__search">
                {searching ? (
                  <span className="size-4 animate-spin rounded-full border border-muted-foreground/25 border-t-foreground" />
                ) : (
                  <MagnifyingGlass
                    size={17}
                    className="text-muted-foreground"
                  />
                )}
                <input
                  ref={searchInputRef}
                  type="search"
                  name="quick-food-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tr("Food, brand, or dish")}
                  maxLength={80}
                  aria-label={tr("Search foods")}
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
              {query.trim().length < 2 && (
                <p className="px-5 py-8 text-center text-[14px] leading-5 text-muted-foreground">
                  {tr("Start typing to search foods, brands, and dishes.")}
                </p>
              )}
              {searchError && (
                <p className="px-5 py-8 text-center text-[14px] leading-5 text-destructive">
                  {tr("Search failed. Check your connection and try again.")}
                </p>
              )}
              {!searching &&
                !searchError &&
                query.trim().length >= 2 &&
                searchResults.length === 0 && (
                  <p className="px-5 py-8 text-center text-[14px] leading-5 text-muted-foreground">
                    {tr(
                      "No matches yet. Try a simpler name or create your own food."
                    )}
                  </p>
                )}
              {searchResults.map((item, index) => (
                <div key={item.id}>
                  {index > 0 && <RowDivider />}
                  <DrawerRow
                    icon={<ForkKnife size={16} weight="bold" />}
                    title={item.name}
                    detail={tr("{{value0}}{{value1}} {{value2}}", {
                      value0: item.brand ? `${item.brand} · ` : "",
                      value1: energyDisplay(item.calories, energyUnit),
                      value2: energyUnit,
                    })}
                    onClick={() => {
                      onClose()
                      navigate(
                        `/foods/review/${encodeURIComponent(item.id)}?${context}`,
                        { motion: "forward", state: { item } }
                      )
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mx-3 mb-3 min-h-11 rounded-xl text-[13px] font-semibold text-muted-foreground active:bg-muted/60"
              onClick={() => {
                onClose()
                navigate(`/foods/search?${context}`, { motion: "forward" })
              }}
            >
              {tr("Open full food search")}
            </button>
          </div>
        )}
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
  const updateFood = useOfflineMutation(
    api.logs.foodLogs.updateEntry,
    "logs.foodLogs.updateEntry"
  )
  const addFood = useOfflineMutation(
    api.logs.foodLogs.addEntry,
    "logs.foodLogs.addEntry"
  )
  const removeFood = useOfflineMutation(
    api.logs.foodLogs.removeEntry,
    "logs.foodLogs.removeEntry"
  )
  const [meal, setMeal] = useState(entry.meal)
  const [serving, setServing] = useState(entry.servingLabel ?? "")
  // The entry's own clock, editable: the timeline holds the day, this moves
  // the minute within it.
  const entryAt = new Date(entry.loggedAt)
  const [loggedAtTime, setLoggedAtTime] = useState(() =>
    foodLogTime(entryAt.getHours() * 60 + entryAt.getMinutes())
  )
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    setBusy(true)
    try {
      const patch: FoodLogEntry = {
        ...entry,
        meal: meal || defaultMeal(),
        loggedAt: foodLogTimestamp(dateKey, loggedAtTime),
      }
      patch.servingLabel = serving ? serving : undefined
      delete patch._id
      await updateFood({ date: dateKey, entry: patch })
      hapticMedium()
      toast.success(tr("{{value0}} updated", { value0: entry.name }))
      onClose()
    } catch (error) {
      logDevWarn("Failed to edit food entry from drawer", error)
      toast.error(translateError(tr("Couldn't save that.")))
    } finally {
      setBusy(false)
    }
  }

  /** Duplicate the entry as a fresh log — the timeline's "copy" action. */
  async function copyAsNew() {
    if (busy) return
    setBusy(true)
    try {
      const copiedMeal = meal || defaultMeal()
      const copy = stripUndefined({
        ...entry,
        _id: undefined,
        id: createClientId(),
        meal: copiedMeal,
        loggedAt: foodLogTimestamp(dateKey, loggedAtTime),
        servingLabel: serving ? serving : undefined,
      }) as FoodLogEntry
      await addFood({ date: dateKey, entry: copy })
      announceOrbActivity("log")
      hapticMedium()
      toast.success(
        tr("{{value0}} logged as a new entry", { value0: entry.name }),
        {
          action: {
            label: tr("Undo"),
            onClick: () => {
              announceOrbActivity("delete")
              void removeFood({ date: dateKey, entryId: copy.id }).catch(() => {
                toast.error(translateError(tr("Couldn't undo that")))
              })
            },
          },
        }
      )
      onClose()
    } catch (error) {
      logDevWarn("Failed to copy food entry from drawer", error)
      toast.error(translateError(tr("Couldn't copy that.")))
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
            {tr("Meal")}
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
          {tr("Logged at")}
        </label>
        <input
          type="time"
          value={loggedAtTime}
          onChange={(event) => setLoggedAtTime(event.target.value)}
          aria-label={tr("Logged at time")}
          className="mt-2 w-full bg-transparent text-[15px] tabular-nums outline-none"
        />
      </div>

      <div className="app-surface overflow-hidden px-4 py-3">
        <label className="block text-[12px] font-medium text-muted-foreground">
          {tr("Serving")}
        </label>
        <input
          type="text"
          value={serving}
          onChange={(event) => setServing(event.target.value)}
          placeholder={
            entry.servingLabel ? undefined : tr("e.g. 1 cup, 2 slices")
          }
          className="mt-2 w-full text-[15px] text-foreground outline-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="motion-tactile flex-1 rounded-xl bg-foreground py-3 font-bold text-background"
        >
          {busy ? tr("Saving…") : tr("Save")}
        </button>
        <button
          type="button"
          onClick={() => void copyAsNew()}
          disabled={busy}
          className="motion-tactile rounded-xl border border-border px-4 py-3 text-[14px] font-semibold text-foreground"
        >
          {tr("Copy as new")}
        </button>
      </div>
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
  atMinutes,
  onClose,
}: {
  dateKey: string
  atMinutes?: number
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
  const removeFood = useMutation(api.logs.foodLogs.removeEntry)
  const [busy, setBusy] = useState(false)

  async function logRecipe(recipe: NonNullable<typeof recipes>[number]) {
    if (busy) return
    const totals = recipeTotals(recipe.ingredients, recipe.servings ?? 1)
    const meal = defaultMeal()
    const entry = stripUndefined({
      id: createClientId(),
      name: recipe.name,
      ...totals,
      loggedAt:
        atMinutes !== undefined
          ? stampAt(dateKey, atMinutes)
          : foodLogTimestampForMeal(dateKey, meal),
      meal,
      recipeId: recipe._id,
    }) as FoodLogEntry
    setBusy(true)
    try {
      await addFood({ date: dateKey, entry })
      announceOrbActivity("log")
      hapticMedium()
      toast.success(tr("{{value0}} logged", { value0: recipe.name }), {
        action: {
          label: tr("Undo"),
          onClick: () => {
            announceOrbActivity("delete")
            void removeFood({ date: dateKey, entryId: entry.id }).catch(() => {
              toast.error(translateError(tr("Couldn't undo that")))
            })
          },
        },
      })
    } catch (error) {
      logDevWarn("Failed to log a recipe from the drawer", error)
      toast.error(translateError(tr("Couldn't log that. Try again.")))
    } finally {
      setBusy(false)
    }
  }

  const loading = recipes === undefined

  return (
    <div className="flex flex-col gap-3 p-4">
      <DrawerIntro
        title={tr("Recipes")}
        detail={tr("Log a serving of one of yours, or go browsing.")}
      />

      <div className="app-surface overflow-hidden">
        {!loading && (recipes ?? []).length === 0 && (
          <p className="px-4 py-3 text-[13px] leading-snug text-muted-foreground">
            {tr("No recipes yet — create your first one below.")}
          </p>
        )}
        {(recipes ?? []).slice(0, 5).map((recipe, index) => (
          <div key={recipe._id}>
            {index > 0 && <RowDivider />}
            <DrawerRow
              icon={<ForkKnife size={16} weight="bold" />}
              title={recipe.name}
              detail={tr("One serving · {{value0}}", {
                value0: macroLine(
                  recipeTotals(recipe.ingredients, recipe.servings ?? 1),
                  energyUnit
                ),
              })}
              disabled={busy}
              onClick={() => void logRecipe(recipe)}
            />
          </div>
        ))}
      </div>

      <div className="app-surface overflow-hidden">
        <DrawerRow
          icon={<CookingPot size={16} weight="bold" />}
          title={tr("Create a recipe")}
          onClick={() => {
            onClose()
            navigate("/foods/recipe/new", { motion: "forward" })
          }}
        />
        <RowDivider />
        <DrawerRow
          icon={<MagnifyingGlass size={16} weight="bold" />}
          title={tr("Browse all recipes")}
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
        title={tr("New recipe")}
        detail={tr("Build it once, then log it in a tap forever.")}
      />
      <div className="app-surface overflow-hidden">
        <DrawerRow
          icon={<CookingPot size={16} weight="bold" />}
          title={tr("Start from scratch")}
          detail={tr("Name, ingredients, servings.")}
          onClick={() => {
            onClose()
            navigate("/foods/recipe/new", { motion: "forward" })
          }}
        />
        <RowDivider />
        <DrawerRow
          icon={<MagnifyingGlass size={16} weight="bold" />}
          title={tr("Find inspiration first")}
          detail={tr("Browse saved recipes and ideas.")}
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
        title={tr("Workout")}
        detail={tr("Start now, or write down one that already happened.")}
      />
      <div className="app-surface overflow-hidden">
        <DrawerRow
          accent="var(--foreground)"
          icon={<Play size={16} weight="bold" />}
          title={tr("Start an empty session")}
          detail={tr("Exercises added as you go.")}
          onClick={() => {
            onClose()
            navigate("/workout/active", { motion: "forward" })
          }}
        />
        <RowDivider />
        <DrawerRow
          icon={<Barbell size={16} weight="bold" />}
          title={tr("Log a past workout")}
          detail={tr("Pick a routine and a time.")}
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
  const removeFast = useMutation(api.logs.fasting.remove)
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
      const id = await startFast({
        targetMinutes: hours * 60,
        protocol,
        startDate: dateKey,
      })
      hapticMedium()
      // Deleting the session rather than stopping it: a fast started by
      // mistake should leave no three-second entry in the history.
      toast.success(tr("{{value0}} fast started", { value0: protocol }), {
        action: {
          label: tr("Undo"),
          onClick: () => {
            void removeFast({ id }).catch(() => {
              toast.error(translateError(tr("Couldn't undo that")))
            })
          },
        },
      })
    } catch (error) {
      logDevWarn("Failed to start a fast from the drawer", error)
      toast.error(translateError(tr("Couldn't start the fast. Try again.")))
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
      toast.success(tr("Fast ended"))
    } catch (error) {
      logDevWarn("Failed to end a fast from the drawer", error)
      toast.error(translateError(tr("Couldn't end the fast. Try again.")))
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
        title={tr("Fasting")}
        detail={
          active
            ? tr("A fast is already running.")
            : tr("Pick a window. It starts the moment you tap.")
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
                <Message
                  text={"Running for {{value0}}h {{value1}}m"}
                  values={{
                    value0: Math.floor(elapsedMinutes / 60),
                    value1: elapsedMinutes % 60,
                  }}
                />
              </span>
            </span>
          </div>
          <RowDivider />
          <DrawerRow
            icon={<Timer size={16} weight="bold" />}
            title={tr("End the fast")}
            onClick={() => void endEarly()}
            disabled={busy}
          />
          <RowDivider />
          <DrawerRow
            icon={<CalendarBlank size={16} weight="bold" />}
            title={tr("Open fasting")}
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
                  <Message
                    text={"{{value0}} hours"}
                    values={{ value0: preset.hours }}
                  />
                </span>
              </button>
            ))}
          </div>
          <div className="app-surface overflow-hidden">
            <DrawerRow
              icon={<CalendarBlank size={16} weight="bold" />}
              title={tr("More protocols")}
              detail={tr("Custom windows and history.")}
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
  const removeLog = useMutation(api.logs.supplements.removeLog)
  const overview = (overviewRaw ?? undefined) as
    SupplementOverviewShape | undefined
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
      const result = await logTaken({ supplementId: item._id, date: dateKey })
      announceOrbActivity("log")
      hapticMedium()
      // Queued offline, the write returns no log to point at yet — the
      // toast goes out without a button rather than with a broken one.
      const logId =
        result && typeof result === "object" && "id" in result
          ? (result as { id: Id<"supplementIntakeLogs"> }).id
          : null
      toast.success(
        tr("{{value0}} taken", { value0: item.name }),
        logId
          ? {
              action: {
                label: tr("Undo"),
                onClick: () => {
                  announceOrbActivity("delete")
                  void removeLog({ logId }).catch(() => {
                    toast.error(translateError(tr("Couldn't undo that")))
                  })
                },
              },
            }
          : undefined
      )
    } catch (error) {
      logDevWarn("Failed to log a supplement from the drawer", error)
      toast.error(translateError(tr("Couldn't log that. Try again.")))
    } finally {
      setBusyId(null)
    }
  }

  const loading = overview === undefined

  return (
    <div className="flex flex-col gap-3 p-4">
      <DrawerIntro
        title={tr("Supplements")}
        detail={
          loading
            ? tr("Checking today's plan…")
            : items.length === 0
              ? tr("Nothing scheduled. Add some in the cabinet.")
              : tr("{{value0}} of {{value1}} still to take today.", {
                  value0: items.length - takenIds.size,
                  value1: items.length,
                })
        }
      />

      <div className="app-surface overflow-hidden">
        {!loading && items.length === 0 && (
          <p className="px-4 py-3 text-[13px] leading-snug text-muted-foreground">
            {tr("Your supplement cabinet is empty or paused.")}
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
                          backgroundColor:
                            "var(--status-success-bg, var(--muted))",
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
                    {tr("Take")}
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
          title={tr("Open the cabinet")}
          detail={tr("Schedule, history and editing.")}
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
  workout: tr("Workout"),
  food: tr("Log food"),
  "recipe-create": tr("New recipe"),
  recipes: tr("Recipes"),
  water: tr("Water"),
  fasting: tr("Fasting"),
  supplements: tr("Supplements"),
}

export function QuickActionDrawer({
  id,
  dateKey,
  atMinutes,
  onClose,
  editEntry,
}: {
  id: QuickActionId | null
  dateKey: string
  /** The minute the wheel picked, when one was picked. */
  atMinutes?: number
  onClose: () => void
  editEntry?: FoodLogEntry | null
}) {
  if (!id) return null

  return (
    <MobileSheet
      onClose={onClose}
      ariaLabel={tr("{{value0}} drawer", { value0: DRAWER_LABELS[id] })}
    >
      {id === "water" && (
        <WaterDrawer
          dateKey={dateKey}
          atMinutes={atMinutes}
          onClose={onClose}
        />
      )}
      {id === "food" && (
        <FoodDrawer
          dateKey={dateKey}
          atMinutes={atMinutes}
          onClose={onClose}
          editEntry={editEntry}
        />
      )}
      {id === "recipes" && (
        <RecipesDrawer
          dateKey={dateKey}
          atMinutes={atMinutes}
          onClose={onClose}
        />
      )}
      {id === "recipe-create" && <CreateRecipeDrawer onClose={onClose} />}
      {id === "workout" && <WorkoutDrawer onClose={onClose} />}
      {id === "fasting" && (
        <FastingDrawer dateKey={dateKey} onClose={onClose} />
      )}
      {id === "supplements" && (
        <SupplementsDrawer dateKey={dateKey} onClose={onClose} />
      )}
    </MobileSheet>
  )
}
