import { describe, expect, test } from "bun:test"
import { deepLinkToPath } from "../deep-links"

describe("deepLinkToPath", () => {
  test("maps the widget destinations", () => {
    expect(deepLinkToPath("onerep://today")).toBe("/")
    expect(deepLinkToPath("onerep://workouts")).toBe("/workouts")
    expect(deepLinkToPath("onerep://nutrition")).toBe("/nutrition")
  })

  test("preserves the query string the live status actions rely on", () => {
    expect(deepLinkToPath("onerep://workout?slot=2&liveAction=complete")).toBe(
      "/workout/active?slot=2&liveAction=complete"
    )
    expect(deepLinkToPath("onerep://workout?slot=1&liveAction=skipRest")).toBe(
      "/workout/active?slot=1&liveAction=skipRest"
    )
  })

  test("leaves the auth callback to auth-redirects", () => {
    expect(deepLinkToPath("onerep://auth?code=abc")).toBeNull()
  })

  test("ignores foreign schemes and unknown hosts", () => {
    expect(deepLinkToPath("https://app.onerep.life/workout")).toBeNull()
    expect(deepLinkToPath("onerep://not-a-route")).toBeNull()
    expect(deepLinkToPath("not a url")).toBeNull()
  })

  test("handles the single-slash form some platforms deliver", () => {
    expect(deepLinkToPath("onerep:/nutrition")).toBe("/nutrition")
  })
})
