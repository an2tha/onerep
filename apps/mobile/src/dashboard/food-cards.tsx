import { useEffect, useRef, useState } from "react"
import {
  CaretDown,
  ForkKnife,
  PencilSimple,
  Plus,
  X,
} from "@phosphor-icons/react"
import { Card, CardTitle, MACRO_COLORS, SlideToDeleteRow } from "@repo/ui"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import { DEFAULT_MEAL_CATEGORIES, type FoodLogEntry } from "@/lib/food-log"
import { DateNav } from "./date-nav"
import {
  COMPLETE_COLOR,
  DANGER_COLOR,
  DASHBOARD_EMPTY_ICON_CLASS,
  FOOD_BG,
  FOOD_COLOR,
  type CalorieInfo,
} from "./constants"
import { fmtKcal, totalsForEntries } from "./helpers"

/**
 * Calories with the day's macros underneath, plus the BMR/TDEE arithmetic
 * folded away until someone asks for it.
 */
export function CalorieCard({
  info,
  loading,
  entries,
  dayOffset,
  timeZone,
  onDayOffsetChange,
}: {
  info: CalorieInfo | null
  loading: boolean
  entries: FoodLogEntry[]
  dayOffset: number
  timeZone: string
  onDayOffsetChange: (o: number) => void
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [barMounted, setBarMounted] = useState(false)

  useEffect(() => {
    setBarMounted(false)
    const t = setTimeout(() => setBarMounted(true), 80)
    return () => clearTimeout(t)
  }, [dayOffset, loading])

  const target = info?.target ?? 1840
  const hasCalculatedBaseline = (info?.bmr ?? 0) > 0 && (info?.tdee ?? 0) > 0
  const bmr = hasCalculatedBaseline ? info!.bmr : 1480
  const tdee = hasCalculatedBaseline ? info!.tdee : 2100
  const sourceLabel =
    info?.source === "healthProfile"
      ? "profile"
      : info?.source === "onboarding"
        ? "estimated"
        : "default"
  const consumedTotals = totalsForEntries(entries)
  const consumed = consumedTotals.calories
  const remaining = Math.max(0, target - consumed)
  const pct =
    target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0

  const { protein, carbs, fat } = consumedTotals

  return (
    <Card>
      <div className="px-4 py-2.5">
        {/* Header row */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-semibold">Calories</CardTitle>
            {info?.isTrainingDay && (
              <div
                className="rounded-full px-1.5 py-0.5 text-[8px] font-bold tracking-wider uppercase"
                style={{ backgroundColor: FOOD_BG, color: FOOD_COLOR }}
              >
                Training Day
              </div>
            )}
          </div>
          <DateNav
            offset={dayOffset}
            timeZone={timeZone}
            onChange={onDayOffsetChange}
          />
        </div>

        {loading ? (
          <div className="flex flex-col gap-2.5">
            <div className="h-7 w-28 animate-pulse rounded-lg bg-muted/50" />
            <div className="h-[2px] w-full rounded bg-muted/40" />
          </div>
        ) : (
          <>
            {/* Hero row: consumed ← hairline → remaining */}
            <div className="flex items-end justify-between">
              <div>
                <span className="text-[1.5rem] leading-none font-bold tracking-tight tabular-nums">
                  {fmtKcal(consumed)}
                </span>
                <span className="ml-1 text-[11px] text-muted-foreground/50">
                  kcal
                </span>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    "text-[1rem] leading-none font-semibold tabular-nums",
                    consumed > target
                      ? "text-destructive/70"
                      : "text-muted-foreground/40"
                  )}
                >
                  {consumed > target
                    ? `+${fmtKcal(consumed - target)}`
                    : fmtKcal(remaining)}
                </span>
                <p className="text-[9.5px] text-muted-foreground/35">
                  {consumed > target ? "over" : "left"}
                  {info?.burnedCalories ? (
                    <span
                      className="ml-1"
                      style={{
                        color: `color-mix(in srgb, ${COMPLETE_COLOR} 62%, transparent)`,
                      }}
                    >
                      (+{info.burnedCalories} activity)
                    </span>
                  ) : null}
                </p>
              </div>
            </div>

            {/* Hairline progress */}
            <div className="relative mt-2.5 h-[2px] rounded-sm bg-muted/40">
              <div
                className="motion-progress-fill absolute inset-y-0 left-0 rounded-sm"
                style={{
                  width: barMounted ? `${pct}%` : "0%",
                  backgroundColor:
                    consumed > target ? DANGER_COLOR : "var(--foreground)",
                  opacity: 0.45,
                }}
              />
            </div>
            <p className="mt-1 text-[9.5px] text-muted-foreground/30 tabular-nums">
              of {fmtKcal(target)} {sourceLabel} goal
            </p>

            {/* Macro pills row */}
            <div className="mt-2.5 flex items-center gap-3 border-t border-border/20 pt-2.5">
              {[
                {
                  key: "protein" as const,
                  label: "P",
                  val: protein,
                  t: info?.protein ?? 140,
                },
                {
                  key: "carbs" as const,
                  label: "C",
                  val: carbs,
                  t: info?.carbs ?? 220,
                },
                {
                  key: "fat" as const,
                  label: "F",
                  val: fat,
                  t: info?.fat ?? 65,
                },
              ].map(({ key, label, val, t }) => {
                const over = val > t
                return (
                  <div key={key} className="flex items-baseline gap-1">
                    <span
                      className="text-[9.5px] font-semibold"
                      style={{ color: MACRO_COLORS[key], opacity: 0.8 }}
                    >
                      {label}
                    </span>
                    <span
                      className={cn(
                        "text-[12.5px] font-semibold tabular-nums",
                        over && "text-destructive/70"
                      )}
                    >
                      {Math.round(val)}
                    </span>
                    <span className="text-[9.5px] text-muted-foreground/35 tabular-nums">
                      /{t}g
                    </span>
                  </div>
                )
              })}

              {/* BMR/TDEE toggle — pushed to right */}
              <button
                onClick={() => setBreakdownOpen((o) => !o)}
                className="ml-auto flex min-h-10 items-center gap-1 rounded-lg px-2 text-[10px] text-muted-foreground/45 transition-colors active:bg-muted/45 active:text-muted-foreground/70"
                aria-expanded={breakdownOpen}
              >
                <CaretDown
                  size={10}
                  weight="bold"
                  className={cn(
                    "transition-transform duration-200",
                    breakdownOpen && "rotate-180"
                  )}
                />
                {hasCalculatedBaseline ? "BMR/TDEE" : "Est. BMR/TDEE"}
              </button>
            </div>

            {/* Collapsible BMR / TDEE */}
            <div
              className={cn(
                "grid transition-all duration-200 ease-out",
                breakdownOpen
                  ? "mt-2 grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <div className="flex gap-4 pt-1">
                  {[
                    { abbr: "BMR", value: bmr, desc: "at rest" },
                    { abbr: "TDEE", value: tdee, desc: "with activity" },
                  ].map(({ abbr, value, desc }) => (
                    <div key={abbr} className="flex items-baseline gap-1.5">
                      <span className="text-[9.5px] font-semibold text-muted-foreground/40">
                        {abbr}
                      </span>
                      <span className="text-[12.5px] font-semibold tabular-nums">
                        {fmtKcal(value)}
                      </span>
                      <span className="text-[9.5px] text-muted-foreground/30">
                        {desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

/** One logged food, swipeable to delete, with a shortcut into its recipe. */
export function SwipeRow({
  entry,
  onDelete,
}: {
  entry: FoodLogEntry
  onDelete: () => void
}) {
  const navigate = useSmoothNavigate()
  const canEditRecipe = Boolean(entry.recipeId || entry.recipeDraft)

  function editRecipe() {
    if (entry.recipeId) {
      navigate(`/foods/recipe/${entry.recipeId}`)
      return
    }
    if (entry.recipeDraft) {
      navigate("/foods/recipe/new", {
        state: { draftRecipe: entry.recipeDraft },
      })
    }
  }

  return (
    <SlideToDeleteRow
      deleteLabel={`Delete ${entry.name}`}
      onDelete={onDelete}
      actionClassName="rounded-r-lg"
      rowClassName="flex items-center gap-2 bg-background py-[5px]"
    >
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/80">
        {entry.name}
      </p>
      {canEditRecipe && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            editRecipe()
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/55 text-muted-foreground/55 transition-opacity active:opacity-70"
          aria-label={`Edit recipe for ${entry.name}`}
        >
          <PencilSimple size={11} weight="bold" />
        </button>
      )}
      <span className="shrink-0 text-[12px] font-medium text-foreground/55 tabular-nums">
        {entry.calories}
      </span>
    </SlideToDeleteRow>
  )
}

/** The day's food, grouped by meal, with the totals that reconcile it. */
export function LoggedTodayCard({
  dayOffset,
  timeZone: _timeZone,
  entries,
  onEntriesChange,
}: {
  dayOffset: number
  timeZone: string
  entries: FoodLogEntry[]
  onEntriesChange: (entries: FoodLogEntry[]) => void
}) {
  function handleRemove(id: string) {
    onEntriesChange(entries.filter((e) => e.id !== id))
  }

  const sorted = [...entries].sort((a, b) =>
    a.loggedAt.localeCompare(b.loggedAt)
  )
  const total = entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.calories,
      p: acc.p + e.protein,
      c: acc.c + e.carbs,
      f: acc.f + e.fat,
    }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  )

  // Group by meal category
  const byMeal = new Map<string, FoodLogEntry[]>()
  for (const e of sorted) {
    if (!byMeal.has(e.meal)) byMeal.set(e.meal, [])
    byMeal.get(e.meal)!.push(e)
  }
  const groups = DEFAULT_MEAL_CATEGORIES.filter((c) => byMeal.has(c.id)).map(
    (c) => ({ cfg: c, entries: byMeal.get(c.id)! })
  )

  return (
    <Card>
      <div className="px-4 py-2.5">
        <div className="mb-2">
          <CardTitle className="text-sm font-semibold">
            {dayOffset === 0 ? "Logged today" : "Food log"}
          </CardTitle>
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-5 text-center">
            <ForkKnife
              size={28}
              className={DASHBOARD_EMPTY_ICON_CLASS}
              style={{
                color: "color-mix(in srgb, var(--foreground) 11%, transparent)",
              }}
            />
            <p className="text-[13px] text-muted-foreground/55">
              Nothing here, yet
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {groups.map(({ cfg, entries: ge }) => {
              const gKcal = ge.reduce((s, e) => s + e.calories, 0)
              return (
                <div key={cfg.label}>
                  <div className="mb-0.5 flex items-center justify-between">
                    <span
                      className="text-[9.5px] font-semibold tracking-[0.12em] uppercase"
                      style={{ color: cfg.color }}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-[9.5px] text-muted-foreground/35 tabular-nums">
                      {gKcal} kcal
                    </span>
                  </div>
                  {ge.map((entry) => (
                    <SwipeRow
                      key={entry.id}
                      entry={entry}
                      onDelete={() => handleRemove(entry.id)}
                    />
                  ))}
                </div>
              )
            })}
            <div className="flex items-center justify-between border-t border-border/30 pt-2.5">
              <span className="text-[9.5px] font-semibold tracking-[0.12em] text-muted-foreground/45 uppercase">
                Total
              </span>
              <div className="flex items-baseline gap-2">
                {total.p > 0 && (
                  <span className="text-[9.5px] text-muted-foreground/35 tabular-nums">
                    P{Math.round(total.p)} C{Math.round(total.c)} F
                    {Math.round(total.f)}g
                  </span>
                )}
                <span className="text-[14px] font-semibold tabular-nums">
                  {total.kcal}
                  <span className="ml-0.5 text-[10px] font-normal text-muted-foreground/45">
                    {" "}
                    kcal
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * The half-width calorie tile. Tap flips it to the macro overview, hold adds —
 * a compromise the tile's size forced.
 */
export function CalorieSmall({
  consumed,
  target,
  protein,
  carbs,
  fat,
  onAdd,
}: {
  consumed: number
  target: number
  protein: number
  carbs: number
  fat: number
  onAdd: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressStartRef = useRef<number>(0)
  const isPressingRef = useRef(false)
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pct =
    target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0
  const over = consumed > target

  function haptic(pattern: number | number[]) {
    navigator.vibrate?.(pattern)
  }

  function handlePointerDown() {
    isPressingRef.current = true
    pressStartRef.current = Date.now()
    haptic(8)
  }

  function handlePointerUp() {
    if (!isPressingRef.current) return
    isPressingRef.current = false
    const pressDuration = Date.now() - pressStartRef.current

    // Long press (> 300ms) triggers add
    if (pressDuration >= 300) {
      haptic(15)
      onAdd()
      return
    }

    // Short tap toggles expansion
    haptic([12, 30, 18])
    if (expanded) {
      setExpanded(false)
    } else {
      setExpanded(true)
      // Auto-collapse after showing overview
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current)
      expandTimeoutRef.current = setTimeout(() => {
        setExpanded(false)
      }, 1800)
    }
  }

  function handlePointerLeave() {
    isPressingRef.current = false
  }

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current)
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current)
    }
  }, [])

  return (
    <Card className="h-full overflow-hidden">
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onClick={(e) => {
          // Pointer taps are handled in handlePointerUp; e.detail === 0 means
          // this click came from the keyboard (Enter/Space)
          if (e.detail !== 0) return
          if (expanded) {
            setExpanded(false)
          } else {
            setExpanded(true)
            if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current)
            expandTimeoutRef.current = setTimeout(() => {
              setExpanded(false)
            }, 1800)
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="group relative flex h-full w-full flex-col justify-between px-3.5 py-3 text-left"
      >
        {/* Base state */}
        <div
          className={cn(
            "flex w-full items-start justify-between transition-opacity duration-200",
            expanded && "opacity-0"
          )}
        >
          <p className="text-[10px] font-semibold text-muted-foreground/50">
            Calories
          </p>
          <Plus size={10} className="mt-0.5 text-muted-foreground/25" />
        </div>
        <div
          className={cn(
            "w-full transition-opacity duration-200",
            expanded && "opacity-0"
          )}
        >
          <div className="flex items-baseline gap-1">
            <span className="text-[1.35rem] leading-none font-bold tracking-tight tabular-nums">
              {fmtKcal(consumed)}
            </span>
            <span className="text-[9.5px] text-muted-foreground/40">kcal</span>
          </div>
          <div className="mt-2 h-[2px] w-full rounded bg-muted/40">
            <div
              className="motion-progress-fill h-full rounded"
              style={{
                width: `${pct}%`,
                backgroundColor: over ? DANGER_COLOR : "var(--foreground)",
                opacity: 0.45,
              }}
            />
          </div>
          <p className="mt-1 text-[9px] text-muted-foreground/30 tabular-nums">
            {over
              ? `+${fmtKcal(consumed - target)} over`
              : `${fmtKcal(target - consumed)} left`}
          </p>
        </div>

        {/* Expanded overview overlay */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-center px-3.5 py-3 transition-all duration-250 ease-out",
            expanded
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-2 opacity-0"
          )}
        >
          {/* Calories hero */}
          <div className="flex items-baseline gap-1">
            <span className="text-[1.4rem] leading-none font-bold tracking-tight tabular-nums">
              {fmtKcal(consumed)}
            </span>
            <span className="text-[10px] text-muted-foreground/50">kcal</span>
          </div>

          {/* Macro pills */}
          <div className="mt-2.5 flex items-center gap-3">
            <div className="flex items-baseline gap-0.5">
              <span
                className="text-[9px] font-semibold"
                style={{ color: MACRO_COLORS.protein, opacity: 0.85 }}
              >
                P
              </span>
              <span className="text-[12px] font-semibold tabular-nums">
                {Math.round(protein)}
              </span>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span
                className="text-[9px] font-semibold"
                style={{ color: MACRO_COLORS.carbs, opacity: 0.85 }}
              >
                C
              </span>
              <span className="text-[12px] font-semibold tabular-nums">
                {Math.round(carbs)}
              </span>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span
                className="text-[9px] font-semibold"
                style={{ color: MACRO_COLORS.fat, opacity: 0.85 }}
              >
                F
              </span>
              <span className="text-[12px] font-semibold tabular-nums">
                {Math.round(fat)}
              </span>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="mt-2 h-[2px] w-full rounded bg-muted/40">
            <div
              className="motion-progress-fill h-full rounded"
              style={{
                width: `${pct}%`,
                backgroundColor: over ? DANGER_COLOR : "var(--foreground)",
                opacity: 0.45,
              }}
            />
          </div>
          <p className="mt-1 text-[9px] text-muted-foreground/35 tabular-nums">
            {pct}% of {fmtKcal(target)}
          </p>
        </div>
      </button>
    </Card>
  )
}

/**
 * The half-width food tile. Same tap-to-expand, hold-to-add bargain as the
 * calorie tile, but the expansion itemizes what was actually eaten.
 */
export function FoodSmall({
  entries,
  onAdd,
}: {
  entries: FoodLogEntry[]
  onAdd: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const pressStartRef = useRef<number>(0)
  const isPressingRef = useRef(false)
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const total = entries.reduce((s, e) => s + e.calories, 0)
  const meals = new Set(entries.map((e) => e.meal)).size

  function haptic(pattern: number | number[]) {
    navigator.vibrate?.(pattern)
  }

  function handlePointerDown() {
    isPressingRef.current = true
    pressStartRef.current = Date.now()
    haptic(8)
  }

  function handlePointerUp() {
    if (!isPressingRef.current) return
    isPressingRef.current = false
    const pressDuration = Date.now() - pressStartRef.current

    // Long press triggers add
    if (pressDuration >= 300) {
      haptic(15)
      onAdd()
      return
    }

    // Short tap toggles expansion
    haptic([12, 30, 18])
    if (expanded) {
      setExpanded(false)
    } else {
      setExpanded(true)
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current)
      expandTimeoutRef.current = setTimeout(() => {
        setExpanded(false)
      }, 2200)
    }
  }

  function handlePointerLeave() {
    isPressingRef.current = false
  }

  useEffect(() => {
    return () => {
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current)
    }
  }, [])

  // Group entries by meal category
  const sorted = [...entries].sort((a, b) =>
    a.loggedAt.localeCompare(b.loggedAt)
  )
  const byMeal = new Map<string, FoodLogEntry[]>()
  for (const e of sorted) {
    if (!byMeal.has(e.meal)) byMeal.set(e.meal, [])
    byMeal.get(e.meal)!.push(e)
  }
  const groups = DEFAULT_MEAL_CATEGORIES.filter((c) => byMeal.has(c.id)).map(
    (c) => ({ cfg: c, entries: byMeal.get(c.id)! })
  )

  // Food-only on purpose. This block itemizes the visible meal entries, so
  // folding in supplement macros would make the on-screen arithmetic not add
  // up. The day's true intake total lives on the hero.
  const macroTotals = entries.reduce(
    (acc, e) => ({
      p: acc.p + e.protein,
      c: acc.c + e.carbs,
      f: acc.f + e.fat,
    }),
    { p: 0, c: 0, f: 0 }
  )

  return (
    <Card className="h-full overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        aria-label={
          expanded
            ? "Food logged today"
            : "Food. Tap to view logged food, long-press to add"
        }
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            if (expanded) {
              setExpanded(false)
            } else {
              setExpanded(true)
              if (expandTimeoutRef.current)
                clearTimeout(expandTimeoutRef.current)
              expandTimeoutRef.current = setTimeout(() => {
                setExpanded(false)
              }, 2200)
            }
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="group relative flex h-full w-full flex-col justify-between px-3.5 py-3 text-left"
      >
        {/* Base state */}
        <div
          className={cn(
            "flex w-full items-start justify-between transition-opacity duration-200",
            expanded && "opacity-0"
          )}
        >
          <p className="text-[10px] font-semibold text-muted-foreground/50">
            Food
          </p>
          <Plus size={10} className="mt-0.5 text-muted-foreground/25" />
        </div>
        <div
          className={cn(
            "transition-opacity duration-200",
            expanded && "opacity-0"
          )}
        >
          <div className="flex items-baseline gap-1">
            <span className="text-[1.35rem] leading-none font-bold tracking-tight tabular-nums">
              {fmtKcal(total)}
            </span>
            <span className="text-[9.5px] text-muted-foreground/40">kcal</span>
          </div>
          <p className="mt-0.5 text-[9px] text-muted-foreground/35">
            {entries.length === 0
              ? "Tap to log food"
              : `${entries.length} item${entries.length !== 1 ? "s" : ""} · ${meals} meal${meals !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Expanded "Logged today" view */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col overflow-hidden transition-all duration-250 ease-out",
            expanded
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-2 opacity-0"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 pt-3">
            <p className="text-[10px] font-semibold text-muted-foreground/50">
              Logged today
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(false)
                haptic(8)
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/40"
              aria-label="Collapse"
            >
              <X size={11} weight="bold" className="text-muted-foreground/50" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-3.5 pb-3">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <ForkKnife size={20} className="text-muted-foreground/20" />
                <p className="mt-1.5 text-[11px] text-muted-foreground/40">
                  Nothing logged yet
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {groups.map(({ cfg, entries: ge }) => (
                  <div key={cfg.label}>
                    <div className="mb-0.5 flex items-center justify-between">
                      <span
                        className="text-[8.5px] font-semibold tracking-[0.1em] uppercase"
                        style={{ color: cfg.color }}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-[8.5px] text-muted-foreground/30 tabular-nums">
                        {ge.reduce((s, e) => s + e.calories, 0)} kcal
                      </span>
                    </div>
                    {ge.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between py-0.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/70">
                          {entry.name}
                        </span>
                        <span className="ml-2 shrink-0 text-[10.5px] font-medium text-foreground/50 tabular-nums">
                          {entry.calories}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Macro totals */}
                <div className="mt-1 flex items-center gap-3 border-t border-border/25 pt-2">
                  <span className="text-[8.5px] font-semibold text-muted-foreground/35">
                    Total
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-bold tabular-nums">
                      {total}
                    </span>
                    <span className="text-[9px] text-muted-foreground/40">
                      kcal
                    </span>
                  </div>
                  {macroTotals.p > 0 && (
                    <span className="text-[9px] text-muted-foreground/30 tabular-nums">
                      P{Math.round(macroTotals.p)} C{Math.round(macroTotals.c)}{" "}
                      F{Math.round(macroTotals.f)}g
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
