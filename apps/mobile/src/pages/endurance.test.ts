import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SOURCE = readFileSync(
  new URL("./Endurance.tsx", import.meta.url),
  "utf8"
)

describe("endurance tab", () => {
  test("uses the shared hold-to-start training hero", () => {
    expect(SOURCE).toContain("HoldToStartDial")
    expect(SOURCE).toContain("TrainingStatDial")
    expect(SOURCE).toContain("Hold to start GPS recording.")
  })

  test("offers independent run, ride and swim views", () => {
    expect(SOURCE).toContain('type Sport = "run" | "ride" | "swim"')
    expect(SOURCE).toContain('aria-label="Activity type"')
  })

  test("allows weekly distance, time and session goals", () => {
    expect(SOURCE).toContain("api.users.users.setEnduranceGoals")
    expect(SOURCE).toContain('label="Distance"')
    expect(SOURCE).toContain('label="Time"')
    expect(SOURCE).toContain('label="Sessions"')
  })
})
