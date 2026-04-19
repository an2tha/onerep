import React, { useMemo, useState } from "react"
import {
  CaretLeft,
  CaretRight,
  Drop,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react"
import { BottomBar } from "@/components/bottom-bar"
import { MobileSheet } from "@/components/mobile-sheet"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { currentDateKey, offsetDateKey } from "@/lib/food-log"

// ─── Types ────────────────────────────────────────────────────────────────────

type WaterLogEntry = {
  id: string
  amountMl: number
  loggedAt: string // ISO datetime
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_AMOUNTS = [
  { label: "150 ml", ml: 150 },
  { label: "250 ml", ml: 250 },
  { label: "500 ml", ml: 500 },
  { label: "750 ml", ml: 750 },
  { label: "1 L",    ml: 1000 },
]

const WATER_COLOR = "#38bdf8"
const WATER_BG    = "rgba(56,189,248,0.13)"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMl(ml: number): string {
  if (ml >= 1000) {
    const l = ml / 1000
    return l % 1 === 0 ? `${l} L` : `${l.toFixed(1)} L`
  }
  return `${ml} ml`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDateLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today"
  const yesterday = offsetDateKey(todayKey, -1)
  if (dateKey === yesterday) return "Yesterday"
  const d = new Date(`${dateKey}T12:00:00Z`)
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
}

// ─── Swipe-to-delete row ──────────────────────────────────────────────────────

function SwipeRow({
  entry,
  onDelete,
}: {
  entry: WaterLogEntry
  onDelete: () => void
}) {
  const [tx, setTx] = React.useState(0)
  const startX = React.useRef(0)
  const dragging = React.useRef(false)
  const THRESHOLD = 72

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX
    dragging.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    setTx(Math.min(0, e.clientX - startX.current))
  }

  function onPointerUp() {
    dragging.current = false
    setTx(tx < -THRESHOLD ? -THRESHOLD : 0)
  }

  const revealed = tx <= -THRESHOLD

  return (
    <div className="relative overflow-hidden">
      <div
        className="absolute inset-y-0 right-0 flex w-16 items-center justify-center bg-destructive/90"
        style={{ borderRadius: "0 8px 8px 0" }}
      >
        <Trash size={14} weight="fill" className="text-white" />
      </div>
      <div
        className="relative flex touch-pan-y items-center gap-2 bg-background py-[5px] transition-transform duration-150 ease-out"
        style={{ transform: `translateX(${tx}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: WATER_BG }}
        >
          <Drop size={9} weight="fill" style={{ color: WATER_COLOR }} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/80">
          {fmtMl(entry.amountMl)}
        </p>
        <span className="shrink-0 text-[11px] text-muted-foreground/40 tabular-nums">
          {fmtTime(entry.loggedAt)}
        </span>
        {revealed && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
            className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive transition-colors active:bg-destructive/30"
          >
            <X size={9} weight="bold" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Progress card ────────────────────────────────────────────────────────────

function ProgressCard({
  totalMl,
  goalMl,
  onEditGoal,
}: {
  totalMl: number
  goalMl: number
  onEditGoal: () => void
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80)
    return () => clearTimeout(t)
  }, [])

  const pct = goalMl > 0 ? Math.min(100, (totalMl / goalMl) * 100) : 0
  const over = totalMl > goalMl
  const remaining = Math.max(0, goalMl - totalMl)

  return (
    <div className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border/30">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
          Today
        </p>
        <button
          onClick={onEditGoal}
          className="flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground/40 active:text-muted-foreground/70"
        >
          <PencilSimple size={10} />
          Goal
        </button>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <span
            className="text-[2.2rem] leading-none font-bold tabular-nums"
            style={{ color: over ? "#38bdf8" : undefined }}
          >
            {fmtMl(totalMl)}
          </span>
          {totalMl === 0 && (
            <p className="mt-1 text-[11.5px] text-muted-foreground/40">
              Nothing logged yet — tap + to add
            </p>
          )}
          {totalMl > 0 && remaining > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground/40 tabular-nums">
              {fmtMl(remaining)} left of {fmtMl(goalMl)} goal
            </p>
          )}
          {over && (
            <p className="mt-0.5 text-[11px] tabular-nums" style={{ color: WATER_COLOR, opacity: 0.7 }}>
              Goal reached!
            </p>
          )}
        </div>
        <div className="text-right">
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: WATER_COLOR }}>
            {Math.round(pct)}%
          </span>
          <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wide">of goal</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-muted/40">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: mounted ? `${pct}%` : "0%",
            backgroundColor: WATER_COLOR,
            opacity: over ? 1 : 0.75,
          }}
        />
      </div>
    </div>
  )
}

// ─── Entry list card ──────────────────────────────────────────────────────────

function EntryList({
  entries,
  onDelete,
}: {
  entries: WaterLogEntry[]
  onDelete: (id: string) => void
}) {
  const sorted = [...entries].sort((a, b) =>
    b.loggedAt.localeCompare(a.loggedAt)
  )

  if (sorted.length === 0) return null

  return (
    <div className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border/30">
      <p className="mb-2.5 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
        Entries
      </p>
      <div className="flex flex-col divide-y divide-border/20">
        {sorted.map((entry) => (
          <SwipeRow
            key={entry.id}
            entry={entry}
            onDelete={() => onDelete(entry.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Goal edit sheet ──────────────────────────────────────────────────────────

function GoalSheet({
  goalMl,
  onSave,
  onClose,
}: {
  goalMl: number
  onSave: (ml: number) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(goalMl)

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/40 backdrop-blur-[4px]"
      panelClassName="mx-auto w-full max-w-sm rounded-t-[28px] bg-card shadow-[0_-20px_60px_rgba(0,0,0,0.2)]"
      panelStyle={{
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
      }}
    >
      <div className="px-4 pt-1 pb-2">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[15px] font-semibold">Daily goal</p>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/50 active:opacity-60"
          >
            <X size={12} weight="bold" />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-[13px] font-medium">Water</span>
            <span className="text-[10px] text-muted-foreground/40">ml</span>
          </div>
          <div className="flex items-center rounded-lg bg-muted/50 p-0.5">
            <button
              onClick={() => setDraft((v) => Math.max(250, v - 250))}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 active:bg-background active:text-foreground"
            >
              <span className="text-[15px] leading-none">−</span>
            </button>
            <input
              type="number"
              value={draft}
              onChange={(e) => {
                const n = parseInt(e.target.value)
                if (!isNaN(n)) setDraft(Math.max(250, n))
              }}
              className="w-16 bg-transparent text-center text-[13px] font-semibold tabular-nums outline-none"
            />
            <button
              onClick={() => setDraft((v) => v + 250)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 active:bg-background active:text-foreground"
            >
              <span className="text-[15px] leading-none">+</span>
            </button>
          </div>
        </div>

        <button
          onClick={() => { onSave(draft); onClose() }}
          className="mt-4 w-full rounded-xl bg-foreground py-3 text-[13px] font-semibold text-background active:opacity-75"
        >
          Save
        </button>
      </div>
    </MobileSheet>
  )
}

// ─── Custom amount sheet ──────────────────────────────────────────────────────

function AddSheet({
  onAdd,
  onClose,
}: {
  onAdd: (ml: number) => void
  onClose: () => void
}) {
  const [custom, setCustom] = useState("")

  function submit(ml: number) {
    if (ml > 0) {
      onAdd(ml)
      onClose()
    }
  }

  return (
    <MobileSheet
      onClose={onClose}
      overlayClassName="bg-black/40 backdrop-blur-[4px]"
      panelClassName="mx-auto w-full max-w-sm rounded-t-[28px] bg-card shadow-[0_-20px_60px_rgba(0,0,0,0.2)]"
      panelStyle={{
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
      }}
    >
      <div className="px-4 pt-1 pb-2">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[15px] font-semibold">Log water</p>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/50 active:opacity-60"
          >
            <X size={12} weight="bold" />
          </button>
        </div>

        {/* Quick amounts */}
        <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
          Quick add
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map(({ label, ml }) => (
            <button
              key={ml}
              onClick={() => submit(ml)}
              className="rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition-all active:scale-95"
              style={{ backgroundColor: WATER_BG, color: WATER_COLOR }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
          Custom
        </p>
        <div className="flex gap-2">
          <div className="flex flex-1 items-center rounded-xl bg-muted/50 px-3 py-2">
            <input
              type="number"
              inputMode="numeric"
              placeholder="Amount in ml"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = parseInt(custom)
                  if (!isNaN(n)) submit(n)
                }
              }}
              className="flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-muted-foreground/30"
            />
            <span className="ml-1 text-[11px] text-muted-foreground/35">ml</span>
          </div>
          <button
            onClick={() => {
              const n = parseInt(custom)
              if (!isNaN(n)) submit(n)
            }}
            className="flex items-center justify-center rounded-xl bg-foreground px-4 text-background active:opacity-75"
          >
            <Plus size={15} weight="bold" />
          </button>
        </div>
      </div>
    </MobileSheet>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Water() {
  const preferences = useQuery(api.users.users.getPreferences, {})
  const activeTimezone = preferences?.lastActiveTimezone ?? "UTC"
  const todayKey = currentDateKey(activeTimezone)

  const [dateKey, setDateKey] = useState(todayKey)
  const [addOpen, setAddOpen] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)

  const rawEntries = useQuery(api.logs.water.getDay, { date: dateKey })
  const setDay = useMutation(api.logs.water.setDay)
  const addEntryMutation = useMutation(api.logs.water.addEntry)
  const setWaterGoal = useMutation(api.users.users.setWaterGoal)

  // Optimistic local entries — immediately reflects taps, gets replaced by
  // server data once Convex round-trips back.
  const [optimisticEntries, setOptimisticEntries] = useState<WaterLogEntry[]>([])
  const syncedDateKey = React.useRef<string | null>(null)

  // When server data arrives for the current dateKey, drop our optimistic layer.
  React.useEffect(() => {
    if (rawEntries !== undefined) {
      setOptimisticEntries([])
      syncedDateKey.current = dateKey
    }
  }, [rawEntries, dateKey])

  // Reset optimistic state when navigating to a different day.
  React.useEffect(() => {
    setOptimisticEntries([])
  }, [dateKey])

  const serverEntries: WaterLogEntry[] = (rawEntries ?? []) as WaterLogEntry[]
  // Merge: server entries are ground truth; optimistic ones are appended on top
  // (they'll disappear once server round-trips and replaces rawEntries).
  const entries = useMemo(() => {
    const serverIds = new Set(serverEntries.map((e) => e.id))
    const pending = optimisticEntries.filter((e) => !serverIds.has(e.id))
    return [...serverEntries, ...pending]
  }, [serverEntries, optimisticEntries])

  const totalMl = useMemo(
    () => entries.reduce((s, e) => s + e.amountMl, 0),
    [entries]
  )

  const goalMl = preferences?.waterGoalMl ?? 2500
  const dateLabel = formatDateLabel(dateKey, todayKey)
  const isToday = dateKey === todayKey

  function addEntry(amountMl: number) {
    const entry: WaterLogEntry = {
      id: crypto.randomUUID(),
      amountMl,
      loggedAt: new Date().toISOString(),
    }
    // Update UI instantly
    setOptimisticEntries((prev) => [...prev, entry])
    // Sync to server in background
    void addEntryMutation({ date: dateKey, entry })
  }

  function saveGoal(ml: number) {
    void setWaterGoal({ goalMl: ml })
  }

  function deleteEntry(id: string) {
    // Optimistically remove from local state too
    setOptimisticEntries((prev) => prev.filter((e) => e.id !== id))
    void setDay({
      date: dateKey,
      entries: entries.filter((e) => e.id !== id),
    })
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="page-enter mx-auto flex max-w-lg flex-col pb-24">
        {/* Header */}
        <header className="flex items-end justify-between px-5 pt-14 pb-4">
          <div>
            <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground/50 uppercase">
              Hydration
            </p>
            <h1 className="mt-1 text-[1.9rem] leading-[1.15] font-semibold tracking-tight">
              Water.
            </h1>
          </div>

          {/* Date navigation */}
          <div className="flex items-center gap-1 pb-0.5">
            <button
              onClick={() => setDateKey((d) => offsetDateKey(d, -1))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/50 active:bg-foreground/[0.07] active:text-foreground"
            >
              <CaretLeft size={13} weight="bold" />
            </button>
            <span className="min-w-[56px] text-center text-[11px] font-medium text-muted-foreground/60">
              {dateLabel}
            </span>
            <button
              onClick={() => setDateKey((d) => offsetDateKey(d, 1))}
              disabled={isToday}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/50 active:bg-foreground/[0.07] active:text-foreground disabled:opacity-20"
            >
              <CaretRight size={13} weight="bold" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex flex-col gap-3 px-4">
          <ProgressCard
            totalMl={totalMl}
            goalMl={goalMl}
            onEditGoal={() => setGoalOpen(true)}
          />

          {/* Quick-add row */}
          <div className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-border/30">
            <p className="mb-2.5 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
              Quick add
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map(({ label, ml }) => (
                <button
                  key={ml}
                  onClick={() => addEntry(ml)}
                  className="rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition-all active:scale-95"
                  style={{ backgroundColor: WATER_BG, color: WATER_COLOR }}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1 rounded-xl px-3.5 py-2 text-[12.5px] font-medium text-muted-foreground/50 ring-1 ring-border/40 active:bg-foreground/[0.05]"
              >
                <Plus size={11} weight="bold" />
                Custom
              </button>
            </div>
          </div>

          <EntryList entries={entries} onDelete={deleteEntry} />
        </div>
      </div>

      {/* Sheets */}
      {addOpen && (
        <AddSheet onAdd={addEntry} onClose={() => setAddOpen(false)} />
      )}
      {goalOpen && (
        <GoalSheet
          goalMl={goalMl}
          onSave={saveGoal}
          onClose={() => setGoalOpen(false)}
        />
      )}

      <BottomBar onAdd={() => setAddOpen(true)} />
    </div>
  )
}
