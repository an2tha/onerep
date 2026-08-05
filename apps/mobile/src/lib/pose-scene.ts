import type { FormCoachAngleLandmarks, FormCoachFrame } from "@/lib/form-coach"

export const POSE_LANDMARK_COUNT = 33

/**
 * Landmarks the scene leaves out.
 *
 * Eyes, ears and mouth (1–10) and the finger points (17–22) are the noisiest
 * part of the layout and say nothing about a squat. Drawn, they read as a
 * flickering cloud around the head and hands that makes the tracking look
 * broken even when the body is followed perfectly.
 *
 * The feet (29–32) are here for a different reason: the pose backend simply has
 * no such joints. COCO and H36M both stop at the ankle, so heels and toes would
 * have to be invented from the shin, and a fabricated foot is worse than an
 * honest absence — it would swing confidently through the floor at the bottom
 * of every squat.
 *
 * The nose (0) survives as the single head marker — head position does matter
 * for a squat — and the wrists (15, 16) and ankles (27, 28) still terminate the
 * limbs.
 */
export const IGNORED_POSE_LANDMARKS: ReadonlySet<number> = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 18, 19, 20, 21, 22, 29, 30, 31, 32,
])

/**
 * The skeleton the scene draws, as landmark index pairs. A trimmed version of
 * the BlazePose topology: no face mesh, no finger fan, and no foot triangles —
 * see `IGNORED_POSE_LANDMARKS` for why each group is gone. Kept here rather than
 * read off a pose library so the scene can be built and tested without loading a
 * model.
 */
export const POSE_BONES: ReadonlyArray<readonly [number, number]> = [
  // Neck — nose to each shoulder, standing in for a head that is otherwise
  // a single unconnected point.
  [0, 11],
  [0, 12],
  // Arms, ending at the wrists.
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  // Torso
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  // Legs, ending at the ankles.
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
]

/** Floats in the joint buffer: one xyz per landmark. */
export const JOINT_BUFFER_FLOATS = POSE_LANDMARK_COUNT * 3

/**
 * Floats in the bone buffer: two xyz endpoints per bone. Sized from the bone
 * list, never the landmark count — the two are unrelated, and sizing by
 * landmarks once overflowed this buffer at render time.
 */
export const BONE_BUFFER_FLOATS = POSE_BONES.length * 6

/** Landmarks below this are guesses, and drawing them invents a limb. */
export const MIN_VISIBILITY = 0.5

export type ScenePoint = { x: number; y: number; z: number; visible: boolean }

/**
 * Which coordinate system a frame's landmarks are already in.
 *
 * `camera` is the frame a provider reports in: y grows downward and z away from
 * the lens. `body` is what `toBodyFrame` produces for a fused rep — y-up and
 * z-forward, because the whole point of that frame is to be camera-independent.
 *
 * Getting this wrong flips the skeleton upside down, so it is named rather than
 * guessed at.
 */
export type PoseSpace = "camera" | "body"

/**
 * World landmarks are metres with the origin at the hip midpoint, y pointing
 * down and z pointing away from the camera. Three.js wants y up, so those are
 * negated — but only for data that is still in the camera's frame.
 */
export function toScenePoints(
  frame: FormCoachFrame | undefined,
  orientation: PoseOrientation = NEUTRAL_ORIENTATION,
  space: PoseSpace = "camera",
  /**
   * Ground the pose using someone else's transform.
   *
   * Two skeletons drawn together — a corrected pose over the original — must
   * share one, or each derives its own from its own feet and they end up
   * rotated relative to each other.
   */
  transform?: GroundTransform | null
): ScenePoint[] {
  if (!frame) return []
  // World landmarks are metric and camera-independent, which is what makes the
  // scene rotatable; normalized landmarks would be skewed by the framing.
  const source = frame.worldLandmarks.length
    ? frame.worldLandmarks
    : frame.landmarks
  const flip = space === "camera" ? -1 : 1
  // Indices are preserved rather than filtered out, because the bone list
  // addresses landmarks by index — compacting here would rewire the skeleton.
  const points = source.map((landmark, index) => ({
    x: landmark.x,
    y: flip * landmark.y,
    z: flip * landmark.z,
    visible:
      !IGNORED_POSE_LANDMARKS.has(index) &&
      (landmark.visibility ?? 1) >= MIN_VISIBILITY,
  }))
  if (transform) return applyGroundTransform(points, transform, orientation)
  return toGroundFrame(points, orientation) ?? points
}

/** Scene-space points before any grounding, for deriving a shared transform. */
export function toRawScenePoints(
  frame: FormCoachFrame | undefined,
  space: PoseSpace = "camera"
): ScenePoint[] {
  if (!frame) return []
  const source = frame.worldLandmarks.length
    ? frame.worldLandmarks
    : frame.landmarks
  const flip = space === "camera" ? -1 : 1
  return source.map((landmark, index) => ({
    x: landmark.x,
    y: flip * landmark.y,
    z: flip * landmark.z,
    visible:
      !IGNORED_POSE_LANDMARKS.has(index) &&
      (landmark.visibility ?? 1) >= MIN_VISIBILITY,
  }))
}

const LEFT_ANKLE = 27
const RIGHT_ANKLE = 28

/**
 * How far the viewer has been rotated by hand, in degrees.
 *
 * A phone propped against a water bottle is never quite level, and nothing in
 * the landmarks says which way gravity actually pointed. Rather than guess,
 * these let the lifter straighten their own skeleton.
 */
export type PoseOrientation = { pitchDeg: number; rollDeg: number }

export const NEUTRAL_ORIENTATION: PoseOrientation = { pitchDeg: 0, rollDeg: 0 }

type Vec = { x: number; y: number; z: number }

const cross = (a: Vec, b: Vec): Vec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const dot3 = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z
const len = (a: Vec) => Math.hypot(a.x, a.y, a.z)

/** Rodrigues rotation of `v` about the unit `axis` by `angle` radians. */
function rotateAbout(v: Vec, axis: Vec, angle: number): Vec {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const k = dot3(axis, v) * (1 - c)
  const perpendicular = cross(axis, v)
  return {
    x: v.x * c + perpendicular.x * s + axis.x * k,
    y: v.y * c + perpendicular.y * s + axis.y * k,
    z: v.z * c + perpendicular.z * s + axis.z * k,
  }
}

/**
 * Stands the lifter on the floor.
 *
 * World landmarks are hip-centred, so drawn as-is the skeleton hangs from its
 * hips — the head stays pinned while the feet swing underneath. This moves the
 * origin to the feet and levels them.
 *
 * It deliberately does NOT derive "up" from the body. An earlier version used
 * the direction from the feet to the hips, which is fine standing but badly
 * wrong mid-rep: at the bottom of a squat the hips sit well behind the ankles,
 * so that vector leans back ~30° and rotating it upright tips the whole lifter
 * forward. The camera's own vertical is a far better estimate of gravity, so it
 * is kept, and the feet are levelled with the smallest rotation that does it.
 *
 * Returns null when the ankles are not tracked well enough to define a floor,
 * in which case the caller keeps the hip-centred view.
 */
/** Where the floor is for one pose, so another can be placed on the same one. */
export type GroundTransform = { feet: Vec; axis: Vec; angle: number }

export function groundTransform(points: ScenePoint[]): GroundTransform | null {
  const leftAnkle = points[LEFT_ANKLE]
  const rightAnkle = points[RIGHT_ANKLE]
  if (!leftAnkle?.visible || !rightAnkle?.visible) return null

  const feet = {
    x: (leftAnkle.x + rightAnkle.x) / 2,
    y: (leftAnkle.y + rightAnkle.y) / 2,
    z: (leftAnkle.z + rightAnkle.z) / 2,
  }

  const across: Vec = {
    x: rightAnkle.x - leftAnkle.x,
    y: rightAnkle.y - leftAnkle.y,
    z: rightAnkle.z - leftAnkle.z,
  }
  const acrossLength = len(across)

  // Smallest rotation that drops the ankle line into the horizontal plane, so
  // the feet end up level without disturbing anything else more than necessary.
  let levelAxis: Vec = { x: 1, y: 0, z: 0 }
  let levelAngle = 0
  if (acrossLength > 1e-6) {
    const unit = {
      x: across.x / acrossLength,
      y: across.y / acrossLength,
      z: across.z / acrossLength,
    }
    const flat = { x: unit.x, y: 0, z: unit.z }
    const flatLength = len(flat)
    if (flatLength > 1e-6) {
      const target = {
        x: flat.x / flatLength,
        y: 0,
        z: flat.z / flatLength,
      }
      const axis = cross(unit, target)
      const axisLength = len(axis)
      if (axisLength > 1e-9) {
        levelAxis = {
          x: axis.x / axisLength,
          y: axis.y / axisLength,
          z: axis.z / axisLength,
        }
        levelAngle = Math.atan2(axisLength, dot3(unit, target))
      }
    }
  }

  return { feet, axis: levelAxis, angle: levelAngle }
}

export function applyGroundTransform(
  points: ScenePoint[],
  transform: GroundTransform,
  orientation: PoseOrientation = NEUTRAL_ORIENTATION
): ScenePoint[] {
  const pitch = (orientation.pitchDeg * Math.PI) / 180
  const roll = (orientation.rollDeg * Math.PI) / 180

  return points.map((point) => {
    const local: Vec = {
      x: point.x - transform.feet.x,
      y: point.y - transform.feet.y,
      z: point.z - transform.feet.z,
    }
    let moved = rotateAbout(local, transform.axis, transform.angle)
    // Hand adjustments last, about the world axes, so a nudge behaves the way it
    // looks on screen rather than in some intermediate frame.
    if (pitch !== 0) moved = rotateAbout(moved, { x: 1, y: 0, z: 0 }, pitch)
    if (roll !== 0) moved = rotateAbout(moved, { x: 0, y: 0, z: 1 }, roll)
    return { ...moved, visible: point.visible }
  })
}

export function toGroundFrame(
  points: ScenePoint[],
  orientation: PoseOrientation = NEUTRAL_ORIENTATION
): ScenePoint[] | null {
  const transform = groundTransform(points)
  if (!transform) return null
  return applyGroundTransform(points, transform, orientation)
}

/** Bones with both ends confidently tracked, as flat line-segment vertices. */
export function boneVertices(points: ScenePoint[]): number[] {
  const vertices: number[] = []
  for (const [from, to] of POSE_BONES) {
    const a = points[from]
    const b = points[to]
    if (!a || !b || !a.visible || !b.visible) continue
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }
  return vertices
}

/** Frames that actually found a pose, which is what the preview can show. */
export function trackedFrames(angle: FormCoachAngleLandmarks | undefined) {
  if (!angle) return []
  return angle.frames.filter((frame) => frame.landmarks.length > 0)
}

/**
 * Share of sampled frames where a pose was found. Surfaced in the preview so a
 * clip that only tracked half the time is obvious before it reaches the coach.
 */
export function trackingRate(angle: FormCoachAngleLandmarks | undefined) {
  if (!angle || angle.frames.length === 0) return 0
  return trackedFrames(angle).length / angle.frames.length
}
