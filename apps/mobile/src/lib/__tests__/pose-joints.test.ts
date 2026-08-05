import { describe, expect, it } from "bun:test"
import {
  BLAZE,
  COCO,
  COCO_KEYPOINTS,
  H36M,
  H36M_JOINTS,
  type Keypoint2D,
  cocoToBlazePose2D,
  cocoToH36m,
  h36mToBlazePoseWorld,
} from "@/lib/pose-joints"
import { IGNORED_POSE_LANDMARKS, POSE_BONES } from "@/lib/pose-scene"

/**
 * The pipeline passes through three skeletons with different joint orders, and
 * a swapped index in any of the tables is silent: the preview still draws a
 * person, rep detection still finds cycles, and only the numbers are wrong. So
 * the mappings are pinned by hand rather than trusted.
 */

/** COCO keypoints whose x encodes the index they came from, for tracing. */
function tracer(): Keypoint2D[] {
  return Array.from({ length: COCO_KEYPOINTS }, (_, index) => ({
    x: index,
    y: index * 10,
    score: 1,
  }))
}

describe("COCO to H36M", () => {
  const h36m = cocoToH36m(tracer())

  it("carries each limb joint to its H36M slot", () => {
    // Left and right cross over between the two layouts, which is the mistake
    // this is here to catch: H36M puts the right leg first.
    expect(h36m[H36M.rightKnee].x).toBe(COCO.rightKnee)
    expect(h36m[H36M.leftKnee].x).toBe(COCO.leftKnee)
    expect(h36m[H36M.rightAnkle].x).toBe(COCO.rightAnkle)
    expect(h36m[H36M.leftAnkle].x).toBe(COCO.leftAnkle)
    expect(h36m[H36M.leftWrist].x).toBe(COCO.leftWrist)
    expect(h36m[H36M.rightWrist].x).toBe(COCO.rightWrist)
    expect(h36m[H36M.nose].x).toBe(COCO.nose)
  })

  it("synthesises the torso chain COCO does not have", () => {
    expect(h36m[H36M.hip].x).toBe((COCO.leftHip + COCO.rightHip) / 2)
    expect(h36m[H36M.thorax].x).toBe(
      (COCO.leftShoulder + COCO.rightShoulder) / 2
    )
    // Spine sits halfway between the two, matching `halpe2h36m`.
    expect(h36m[H36M.spine].x).toBe(
      (h36m[H36M.hip].x + h36m[H36M.thorax].x) / 2
    )
  })

  it("fills every H36M slot", () => {
    expect(h36m).toHaveLength(H36M_JOINTS)
    expect(h36m.every((joint) => joint !== undefined)).toBe(true)
  })

  it("trusts an invented joint no more than its weaker parent", () => {
    const keypoints = tracer()
    keypoints[COCO.leftHip] = { x: 0, y: 0, score: 0.9 }
    keypoints[COCO.rightHip] = { x: 0, y: 0, score: 0.1 }

    expect(cocoToH36m(keypoints)[H36M.hip].score).toBe(0.1)
  })
})

describe("COCO to BlazePose 2D", () => {
  it("normalizes against the frame", () => {
    const keypoints = tracer()
    keypoints[COCO.nose] = { x: 160, y: 60, score: 0.8 }

    const landmarks = cocoToBlazePose2D(keypoints, 320, 240)

    expect(landmarks[BLAZE.nose].x).toBeCloseTo(0.5)
    expect(landmarks[BLAZE.nose].y).toBeCloseTo(0.25)
    expect(landmarks[BLAZE.nose].visibility).toBe(0.8)
  })

  it("returns a full 33-slot skeleton whatever the detector found", () => {
    expect(cocoToBlazePose2D([], 320, 240)).toHaveLength(33)
  })
})

describe("H36M to BlazePose world", () => {
  const joints = Array.from(
    { length: H36M_JOINTS },
    (_, index) => [index, index, index] as [number, number, number]
  )
  const confidence = new Array<number>(H36M_JOINTS).fill(1)

  it("re-centres on the hip and converts to metres", () => {
    const world = h36mToBlazePoseWorld(joints, 2, confidence)

    // The hip is H36M's origin joint, so every point is measured from it.
    const expected = (H36M.leftKnee - H36M.hip) * 2
    expect(world[BLAZE.leftKnee].x).toBe(expected)
    expect(world[BLAZE.leftKnee].y).toBe(expected)
    expect(world[BLAZE.leftKnee].z).toBe(expected)
  })

  it("does not place the lifter's hips away from the origin", () => {
    const world = h36mToBlazePoseWorld(joints, 2, confidence)
    const hips = [world[BLAZE.leftHip], world[BLAZE.rightHip]]
    const midpoint = (hips[0].x + hips[1].x) / 2

    expect(midpoint).toBeCloseTo(
      ((H36M.leftHip + H36M.rightHip) / 2 - H36M.hip) * 2
    )
  })

  it("carries the detector's confidence through the lift", () => {
    const scores = new Array<number>(H36M_JOINTS).fill(1)
    scores[H36M.leftAnkle] = 0

    const world = h36mToBlazePoseWorld(joints, 1, scores)

    expect(world[BLAZE.leftAnkle].visibility).toBe(0)
    expect(world[BLAZE.rightAnkle].visibility).toBe(1)
  })
})

/**
 * The mapping and the scene have to agree on exactly which slots exist. Drift
 * either way is a visible bug: a filled slot the scene ignores silently drops a
 * joint, and a drawn slot the mapping never fills anchors a bone to the origin,
 * so a limb shoots through the lifter's hips.
 */
describe("the mapping and the scene agree on which joints exist", () => {
  const joints = Array.from(
    { length: H36M_JOINTS },
    () => [1, 1, 1] as [number, number, number]
  )
  const filled = new Set(
    h36mToBlazePoseWorld(joints, 1, new Array<number>(H36M_JOINTS).fill(1))
      .map((landmark, index) => ({ landmark, index }))
      .filter(({ landmark }) => (landmark.visibility ?? 0) > 0)
      .map(({ index }) => index)
  )

  it("fills every slot the scene is willing to draw", () => {
    const drawn = Array.from({ length: 33 }, (_, index) => index).filter(
      (index) => !IGNORED_POSE_LANDMARKS.has(index)
    )

    expect([...filled].sort((a, b) => a - b)).toEqual(drawn)
  })

  it("draws no bone that ends at a slot nothing fills", () => {
    const dangling = POSE_BONES.filter(
      ([from, to]) => !filled.has(from) || !filled.has(to)
    )

    expect(dangling).toEqual([])
  })
})
