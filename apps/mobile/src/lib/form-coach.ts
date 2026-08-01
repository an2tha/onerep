import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
  FilesetResolver,
  PoseLandmarker,
  type Landmark,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision"
import { smoothFormCoachLandmarks } from "@/lib/pose-smoothing"
import { applyOrientation, fuseReps, type FusedReps } from "@/lib/pose-reps"
import { convexClient } from "@/lib/convex"
import type { FormCoachReport } from "@/lib/form-coach-message"
import { currentDateKey } from "@/lib/food-log"
import type { Id } from "../../../../convex/_generated/dataModel"
import { uploadOwnedFile } from "@/lib/owned-upload"
/** One movement the form coach can analyse, as returned by the backend. */
export type FormCoachExercise = {
  slug: string
  label: string
  keywords: string[]
  setup: string
}

export function matchFormCoachExercise(
  exerciseName: string,
  supported: FormCoachExercise[] | undefined
): FormCoachExercise | null {
  if (!supported) return null
  const name = exerciseName.toLowerCase()
  return (
    supported.find((exercise) =>
      exercise.keywords.some((keyword) => name.includes(keyword))
    ) ?? null
  )
}

/**
 * Returns the form-coach movement for an exercise, or null while the catalog is
 * loading or when the exercise is not supported yet. Every caller shares one
 * subscription because the underlying query takes no arguments.
 */
export function useFormCoachSupport(
  exerciseName: string
): FormCoachExercise | null {
  const supported = useQuery(api.ai.formCoach.listSupported, {})
  return useMemo(
    () => matchFormCoachExercise(exerciseName, supported),
    [exerciseName, supported]
  )
}

export type FormCoachAngleKind = "video" | "image"

/** One recorded or uploaded angle, ready to send. */
export type FormCoachAngle = {
  /** 1-based, in the order the angles were added. */
  index: number
  kind: FormCoachAngleKind
  /** e.g. "video/mp4", "video/webm", "image/jpeg". */
  mimeType: string
  /** Always 0 for stills. */
  durationMs: number
  /** Bytes, base64 with no data-URL prefix. */
  base64: string
}

export type FormCoachSubmission = {
  /** Supported movement slug from the backend catalog, e.g. "squat". */
  slug: string
  exerciseId: string
  exerciseName: string
  angles: FormCoachAngle[]
}

/** Landmarks sampled from one frame of one angle. */
export type FormCoachFrame = {
  /** Milliseconds into the clip. */
  timeMs: number
  /** 33 landmarks, normalized to 0–1 against the frame. Empty if no pose. */
  landmarks: NormalizedLandmark[]
  /** The same points in metres, origin at the hip midpoint. */
  worldLandmarks: Landmark[]
}

export type FormCoachAngleLandmarks = {
  index: number
  frames: FormCoachFrame[]
}

/**
 * How densely clips are sampled. Squat tempo is slow enough that 5fps captures
 * the shape of the rep, and the viewer interpolates back up to display rate —
 * halving this from 10fps roughly halves the time spent on pose estimation.
 */
const SAMPLE_FPS = 10

/** Version-pinned to the installed package so the wasm matches this JS API. */
const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"

const POSE_MODEL_PATH = "/pose_landmarker_lite.task"

/**
 * One landmarker per running mode. Videos and stills need different modes, and
 * flipping a single instance between them reloads its graph on every switch.
 * Each is loaded once and reused — the model is ~6 MB and slow to instantiate.
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
  return video
}

function onceReady(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState >= 2) {
      resolve()
      return
    }
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error("Could not decode the video"))
  })
}

function seekTo(video: HTMLVideoElement, seconds: number) {
  return new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve()
    video.onerror = () => reject(new Error("Could not seek the video"))
    video.currentTime = seconds
  })
}

/**
 * How far pose estimation has got.
 *
 * Loading is a distinct stage because the model and wasm are several megabytes
 * and land before a single frame is read — without saying so, the bar would sit
 * at zero long enough to look stuck.
 */
export type FormCoachProgress = {
  stage: "loading" | "reading"
  /** 0–1 across the whole job. */
  value: number
}

export type FormCoachProgressHandler = (progress: FormCoachProgress) => void

/**
 * How much of the job each angle represents.
 *
 * Weighted by clip length rather than counting angles, so a 12s take does not
 * advance the bar as fast as a 2s one. Stills get a small fixed weight — they
 * are one frame, but not free.
 */
export function formCoachAngleWeight(angle: {
  kind: FormCoachAngleKind
  durationMs: number
}) {
  return angle.kind === "image" ? 250 : Math.max(angle.durationMs, 250)
}

/** Overall progress once `doneWeight` is finished and the current angle is `fraction` through. */
export function formCoachProgressValue(input: {
  doneWeight: number
  currentWeight: number
  fraction: number
  totalWeight: number
}) {
  if (input.totalWeight <= 0) return 1
  const value =
    (input.doneWeight + input.fraction * input.currentWeight) /
    input.totalWeight
  return Math.min(Math.max(value, 0), 1)
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
    }
  } finally {
    bitmap.close()
  }
}

/**
 * Runs pose estimation over one clip by seeking frame to frame. Seeking rather
 * than playing keeps sampling deterministic and independent of playback speed,
 * which matters because these clips are analysed, not watched.
 */
async function extractVideoLandmarks(
  angle: FormCoachAngle,
  onFraction?: (fraction: number) => void
): Promise<FormCoachAngleLandmarks> {
  const landmarker = await getPoseLandmarker("VIDEO")
  const blob = base64ToBlob(angle.base64, angle.mimeType)
  const url = URL.createObjectURL(blob)
  const video = createDecoder(url)

  try {
    await onceReady(video)
    // Uploads sometimes report no duration until decoded; fall back to the
    // duration measured at capture time.
    const durationMs = Number.isFinite(video.duration)
      ? video.duration * 1000
      : angle.durationMs

    const frames: FormCoachFrame[] = []
    const step = 1000 / SAMPLE_FPS
    for (let timeMs = 0; timeMs < durationMs; timeMs += step) {
      await seekTo(video, timeMs / 1000)
      timestampCursor += step
      const result = landmarker.detectForVideo(video, timestampCursor)
      frames.push({
        timeMs: Math.round(timeMs),
        landmarks: result.landmarks[0] ?? [],
        worldLandmarks: result.worldLandmarks[0] ?? [],
      })
      onFraction?.(Math.min((timeMs + step) / durationMs, 1))
    }
    return { index: angle.index, frames }
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

/**
 * Runs every angle through MediaPipe and logs the landmarks.
 *
 * The result feeds the 3D preview the user confirms before anything is sent,
 * so a bad detection gets caught here rather than by the coach.
 *
 * Throwing keeps the draft and surfaces an error toast.
 */
export async function extractFormCoachLandmarks(
  submission: FormCoachSubmission,
  onProgress?: FormCoachProgressHandler
): Promise<FormCoachAngleLandmarks[]> {
  console.log(
    `[form-coach] ${submission.exerciseName} (${submission.slug}) — ${submission.angles.length} angle(s)`
  )

  const totalWeight = submission.angles.reduce(
    (total, angle) => total + formCoachAngleWeight(angle),
    0
  )
  let doneWeight = 0

  onProgress?.({ stage: "loading", value: 0 })
  // Warming the model before the loop means the long first wait is reported as
  // loading rather than as a frame that mysteriously takes ten seconds.
  await getPoseLandmarker(
    submission.angles.some((angle) => angle.kind === "video")
      ? "VIDEO"
      : "IMAGE"
  )
  onProgress?.({ stage: "reading", value: 0 })

  const results: FormCoachAngleLandmarks[] = []
  // Sequentially: the landmarker is single-instance and stateful in VIDEO mode.
  for (const angle of submission.angles) {
    const started = performance.now()
    const weight = formCoachAngleWeight(angle)
    const result =
      angle.kind === "image"
        ? await extractImageLandmarks(angle)
        : await extractVideoLandmarks(angle, (fraction) =>
            onProgress?.({
              stage: "reading",
              value: (doneWeight + fraction * weight) / totalWeight,
            })
          )
    doneWeight += weight
    onProgress?.({
      stage: "reading",
      value: formCoachProgressValue({
        doneWeight,
        currentWeight: 0,
        fraction: 0,
        totalWeight,
      }),
    })
    const rate = angle.kind === "image" ? "still" : `${SAMPLE_FPS}fps`
    console.log(
      `[form-coach] angle ${angle.index} (${angle.kind}): ${result.frames.length} frame(s) at ${rate} in ${Math.round(performance.now() - started)}ms`
    )
    for (const frame of result.frames) {
      console.log(
        `[form-coach] angle ${angle.index} @ ${frame.timeMs}ms —`,
        frame.landmarks.length === 0 ? "no pose detected" : frame.landmarks
      )
    }
    results.push(result)
  }

  // Every frame is estimated independently, so the raw output shakes even when
  // the lifter is still. Smoothing here means the 3D preview and whatever the
  // coach eventually scores both read the same clean motion.
  const smoothed = smoothFormCoachLandmarks(results)
  console.log("[form-coach] landmarks (smoothed)", smoothed)
  return smoothed
}

/** Coordinates rounded to the millimetre — well past what the model resolves. */
function compact(point: {
  x: number
  y: number
  z: number
  visibility?: number
}) {
  const round = (value: number, places: number) => {
    const factor = 10 ** places
    return Math.round(value * factor) / factor
  }
  return {
    x: round(point.x, 4),
    y: round(point.y, 4),
    z: round(point.z, 4),
    visibility: round(point.visibility ?? 1, 2),
  }
}

/**
 * Builds the payload the coach reasons over.
 *
 * The canonical reps are already body-framed and phase-normalised, so this is a
 * few hundred KB of numbers rather than tens of MB of video — and the server
 * needs no rep detection or basis-building of its own.
 */
export function buildFormCoachCapture(
  submission: FormCoachSubmission,
  fused: FusedReps
) {
  const kindByIndex = new Map(
    submission.angles.map((angle) => [angle.index, angle.kind])
  )
  return {
    capture: {
      slug: submission.slug,
      exerciseName: submission.exerciseName,
      repCount: fused.repCount,
      angles: fused.angles,
      reps: fused.reps.map((rep) => ({
        angleIndex: rep.angleIndex,
        repIndex: rep.repIndex,
        timing: rep.timing,
        frames: rep.frames.map((frame) => ({
          worldLandmarks: frame.worldLandmarks.map(compact),
        })),
      })),
      canonical: fused.angle.frames.map((frame) => ({
        worldLandmarks: frame.worldLandmarks.map(compact),
      })),
    },
    // Angle metadata is stored alongside the report so a saved session can say
    // how it was filmed without re-reading the landmark blob.
    angles: fused.angles.map((angle) => ({
      index: angle.index,
      kind: kindByIndex.get(angle.index) ?? "video",
      view: angle.view,
      repCount: angle.repCount,
      trackingRate: angle.trackingRate,
      durationMs: angle.durationMs,
    })),
  }
}

/**
 * Uploads the capture and asks the coach to analyse it.
 *
 * Called only after the user has looked at the 3D preview and confirmed the
 * tracking followed them, so what goes up is data a human has already
 * sanity-checked. Throwing keeps the draft so they can retry.
 */
export async function submitFormCoachClips(
  submission: FormCoachSubmission,
  landmarks: FormCoachAngleLandmarks[],
  orientation: { pitchDeg: number; rollDeg: number } = {
    pitchDeg: 0,
    rollDeg: 0,
  }
): Promise<{
  reportId: Id<"formCoachReports">
  report: FormCoachReport
  /** The canonical rep the report describes, for showing in the message. */
  frames: FormCoachFrame[]
}> {
  // Straightening is applied before fusing, so the coach measures the skeleton
  // the lifter approved rather than the raw one.
  const fused = fuseReps(applyOrientation(landmarks, orientation))
  if (!fused) {
    throw new Error("No complete reps were found in that footage")
  }

  const { capture, angles } = buildFormCoachCapture(submission, fused)

  const landmarksUploadId = await uploadOwnedFile(
    new Blob([JSON.stringify(capture)], { type: "application/json" }),
    "form_coach_landmarks",
    `${submission.slug}-${Date.now()}.json`
  )

  const result = await convexClient.action(api.ai.formCoachAgent.analyse, {
    exerciseId: submission.exerciseId,
    exerciseName: submission.exerciseName,
    slug: submission.slug,
    date: currentDateKey(),
    landmarksUploadId,
    angles,
    // Stored with the report so a pinned card still has a body to draw long
    // after the landmark blob stops being interesting.
    pose: fused.angle.frames.map((frame) => ({
      timeMs: frame.timeMs,
      worldLandmarks: frame.worldLandmarks.map((point) => ({
        x: Math.round(point.x * 1000) / 1000,
        y: Math.round(point.y * 1000) / 1000,
        z: Math.round(point.z * 1000) / 1000,
        visibility: Math.round((point.visibility ?? 1) * 100) / 100,
      })),
    })),
  })

  return {
    reportId: result.reportId as Id<"formCoachReports">,
    report: { exerciseName: submission.exerciseName, ...result.report },
    frames: fused.angle.frames,
  }
}
