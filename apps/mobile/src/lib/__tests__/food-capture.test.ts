import { describe, expect, test } from "bun:test"
import {
  canStartFoodCapture,
  foodCapturePath,
  foodCaptureUnavailableCopy,
  parseFoodCaptureMode,
} from "../food-capture"

describe("food capture helpers", () => {
  test("parses supported camera modes and falls back to snap", () => {
    expect(parseFoodCaptureMode("barcode")).toBe("barcode")
    expect(parseFoodCaptureMode("snap")).toBe("snap")
    expect(parseFoodCaptureMode("")).toBe("snap")
    expect(parseFoodCaptureMode("meal")).toBe("snap")
    expect(parseFoodCaptureMode(null)).toBe("snap")
    expect(parseFoodCaptureMode(undefined)).toBe("snap")
  })

  test("builds explicit camera routes for each capture mode", () => {
    expect(foodCapturePath("barcode")).toBe("/camera?mode=barcode")
    expect(foodCapturePath("snap")).toBe("/camera?mode=snap")
  })

  test("allows barcode from offline entry points but blocks snap meal", () => {
    expect(canStartFoodCapture("barcode", false)).toBe(true)
    expect(canStartFoodCapture("snap", false)).toBe(false)
    expect(canStartFoodCapture("snap", true)).toBe(true)
  })

  test("explains why snap capture is unavailable offline", () => {
    const copy = foodCaptureUnavailableCopy("snap")

    expect(copy.title).toContain("offline")
    expect(copy.body).toContain("Barcode scan")
    expect(copy.body).toContain("food search")
  })
})
