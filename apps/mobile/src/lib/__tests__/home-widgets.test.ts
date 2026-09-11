import { describe, expect, test } from "bun:test"
import { formatWidgetWater } from "../home-widgets"

describe("home widget water formatting", () => {
  test("keeps the total and goal in millilitres", () => {
    expect(formatWidgetWater(250, 2000, "ml")).toBe("0.25 L / 2 L")
  })

  test("converts both values to fluid ounces", () => {
    expect(formatWidgetWater(250, 2000, "fl oz")).toBe("8.5 fl oz / 67.6 fl oz")
  })

  test("uses the same two-decimal litre formatting as the water cards", () => {
    expect(formatWidgetWater(1250, 2500, "ml")).toBe("1.25 L / 2.5 L")
  })

  test("defaults legacy widget snapshots to millilitres", () => {
    expect(formatWidgetWater(1000, 2500)).toBe("1 L / 2.5 L")
  })
})
