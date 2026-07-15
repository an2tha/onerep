import { describe, expect, test } from "bun:test"

import { REST_TIMER_OPTIONS, formatRestDuration } from "./workout-controls"

describe("workout controls", () => {
  test("formats disabled and timed rest values", () => {
    expect(formatRestDuration(0)).toBe("Off")
    expect(formatRestDuration(-1)).toBe("Off")
    expect(formatRestDuration(30)).toBe("0:30")
    expect(formatRestDuration(90)).toBe("1:30")
    expect(formatRestDuration(300)).toBe("5:00")
  })

  test("keeps rest options ordered and includes the disabled value", () => {
    expect(REST_TIMER_OPTIONS[0]).toBe(0)
    expect([...REST_TIMER_OPTIONS]).toEqual(
      [...REST_TIMER_OPTIONS].sort((left, right) => left - right)
    )
  })
})
