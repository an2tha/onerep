import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const MAIN_SOURCE = readFileSync(new URL("./main.tsx", import.meta.url), "utf8")

describe("mobile route fallback contract", () => {
  test("lazy route loading state renders explanatory copy", () => {
    expect(MAIN_SOURCE).toContain("Loading OneRep")
    expect(MAIN_SOURCE).toContain("Preparing your mobile workspace")
  })
})
