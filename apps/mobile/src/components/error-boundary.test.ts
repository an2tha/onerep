import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SOURCE = readFileSync(
  new URL("./error-boundary.tsx", import.meta.url),
  "utf8"
)

describe("error boundary recovery UI", () => {
  test("offers retry and copyable diagnostics", () => {
    expect(SOURCE).toContain("Try again")
    expect(SOURCE).toContain("Copy diagnostics")
    expect(SOURCE).toContain("buildErrorDiagnostics")
    expect(SOURCE).toContain("copyTextToClipboard")
  })

  test("announces diagnostics copy status", () => {
    expect(SOURCE).toContain('role="status"')
    expect(SOURCE).toContain("Diagnostics copied")
    expect(SOURCE).toContain("Clipboard is unavailable")
  })
})
