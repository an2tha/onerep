/**
 * Full-screen exercise search: recents, popular picks, category filters, and
 * the custom-exercise editor. Also serves as the swap picker — the caller
 * decides whether a chosen exercise is added or replaces one.
 */

import { useEffect, useRef, useState } from "react"
import {
  Check,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Warning,
  X,
} from "@phosphor-icons/react"
import { ExerciseSuggestionGroups } from "@repo/ui"
import { cn } from "@/lib/utils"
import { hapticSelection, hapticTap } from "@/lib/haptics"
import {
  searchExercises,
  visiblePopularExerciseSearches,
  type Exercise,
  type ExerciseCategory,
} from "@/lib/exercise-catalog"
import {
  readRecentExerciseSearches,
  rememberRecentExerciseSearch,
  visibleRecentExerciseSearches,
  type RecentExerciseSearch,
} from "@/lib/exercise-search-recents"
import {
  CreateExerciseButton,
  CustomExerciseSheet,
} from "@/components/custom-exercise-sheet"
import {
  CUSTOM_EXERCISE_ID_PREFIX,
  customExerciseDraftFromExercise,
  emptyCustomExerciseDraft,
  type CustomExerciseDraft,
} from "@/lib/custom-exercises"

export function AddExerciseSheet({
  addedIds,
  onAdd,
  onClose,
}: {
  addedIds: string[]
  onAdd: (ex: Exercise) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle")
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [activeCategory, setActiveCategory] = useState<ExerciseCategory | null>(
    null
  )
  const [remoteExercises, setRemoteExercises] = useState<Exercise[]>([])
  const [recentExercises, setRecentExercises] = useState(() =>
    readRecentExerciseSearches()
  )
  const [closing, setClosing] = useState(false)
  const [editorDraft, setEditorDraft] = useState<CustomExerciseDraft | null>(
    null
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const requestSeq = ++searchSeqRef.current
    const shouldSearch = q.length >= 2 || activeCategory !== null
    if (!shouldSearch) {
      setRemoteExercises([])
      setSearchState("idle")
      return
    }

    setSearchState("loading")
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchExercises({
          query: q,
          categories: activeCategory ? [activeCategory] : undefined,
          limit: 30,
        })
        if (requestSeq !== searchSeqRef.current) return
        setRemoteExercises(results as Exercise[])
        setSearchState("done")
      } catch {
        if (requestSeq !== searchSeqRef.current) return
        setRemoteExercises([])
        setSearchState("error")
      }
    }, 280)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [activeCategory, query, searchAttempt])

  const filtered = remoteExercises
  const recentSuggestions = visibleRecentExerciseSearches(
    addedIds,
    recentExercises
  ).filter(
    (exercise) => !activeCategory || exercise.category === activeCategory
  )
  const recentSuggestionIds = new Set(
    recentSuggestions.map((exercise) => exercise.id)
  )
  const popularSuggestions = visiblePopularExerciseSearches(addedIds)
    .filter((exercise) => !recentSuggestionIds.has(exercise.id))
    .filter(
      (exercise) => !activeCategory || exercise.category === activeCategory
    )

  function chooseSuggestion(exercise: ExerciseSearchSuggestion) {
    setQuery(exercise.name)
    setActiveCategory(exercise.category)
    inputRef.current?.focus()
  }

  function retrySearch() {
    setSearchAttempt((current) => current + 1)
  }

  function addAndRememberExercise(exercise: Exercise) {
    onAdd(exercise)
    setRecentExercises(rememberRecentExerciseSearch(exercise))
    hapticSelection()
  }

  function openExerciseCreator() {
    hapticTap()
    setEditorDraft(emptyCustomExerciseDraft({ name: query.trim() }))
  }

  function handleCustomExerciseSaved(exercise: Exercise) {
    setEditorDraft(null)
    setRemoteExercises((current) => {
      const rest = current.filter((item) => item.id !== exercise.id)
      return [exercise, ...rest]
    })
    if (!addedIds.includes(exercise.id)) addAndRememberExercise(exercise)
  }

  function handleCustomExerciseDeleted(docId: string) {
    const id = `${CUSTOM_EXERCISE_ID_PREFIX}${docId}`
    setEditorDraft(null)
    setRemoteExercises((current) => current.filter((item) => item.id !== id))
  }

  function requestClose() {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 340)
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 flex justify-center bg-black/20 p-3 backdrop-blur-sm md:p-0 md:bg-black/40",
        closing ? "sheet-backdrop-exit" : "sheet-backdrop-enter"
      )}
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
      onClick={requestClose}
    >
      <div
        className={cn(
          "sheet-panel sheet-panel-fullscreen flex h-[calc(100%-0.75rem)] w-full max-w-xl flex-col self-start overflow-hidden rounded-[28px] border border-foreground/15 bg-[color-mix(in_srgb,var(--background)_78%,transparent)] shadow-[0_24px_80px_-28px_rgb(0_0_0/0.65)] backdrop-blur-2xl md:mt-12 md:h-auto md:max-h-[76vh]",
          closing ? "sheet-panel-exit" : "sheet-panel-enter"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Add exercises"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close exercise search"
            className="flex h-10 w-10 shrink-0 appearance-none items-center justify-center rounded-full border border-foreground/10 bg-foreground/5 text-muted-foreground transition-colors active:bg-foreground/10 active:text-foreground"
          >
            <X size={16} weight="bold" />
          </button>
          <div className="relative flex-1">
            {searchState === "loading" ? (
              <div className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border border-muted-foreground/20 border-t-muted-foreground/70" />
            ) : (
              <MagnifyingGlass
                size={15}
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
              />
            )}
            <input
              ref={inputRef}
              type="search"
              name="exercise-search-query"
              aria-label="Search exercises"
              aria-busy={searchState === "loading"}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises…"
              className="h-11 w-full appearance-none rounded-xl border border-foreground/12 bg-foreground/6 pr-4 pl-10 text-[15px] shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("")
                  setActiveCategory(null)
                }}
                aria-label="Clear exercise search"
                className="absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 appearance-none items-center justify-center border-0 bg-transparent text-muted-foreground active:text-foreground"
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
        </div>
        <ExerciseCategoryFilters
          activeCategory={activeCategory}
          onChange={setActiveCategory}
        />
        <div
          className="flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))]"
          aria-live="polite"
        >
          {searchState === "loading" ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground/70" />
              <p className="text-[13px] font-medium text-muted-foreground/65">
                Finding exercises
              </p>
            </div>
          ) : filtered.length > 0 ? (
            <>
              <p className="mt-4 mb-2 px-1 text-[13px] font-semibold text-muted-foreground">
                {filtered.length} result{filtered.length === 1 ? "" : "s"}
              </p>
              <div className="divide-y divide-border/60 border-y border-border/60">
                {filtered.map((ex) => {
                  const already = addedIds.includes(ex.id)
                  return (
                    <ExerciseSearchResult
                      key={ex.id}
                      exercise={ex}
                      added={already}
                      onAdd={() => addAndRememberExercise(ex)}
                      onEdit={
                        ex.custom
                          ? () =>
                              setEditorDraft(
                                customExerciseDraftFromExercise(ex)
                              )
                          : undefined
                      }
                    />
                  )
                })}
              </div>
              <CreateExerciseButton
                query={query}
                onClick={openExerciseCreator}
              />
            </>
          ) : searchState === "idle" ? (
            <div className="grid gap-5 pt-5">
              <div className="px-2 py-2 text-center">
                <p className="text-[14px] text-muted-foreground">
                  {query.trim()
                    ? "Type one more letter to search."
                    : "Search a movement or browse below."}
                </p>
              </div>
              <div className="rounded-2xl border border-foreground/10 bg-foreground/5 p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
                <ExerciseSuggestionGroups
                  recentSuggestions={recentSuggestions}
                  popularSuggestions={popularSuggestions}
                  onChoose={chooseSuggestion}
                />
              </div>
              <CreateExerciseButton
                query={query}
                onClick={openExerciseCreator}
              />
            </div>
          ) : searchState === "done" ? (
            <div className="flex flex-col items-center gap-5 px-2 py-16 text-center">
              <div className="app-empty justify-center">
                <MagnifyingGlass
                  size={18}
                  className="shrink-0 text-muted-foreground"
                />
                <p className="text-[13px] font-medium text-muted-foreground/70">
                  No matches{query.trim() ? ` for “${query.trim()}”` : ""}.
                </p>
              </div>
              <CreateExerciseButton
                query={query}
                onClick={openExerciseCreator}
              />
              <ExerciseSuggestionGroups
                recentSuggestions={recentSuggestions}
                popularSuggestions={popularSuggestions}
                onChoose={chooseSuggestion}
              />
            </div>
          ) : searchState === "error" ? (
            <div className="flex flex-col items-center gap-5 px-2 py-16 text-center">
              <div className="app-empty justify-center">
                <Warning size={18} className="shrink-0 text-destructive/70" />
                <p className="text-[13px] font-medium text-muted-foreground/70">
                  Exercise search is unavailable.
                </p>
                <button
                  type="button"
                  onClick={retrySearch}
                  className="mt-1 min-h-9 rounded-[10px] bg-foreground px-4 text-[13px] font-semibold text-background active:opacity-85"
                >
                  Retry
                </button>
              </div>
              <ExerciseSuggestionGroups
                recentSuggestions={recentSuggestions}
                popularSuggestions={popularSuggestions}
                onChoose={chooseSuggestion}
              />
            </div>
          ) : null}
        </div>
      </div>
      {editorDraft && (
        // Stops the editor's own backdrop click from bubbling out and closing
        // the search sheet underneath it too.
        <div onClick={(event) => event.stopPropagation()}>
          <CustomExerciseSheet
            initialDraft={editorDraft}
            onClose={() => setEditorDraft(null)}
            onSaved={handleCustomExerciseSaved}
            onDeleted={handleCustomExerciseDeleted}
          />
        </div>
      )}
    </div>
  )
}

type ExerciseSearchSuggestion = Exercise | RecentExerciseSearch

const EXERCISE_CATEGORY_FILTERS: Array<{
  category: ExerciseCategory
  label: string
}> = [
  { category: "strength", label: "Strength" },
  { category: "cardio", label: "Cardio" },
  { category: "mobility", label: "Mobility" },
  { category: "core", label: "Core" },
]

function ExerciseCategoryFilters({
  activeCategory,
  onChange,
}: {
  activeCategory: ExerciseCategory | null
  onChange: (category: ExerciseCategory | null) => void
}) {
  return (
    <div
      className="mx-4 mb-2 flex gap-1 overflow-x-auto rounded-xl border border-foreground/10 bg-foreground/5 p-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] [&::-webkit-scrollbar]:hidden"
      aria-label="Filter exercises by type"
      role="group"
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={activeCategory === null}
        className={cn(
          "min-h-11 shrink-0 appearance-none rounded-lg border-0 px-3 text-[14px] font-medium transition-colors",
          activeCategory === null
            ? "bg-foreground text-background shadow-sm"
            : "text-muted-foreground active:bg-muted/60 active:text-foreground"
        )}
      >
        All
      </button>
      {EXERCISE_CATEGORY_FILTERS.map(({ category, label }) => {
        const active = activeCategory === category
        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(active ? null : category)}
            aria-pressed={active}
            className={cn(
              "min-h-11 shrink-0 appearance-none rounded-lg border-0 px-3 text-[14px] font-medium transition-colors",
              active
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground active:bg-muted/60 active:text-foreground"
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function ExerciseSearchResult({
  exercise,
  added,
  onAdd,
  onEdit,
}: {
  exercise: Exercise
  added: boolean
  onAdd: () => void
  onEdit?: () => void
}) {
  return (
    <div className={cn("flex w-full items-center", added && "opacity-45")}>
      <button
        type="button"
        disabled={added}
        onClick={onAdd}
        aria-label={
          added ? `${exercise.name}, already added` : `Add ${exercise.name}`
        }
        className="flex min-w-0 flex-1 appearance-none items-center gap-3 border-0 bg-transparent! bg-none! px-3 py-3 text-left shadow-none! transition-colors active:bg-muted/55! disabled:cursor-default"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[15px] leading-snug font-medium">
              {exercise.name}
            </p>
            {exercise.custom && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] leading-none font-semibold text-muted-foreground">
                Yours
              </span>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] text-muted-foreground">
              {exercise.muscle}
            </span>
            <span className="text-[13px] text-muted-foreground">·</span>
            <span className="shrink-0 text-[13px] text-muted-foreground">
              {exercise.sets}
            </span>
          </div>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground">
          {added ? (
            <Check size={14} weight="bold" className="text-foreground/70" />
          ) : (
            <Plus size={15} weight="bold" />
          )}
        </span>
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${exercise.name}`}
          className="flex h-11 w-11 shrink-0 appearance-none items-center justify-center border-0 bg-transparent text-muted-foreground transition-colors active:bg-muted/55 active:text-foreground"
        >
          <PencilSimple size={15} weight="bold" />
        </button>
      )}
    </div>
  )
}
