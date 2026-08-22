import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SNAP_SOURCE = readFileSync(
  new URL("./SnapAndLog.tsx", import.meta.url),
  "utf8"
)

describe("Snap and Log accessibility contract", () => {
  test("camera capture controls expose explicit button semantics", () => {
    expect(SNAP_SOURCE).toContain(
      'aria-label={mode === "barcode" ? "Capture barcode" : "Capture"}'
    )
    expect(SNAP_SOURCE).toContain('aria-label="Switch camera"')
    expect(SNAP_SOURCE).toContain(
      'aria-label={flash ? "Turn flash off" : "Turn flash on"}'
    )
  })

  test("camera startup and blocked states provide visible recovery", () => {
    expect(SNAP_SOURCE).toContain("const [cameraAttempt, setCameraAttempt]")
    expect(SNAP_SOURCE).toContain("function retryCamera()")
    expect(SNAP_SOURCE).toContain("setCameraAttempt((attempt) => attempt + 1)")
    expect(SNAP_SOURCE).toContain("Starting camera")
    expect(SNAP_SOURCE).toContain(
      "Keep OneRep open while we connect to your camera."
    )
    expect(SNAP_SOURCE).toContain("Try camera again")
    expect(SNAP_SOURCE).toContain('navigate(`/foods/search?date=${date}`)')
  })

  test("a camera that will not start hands over to the system camera", () => {
    // The WebView preview failing is not the end of the flow: on a phone with
    // a camera, the system picker is the recovery, and it fires without the
    // user having to find a button.
    expect(SNAP_SOURCE).toContain("autoFallbackAttemptRef")
    expect(SNAP_SOURCE).toContain("void handleNativeCapture()")
    expect(SNAP_SOURCE).toContain("Use camera app")
    expect(SNAP_SOURCE).toContain("const [cameraFailure, setCameraFailure]")
    expect(SNAP_SOURCE).toContain("function describeCameraError(")
  })

  test("a cancelled picker and a failed play() are not permission denials", () => {
    expect(SNAP_SOURCE).toContain("function isCancelledCapture(")
    expect(SNAP_SOURCE).toContain("if (isCancelledCapture(err)) return")
    expect(SNAP_SOURCE).toContain("Camera preview did not autoplay")
    // The generic capture failure must not claim the camera was denied.
    const nativeCapture = SNAP_SOURCE.slice(
      SNAP_SOURCE.indexOf("async function handleNativeCapture()")
    ).slice(0, 1800)
    expect(nativeCapture).not.toContain('setCameraState("denied")\n      if')
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
    expect(SNAP_SOURCE).toContain(
      "const loggingTargetRef = useRef<string | null>(null)"
    )
    expect(SNAP_SOURCE).toContain(
      "if (loggingTargetRef.current || added === item.id) return"
    )
    expect(SNAP_SOURCE).toContain(
      "if (snapLogging || loggingTargetRef.current) return"
    )
    expect(SNAP_SOURCE).toContain("setLoggingTarget(item.id)")
    expect(SNAP_SOURCE).toContain("setSnapLogging(true)")
    expect(SNAP_SOURCE).toContain("reportOfflineMutationError(error)")
    expect(SNAP_SOURCE).toContain("loggingTarget={loggingTarget}")
  })

  test("result CTAs expose pending state to users and assistive tech", () => {
    expect(SNAP_SOURCE).toContain("logging={loggingTarget === item.id}")
    expect(SNAP_SOURCE).toContain("disabled={Boolean(loggingTarget)}")
    expect(SNAP_SOURCE).toContain("disabled={snapLogged || snapLogging}")
    expect(SNAP_SOURCE).toContain("aria-busy={snapLogging}")
    expect(SNAP_SOURCE).toContain("aria-busy={logging}")
    expect(SNAP_SOURCE).toContain("Logging…")
  })
})
