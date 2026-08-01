import type { FormCoachFrame } from "@/lib/form-coach"

/**
 * Turns the coach's advice into a pose you can look at.
 *
 * The agent cannot invent 33 landmarks, and asking it to would produce a body
 * that does not hold together. Instead it names a joint and the angle it should
 * have reached, and the correction is applied here as real geometry: the limb
 * below the joint is rotated about it until the angle matches, carrying
 * everything further down the chain with it.
 *
 * The result is the lifter's own body in the position being asked for, rather
 * than a generic diagram.
 */
export type PoseCorrection = {
  joint: "knee" | "hip" | "ankle" | "elbow" | "shoulder"
  side: "left" | "right" | "both"
  /** Where in the rep the correction applies. */
  phase: string
  /** What the joint should read, in degrees. */
  targetDegrees: number
}

const LANDMARK = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const

/**
 * For each joint: the landmark above it, the joint itself, and everything that
 * moves when it bends. Order matters — the chain is rotated as one piece so the
 * limb stays rigid.
 */
const CHAINS: Record<
  PoseCorrection["joint"],
  { proximal: string; vertex: string; chain: string[] }
> = {
  knee: {
    proximal: "Hip",
    vertex: "Knee",
    chain: ["Ankle", "Heel", "Foot"],
  },
  hip: {
    proximal: "Shoulder",
    vertex: "Hip",
    chain: ["Knee", "Ankle", "Heel", "Foot"],
  },
  ankle: { proximal: "Knee", vertex: "Ankle", chain: ["Heel", "Foot"] },
  elbow: { proximal: "Shoulder", vertex: "Elbow", chain: ["Wrist"] },
  shoulder: { proximal: "Hip", vertex: "Shoulder", chain: ["Elbow", "Wrist"] },
}

type Vec = { x: number; y: number; z: number }

const sub = (a: Vec, b: Vec): Vec => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
})
const add = (a: Vec, b: Vec): Vec => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
})
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec, b: Vec): Vec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const norm = (a: Vec) => Math.sqrt(dot(a, a))

function unit(a: Vec): Vec | null {
  const length = norm(a)
  return length < 1e-9
    ? null
    : { x: a.x / length, y: a.y / length, z: a.z / length }
}

function rotateAbout(v: Vec, axis: Vec, angle: number): Vec {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const k = dot(axis, v) * (1 - c)
  const perpendicular = cross(axis, v)
  return {
    x: v.x * c + perpendicular.x * s + axis.x * k,
    y: v.y * c + perpendicular.y * s + axis.y * k,
    z: v.z * c + perpendicular.z * s + axis.z * k,
  }
}

function index(side: "left" | "right", suffix: string) {
  return LANDMARK[`${side}${suffix}` as keyof typeof LANDMARK]
}

/** Interior angle at a joint, in degrees, or null when a point is missing. */
export function measureJoint(
  points: readonly Vec[],
  joint: PoseCorrection["joint"],
  side: "left" | "right"
): number | null {
  const spec = CHAINS[joint]
  const proximal = points[index(side, spec.proximal)]
  const vertex = points[index(side, spec.vertex)]
  const distal = points[index(side, spec.chain[0])]
  if (!proximal || !vertex || !distal) return null
  const a = unit(sub(proximal, vertex))
  const b = unit(sub(distal, vertex))
  if (!a || !b) return null
  return (Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * 180) / Math.PI
}

function applyToSide(
  points: Array<Vec & { visibility?: number }>,
  joint: PoseCorrection["joint"],
  side: "left" | "right",
  targetDegrees: number
) {
  const spec = CHAINS[joint]
  const current = measureJoint(points, joint, side)
  if (current === null) return

  const vertex = points[index(side, spec.vertex)]
  const proximal = points[index(side, spec.proximal)]
  const distal = points[index(side, spec.chain[0])]
  if (!vertex || !proximal || !distal) return

  const toProximal = unit(sub(proximal, vertex))
  const toDistal = unit(sub(distal, vertex))
  if (!toProximal || !toDistal) return

  // Rotate within the plane the limb already occupies, so a correction opens or
  // closes the joint without twisting the leg sideways.
  const axis = unit(cross(toProximal, toDistal))
  if (!axis) return

  // Rotating the far segment about `proximal × distal` opens the joint, so the
  // signed difference to the target is exactly the rotation needed.
  const delta = ((targetDegrees - current) * Math.PI) / 180
  for (const name of spec.chain) {
    const at = index(side, name)
    const point = points[at]
    if (!point) continue
    const moved = rotateAbout(sub(point, vertex), axis, delta)
    points[at] = { ...point, ...add(moved, vertex) }
  }
}

/**
 * A copy of the rep with the corrections applied at the phase they belong to.
 *
 * Corrections are eased in across the rep rather than snapping on at one frame,
 * because a skeleton that jumps at the bottom reads as a glitch rather than as
 * advice. Weighting follows how far each frame is into the movement.
 */
export function applyCorrections(
  frames: readonly FormCoachFrame[],
  corrections: readonly PoseCorrection[]
): FormCoachFrame[] {
  if (corrections.length === 0) return frames as FormCoachFrame[]

  return frames.map((frame, frameIndex) => {
    const points = frame.worldLandmarks.map((point) => ({ ...point }))
    // Full strength at the furthest point of the rep, tapering to nothing at
    // either end where the lifter is simply standing.
    const progress = frames.length < 2 ? 1 : frameIndex / (frames.length - 1)
    const strength = Math.sin(Math.PI * progress)

    for (const correction of corrections) {
      const sides: Array<"left" | "right"> =
        correction.side === "both" ? ["left", "right"] : [correction.side]
      for (const side of sides) {
        const current = measureJoint(points, correction.joint, side)
        if (current === null) continue
        const eased = current + (correction.targetDegrees - current) * strength
        applyToSide(points, correction.joint, side, eased)
      }
    }

    return { ...frame, landmarks: points, worldLandmarks: points }
  })
}
