import React, { useEffect, useRef, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { usePostHog } from "@posthog/react"
import { useQuery, useMutation, useAction } from "convex/react"
import {
  Barbell,
  CaretDown,
  CaretUp,
  Check,
  DotsSixVertical,
  Fire,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Timer,
  Wind,
  X,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { type Exercise, type ExerciseCategory } from "@/lib/exercise-catalog"
import { api } from "../../../../convex/_generated/api"
import { todayIso } from "@/lib/workout-sync"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui"
import { convexClient } from "@/lib/convex"

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = ExerciseCategory
type SetType = "working" | "warmup" | "failure" | "myoreps" | "drop"
type WeightUnit = "kg" | "lbs"

type WorkoutSet = {
  id: string
  type: SetType
  weight: string
  reps: string
  leftReps: string
  rightReps: string
  rpe: string
  restSeconds: number
  completed: boolean
}

type ExerciseState = {
  sets: WorkoutSet[]
  trackRpe: boolean
  trackUnilateral: boolean
}

type WorkoutItem =
  | { kind: "solo"; exerciseId: string }
  | { kind: "superset"; id: string; color: string; exerciseIds: string[] }

type DragInfo = {
  exerciseId: string
  x: number
  y: number
  startX: number
  startY: number
  active: boolean
}

type DropTarget = {
  type: "before" | "after" | "superset"
  targetExId: string
} | null

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<Category, React.FC<any>> = {
  strength: Barbell as React.FC<any>,
  cardio: Fire as React.FC<any>,
  mobility: Wind as React.FC<any>,
  core: Sparkle as React.FC<any>,
}

const CATEGORY_COLOR: Record<Category, string> = {
  strength: "#57534e",
  cardio: "#ea580c",
  mobility: "#0d9488",
  core: "#0284c7",
}

const SET_ORDER: SetType[] = ["working", "warmup", "failure", "myoreps", "drop"]

const SET_CFG: Record<SetType, { label: string; color: string; bg: string }> = {
  working: { label: "W", color: "#38bdf8", bg: "rgba(56,189,248,0.10)" },
  warmup: { label: "WU", color: "#a8a29e", bg: "rgba(168,162,158,0.10)" },
  failure: { label: "F", color: "#f87171", bg: "rgba(248,113,113,0.10)" },
  myoreps: { label: "M", color: "#fb923c", bg: "rgba(251,146,60,0.10)" },
  drop: { label: "DS", color: "#2dd4bf", bg: "rgba(45,212,191,0.10)" },
}

const SUPERSET_PALETTE = ["#f59e0b", "#ec4899", "#14b8a6", "#06b6d4", "#84cc16"]

const REST_OPTS = [0, 30, 60, 90, 120, 150, 180, 240, 300]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2)
}

function formatRest(s: number) {
  if (s <= 0) return "Off"
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function splitRest(seconds: number) {
  return {
    minutes: String(Math.floor(seconds / 60)),
    secs: String(seconds % 60).padStart(2, "0"),
  }
}

function clampRestInput(minutes: string, secs: string) {
  const safeMinutes = Math.max(0, Number.parseInt(minutes || "0", 10) || 0)
  const safeSeconds = Math.min(
    59,
    Math.max(0, Number.parseInt(secs || "0", 10) || 0)
  )
  return safeMinutes * 60 + safeSeconds
}

function formatElapsed(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  return `${m}:${String(sec).padStart(2, "0")}`
}

function toDisplay(kgStr: string, unit: WeightUnit): string {
  if (!kgStr) return ""
  const kg = parseFloat(kgStr)
  if (isNaN(kg)) return kgStr
  return unit === "lbs" ? String(+(kg * 2.20462).toFixed(1)) : kgStr
}

function toKg(displayVal: string, unit: WeightUnit): string {
  if (!displayVal) return ""
  const n = parseFloat(displayVal)
  if (isNaN(n)) return displayVal
  return unit === "lbs" ? String(+(n / 2.20462).toFixed(2)) : displayVal
}

function makeSet(): WorkoutSet {
  return {
    id: uid(),
    type: "working",
    weight: "",
    reps: "",
    leftReps: "",
    rightReps: "",
    rpe: "",
    restSeconds: 120,
    completed: false,
  }
}

function removeExFromItems(items: WorkoutItem[], exId: string): WorkoutItem[] {
  return items.flatMap((item): WorkoutItem[] => {
    if (item.kind === "solo") return item.exerciseId === exId ? [] : [item]
    const rest = item.exerciseIds.filter((id) => id !== exId)
    if (rest.length === 0) return []
    if (rest.length === 1)
      return [{ kind: "solo" as const, exerciseId: rest[0] }]
    return [{ ...item, exerciseIds: rest }]
  })
}

function countSets(
  items: WorkoutItem[],
  exData: Record<string, ExerciseState>
) {
  let total = 0,
    done = 0
  for (const item of items) {
    const ids = item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
    for (const id of ids) {
      const s = exData[id]?.sets ?? []
      total += s.length
      done += s.filter((x) => x.completed).length
    }
  }
  return { total, done }
}

function normalizeExerciseState(state: any): ExerciseState {
  return {
    sets: (state?.sets || []).map((s: any) => ({
      id: s.id || uid(),
      type: s.type || "working",
      weight: s.weight || "",
      reps: s.reps || "",
      leftReps: s.leftReps || "",
      rightReps: s.rightReps || "",
      rpe: s.rpe || "",
      restSeconds: s.restSeconds || 120,
      completed: !!s.completed,
    })),
    trackRpe: !!state?.trackRpe,
    trackUnilateral: !!state?.trackUnilateral,
  }
}

// ─── Rest timer countdown ─────────────────────────────────────────────────────

function useRestCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  function start(seconds: number) {
    if (ref.current) clearInterval(ref.current)
    setRemaining(seconds)
    ref.current = setInterval(() => {
      setRemaining((r) => {
        if (r === null || r <= 1) {
          if (ref.current) clearInterval(ref.current)
          ref.current = null
          return null
        }
        return r - 1
      })
    }, 1000)
  }

  function dismiss() {
    if (ref.current) {
      clearInterval(ref.current)
      ref.current = null
    }
    setRemaining(null)
  }

  useEffect(
    () => () => {
      if (ref.current) clearInterval(ref.current)
    },
    []
  )

  return { remaining, start, dismiss }
}

// ─── Elapsed timer ────────────────────────────────────────────────────────────

function useElapsedTimer() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return elapsed
}

// ─── Rest countdown banner ────────────────────────────────────────────────────

function RestCountdownBanner({
  remaining,
  onDismiss,
}: {
  remaining: number
  onDismiss: () => void
}) {
  const pct = Math.min(remaining / 300, 1)
  const trackColor = pct > 0.5 ? "#22c55e" : "#f59e0b"
  return (
    <div className="pointer-events-none fixed right-0 bottom-0 left-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]">
      <div
        className="pointer-events-auto mx-4 w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl"
        style={{
          background: "color-mix(in srgb, var(--background) 88%, transparent)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border:
            "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
        }}
      >
        <div
          className="h-[3px] w-full"
          style={{
            background: "color-mix(in srgb, var(--foreground) 6%, transparent)",
          }}
        >
          <div
            className="h-full transition-all duration-1000 ease-linear"
            style={{
              width: `${pct * 100}%`,
              backgroundColor: trackColor,
              borderRadius: "0 2px 2px 0",
            }}
          />
        </div>

        <div className="flex items-center gap-4 px-5 py-3.5">
          <div className="flex flex-col items-center gap-0.5">
            <Timer size={14} style={{ color: trackColor }} />
            <span className="text-[8px] font-medium tracking-[0.16em] text-muted-foreground/45 uppercase">
              Rest
            </span>
          </div>
          <span
            className="font-black tracking-tight tabular-nums"
            style={{
              fontSize: "2.6rem",
              lineHeight: 1,
              letterSpacing: "-0.04em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatElapsed(remaining)}
          </span>
          <button
            onClick={onDismiss}
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors active:bg-foreground/10"
            style={{
              color: "color-mix(in srgb, var(--foreground) 35%, transparent)",
            }}
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Rest timer picker sheet ──────────────────────────────────────────────────

function RestTimerSheet({
  current,
  onSelect,
  onClose,
}: {
  current: number
  onSelect: (s: number) => void
  onClose: () => void
}) {
  const [minutes, setMinutes] = useState(() => splitRest(current).minutes)
  const [secs, setSecs] = useState(() => splitRest(current).secs)

  useEffect(() => {
    const next = splitRest(current)
    setMinutes(next.minutes)
    setSecs(next.secs)
  }, [current])

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[6px]"
      onClick={onClose}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-8px_48px_rgba(0,0,0,0.18)]"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-foreground/[0.12]" />
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <Timer size={14} className="text-muted-foreground/60" />
            <span className="text-[14px] font-bold tracking-tight">
              Rest Timer
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/60 transition-colors active:bg-muted active:text-foreground"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {REST_OPTS.map((s) => (
            <button
              key={s}
              onClick={() => onSelect(s)}
              className={cn(
                "h-[52px] rounded-2xl text-[14px] font-black tracking-tight tabular-nums transition-all active:scale-[0.96]",
                s === current
                  ? "bg-foreground text-background"
                  : "bg-muted/50 text-foreground/70 active:bg-muted"
              )}
            >
              {formatRest(s)}
            </button>
          ))}
        </div>
        <div className="border-t border-border/40 px-4 pt-3 pb-2">
          <p className="mb-2.5 text-[9px] font-medium tracking-[0.18em] text-muted-foreground/45 uppercase">
            Custom
          </p>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[9px] font-bold tracking-widest text-muted-foreground/35 uppercase">
                Min
              </span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                className="h-12 [appearance:textfield] rounded-xl border border-border/50 bg-background/80 px-3 text-center text-[18px] font-black tabular-nums outline-none focus:border-foreground/30 [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
            <span className="mb-3 text-[18px] font-light text-muted-foreground/30">
              :
            </span>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[9px] font-bold tracking-widest text-muted-foreground/35 uppercase">
                Sec
              </span>
              <input
                type="number"
                min="0"
                max="59"
                inputMode="numeric"
                value={secs}
                onChange={(event) => setSecs(event.target.value)}
                className="h-12 [appearance:textfield] rounded-xl border border-border/50 bg-background/80 px-3 text-center text-[18px] font-black tabular-nums outline-none focus:border-foreground/30 [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
            <button
              onClick={() => onSelect(clampRestInput(minutes, secs))}
              className="h-12 shrink-0 rounded-xl bg-foreground px-5 text-[13px] font-bold text-background transition-opacity active:opacity-80"
            >
              Set
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Active set row ───────────────────────────────────────────────────────────

function ActiveSetRow({
  set,
  index,
  trackRpe,
  trackUnilateral,
  unit,
  onUpdate,
  onDelete,
  canDelete,
  onComplete,
}: {
  set: WorkoutSet
  index: number
  trackRpe: boolean
  trackUnilateral: boolean
  unit: WeightUnit
  onUpdate: (s: WorkoutSet) => void
  onDelete: () => void
  canDelete: boolean
  onComplete: (restSeconds: number) => void
}) {
  const [showRest, setShowRest] = useState(false)
  const [completionPulse, setCompletionPulse] = useState(false)
  const cfg = SET_CFG[set.type]

  useEffect(() => {
    if (!completionPulse) return
    const id = window.setTimeout(() => setCompletionPulse(false), 520)
    return () => window.clearTimeout(id)
  }, [completionPulse])

  function cycleType() {
    const i = SET_ORDER.indexOf(set.type)
    onUpdate({ ...set, type: SET_ORDER[(i + 1) % SET_ORDER.length] })
  }

  function toggleDone() {
    const next = !set.completed
    onUpdate({ ...set, completed: next })
    if (next) setCompletionPulse(true)
    if (next && set.restSeconds > 0) onComplete(set.restSeconds)
  }

  const fieldCls = cn(
    "h-12 w-full rounded-xl border text-center font-black tabular-nums transition-all outline-none",
    "text-[17px] tracking-tight",
    "placeholder:text-muted-foreground/15",
    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
    set.completed
      ? "cursor-default border-green-500/20 bg-green-500/[0.06] text-green-600/60 dark:text-green-400/60"
      : "border-border/40 bg-background/70 focus:border-foreground/35 focus:bg-background",
    "disabled:pointer-events-none"
  )
  const repsModeKey = trackUnilateral ? "unilateral" : "bilateral"
  const trackingModeKey = `${repsModeKey}-${trackRpe ? "rpe" : "base"}`

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 transition-[background-color,transform,box-shadow] duration-300",
          set.completed && "bg-green-500/[0.04]",
          completionPulse && "scale-[1.01]"
        )}
        style={
          completionPulse
            ? { boxShadow: "inset 0 0 0 1px rgba(34,197,94,0.22)" }
            : undefined
        }
      >
        <span
          className="w-4 shrink-0 text-center text-[11px] font-medium tabular-nums select-none"
          style={{
            color: "color-mix(in srgb, var(--foreground) 18%, transparent)",
          }}
        >
          {index + 1}
        </span>
        <button
          onClick={cycleType}
          disabled={set.completed}
          className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl transition-all select-none active:scale-[0.88] disabled:pointer-events-none"
          style={{
            backgroundColor: set.completed ? "rgba(34,197,94,0.10)" : cfg.bg,
          }}
        >
          {set.completed ? (
            <Check size={15} weight="bold" className="text-green-500" />
          ) : (
            <span
              className="text-[12px] font-bold"
              style={{ color: cfg.color }}
            >
              {cfg.label}
            </span>
          )}
        </button>
        <div className="flex flex-1 flex-col gap-0.5">
          <input
            type="number"
            inputMode="decimal"
            value={toDisplay(set.weight, unit)}
            onChange={(e) =>
              onUpdate({ ...set, weight: toKg(e.target.value, unit) })
            }
            placeholder="–"
            disabled={set.completed}
            className={fieldCls}
          />
          <span
            className="text-center text-[8px] font-medium tracking-widest uppercase"
            style={{
              color: "color-mix(in srgb, var(--foreground) 28%, transparent)",
            }}
          >
            {unit}
          </span>
        </div>
        <span
          className="shrink-0 text-[15px] font-thin select-none"
          style={{
            color: "color-mix(in srgb, var(--foreground) 15%, transparent)",
          }}
        >
          ×
        </span>
        <div
          key={trackingModeKey}
          className={cn(
            "flex min-w-0 flex-1 animate-in items-start gap-2 duration-200 fade-in-0 zoom-in-95 slide-in-from-bottom-1",
            trackUnilateral && "flex-[1.8]"
          )}
        >
          {trackUnilateral ? (
            <div className="grid min-w-0 flex-[1.5] grid-cols-2 gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <input
                  type="number"
                  inputMode="numeric"
                  value={set.leftReps}
                  onChange={(e) =>
                    onUpdate({ ...set, leftReps: e.target.value })
                  }
                  placeholder="–"
                  disabled={set.completed}
                  className={fieldCls}
                />
                <span
                  className="text-center text-[8px] font-medium tracking-widest uppercase"
                  style={{
                    color:
                      "color-mix(in srgb, var(--foreground) 28%, transparent)",
                  }}
                >
                  left
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <input
                  type="number"
                  inputMode="numeric"
                  value={set.rightReps}
                  onChange={(e) =>
                    onUpdate({ ...set, rightReps: e.target.value })
                  }
                  placeholder="–"
                  disabled={set.completed}
                  className={fieldCls}
                />
                <span
                  className="text-center text-[8px] font-medium tracking-widest uppercase"
                  style={{
                    color:
                      "color-mix(in srgb, var(--foreground) 28%, transparent)",
                  }}
                >
                  right
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-0.5">
              <input
                type="number"
                inputMode="numeric"
                value={set.reps}
                onChange={(e) => onUpdate({ ...set, reps: e.target.value })}
                placeholder="–"
                disabled={set.completed}
                className={fieldCls}
              />
              <span
                className="text-center text-[8px] font-medium tracking-widest uppercase"
                style={{
                  color:
                    "color-mix(in srgb, var(--foreground) 28%, transparent)",
                }}
              >
                reps
              </span>
            </div>
          )}
          {trackRpe && (
            <div className="flex flex-1 animate-in flex-col gap-0.5 duration-200 fade-in-0 slide-in-from-right-1">
              <input
                type="number"
                inputMode="decimal"
                value={set.rpe}
                onChange={(e) => onUpdate({ ...set, rpe: e.target.value })}
                placeholder="–"
                min="1"
                max="10"
                step="0.5"
                disabled={set.completed}
                className={fieldCls}
              />
              <span
                className="text-center text-[8px] font-medium tracking-widest uppercase"
                style={{
                  color:
                    "color-mix(in srgb, var(--foreground) 28%, transparent)",
                }}
              >
                rpe
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowRest(true)}
          className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl border border-border/40 bg-background/60 px-2.5 py-2.5 transition-all active:scale-95 active:bg-muted/60"
        >
          <Timer
            size={10}
            style={{
              color: "color-mix(in srgb, var(--foreground) 30%, transparent)",
            }}
          />
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{
              color: "color-mix(in srgb, var(--foreground) 55%, transparent)",
            }}
          >
            {formatRest(set.restSeconds)}
          </span>
        </button>
        {set.completed ? (
          <button
            onClick={toggleDone}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-90",
              completionPulse &&
                "animate-[set-complete_520ms_cubic-bezier(0.22,1,0.36,1)]"
            )}
            style={{
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              color: "#fff",
            }}
          >
            <Check size={14} weight="bold" />
          </button>
        ) : (
          <button
            onClick={toggleDone}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[2.5px] text-transparent transition-all active:scale-90 active:border-green-500 active:bg-green-500/15 active:text-green-500"
            style={{
              borderColor:
                "color-mix(in srgb, var(--foreground) 18%, transparent)",
            }}
          >
            <Check size={14} weight="bold" />
          </button>
        )}
        {canDelete && !set.completed && (
          <button
            onClick={onDelete}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors active:text-red-400"
            style={{
              color: "color-mix(in srgb, var(--foreground) 15%, transparent)",
            }}
          >
            <X size={11} weight="bold" />
          </button>
        )}
      </div>
      {showRest && (
        <RestTimerSheet
          current={set.restSeconds}
          onSelect={(s) => {
            onUpdate({ ...set, restSeconds: s })
            setShowRest(false)
          }}
          onClose={() => setShowRest(false)}
        />
      )}
    </>
  )
}

function ActiveExerciseCard({
  exercise,
  data,
  unit,
  onUpdate,
  onRemove,
  isDragging,
  showLineBefore,
  showLineAfter,
  showSupersetRing,
  inSuperset,
  collapsed,
  onToggleCollapse,
  dragHandlers,
  cardRef,
  onStartRest,
}: {
  exercise: Exercise
  data: ExerciseState
  unit: WeightUnit
  onUpdate: (d: ExerciseState) => void
  onRemove: () => void
  isDragging: boolean
  showLineBefore: boolean
  showLineAfter: boolean
  showSupersetRing: boolean
  inSuperset?: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  dragHandlers: React.HTMLAttributes<HTMLDivElement>
  cardRef: (el: HTMLDivElement | null) => void
  onStartRest: (seconds: number) => void
}) {
  function addSet() {
    onUpdate({ ...data, sets: [...data.sets, makeSet()] })
  }
  function updateSet(i: number, s: WorkoutSet) {
    const sets = [...data.sets]
    sets[i] = s
    onUpdate({ ...data, sets })
  }
  function removeSet(i: number) {
    onUpdate({ ...data, sets: data.sets.filter((_, j) => j !== i) })
  }
  const allDone = data.sets.length > 0 && data.sets.every((s) => s.completed)
  const doneSets = data.sets.filter((s) => s.completed).length
  const totalRest = data.sets.reduce((sum, set) => sum + set.restSeconds, 0)
  return (
    <div
      ref={cardRef}
      className={cn(
        "relative flex overflow-hidden transition-all duration-150",
        inSuperset ? "bg-card" : "rounded-2xl border bg-card",
        !inSuperset && (allDone ? "border-green-500/25" : "border-border/50"),
        isDragging && "scale-[0.97] opacity-20",
        showSupersetRing &&
          !inSuperset &&
          "ring-2 ring-offset-2 ring-offset-background"
      )}
      style={
        showSupersetRing && !inSuperset
          ? ({
              "--tw-ring-color": exercise.color + "90",
            } as React.CSSProperties)
          : undefined
      }
    >
      {showLineBefore && (
        <div className="pointer-events-none absolute -top-[5px] right-4 left-4 z-10 h-[2.5px] rounded-full bg-foreground/50" />
      )}
      {showLineAfter && (
        <div className="pointer-events-none absolute right-4 -bottom-[5px] left-4 z-10 h-[2.5px] rounded-full bg-foreground/50" />
      )}
      <div
        className="w-[5px] shrink-0 transition-all duration-500"
        style={{
          background: allDone
            ? "linear-gradient(180deg, #22c55e, #16a34a)"
            : exercise.color,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 py-3 pr-3 pl-3">
          <div
            {...dragHandlers}
            className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center transition-colors select-none active:cursor-grabbing"
            style={{
              color: "color-mix(in srgb, var(--foreground) 18%, transparent)",
            }}
          >
            <DotsSixVertical size={14} weight="bold" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] leading-tight font-semibold tracking-tight">
              {exercise.name}
            </p>
            <p
              className="mt-0.5 truncate text-[11px]"
              style={{
                color: "color-mix(in srgb, var(--foreground) 38%, transparent)",
              }}
            >
              {collapsed
                ? `${doneSets}/${data.sets.length} sets · ${formatRest(totalRest)} rest`
                : exercise.muscle}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-tight tabular-nums transition-all",
              allDone
                ? "bg-green-500/15 text-green-500"
                : "bg-foreground/[0.06] text-foreground/40"
            )}
          >
            {doneSets}/{data.sets.length}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-background/70 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-muted-foreground/65 uppercase transition-colors active:bg-muted/60">
                Track
                <span className="text-[9px] tracking-normal text-foreground/55">
                  {[data.trackRpe && "RPE", data.trackUnilateral && "UNI"]
                    .filter(Boolean)
                    .join(" · ") || "Off"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-[10px] font-semibold tracking-[0.15em] uppercase">
                ADVANCED TRACKING
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={data.trackRpe}
                onCheckedChange={(checked) =>
                  onUpdate({ ...data, trackRpe: checked === true })
                }
              >
                Track RPE
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={data.trackUnilateral}
                onCheckedChange={(checked) =>
                  onUpdate({ ...data, trackUnilateral: checked === true })
                }
              >
                Track unilateral reps
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={onRemove}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors active:text-red-400"
            style={{
              color: "color-mix(in srgb, var(--foreground) 18%, transparent)",
            }}
          >
            <X size={12} weight="bold" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors active:bg-muted/50"
            style={{
              color: "color-mix(in srgb, var(--foreground) 30%, transparent)",
            }}
          >
            {collapsed ? (
              <CaretDown size={12} weight="bold" />
            ) : (
              <CaretUp size={12} weight="bold" />
            )}
          </button>
        </div>
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
            collapsed
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              style={{
                borderTop:
                  "1px solid color-mix(in srgb, var(--foreground) 7%, transparent)",
              }}
            >
              {data.sets.map((s, i) => (
                <div
                  key={s.id}
                  style={
                    i > 0
                      ? {
                          borderTop:
                            "1px solid color-mix(in srgb, var(--foreground) 5%, transparent)",
                        }
                      : undefined
                  }
                >
                  <ActiveSetRow
                    set={s}
                    index={i}
                    trackRpe={data.trackRpe}
                    trackUnilateral={data.trackUnilateral}
                    unit={unit}
                    onUpdate={(updated) => updateSet(i, updated)}
                    onDelete={() => removeSet(i)}
                    canDelete={data.sets.length > 1}
                    onComplete={onStartRest}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={addSet}
              className="flex w-full items-center justify-center gap-2 py-3 transition-colors active:bg-foreground/[0.04]"
              style={{
                borderTop:
                  "1px solid color-mix(in srgb, var(--foreground) 6%, transparent)",
              }}
            >
              <Plus
                size={10}
                weight="bold"
                style={{
                  color:
                    "color-mix(in srgb, var(--foreground) 28%, transparent)",
                }}
              />
              <span
                className="text-[10px] font-semibold tracking-[0.18em] uppercase"
                style={{
                  color:
                    "color-mix(in srgb, var(--foreground) 28%, transparent)",
                }}
              >
                Add set
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddExerciseSheet({
  addedIds,
  onAdd,
  onClose,
}: {
  addedIds: string[]
  onAdd: (ex: Exercise) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [activeFilters, setActiveFilters] = useState<Set<Category>>(new Set())
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle")
  const [remoteExercises, setRemoteExercises] = useState<Exercise[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])
  function toggleFilter(cat: Category) {
    setActiveFilters((s) => {
      const next = new Set(s)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }
  useEffect(() => {
    const q = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    searchSeqRef.current += 1
    const delay = q.length === 0 ? 0 : 280
    debounceRef.current = setTimeout(async () => {
      const requestSeq = ++searchSeqRef.current
      setSearchState("loading")
      try {
        const results = await convexClient.action(api.data.exercises.search, {
          query: q,
          categories: activeFilters.size > 0 ? [...activeFilters] : undefined,
          limit: 25,
        })
        if (requestSeq !== searchSeqRef.current) return
        setRemoteExercises(results as Exercise[])
        setSearchState("done")
      } catch {
        if (requestSeq !== searchSeqRef.current) return
        setRemoteExercises([])
        setSearchState("error")
      }
    }, delay)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [activeFilters, query])
  const filtered = remoteExercises
  const FILTERS: { cat: Category; label: string }[] = [
    { cat: "strength", label: "Strength" },
    { cat: "cardio", label: "Cardio" },
    { cat: "mobility", label: "Mobility" },
    { cat: "core", label: "Core" },
  ]
  return (
    <div
      className="sheet-overlay fixed inset-0 z-40 md:flex md:justify-center md:bg-black/40 md:backdrop-blur-sm"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      onClick={onClose}
    >
      <div
        className="sheet-panel flex h-full w-full flex-col bg-background md:mt-12 md:h-auto md:max-h-[76vh] md:max-w-lg md:self-start md:overflow-hidden md:rounded-2xl md:border md:border-border/60 md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="relative flex-1">
            <MagnifyingGlass
              size={15}
              className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground/40"
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises…"
              className="h-11 w-full rounded-xl border border-border/60 bg-muted/40 pr-4 pl-10 text-[14px] transition-all outline-none placeholder:text-muted-foreground/35 focus:border-foreground/20 focus:bg-background"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground/40 active:text-foreground"
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-[13px] font-semibold text-muted-foreground transition-colors active:text-foreground"
          >
            Done
          </button>
        </div>
        <div
          className="flex overflow-x-auto border-b border-border/40 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {FILTERS.map(({ cat, label }) => {
            const active = activeFilters.has(cat)
            const Icon = CATEGORY_ICON[cat]
            return (
              <button
                key={cat}
                onClick={() => toggleFilter(cat)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 px-4 py-3 text-[12px] font-semibold transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground/50 active:text-foreground/70"
                )}
              >
                <Icon
                  size={11}
                  weight={active ? "fill" : "regular"}
                  style={active ? { color: CATEGORY_COLOR[cat] } : undefined}
                />
                {label}
                {active && (
                  <span
                    className="absolute right-0 bottom-0 left-0 h-[2px] rounded-t-full"
                    style={{ backgroundColor: CATEGORY_COLOR[cat] }}
                  />
                )}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto">
          {searchState === "loading" ? (
            <div className="flex flex-col items-center gap-2 py-20">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground/70" />
              <p className="text-[13px] font-semibold text-muted-foreground">
                Searching exercises…
              </p>
            </div>
          ) : filtered.length > 0 ? (
            <div className="flex flex-col divide-y divide-border/30">
              {filtered.map((ex) => {
                const already = addedIds.includes(ex.id)
                return (
                  <div
                    key={ex.id}
                    className={cn(
                      "flex items-stretch",
                      already && "opacity-50"
                    )}
                  >
                    <div
                      className="w-[3px] shrink-0 rounded-l-sm"
                      style={{ backgroundColor: ex.color }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col justify-center py-3.5 pr-2 pl-4 text-left">
                      <p className="truncate text-[14px] leading-snug font-semibold">
                        {ex.name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground/55">
                        {ex.muscle}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (!already) {
                          onAdd(ex)
                          onClose()
                        }
                      }}
                      disabled={already}
                      className="flex items-center pr-4 pl-2 text-muted-foreground/40 transition-colors active:text-foreground disabled:pointer-events-none"
                    >
                      {already ? (
                        <Check
                          size={14}
                          weight="bold"
                          className="text-green-500/60"
                        />
                      ) : (
                        <Plus size={16} weight="bold" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : searchState === "done" ? (
            <div className="flex flex-col items-center gap-2 py-20">
              <p className="text-[13px] font-semibold text-muted-foreground">
                No exercises found
              </p>
              <p className="text-[11px] text-muted-foreground/50">
                Try a different search or filter
              </p>
            </div>
          ) : searchState === "error" ? (
            <div className="flex flex-col items-center gap-2 py-20">
              <p className="text-[13px] font-semibold text-muted-foreground">
                Search failed
              </p>
              <p className="text-[11px] text-muted-foreground/50">
                Check your connection and try again
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function FinishSheet({
  elapsed,
  totalSets,
  doneSets,
  onFinish,
  onCancel,
}: {
  elapsed: number
  totalSets: number
  doneSets: number
  onFinish: () => void
  onCancel: () => void
}) {
  const allDone = doneSets >= totalSets
  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={onCancel}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="h-1 w-full transition-colors duration-500"
          style={{
            background: allDone
              ? "linear-gradient(90deg, #22c55e, #16a34a)"
              : "transparent",
          }}
        />
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-10 rounded-full bg-foreground/[0.10]" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-[20px] font-black tracking-tight">
            {allDone ? "Workout complete 🎉" : "Finish early?"}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
            {!allDone &&
              `${totalSets - doneSets} set${totalSets - doneSets > 1 ? "s" : ""} still incomplete. `}
            Total time:{" "}
            <span className="font-black text-foreground tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          </p>
          <div className="mt-4 flex gap-3">
            {[
              { label: "Sets done", value: `${doneSets}/${totalSets}` },
              { label: "Duration", value: formatElapsed(elapsed) },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-1 flex-col gap-0.5 rounded-xl bg-foreground/[0.04] px-3 py-2.5"
              >
                <span className="text-[9px] font-black tracking-[0.18em] text-muted-foreground/50 uppercase">
                  {label}
                </span>
                <span className="text-[18px] font-black tracking-tight tabular-nums">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            onClick={onFinish}
            className="h-[52px] w-full rounded-2xl text-[15px] font-black tracking-tight text-white transition-opacity active:opacity-80"
            style={{
              background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
            }}
          >
            Finish workout
          </button>
          <button
            onClick={onCancel}
            className="h-[52px] w-full rounded-2xl text-[14px] font-semibold text-muted-foreground transition-colors active:text-foreground"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
}

function AbortSheet({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={onCancel}
    >
      <div
        className="sheet-panel w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-0">
          <div className="h-1 w-10 rounded-full bg-foreground/[0.10]" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-[20px] font-black tracking-tight">
            Abort workout?
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground/70">
            Your progress won't be saved.
          </p>
        </div>
        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            onClick={onConfirm}
            className="h-[52px] w-full rounded-2xl bg-destructive text-[15px] font-black tracking-tight text-white transition-opacity active:opacity-80"
          >
            Abort workout
          </button>
          <button
            onClick={onCancel}
            className="h-[52px] w-full rounded-2xl text-[14px] font-semibold text-muted-foreground transition-colors active:text-foreground"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  )
}

function renderSupersetItem(
  item: Extract<WorkoutItem, { kind: "superset" }>,
  exData: Record<string, ExerciseState>,
  unit: WeightUnit,
  updateExData: (id: string, d: ExerciseState) => void,
  removeExercise: (id: string) => void,
  drag: DragInfo | null,
  dropTarget: DropTarget,
  collapsed: Record<string, boolean>,
  toggleCollapsed: (id: string) => void,
  makeDragHandlers: (id: string) => any,
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  onStartRest: (s: number) => void,
  cardProps: (id: string, inS: boolean) => any,
  exerciseLookup: Record<string, Exercise>
) {
  const dt = dropTarget
  const containerIsTarget = dt && item.exerciseIds.includes(dt.targetExId)
  const showLineBefore = !!(containerIsTarget && dt?.type === "before")
  const showLineAfter = !!(containerIsTarget && dt?.type === "after")
  const allDone = item.exerciseIds.every((id) =>
    exData[id]?.sets.every((s) => s.completed)
  )
  return (
    <div
      key={item.id}
      className="relative overflow-hidden rounded-2xl transition-colors"
      style={{
        background: `color-mix(in srgb, ${item.color} 5%, var(--card))`,
        border: allDone
          ? "1.5px solid rgba(34,197,94,0.30)"
          : `1.5px solid color-mix(in srgb, ${item.color} 30%, transparent)`,
      }}
    >
      {showLineBefore && (
        <div className="pointer-events-none absolute -top-[5px] right-4 left-4 z-10 h-[2.5px] rounded-full bg-foreground/50" />
      )}
      {showLineAfter && (
        <div className="pointer-events-none absolute right-4 -bottom-[5px] left-4 z-10 h-[2.5px] rounded-full bg-foreground/50" />
      )}
      <div
        className="absolute inset-y-0 left-0 w-[5px]"
        style={{
          background: allDone
            ? "linear-gradient(180deg,#22c55e,#16a34a)"
            : item.color,
          opacity: 0.85,
        }}
      />
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          paddingLeft: "calc(1rem + 5px)",
          background: `color-mix(in srgb, ${item.color} 10%, transparent)`,
          borderBottom: `1px solid color-mix(in srgb, ${item.color} 18%, transparent)`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span
            className="text-[11px] font-semibold tracking-wide"
            style={{ color: item.color }}
          >
            Superset
          </span>
          <span
            className="rounded-full px-2 py-px text-[10px] font-medium"
            style={{
              background: `color-mix(in srgb, ${item.color} 18%, transparent)`,
              color: item.color,
            }}
          >
            {item.exerciseIds.length} exercises
          </span>
        </div>
      </div>
      <div className="flex flex-col">
        {item.exerciseIds.map((exId, idx) => {
          const ex = exerciseLookup[exId]
          if (!ex || !exData[exId]) return null
          return (
            <React.Fragment key={exId}>
              {idx > 0 && (
                <div
                  className="mx-auto h-3 w-[2px] rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${item.color} 45%, transparent)`,
                  }}
                />
              )}
              <ActiveExerciseCard
                exercise={ex}
                data={exData[exId]}
                unit={unit}
                onUpdate={(d) => updateExData(exId, d)}
                onRemove={() => removeExercise(exId)}
                isDragging={drag?.exerciseId === exId && drag.active}
                {...cardProps(exId, true)}
                inSuperset
                collapsed={Boolean(collapsed[exId])}
                onToggleCollapse={() => toggleCollapsed(exId)}
                dragHandlers={makeDragHandlers(exId)}
                cardRef={(el) => {
                  if (el) cardRefs.current.set(exId, el)
                  else cardRefs.current.delete(exId)
                }}
                onStartRest={onStartRest}
              />
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

export default function ActiveWorkout() {
  const { presetId } = useParams<{ presetId?: string }>()
  const navigate = useNavigate()
  const posthog = usePostHog()
  const [searchParams] = useSearchParams()
  const slot = (Number(searchParams.get("slot") ?? "1") || 1) as 1 | 2

  const presets = useQuery(api.logs.presets.list, {})
  const logCompletion = useMutation(api.logs.workouts.completion)
  const resolveIds = useAction(api.data.exercises.resolveIds)

  const [items, setItems] = useState<WorkoutItem[]>([])
  const [exData, setExData] = useState<Record<string, ExerciseState>>({})
  const [exerciseLookup, setExerciseLookup] = useState<Record<string, Exercise>>({})
  const preferences = useQuery(api.users.users.getPreferences)
  const [unit, setUnit] = useState<WeightUnit>("kg")
  const [confirmAbort, setConfirmAbort] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const elapsed = useElapsedTimer()
  const rest = useRestCountdown()

  const allExIds = items.flatMap((i) =>
    i.kind === "solo" ? [i.exerciseId] : i.exerciseIds
  )
  const uniqueExerciseIds = [...new Set(allExIds)]
  const { total: totalSets, done: doneSets } = countSets(items, exData)
  const progressPct =
    totalSets > 0 ? `${Math.round((doneSets / totalSets) * 100)}%` : "0%"

  useEffect(() => {
    if (presetId && presets) {
      const match = presets.find((p) => (p.id ?? p._id) === presetId)
      if (match) {
        const loadedItems = (match.items as WorkoutItem[]) ?? []
        setItems(loadedItems)
        setExData(
          Object.fromEntries(
            Object.entries(
              (match.exerciseData as Record<string, ExerciseState>) ?? {}
            ).map(([exerciseId, state]) => [
              exerciseId,
              normalizeExerciseState(state),
            ])
          )
        )
        const ids = loadedItems.flatMap((i) =>
          i.kind === "solo" ? [i.exerciseId] : i.exerciseIds
        )
        if (ids.length > 0) {
          void resolveIds({ ids }).then((lookup) => {
            setExerciseLookup((prev) => ({ ...prev, ...(lookup as Record<string, Exercise>) }))
          })
        }
      }
    }
  }, [presetId, presets])

  useEffect(() => {
    if (preferences?.weightUnit) {
      setUnit(preferences.weightUnit as WeightUnit)
    }
  }, [preferences])

  useEffect(() => {
    posthog.capture("workout_started", { preset_id: presetId ?? null })
  }, [presetId, posthog])

  function addExercise(ex: Exercise) {
    const id = ex.id
    setExerciseLookup((prev) => ({ ...prev, [id]: ex }))
    setItems((prev) => [...prev, { kind: "solo", exerciseId: id }])
    setExData((prev) => ({
      ...prev,
      [id]: {
        sets: [makeSet(), makeSet(), makeSet()],
        trackRpe: false,
        trackUnilateral: false,
      },
    }))
  }
  function removeExercise(id: string) {
    setItems((prev) => removeExFromItems(prev, id))
    setExData((prev) => {
      const n = { ...prev }
      delete n[id]
      return n
    })
  }
  function updateExData(id: string, data: ExerciseState) {
    setExData((prev) => ({ ...prev, [id]: data }))
  }
  function toggleCollapsed(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }
  function calcDropTarget(x: number, y: number, draggedId: string): DropTarget {
    for (const [exId, el] of cardRefs.current) {
      if (exId === draggedId) continue
      const rect = el.getBoundingClientRect()
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
        continue
      const relY = (y - rect.top) / rect.height
      if (collapsed[exId]) {
        return relY < 0.5
          ? { type: "before", targetExId: exId }
          : { type: "after", targetExId: exId }
      }
      if (relY < 0.25) return { type: "before", targetExId: exId }
      if (relY > 0.75) return { type: "after", targetExId: exId }
      return { type: "superset", targetExId: exId }
    }
    return null
  }
  useEffect(() => {
    if (!drag) return
    const currentDrag = drag
    function handlePointerMove(event: PointerEvent) {
      setDrag((prev) => {
        if (!prev) return prev
        const moved =
          prev.active ||
          Math.hypot(event.clientX - prev.startX, event.clientY - prev.startY) >
            6
        return {
          ...prev,
          x: event.clientX,
          y: event.clientY,
          active: moved,
        }
      })
      const movedX = event.clientX
      const movedY = event.clientY
      setDropTarget(calcDropTarget(movedX, movedY, currentDrag.exerciseId))
    }
    function handlePointerEnd() {
      if (currentDrag.active && dropTarget) {
        executeDrop(currentDrag.exerciseId, dropTarget)
      }
      setDrag(null)
      setDropTarget(null)
    }
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerEnd)
    window.addEventListener("pointercancel", handlePointerEnd)
    document.body.style.userSelect = "none"
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerEnd)
      window.removeEventListener("pointercancel", handlePointerEnd)
      document.body.style.userSelect = ""
    }
  }, [drag, dropTarget])

  function makeDragHandlers(
    exerciseId: string
  ): React.HTMLAttributes<HTMLDivElement> {
    return {
      onPointerDown(event) {
        event.preventDefault()
        event.stopPropagation()
        setDrag({
          exerciseId,
          x: event.clientX,
          y: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
        })
      },
    }
  }

  function executeDrop(draggedId: string, zone: DropTarget) {
    if (!zone) {
      setItems((prev) => {
        const inSuperset = prev.some(
          (i) => i.kind === "superset" && i.exerciseIds.includes(draggedId)
        )
        if (!inSuperset) return prev
        return [
          ...removeExFromItems(prev, draggedId),
          { kind: "solo", exerciseId: draggedId },
        ]
      })
      return
    }
    if (zone.type === "superset") {
      setItems((prev) => {
        const newItems = removeExFromItems(prev, draggedId)
        const tIdx = newItems.findIndex(
          (i) =>
            (i.kind === "solo" && i.exerciseId === zone.targetExId) ||
            (i.kind === "superset" && i.exerciseIds.includes(zone.targetExId))
        )
        if (tIdx === -1) return prev
        const t = newItems[tIdx]
        const updated = [...newItems]
        if (t.kind === "solo") {
          const usedColors = newItems
            .filter(
              (i): i is Extract<WorkoutItem, { kind: "superset" }> =>
                i.kind === "superset"
            )
            .map((i) => i.color)
          const color =
            SUPERSET_PALETTE.find((c) => !usedColors.includes(c)) ??
            SUPERSET_PALETTE[0]
          updated[tIdx] = {
            kind: "superset",
            id: uid(),
            color,
            exerciseIds: [t.exerciseId, draggedId],
          }
        } else {
          updated[tIdx] = { ...t, exerciseIds: [...t.exerciseIds, draggedId] }
        }
        return updated
      })
    } else {
      setItems((prev) => {
        const newItems = removeExFromItems(prev, draggedId)
        const tIdx = newItems.findIndex(
          (i) =>
            (i.kind === "solo" && i.exerciseId === zone.targetExId) ||
            (i.kind === "superset" && i.exerciseIds.includes(zone.targetExId))
        )
        if (tIdx === -1) return prev
        const insertAt = zone.type === "before" ? tIdx : tIdx + 1
        return [
          ...newItems.slice(0, insertAt),
          { kind: "solo", exerciseId: draggedId },
          ...newItems.slice(insertAt),
        ]
      })
    }
  }

  async function handleFinish() {
    const date = todayIso()
    const exercises = items.flatMap((item) => {
      const ids = item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
      return ids.flatMap((id) => {
        const ex = exerciseLookup[id]
        const data = exData[id]
        if (!ex || !data) return []
        return [
          {
            id,
            name: ex.name,
            sets: data.sets
              .filter((s) => s.completed)
              .map((s) => ({
                type: "normal",
                weight: parseFloat(String(s.weight)) || 0,
                reps: parseFloat(String(s.reps)) || 0,
                completed: s.completed,
              })),
          },
        ]
      })
    })
    try {
      await logCompletion({ date, exercises, durationSeconds: elapsed })
      posthog.capture("workout_completed", {
        preset_id: presetId ?? null,
        duration_seconds: elapsed,
        exercise_count: exercises.length,
        total_sets: exercises.reduce(
          (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
          0
        ),
      })
      navigate(-1)
    } catch (err) {
      console.error("Failed to log workout:", err)
    }
  }

  function cardProps(exId: string, inSuperset = false) {
    const dt = dropTarget
    const isTarget = dt?.targetExId === exId
    if (inSuperset)
      return {
        showLineBefore: false,
        showLineAfter: false,
        showSupersetRing: isTarget && dt?.type === "superset",
      }
    return {
      showLineBefore: isTarget && dt?.type === "before",
      showLineAfter: isTarget && dt?.type === "after",
      showSupersetRing: isTarget && dt?.type === "superset",
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="page-enter mx-auto flex max-w-lg flex-col pb-40">
        <div
          className="flex items-center gap-3 px-4"
          style={{
            paddingTop: "max(3.5rem, env(safe-area-inset-top, 3.5rem))",
            paddingBottom: "0.75rem",
          }}
        >
          <button
            onClick={() => setConfirmAbort(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-colors active:bg-foreground/[0.06]"
            style={{
              color: "color-mix(in srgb, var(--foreground) 45%, transparent)",
            }}
          >
            <X size={13} weight="bold" />
            Abort
          </button>
          <div className="flex flex-1 flex-col items-center">
            <span
              className="leading-none font-black tracking-tight tabular-nums"
              style={{
                fontSize: "1.75rem",
                letterSpacing: "-0.05em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatElapsed(elapsed)}
            </span>
            <span
              className="mt-0.5 text-[9px] font-medium tracking-[0.18em] uppercase"
              style={{
                color: "color-mix(in srgb, var(--foreground) 35%, transparent)",
              }}
            >
              elapsed
            </span>
          </div>
          <button
            onClick={() => setConfirmFinish(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-foreground px-4 text-[13px] font-bold text-background transition-opacity active:opacity-85"
          >
            Finish
            <Check size={14} weight="bold" />
          </button>
        </div>
        <div className="relative mt-2 h-[2px] w-full bg-foreground/[0.06]">
          <div
            className="h-full bg-foreground/40 transition-all duration-500 ease-out"
            style={{ width: progressPct }}
          />
        </div>
        <div className="flex flex-col gap-4 px-4 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-[0.18em] text-muted-foreground/45 uppercase">
                Active Workout
              </span>
              {slot === 2 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary uppercase">
                  Slot 2
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <div className="ml-auto flex items-center gap-0 rounded-lg border border-border/60 bg-muted/40 p-0.5 text-[10px] font-bold">
                {(["kg", "lbs"] as WeightUnit[]).map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnit(u)}
                    className={cn(
                      "rounded-md px-2.5 py-1 transition-all duration-150",
                      unit === u
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground/60 active:text-foreground"
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              if (item.kind === "solo") {
                const ex = exerciseLookup[item.exerciseId]
                if (!ex) return null
                return (
                  <ActiveExerciseCard
                    key={item.exerciseId}
                    exercise={ex}
                    data={exData[item.exerciseId]}
                    unit={unit}
                    onUpdate={(d) => updateExData(item.exerciseId, d)}
                    onRemove={() => removeExercise(item.exerciseId)}
                    isDragging={drag?.exerciseId === item.exerciseId && drag.active}
                    {...cardProps(item.exerciseId)}
                    collapsed={Boolean(collapsed[item.exerciseId])}
                    onToggleCollapse={() => toggleCollapsed(item.exerciseId)}
                    dragHandlers={makeDragHandlers(item.exerciseId)}
                    cardRef={(el) => {
                      if (el) cardRefs.current.set(item.exerciseId, el)
                      else cardRefs.current.delete(item.exerciseId)
                    }}
                    onStartRest={rest.start}
                  />
                )
              }
              return renderSupersetItem(
                item,
                exData,
                unit,
                updateExData,
                removeExercise,
                drag,
                dropTarget,
                collapsed,
                toggleCollapsed,
                makeDragHandlers,
                cardRefs,
                rest.start,
                cardProps,
                exerciseLookup
              )
            })}
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 text-[13px] font-medium text-muted-foreground/50 transition-colors active:bg-muted/20 active:text-foreground"
          >
            <Plus size={14} weight="bold" />
            Add exercise
          </button>
        </div>
      </div>
      {rest.remaining !== null && (
        <RestCountdownBanner
          remaining={rest.remaining}
          onDismiss={rest.dismiss}
        />
      )}
      {searchOpen && (
        <AddExerciseSheet
          addedIds={uniqueExerciseIds}
          onAdd={addExercise}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {confirmFinish && (
        <FinishSheet
          elapsed={elapsed}
          totalSets={totalSets}
          doneSets={doneSets}
          onFinish={handleFinish}
          onCancel={() => setConfirmFinish(false)}
        />
      )}
      {confirmAbort && (
        <AbortSheet
          onConfirm={() => navigate(-1)}
          onCancel={() => setConfirmAbort(false)}
        />
      )}
    </div>
  )
}