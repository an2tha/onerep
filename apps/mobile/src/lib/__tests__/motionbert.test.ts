import { describe, expect, it } from "bun:test"
import { cropScale, metricScale } from "@/lib/motionbert"
import { H36M, H36M_JOINTS, type Keypoint2D } from "@/lib/pose-joints"

/**
 * The two pieces of arithmetic between the detector and the lifter that have no
 * model in them, and so can be checked here rather than on a phone.
 *
 * Both are ports: `cropScale` of `crop_scale` in MotionBERT's own data pipeline,
 * and both are clip-global by design. Making either per-frame is the plausible
 * mistake, and it does not look like a bug — it looks like a lifter who never
 * quite reaches depth.
 */

/** A frame of H36M keypoints at a single height, for testing the box maths. */
function frameAt(y: number, x = 0, score = 1): Keypoint2D[] {
  return Array.from({ length: H36M_JOINTS }, () => ({ x, y, score }))
}

function frameSpanning(minX: number, maxX: number, minY: number, maxY: number) {
  const keypoints = frameAt(minY, minX)
  keypoints[H36M.nose] = { x: maxX, y: maxY, score: 1 }
  return keypoints
}

const at = (out: Float32Array, frame: number, joint: number) => ({
  x: out[(frame * H36M_JOINTS + joint) * 3],
  y: out[(frame * H36M_JOINTS + joint) * 3 + 1],
  score: out[(frame * H36M_JOINTS + joint) * 3 + 2],
})

describe("cropScale", () => {
  it("fits the clip's whole extent into -1 to 1", () => {
    const out = cropScale([frameSpanning(0, 100, 0, 100)])
    if (!out) throw new Error("expected a normalized track")

    // The corners of a square bounding box land on the corners of the range.
    expect(at(out, 0, 0).x).toBeCloseTo(-1)
    expect(at(out, 0, 0).y).toBeCloseTo(-1)
    expect(at(out, 0, H36M.nose).x).toBeCloseTo(1)
    expect(at(out, 0, H36M.nose).y).toBeCloseTo(1)
  })

  it("normalizes x and y by the same factor, so limb angles survive", () => {
    // A wide, short box. Dividing each axis by its own extent would stretch
    // this back into a square and bend every joint angle in the frame.
    const out = cropScale([frameSpanning(0, 100, 0, 20)])
    if (!out) throw new Error("expected a normalized track")

    const spanX = at(out, 0, H36M.nose).x - at(out, 0, 0).x
    const spanY = at(out, 0, H36M.nose).y - at(out, 0, 0).y
    expect(spanX / spanY).toBeCloseTo(100 / 20)
  })

  it("uses one box for the whole clip, not one per frame", () => {
    // A lifter standing, then crouched. Normalizing per frame would map both
    // extremes to the same coordinates and erase the rep entirely.
    const out = cropScale([
      frameSpanning(0, 100, 0, 100),
      frameSpanning(0, 100, 40, 60),
    ])
    if (!out) throw new Error("expected a normalized track")

    expect(at(out, 1, 0).y).toBeGreaterThan(at(out, 0, 0).y)
    expect(at(out, 1, H36M.nose).y).toBeLessThan(at(out, 0, H36M.nose).y)
  })

  it("carries confidence through untouched", () => {
    const keypoints = frameSpanning(0, 100, 0, 100)
    keypoints[H36M.leftKnee] = { x: 50, y: 50, score: 0.42 }

    const out = cropScale([keypoints])
    if (!out) throw new Error("expected a normalized track")

    expect(at(out, 0, H36M.leftKnee).score).toBeCloseTo(0.42)
  })

  it("leaves an undetected frame at zero rather than dropping it", () => {
    // Frame count has to survive, because the frames carry the clip's timeline.
    const out = cropScale([frameSpanning(0, 100, 0, 100), null])
    if (!out) throw new Error("expected a normalized track")

    expect(out).toHaveLength(2 * H36M_JOINTS * 3)
    expect(at(out, 1, 0)).toEqual({ x: 0, y: 0, score: 0 })
  })

  it("gives up when too little was tracked to define a box", () => {
    expect(cropScale([])).toBeNull()
    expect(cropScale([null, null])).toBeNull()
    // Every point in one spot is a box of zero size, not a scale of infinity.
    expect(cropScale([frameAt(5, 5)])).toBeNull()
  })
})

describe("metricScale", () => {
  /** A lifted clip whose torso is `torso` units long in every frame. */
  function lifted(torsos: number[]) {
    const out = new Float32Array(torsos.length * H36M_JOINTS * 3)
    torsos.forEach((torso, frame) => {
      // Only the hip and thorax matter; the thorax is placed straight above.
      out[(frame * H36M_JOINTS + H36M.thorax) * 3 + 1] = torso
    })
    return out
  }

  it("scales so the torso measures the assumed half metre", () => {
    const scale = metricScale(lifted([0.25, 0.25, 0.25]), 3)
    expect(scale).toBeCloseTo(2)
  })

  it("ignores frames where the hips were lost", () => {
    // A mean would be dragged toward zero by these and shrink the whole clip.
    const scale = metricScale(lifted([0.25, 0, 0.25, 0, 0.25]), 5)
    expect(scale).toBeCloseTo(2)
  })

  it("takes the median, so a few bad frames cannot set the clip's scale", () => {
    const scale = metricScale(lifted([0.25, 0.25, 0.25, 0.25, 5]), 5)
    expect(scale).toBeCloseTo(2)
  })

  it("reports no scale when nothing was lifted", () => {
    expect(metricScale(lifted([]), 0)).toBe(0)
    expect(metricScale(lifted([0, 0]), 2)).toBe(0)
  })
})
