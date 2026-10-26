import { tr } from "@repo/ui/i18n"
/**
 * Re-pushes the past week's foods and hydration to the health store, replacing
 * whatever earlier versions of the app left there.
 *
 * Why this exists: builds before the native upsert fix filed every writeback
 * push as a NEW record, and Health Connect aggregates by summing — so a day
 * logged three times can read three days' worth of food. The fix stops future
 * stacking; this repair washes out the past. Each Health Connect day is
 * cleaned once via deleteDailyRecords and then re-written as its own named
 * meals plus water —
 * so one pass leaves each day correct, and legible. A refused cleanup or write
 * is counted and its reason reported, because a bare "refused" sends nobody
 * anywhere.
 *
 * The queries live in a child component that only mounts once the user arms
 * the repair — this convex version's `useQueries` has no skip, so gating by
 * mount is what keeps fourteen queries off the wire during normal Settings
 * browsing.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useQueries } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { PrimaryButton } from "@repo/ui"
import {
  saveHealthNutritionItems,
  deleteHealthDailyRecords,
  healthStoreNeedsDailyCleanup,
  type HealthWriteFailure,
} from "@/lib/health-provider"
import {
  toHealthNutritionItems,
  type HealthNutritionItemSource,
} from "@/lib/health-nutrition-items"
import { healthWriteFailureMessage } from "@/lib/health-write-report"
import {
  beginHealthSync,
  endHealthSync,
  recordSyncActivity,
  setHealthSyncPhase,
} from "@/lib/health-sync-status"
import { localDateKey } from "@/lib/utils"
import { dayHydrationMl } from "@/lib/hydration"

/** How far back the repair reaches. */
const REPAIR_DAYS = 7

function offsetKey(daysBack: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  return localDateKey(d)
}

export function HealthWriteBackRepair({ disabled }: { disabled?: boolean }) {
  const [armed, setArmed] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)

  if (armed) {
    return (
      <RepairRunner
        onFinished={(result) => {
          setArmed(false)
          setSummary(
            result === null
              ? "Repair couldn't read the past week's logs. Try again."
              : [
                  tr(
                    "Repair re-wrote {{value0}} day{{value1}} ({{value2}} values{{value3}}).",
                    {
                      value0: result.days,
                      value1: result.days === 1 ? "" : "s",
                      value2: result.writes,
                      value3:
                        result.failures > 0
                          ? tr(", {{value0}} refused", {
                              value0: result.failures,
                            })
                          : "",
                    }
                  ),
                  // Why it was refused, in the store's own terms, when the
                  // store said — the count alone leaves nothing to act on.
                  result.reason ? healthWriteFailureMessage(result.reason) : null,
                ]
                  .filter(Boolean)
                  .join(" ")
          )
        }}
      />
    )
  }

  return (
    <>
      <PrimaryButton
        className="w-full"
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {tr("Repair last week's written meals")}
      </PrimaryButton>
      {summary && (
        <p className="native-row-detail px-[var(--app-page-x)]">{summary}</p>
      )}
    </>
  )
}

type RepairSummary = {
  days: number
  writes: number
  failures: number
  /** Why the first refusal happened, when the store said. */
  reason?: HealthWriteFailure
}

type DayPayload = {
  date: string
  /** The day's foods, named, as the store takes them. */
  items: ReturnType<typeof toHealthNutritionItems>
  waterMl: number
}

function RepairRunner({
  onFinished,
}: {
  onFinished: (result: RepairSummary | null) => void
}) {
  const dayKeys = useMemo(
    () => Array.from({ length: REPAIR_DAYS }, (_, i) => offsetKey(i)),
    []
  )

  // Object form — this convex version's useQueries takes a keyed record and
  // has no skip sentinel, hence the arm-then-mount gating above.
  const foodQueries = useQueries(
    useMemo(
      () =>
        Object.fromEntries(
          dayKeys.map((date) => [
            date,
            {
              query: api.logs.foodLogs.getRange,
              args: { start: date, end: date },
            },
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

  // loading → writing → done. The snapshot for the writes is taken exactly
  // once, at the loading→writing transition, so the loop can never mix a
  // later re-render's data into an in-flight push.
  const [phase, setPhase] = useState<"loading" | "writing" | "done">("loading")
  const [snapshot, setSnapshot] = useState<DayPayload[] | null>(null)
  const [progress, setProgress] = useState(0)
  const readErrorsRef = useRef(0)
  const timedOutRef = useRef(false)

  // Every key must be a loaded value or an Error — undefined means the query
  // is still in flight and pushing now could file a day as empty. If the
  // device has lost connectivity the queries can stay undefined forever, so
  // a real timer owns the abort: render-triggered checks alone would never
  // fire, because nothing re-renders when nothing arrives.
  useEffect(() => {
    if (phase !== "loading") return
    timedOutRef.current = false
    const timer = window.setTimeout(() => {
      timedOutRef.current = true
      onFinished(null)
    }, 20_000)
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== "loading" || timedOutRef.current) return

    const allSettled = dayKeys.every(
      (key) => foodQueries[key] !== undefined && waterQueries[key] !== undefined
    )
    if (!allSettled) return
    let readErrors = 0
    const payloads: DayPayload[] = dayKeys.map((date) => {
      const food = foodQueries[date]
      const water = waterQueries[date]
      if (food instanceof Error || water instanceof Error) {
        readErrors += 1
        return { date, items: [], waterMl: 0 }
      }
      const entries =
        (
          food as {
            date: string
            entries: (HealthNutritionItemSource & { hydrationMl?: number })[]
          }[]
        )?.find((doc) => doc.date === date)?.entries ?? []
      // The day's hydration as every other surface reads it, drinks included:
      // a repair that pushed only the water rows would leave health disagreeing
      // with the app about the same day, which is the whole reason there is one
      // rule rather than five.
      const waterMl = dayHydrationMl(
        water as { amountMl: number }[] | undefined,
        entries
      )
      return { date, items: toHealthNutritionItems(entries), waterMl }
    })
    readErrorsRef.current = readErrors
    setSnapshot(payloads)
    setPhase("writing")
    // One-shot transition; the reactive query maps only matter until the
    // snapshot exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, dayKeys, foodQueries, waterQueries])

  useEffect(() => {
    if (phase !== "writing" || !snapshot) return
    let cancelled = false

    async function writeAll() {
      beginHealthSync("Reading the past week's logs…")
      const summary: RepairSummary = { days: 0, writes: 0, failures: 0 }
      summary.failures += readErrorsRef.current

      for (let i = 0; i < snapshot!.length; i++) {
        if (cancelled) return
        const { date, items, waterMl } = snapshot![i]
        setHealthSyncPhase(
          i === 0
            ? "Rewriting today…"
            : tr("Rewriting {{value0}}…", { value0: date })
        )
        setProgress(i)

        const hadNutrition = items.length > 0
        const hadWater = waterMl > 0
        if (hadNutrition || hadWater) {
          // Wash the day once before re-writing it: older builds filed a
          // record per metric per push, so one day can hold several days' worth
          // of food. The replacement is the day's own foods, written over the
          // cleared day — so clean, then write, and the day ends up right
          // either way.
          //
          // Only where the store has to be told to wash the day. Apple Health
          // deletes the day's own samples inside the items write, so asking
          // there would fail every day on a store that had already done it.
          //
          // A failed cleanup is a failed day, never a silent overwrite: on an
          // older native shell without deleteDailyRecords the replacement
          // writes would join the legacy records instead of replacing them,
          // inflating the totals while the UI reported the day repaired.
          const cleanup = healthStoreNeedsDailyCleanup()
            ? await deleteHealthDailyRecords({
                date,
                metrics: [
                  "dietaryEnergyKcal",
                  "dietaryProteinG",
                  "dietaryCarbsG",
                  "dietaryFatG",
                  "hydrationMl",
                ],
              })
            : { deleted: true as const }
          if (!cleanup.deleted) {
            summary.failures += 1
            summary.reason = summary.reason ?? cleanup.reason
            continue
          }
          const result = await saveHealthNutritionItems({
            date,
            items,
            ...(hadWater ? { waterMl: Math.round(waterMl) } : {}),
          })
          if (result.saved) summary.writes += 1
          else {
            summary.failures += 1
            summary.reason = summary.reason ?? result.reason
          }
          summary.days += 1
        } else if (!cancelled) {
          // A day with no logged food or water still may have stacked Health
          // Connect records from an older build. Delete them so the day ends
          // empty — writing zero-value NutritionRecords would file
          // meaningless records instead of cleaning. A refused cleanup on a
          // day we would have counted as done still is a failure: the day
          // was not verified empty.
          const cleanup = await deleteHealthDailyRecords({
            date,
            metrics: [
              "dietaryEnergyKcal",
              "dietaryProteinG",
              "dietaryCarbsG",
              "dietaryFatG",
              "hydrationMl",
            ],
          })
          if (cleanup.deleted) summary.days += 1
          else {
            summary.failures += 1
            summary.reason = summary.reason ?? cleanup.reason
          }
        }
      }

      if (cancelled) return
      recordSyncActivity(
        summary.failures === 0
          ? "Repair re-pushed the past week"
          : tr("Repair finished, {{value0}} write{{value1}} refused", {
              value0: summary.failures,
              value1: summary.failures === 1 ? "" : "s",
            }),
        summary.writes
      )
      setProgress(snapshot!.length)
      endHealthSync({ error: null })
      setPhase("done")
      onFinished(summary)
    }

    void writeAll()
    return () => {
      cancelled = true
      // If the runner unmounts mid-write, end the persisted status so the
      // Health & Wearables page does not stay "syncing" for the rest of the
      // process.
      endHealthSync({ error: "Repair cancelled" })
    }
    // onFinished is a setState-wrapping closure from the parent; it is stable
    // enough for a one-shot run and must not restart the writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, snapshot])

  return (
    <div className="px-[var(--app-page-x)]">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-300"
          style={{ width: `${Math.round((progress / REPAIR_DAYS) * 100)}%` }}
        />
      </div>
      <p className="native-row-detail mt-2">{tr("Re-pushing the week's meals…")}</p>
    </div>
  )
}
