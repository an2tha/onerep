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
import {
  applyOrientation,
  buildTimeline,
  collectReps,
  type CapturedRep,
  type CollectedReps,
  type TimelineSample,
  TIMELINE_DENSE_SAMPLE_MS,
} from "@/lib/pose-reps"
import { convexClient } from "@/lib/convex"
import type { FormCoachReport } from "@/lib/form-coach-message"
import { currentDateKey } from "@/lib/food-log"
import type { Id } from "../../../../convex/_generated/dataModel"
import { uploadOwnedFile } from "@/lib/owned-upload"
/**
 * Monthly AI requests one analysis spends. Mirrors `AI_USAGE_COST.form_coach`
 * in `convex/ai/usage.ts`, which is what actually enforces it; this copy only
 * decides when to show the paywall before the user films anything.
 */
export const FORM_COACH_AI_COST = 2

/** One movement the form coach can analyse, as returned by the backend. */
export type FormCoachExercise = {
  slug: string
  label: string
  keywords: string[]
  setup: string
  /** Set on the single entry that covers everything the others do not name. */
  fallback?: boolean
}

/**
 * Picks the movement to film an exercise as.
 *
 * A named match wins; anything else falls back to the generic entry, which is
 * relabelled with the exercise's own name so the camera screen says "Cable
 * Fly" rather than "Form check". Null only while the catalog is still loading.
 */
export function matchFormCoachExercise(
  exerciseName: string,
  supported: FormCoachExercise[] | undefined
): FormCoachExercise | null {
  if (!supported) return null
  const name = exerciseName.toLowerCase()
  const named = supported.find(
    (exercise) =>
      !exercise.fallback &&
      exercise.keywords.some((keyword) => name.includes(keyword))
  )
  if (named) return named

  const fallback = supported.find((exercise) => exercise.fallback)
  return fallback ? { ...fallback, label: exerciseName } : null
}

/**
 * Returns the form-coach movement for an exercise, or null while the catalog is
 * still loading. Every caller shares one subscription because the underlying
 * query takes no arguments.
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

/** One frame of the clip as a picture, for the coach to actually look at. */
export type ClipStill = {
  /** Milliseconds into the clip it was grabbed from. */
  timeMs: number
  /** `data:image/jpeg;base64,…`. */
  dataUrl: string
}

export type FormCoachAngleLandmarks = {
  index: number
  frames: FormCoachFrame[]
  /**
   * A spread of stills from across the clip. Sampled wide and narrowed to a
   * handful at submit time, once rep detection has said which moments matter.
   */
  stills?: ClipStill[]
}

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

/** Stills one analysis may send to the model. */
export const MAX_COACH_STILLS = 5

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

/** The still nearest a moment in a clip, or null when that clip has none. */
function stillNearest(pool: ClipStill[] | undefined, timeMs: number) {
  if (!pool || pool.length === 0) return null
  return pool.reduce((best, still) =>
    Math.abs(still.timeMs - timeMs) < Math.abs(best.timeMs - timeMs)
      ? still
      : best
  )
}

export type CoachStill = {
  angleIndex: number
  timeMs: number
  /** What the model is being shown, e.g. "angle 1, rep 2, turnaround". */
  label: string
  dataUrl: string
}

/**
 * The handful of frames the coach gets to look at.
 *
 * Turnarounds first, and one per angle before any angle gets a second, because
 * the bottom of the rep is where a lift is won or lost and a view the model has
 * not seen at all is worth more than a second look at one it has. The start of
 * the best-tracked angle comes last, as the reference the others are read
 * against.
 */
export function selectCoachStills(
  reps: CapturedRep[],
  angles: FormCoachAngleLandmarks[],
  summaries: Array<{ index: number; trackingRate: number }>,
  limit = MAX_COACH_STILLS
): CoachStill[] {
  const poolByAngle = new Map(
    angles.map((angle) => [angle.index, angle.stills])
  )
  const ranked = [...summaries].sort((a, b) => b.trackingRate - a.trackingRate)
  const chosen: CoachStill[] = []
  const taken = new Set<string>()

  const add = (rep: CapturedRep, offsetMs: number, phase: string) => {
    if (chosen.length >= limit) return
    const timeMs = rep.startMs + offsetMs
    const still = stillNearest(poolByAngle.get(rep.angleIndex), timeMs)
    if (!still) return
    const key = `${rep.angleIndex}:${still.timeMs}`
    if (taken.has(key)) return
    taken.add(key)
    chosen.push({
      angleIndex: rep.angleIndex,
      timeMs: still.timeMs,
      label: `angle ${rep.angleIndex}, rep ${rep.repIndex}, ${phase}`,
      dataUrl: still.dataUrl,
    })
  }

  /** The rep from an angle most worth looking at: the deepest-tracked one. */
  const pick = (angleIndex: number, nth: number) => {
    const forAngle = reps.filter((rep) => rep.angleIndex === angleIndex)
    return forAngle[Math.min(nth, forAngle.length - 1)]
  }

  for (let round = 0; round < 3 && chosen.length < limit; round += 1) {
    for (const summary of ranked) {
      const rep = pick(summary.index, round)
      if (rep) add(rep, rep.timing.toTurnaroundMs, "turnaround")
    }
  }

  const primary = ranked[0] ? pick(ranked[0].index, 0) : undefined
  if (primary) add(primary, 0, "start")

  return chosen.slice(0, limit)
}

/**
 * Builds the payload the coach reasons over.
 *
 * Reps are body-framed but otherwise as filmed, so this is a few hundred KB of
 * numbers rather than tens of MB of video — and the server needs no rep
 * detection or basis-building of its own.
 */
export function buildFormCoachCapture(
  submission: FormCoachSubmission,
  collected: CollectedReps,
  stills: CoachStill[] = [],
  timeline: TimelineSample[] = []
) {
  const kindByIndex = new Map(
    submission.angles.map((angle) => [angle.index, angle.kind])
  )
  return {
    capture: {
      slug: submission.slug,
      exerciseName: submission.exerciseName,
      repCount: collected.repCount,
      angles: collected.angles,
      reps: collected.reps.map((rep) => ({
        angleIndex: rep.angleIndex,
        repIndex: rep.repIndex,
        startMs: rep.startMs,
        timing: rep.timing,
        frames: rep.frames.map((frame) => ({
          timeMs: frame.timeMs,
          worldLandmarks: frame.worldLandmarks.map(compact),
        })),
      })),
      // The clip end to end, coarsely. Everything else in this payload is
      // rep-shaped, and a rep is already an interpretation of the footage.
      timeline: timeline.map((sample) => ({
        angleIndex: sample.angleIndex,
        timeMs: sample.timeMs,
        worldLandmarks: sample.worldLandmarks.map(compact),
      })),
      stills,
    },
    // Angle metadata is stored alongside the report so a saved session can say
    // how it was filmed without re-reading the landmark blob.
    angles: collected.angles.map((angle) => ({
      index: angle.index,
      kind: kindByIndex.get(angle.index) ?? "video",
      view: angle.view,
      repCount: angle.repCount,
      trackingRate: angle.trackingRate,
      durationMs: angle.durationMs,
      // Omitted rather than null when no rep was recognised: the stored
      // validator has always treated this as an optional string.
      ...(angle.repSignal ? { repSignal: angle.repSignal } : {}),
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
  /** The rep the report describes, for showing in the message. */
  frames: FormCoachFrame[]
}> {
  // Straightening is applied first, so the coach measures the skeleton the
  // lifter approved rather than the raw one.
  const oriented = applyOrientation(landmarks, orientation)
  const collected = collectReps(oriented)
  // Only genuinely empty footage is refused. A capture where no rep was
  // recognised still goes: the timeline, the stills and the angles carry plenty
  // to coach from, and rep detection failing is itself worth the coach seeing.
  if (!collected) {
    throw new Error("Nothing was tracked in that footage")
  }

  const stills = selectCoachStills(collected.reps, oriented, collected.angles)
  const { capture, angles } = buildFormCoachCapture(
    submission,
    collected,
    stills,
    // With no reps detected the point cloud is the only evidence the coach has,
    // so it is sampled densely enough to actually show a rep.
    buildTimeline(
      oriented,
      undefined,
      collected.repCount === 0 ? TIMELINE_DENSE_SAMPLE_MS : undefined
    )
  )

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
    pose: collected.display.frames.map((frame) => ({
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
    frames: collected.display.frames,
  }
}
