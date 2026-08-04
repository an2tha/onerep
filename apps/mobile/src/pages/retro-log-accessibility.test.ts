import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const RETRO_SOURCE = readFileSync(
  new URL("./ActiveWorkout.tsx", import.meta.url),
  "utf8"
)
const APP_SOURCE = readFileSync(new URL("../App.tsx", import.meta.url), "utf8")

describe("Retro log accessibility contract", () => {
  test("both retro sheets are labelled dialogs", () => {
    expect(RETRO_SOURCE).toContain('ariaLabel="Describe your workout"')
    expect(RETRO_SOURCE).toContain('ariaLabel="Save this workout"')
  })

  test("the date and duration fields are named", () => {
    expect(RETRO_SOURCE).toContain('aria-label="Workout date"')
    expect(RETRO_SOURCE).toContain('aria-label="Workout duration hours"')
    expect(RETRO_SOURCE).toContain('aria-label="Workout duration minutes"')
    expect(RETRO_SOURCE).toContain('aria-label="Time the workout finished"')
  })

  test("the description field and its entry point are named", () => {
    expect(RETRO_SOURCE).toContain('aria-label="Workout description"')
    expect(RETRO_SOURCE).toContain('aria-label="Describe your workout"')
  })

  test("the mic button announces its name and pressed state", () => {
    expect(RETRO_SOURCE).toContain(
      'aria-pressed={dictation.status === "listening"}'
    )
    expect(RETRO_SOURCE).toContain('? "Stop dictation"')
    expect(RETRO_SOURCE).toContain(': "Dictate your workout"')
  })

  test("in-flight work is announced rather than only shown", () => {
    expect(RETRO_SOURCE).toContain("aria-busy={pending}")
    expect(RETRO_SOURCE).toContain("aria-busy={saving}")
  })

  test("the Apple Health nudge names the workout each action applies to", () => {
    expect(APP_SOURCE).toContain(
      "aria-label={`Dismiss ${workout.activityName} on ${workout.date}`}"
    )
  })
})
