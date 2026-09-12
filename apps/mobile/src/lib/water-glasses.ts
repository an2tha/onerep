export const WATER_GLASS_COUNT = 8

/**
 * The cumulative millilitres that fill `glassCount` glasses.
 *
 * Rounded up, not to nearest. `filledWaterGlassCount` floors the mirrored
 * ratio, so a target rounded down lands just *below* the glass it is meant to
 * fill: with a 250 ml goal, glass one rounds to 31 ml while the grid still
 * reads zero glasses filled, and the next tap computes a 0 ml difference and
 * logs nothing. Ceiling keeps every cumulative target on its own threshold.
 */
export function waterGlassTargetMl(goalMl: number, glassCount: number): number {
  const count = Math.max(0, Math.min(WATER_GLASS_COUNT, glassCount))
  return Math.ceil((Math.max(0, goalMl) * count) / WATER_GLASS_COUNT)
}

export function filledWaterGlassCount(totalMl: number, goalMl: number): number {
  if (totalMl <= 0 || goalMl <= 0) return 0

  return Math.max(
    0,
    Math.min(
      WATER_GLASS_COUNT,
      Math.floor((totalMl / goalMl) * WATER_GLASS_COUNT + Number.EPSILON)
    )
  )
}

export function waterAmountNeededForGlass(
  totalMl: number,
  goalMl: number,
  glassCount: number
): number {
  return Math.max(0, waterGlassTargetMl(goalMl, glassCount) - totalMl)
}

/**
 * How much the next glass tap should log.
 *
 * `totalMl` is the caller's *effective* total — the server day plus whatever
 * is still queued offline — because these targets are absolute, not additive.
 * Recomputing from a stale total would log a whole extra glass per tap.
 *
 * Past the last glass the row is full, so a tap keeps the last glass's worth
 * rather than computing a difference against a cap it can never exceed.
 */
export function nextGlassAmount(
  totalMl: number,
  goalMl: number,
  filledCount: number
): number {
  if (filledCount >= WATER_GLASS_COUNT) {
    return waterGlassTargetMl(goalMl, 1)
  }

  return waterAmountNeededForGlass(totalMl, goalMl, filledCount + 1)
}
