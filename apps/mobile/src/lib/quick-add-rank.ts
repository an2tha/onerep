/**
 * Remembers which quick actions get used, so the fan can put the one a
 * person actually reaches for at the top instead of making everybody scroll
 * past "Create a recipe" to log their lunch.
 *
 * Local on purpose. The counts are a private convenience, not telemetry —
 * nothing here leaves the device, so a rank can never leak what somebody
 * ate. Analytics stay the product-side view of the same events.
 */

import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"

const USAGE_KEY = "onerep:quick-add-usage"

export type QuickActionUsageCounts = Record<string, number>

/** How many uses each action can bank. A week of lunches outranks a phase. */
const USAGE_CAP = 50

/** Every count decays by a third each time anything is used, so last
 * week's habit cannot pin the fan forever. */
const USAGE_DECAY = 2 / 3

export function readQuickActionUsage(): QuickActionUsageCounts {
  const raw = safeLocalStorageGet(USAGE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as QuickActionUsageCounts
    if (!parsed || typeof parsed !== "object") return {}
    const counts: QuickActionUsageCounts = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        counts[key] = value
      }
    }
    return counts
  } catch {
    return {}
  }
}

/**
 * Records one use of `action`. All other counts decay first, so ordering
 * reflects the recent mix rather than the all-time tally.
 */
export function recordQuickActionUse(action: string): QuickActionUsageCounts {
  const counts = readQuickActionUsage()
  for (const key of Object.keys(counts)) {
    counts[key] = counts[key] * USAGE_DECAY
    if (counts[key] < 0.1) delete counts[key]
  }
  counts[action] = Math.min(USAGE_CAP, (counts[action] ?? 0) + 1)
  safeLocalStorageSet(USAGE_KEY, JSON.stringify(counts))
  return counts
}

/** Stable fallback order when nothing has been used yet. */
export const DEFAULT_QUICK_ADD_ORDER = [
  "food",
  "workout",
  "water",
  "fasting",
  "supplements",
  "recipes",
  "recipe-create",
] as const

/**
 * The given options ordered by remembered use. Unknown actions keep their
 * given order after the ranked ones; ties keep the given order too, so the
 * fan never reshuffles for its own amusement.
 */
export function rankQuickActions<T extends { action: string }>(
  options: readonly T[]
): T[] {
  const counts = readQuickActionUsage()
  return [...options].sort((a, b) => {
    const used = (counts[b.action] ?? 0) - (counts[a.action] ?? 0)
    if (used !== 0) return used
    const fallback =
      (DEFAULT_QUICK_ADD_ORDER as readonly string[]).indexOf(a.action) -
      (DEFAULT_QUICK_ADD_ORDER as readonly string[]).indexOf(b.action)
    return fallback
  })
}
