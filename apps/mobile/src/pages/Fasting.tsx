import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, PencilSimple, Timer, Trash } from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import {
  EmptyState,
  GroupedList,
  NavigationBar,
  PrimaryButton,
  SectionHeader,
  SummaryBlock,
  ToolbarButton,
  toast,
} from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { MobileSheet } from "@/components/mobile-sheet"
import { hapticSelection, hapticTap } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { reportOfflineMutationError } from "@/lib/offline-mutation-errors"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { cn } from "@/lib/utils"
import { currentDateKey, type FoodLogEntry } from "@/lib/food-log"
import {
  FASTING_PRESETS,
  fastingStats,
  formatFastDuration,
  suggestedFastStart,
  type FastingSession,
} from "@/lib/fasting"
import {
  readCachedActiveFast,
  useFastTimer,
  writeCachedActiveFast,
} from "@/lib/use-fast-timer"
import { TourAnchor } from "@/components/walkthrough/tour-anchor"

const MIN_CUSTOM_HOURS = 1
const MAX_CUSTOM_HOURS = 48

function clockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

function historyDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export default function Fasting() {
  const navigate = useSmoothNavigate()
  const today = currentDateKey()

  const activeQuery = useQuery(api.logs.fasting.getActive, {})
  const historyQuery = useQuery(api.logs.fasting.getRecent, { limit: 30 })
  const todayLog = useQuery(api.logs.foodLogs.getDay, { date: today })

  const startFast = useOfflineMutation(
    api.logs.fasting.start,
    "logs.fasting.start"
  )
  const stopFast = useOfflineMutation(
    api.logs.fasting.stop,
    "logs.fasting.stop"
  )
  const updateFast = useOfflineMutation(
    api.logs.fasting.update,
    "logs.fasting.update"
  )
  const removeFast = useOfflineMutation(
    api.logs.fasting.remove,
    "logs.fasting.remove"
  )

  const [busy, setBusy] = useState(false)
  const [customHours, setCustomHours] = useState(16)
  const [editingStart, setEditingStart] = useState(false)
  const [startDraft, setStartDraft] = useState("")

  // Convex is authoritative, but its first result lands a beat after mount and
  // never lands at all offline. The cached copy keeps the timer on screen.
  const cached = useMemo(() => readCachedActiveFast(), [])
  const active = (activeQuery ?? undefined) as FastingSession | null | undefined
  const runningStartedAt =
    active === undefined
      ? (cached?.startedAt ?? null)
      : (active?.startedAt ?? null)
  const runningTarget =
    active === undefined
      ? (cached?.targetMinutes ?? 0)
      : (active?.targetMinutes ?? 0)
  const runningProtocol =
    active === undefined ? (cached?.protocol ?? "") : (active?.protocol ?? "")

  useEffect(() => {
    if (active === undefined) return
    writeCachedActiveFast(active)
  }, [active])

  const elapsed = useFastTimer(runningStartedAt)

  const history = useMemo(
    () => (historyQuery ?? []) as FastingSession[],
    [historyQuery]
  )
  const stats = useMemo(() => fastingStats(history, today), [history, today])

  const lastMealAt = useMemo(
    () => suggestedFastStart((todayLog?.entries ?? []) as FoodLogEntry[]),
    [todayLog]
  )

  const loading = activeQuery === undefined && cached === null

  async function handleStart(
    targetMinutes: number,
    protocol: string,
    from?: number
  ) {
    if (busy) return
    setBusy(true)
    try {
      await startFast({
        targetMinutes,
        protocol,
        startDate: today,
        ...(from ? { startedAt: from } : {}),
      })
      hapticSelection()
      toast.success("Fast started")
    } catch (error) {
      reportOfflineMutationError(error, "Could not start this fast")
    } finally {
      setBusy(false)
    }
  }

  async function handleStop() {
    const id = active?.id ?? active?._id
    if (!id || busy) return
    setBusy(true)
    try {
      await stopFast({
        id: id as Id<"fastingSessions">,
        endedAt: Date.now(),
        endDate: currentDateKey(),
      })
      writeCachedActiveFast(null)
      hapticSelection()
      toast.success("Fast ended")
    } catch (error) {
      reportOfflineMutationError(error, "Could not end this fast")
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveStart() {
    const id = active?.id ?? active?._id
    if (!id) return
    const parsed = Date.parse(startDraft)
    if (!Number.isFinite(parsed)) {
      toast.error("Enter a valid start time")
      return
    }
    if (parsed > Date.now()) {
      toast.error("A fast cannot start in the future")
      return
    }
    try {
      await updateFast({
        id: id as Id<"fastingSessions">,
        startedAt: parsed,
      })
      setEditingStart(false)
      toast.success("Start time updated")
    } catch (error) {
      reportOfflineMutationError(error, "Could not update the start time")
    }
  }

  async function handleDelete(session: FastingSession) {
    const id = session.id ?? session._id
    if (!id) return
    try {
      await removeFast({ id: id as Id<"fastingSessions"> })
      toast.success("Fast deleted")
    } catch (error) {
      reportOfflineMutationError(error, "Could not delete this fast")
    }
  }

  // Derived from the ticking `elapsed` rather than Date.now(): the ring and the
  // countdown advance with the timer instead of only on an unrelated re-render,
  // and render stays pure.
  const targetSeconds = runningTarget * 60
  const progress = targetSeconds > 0 ? elapsed / targetSeconds : 0
  const remaining = Math.max(0, targetSeconds - elapsed)
  const etaAt = runningStartedAt
    ? runningStartedAt + runningTarget * 60_000
    : null

  return (
    <div className="native-page mx-auto min-h-svh w-full max-w-xl pb-[calc(var(--app-safe-bottom)+6rem)] text-foreground">
      <NavigationBar
        title="Fasting"
        subtitle="Track an intermittent fast"
        leading={
          <ToolbarButton
            onClick={() => navigate(-1)}
            aria-label="Back to nutrition"
            className="-ml-2 px-0 text-muted-foreground"
          >
            <ArrowLeft size={19} weight="bold" />
          </ToolbarButton>
        }
      />

      <div className="px-[var(--app-page-x)] pt-2">
        {runningStartedAt ? (
          <>
            <SummaryBlock
              tone="food"
              title={runningProtocol ? `${runningProtocol} fast` : "Fasting"}
              value={
                <span
                  className="tabular-nums"
                  role="timer"
                  aria-live="polite"
                  aria-label={`Fasting for ${formatFastDuration(elapsed)}`}
                >
                  {formatFastDuration(elapsed)}
                </span>
              }
              detail={
                progress >= 1
                  ? `Target reached · started ${clockTime(runningStartedAt)}`
                  : `${formatFastDuration(remaining)} to go${
                      etaAt ? ` · ends around ${clockTime(etaAt)}` : ""
                    }`
              }
            />

            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
              role="presentation"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  progress >= 1 ? "bg-[var(--accent-food)]" : "bg-foreground"
                )}
                style={{ width: `${Math.min(100, progress * 100)}%` }}
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <PrimaryButton
                onClick={handleStop}
                disabled={busy}
                aria-label="End fast"
                className="flex-1"
              >
                End fast
              </PrimaryButton>
              <ToolbarButton
                onClick={() => {
                  hapticTap()
                  // datetime-local wants local wall-clock time, not an ISO Z string.
                  const local = new Date(
                    runningStartedAt - new Date().getTimezoneOffset() * 60_000
                  )
                  setStartDraft(local.toISOString().slice(0, 16))
                  setEditingStart(true)
                }}
                aria-label="Edit fast start time"
              >
                <PencilSimple size={18} weight="bold" />
              </ToolbarButton>
            </div>
          </>
        ) : (
          <>
            <SectionHeader title="Start a fast" />
            <TourAnchor anchor="fasting-presets" className="block">
              <GroupedList label="Fasting presets">
                {FASTING_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={busy || loading}
                    onClick={() => handleStart(preset.targetMinutes, preset.id)}
                    aria-label={`Start ${preset.label} fast`}
                    className="flex min-h-14 w-full items-center justify-between gap-3 px-1 py-2.5 text-left active:opacity-70 disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="native-row-title">{preset.label}</p>
                      <p className="native-row-detail mt-0.5">
                        {preset.detail}
                      </p>
                    </div>
                    <Timer
                      size={19}
                      weight="bold"
                      className="text-muted-foreground"
                    />
                  </button>
                ))}
              </GroupedList>
            </TourAnchor>

            <SectionHeader title="Custom length" />
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={MIN_CUSTOM_HOURS}
                max={MAX_CUSTOM_HOURS}
                value={customHours}
                aria-label="Custom fast length in hours"
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isFinite(value)) {
                    setCustomHours(
                      Math.min(
                        MAX_CUSTOM_HOURS,
                        Math.max(MIN_CUSTOM_HOURS, value)
                      )
                    )
                  }
                }}
                className="h-11 w-24 rounded-xl border border-border bg-transparent px-3 text-center tabular-nums outline-none"
              />
              <span className="native-row-detail">hours</span>
              <PrimaryButton
                onClick={() => handleStart(customHours * 60, "custom")}
                disabled={busy || loading}
                aria-label="Start custom fast"
                className="ml-auto"
              >
                Start
              </PrimaryButton>
            </div>

            {lastMealAt !== null && (
              <TourAnchor anchor="fasting-last-meal" className="block">
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() =>
                    handleStart(customHours * 60, "custom", lastMealAt)
                  }
                  aria-label="Start fast from last meal"
                  className="native-toolbar-button mt-3 h-11 w-full justify-center px-3 disabled:opacity-50"
                >
                  Start from last meal ({clockTime(lastMealAt)})
                </button>
              </TourAnchor>
            )}
          </>
        )}

        <SectionHeader title="Your fasting" />
        {stats.totalCompleted === 0 ? (
          <EmptyState
            icon={Timer}
            tone="food"
            title="No completed fasts yet"
            detail="Finish a fast and your streak, average and longest will show up here."
          />
        ) : (
          <dl
            className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums"
            aria-label="Fasting statistics"
          >
            {(
              [
                [
                  "Current streak",
                  `${stats.currentStreakDays} day${
                    stats.currentStreakDays === 1 ? "" : "s"
                  }`,
                ],
                ["Longest streak", `${stats.longestStreakDays} days`],
                ["Average", `${stats.averageHours} h`],
                ["Longest fast", `${stats.longestHours} h`],
                ["Completed", `${stats.totalCompleted}`],
                ["Hit target", `${Math.round(stats.goalHitRate * 100)}%`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="native-row-detail">{label}</dt>
                <dd className="native-row-title">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <SectionHeader title="History" />
        {history.length === 0 ? (
          <EmptyState
            icon={Timer}
            tone="food"
            title="Nothing logged yet"
            detail="Fasts you start and end will appear here."
          />
        ) : (
          <GroupedList label="Fasting history">
            {history.map((session) => {
              const id = session.id ?? session._id ?? session.startDate
              const durationSeconds = session.endedAt
                ? Math.round((session.endedAt - session.startedAt) / 1000)
                : null
              return (
                <div
                  key={id}
                  className="flex min-h-14 items-center justify-between gap-2 px-1 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="native-row-title tabular-nums">
                      {durationSeconds === null
                        ? "In progress"
                        : formatFastDuration(durationSeconds)}
                    </p>
                    <p className="native-row-detail mt-0.5">
                      {historyDate(session.startDate)} · {session.protocol}
                      {session.endedEarly ? " · ended early" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(session)}
                    aria-label={`Delete fast from ${historyDate(session.startDate)}`}
                    className="native-toolbar-button h-11 w-11 px-0 text-destructive"
                  >
                    <Trash size={17} weight="bold" />
                  </button>
                </div>
              )
            })}
          </GroupedList>
        )}
      </div>

      {editingStart && (
        <MobileSheet onClose={() => setEditingStart(false)}>
          <div className="flex flex-col gap-3 p-4">
            <h2 className="native-section-title">Edit start time</h2>
            <label className="native-field">
              <span className="native-field-label">Started at</span>
              <input
                type="datetime-local"
                value={startDraft}
                aria-label="Fast start time"
                onChange={(event) => setStartDraft(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-transparent px-3 outline-none"
              />
            </label>
            <PrimaryButton
              onClick={handleSaveStart}
              aria-label="Save fast start time"
            >
              Save
            </PrimaryButton>
          </div>
        </MobileSheet>
      )}
    </div>
  )
}
