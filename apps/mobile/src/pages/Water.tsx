import React, { useMemo, useState } from "react"
import {
  CaretLeft,
  CaretRight,
  Drop,
  PencilSimple,
  Plus,
  X,
} from "@phosphor-icons/react"
import { MobileSheet } from "@/components/mobile-sheet"
import { SlideToDeleteRow } from "@/components/slide-to-delete-row"
import { useBottomBarAction } from "@/components/bottom-bar"
import { useQuery } from "convex/react"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { api } from "../../../../convex/_generated/api"
import { currentDateKey, offsetDateKey } from "@/lib/food-log"
import { APP_ACCENT_COLORS, tint } from "@/lib/design-tokens"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  fmtMl,
  readRecentWaterAmounts,
  rememberRecentWaterAmount,
  validateCustomWaterAmount,
  visibleRecentWaterAmounts,
} from "@/lib/water-amounts"

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
  { label: "1 L", ml: 1000 },
]

const WATER_COLOR = APP_ACCENT_COLORS.water
const WATER_BG = tint(WATER_COLOR, 13)

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

// ─── Swipe-to-delete row ──────────────────────────────────────────────────────

function SwipeRow({
  entry,
  onDelete,
}: {
  entry: WaterLogEntry
  onDelete: () => void
}) {
  return (
    <SlideToDeleteRow
      deleteLabel={`Delete ${fmtMl(entry.amountMl)} water entry`}
      onDelete={onDelete}
      className="rounded-xl bg-foreground/[0.035] ring-1 ring-border/25"
      rowClassName="flex items-center gap-3 bg-card px-3 py-2.5"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: WATER_BG }}
      >
        <Drop size={12} weight="fill" style={{ color: WATER_COLOR }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-foreground/85">
          {fmtMl(entry.amountMl)}
        </p>
        <p className="mt-0.5 text-[10px] font-medium tracking-[0.12em] text-muted-foreground/35 uppercase">
          Water
        </p>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground/45 tabular-nums">
        {fmtTime(entry.loggedAt)}
      </span>
    </SlideToDeleteRow>
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
    <div className="rounded-[22px] bg-card px-4 py-3.5 ring-1 ring-border/40 short-phone:rounded-[18px] short-phone:px-3.5 short-phone:py-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
          Today
        </p>
        <button
          onClick={onEditGoal}
          className="flex min-h-10 items-center gap-1 rounded-full px-3 text-[10.5px] font-medium text-muted-foreground/40 active:bg-muted/45 active:text-muted-foreground/70"
        >
          <PencilSimple size={10} />
          Goal
        </button>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <span
            className="text-[2.2rem] leading-none font-bold tabular-nums"
            style={{ color: over ? WATER_COLOR : undefined }}
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
            <p
              className="mt-0.5 text-[11px] tabular-nums"
              style={{ color: WATER_COLOR, opacity: 0.7 }}
            >
              Goal reached!
            </p>
          )}
        </div>
        <div className="text-right">
          <span
            className="text-[13px] font-semibold tabular-nums"
            style={{ color: WATER_COLOR }}
          >
            {Math.round(pct)}%
          </span>
          <p className="text-[9px] tracking-wide text-muted-foreground/30 uppercase">
            of goal
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/40 short-phone:mt-2.5">
        <div
          className="motion-progress-fill h-full rounded-full"
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
    <div className="rounded-[22px] bg-card p-4 ring-1 ring-border/40 md:col-span-2 short-phone:rounded-[18px] short-phone:p-3.5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/45 uppercase">
            Entries
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground/45">
            {sorted.length} logged today
          </p>
        </div>
        <span
          className="text-[12px] font-semibold tabular-nums"
          style={{ color: WATER_COLOR }}
        >
          {fmtMl(sorted.reduce((sum, entry) => sum + entry.amountMl, 0))}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
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
  saving,
  onSave,
  onClose,
}: {
  goalMl: number
  saving: boolean
  onSave: (ml: number) => Promise<boolean>
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
            aria-label="Close daily goal"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/50 active:opacity-60"
          >
            <X size={12} weight="bold" />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-[13px] font-medium">Water</span>
            <span className="text-[10px] text-muted-foreground/40">ml</span>
          </div>
          <div className="flex items-center rounded-xl bg-muted/50 p-0.5">
            <button
              onClick={() => setDraft((v) => Math.max(250, v - 250))}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/60 active:bg-background active:text-foreground"
            >
              <span className="text-[15px] leading-none">−</span>
            </button>
            <input
              type="number"
              name="water-goal-ml"
              aria-label="Daily water goal in ml"
              value={draft}
              onChange={(e) => {
                const n = parseInt(e.target.value)
                if (!isNaN(n)) setDraft(Math.max(250, n))
              }}
              className="h-10 w-20 bg-transparent text-center text-[13px] font-semibold tabular-nums outline-none"
            />
            <button
              onClick={() => setDraft((v) => v + 250)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground/60 active:bg-background active:text-foreground"
            >
              <span className="text-[15px] leading-none">+</span>
            </button>
          </div>
        </div>

        <button
          disabled={saving}
          aria-busy={saving}
          onClick={async () => {
            const saved = await onSave(draft)
            if (saved) onClose()
          }}
          className="mt-4 w-full rounded-xl bg-foreground py-3 text-[13px] font-semibold text-background active:opacity-75 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </MobileSheet>
  )
}

// ─── Custom amount sheet ──────────────────────────────────────────────────────

function AddSheet({
  addingAmountMl,
  saving,
  onAdd,
  onClose,
}: {
  addingAmountMl: number | null
  saving: boolean
  onAdd: (ml: number) => Promise<boolean>
  onClose: () => void
}) {
  const [custom, setCustom] = useState("")
  const [customError, setCustomError] = useState<string | null>(null)
  const [recentAmounts, setRecentAmounts] = useState(() =>
    readRecentWaterAmounts()
  )
  const recentVisibleAmounts = visibleRecentWaterAmounts(
    recentAmounts,
    QUICK_AMOUNTS.map(({ ml }) => ml)
  )

  async function submit(ml: number) {
    if (addingAmountMl !== null || saving) return false
    const saved = await onAdd(ml)
    if (saved) {
      setCustomError(null)
      onClose()
    }
    return saved
  }

  async function submitCustom() {
    const result = validateCustomWaterAmount(custom)
    if (result.error || result.amountMl == null) {
      setCustomError(result.error)
      return
    }

    const saved = await submit(result.amountMl)
    if (saved) {
      setRecentAmounts(rememberRecentWaterAmount(result.amountMl))
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
            aria-label="Close water logger"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/50 active:opacity-60"
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
              disabled={saving}
              aria-label={`Log ${label} water`}
              aria-busy={addingAmountMl === ml}
              onClick={() => void submit(ml)}
              className="min-h-10 rounded-xl px-3.5 text-[12.5px] font-semibold transition-all active:scale-[0.985] disabled:opacity-50"
              style={{ backgroundColor: WATER_BG, color: WATER_COLOR }}
            >
              {addingAmountMl === ml ? "..." : label}
            </button>
          ))}
        </div>

        {recentVisibleAmounts.length > 0 && (
          <>
            <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
              Recent
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              {recentVisibleAmounts.map((ml) => (
                <button
                  key={ml}
                  disabled={saving}
                  aria-label={`Log ${fmtMl(ml)} water`}
                  aria-busy={addingAmountMl === ml}
                  onClick={() => void submit(ml)}
                  className="min-h-10 rounded-xl bg-muted/55 px-3.5 text-[12.5px] font-semibold text-foreground/75 transition-all active:scale-[0.985] disabled:opacity-50"
                >
                  {addingAmountMl === ml ? "..." : fmtMl(ml)}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Custom amount */}
        <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/40 uppercase">
          Custom
        </p>
        <div className="flex gap-2">
          <div className="flex flex-1 items-center rounded-xl bg-muted/50 px-3 py-2">
            <input
              type="number"
              name="custom-water-ml"
              inputMode="numeric"
              aria-label="Custom water amount in ml"
              placeholder="Amount in ml"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value)
                setCustomError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void submitCustom()
                }
              }}
              className="flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-muted-foreground/30"
            />
            <span className="ml-1 text-[11px] text-muted-foreground/35">
              ml
            </span>
          </div>
          <button
            disabled={saving}
            aria-label="Log custom water amount"
            onClick={() => void submitCustom()}
            className="flex min-h-10 items-center justify-center rounded-xl bg-foreground px-4 text-background active:opacity-75 disabled:opacity-50"
          >
            <Plus size={15} weight="bold" />
          </button>
        </div>
        {customError && (
          <p className="mt-2 rounded-[10px] bg-destructive/10 px-3 py-2 text-[11px] font-semibold text-destructive">
            {customError}
          </p>
        )}
      </div>
    </MobileSheet>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Water() {
  const navigate = useSmoothNavigate()
  const preferences = useQuery(api.users.users.getPreferences, {})
  const activeTimezone = preferences?.lastActiveTimezone ?? "UTC"
  const todayKey = currentDateKey(activeTimezone)

  const [dateKey, setDateKey] = useState(todayKey)
  const [addOpen, setAddOpen] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const [addingAmountMl, setAddingAmountMl] = useState<number | null>(null)
  const [savingGoal, setSavingGoal] = useState(false)
  useBottomBarAction(() => setAddOpen(true))

  const rawEntries = useQuery(api.logs.water.getDay, { date: dateKey })
  const setDay = useOfflineMutation(api.logs.water.setDay, "logs.water.setDay")
  const addEntryMutation = useOfflineMutation(
    api.logs.water.addEntry,
    "logs.water.addEntry"
  )
  const removeEntryMutation = useOfflineMutation(
    api.logs.water.removeEntry,
    "logs.water.removeEntry"
  )
  const setWaterGoal = useOfflineMutation(
    api.users.users.setWaterGoal,
    "users.users.setWaterGoal"
  )

  // Optimistic local entries — immediately reflects taps, gets replaced by
  // server data once Convex round-trips back.
  const [optimisticEntries, setOptimisticEntries] = useState<WaterLogEntry[]>(
    []
  )
  const [pendingDeletedIds, setPendingDeletedIds] = useState<Set<string>>(
    new Set()
  )
  const pendingDeletedIdsRef = React.useRef<Set<string>>(new Set())
  const syncedDateKey = React.useRef<string | null>(null)

  function markDeleted(id: string) {
    const next = new Set(pendingDeletedIdsRef.current)
    next.add(id)
    pendingDeletedIdsRef.current = next
    setPendingDeletedIds(next)
  }

  function unmarkDeleted(id: string) {
    const next = new Set(pendingDeletedIdsRef.current)
    next.delete(id)
    pendingDeletedIdsRef.current = next
    setPendingDeletedIds(next)
  }

  // When server data arrives for the current dateKey, drop our optimistic layer.
  React.useEffect(() => {
    if (rawEntries !== undefined) {
      setOptimisticEntries([])
      const serverIds = new Set(
        ((rawEntries ?? []) as WaterLogEntry[]).map((entry) => entry.id)
      )
      setPendingDeletedIds((prev) => {
        const next = new Set([...prev].filter((id) => serverIds.has(id)))
        pendingDeletedIdsRef.current = next
        return next
      })
      syncedDateKey.current = dateKey
    }
  }, [rawEntries, dateKey])

  // Reset optimistic state when navigating to a different day.
  React.useEffect(() => {
    setOptimisticEntries([])
    pendingDeletedIdsRef.current = new Set()
    setPendingDeletedIds(new Set())
  }, [dateKey])

  const serverEntries = useMemo(
    () => (rawEntries ?? []) as WaterLogEntry[],
    [rawEntries]
  )
  // Merge: server entries are ground truth; optimistic ones are appended on top
  // (they'll disappear once server round-trips and replaces rawEntries).
  const entries = useMemo(() => {
    const visibleServerEntries = serverEntries.filter(
      (entry) => !pendingDeletedIds.has(entry.id)
    )
    const serverIds = new Set(serverEntries.map((e) => e.id))
    const pending = optimisticEntries.filter(
      (entry) => !serverIds.has(entry.id) && !pendingDeletedIds.has(entry.id)
    )
    return [...visibleServerEntries, ...pending]
  }, [serverEntries, optimisticEntries, pendingDeletedIds])
  const entriesRef = React.useRef<WaterLogEntry[]>([])

  React.useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  const totalMl = useMemo(
    () => entries.reduce((s, e) => s + e.amountMl, 0),
    [entries]
  )

  const goalMl = preferences?.waterGoalMl ?? 2500
  const dateLabel = formatDateLabel(dateKey, todayKey)
  const isToday = dateKey === todayKey

  async function addEntry(amountMl: number) {
    if (addingAmountMl !== null) return false
    const date = dateKey
    const entry: WaterLogEntry = {
      id: crypto.randomUUID(),
      amountMl,
      loggedAt: new Date().toISOString(),
    }
    setAddingAmountMl(amountMl)
    // Update UI instantly
    setOptimisticEntries((prev) => [...prev, entry])
    // Sync to server in background, with error rollback
    try {
      await addEntryMutation({ date, entry })
      if (pendingDeletedIdsRef.current.has(entry.id)) {
        void persistDelete(date, entry.id)
      }
      return true
    } catch {
      // Remove the optimistic entry on error
      setOptimisticEntries((prev) => prev.filter((e) => e.id !== entry.id))
      unmarkDeleted(entry.id)
      return false
    } finally {
      setAddingAmountMl(null)
    }
  }

  async function saveGoal(ml: number) {
    if (savingGoal) return false
    setSavingGoal(true)
    try {
      await setWaterGoal({ goalMl: ml })
      return true
    } finally {
      setSavingGoal(false)
    }
  }

  async function persistDelete(
    date: string,
    id: string,
    fallbackEntries = entriesRef.current.filter((entry) => entry.id !== id)
  ) {
    try {
      await removeEntryMutation({ date, id })
    } catch {
      await setDay({ date, entries: fallbackEntries })
    }
  }

  function deleteEntry(id: string) {
    const date = dateKey
    const deletedEntry = entriesRef.current.find((entry) => entry.id === id)
    const wasServerEntry = serverEntries.some((entry) => entry.id === id)
    const nextEntries = entriesRef.current.filter((entry) => entry.id !== id)
    markDeleted(id)
    setOptimisticEntries((prev) => prev.filter((e) => e.id !== id))
    persistDelete(date, id, nextEntries).catch(() => {
      unmarkDeleted(id)
      if (deletedEntry && !wasServerEntry) {
        setOptimisticEntries((prev) =>
          prev.some((entry) => entry.id === id) ? prev : [...prev, deletedEntry]
        )
      }
    })
  }

  return (
    <div className="desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
      <div className="mx-auto flex w-full max-w-lg flex-col pb-[calc(var(--app-safe-bottom-lg)+6.5rem)] md:max-w-6xl md:pb-10">
        {/* Header */}
        <header className="app-header px-[var(--app-page-x)] md:px-8 short-phone:pb-4">
          <div>
            <button
              type="button"
              onClick={() => navigate("/nutrition")}
              className="mb-1 flex min-h-9 items-center gap-1 rounded-full pr-3 text-[11px] font-semibold text-muted-foreground/60 transition-colors active:text-foreground"
              aria-label="Back to Nutrition"
            >
              <CaretLeft size={12} weight="bold" />
              Nutrition
            </button>
            <h1 className="app-title short-phone:text-[1.42rem]">Water</h1>
          </div>

          {/* Date navigation */}
          <div className="flex items-center gap-1 pb-0.5">
            <button
              onClick={() => setDateKey((d) => offsetDateKey(d, -1))}
              aria-label="Previous day"
              className="app-icon-button"
            >
              <CaretLeft size={13} weight="bold" />
            </button>
            <span className="min-w-[56px] text-center text-[11px] font-medium text-muted-foreground/60">
              {dateLabel}
            </span>
            <button
              onClick={() => setDateKey((d) => offsetDateKey(d, 1))}
              disabled={isToday}
              aria-label="Next day"
              className="app-icon-button disabled:opacity-20"
            >
              <CaretRight size={13} weight="bold" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex flex-col gap-4 px-[var(--app-page-x)] md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-5 md:px-8 short-phone:gap-3">
          <ProgressCard
            totalMl={totalMl}
            goalMl={goalMl}
            onEditGoal={() => setGoalOpen(true)}
          />

          {/* Quick-add row */}
          <div
            className="app-rail-surface px-4 py-3.5 short-phone:px-3.5 short-phone:py-3"
            style={
              { "--rail-color": "var(--accent-water)" } as React.CSSProperties
            }
          >
            <p className="app-eyebrow mb-2.5 text-muted-foreground/55">
              Quick add
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map(({ label, ml }) => (
                <button
                  key={ml}
                  disabled={addingAmountMl !== null}
                  aria-label={`Log ${label} water`}
                  aria-busy={addingAmountMl === ml}
                  onClick={() => void addEntry(ml)}
                  className="min-h-10 rounded-[9px] px-3.5 text-[12.5px] font-semibold transition-all active:scale-[0.985] disabled:opacity-50"
                  style={{ backgroundColor: WATER_BG, color: WATER_COLOR }}
                >
                  {addingAmountMl === ml ? "..." : label}
                </button>
              ))}
              <button
                onClick={() => setAddOpen(true)}
                aria-label="Log custom water"
                className="flex min-h-10 items-center gap-1 rounded-[9px] px-3.5 text-[12.5px] font-medium text-muted-foreground/60 ring-1 ring-border/50 active:bg-foreground/[0.05]"
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
        <AddSheet
          addingAmountMl={addingAmountMl}
          saving={addingAmountMl !== null}
          onAdd={addEntry}
          onClose={() => setAddOpen(false)}
        />
      )}
      {goalOpen && (
        <GoalSheet
          goalMl={goalMl}
          saving={savingGoal}
          onSave={saveGoal}
          onClose={() => setGoalOpen(false)}
        />
      )}
    </div>
  )
}
