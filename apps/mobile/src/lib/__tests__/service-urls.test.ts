import { describe, expect, test } from "bun:test"
import { absoluteHttpUrl, resolveConvexSiteUrl } from "../service-urls"

describe("service URLs", () => {
  test("rejects empty, relative, and non-http addresses", () => {
    expect(absoluteHttpUrl("")).toBeUndefined()
    expect(absoluteHttpUrl("/api/auth")).toBeUndefined()
    expect(absoluteHttpUrl("onerep://auth")).toBeUndefined()
  })

  test("normalizes absolute addresses", () => {
    expect(absoluteHttpUrl(" https://example.test/ ")).toBe(
      "https://example.test"
    )
  })

  test("derives the Convex HTTP Actions site from its deployment URL", () => {
    expect(
      resolveConvexSiteUrl(undefined, "https://happy-otter-123.convex.cloud")
    ).toBe("https://happy-otter-123.convex.site")
  })

  test("prefers an explicitly configured site URL", () => {
    expect(
      resolveConvexSiteUrl(
        "https://auth.example.test",
        "https://happy-otter-123.convex.cloud"
      )
    ).toBe("https://auth.example.test")
  })
})
