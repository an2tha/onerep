import { afterEach, describe, expect, test } from "bun:test"
import {
  captureFeatureUsage,
  routePattern,
  trackUmami,
  usageBucket,
} from "./analytics"

type TrackedEvent = [string, Record<string, unknown> | undefined]

function stubUmami() {
  const tracked: TrackedEvent[] = []
  globalThis.window = {
    umami: {
      track: (event: string, data?: Record<string, unknown>) =>
        tracked.push([event, data]),
    },
  } as never
  return tracked
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe("feature usage", () => {
  test("counts the event in Umami", () => {
    const tracked = stubUmami()

    expect(captureFeatureUsage("feature_used", { mode: "chat" })).toBe(true)
    expect(tracked).toEqual([["feature_used", { mode: "chat" }]])
  })
})

describe("umami payloads", () => {
  test("drops anything that is not a plain primitive", () => {
    const tracked = stubUmami()

    trackUmami("coach_request", {
      mode: "chef",
      turn: 3,
      has_image: false,
      prompt: undefined,
      history: ["what should I eat"],
      profile: { email: "someone@example.com" },
    })

    expect(tracked).toEqual([
      ["coach_request", { mode: "chef", turn: 3, has_image: false }],
    ])
  })

  test("clips long strings rather than forwarding free text", () => {
    const tracked = stubUmami()

    trackUmami("screen_crashed", { screen: "x".repeat(400) })

    expect((tracked[0][1] as { screen: string }).screen).toHaveLength(100)
  })

  test("says nothing when the script never loaded", () => {
    expect(trackUmami("screen_view", { screen: "/" })).toBe(false)
  })
})

describe("route patterns", () => {
  test("replaces params with their names so ids never leave", () => {
    expect(routePattern("/foods/review/j57abc", { id: "j57abc" })).toBe(
      "/foods/review/:id"
    )
    expect(
      routePattern("/workout/log/2026-08-09/quick", { date: "2026-08-09" })
    ).toBe("/workout/log/:date/quick")
    expect(routePattern("/coach", {})).toBe("/coach")
  })
})

describe("usage buckets", () => {
  test("describes the allowance without reporting the count", () => {
    expect(usageBucket(0, 10)).toBe("spent")
    expect(usageBucket(1, 10)).toBe("under_10pct")
    expect(usageBucket(4, 10)).toBe("under_50pct")
    expect(usageBucket(9, 10)).toBe("over_50pct")
  })
})
