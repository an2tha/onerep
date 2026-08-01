import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SOURCE = [
  "./offline-sync-indicator.tsx",
  "../../../../packages/ui/src/components/app-feedback.tsx",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n")

describe("offline sync indicator production contract", () => {
  test("prevents duplicate manual and automatic flushes", () => {
    expect(SOURCE).toContain("const syncingRef = useRef(false)")
    expect(SOURCE).toContain("if (!canSync || syncingRef.current) return")
    expect(SOURCE).toContain("syncingRef.current = true")
    expect(SOURCE).toContain("syncingRef.current = false")
  })

  test("surfaces in-progress sync state to users and assistive tech", () => {
    expect(SOURCE).toContain("const [syncing, setSyncing] = useState(false)")
    expect(SOURCE).toContain("syncing,")
    expect(SOURCE).toContain('role="status"')
    expect(SOURCE).toContain('aria-live="polite"')
    expect(SOURCE).toContain("disabled={syncing}")
    expect(SOURCE).toContain("aria-busy={syncing}")
    expect(SOURCE).toContain('"Saving"')
    expect(SOURCE).toContain('"Try again"')
    expect(SOURCE).toContain('"Save now"')
    expect(SOURCE).toContain('"Try saving your changes again"')
    expect(SOURCE).toContain('"Save your changes now"')
  })

  test("does not allow dismissing the status while a sync is in progress", () => {
    expect(SOURCE).toContain("if (!syncing) setDismissed(true)")
    expect(SOURCE).toContain('aria-label="Dismiss the unsaved changes message"')
    expect(SOURCE).toContain("disabled:opacity-40")
  })
})
