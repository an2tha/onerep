import { describe, expect, test } from "bun:test"
import { normalizeServerInput } from "../server-config"

describe("normalizeServerInput", () => {
  test("a bare IP gets the self-hosted default ports", () => {
    expect(normalizeServerInput("192.168.1.42")).toEqual({
      input: "192.168.1.42",
      convexUrl: "http://192.168.1.42:3210",
      convexSiteUrl: "http://192.168.1.42:3211",
    })
  })

  test("an explicit port pins the API and site to adjacent ports", () => {
    expect(normalizeServerInput("192.168.50.53:4210")).toEqual({
      input: "192.168.50.53:4210",
      convexUrl: "http://192.168.50.53:4210",
      convexSiteUrl: "http://192.168.50.53:4211",
    })
  })

  test("an https hostname keeps its scheme", () => {
    expect(normalizeServerInput("https://convex.example.com:3210")).toEqual({
      input: "https://convex.example.com:3210",
      convexUrl: "https://convex.example.com:3210",
      convexSiteUrl: "https://convex.example.com:3211",
    })
  })

  test("a convex.cloud deployment maps to its convex.site twin", () => {
    expect(
      normalizeServerInput("https://happy-otter-123.convex.cloud")
    ).toEqual({
      input: "https://happy-otter-123.convex.cloud",
      convexUrl: "https://happy-otter-123.convex.cloud",
      convexSiteUrl: "https://happy-otter-123.convex.site",
    })
  })

  test("surrounding whitespace is tolerated", () => {
    expect(normalizeServerInput("  192.168.1.42  ")?.convexUrl).toBe(
      "http://192.168.1.42:3210"
    )
  })

  test("garbage and non-http schemes are rejected", () => {
    expect(normalizeServerInput("")).toBeNull()
    expect(normalizeServerInput("   ")).toBeNull()
    expect(normalizeServerInput("not a url at all")).toBeNull()
    expect(normalizeServerInput("ftp://192.168.1.42")).toBeNull()
  })

  test("a port at the top of the range cannot overflow", () => {
    expect(normalizeServerInput("192.168.1.42:65535")).toBeNull()
  })
})
