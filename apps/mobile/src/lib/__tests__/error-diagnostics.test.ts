import { describe, expect, test } from "bun:test"
import {
  buildErrorDiagnostics,
  copyTextToClipboard,
} from "../error-diagnostics"

describe("error diagnostics", () => {
  test("builds a stable crash report without storage or account data", () => {
    const error = new TypeError("Crash")
    error.stack = "TypeError: Crash\n    at App"

    const diagnostics = JSON.parse(
      buildErrorDiagnostics(error, {
        componentStack: "at Foods",
        date: new Date("2026-01-05T09:30:00.000Z"),
        label: "Foods",
        locationPath: "/foods",
        userAgent: "Test Browser",
      })
    )

    expect(diagnostics).toEqual({
      app: "OneRep",
      capturedAt: "2026-01-05T09:30:00.000Z",
      componentStack: "at Foods",
      error: {
        message: "Crash",
        name: "TypeError",
        stack: "TypeError: Crash\n    at App",
      },
      label: "Foods",
      path: "/foods",
      userAgent: "Test Browser",
    })
  })

  test("copies text when the clipboard is available", async () => {
    const writes: string[] = []

    await expect(
      copyTextToClipboard("diagnostics", {
        writeText: async (value) => {
          writes.push(value)
        },
      })
    ).resolves.toBe(true)

    expect(writes).toEqual(["diagnostics"])
  })

  test("reports unavailable clipboard instead of throwing", async () => {
    await expect(copyTextToClipboard("diagnostics", null)).resolves.toBe(false)
    await expect(
      copyTextToClipboard("diagnostics", {
        writeText: async () => {
          throw new Error("blocked")
        },
      })
    ).resolves.toBe(false)
  })
})
