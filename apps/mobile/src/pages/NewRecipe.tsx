import React, { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import {
  ArrowLeft,
  Check,
  MagnifyingGlass,
  Minus,
  Plus,
  Warning,
  X,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { searchFoods } from "@/lib/openfoodfacts"
import {
  currentDateKey,
  type Recipe,
  type RecipeIngredient,
} from "@/lib/food-log"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { FoodResult } from "@repo/models"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function recipeTotals(ingredients: RecipeIngredient[]) {
  return ingredients.reduce(
    (acc, i) => ({
      calories: acc.calories + Math.round((i.caloriesPer100 * i.grams) / 100),
      protein:  acc.protein  + Math.round((i.proteinPer100  * i.grams) / 100),
      carbs:    acc.carbs    + Math.round((i.carbsPer100    * i.grams) / 100),
      fat:      acc.fat      + Math.round((i.fatPer100      * i.grams) / 100),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function dominantMacroColor(ing: RecipeIngredient) {
  const cP = (ing.proteinPer100 * ing.grams) / 100 * 4
  const cC = (ing.carbsPer100   * ing.grams) / 100 * 4
  const cF = (ing.fatPer100     * ing.grams) / 100 * 9
  const max = Math.max(cP, cC, cF)
  if (max === 0) return "#94a3b8"
  if (max === cP) return "#60a5fa"
  if (max === cC) return "#a78bfa"
  return "#fb923c"
}

// ─── Macro ring ───────────────────────────────────────────────────────────────

const RING_R    = 46
const RING_SW   = 9
const RING_CX   = 56
const RING_CIRC = 2 * Math.PI * RING_R
const RING_GAP  = 3.5

const MACRO_ARCS = [
  { key: "protein" as const, color: "#60a5fa", kcalPerG: 4 },
  { key: "carbs"   as const, color: "#a78bfa", kcalPerG: 4 },
  { key: "fat"     as const, color: "#fb923c", kcalPerG: 9 },
]

function MacroRing({
  totals,
}: {
  totals: { calories: number; protein: number; carbs: number; fat: number }
}) {
  const [drawn, setDrawn] = useState(false)

  const cP = totals.protein * 4
  const cC = totals.carbs   * 4
  const cF = totals.fat     * 9
  const total = cP + cC + cF || 1
  const fracs = [cP / total, cC / total, cF / total]

  // recalculate arcs whenever totals change
  let cursor = -RING_CIRC / 4
  const arcs = fracs.map((f, i) => {
    const len    = Math.max(f * RING_CIRC - RING_GAP, 0)
    const offset = -cursor
    cursor += f * RING_CIRC
    return { color: MACRO_ARCS[i].color, len, offset }
  })

  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // re-trigger draw on ingredient change
  useEffect(() => {
    setDrawn(false)
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [totals.protein, totals.carbs, totals.fat])

  return (
    <div
      className="relative shrink-0"
      style={{ width: RING_CX * 2, height: RING_CX * 2 }}
    >
      <svg
        width={RING_CX * 2}
        height={RING_CX * 2}
        viewBox={`0 0 ${RING_CX * 2} ${RING_CX * 2}`}
      >
        {/* Track */}
        <circle
          cx={RING_CX} cy={RING_CX} r={RING_R}
          fill="none" strokeWidth={RING_SW}
          stroke="currentColor"
          className="text-foreground/[0.06]"
        />
        {/* Arcs */}
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={RING_CX} cy={RING_CX} r={RING_R}
            fill="none"
            strokeWidth={RING_SW}
            strokeLinecap="butt"
            stroke={a.color}
            strokeDasharray={`${drawn ? a.len : 0} ${RING_CIRC}`}
            strokeDashoffset={a.offset}
            style={{
              transition: drawn
                ? `stroke-dasharray 600ms cubic-bezier(0.4,0,0.2,1) ${i * 80}ms`
                : "none",
            }}
          />
        ))}
      </svg>
      {/* Centre label */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] leading-none font-bold tabular-nums">
          {totals.calories}
        </span>
        <span className="mt-0.5 text-[8px] font-semibold tracking-[0.15em] text-muted-foreground/40 uppercase">
          kcal
        </span>
      </div>
    </div>
  )
}

// ─── Ingredient card ──────────────────────────────────────────────────────────

function IngredientCard({
  ingredient,
  index,
  calShare,         // 0–100, this ingredient's share of total calories
  onGramsChange,
  onDelete,
}: {
  ingredient: RecipeIngredient
  index: number
  calShare: number
  onGramsChange: (g: number) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState(String(ingredient.grams))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const cals   = Math.round((ingredient.caloriesPer100 * ingredient.grams) / 100)
  const accent = dominantMacroColor(ingredient)

  function commit(raw: string) {
    const n = parseFloat(raw.replace(/[^\d.]/g, ""))
    if (!isNaN(n) && n > 0 && n <= 9999) onGramsChange(Math.round(n))
    setInputVal(String(ingredient.grams))
    setEditing(false)
  }

  function step(dir: 1 | -1) {
    const s = ingredient.grams < 50 ? 5 : ingredient.grams < 200 ? 10 : 25
    onGramsChange(Math.max(1, Math.min(9999, ingredient.grams + dir * s)))
  }

  return (
    <div
      className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/25"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-3.5 py-3">
        {/* Index */}
        <span
          className="w-5 shrink-0 text-center text-[10px] font-bold tabular-nums"
          style={{ color: accent, opacity: 0.5 }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* Name */}
        <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium leading-snug">
          {ingredient.name}
        </p>

        {/* Gram stepper */}
        <div className="flex shrink-0 items-center">
          <button
            onPointerDown={e => { e.preventDefault(); step(-1) }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/30 transition-colors active:text-foreground/60"
          >
            <Minus size={9} weight="bold" />
          </button>

          {editing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onBlur={e => commit(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") e.currentTarget.blur()
                if (e.key === "Escape") {
                  setInputVal(String(ingredient.grams))
                  setEditing(false)
                }
              }}
              className="w-16 rounded-xl bg-muted/60 px-1.5 py-1 text-center text-[12px] font-semibold tabular-nums outline-none"
            />
          ) : (
            <button
              onClick={() => { setInputVal(String(ingredient.grams)); setEditing(true) }}
              className="min-w-[44px] rounded-xl bg-muted/50 px-2.5 py-1 text-center text-[11.5px] font-semibold text-muted-foreground/65 tabular-nums transition-colors active:bg-muted"
            >
              {ingredient.grams}g
            </button>
          )}

          <button
            onPointerDown={e => { e.preventDefault(); step(1) }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/30 transition-colors active:text-foreground/60"
          >
            <Plus size={9} weight="bold" />
          </button>
        </div>

        {/* Calorie display */}
        <span className="w-8 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-foreground/45">
          {cals}
        </span>

        {/* Delete */}
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onDelete}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/20 transition-colors active:text-destructive/70"
        >
          <X size={9} weight="bold" />
        </button>
      </div>

      {/* Calorie share bar — the signature element */}
      <div className="h-[2.5px] w-full bg-transparent">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${calShare}%`,
            backgroundColor: accent,
            opacity: 0.45,
          }}
        />
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center">
      {/* Bowl illustration */}
      <div className="relative">
        <div className="h-20 w-20 rounded-full bg-muted/40" />
        <svg
          className="absolute inset-0"
          width="80" height="80"
          viewBox="0 0 80 80"
          fill="none"
        >
          {/* Bowl */}
          <ellipse cx="40" cy="52" rx="24" ry="8" className="fill-muted" />
          <path
            d="M16 40 Q16 60 40 60 Q64 60 64 40"
            stroke="currentColor" strokeWidth="2"
            className="text-foreground/20"
            fill="none" strokeLinecap="round"
          />
          {/* Steam wisps */}
          <path d="M30 34 Q32 28 30 22" stroke="currentColor" strokeWidth="1.5"
            className="text-foreground/15" fill="none" strokeLinecap="round" />
          <path d="M40 30 Q42 24 40 18" stroke="currentColor" strokeWidth="1.5"
            className="text-foreground/15" fill="none" strokeLinecap="round" />
          <path d="M50 34 Q52 28 50 22" stroke="currentColor" strokeWidth="1.5"
            className="text-foreground/15" fill="none" strokeLinecap="round" />
        </svg>
      </div>

      <div>
        <p className="text-[17px] font-bold tracking-[-0.01em] text-foreground/50">
          Stack your ingredients
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground/40">
          Search and add foods to build<br />your custom recipe
        </p>
      </div>

      <button
        onClick={onAdd}
        className="flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-semibold text-background transition-opacity active:opacity-75"
      >
        <Plus size={13} weight="bold" />
        Add first ingredient
      </button>
    </div>
  )
}

// ─── Search overlay ───────────────────────────────────────────────────────────

type SearchState = "idle" | "loading" | "done" | "error"

function SearchOverlay({
  onAdd,
  onClose,
}: {
  onAdd: (item: FoodResult, grams: number) => void
  onClose: () => void
}) {
  const [query, setQuery]             = useState("")
  const [results, setResults]         = useState<FoodResult[]>([])
  const [searchState, setSearchState] = useState<SearchState>("idle")
  const [pending, setPending]         = useState<FoodResult | null>(null)
  const [pendingGrams, setPendingGrams] = useState(100)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearchState("idle"); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearchState("loading")
      try {
        const items = await searchFoods(q)
        setResults(items)
        setSearchState("done")
      } catch {
        setSearchState("error")
      }
    }, 380)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  function handleConfirmAdd() {
    if (!pending) return
    onAdd(pending, pendingGrams)
    setPending(null)
    setPendingGrams(100)
    setQuery("")
    setResults([])
    setSearchState("idle")
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pb-3"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top, 1.25rem))" }}
      >
        <button
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60 transition-opacity active:opacity-60"
        >
          <ArrowLeft size={15} weight="bold" />
        </button>

        <div className="relative flex-1">
          {searchState === "loading" ? (
            <div className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border border-muted-foreground/20 border-t-muted-foreground/60" />
          ) : (
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
            />
          )}
          <input
            ref={inputRef}
            type="text"
            placeholder="Search ingredient…"
            value={query}
            onChange={e => { setQuery(e.target.value); setPending(null) }}
            className="h-9 w-full rounded-xl bg-muted/60 pl-8 pr-8 text-[14px] outline-none placeholder:text-muted-foreground/40"
          />
          {query.length > 0 && (
            <button
              onClick={() => { setQuery(""); setResults([]); setSearchState("idle"); setPending(null) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 active:opacity-60"
            >
              <X size={13} weight="bold" />
            </button>
          )}
        </div>
      </div>

      <div className="mx-4 h-px bg-border/40" />

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 [&::-webkit-scrollbar]:hidden">
        {searchState === "idle" && (
          <div className="flex flex-col items-center gap-2 pt-16 text-center">
            <MagnifyingGlass size={28} className="text-muted-foreground/20" />
            <p className="text-[13px] font-medium text-muted-foreground/40">Search millions of foods</p>
            <p className="text-[11px] text-muted-foreground/25">Powered by Open Food Facts</p>
          </div>
        )}

        {searchState === "error" && (
          <div className="flex flex-col items-center gap-2 pt-16 text-center">
            <Warning size={28} className="text-muted-foreground/30" />
            <p className="text-[13px] font-medium text-muted-foreground/50">Search failed</p>
          </div>
        )}

        {searchState === "done" && results.length === 0 && (
          <div className="pt-16 text-center">
            <p className="text-[13px] font-medium text-muted-foreground/50">No results for "{query}"</p>
            <p className="mt-1 text-[11px] text-muted-foreground/30">Try a different name or brand</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <p className="mb-2 mt-1 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/35">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </p>
            <div className="divide-y divide-border/30">
              {results.map(item => {
                const isPending = pending?.id === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => { setPending(item); setPendingGrams(100) }}
                    className={cn(
                      "flex w-full items-center gap-3 py-3 text-left transition-opacity active:opacity-60",
                      isPending && "pointer-events-none opacity-35"
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-muted/50">
                      <span className="text-[10px] font-bold leading-none text-foreground/70">
                        {item.calories}
                      </span>
                      <span className="text-[8.5px] text-muted-foreground/35">kcal</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium leading-snug">{item.name}</p>
                      {item.brand && (
                        <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground/40">{item.brand}</p>
                      )}
                      <div className="mt-1 flex gap-2">
                        <span className="text-[10px] text-muted-foreground/40">P{item.protein}g</span>
                        <span className="text-[10px] text-muted-foreground/40">C{item.carbs}g</span>
                        <span className="text-[10px] text-muted-foreground/40">F{item.fat}g</span>
                        <span className="text-[9.5px] text-muted-foreground/25">per 100g</span>
                      </div>
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/50 transition-colors">
                      <Plus size={13} className="text-foreground/40" />
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Pending gram selector — sticky at bottom */}
      {pending && (
        <div
          className="border-t border-border/30 bg-card px-4 pt-3"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}
        >
          <div className="mb-2.5 flex items-center gap-2">
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: dominantMacroColor({
                id: "", name: pending.name, grams: pendingGrams,
                caloriesPer100: pending.calories,
                proteinPer100: pending.protein,
                carbsPer100: pending.carbs,
                fatPer100: pending.fat,
              })}}
            />
            <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
              {pending.name}
            </p>
            <span className="shrink-0 text-[11px] text-muted-foreground/40 tabular-nums">
              {Math.round(pending.calories * pendingGrams / 100)} kcal
            </span>
            <button
              onClick={() => setPending(null)}
              className="text-muted-foreground/30 active:opacity-60"
            >
              <X size={12} weight="bold" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onPointerDown={e => e.preventDefault()}
              onClick={() => setPendingGrams(g => Math.max(1, g - 25))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground/60 transition-all active:scale-95 active:bg-muted"
            >
              <Minus size={13} weight="bold" />
            </button>
            <input
              type="text"
              inputMode="decimal"
              value={`${pendingGrams} g`}
              onFocus={e => e.target.select()}
              onChange={e => {
                const n = parseFloat(e.target.value.replace(/[^\d.]/g, ""))
                if (!isNaN(n) && n > 0) setPendingGrams(Math.round(n))
              }}
              className="h-11 flex-1 rounded-2xl bg-muted/50 px-3 text-center text-[15px] font-semibold tabular-nums outline-none"
            />
            <button
              onPointerDown={e => e.preventDefault()}
              onClick={() => setPendingGrams(g => Math.min(9999, g + 25))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground/60 transition-all active:scale-95 active:bg-muted"
            >
              <Plus size={13} weight="bold" />
            </button>
            <button
              onClick={handleConfirmAdd}
              className="flex h-11 items-center gap-1.5 rounded-2xl bg-foreground px-4 text-[13px] font-semibold text-background transition-opacity active:opacity-75"
            >
              <Check size={12} weight="bold" />
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function NewRecipe() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()

  const recipesQuery = useQuery(api.logs.recipes.list, {})
  const saveRecipeMutation = useMutation(api.logs.recipes.save)

  const initial = id && recipesQuery ? recipesQuery.find((r) => (r._id as any) === id) : undefined

  const [name, setName] = useState("")
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (initial) {
      setName(initial.name)
      setIngredients(initial.ingredients)
    }
  }, [initial])

  const totals = recipeTotals(ingredients)
  const totalCal = totals.calories || 1

  async function handleSave() {
    setSaved(true)
    try {
      await saveRecipeMutation({
        id: id as any,
        name: name.trim() || "My Recipe",
        ingredients,
      })
      setTimeout(() => navigate(-1), 300)
    } catch (err) {
      console.error("Failed to save recipe:", err)
      setSaved(false)
    }
  }

  function addIngredient(item: FoodResult, grams: number) {
    const r = (v: number) => Math.round(v * 10) / 10
    setIngredients(prev => [
      ...prev,
      {
        id:             Math.random().toString(36).slice(2),
        name:           item.name,
        grams,
        caloriesPer100: item.calories,
        proteinPer100:  r(item.protein),
        carbsPer100:    r(item.carbs),
        fatPer100:      r(item.fat),
      },
    ])
    setSearchOpen(false)
  }

  const canSave = ingredients.length > 0 && name.trim().length > 0

  return (
    <>
      <div className="page-enter flex min-h-svh flex-col bg-background">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">

          {/* ── Header ────────────────────────────────────────────────── */}
          <header
            className="flex items-center gap-3 px-4 pb-4"
            style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top, 1.25rem))" }}
          >
            <button
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60 transition-opacity active:opacity-60"
            >
              <ArrowLeft size={15} weight="bold" />
            </button>

            <p className="flex-1 text-[10px] font-semibold tracking-[0.22em] text-muted-foreground/40 uppercase">
              {initial ? "Edit Recipe" : "New Recipe"}
            </p>

            <button
              onClick={handleSave}
              disabled={!canSave || saved}
              className="flex h-8 items-center gap-1.5 rounded-full bg-foreground px-4 text-[12px] font-semibold text-background transition-all active:scale-95 active:opacity-75 disabled:opacity-25"
            >
              {saved ? (
                <Check size={12} weight="bold" className="text-green-400" />
              ) : (
                <Check size={11} weight="bold" />
              )}
              Save
            </button>
          </header>

          {/* ── Recipe name ─────────────────────────────────────────────── */}
          <div className="px-5 pb-5">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Untitled Recipe"
              className="w-full bg-transparent text-[2.2rem] leading-[1.15] font-bold tracking-[-0.025em] text-foreground placeholder:text-foreground/18 outline-none"
            />
            {/* Ruler line — always visible, like a recipe card */}
            <div className="mt-3 h-px bg-border/50" />
          </div>

          {/* ── Live macro ring — slides in when first ingredient is added ── */}
          {ingredients.length > 0 && (
            <div className="mx-4 mb-4 flex items-center gap-5 rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border/25">
              <MacroRing totals={totals} />

              {/* Macro bars */}
              <div className="flex flex-1 flex-col gap-2.5">
                {[
                  { key: "protein" as const, label: "Protein", color: "#60a5fa" },
                  { key: "carbs"   as const, label: "Carbs",   color: "#a78bfa" },
                  { key: "fat"     as const, label: "Fat",     color: "#fb923c" },
                ].map(({ key, label, color }) => {
                  const val = totals[key]
                  const maxMacro = Math.max(totals.protein, totals.carbs, totals.fat) || 1
                  const pct = Math.min(100, (val / maxMacro) * 100)
                  return (
                    <div key={key}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span
                          className="text-[9px] font-semibold tracking-[0.14em] uppercase"
                          style={{ color, opacity: 0.65 }}
                        >
                          {label}
                        </span>
                        <span
                          className="text-[12px] font-bold tabular-nums"
                          style={{ color }}
                        >
                          {val}
                          <span className="text-[9px] font-medium opacity-60"> g</span>
                        </span>
                      </div>
                      <div className="h-[2.5px] w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Ingredient list ─────────────────────────────────────────── */}
          <div
            className="flex-1 overflow-y-auto px-4 [&::-webkit-scrollbar]:hidden"
            style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))" }}
          >
            {ingredients.length === 0 ? (
              <EmptyState onAdd={() => setSearchOpen(true)} />
            ) : (
              <>
                {/* Section divider */}
                <div className="mb-3 flex items-center gap-2.5">
                  <div className="h-px flex-1 bg-border/30" />
                  <span className="text-[9.5px] font-semibold tracking-[0.18em] text-muted-foreground/30 uppercase">
                    Ingredients · {ingredients.length}
                  </span>
                  <div className="h-px flex-1 bg-border/30" />
                </div>

                {/* Column header */}
                <div className="mb-2 flex items-center px-3.5 text-[9px] font-semibold tracking-[0.12em] text-muted-foreground/25 uppercase">
                  <span className="w-5 shrink-0" />
                  <span className="flex-1">Ingredient</span>
                  <span className="mr-12">Grams</span>
                  <span className="w-8 text-right">kcal</span>
                  <span className="ml-3 w-6" />
                </div>

                <div className="flex flex-col gap-2">
                  {ingredients.map((ing, idx) => {
                    const ingCal  = Math.round((ing.caloriesPer100 * ing.grams) / 100)
                    const share   = Math.round((ingCal / totalCal) * 100)
                    return (
                      <IngredientCard
                        key={ing.id}
                        ingredient={ing}
                        index={idx}
                        calShare={share}
                        onGramsChange={g =>
                          setIngredients(prev =>
                            prev.map((x, i) => i === idx ? { ...x, grams: g } : x)
                          )
                        }
                        onDelete={() =>
                          setIngredients(prev => prev.filter((_, i) => i !== idx))
                        }
                      />
                    )
                  })}
                </div>

                {/* Add ingredient button */}
                <button
                  onClick={() => setSearchOpen(true)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 py-3.5 text-[13px] font-medium text-muted-foreground/45 transition-colors active:bg-muted/20"
                >
                  <Plus size={13} className="text-muted-foreground/35" />
                  Add Ingredient
                </button>

                {/* Totals summary */}
                <div className="mt-4 flex items-center justify-between px-1">
                  <span className="text-[10px] text-muted-foreground/30">
                    {ingredients.length} ingredient{ingredients.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] text-muted-foreground/30 tabular-nums">
                      P{totals.protein} C{totals.carbs} F{totals.fat}g
                    </span>
                    <span className="text-[13px] font-bold tabular-nums text-foreground/60">
                      {totals.calories}
                      <span className="ml-0.5 text-[9.5px] font-normal text-muted-foreground/35">kcal</span>
                    </span>
                  </div>
                </div>

                {/* Save button at bottom */}
                <button
                  onClick={handleSave}
                  disabled={!canSave || saved}
                  className="mt-4 w-full rounded-2xl bg-foreground py-4 text-[14px] font-semibold text-background transition-all active:scale-[0.98] active:opacity-75 disabled:opacity-25"
                >
                  {saved
                    ? "Saved ✓"
                    : initial ? "Save Changes" : "Save Recipe"}
                </button>
              </>
            )}
          </div>

        </div>
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <SearchOverlay
          onAdd={addIngredient}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </>
  )
}
