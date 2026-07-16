import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const APP_SOURCE = readFileSync(new URL("./App.tsx", import.meta.url), "utf8")

describe("home loading state contract", () => {
  test("today loading state includes visible explanatory copy", () => {
    expect(APP_SOURCE).toContain('aria-label="Loading today"')
    expect(APP_SOURCE).toContain("animate-spin")
  })
})
