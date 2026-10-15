export type PendingWaterEntry = {
  id: string
  date: string
  amountMl: number
}

/**
 * What the still-queued pours for one date add up to.
 *
 * Separate from the day's hydration on purpose: these are local entries the
 * server has not acknowledged yet, so they are added to the server figure rather
 * than read as part of it. Kept here — next to the queue's own bookkeeping — so
 * nothing has to reach into an entry's `amountMl` to show a day in progress.
 */
export function pendingWaterMl(
  pending: readonly PendingWaterEntry[],
  date: string
): number {
  return pending
    .filter((entry) => entry.date === date)
    .reduce((sum, entry) => sum + entry.amountMl, 0)
}

/** Other entries and other dates cannot acknowledge a queued pour. */
export function reconcilePendingWater(
  pending: readonly PendingWaterEntry[],
  date: string,
  serverEntries: readonly { id: string }[]
): PendingWaterEntry[] {
  const confirmedIds = new Set(serverEntries.map((entry) => entry.id))
  return pending.filter(
    (entry) => entry.date !== date || !confirmedIds.has(entry.id)
  )
}
