import { useEffect, useMemo, useState } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import {
  useFullScreenEvent,
  useMomentPreview,
  useMomentRecords,
} from "@/lib/full-screen-events"
import {
  buildWeeklyReport,
  completedWeek,
  daysBetween,
  isoWeekKey,
  minutesOfDay,
  missedLogTrigger,
  MOMENT_IDS,
  trainingLapseTrigger,
  weeklyReportTrigger,
  type MomentBodyMeasurement,
  type MomentFoodLog,
  type MomentWorkoutLog,
} from "@/lib/moments"
import { CheckInMoment } from "@/components/moments/check-in-moment"
import { WeeklyReportMoment } from "@/components/moments/weekly-report-moment"

const MISSED_LOG_ID = MOMENT_IDS.missedLog
const LAPSE_ID = MOMENT_IDS.trainingLapse
const WEEKLY_REPORT_ID = MOMENT_IDS.weeklyReport

/** A lapse nudge answered inside this window is still fresh enough to count. */
const LAPSE_COOLDOWN_MS = 7 * 86_400_000

/** The clock only matters to the minute, and barely that. */
const TICK_MS = 5 * 60 * 1000

function readClock() {
  const now = new Date()
  return {
    todayKey: currentDateKey(),
    nowMinutes: minutesOfDay(now),
    at: now.getTime(),
  }
}

/**
 * The app's built-in moments: the two nudges and the weekly report.
 *
 * Mounted once, at the root. It holds the history queries the triggers need,
 * and it holds them *lazily* — the daily bookkeeping query is cheap and always
 * on, and the expensive log history is only subscribed to when that
 * bookkeeping says one of the three could still fire today. On most launches
 * this component costs one small query and nothing else.
 */
export function AppMoments() {
  const { isAuthenticated } = useConvexAuth()
  const records = useMomentRecords()
  const [clock, setClock] = useState(readClock)

  useEffect(() => {
    const tick = () => setClock(readClock())
    const timer = window.setInterval(tick, TICK_MS)
    // A phone that spent the evening in a pocket wakes up with a stale clock.
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [])

  const { todayKey, nowMinutes, at } = clock
  const weekKey = useMemo(
    () => isoWeekKey(completedWeek(todayKey, nowMinutes).start),
    [nowMinutes, todayKey]
  )

  /** Which triggers are still unanswered, judged from bookkeeping alone. */
  const pending = useMemo(() => {
    if (!records) return null
    return {
      missedLog: !records.some(
        (record) => record.eventId === MISSED_LOG_ID && record.key === todayKey
      ),
      lapse: !records.some(
        (record) =>
          record.eventId === LAPSE_ID && at - record.shownAt < LAPSE_COOLDOWN_MS
      ),
      weekly: !records.some(
        (record) =>
          record.eventId === WEEKLY_REPORT_ID && record.key === weekKey
      ),
    }
  }, [at, records, todayKey, weekKey])

  // A preview needs the same history the real trigger would have read, even
  // though no trigger fired.
  const { previewId } = useMomentPreview()

  const needsLogs =
    isAuthenticated &&
    (previewId !== null ||
      Boolean(
        pending && (pending.missedLog || pending.lapse || pending.weekly)
      ))
  const needsWeekly =
    isAuthenticated &&
    (previewId === WEEKLY_REPORT_ID || Boolean(pending?.weekly))

  const foodLogs = useQuery(
    api.logs.foodLogs.getRecent,
    needsLogs ? { beforeOrOn: todayKey, limit: 21 } : "skip"
  ) as MomentFoodLog[] | undefined
  const workoutLogs = useQuery(
    api.logs.workouts.getHistory,
    needsLogs ? {} : "skip"
  ) as MomentWorkoutLog[] | undefined
  const bodyMeasurements = useQuery(
    api.bodyProgress.list,
    needsWeekly ? {} : "skip"
  ) as MomentBodyMeasurement[] | undefined
  const goals = useQuery(
    api.users.users.getEffectiveGoals,
    needsWeekly ? {} : "skip"
  ) as { effective: { calories?: number; protein?: number } } | null | undefined

  const missed = useMemo(
    () =>
      foodLogs && pending?.missedLog
        ? missedLogTrigger({ foodLogs, todayKey, nowMinutes })
        : null,
    [foodLogs, nowMinutes, pending?.missedLog, todayKey]
  )

  const lapse = useMemo(
    () =>
      workoutLogs && pending?.lapse
        ? trainingLapseTrigger({ workoutLogs, todayKey })
        : null,
    [pending?.lapse, todayKey, workoutLogs]
  )

  const weekly = useMemo(() => {
    if (!foodLogs || !workoutLogs || !pending?.weekly) return null
    if (bodyMeasurements === undefined || goals === undefined) return null
    return weeklyReportTrigger({
      todayKey,
      nowMinutes,
      foodLogs,
      workoutLogs,
      bodyMeasurements,
      calorieTarget: goals?.effective.calories ?? 2000,
      proteinTarget: goals?.effective.protein ?? 150,
    })
  }, [
    bodyMeasurements,
    foodLogs,
    goals,
    nowMinutes,
    pending?.weekly,
    todayKey,
    workoutLogs,
  ])

  /**
   * The same report, built for whichever week just closed, regardless of
   * whether it is worth interrupting anyone over. Only the preview uses it.
   */
  const previewReport = useMemo(() => {
    if (previewId !== WEEKLY_REPORT_ID) return null
    if (!foodLogs || !workoutLogs) return null
    const { start, end } = completedWeek(todayKey, nowMinutes)
    return buildWeeklyReport({
      start,
      end,
      foodLogs,
      workoutLogs,
      bodyMeasurements: bodyMeasurements ?? [],
      calorieTarget: goals?.effective.calories ?? 2000,
      proteinTarget: goals?.effective.protein ?? 150,
    })
  }, [
    bodyMeasurements,
    foodLogs,
    goals,
    nowMinutes,
    previewId,
    todayKey,
    workoutLogs,
  ])

  /** Days since the last logged session, lapse or not, for the preview copy. */
  const daysSinceLastSession = useMemo(() => {
    const last = (workoutLogs ?? [])
      .map((log) => log.date)
      .filter((date) => date <= todayKey)
      .sort()
      .at(-1)
    return last ? daysBetween(last, todayKey) : 0
  }, [todayKey, workoutLogs])

  // The week outranks the nudges: it is the one that is actually news.
  const report = useFullScreenEvent({
    id: WEEKLY_REPORT_ID,
    key: weekly?.key ?? null,
    priority: 30,
  })
  const missedLog = useFullScreenEvent({
    id: MISSED_LOG_ID,
    key: missed?.key ?? null,
    priority: 20,
  })
  const trainingLapse = useFullScreenEvent({
    id: LAPSE_ID,
    key: lapse?.key ?? null,
    priority: 10,
  })

  if (report.active) {
    // In a preview the data is still arriving; the screen follows it in.
    const shown = weekly?.report ?? previewReport
    if (shown) {
      return <WeeklyReportMoment report={shown} onClose={report.close} />
    }
  }

  if (missedLog.active) {
    return (
      <CheckInMoment
        variant="missed-log"
        todayKey={todayKey}
        onClose={missedLog.close}
      />
    )
  }

  if (trainingLapse.active) {
    return (
      <CheckInMoment
        variant="training-lapse"
        todayKey={todayKey}
        daysSince={lapse?.daysSince ?? daysSinceLastSession}
        onClose={trainingLapse.close}
      />
    )
  }

  return null
}
