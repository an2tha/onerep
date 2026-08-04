export const WATER_GLASS_COUNT = 8

export function waterGlassTargetMl(goalMl: number, glassCount: number): number {
  const count = Math.max(0, Math.min(WATER_GLASS_COUNT, glassCount))
  return Math.round((Math.max(0, goalMl) * count) / WATER_GLASS_COUNT)
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
