import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft,
  CaretDown,
  CheckCircle,
  PencilSimple,
  Timer,
  Trash,
  X,
} from "@phosphor-icons/react"
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
import { celebrateOnce } from "@/lib/celebrations"
import { hapticMedium, hapticSelection, hapticTap } from "@/lib/haptics"
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

/**
 * The fasting timer. Normally a route; `embedded` lets the nutrition page open
 * the same screen in a drawer, so starting or ending a fast costs no page
 * transition at all.
 */
export default function Fasting({
  embedded = false,
  onClose,
}: {
  embedded?: boolean
  onClose?: () => void
} = {}) {
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
  const [fastCelebration, setFastCelebration] = useState(false)
  const [customHours, setCustomHours] = useState(16)
  const [editingStart, setEditingStart] = useState(false)
  // Starting or ending a fast is the whole job; the record of past ones is a
  // reference and stays folded away until it is asked for.
  const [recordOpen, setRecordOpen] = useState(false)
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
    // Captured before the mutation clears the session: only a fast that ran to
    // its target earns the celebration. Ending early gets the toast alone.
    const completed = targetSeconds > 0 && elapsed >= targetSeconds
    setBusy(true)
    try {
      await stopFast({
        id: id as Id<"fastingSessions">,
        endedAt: Date.now(),
        endDate: currentDateKey(),
      })
      writeCachedActiveFast(null)
      if (completed) {
        setFastCelebration(true)
        void celebrateOnce("fast-complete", String(id))
        window.setTimeout(() => setFastCelebration(false), 2600)
      } else {
        hapticSelection()
      }
      toast.success(completed ? "Fast complete" : "Fast ended")
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

  // Beat one: the target passes while the fast is still running. Deliberately
  // quieter than ending the fast — you have not finished yet.
  const targetReached = runningStartedAt !== null && progress >= 1
  const [targetPop, setTargetPop] = useState(false)
  const previouslyReached = useRef(targetReached)
  useEffect(() => {
    if (targetReached && !previouslyReached.current) {
      setTargetPop(true)
      hapticMedium()
      const timer = window.setTimeout(() => setTargetPop(false), 460)
      previouslyReached.current = targetReached
      return () => window.clearTimeout(timer)
    }
    previouslyReached.current = targetReached
  }, [targetReached])

  return (
    <div
      className={cn(
        "native-page mx-auto w-full max-w-xl text-foreground",
        embedded
          ? "pb-[calc(var(--app-safe-bottom)+1rem)]"
          : "min-h-svh pb-[calc(var(--app-safe-bottom)+6rem)]"
      )}
    >
      {embedded ? (
        <div className="flex items-center justify-between gap-3 px-[var(--app-page-x)] pt-1 pb-2">
          <h2 className="text-[19px] font-bold tracking-tight">Fasting</h2>
          <ToolbarButton
            onClick={() => onClose?.()}
            aria-label="Close fasting"
            className="-mr-2 px-0 text-muted-foreground"
          >
            <X size={19} weight="bold" />
          </ToolbarButton>
        </div>
      ) : (
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
      )}

      <div className="px-[var(--app-page-x)] pt-2">
        {runningStartedAt ? (
          <>
            <SummaryBlock
              tone="food"
              className={cn(targetPop && "motion-success-pop")}
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
                  "motion-bar-fill h-full w-full rounded-full",
                  progress >= 1 ? "bg-[var(--accent-food)]" : "bg-foreground"
                )}
                style={{
                  transform: `scaleX(${Math.min(1, progress)})`,
                }}
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

        <button
          type="button"
          onClick={() => {
            hapticTap()
            setRecordOpen((open) => !open)
          }}
          aria-expanded={recordOpen}
          aria-label="Your fasting record"
          className="mt-6 flex min-h-12 w-full items-center justify-between gap-3 border-t border-border pt-4 text-left"
        >
          <span className="native-section-title">Your fasting</span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {stats.totalCompleted === 0
              ? "No fasts yet"
              : `${stats.currentStreakDays}d streak · ${stats.averageHours}h avg`}
            <CaretDown
              size={14}
              weight="bold"
              className={cn("transition-transform", recordOpen && "rotate-180")}
            />
          </span>
        </button>

        {recordOpen && (
        <>
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
        </>
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

      {fastCelebration &&
        createPortal(
          <div
            className="water-goal-celebration fast-goal-celebration fixed inset-0 z-[200] flex items-center justify-center"
            role="status"
            aria-live="assertive"
            onClick={() => setFastCelebration(false)}
          >
            <button
              type="button"
              className="absolute top-[calc(var(--app-safe-top)+1rem)] right-4 z-20 grid size-11 place-items-center rounded-full bg-white/10 text-white"
              aria-label="Dismiss fasting celebration"
              onClick={() => setFastCelebration(false)}
            >
              <X size={20} weight="bold" />
            </button>
            <div className="water-goal-rain fast-goal-rain" aria-hidden>
              {Array.from({ length: 32 }, (_, index) => (
                <span
                  key={index}
                  style={{
                    left: `${(index * 37) % 101}%`,
                    animationDelay: `${(index * 73) % 640}ms`,
                    animationDuration: `${1050 + ((index * 97) % 700)}ms`,
                  }}
                />
              ))}
            </div>
            <div className="relative z-10 flex flex-col items-center gap-3 px-5 text-center">
              <CheckCircle
                size={42}
                weight="fill"
                className="water-goal-check text-[var(--accent-food)]"
                aria-hidden
              />
              <p className="water-goal-complete-text max-w-[18rem] text-[clamp(1.25rem,4vw,2.25rem)] font-semibold tracking-tight text-white">
                Fast complete
              </p>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
