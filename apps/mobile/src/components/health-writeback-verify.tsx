import { tr } from "@repo/ui/i18n"
/**
 * Reads the last week back out of the health store.
 *
 * The other half of a write becoming visible: the app can now say a write was
 * refused at the moment it happened, and this says what the store ended up
 * holding. Between them, "the food isn't in Health Connect" stops being a
 * report from memory and becomes a number.
 *
 * Each day is one read of OneRep's own log (the same query the repair pushes)
 * beside the store's total for that date. The queries only mount once the check
 * is armed, so opening Settings costs nothing.
 */import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueries } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { PrimaryButton } from "@repo/ui"
import {
  healthProviderLabel,
  readHealthDailyMetrics,
} from "@/lib/health-provider"
import { dayHydrationMl, useHydrationEnabled } from "@/lib/hydration"
import {
  toHealthNutritionItems,
  type HealthNutritionItemSource,
} from "@/lib/health-nutrition-items"
import { offsetDateKey } from "@/lib/food-log"
import { localDateKey } from "@/lib/utils"
import {
  describeDayCheck,
  summariseWritebackChecks,
  unreadableLogCheck,
  unreadableStoreCheck,
  type WritebackCheckSummary,
  type WritebackDayCheck,
} from "@/lib/health-writeback-compare"

/** How far back the check reaches; the same week the repair rewrites. */
const CHECK_DAYS = 7

/**
 * How long the check waits before it says it could not get an answer.
 *
 * Every await in here can hang: the log queries wait on the server, and the
 * store read waits on a native call. A success path is never worth an unbounded
 * progress bar, so the whole thing is on a clock.
 */
const CHECK_TIMEOUT_MS = 20_000

export type HealthWriteBackCheckResult = {
  headline: string
  rows: WritebackDayCheck[]
}

export function HealthWriteBackCheck({ disabled }: { disabled?: boolean }) {
  const [armed, setArmed] = useState(false)
  const [result, setResult] = useState<HealthWriteBackCheckResult | null>(null)

  if (armed) {
    return (
      <CheckRunner
        onFinished={(next) => {
          setArmed(false)
          setResult(next)
        }}
      />
    )
  }

  const storeLabel = healthProviderLabel()

  return (
    <>
      <PrimaryButton
        className="w-full"
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {tr("Check what {{value0}} has", { value0: storeLabel })}
      </PrimaryButton>
      {result && (
        <div className="mt-2 space-y-1">
          <p className="native-row-detail px-[var(--app-page-x)]">
            {result.headline}
          </p>
          {result.rows
            .filter((row) => row.appKcal > 0 || row.appWaterMl > 0)
            .map((row) => (
              <p
                key={row.date}
                className="native-row-detail px-[var(--app-page-x)]"
              >
                {dayLabel(row.date)} — {describeDayCheck(row, storeLabel)}
              </p>
            ))}
          {result.rows.length > 0 && (
            // Only worth saying when there is a comparison on screen to qualify.
            <p className="native-row-detail px-[var(--app-page-x)]">
              {tr(
                "{{value0}} sums nutrition from every app, so a day that matches confirms your food is there without proving the number is ours.",
                { value0: storeLabel }
              )}
            </p>
          )}
        </div>
      )}
    </>
  )
}

function dayLabel(date: string): string {
  const today = localDateKey()
  if (date === today) return tr("Today")
  if (date === offsetDateKey(today, -1)) return tr("Yesterday")
  return date
}

function CheckRunner({
  onFinished,
}: {
  onFinished: (result: HealthWriteBackCheckResult) => void
}) {
  // The comparison has to measure what the write-back actually sends, and it
  // sends no water at all while the tracker is off.
  const hydrationOn = useHydrationEnabled()
  const dayKeys = useMemo(
    () => Array.from({ length: CHECK_DAYS }, (_, i) => offsetDateKey(localDateKey(), -i)),
    []
  )

  const foodQueries = useQueries(
    useMemo(
      () =>
        Object.fromEntries(
          dayKeys.map((date) => [
            date,
            { query: api.logs.foodLogs.getRange, args: { start: date, end: date } },
          ])
        ),
      [dayKeys]
    )
  )
  const waterQueries = useQueries(
    useMemo(
      () =>
        Object.fromEntries(
          dayKeys.map((date) => [
            date,
            { query: api.logs.water.getDay, args: { date } },
          ])
        ),
      [dayKeys]
    )
  )

  // Same contract as the repair: every key must be loaded or an Error before
  // anything is compared, because an undefined day would read as "OneRep has
  // nothing" and accuse the store of losing food that was never logged.
  const settled = dayKeys.every(
    (key) => foodQueries[key] !== undefined && waterQueries[key] !== undefined
  )

  /*
   * One shot, and the guard is a ref on purpose.
   *
   * This was a piece of state first, which was wrong in a way that only shows up
   * on a device: setting it re-rendered, React ran the previous effect's
   * cleanup before the next, and that cleanup's `cancelled` flag then dropped
   * the answer the read was still waiting for. The check sat on its progress bar
   * for ever, with no timeout to end it, until the screen was left and re-entered.
   * Nothing about finishing this may depend on a re-render.
   */
  const started = useRef(false)
  const finished = useRef(false)
  const timer = useRef<number | null>(null)
  // The callback changes identity every time the parent renders; the read must
  // not be restarted (or cancelled) because of it.
  const finish = useRef(onFinished)
  finish.current = onFinished

  const settle = useCallback((next: HealthWriteBackCheckResult) => {
    if (finished.current) return
    finished.current = true
    if (timer.current !== null) window.clearTimeout(timer.current)
    finish.current(next)
  }, [])

  // A check that could not run has no day-by-day lines to show, only a reason.
  const failWith = useCallback(
    (summary: WritebackCheckSummary) =>
      settle({ headline: summary.headline, rows: [] }),
    [settle]
  )

  useEffect(() => {
    if (started.current) return

    timer.current = window.setTimeout(() => {
      // Nothing is left to wait for: the log never landed, or the read of the
      // store never came back. Either way this says so instead of pulsing.
      failWith(
        settled
          ? unreadableStoreCheck(healthProviderLabel(), "unknown")
          : unreadableLogCheck()
      )
    }, CHECK_TIMEOUT_MS)

    // Clearing the timer is all the cleanup ever does. It must not cancel the
    // read: dropping the answer is exactly the bug this shape replaces.
    const stopClock = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }

    if (!settled) return stopClock

    started.current = true

    void (async () => {
      const read = await readHealthDailyMetrics({
        daysBack: CHECK_DAYS + 1,
        metrics: ["dietaryEnergyKcal", "hydrationMl"],
      })
      if (finished.current) return
      if (read.reason) {
        failWith(unreadableStoreCheck(healthProviderLabel(), read.reason))
        return
      }
      const byDate = new Map(read.days.map((day) => [day.date, day]))
      const rows: WritebackDayCheck[] = dayKeys.map((date) => {
        const food = foodQueries[date] as
          | {
              date: string
              entries?: (HealthNutritionItemSource & {
                hydrationMl?: number
              })[]
            }[]
          | Error
          | undefined
        const water = waterQueries[date] as { amountMl: number }[] | Error | undefined
        const entries =
          (food instanceof Error ? undefined : food?.find((doc) => doc.date === date)?.entries) ??
          []
        // The same rounded items the push sends, not the raw entries: two
        // 100.4 kcal meals land as 100 + 100, and rounding the unrounded sum
        // reported a day that had every record as "less than sent".
        const appKcal = toHealthNutritionItems(entries).reduce(
          (sum, item) => sum + item.calories,
          0
        )
        const appWaterMl =
          water instanceof Error || !water
            ? 0
            : hydrationOn
              ? dayHydrationMl(water, entries)
              : 0
        const store = byDate.get(date)
        return {
          date,
          appKcal,
          appWaterMl,
          storeKcal: numberOrNull(store?.dietaryEnergyKcal),
          storeWaterMl: numberOrNull(store?.hydrationMl),
        }
      })
      const summary: WritebackCheckSummary = summariseWritebackChecks(
        rows,
        healthProviderLabel()
      )
      settle({ headline: summary.headline, rows })
    })()

    return stopClock
  }, [settled, dayKeys, settle, failWith, hydrationOn])

  return (
    <div className="px-[var(--app-page-x)]">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-3/5 animate-pulse rounded-full bg-foreground" />
      </div>
      <p className="native-row-detail mt-2">
        {tr("Reading the last week back…")}
      </p>
    </div>
  )
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
