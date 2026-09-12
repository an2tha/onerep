export type PendingWaterEntry = {
  id: string
  date: string
  amountMl: number
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
