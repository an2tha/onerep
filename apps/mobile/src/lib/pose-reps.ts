import type { FormCoachAngleLandmarks, FormCoachFrame } from "@/lib/form-coach"
import { MIN_VISIBILITY, POSE_LANDMARK_COUNT } from "@/lib/pose-scene"

const NOSE = 0
const LEFT_SHOULDER = 11
const RIGHT_SHOULDER = 12
const LEFT_HIP = 23
const RIGHT_HIP = 24
const LEFT_ANKLE = 27
const RIGHT_ANKLE = 28

/** Samples in one canonical rep. 24 at ~2s a rep is roughly 12fps of playback. */
export const REP_PHASE_SAMPLES = 24

/**
 * Minimum hip-travel, in metres, before a dip counts as a rep rather than a
 * shuffle or a tracking wobble.
 */
export const MIN_REP_RANGE_M = 0.12

type Vec = { x: number; y: number; z: number }
type Point = Vec & { visibility?: number }

/**
 * Gravity, as MediaPipe sees it. Its world y grows *downward*, so up is -y.
 * The camera's own vertical is the only estimate of gravity available, which is
 * why the viewer offers a manual correction on top.
 */
const RAW_UP: Vec = { x: 0, y: -1, z: 0 }

const sub = (a: Vec, b: Vec) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (a: Vec, k: number) => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const mid = (a: Vec, b: Vec) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
})
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec, b: Vec) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const length = (a: Vec) => Math.sqrt(dot(a, a))

function normalize(a: Vec): Vec | null {
  const l = length(a)
  return l < 1e-6 ? null : { x: a.x / l, y: a.y / l, z: a.z / l }
}

/**
 * Rewrites landmarks into a body-fixed frame: origin at the hips, +x from left
 * hip to right hip, +y up the torso, +z out the front.
 *
 * Without this, angles cannot be combined at all. MediaPipe's world landmarks
 * are metric but still camera-relative, so the same squat filmed from the side
 * and from the front produces two point clouds rotated ~90° apart. Averaging
 * them raw would collapse the lifter into a smear. In the body frame both
 * describe the same shape and can be compared point for point.
 *
 * Returns null when the torso landmarks needed to build the basis are missing.
 */
export function toBodyFrame(
  points: readonly Point[],
  up: Vec = RAW_UP
): Point[] | null {
  const leftHip = points[LEFT_HIP]
  const rightHip = points[RIGHT_HIP]
  if (!leftHip || !rightHip) return null

  const hipCentre = mid(leftHip, rightHip)
  const hipLine = sub(rightHip, leftHip)
  // Only the horizontal part of the hip line, so the vertical axis stays
  // gravity and the rotation removed is purely yaw.
  const across = normalize(sub(hipLine, scale(up, dot(hipLine, up))))
  if (!across) return null
  const forward = normalize(cross(across, up))
  if (!forward) return null

  return points.map((point) => {
    const local = sub(point, hipCentre)
    return {
      x: dot(local, across),
      y: dot(local, up),
      z: dot(local, forward),
      visibility: point.visibility,
    }
  })
}

/**
 * Rotates raw landmarks, so a hand-applied tilt reaches the measurements and
 * not just the picture.
 *
 * Body framing removes yaw only, which is what lets a front and a side clip be
 * compared — but it means a global rotation is otherwise cancelled, and the
 * coach would measure an unstraightened skeleton while the lifter looks at a
 * straightened one.
 *
 * The viewer works in scene coordinates, which negate y and z relative to
 * MediaPipe's. Under that flip a rotation about x is unchanged, while one about
 * z reverses — hence the sign on roll.
 */
export function applyOrientation(
  angles: readonly FormCoachAngleLandmarks[],
  orientation: { pitchDeg: number; rollDeg: number }
): FormCoachAngleLandmarks[] {
  const pitch = (orientation.pitchDeg * Math.PI) / 180
  const roll = (-orientation.rollDeg * Math.PI) / 180
  if (pitch === 0 && roll === 0) return angles as FormCoachAngleLandmarks[]

  const rotate = (p: Point): Point => {
    const cy = Math.cos(pitch)
    const sy = Math.sin(pitch)
    const y1 = p.y * cy - p.z * sy
    const z1 = p.y * sy + p.z * cy
    const cz = Math.cos(roll)
    const sz = Math.sin(roll)
    return {
      x: p.x * cz - y1 * sz,
      y: p.x * sz + y1 * cz,
      z: z1,
      visibility: p.visibility,
    }
  }

  return angles.map((angle) => ({
    ...angle,
    frames: angle.frames.map((frame) => ({
      ...frame,
      landmarks: frame.landmarks.map((p) => ({
        ...rotate(p),
        visibility: p.visibility ?? 1,
      })),
      worldLandmarks: frame.worldLandmarks.map((p) => ({
        ...rotate(p),
        visibility: p.visibility ?? 1,
      })),
    })),
  }))
}

/**
 * How far the hips sit above the ankles, in metres.
 *
 * This is the rep signal. Hip *height* is useless here — world landmarks are
 * hip-centred, so the hips are pinned at the origin by definition — but the
 * hip-to-ankle distance shrinks as the lifter descends and is invariant to
 * which way the camera was pointing.
 */
export function hipToAnkle(frame: FormCoachFrame): number | null {
  const points = frame.worldLandmarks
  if (points.length === 0) return null
  const ankles = [points[LEFT_ANKLE], points[RIGHT_ANKLE]].filter(
    (point) => point !== undefined && (point.visibility ?? 1) >= MIN_VISIBILITY
  )
  if (ankles.length === 0) return null
  const hips = mid(
    points[LEFT_HIP] ?? { x: 0, y: 0, z: 0 },
    points[RIGHT_HIP] ?? { x: 0, y: 0, z: 0 }
  )
  return (
    ankles.reduce((total, ankle) => total + length(sub(ankle, hips)), 0) /
    ankles.length
  )
}

export type Rep = {
  /** Frame indices: standing, deepest point, standing again. */
  startIndex: number
  bottomIndex: number
  endIndex: number
}

/**
 * Finds reps as descend-and-return cycles in the hip-to-ankle signal.
 *
 * Uses hysteresis rather than plain local minima: a lifter pausing or bouncing
 * at the bottom produces several minima within one rep, and thresholding on a
 * single midpoint would count each of them.
 */
export function detectReps(frames: readonly FormCoachFrame[]): Rep[] {
  const signal = frames.map(hipToAnkle)
  const tracked = signal.filter((value): value is number => value !== null)
  if (tracked.length < 4) return []

  const top = Math.max(...tracked)
  const bottom = Math.min(...tracked)
  const range = top - bottom
  if (range < MIN_REP_RANGE_M) return []

  // Wide band so noise around either end cannot re-trigger the state machine.
  const standing = bottom + range * 0.75
  const deep = bottom + range * 0.35

  const reps: Rep[] = []
  let phase: "standing" | "descending" = "standing"
  let startIndex = 0
  let bottomIndex = 0
  let bottomValue = Infinity

  for (let i = 0; i < signal.length; i += 1) {
    const value = signal[i]
    if (value === null) continue

    if (phase === "standing") {
      if (value >= standing) startIndex = i
      if (value <= deep) {
        phase = "descending"
        bottomIndex = i
        bottomValue = value
      }
      continue
    }

    if (value < bottomValue) {
      bottomValue = value
      bottomIndex = i
    }
    if (value >= standing) {
      reps.push({ startIndex, bottomIndex, endIndex: i })
      phase = "standing"
      startIndex = i
      bottomValue = Infinity
    }
  }

  return reps
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    visibility:
      (a.visibility ?? 1) + ((b.visibility ?? 1) - (a.visibility ?? 1)) * t,
  }
}

/**
 * One rep resampled onto a fixed phase grid, 0 = standing to 1 = standing.
 * Reps differ in duration, so they have to share an axis before they can be
 * averaged — otherwise a slow rep would dominate a fast one.
 */
function resampleRep(
  bodyFrames: ReadonlyArray<Point[] | null>,
  rep: Rep,
  samples: number
): Array<Point[] | null> {
  const span = rep.endIndex - rep.startIndex
  if (span <= 0) return []

  return Array.from({ length: samples }, (_, step) => {
    const position = rep.startIndex + (span * step) / (samples - 1)
    const low = Math.floor(position)
    const high = Math.min(Math.ceil(position), rep.endIndex)
    const t = position - low

    const a = bodyFrames[low]
    const b = bodyFrames[high]
    if (!a || !b) return a ?? b ?? null
    return a.map((point, index) => {
      const next = b[index]
      return next ? lerpPoint(point, next, t) : point
    })
  })
}

/**
 * Which way the camera was pointing relative to the lifter.
 *
 * This decides which measurements can be trusted at all — knee tracking is only
 * visible from the front, torso lean only from the side — so it travels with the
 * data rather than being guessed downstream.
 */
export type CameraView = "front" | "back" | "side" | "oblique"

/** One rep, resampled onto the canonical phase grid. */
export type CanonicalRep = {
  /** 1-based index of the angle it came from. */
  angleIndex: number
  /** Order within that angle, 1-based. */
  repIndex: number
  frames: FormCoachFrame[]
  /**
   * Real durations, in milliseconds. Phase-normalising the frames throws timing
   * away, so it is carried alongside — without it there is no tempo to report.
   */
  timing: { totalMs: number; toTurnaroundMs: number }
}

export type AngleSummary = {
  index: number
  view: CameraView
  repCount: number
  /** Share of frames in which a pose was found, 0–1. */
  trackingRate: number
  durationMs: number
}

export type FusedReps = {
  /** A single canonical rep, as frames the viewer can play. */
  angle: FormCoachAngleLandmarks
  /** Every contributing rep on its own, for consistency and fatigue questions. */
  reps: CanonicalRep[]
  /** Per-angle capture metadata. */
  angles: AngleSummary[]
  /** How many reps went into it. */
  repCount: number
  /** How many angles contributed at least one rep. */
  angleCount: number
}

/** Within this many degrees of square-on counts as a front or back view. */
const FRONTAL_TOLERANCE_DEG = 30
/** Within this many degrees of edge-on counts as a side view. */
const SAGITTAL_TOLERANCE_DEG = 30

/**
 * Where the camera stood, from the *raw* camera-frame landmarks.
 *
 * Deliberately not the body-framed ones: body framing exists to remove the
 * camera's orientation, which is precisely the signal needed here.
 *
 * MediaPipe world landmarks sit in a camera-relative frame — x across the image,
 * z into it — so the shoulder line's bearing in the horizontal plane says how
 * square-on the shot was. Running left-to-right across the image means front or
 * back; running into the image means side.
 *
 * Front and back are then separated by the nose's depth relative to the
 * shoulders. That is a fact about faces rather than a convention: the nose
 * protrudes from the front of the head, so it sits nearer the camera when the
 * lifter faces it. Deciding on the sign of the shoulder line's x instead would
 * depend on whether the frame is mirrored, which is not something to guess at.
 *
 * Averaged over the whole clip, because one frame can be thrown by a turn of the
 * shoulders. Four coarse buckets, because monocular z is not accurate enough to
 * justify a finer answer.
 */
export function classifyCameraView(
  frames: readonly FormCoachFrame[]
): CameraView {
  let acrossX = 0
  let acrossZ = 0
  let noseDepth = 0
  let counted = 0

  for (const frame of frames) {
    const points = frame.worldLandmarks
    if (points.length === 0) continue
    const left = points[LEFT_SHOULDER]
    const right = points[RIGHT_SHOULDER]
    const nose = points[NOSE]
    if (!left || !right || !nose) continue

    const dx = right.x - left.x
    const dz = right.z - left.z
    const span = Math.hypot(dx, dz)
    if (span < 1e-6) continue

    // Normalised per frame so a frame shot closer to the camera does not weigh
    // more than one shot further away.
    acrossX += dx / span
    acrossZ += dz / span
    // MediaPipe z grows away from the camera, so a negative offset means the
    // face is turned towards it.
    noseDepth += nose.z - (left.z + right.z) / 2
    counted += 1
  }

  if (counted === 0) return "oblique"

  const magnitude = Math.hypot(acrossX, acrossZ)
  if (magnitude < 1e-6) return "oblique"

  // 0 = shoulder line runs straight across the image, 90 = straight into it.
  const offAxisDeg =
    (Math.atan2(Math.abs(acrossZ), Math.abs(acrossX)) * 180) / Math.PI

  if (offAxisDeg >= 90 - SAGITTAL_TOLERANCE_DEG) return "side"
  if (offAxisDeg <= FRONTAL_TOLERANCE_DEG) {
    // Squarely in the frontal plane but the face gives nothing away — better to
    // report an uncertain view than to guess which way they were facing.
    if (Math.abs(noseDepth) < 1e-6) return "oblique"
    return noseDepth < 0 ? "front" : "back"
  }
  return "oblique"
}

/**
 * Averages every rep from every angle into one canonical rep.
 *
 * Combining angles is what makes this cleaner than any single view: a joint the
 * side camera lost behind the torso is usually plain to the front camera, and
 * averaging in the body frame cancels the independent estimation error in each.
 *
 * Returns null when no angle contained a recognisable rep — a still photo, or
 * footage where the lifter never actually descended.
 */
export function fuseReps(
  angles: readonly FormCoachAngleLandmarks[]
): FusedReps | null {
  // [phase][landmark] -> running visibility-weighted sum
  const sums = Array.from({ length: REP_PHASE_SAMPLES }, () =>
    Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
      x: 0,
      y: 0,
      z: 0,
      weight: 0,
      visibility: 0,
      samples: 0,
    }))
  )

  let repCount = 0
  let contributingAngles = 0
  const canonicalReps: CanonicalRep[] = []
  const angleSummaries: AngleSummary[] = []

  for (const angle of angles) {
    const reps = detectReps(angle.frames)
    if (reps.length === 0) continue
    contributingAngles += 1

    const trackedCount = angle.frames.filter(
      (frame) => frame.worldLandmarks.length > 0
    ).length
    angleSummaries.push({
      index: angle.index,
      view: classifyCameraView(angle.frames),
      repCount: reps.length,
      trackingRate:
        angle.frames.length === 0 ? 0 : trackedCount / angle.frames.length,
      durationMs: angle.frames.at(-1)?.timeMs ?? 0,
    })

    const bodyFrames = angle.frames.map((frame) =>
      frame.worldLandmarks.length === 0
        ? null
        : toBodyFrame(frame.worldLandmarks)
    )

    for (const rep of reps) {
      const resampled = resampleRep(bodyFrames, rep, REP_PHASE_SAMPLES)
      if (resampled.length === 0) continue
      repCount += 1

      const startMs = angle.frames[rep.startIndex]?.timeMs ?? 0
      canonicalReps.push({
        angleIndex: angle.index,
        repIndex:
          canonicalReps.filter((r) => r.angleIndex === angle.index).length + 1,
        timing: {
          totalMs: (angle.frames[rep.endIndex]?.timeMs ?? startMs) - startMs,
          toTurnaroundMs:
            (angle.frames[rep.bottomIndex]?.timeMs ?? startMs) - startMs,
        },
        frames: resampled.map((points, phase): FormCoachFrame => {
          const landmarks = (points ?? []).map((point) => ({
            x: point.x,
            y: point.y,
            z: point.z,
            visibility: point.visibility ?? 1,
          }))
          return {
            timeMs: Math.round((phase / (REP_PHASE_SAMPLES - 1)) * 2000),
            landmarks,
            worldLandmarks: landmarks,
          }
        }),
      })

      resampled.forEach((points, phase) => {
        if (!points) return
        points.forEach((point, landmark) => {
          const slot = sums[phase]?.[landmark]
          if (!slot) return
          // Confidence-weighted: a joint one camera barely saw should not pull
          // the average away from the camera that saw it clearly.
          const visibility = point.visibility ?? 1
          const weight = Math.max(visibility, 0.01)
          slot.x += point.x * weight
          slot.y += point.y * weight
          slot.z += point.z * weight
          slot.weight += weight
          slot.visibility += visibility
          slot.samples += 1
        })
      })
    }
  }

  if (repCount === 0) return null

  const frames: FormCoachFrame[] = sums.map((phaseSlots, phase) => {
    const points = phaseSlots.map((slot) => {
      if (slot.weight === 0) {
        return { x: 0, y: 0, z: 0, visibility: 0 }
      }
      return {
        x: slot.x / slot.weight,
        y: slot.y / slot.weight,
        z: slot.z / slot.weight,
        visibility: slot.visibility / slot.samples,
      }
    })
    return {
      // Phase as milliseconds across a nominal 2s rep, so the existing scrubber
      // and playback need no special case for fused frames.
      timeMs: Math.round((phase / (REP_PHASE_SAMPLES - 1)) * 2000),
      landmarks: points,
      worldLandmarks: points,
    }
  })

  return {
    angle: { index: 0, frames },
    reps: canonicalReps,
    angles: angleSummaries,
    repCount,
    angleCount: contributingAngles,
  }
}
