/**
 * A week of water, split into the two things it actually came from.
 *
 * Today's card can say "includes 330 ml from drinks you counted" because it holds
 * one day. A week cannot: by Thursday nobody remembers which of those millilitres
 * were coffee. So this sums the same rule over several days and reports the two
 * halves — the glass half and the counted-drink half — which is the only version
 * of "how much of my water came from drinks" that is answerable honestly.
 *
 * The arithmetic goes through the day helper rather than summing `amountMl` here,
 * and the glass half is the total *minus* the drinks, so the two halves can never
 * add up to something other than the total they came from.
 */

import {
  dayHydrationMl,
  drinksHydrationMl,
  type HydrationDay,
} from "./hydration"

export type HydrationWeek = {
  /** Days in the window that carried any water at all. */
  days: number
  totalMl: number
  fromDrinksMl: number
  /**
   * Derived by subtraction rather than summed, so `fromDrinksMl + fromGlassesMl`
   * is always exactly `totalMl`.
   */
  fromGlassesMl: number
  /** Drinks as a whole percent of the week's water, 0 when there was none. */
  drinkPercent: number
}

export function hydrationWeek(
  days: readonly HydrationDay[] | undefined
): HydrationWeek {
  let daysCounted = 0
  let totalMl = 0
  let fromDrinksMl = 0

  for (const day of days ?? []) {
    const dayTotal = dayHydrationMl(day.water, day.food)
    // A day with nothing logged is not a day of zero water; it is a day with
    // nothing to say, and averaging it in would read as a slump.
    if (dayTotal <= 0) continue
    daysCounted += 1
    totalMl += dayTotal
    fromDrinksMl += drinksHydrationMl(day.food)
  }

  return {
    days: daysCounted,
    totalMl,
    fromDrinksMl,
    fromGlassesMl: totalMl - fromDrinksMl,
    drinkPercent: totalMl > 0 ? Math.round((fromDrinksMl / totalMl) * 100) : 0,
  }
}

/**
 * Whether the week has anything worth saying.
 *
 * Needs more than one day of water — a single logged day is "today", which the
 * card above already answers — and at least one counted drink, because a week of
 * glasses only has no split to report and a line saying "0% drinks" would be
 * noise on the screen of everyone who never counts a drink.
 */
export function hasDrinkSplit(week: HydrationWeek | null | undefined): boolean {
  return !!week && week.days > 1 && week.fromDrinksMl > 0
}
