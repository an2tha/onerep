import { Window } from "happy-dom"
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { HydrationTrendLine } from "../../src/components/hydration-trend-insight"
import { hydrationWeek } from "../../src/lib/hydration-trend"

const window = new Window({ url: "http://localhost" })
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "CustomEvent",
] as const)
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? window : window[key],
    configurable: true,
    writable: true,
  })

const day = (waterMl: number[], drinksMl: number[]) => ({
  water: waterMl.map((amountMl) => ({ amountMl })),
  food: drinksMl.map((hydrationMl) => ({ hydrationMl })),
})

const render = (week: ReturnType<typeof hydrationWeek>) =>
  renderToStaticMarkup(<HydrationTrendLine week={week} unit="ml" />)

test("the week says how much of it came from drinks, and how much did not", () => {
  const html = render(
    hydrationWeek([day([500], [330]), day([250], [0]), day([420], [0])])
  )
  expect(html).toContain("330 ml")
  expect(html).toContain("22%")
  // 1500 ml in total, so the glass half reads in litres as it does everywhere else.
  expect(html).toContain("1.2 L")
  expect(html).toContain("glasses and bottles")
})

test("a week of glasses only says nothing, rather than saying zero percent", () => {
  expect(render(hydrationWeek([day([500], []), day([750], [])]))).toBe("")
})

test("one logged day is today's card, not a trend", () => {
  expect(render(hydrationWeek([day([500], [330])]))).toBe("")
})

test("a week that was only ever drinks reads as all of it", () => {
  const html = render(hydrationWeek([day([], [400]), day([], [300])]))
  expect(html).toContain("700 ml")
  expect(html).toContain("100%")
  // The glasses half is present but empty, which is the honest thing to say.
  expect(html).toContain("0 ml")
})

test("nothing loaded yet renders nothing at all", () => {
  expect(render(null)).toBe("")
  expect(render(undefined)).toBe("")
})
