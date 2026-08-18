/**
 * The exercise library, as it lives inside the Progress page's tab strip.
 *
 * The whole catalog arrives once and is filtered in the browser, so searching
 * ~900 movements never waits on a round trip. Tapping a row goes to
 * `/exercises/:id`, which is a page, not a modal — see ExerciseDetail. No page
 * chrome here: Progress owns the header, the tabs, and the scroll container.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "convex/react"
import { CaretDown, MagnifyingGlass, X } from "@phosphor-icons/react"

import { api } from "../../../../convex/_generated/api"
import type {
  CatalogExercise,
  ClientExercise,
} from "../../../../convex/lib/exerciseShape"
import { cn } from "@/lib/utils"
import { hapticSelection } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { ExerciseThumbnail } from "@/components/exercise-art"
import {
  EXERCISE_CATEGORY_LABELS,
  muscleSummary,
  titleCase,
} from "@/lib/exercise-display"

const ANY_VALUE = "__any__"

/** Rows rendered per batch. Roughly a screenful and a half. */
const PAGE_SIZE = 40

function sectionKey(name: string) {
  const first = name.trim().charAt(0).toUpperCase()
  return /[A-Z]/.test(first) ? first : "#"
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

/**
 * A native select wearing a pill. The platform picker beats anything hand-rolled
 * on a phone, and the list of body parts is long enough to prove it.
 */
function FilterPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  const active = value !== ANY_VALUE
  const selected = options.find((option) => option.value === value)

  return (
    <div
      className={cn(
        "relative flex min-h-11 shrink-0 items-center rounded-lg pr-7 pl-3 text-[14px] font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "bg-muted/40 text-muted-foreground"
      )}
    >
      <span className="pointer-events-none whitespace-nowrap">
        {active ? selected?.label : label}
      </span>
      <CaretDown
        size={11}
        weight="bold"
        className="pointer-events-none absolute right-2.5 opacity-60"
      />
      <select
        aria-label={label}
        value={value}
        onChange={(event) => {
          hapticSelection()
          onChange(event.target.value)
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value={ANY_VALUE}>{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// ─── Library ──────────────────────────────────────────────────────────────────

export function ExerciseLibrary() {
  const navigate = useSmoothNavigate()
  const catalog = useQuery(api.exercises.catalog)
  const customExercises = useQuery(api.logs.customExercises.list) as
    ClientExercise[] | undefined

  const [search, setSearch] = useState("")
  const [muscle, setMuscle] = useState(ANY_VALUE)
  const [equipment, setEquipment] = useState(ANY_VALUE)
  const [category, setCategory] = useState(ANY_VALUE)

  const exercises = useMemo<CatalogExercise[]>(() => {
    if (!catalog) return []
    const custom = (customExercises ?? []).map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      category: exercise.category,
      level: exercise.level,
      mechanic: exercise.mechanic,
      equipment: exercise.equipment,
      force: null,
      primaryMuscles: exercise.primaryMuscles ?? [],
      secondaryMuscles: exercise.secondaryMuscles ?? [],
      custom: true,
    }))
    return [...custom, ...catalog].sort((a, b) => a.name.localeCompare(b.name))
  }, [catalog, customExercises])

  const muscleOptions = useMemo(() => {
    const values = new Set<string>()
    for (const exercise of exercises) {
      for (const name of exercise.primaryMuscles) values.add(name.toLowerCase())
    }
    return [...values]
      .sort()
      .map((value) => ({ value, label: titleCase(value) }))
  }, [exercises])

  const equipmentOptions = useMemo(() => {
    const values = new Set<string>()
    for (const exercise of exercises) {
      if (exercise.equipment) values.add(exercise.equipment.toLowerCase())
    }
    return [...values]
      .sort()
      .map((value) => ({ value, label: titleCase(value) }))
  }, [exercises])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return exercises.filter((exercise) => {
      if (category !== ANY_VALUE && exercise.category !== category) return false
      if (
        equipment !== ANY_VALUE &&
        (exercise.equipment ?? "").toLowerCase() !== equipment
      ) {
        return false
      }
      if (
        muscle !== ANY_VALUE &&
        !exercise.primaryMuscles.some((name) => name.toLowerCase() === muscle)
      ) {
        return false
      }
      if (!needle) return true
      // Muscles are searchable too: "lats" should find the pulldowns even
      // though the word never shows up in a single exercise name.
      const haystack = [
        exercise.name,
        exercise.equipment ?? "",
        ...exercise.primaryMuscles,
        ...exercise.secondaryMuscles,
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [category, equipment, exercises, muscle, search])

  // Mounting all ~900 rows at once takes long enough to eat the route
  // transition: the animation starts, the main thread goes away to build the
  // list, and the tab appears to stutter into place. Rendering a screenful and
  // growing on scroll keeps the incoming page cheap.
  const [limit, setLimit] = useState(PAGE_SIZE)
  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [search, muscle, equipment, category])

  const sections = useMemo(() => {
    const groups = new Map<string, CatalogExercise[]>()
    // `filtered` is already sorted by name, so a prefix slices cleanly into
    // the same alphabetical sections the full list would produce.
    for (const exercise of filtered.slice(0, limit)) {
      const key = sectionKey(exercise.name)
      const bucket = groups.get(key)
      if (bucket) bucket.push(exercise)
      else groups.set(key, [exercise])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered, limit])

  const hasMore = limit < filtered.length
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    if (typeof IntersectionObserver === "undefined") {
      setLimit(filtered.length)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((current) => current + PAGE_SIZE)
        }
      },
      { rootMargin: "600px 0px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [filtered.length, hasMore])

  function openExercise(id: string) {
    hapticSelection()
    navigate(`/exercises/${encodeURIComponent(id)}`, { motion: "forward" })
  }

  const loading = catalog === undefined
  const filtersActive =
    muscle !== ANY_VALUE || equipment !== ANY_VALUE || category !== ANY_VALUE

  return (
    <section aria-label="Exercise library">
      <div className="relative">
        <MagnifyingGlass
          size={15}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          name="exercise-library-query"
          aria-label="Search exercises"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search exercises…"
          className="h-11 w-full rounded-lg border border-border/60 bg-background pr-4 pl-10 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/50 focus:ring-2 focus:ring-foreground/10"
        />
      </div>

      <div
        role="group"
        aria-label="Filter exercises"
        className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
      >
        <FilterPill
          label="Any muscle"
          value={muscle}
          options={muscleOptions}
          onChange={setMuscle}
        />
        <FilterPill
          label="Any equipment"
          value={equipment}
          options={equipmentOptions}
          onChange={setEquipment}
        />
        <FilterPill
          label="Any type"
          value={category}
          options={Object.entries(EXERCISE_CATEGORY_LABELS).map(
            ([value, label]) => ({ value, label })
          )}
          onChange={setCategory}
        />
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              hapticSelection()
              setMuscle(ANY_VALUE)
              setEquipment(ANY_VALUE)
              setCategory(ANY_VALUE)
            }}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium text-muted-foreground transition-colors active:text-foreground"
          >
            <X size={11} weight="bold" />
            Clear
          </button>
        )}
      </div>

      <p className="mt-2 text-[13px] text-muted-foreground">
        {loading
          ? "Loading the catalog…"
          : `${filtered.length} of ${exercises.length} movements`}
      </p>

      {/*
      Deliberately static. The router holds the outgoing page until the
      incoming one stops reporting `animate-pulse` / `aria-busy`, so a
      shimmering skeleton here would stall the tab transition for half a
      second before anything moved.
    */}
      {loading ? (
        <ul className="mt-4">
          {Array.from({ length: 8 }, (_, index) => (
            <li
              key={index}
              className="flex min-h-16 items-center gap-3 border-b border-border/50 py-3"
            >
              <div className="h-11 w-11 shrink-0 rounded-full bg-foreground/[0.06]" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-40 rounded bg-foreground/[0.06]" />
                <div className="h-3 w-24 rounded bg-foreground/[0.04]" />
              </div>
            </li>
          ))}
        </ul>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <MagnifyingGlass size={26} className="text-muted-foreground/40" />
          <p className="text-[15px] font-semibold">Nothing matches that</p>
          <p className="max-w-xs text-[14px] text-muted-foreground">
            Loosen a filter, or spell it the way the dataset does.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          {sections.map(([letter, group]) => (
            <section key={letter}>
              <h2 className="sticky top-0 z-10 bg-background/95 py-1.5 text-[12px] font-bold tracking-wide text-muted-foreground uppercase backdrop-blur-sm">
                {letter}
              </h2>
              <ul>
                {group.map((exercise) => (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      onClick={() => openExercise(exercise.id)}
                      className="flex min-h-16 w-full items-center gap-3 border-b border-border/50 py-3 text-left transition-colors active:bg-muted/40"
                    >
                      <ExerciseThumbnail exerciseId={exercise.id} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">
                          {exercise.name}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                          {muscleSummary(exercise.primaryMuscles)}
                        </p>
                      </div>
                      {exercise.custom ? (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          Yours
                        </span>
                      ) : exercise.level ? (
                        <span className="shrink-0 text-[12px] text-muted-foreground/70">
                          {titleCase(exercise.level)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {hasMore && (
            <div
              ref={sentinelRef}
              aria-hidden="true"
              className="h-16"
              // Deliberately no spinner: the router treats loading markers
              // as "page not ready yet", and this one is below the fold.
            />
          )}
        </div>
      )}
    </section>
  )
}
