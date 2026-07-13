import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const PROGRESS_SOURCE = readFileSync(
  new URL("./Progress.tsx", import.meta.url),
  "utf8"
)
const COACH_SOURCE = readFileSync(
  new URL("./Coach.tsx", import.meta.url),
  "utf8"
)

function expect(value: string) {
  return {
    toContain(expected: string) {
      assert.ok(
        value.includes(expected),
        `Expected source to contain ${expected}`
      )
    },
    not: {
      toContain(expected: string) {
        assert.ok(
          !value.includes(expected),
          `Expected source not to contain ${expected}`
        )
      },
    },
  }
}

describe("Progress page accessibility contract", () => {
  test("progress page reads the existing body, workout, food, and goal data", () => {
    expect(PROGRESS_SOURCE).toContain("api.bodyProgress.list")
    expect(PROGRESS_SOURCE).toContain("api.logs.workouts.getHistory")
    expect(PROGRESS_SOURCE).toContain("api.logs.foodLogs.getRecent")
    expect(PROGRESS_SOURCE).toContain("api.users.users.getEffectiveGoals")
    expect(PROGRESS_SOURCE).not.toContain("return null")
  })

  test("weekly visual summaries have accessible chart and navigation labels", () => {
    expect(PROGRESS_SOURCE).toContain(
      'aria-label="Seven-day nutrition chart. Orange bars show calories as a percentage of the daily target. Purple dots mark days reaching at least 90 percent of the protein target."'
    )
    expect(PROGRESS_SOURCE).toContain(
      'aria-label="Seven-day training chart. Purple bar height represents completed sets for each day."'
    )
    expect(PROGRESS_SOURCE).toContain('aria-label="Progress metric"')
    expect(PROGRESS_SOURCE).toContain('label="Related history"')
    expect(PROGRESS_SOURCE).toContain("<MetricTooltip")
  })

  test("body measurements can be added from a labeled modal form", () => {
    expect(PROGRESS_SOURCE).toContain("api.bodyProgress.save")
    expect(PROGRESS_SOURCE).toContain('aria-label="Add body measurement"')
    expect(PROGRESS_SOURCE).toContain("<FormField")
    expect(PROGRESS_SOURCE).toContain("<MobileSheet")
    expect(PROGRESS_SOURCE).toContain('ariaLabel="Today’s check-in"')
    expect(PROGRESS_SOURCE).toContain('form="today-check-in-form"')
    expect(PROGRESS_SOURCE).toContain("aria-busy={savingEntry}")
    expect(PROGRESS_SOURCE).toContain('role="alert"')
  })

  test("today's check-in provides context and updates an existing daily entry", () => {
    expect(PROGRESS_SOURCE).toContain("todayMeasurement")
    expect(PROGRESS_SOURCE).toContain("previousMeasurement")
    expect(PROGRESS_SOURCE).toContain(
      "clientId: entryClientId ?? crypto.randomUUID()"
    )
    expect(PROGRESS_SOURCE).toContain(
      "Already logged · changes update this entry"
    )
    expect(PROGRESS_SOURCE).toContain("waistCm: enteredWaist")
    expect(PROGRESS_SOURCE).toContain("hipsCm: enteredHips")
    expect(PROGRESS_SOURCE).toContain("chestCm: enteredChest")
    expect(PROGRESS_SOURCE).toContain("notes: notes.trim()")
    expect(PROGRESS_SOURCE).toContain("Journal note")
    expect(PROGRESS_SOURCE).toContain("Complete check-in")
    expect(PROGRESS_SOURCE).toContain("Update check-in")
  })

  test("check-in modal uses compact journal geometry", () => {
    expect(PROGRESS_SOURCE).toContain('minHeight="0"')
    expect(PROGRESS_SOURCE).toContain('maxHeight="88vh"')
    expect(PROGRESS_SOURCE).toContain(
      'panelClassName="!w-[calc(100%_-_1.5rem)] !max-w-[42rem]"'
    )
    expect(PROGRESS_SOURCE).toContain("sm:px-6")
  })

  test("Coach today's check-in opens the Progress check-in form", () => {
    expect(COACH_SOURCE).toContain('navigate("/progress?checkIn=1"')
    expect(COACH_SOURCE).toContain("Today’s check-in")
    expect(PROGRESS_SOURCE).toContain('searchParams.get("checkIn") === "1"')
  })

  test("progress stays compact and does not restore the text-heavy legacy editor", () => {
    expect(PROGRESS_SOURCE).not.toContain("Progress photo")
    expect(PROGRESS_SOURCE).not.toContain("Save check-in")
    expect(PROGRESS_SOURCE).not.toContain("Metric library")
  })
})
