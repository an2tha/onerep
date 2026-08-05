import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
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

/**
 * One tracked joint.
 *
 * Structurally a pose library's `Landmark`, but declared here so nothing downstream
 * of pose estimation has to import a pose library to name a point. Visibility
 * is optional because not every backend reports it; absent means certain.
 */
export type PoseLandmark = {
  x: number
  y: number
  z: number
  /** 0–1 confidence the joint was actually seen. */
  visibility?: number
}

/** Landmarks sampled from one frame of one angle. */
export type FormCoachFrame = {
  /** Milliseconds into the clip. */
  timeMs: number
  /** 33 landmarks, normalized to 0–1 against the frame. Empty if no pose. */
  landmarks: PoseLandmark[]
  /** The same points in metres, origin at the hip midpoint. */
  worldLandmarks: PoseLandmark[]
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

/** Stills one analysis may send to the model. */
export const MAX_COACH_STILLS = 5

/**
 * The swappable half of the pipeline: whatever turns a recorded angle into
 * landmarks and stills.
 *
 * Everything downstream of this — smoothing, rep detection, still selection,
 * the 3D preview, the upload — reads `FormCoachAngleLandmarks` and knows
 * nothing about how the points were produced, so a backend swap stops here.
 *
 * Two things a provider must honour, because the rest of the pipeline is built
 * on them: landmarks come in the 33-point BlazePose layout (see `pose-scene.ts`,
 * which names the joints by index), and `worldLandmarks` are metres with the
 * origin at the hip midpoint, y growing downward and z away from the lens. A
 * backend with a different skeleton has to remap to that layout inside its
 * provider — `pose-joints.ts` is where the current one does it, and the slots it
 * cannot fill are declared in `IGNORED_POSE_LANDMARKS`.
 */
export type PoseProvider = {
  /** Named in logs, so a capture can be traced back to what produced it. */
  readonly id: string
  /**
   * How densely clips are sampled, for logging only. Providers that do not
   * sample on a fixed clock can leave it out.
   */
  readonly sampleFps?: number
  /**
   * Loads models and runtimes ahead of the first frame, given the kinds of
   * angle about to be read. Optional: a provider with nothing to load can skip
   * it, at the cost of the wait being reported as reading rather than loading.
   */
  warm?(kinds: FormCoachAngleKind[]): Promise<void>
  /**
   * Landmarks for one angle, with `onFraction` reporting 0–1 progress through
   * the clip. Rejecting fails the analysis and keeps the user's draft, so
   * throw rather than returning empty frames when the footage cannot be read.
   */
  estimateAngle(
    angle: FormCoachAngle,
    onFraction?: (fraction: number) => void
  ): Promise<FormCoachAngleLandmarks>
  /** Releases models and other held resources. */
  dispose?(): Promise<void> | void
}

let activeProvider: PoseProvider | null = null

/**
 * Swaps the pose backend. Pass null to fall back to the default.
 *
 * Nothing is disposed on the way out — a provider that holds a model decides
 * for itself whether being swapped away means letting it go.
 */
export function setPoseProvider(provider: PoseProvider | null) {
  activeProvider = provider
}

/**
 * The provider in force, defaulting to YOLO-pose feeding MotionBERT.
 *
 * Loaded dynamically so this module stays free of any one backend: the
 * onnxruntime bundle and the models it fetches are only pulled in if nothing
 * else was registered by the time footage is actually read.
 */
export async function getPoseProvider(): Promise<PoseProvider> {
  if (!activeProvider) {
    const { motionBertPoseProvider } = await import("@/lib/motionbert")
    activeProvider ??= motionBertPoseProvider
  }
  return activeProvider
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

/**
 * Runs every angle through the pose provider and logs the landmarks.
 *
 * The result feeds the 3D preview the user confirms before anything is sent,
 * so a bad detection gets caught here rather than by the coach.
 *
 * Throwing keeps the draft and surfaces an error toast.
 */
export async function extractFormCoachLandmarks(
  submission: FormCoachSubmission,
  onProgress?: FormCoachProgressHandler,
  /** Overrides the registered provider, for one analysis. */
  provider?: PoseProvider
): Promise<FormCoachAngleLandmarks[]> {
  const pose = provider ?? (await getPoseProvider())
  console.log(
    `[form-coach] ${submission.exerciseName} (${submission.slug}) — ${submission.angles.length} angle(s) via ${pose.id}`
  )

  const totalWeight = submission.angles.reduce(
    (total, angle) => total + formCoachAngleWeight(angle),
    0
  )
  let doneWeight = 0

  onProgress?.({ stage: "loading", value: 0 })
  await pose.warm?.(submission.angles.map((angle) => angle.kind))
  onProgress?.({ stage: "reading", value: 0 })

  const results: FormCoachAngleLandmarks[] = []
  // Sequentially: a provider is free to hold one stateful decoder, and to size
  // its own memory on the assumption that one clip is in flight at a time.
  for (const angle of submission.angles) {
    const started = performance.now()
    const weight = formCoachAngleWeight(angle)
    const result = await pose.estimateAngle(angle, (fraction) =>
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
    const rate =
      angle.kind === "image"
        ? "still"
        : pose.sampleFps
          ? `${pose.sampleFps}fps`
          : "clip rate"
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
