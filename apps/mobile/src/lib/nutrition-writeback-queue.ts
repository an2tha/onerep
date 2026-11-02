import type {
  HealthNutritionItemsWrite,
  HealthWriteResult,
} from "./health-provider"

type DaySnapshot = {
  date: string
  items: HealthNutritionItemsWrite["items"] | undefined
  waterMl?: number
  hydrationEnabled: boolean
}

type DayState = {
  nutrition: boolean
  water: boolean
  pending?: DaySnapshot
  running?: Promise<void>
}

/** Serialize each account's day so a late save cannot overwrite its deletion. */
export function createNutritionWriteQueue(
  save: (options: HealthNutritionItemsWrite) => Promise<HealthWriteResult>
) {
  const days = new Map<string, DayState>()

  return async (accountId: string, snapshot: DaySnapshot): Promise<void> => {
    // Undefined means loading or a dashboard viewing another day, never empty.
    if (snapshot.items === undefined) return
    const key = JSON.stringify([accountId, snapshot.date])
    let state = days.get(key)
    if (!state) {
      state = { nutrition: false, water: false }
      days.set(key, state)
    }
    state.pending = snapshot
    if (state.running) return state.running

    const drain = async () => {
      while (state.pending) {
        const next = state.pending
        state.pending = undefined
        const items = next.items!
        const wantsNutrition = items.length > 0
        const waterMl = next.hydrationEnabled
          ? Math.max(0, Math.round(next.waterMl ?? 0))
          : 0
        const clearNutrition = !wantsNutrition && state.nutrition
        const clearWater =
          next.hydrationEnabled &&
          next.waterMl !== undefined &&
          waterMl === 0 &&
          state.water
        if (!wantsNutrition && waterMl === 0 && !clearNutrition && !clearWater)
          continue

        const result = await save({
          date: next.date,
          items,
          ...(waterMl > 0 ? { waterMl } : {}),
          ...(clearNutrition ? { clearNutrition: true } : {}),
          ...(clearWater ? { clearWater: true } : {}),
        })
        if (result.saved) {
          state.nutrition = wantsNutrition
          if (next.hydrationEnabled && next.waterMl !== undefined) {
            state.water = waterMl > 0
          }
        }
      }
    }
    state.running = Promise.resolve().then(drain)
    try {
      await state.running
    } finally {
      state.running = undefined
    }
  }
}
