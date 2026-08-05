import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision"
import type {
  ClipStill,
  FormCoachAngle,
  FormCoachAngleKind,
  FormCoachAngleLandmarks,
  FormCoachFrame,
  PoseProvider,
} from "@/lib/form-coach"

/**
 * MediaPipe Tasks Vision as a `PoseProvider`.
 *
 * Everything MediaPipe-shaped lives here — the wasm and model URLs, the
 * landmarker cache, and the browser video decoding the landmarker reads frames
 * from. `form-coach.ts` knows none of it and talks to the provider interface.
 */

/** Version-pinned to the installed package so the wasm matches this JS API. */
const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"

/**
 * Served from Google's model CDN rather than our own origin.
 *
 * The heavy model is 29.2 MB, past Cloudflare Pages' hard 25 MiB per-file cap,
 * so hosting it ourselves is not an option. Nothing is lost: the wasm above
 * already comes from a CDN, so Form Coach never had an offline guarantee to
 * give up, and a self-hosted copy would also have to be excluded from OTA
 * bundles to keep updates small — which meant naming an absolute origin on
 * native anyway, since a root-relative path resolves inside the swapped bundle
 * directory and 404s after the first update.
 */
const POSE_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"

/**
 * How densely clips are sampled. Squat tempo is slow enough that 5fps captures
 * the shape of the rep, and the viewer interpolates back up to display rate —
 * halving this from 10fps roughly halves the time spent on pose estimation.
 */
const SAMPLE_FPS = 10

/**
 * Stills grabbed per clip while it is being decoded, before rep detection has
 * run. Sampled generously here because the decode is already paid for; the
 * expensive step is shipping them, and only five ever leave the device.
 */
const STILL_POOL_PER_ANGLE = 10

/** Longest edge of a still, in pixels. Enough to see a knee, small enough to send. */
const STILL_MAX_EDGE = 448

/**
 * One landmarker per running mode. Videos and stills need different modes, and
 * flipping a single instance between them reloads its graph on every switch.
 * Each is loaded once and reused — the model is ~29 MB and slow to instantiate.
 */
const landmarkers = new Map<"VIDEO" | "IMAGE", Promise<PoseLandmarker>>()

function getPoseLandmarker(runningMode: "VIDEO" | "IMAGE") {
  let pending = landmarkers.get(runningMode)
  if (!pending) {
    pending = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE)
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL_PATH },
        runningMode,
        numPoses: 1,
      })
    })()
    landmarkers.set(runningMode, pending)
  }
  return pending
}

/**
 * VIDEO mode requires timestamps that never go backwards, and the landmarker is
 * shared across angles and submissions — so frame times are offset onto one
 * ever-increasing clock rather than restarting at zero for each clip.
 */
let timestampCursor = 0

function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/**
 * A video element decoding the clip. It has to be in the document for browsers
 * to decode frames, but is kept off-screen rather than hidden — `display: none`
 * stops decoding on some engines.
 */
function createDecoder(url: string) {
  const video = document.createElement("video")
  video.src = url
  video.muted = true
  video.playsInline = true
  video.preload = "auto"
  video.crossOrigin = "anonymous"
  video.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none"
  document.body.appendChild(video)
  // WebKit treats `preload` as a hint and will happily fetch nothing at all
  // until something asks; setting src is not enough on iOS.
  video.load()
  return video
}

/** A decode or seek that has not answered in this long is not going to. */
const DECODE_TIMEOUT_MS = 15_000

function onceReady(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState >= 2) {
      resolve()
      return
    }
    let timer = 0
    const finish = (error?: Error) => {
      window.clearTimeout(timer)
      video.onloadeddata = null
      video.onerror = null
      if (error) reject(error)
      else resolve()
    }
    timer = window.setTimeout(
      () => finish(new Error("The video took too long to decode")),
      DECODE_TIMEOUT_MS
    )
    video.onloadeddata = () => finish()
    video.onerror = () => finish(new Error("Could not decode the video"))
  })
}

/** Below this, two times are the same frame as far as any decoder cares. */
const SEEK_EPSILON_S = 0.001

function seekTo(video: HTMLVideoElement, seconds: number) {
  return new Promise<void>((resolve, reject) => {
    // Assigning the time the video is *already* at performs no seek, so no
    // `seeked` event is ever fired and the wait never ends. Sampling starts at
    // t=0 on a video whose currentTime is 0, which is why this hung on the
    // very first frame — at exactly 0%, forever — on WebKit. Chrome fires the
    // event anyway, which is why it only ever showed up on the phone.
    if (Math.abs(video.currentTime - seconds) < SEEK_EPSILON_S) {
      resolve()
      return
    }

    // A watchdog as well, because a decoder that drops a `seeked` for any other
    // reason should surface as an error the user can retry, never as a
    // progress bar that sits still.
    let timer = 0
    const finish = (error?: Error) => {
      window.clearTimeout(timer)
      video.onseeked = null
      video.onerror = null
      if (error) reject(error)
      else resolve()
    }
    timer = window.setTimeout(
      () => finish(new Error("The video stopped responding while being read")),
      DECODE_TIMEOUT_MS
    )

    video.onseeked = () => finish()
    video.onerror = () => finish(new Error("Could not seek the video"))
    video.currentTime = seconds
  })
}

/** A photo scaled down to the size a still is sent at. */
function shrinkToStill(bitmap: ImageBitmap): ClipStill[] {
  const scale = Math.min(
    1,
    STILL_MAX_EDGE / Math.max(bitmap.width, bitmap.height)
  )
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext("2d")
  if (!context) return []
  try {
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return [{ timeMs: 0, dataUrl: canvas.toDataURL("image/jpeg", 0.6) }]
  } catch {
    return []
  }
}

/** Pose estimation over a still, which yields a single frame at time 0. */
async function extractImageLandmarks(
  angle: FormCoachAngle
): Promise<FormCoachAngleLandmarks> {
  const landmarker = await getPoseLandmarker("IMAGE")
  const blob = base64ToBlob(angle.base64, angle.mimeType)
  const bitmap = await createImageBitmap(blob)
  try {
    const result = landmarker.detect(bitmap)
    return {
      index: angle.index,
      frames: [
        {
          timeMs: 0,
          landmarks: result.landmarks[0] ?? [],
          worldLandmarks: result.worldLandmarks[0] ?? [],
        },
      ],
      stills: shrinkToStill(bitmap),
    }
  } finally {
    bitmap.close()
  }
}

/**
 * The current video frame as a small JPEG, or null if it cannot be drawn.
 *
 * Cross-origin frames taint the canvas and throw on export; the clips here are
 * always same-origin blobs, but a still is a nice-to-have and never worth
 * failing an analysis over.
 */
function grabStill(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return null

  const scale = Math.min(1, STILL_MAX_EDGE / Math.max(width, height))
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext("2d")
  if (!context) return null

  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.6)
  } catch {
    return null
  }
}

/**
 * Runs pose estimation over one clip by seeking frame to frame. Seeking rather
 * than playing keeps sampling deterministic and independent of playback speed,
 * which matters because these clips are analysed, not watched.
 *
 * Stills are grabbed on the same pass. Landmarks say where the joints were;
 * they cannot say that a second lifter walked into shot, that the camera was
 * hand-held, or what the bar was doing — and those are the things that decide
 * whether the numbers mean anything.
 */
async function extractVideoLandmarks(
  angle: FormCoachAngle,
  onFraction?: (fraction: number) => void
): Promise<FormCoachAngleLandmarks> {
  const landmarker = await getPoseLandmarker("VIDEO")
  const blob = base64ToBlob(angle.base64, angle.mimeType)
  const url = URL.createObjectURL(blob)
  const video = createDecoder(url)
  const canvas = document.createElement("canvas")

  try {
    await onceReady(video)
    // Uploads sometimes report no duration until decoded; fall back to the
    // duration measured at capture time.
    const durationMs = Number.isFinite(video.duration)
      ? video.duration * 1000
      : angle.durationMs

    const frames: FormCoachFrame[] = []
    const stills: ClipStill[] = []
    const step = 1000 / SAMPLE_FPS
    const sampleCount = Math.max(1, Math.ceil(durationMs / step))
    const stillEvery = Math.max(
      1,
      Math.ceil(sampleCount / STILL_POOL_PER_ANGLE)
    )

    let sample = 0
    for (let timeMs = 0; timeMs < durationMs; timeMs += step) {
      await seekTo(video, timeMs / 1000)
      timestampCursor += step
      const result = landmarker.detectForVideo(video, timestampCursor)
      frames.push({
        timeMs: Math.round(timeMs),
        landmarks: result.landmarks[0] ?? [],
        worldLandmarks: result.worldLandmarks[0] ?? [],
      })
      if (sample % stillEvery === 0) {
        const dataUrl = grabStill(video, canvas)
        if (dataUrl) stills.push({ timeMs: Math.round(timeMs), dataUrl })
      }
      sample += 1
      onFraction?.(Math.min((timeMs + step) / durationMs, 1))
    }
    return { index: angle.index, frames, stills }
  } finally {
    video.onloadeddata = null
    video.onseeked = null
    video.onerror = null
    video.removeAttribute("src")
    video.load()
    video.remove()
    URL.revokeObjectURL(url)
  }
}

export const mediapipePoseProvider: PoseProvider = {
  id: "mediapipe/pose_landmarker_heavy",
  sampleFps: SAMPLE_FPS,

  // Warming before the first angle means the long wait on the wasm and the
  // ~29 MB model is reported as loading rather than as a frame that
  // mysteriously takes ten seconds.
  async warm(kinds: FormCoachAngleKind[]) {
    await getPoseLandmarker(kinds.includes("video") ? "VIDEO" : "IMAGE")
  },

  estimateAngle(angle, onFraction) {
    return angle.kind === "image"
      ? extractImageLandmarks(angle)
      : extractVideoLandmarks(angle, onFraction)
  },

  async dispose() {
    const pending = [...landmarkers.values()]
    landmarkers.clear()
    timestampCursor = 0
    for (const landmarker of pending) {
      await landmarker.then(
        (instance) => instance.close(),
        // A landmarker that never loaded has nothing to close, and its failure
        // was already surfaced to whoever awaited the estimate.
        () => {}
      )
    }
  },
}
