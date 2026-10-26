import { tr, uiLocale } from "@repo/ui/i18n"

import type { HealthWriteFailure } from "./health-provider"

/**
 * Reading a day back out of the health store to see whether it took it.
 *
 * The write-back has no receipt: the store accepts records it never mentions
 * again, and refuses others without telling anybody, so "is my food in there"
 * has always been unanswerable from inside the app. This is the answer — the
 * app's own total for a day beside the store's.
 *
 * It is deliberately one-directional. The store sums nutrition from every app,
 * so a number at least as large as ours is good evidence ours is in there, and
 * a day the store has nothing for while our log has something is the signature
 * of a write that never landed. What it cannot do is *attribute* a number: the
 * store does not say which app each gram came from, so a match is confirmation
 * rather than proof, and the copy says so.
 */

export type WritebackDayCheck = {
  date: string
  /** What OneRep's own log holds for the day. */
  appKcal: number
  appWaterMl: number
  /** What the store reports for the day, from every app, or null for nothing. */
  storeKcal: number | null
  storeWaterMl: number | null
}

export type WritebackVerdict =
  /** The store holds at least what we wrote. */
  | "landed"
  /** We had something to write and the store holds none of it. */
  | "missing"
  /** The store holds some, but less than we wrote. */
  | "partial"
  /** The day is empty in OneRep, so there was nothing to check. */
  | "nothing-to-write"

export function writebackVerdict(day: WritebackDayCheck): WritebackVerdict {
  if (day.appKcal <= 0 && day.appWaterMl <= 0) return "nothing-to-write"
  const storeKcal = day.storeKcal ?? 0
  const storeWater = day.storeWaterMl ?? 0
  const foodLanded = day.appKcal <= 0 || storeKcal >= day.appKcal
  const waterLanded = day.appWaterMl <= 0 || storeWater >= day.appWaterMl
  if (foodLanded && waterLanded) return "landed"
  // Something is there, just not as much as we wrote: a partial write, or a
  // stale one from a build that filed the day several times over.
  if (storeKcal > 0 || storeWater > 0) return "partial"
  return "missing"
}

/** The part of a day's check worth reading: our number, then the store's. */
export function describeDayCheck(
  day: WritebackDayCheck,
  storeLabel: string
): string {
  const ours = tr("{{value0}} kcal", {
    value0: day.appKcal.toLocaleString(uiLocale()),
  })
  const theirs =
    day.storeKcal === null
      ? tr("nothing")
      : tr("{{value0}} kcal", {
          value0: day.storeKcal.toLocaleString(uiLocale()),
        })
  switch (writebackVerdict(day)) {
    case "landed":
      return tr("OneRep {{value0}} · {{value1}} {{value2}} ✓", {
        value0: ours,
        value1: storeLabel,
        value2: theirs,
      })
    case "partial":
      return tr("OneRep {{value0}} · {{value1}} {{value2}} — less than sent", {
        value0: ours,
        value1: storeLabel,
        value2: theirs,
      })
    case "missing":
      return tr("OneRep {{value0}} · {{value1}} has {{value2}}", {
        value0: ours,
        value1: storeLabel,
        value2: theirs,
      })
    default:
      return tr("Nothing logged in OneRep")
  }
}

/**
 * The check could not run, and no verdict may be drawn from that.
 *
 * Both of these exist because the honest answer to "what does the store hold?"
 * is sometimes "nobody got far enough to ask". An empty read rendered as a
 * verdict is the exact mistake this feature was built to stop — it would have
 * accused the store of losing a week of food the app had never managed to
 * compare.
 */
export function unreadableStoreCheck(
  storeLabel: string,
  reason?: HealthWriteFailure
): WritebackCheckSummary {
  return {
    checked: 0,
    landed: 0,
    missing: 0,
    partial: 0,
    headline:
      reason === "no_permission"
        ? tr(
            "{{value0}} would not give up its totals, so nothing was compared. Allow OneRep to read your food and water and try again.",
            { value0: storeLabel }
          )
        : tr(
            "{{value0}} did not answer the read, so nothing was compared. Try again in a moment.",
            { value0: storeLabel }
          ),
  }
}

/** The same, for OneRep's own log failing to load. */
export function unreadableLogCheck(): WritebackCheckSummary {
  return {
    checked: 0,
    landed: 0,
    missing: 0,
    partial: 0,
    headline: tr(
      "Your log did not load, so there was nothing to compare. Try again in a moment."
    ),
  }
}

export type WritebackCheckSummary = {
  /** Days that had something to write. */
  checked: number
  landed: number
  missing: number
  partial: number
  headline: string
}

/**
 * The one line above the per-day detail.
 *
 * Phrased as what was found, never as a promise about what will happen — and it
 * names the likely cause when days are missing, because the answer to "why" is
 * almost always the permission, and the write-access row above is where the fix
 * is.
 */
export function summariseWritebackChecks(
  days: readonly WritebackDayCheck[],
  storeLabel: string
): WritebackCheckSummary {
  const verdicts = days.map(writebackVerdict)
  const checked = verdicts.filter((verdict) => verdict !== "nothing-to-write").length
  const landed = verdicts.filter((verdict) => verdict === "landed").length
  const missing = verdicts.filter((verdict) => verdict === "missing").length
  const partial = verdicts.filter((verdict) => verdict === "partial").length

  let headline: string
  if (checked === 0) {
    headline = tr(
      "Nothing logged in the last week, so there is nothing to check."
    )
  } else if (landed === checked) {
    headline = tr("{{value0}} holds the last {{value1}} logged day{{value2}}.", {
      value0: storeLabel,
      value1: landed,
      value2: landed === 1 ? "" : "s",
    })
  } else if (missing === checked) {
    headline = tr(
      "{{value0}} holds none of the last {{value1}} logged day{{value2}}. If the row above says write access is granted, the store is refusing the records themselves.",
      {
        value0: storeLabel,
        value1: checked,
        value2: checked === 1 ? "" : "s",
      }
    )
  } else {
    headline = tr(
      "{{value0}} is missing or short on {{value1}} of the last {{value2}} logged day{{value3}}.",
      {
        value0: storeLabel,
        value1: missing + partial,
        value2: checked,
        value3: checked === 1 ? "" : "s",
      }
    )
  }

  return { checked, landed, missing, partial, headline }
}
