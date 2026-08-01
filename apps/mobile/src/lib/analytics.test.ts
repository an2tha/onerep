import { describe, expect, test } from "bun:test"
import { captureFeatureUsage } from "./analytics"

describe("analytics consent boundary", () => {
  test("suppresses calls while opted out or unset", () => {
    const events: string[] = []
    const client = { capture: (event: string) => events.push(event) }
    const unset = { getItem: () => null }
    const optedOut = { getItem: () => "false" }

    expect(captureFeatureUsage(client, "feature_used", {}, unset)).toBe(false)
    expect(captureFeatureUsage(client, "feature_used", {}, optedOut)).toBe(false)
    expect(events).toEqual([])
  })

  test("captures only after explicit opt-in", () => {
    const events: string[] = []
    const client = { capture: (event: string) => events.push(event) }
    const optedIn = { getItem: () => "true" }

    expect(captureFeatureUsage(client, "feature_used", {}, optedIn)).toBe(true)
    expect(events).toEqual(["feature_used"])
  })
})

