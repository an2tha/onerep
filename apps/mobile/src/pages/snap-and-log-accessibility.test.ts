import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SNAP_SOURCE = readFileSync(
  new URL("./SnapAndLog.tsx", import.meta.url),
  "utf8",
)

describe("Snap and Log accessibility contract", () => {
  test("camera capture controls expose explicit button semantics", () => {
    expect(SNAP_SOURCE).toContain(
      'aria-label={mode === "barcode" ? "Capture barcode" : "Capture"}',
    )
    expect(SNAP_SOURCE).toContain('aria-label="Switch camera"')
    expect(SNAP_SOURCE).toContain('aria-label={flash ? "Turn flash off" : "Turn flash on"}')
  })

  test("camera startup and blocked states provide visible recovery", () => {
    expect(SNAP_SOURCE).toContain("const [cameraAttempt, setCameraAttempt]")
    expect(SNAP_SOURCE).toContain("function retryCamera()")
    expect(SNAP_SOURCE).toContain("setCameraAttempt((attempt) => attempt + 1)")
    expect(SNAP_SOURCE).toContain("Starting camera")
    expect(SNAP_SOURCE).toContain(
      "Keep OneRep open while we connect to your camera.",
    )
    expect(SNAP_SOURCE).toContain("<CameraFallbackActions")
    expect(SNAP_SOURCE).toContain("onSearch={() => navigate(\"/foods/search\")}")
  })

  test("results sheet controls expose names and selected state", () => {
    expect(SNAP_SOURCE).toContain('aria-label="Close capture results"')
    expect(SNAP_SOURCE).toContain("aria-pressed={meal === m.id}")
    expect(SNAP_SOURCE).toContain("aria-label={`Log to ${m.label}`}")
    expect(SNAP_SOURCE).toContain("aria-pressed={active}")
  })

  test("snap quantity input exposes stable mobile form metadata", () => {
    expect(SNAP_SOURCE).toContain('name="snap-food-grams"')
    expect(SNAP_SOURCE).toContain('aria-label="Snap food quantity in grams"')
  })

  test("camera result logging prevents duplicate submissions", () => {
    expect(SNAP_SOURCE).toContain("const [loggingTarget, setLoggingTarget]")
    expect(SNAP_SOURCE).toContain("const loggingTargetRef = useRef<string | null>(null)")
    expect(SNAP_SOURCE).toContain("if (loggingTargetRef.current || added === item.id) return")
    expect(SNAP_SOURCE).toContain(
      'if (loggingTargetRef.current || added === "snap-review") return',
    )
    expect(SNAP_SOURCE).toContain("setLoggingTarget(item.id)")
    expect(SNAP_SOURCE).toContain('setLoggingTarget("snap-review")')
    expect(SNAP_SOURCE).toContain("reportOfflineMutationError(error)")
    expect(SNAP_SOURCE).toContain("loggingTarget={loggingTarget}")
  })

  test("result CTAs expose pending state to users and assistive tech", () => {
    expect(SNAP_SOURCE).toContain("logging={loggingTarget === item.id}")
    expect(SNAP_SOURCE).toContain("disabled={Boolean(loggingTarget)}")
    expect(SNAP_SOURCE).toContain("disabled={snapLogged || snapLogging}")
    expect(SNAP_SOURCE).toContain("aria-busy={snapLogging}")
    expect(SNAP_SOURCE).toContain("aria-busy={logging}")
    expect(SNAP_SOURCE).toContain('? "Logging..."')
  })
})
