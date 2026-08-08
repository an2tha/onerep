import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { Camera as NativeCamera } from "@capacitor/camera"
import {
  ArrowLeft,
  ArrowsClockwise,
  UploadSimple,
  VideoCamera,
} from "@phosphor-icons/react"
import { toast } from "@repo/ui"
import { hapticHeavy, hapticTap } from "@/lib/haptics"
import { useFormCoachSupport } from "@/lib/form-coach"
import {
  emaGravity,
  gravityToOrientation,
  normalizeEventGravity,
  type GravityVector,
} from "@/lib/device-gravity"
import {
  MAX_FORM_COACH_ANGLES,
  addFormCoachClip,
  closeFormCoachRecorder,
  useFormCoachDraft,
} from "@/lib/form-coach-clips"

// ─── Types ────────────────────────────────────────────────────────────────────

type CameraState = "requesting" | "active" | "denied" | "unsupported"
type Phase = "idle" | "recording"

/** Long enough for a few reps, short enough to stay cheap to upload and analyse. */
const MAX_DURATION_MS = 15_000

/**
 * Uploads get more headroom than a live take — an existing clip is rarely
 * trimmed to the second — but still has to stay small enough to send.
 */
const MAX_UPLOAD_DURATION_MS = 30_000
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024

/**
 * Duration of a picked file, via a throwaway element because the File API does
 * not expose it. Resolves null when the browser cannot determine it, which is
 * common for WebM recorded elsewhere; those are let through unchecked.
 */
function readVideoDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file)
    const probe = document.createElement("video")
    const done = (value: number | null) => {
      probe.onloadedmetadata = null
      probe.onerror = null
      URL.revokeObjectURL(url)
      resolve(value)
    }
    probe.onloadedmetadata = () => {
      const seconds = probe.duration
      done(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null)
    }
    probe.onerror = () => done(null)
    probe.preload = "metadata"
    probe.src = url
  })
}

const MIME_CANDIDATES = [
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
]

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 100)
  return `${Math.floor(total / 10)}.${total % 10}s`
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

/**
 * Full-screen camera for recording one angle. Rendered over the active workout
 * rather than routed to, so the workout stays mounted and keeps its state.
 */
export function FormCoachRecorder() {
  const draft = useFormCoachDraft()
  if (draft?.phase !== "recording") return null
  return (
    <FormCoachCamera
      key={draft.clips.length}
      exerciseName={draft.exerciseName}
      angleNumber={Math.min(draft.clips.length + 1, MAX_FORM_COACH_ANGLES)}
    />
  )
}

function FormCoachCamera({
  exerciseName,
  angleNumber,
}: {
  exerciseName: string
  angleNumber: number
}) {
  const movement = useFormCoachSupport(exerciseName)

  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gravityRef = useRef<GravityVector | null>(null)
  const motionListenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(
    null
  )

  const [cameraState, setCameraState] = useState<CameraState>("requesting")
  const [cameraAttempt, setCameraAttempt] = useState(0)
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  )
  const [phase, setPhase] = useState<Phase>("idle")
  const [elapsed, setElapsed] = useState(0)

  const canRecord = typeof MediaRecorder !== "undefined"

  // ── Camera stream ─────────────────────────────────────────────────────────

  const startCamera = useCallback(
    async (facing: "environment" | "user", signal: AbortSignal) => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState("unsupported")
        return
      }
      try {
        if (Capacitor.isNativePlatform()) {
          const permission = await NativeCamera.requestPermissions({
            permissions: ["camera"],
          })
          if (permission.camera !== "granted") {
            if (!signal.aborted) setCameraState("denied")
            return
          }
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        })
        if (signal.aborted) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        if (!signal.aborted) setCameraState("active")
      } catch (err: unknown) {
        if (signal.aborted) return
        const name = err instanceof Error ? err.name : ""
        setCameraState(
          name === "NotAllowedError" || name === "PermissionDeniedError"
            ? "denied"
            : "unsupported"
        )
      }
    },
    []
  )

  useEffect(() => {
    const controller = new AbortController()
    const video = videoRef.current
    void startCamera(facingMode, controller.signal)
    return () => {
      controller.abort()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (video) video.srcObject = null
    }
  }, [cameraAttempt, facingMode, startCamera])

  // ── Camera tilt from gravity ──────────────────────────────────────────────

  const stopMotion = useCallback(() => {
    if (motionListenerRef.current) {
      window.removeEventListener("devicemotion", motionListenerRef.current)
      motionListenerRef.current = null
    }
  }, [])

  /**
   * Low-passes gravity while the take records, to seed the Straighten sliders
   * later. Best effort throughout: no sensor, no permission, or a rejection
   * all mean the sliders start at zero, exactly as before this existed.
   *
   * Called synchronously from the record button so the iOS 13+
   * `DeviceMotionEvent.requestPermission` prompt still counts as being inside
   * a user gesture — nothing before the request may await.
   */
  const startMotion = useCallback(async () => {
    try {
      if (typeof DeviceMotionEvent === "undefined") return
      const { requestPermission } = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<string>
      }
      if (
        typeof requestPermission === "function" &&
        (await requestPermission()) !== "granted"
      )
        return
      if (motionListenerRef.current) return
      gravityRef.current = null
      const onMotion = (event: DeviceMotionEvent) => {
        const gravity = normalizeEventGravity(
          event.accelerationIncludingGravity,
          Capacitor.getPlatform()
        )
        if (!gravity) return
        gravityRef.current = emaGravity(gravityRef.current, gravity)
      }
      motionListenerRef.current = onMotion
      window.addEventListener("devicemotion", onMotion)
    } catch {
      // Denied or broken. The sliders still exist; nothing to say about it.
    }
  }, [])

  // Recording keeps running if the app is backgrounded mid-take, which would
  // produce a clip the user never saw being filmed. Stop instead.
  useEffect(() => {
    function onHide() {
      if (document.hidden && recorderRef.current?.state === "recording") {
        recorderRef.current.stop()
      }
    }
    document.addEventListener("visibilitychange", onHide)
    return () => document.removeEventListener("visibilitychange", onHide)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
      if (tickRef.current) clearInterval(tickRef.current)
      if (recorderRef.current?.state === "recording") recorderRef.current.stop()
      stopMotion()
    }
  }, [stopMotion])

  // ── Recording ─────────────────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
  }, [])

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream || !canRecord) return

    const mimeType = pickMimeType()
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    } catch {
      toast.error("This device can't record video in the app")
      return
    }

    const startedAt = Date.now()
    // The camera in use and the interface orientation, pinned at record start —
    // both are frozen while a take runs (the flip button is disabled), and the
    // gravity mapping depends on them.
    const facing = facingMode
    const screenOrientation =
      window.screen?.orientation?.type ?? "portrait-primary"
    chunksRef.current = []
    recorderRef.current = recorder
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
      stopMotion()
      const gravity = gravityRef.current
      gravityRef.current = null
      recorderRef.current = null
      const blob = new Blob(chunksRef.current, {
        type: mimeType ?? "video/webm",
      })
      chunksRef.current = []
      // Closing the camera mid-take stops the recorder; drop that clip rather
      // than keeping an angle the user never chose to record.
      if (!mountedRef.current) return
      if (blob.size === 0) {
        setPhase("idle")
        setElapsed(0)
        toast.error("Nothing was recorded. Try again")
        return
      }
      void hapticTap()
      const orientation = gravity
        ? gravityToOrientation(gravity, facing, screenOrientation)
        : null
      // Adding the clip closes the camera and reveals the review sheet over the
      // workout, which never left the screen underneath.
      addFormCoachClip({
        kind: "video",
        blob,
        durationMs: Date.now() - startedAt,
        ...(orientation ? { orientation } : {}),
      })
    }

    setElapsed(0)
    setPhase("recording")
    void hapticHeavy()
    // Before any await can intervene: the iOS motion-permission prompt must
    // trace back to this button press.
    void startMotion()
    recorder.start()
    tickRef.current = setInterval(() => {
      setElapsed(Date.now() - startedAt)
    }, 100)
    stopTimerRef.current = setTimeout(stopRecording, MAX_DURATION_MS)
  }, [canRecord, facingMode, startMotion, stopMotion, stopRecording])

  const close = useCallback(() => {
    stopRecording()
    closeFormCoachRecorder()
  }, [stopRecording])

  // ── Upload an existing clip ───────────────────────────────────────────────

  async function handleFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset first so picking the same file twice still fires a change event.
    event.target.value = ""
    if (!file) return

    const isImage = file.type.startsWith("image/")
    if (!isImage && !file.type.startsWith("video/")) {
      toast.error("Pick a video or a photo")
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("That file is too large. Keep it under 64 MB")
      return
    }

    if (isImage) {
      void hapticTap()
      // A still is a single frame; the coach reads one pose out of it rather
      // than a movement, which is worth knowing when the feedback lands.
      addFormCoachClip({ kind: "image", blob: file, durationMs: 0 })
      return
    }

    const durationMs = await readVideoDuration(file)
    if (durationMs !== null && durationMs > MAX_UPLOAD_DURATION_MS) {
      toast.error("That video is too long. Keep it to 30 seconds or less")
      return
    }
    if (!mountedRef.current) return

    void hapticTap()
    addFormCoachClip({ kind: "video", blob: file, durationMs: durationMs ?? 0 })
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [close])

  const hint = useMemo(
    () =>
      movement?.setup ??
      "Film from the side with your whole body in frame. 2–3 reps is enough.",
    [movement]
  )

  const remaining = Math.max(0, MAX_DURATION_MS - elapsed)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Record your ${exerciseName} form`}
      className="fixed inset-0 z-[60] overflow-hidden bg-black"
    >
      {/* ── Live feed ────────────────────────────────────────────────── */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
        style={{ display: cameraState === "active" ? "block" : "none" }}
      />

      {/* ── Permission / loading states ──────────────────────────────── */}
      {cameraState !== "active" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0c0c0c] px-8 text-center">
          {cameraState === "requesting" && (
            <>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
              <p className="text-[15px] font-semibold text-white">
                Starting camera
              </p>
              <p className="text-[14px] text-white/75">
                Keep OneRep open while we connect to your camera.
              </p>
            </>
          )}
          {cameraState === "denied" && (
            <>
              <p className="text-[17px] font-semibold text-white">
                Camera access denied
              </p>
              <p className="max-w-[280px] text-[14px] leading-5 text-white/75">
                Allow camera access in Settings to record your form.
              </p>
            </>
          )}
          {cameraState === "unsupported" && (
            <p className="text-[17px] font-semibold text-white">
              Camera not available
            </p>
          )}
          {(cameraState === "denied" || cameraState === "unsupported") && (
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCameraState("requesting")
                  setCameraAttempt((attempt) => attempt + 1)
                }}
                className="min-h-11 rounded-lg bg-white px-4 text-[14px] font-semibold text-black"
              >
                Try camera again
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-11 rounded-lg border border-white/25 px-4 text-[14px] font-semibold text-white"
              >
                Upload a video or photo
              </button>
              <button
                type="button"
                onClick={closeFormCoachRecorder}
                className="min-h-11 rounded-lg border border-white/25 px-4 text-[14px] font-semibold text-white"
              >
                Back to workout
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Vignette ─────────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* ── Framing guides ───────────────────────────────────────────── */}
      {cameraState === "active" && (
        <>
          {(
            [
              "top-[14%] left-[8%] border-t border-l",
              "top-[14%] right-[8%] border-t border-r",
              "bottom-[22%] left-[8%] border-b border-l",
              "bottom-[22%] right-[8%] border-b border-r",
            ] as const
          ).map((cls, i) => (
            <div
              key={i}
              className={`pointer-events-none absolute h-8 w-8 border-white/40 ${cls}`}
            />
          ))}
        </>
      )}

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 right-0 left-0 flex items-center justify-between gap-3 px-5 md:px-7"
        style={{ paddingTop: "var(--app-safe-top)" }}
      >
        <button
          type="button"
          onClick={close}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-black/70 text-white transition-opacity active:opacity-60"
          aria-label="Close camera"
        >
          <ArrowLeft size={16} weight="bold" />
        </button>

        <div className="min-w-0 rounded-[14px] border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
          <p className="truncate text-center text-[14px] font-semibold text-white">
            {movement?.label ?? exerciseName}
          </p>
          <p className="truncate text-center text-[12px] text-white/55">
            Angle {angleNumber}
          </p>
        </div>

        <div className="h-11 w-11 shrink-0" />
      </div>

      {/* ── Framing hint ─────────────────────────────────────────────── */}
      {phase === "idle" && cameraState === "active" && (
        <div
          className="absolute right-8 left-8"
          style={{ bottom: "calc(var(--app-safe-bottom-lg) + 7.5rem)" }}
        >
          <p className="text-center text-[14px] leading-5 font-medium text-white/85">
            {hint}
          </p>
          <p className="pt-1 text-center text-[13px] text-white/55">
            One angle is enough. Or upload a video or photo you already have.
          </p>
        </div>
      )}

      {/* ── Recording timer ──────────────────────────────────────────── */}
      {phase === "recording" && (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ bottom: "calc(var(--app-safe-bottom-lg) + 7rem)" }}
        >
          <div className="flex items-center gap-2 rounded-[12px] border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-md">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "#e5484d" }}
            />
            <span className="text-[14px] font-medium text-white tabular-nums">
              {formatElapsed(elapsed)}
            </span>
            <span className="text-[13px] text-white/55 tabular-nums">
              {formatElapsed(remaining)} left
            </span>
          </div>
        </div>
      )}

      {/* ── Capture controls ─────────────────────────────────────────── */}
      <div
        className="absolute right-0 bottom-0 left-0 flex items-center justify-between px-10"
        style={{
          paddingBottom: "var(--app-safe-bottom-lg)",
          paddingTop: "1.5rem",
        }}
      >
        <button
          type="button"
          onClick={() =>
            setFacingMode((f) => (f === "environment" ? "user" : "environment"))
          }
          disabled={phase === "recording"}
          className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-white/10 bg-black/45 text-white/70 backdrop-blur-md transition-opacity active:opacity-60 disabled:opacity-30"
          aria-label="Switch camera"
        >
          <ArrowsClockwise size={18} />
        </button>

        <button
          type="button"
          onClick={phase === "recording" ? stopRecording : startRecording}
          disabled={cameraState !== "active" || !canRecord}
          className="motion-pressable relative flex h-[76px] w-[76px] items-center justify-center rounded-full disabled:opacity-30"
          aria-label={phase === "recording" ? "Stop recording" : "Record"}
        >
          <div className="absolute inset-0 rounded-full border-2 border-white/30" />
          <div
            style={{
              backgroundColor: "#e5484d",
              width: phase === "recording" ? 28 : 60,
              height: phase === "recording" ? 28 : 60,
              borderRadius: phase === "recording" ? 8 : 9999,
              transition:
                "width var(--motion-fast) var(--motion-ease-out), height var(--motion-fast) var(--motion-ease-out), border-radius var(--motion-fast) var(--motion-ease-out)",
            }}
          />
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={phase === "recording"}
          className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-white/10 bg-black/45 text-white/70 backdrop-blur-md transition-opacity active:opacity-60 disabled:opacity-30"
          aria-label="Upload a video or photo instead"
        >
          <UploadSimple size={18} />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={(event) => void handleFilePicked(event)}
      />

      {/* ── Unsupported recorder ─────────────────────────────────────── */}
      {!canRecord && cameraState === "active" && (
        <div
          className="absolute right-8 left-8 flex items-center justify-center gap-2 rounded-[12px] border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-md"
          style={{ bottom: "calc(var(--app-safe-bottom-lg) + 7rem)" }}
        >
          <VideoCamera size={15} className="text-white/60" />
          <span className="text-[14px] text-white/80">
            Video recording isn't supported on this device.
          </span>
        </div>
      )}
    </div>
  )
}
