import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SOURCE = readFileSync(
  new URL("./offline-sync-indicator.tsx", import.meta.url),
  "utf8"
)

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
    expect(SOURCE).toContain('{syncing ? "Syncing" : "Sync"}')
  })

  test("does not allow dismissing the status while a sync is in progress", () => {
    expect(SOURCE).toContain("if (!syncing) setDismissed(true)")
    expect(SOURCE).toContain('aria-label="Dismiss offline sync status"')
    expect(SOURCE).toContain("disabled:opacity-40")
  })
})
