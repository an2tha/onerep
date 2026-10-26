/**
 * The week's water, split into drinks and glasses, under the day's water card.
 *
 * Two pieces, because only one of them needs a query. The wrapper owns the seven
 * days of water rows and the food range and hands the result to `HydrationTrendLine`,
 * which is a plain value renderer — that is the part the tests pin down, and it
 * renders nothing at all when there is no split to report.
 */

import { Message } from "@repo/ui/i18n"
import { useMemo } from "react"
import { useQuery, useQueries } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { offsetDateKey } from "@/lib/food-log"
import {
  hasDrinkSplit,
  hydrationWeek,
  type HydrationWeek,
} from "@/lib/hydration-trend"
import { formatWater } from "@/lib/measurement-system"
import { type WaterUnit } from "@/lib/use-water-unit"

/** How far back the trend looks. A week is what people can still remember. */
const TREND_DAYS = 7

export function HydrationTrendLine({
  week,
  unit,
}: {
  week: HydrationWeek | null | undefined
  unit: WaterUnit
}) {
  if (!hasDrinkSplit(week)) return null
  const fmt = (ml: number) => formatWater(ml, unit)
  return (
    <>
      <p className="native-row-detail mt-1">
        <Message
          text={
            "This week {{value0}} of your water came from drinks you counted — {{value1}}% of it"
          }
          values={{
            value0: fmt(week!.fromDrinksMl),
            value1: week!.drinkPercent,
          }}
        />
      </p>
      <p className="native-row-detail mt-0.5 text-muted-foreground">
        <Message
          text={"The other {{value0}} came from glasses and bottles"}
          values={{ value0: fmt(week!.fromGlassesMl) }}
        />
      </p>
    </>
  )
}

/**
 * Mounted inside the water card on today's view. Nothing is rendered until every
 * query has answered: a split that appears and then changes its mind is worse
 * than one that arrives a moment late.
 */
export function HydrationTrendInsight({
  endKey,
  unit,
}: {
  /** The latest day in the window, normally today. */
  endKey: string
  unit: WaterUnit
}) {
  const dayKeys = useMemo(
    () =>
      Array.from({ length: TREND_DAYS }, (_, i) =>
        offsetDateKey(endKey, -(TREND_DAYS - 1 - i))
      ),
    [endKey]
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
  const foodRange = useQuery(api.logs.foodLogs.getRange, {
    start: dayKeys[0],
    end: dayKeys[dayKeys.length - 1],
  })

  const week = useMemo(() => {
    if (dayKeys.some((key) => waterQueries[key] === undefined)) return null
    if (foodRange === undefined) return null
    return hydrationWeek(
      dayKeys.map((key) => ({
        water:
          (waterQueries[key] as { amountMl: number }[] | undefined) ?? undefined,
        food:
          foodRange.find((doc) => doc.date === key)?.entries ?? undefined,
      }))
    )
  }, [dayKeys, waterQueries, foodRange])

  return <HydrationTrendLine week={week} unit={unit} />
}
