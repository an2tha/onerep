import { describe, expect, it } from "bun:test"
import {
  BONE_BUFFER_FLOATS,
  IGNORED_POSE_LANDMARKS,
  toGroundFrame,
  NEUTRAL_ORIENTATION,
  applyGroundTransform,
  groundTransform,
  JOINT_BUFFER_FLOATS,
  MIN_VISIBILITY,
  POSE_BONES,
  POSE_LANDMARK_COUNT,
  boneVertices,
  toScenePoints,
  trackedFrames,
  trackingRate,
} from "@/lib/pose-scene"
import type { FormCoachFrame } from "@/lib/form-coach"

function landmark(x: number, y: number, z: number, visibility = 1) {
  return { x, y, z, visibility }
}

function frame(overrides: Partial<FormCoachFrame> = {}): FormCoachFrame {
  return {
    timeMs: 0,
    landmarks: [],
    worldLandmarks: [],
    ...overrides,
  }
}

describe("toScenePoints", () => {
  it("flips y and z so the lifter stands upright facing the camera", () => {
    const points = toScenePoints(
      frame({ worldLandmarks: [landmark(0.1, 0.2, 0.3)] })
    )
    expect(points[0]).toEqual({ x: 0.1, y: -0.2, z: -0.3, visible: true })
  })

  it("prefers metric world landmarks over framing-dependent ones", () => {
    const points = toScenePoints(
      frame({
        landmarks: [landmark(9, 9, 9)],
        worldLandmarks: [landmark(1, 1, 1)],
      })
    )
    expect(points[0]?.x).toBe(1)
  })

  it("falls back to normalized landmarks when there are no world ones", () => {
    const points = toScenePoints(frame({ landmarks: [landmark(9, 9, 9)] }))
    expect(points[0]?.x).toBe(9)
  })

  it("marks low-confidence landmarks as not visible", () => {
    const points = toScenePoints(
      frame({
        worldLandmarks: [
          landmark(0, 0, 0, MIN_VISIBILITY),
          landmark(0, 0, 0, MIN_VISIBILITY - 0.01),
        ],
      })
    )
    expect(points[0]?.visible).toBe(true)
    expect(points[1]?.visible).toBe(false)
  })

  it("treats a missing visibility score as tracked", () => {
    // MediaPipe omits `visibility` on world landmarks in some builds, so the
    // type is widened here rather than the absence being treated as untracked.
    const points = toScenePoints(
      frame({
        worldLandmarks: [
          { x: 0, y: 0, z: 0 } as FormCoachFrame["worldLandmarks"][number],
        ],
      })
    )
    expect(points[0]?.visible).toBe(true)
  })

  it("returns nothing for a missing frame", () => {
    expect(toScenePoints(undefined)).toEqual([])
  })

  it("hides face and finger landmarks however confident they are", () => {
    const points = toScenePoints(
      frame({
        worldLandmarks: Array.from({ length: POSE_LANDMARK_COUNT }, () =>
          landmark(1, 1, 1, 1)
        ),
      })
    )
    for (const index of IGNORED_POSE_LANDMARKS) {
      expect(points[index]?.visible).toBe(false)
    }
  })

  it("keeps the nose, wrists, and every body joint", () => {
    const points = toScenePoints(
      frame({
        worldLandmarks: Array.from({ length: POSE_LANDMARK_COUNT }, () =>
          landmark(1, 1, 1, 1)
        ),
      })
    )
    for (const index of [0, 15, 16, 11, 12, 23, 24, 25, 26, 27, 28]) {
      expect(points[index]?.visible).toBe(true)
    }
  })

  // Indices address the bone list, so dropping points would rewire the
  // skeleton rather than trim it.
  it("keeps every landmark slot so bone indices stay valid", () => {
    const points = toScenePoints(
      frame({
        worldLandmarks: Array.from({ length: POSE_LANDMARK_COUNT }, () =>
          landmark(1, 1, 1, 1)
        ),
      })
    )
    expect(points).toHaveLength(POSE_LANDMARK_COUNT)
  })
})

describe("boneVertices", () => {
  const points = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
    x: 1,
    y: 2,
    z: 3,
    visible: true,
  }))

  it("emits six numbers per drawable bone", () => {
    expect(boneVertices(points)).toHaveLength(POSE_BONES.length * 6)
  })

  it("skips a bone when either end is untracked", () => {
    const [from] = POSE_BONES[0]
    const partial = points.map((point, index) =>
      index === from ? { ...point, visible: false } : point
    )
    const affected = POSE_BONES.filter(
      ([a, b]) => a === from || b === from
    ).length
    expect(boneVertices(partial)).toHaveLength(
      (POSE_BONES.length - affected) * 6
    )
  })

  it("draws nothing when there are no points", () => {
    expect(boneVertices([])).toEqual([])
  })

  // The viewer writes straight into a preallocated Float32Array, so an
  // undersized buffer throws "source array is too long" at render time.
  it("never emits more vertices than the bone buffer holds", () => {
    expect(boneVertices(points).length).toBeLessThanOrEqual(BONE_BUFFER_FLOATS)
  })

  it("sizes the bone buffer from bones, not landmarks", () => {
    // Bone and landmark counts are unrelated; conflating them once overflowed
    // the buffer at render time.
    expect(BONE_BUFFER_FLOATS).toBe(POSE_BONES.length * 6)
  })

  it("never draws a bone that touches an ignored landmark", () => {
    for (const [from, to] of POSE_BONES) {
      expect(IGNORED_POSE_LANDMARKS.has(from)).toBe(false)
      expect(IGNORED_POSE_LANDMARKS.has(to)).toBe(false)
    }
  })

  it("never emits more joints than the joint buffer holds", () => {
    const visible = points.filter((point) => point.visible).length
    expect(visible * 3).toBeLessThanOrEqual(JOINT_BUFFER_FLOATS)
  })
})

describe("trackedFrames / trackingRate", () => {
  const angle = {
    index: 1,
    frames: [
      frame({ landmarks: [landmark(0, 0, 0)] }),
      frame({ timeMs: 100 }),
      frame({ timeMs: 200, landmarks: [landmark(0, 0, 0)] }),
      frame({ timeMs: 300 }),
    ],
  }

  it("keeps only frames where a pose was found", () => {
    expect(trackedFrames(angle)).toHaveLength(2)
  })

  it("reports the share of frames that tracked", () => {
    expect(trackingRate(angle)).toBe(0.5)
  })

  it("reports zero rather than dividing by zero for an empty angle", () => {
    expect(trackingRate({ index: 1, frames: [] })).toBe(0)
    expect(trackingRate(undefined)).toBe(0)
  })
})

describe("toGroundFrame", () => {
  function emptyPoints() {
    return Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visible: true,
    }))
  }
  function place(
    points: ReturnType<typeof emptyPoints>,
    index: number,
    x: number,
    y: number,
    z: number
  ) {
    points[index] = { x, y, z, visible: true }
  }

  /**
   * A lifter whose feet sit `tilt` radians off level and who is rotated
   * `lean` radians away from upright — i.e. what a hand-held camera produces.
   */
  function standing(tilt = 0, lean = 0) {
    const points = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visible: true,
    }))
    const put = (i: number, x: number, y: number, z: number) => {
      // Roll about z by `tilt`, then pitch about x by `lean`.
      const rx = x * Math.cos(tilt) - y * Math.sin(tilt)
      const ry = x * Math.sin(tilt) + y * Math.cos(tilt)
      points[i] = {
        x: rx,
        y: ry * Math.cos(lean) - z * Math.sin(lean),
        z: ry * Math.sin(lean) + z * Math.cos(lean),
        visible: true,
      }
    }
    put(11, -0.2, 0.5, 0)
    put(12, 0.2, 0.5, 0)
    put(23, -0.15, 0, 0)
    put(24, 0.15, 0, 0)
    put(27, -0.15, -0.9, 0)
    put(28, 0.15, -0.9, 0)
    put(0, 0, 1.2, 0)
    return points
  }

  it("puts both feet on exactly the same level", () => {
    for (const tilt of [0, 0.2, -0.35, 0.8]) {
      const grounded = toGroundFrame(standing(tilt))!
      expect(grounded[27].y).toBeCloseTo(grounded[28].y, 9)
    }
  })

  it("stands the lifter on the floor at y = 0", () => {
    const grounded = toGroundFrame(standing())!
    expect(grounded[27].y).toBeCloseTo(0, 9)
    expect(grounded[28].y).toBeCloseTo(0, 9)
  })

  it("anchors the feet rather than the hips", () => {
    // Head above the floor, hips between the two — not a body hanging from
    // its hips with everything else at negative heights.
    const grounded = toGroundFrame(standing())!
    expect(grounded[0].y).toBeGreaterThan(1)
    expect((grounded[23].y + grounded[24].y) / 2).toBeGreaterThan(0.5)
  })

  it("levels out a camera rolled to one side", () => {
    const level = toGroundFrame(standing(0))!
    for (const tilt of [0.3, -0.4, 0.75]) {
      const fixed = toGroundFrame(standing(tilt))!
      for (const i of [0, 11, 12, 23, 24, 27, 28]) {
        expect(fixed[i].y).toBeCloseTo(level[i].y, 6)
      }
    }
  })

  // The reason this function must not derive "up" from the body: mid-squat the
  // hips sit well behind the ankles, and treating that direction as vertical
  // tips the whole lifter forward by tens of degrees.
  it("does not tip a squatting lifter forward", () => {
    const squat = emptyPoints()
    // Hips dropped and set back behind the ankles, as at the bottom of a rep.
    place(squat, 11, -0.2, 0.85, -0.15)
    place(squat, 12, 0.2, 0.85, -0.15)
    place(squat, 23, -0.15, 0.45, -0.3)
    place(squat, 24, 0.15, 0.45, -0.3)
    place(squat, 27, -0.15, 0, 0)
    place(squat, 28, 0.15, 0, 0)

    const grounded = toGroundFrame(squat)!
    // The hips must stay behind and below the shoulders, not be rotated upright.
    expect(grounded[23].z).toBeLessThan(-0.2)
    expect(grounded[23].y).toBeCloseTo(0.45, 4)
    expect(grounded[11].y).toBeCloseTo(0.85, 4)
  })

  it("applies a hand-applied tilt on top", () => {
    const neutral = toGroundFrame(standing(0))!
    const pitched = toGroundFrame(standing(0), { pitchDeg: 20, rollDeg: 0 })!
    // Rotation only: heights change, bone lengths do not.
    const span = (p: typeof neutral, a: number, b: number) =>
      Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y, p[a].z - p[b].z)
    expect(pitched[11].z).not.toBeCloseTo(neutral[11].z, 3)
    expect(span(pitched, 11, 27)).toBeCloseTo(span(neutral, 11, 27), 9)
  })

  it("keeps the body's proportions", () => {
    const raw = standing(0.4, 0.2)
    const grounded = toGroundFrame(raw)!
    const span = (points: typeof raw, a: number, b: number) =>
      Math.hypot(
        points[a].x - points[b].x,
        points[a].y - points[b].y,
        points[a].z - points[b].z
      )
    // Rotation and translation only — no scaling or shearing.
    expect(span(grounded, 23, 27)).toBeCloseTo(span(raw, 23, 27), 9)
    expect(span(grounded, 11, 12)).toBeCloseTo(span(raw, 11, 12), 9)
  })

  it("declines when the ankles are not tracked", () => {
    const noAnkles = standing()
    noAnkles[27] = { ...noAnkles[27], visible: false }
    expect(toGroundFrame(noAnkles)).toBeNull()
    expect(toGroundFrame([])).toBeNull()
  })

  it("falls back to the hip-centred view rather than dropping the pose", () => {
    // toScenePoints must still return something usable when grounding fails.
    const landmarks = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visibility: 0,
    }))
    const points = toScenePoints({
      timeMs: 0,
      landmarks,
      worldLandmarks: landmarks,
    })
    expect(points).toHaveLength(POSE_LANDMARK_COUNT)
  })
})

describe("pose space", () => {
  /** A standing lifter in MediaPipe's camera frame, where y grows downward. */
  function cameraFrame() {
    const landmarks = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visibility: 0,
    }))
    const set = (i: number, x: number, y: number, z: number) => {
      landmarks[i] = { x, y, z, visibility: 1 }
    }
    set(0, 0, -1.2, 0) // nose, above the hips so negative in camera y
    set(11, -0.2, -0.5, 0)
    set(12, 0.2, -0.5, 0)
    set(23, -0.15, 0, 0)
    set(24, 0.15, 0, 0)
    set(27, -0.15, 0.9, 0)
    set(28, 0.15, 0.9, 0)
    return { timeMs: 0, landmarks, worldLandmarks: landmarks }
  }

  /** The same lifter after body framing, which already puts y up. */
  function bodyFrame() {
    const frame = cameraFrame()
    const flipped = frame.worldLandmarks.map((p) => ({
      ...p,
      y: -p.y,
      z: -p.z,
    }))
    return { timeMs: 0, landmarks: flipped, worldLandmarks: flipped }
  }

  // Flipping data that was already flipped stands the lifter on their head.
  it("puts the head above the feet from either space", () => {
    const fromCamera = toScenePoints(
      cameraFrame(),
      NEUTRAL_ORIENTATION,
      "camera"
    )
    const fromBody = toScenePoints(bodyFrame(), NEUTRAL_ORIENTATION, "body")
    for (const points of [fromCamera, fromBody]) {
      expect(points[0].y).toBeGreaterThan(1)
      expect((points[11].y + points[12].y) / 2).toBeGreaterThan(0.3)
      expect((points[27].y + points[28].y) / 2).toBeCloseTo(0, 6)
    }
  })

  it("reads the same body identically from both spaces", () => {
    const fromCamera = toScenePoints(
      cameraFrame(),
      NEUTRAL_ORIENTATION,
      "camera"
    )
    const fromBody = toScenePoints(bodyFrame(), NEUTRAL_ORIENTATION, "body")
    for (const i of [0, 11, 12, 23, 24, 27, 28]) {
      expect(fromBody[i].y).toBeCloseTo(fromCamera[i].y, 9)
      expect(fromBody[i].z).toBeCloseTo(fromCamera[i].z, 9)
    }
  })

  it("defaults to the camera frame, which is what raw angles are in", () => {
    expect(toScenePoints(cameraFrame())).toEqual(
      toScenePoints(cameraFrame(), NEUTRAL_ORIENTATION, "camera")
    )
  })
})

describe("shared ground transform", () => {
  function stickFigure(kneeZ: number) {
    const points = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visible: true,
    }))
    const put = (i: number, x: number, y: number, z: number) => {
      points[i] = { x, y, z, visible: true }
    }
    put(0, 0, 1.5, 0)
    put(11, -0.2, 1.2, 0)
    put(12, 0.2, 1.2, 0)
    put(23, -0.15, 0.9, 0)
    put(24, 0.15, 0.9, 0)
    put(25, -0.15, 0.45, kneeZ)
    put(26, 0.15, 0.45, kneeZ)
    // A knee correction swings the ankles, which is what used to change the
    // floor underneath the corrected skeleton.
    put(27, -0.15, 0, kneeZ * 2)
    put(28, 0.15, 0, kneeZ * 2)
    return points
  }

  // The bug: each skeleton derived its own transform from its own feet, so a
  // corrected pose came out rotated relative to the original.
  it("keeps two poses aligned where they agree", () => {
    const original = stickFigure(0.1)
    const corrected = stickFigure(0.25)

    const shared = groundTransform(original)!
    const a = applyGroundTransform(original, shared)
    const b = applyGroundTransform(corrected, shared)

    // The torso is identical in both, so it must land in the same place.
    for (const i of [0, 11, 12, 23, 24]) {
      expect(b[i].x).toBeCloseTo(a[i].x, 9)
      expect(b[i].y).toBeCloseTo(a[i].y, 9)
      expect(b[i].z).toBeCloseTo(a[i].z, 9)
    }
  })

  it("still differs where the poses actually differ", () => {
    const shared = groundTransform(stickFigure(0.1))!
    const a = applyGroundTransform(stickFigure(0.1), shared)
    const b = applyGroundTransform(stickFigure(0.25), shared)
    expect(Math.abs(b[25].z - a[25].z)).toBeGreaterThan(0.1)
  })

  it("matches deriving the transform in place", () => {
    const points = stickFigure(0.1)
    const direct = toGroundFrame(points)!
    const viaTransform = applyGroundTransform(points, groundTransform(points)!)
    for (let i = 0; i < POSE_LANDMARK_COUNT; i += 1) {
      expect(viaTransform[i].y).toBeCloseTo(direct[i].y, 9)
    }
  })
})
