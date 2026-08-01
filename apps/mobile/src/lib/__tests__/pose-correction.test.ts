import { describe, expect, it } from "bun:test"
import {
  applyCorrections,
  measureJoint,
  type PoseCorrection,
} from "@/lib/pose-correction"
import type { FormCoachFrame } from "@/lib/form-coach"

const COUNT = 33

/** A leg with a known knee bend, in body-frame coordinates. */
function legPoints(bendDegrees: number) {
  const points = Array.from({ length: COUNT }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 1,
  }))
  const radians = (bendDegrees * Math.PI) / 180
  for (const [side, sign] of [
    ["left", -1],
    ["right", 1],
  ] as const) {
    const hip = side === "left" ? 23 : 24
    const knee = side === "left" ? 25 : 26
    const ankle = side === "left" ? 27 : 28
    const foot = side === "left" ? 31 : 32
    points[hip] = { x: sign * 0.15, y: 0, z: 0, visibility: 1 }
    points[knee] = { x: sign * 0.15, y: -0.45, z: 0, visibility: 1 }
    points[ankle] = {
      x: sign * 0.15,
      y: -0.45 - 0.45 * Math.cos(radians),
      z: 0.45 * Math.sin(radians),
      visibility: 1,
    }
    // Rides along with the shin when the knee is corrected.
    points[foot] = {
      x: points[ankle].x,
      y: points[ankle].y - 0.05,
      z: points[ankle].z + 0.1,
      visibility: 1,
    }
  }
  return points
}

function frame(bendDegrees: number): FormCoachFrame {
  const points = legPoints(bendDegrees)
  return { timeMs: 0, landmarks: points, worldLandmarks: points }
}

/** A rep whose middle frame is the deepest, where corrections apply fully. */
function rep(bends: number[]): FormCoachFrame[] {
  return bends.map((bend, i) => ({ ...frame(bend), timeMs: i * 100 }))
}

describe("measureJoint", () => {
  it("reads a straight leg as 180 degrees", () => {
    expect(measureJoint(legPoints(0), "knee", "left")).toBeCloseTo(180, 6)
  })

  it.each([30, 60, 90])("reads a constructed %i degree bend", (bend) => {
    expect(measureJoint(legPoints(bend), "knee", "left")).toBeCloseTo(
      180 - bend,
      4
    )
  })
})

describe("applyCorrections", () => {
  const deeper: PoseCorrection[] = [
    { joint: "knee", side: "both", phase: "turnaround", targetDegrees: 70 },
  ]

  it("moves the joint to the angle the coach asked for", () => {
    // Middle frame is the deepest, so the correction lands at full strength.
    const corrected = applyCorrections(rep([0, 90, 0]), deeper)
    expect(
      measureJoint(corrected[1].worldLandmarks, "knee", "left")
    ).toBeCloseTo(70, 3)
  })

  it("corrects both sides when asked", () => {
    const corrected = applyCorrections(rep([0, 90, 0]), deeper)
    expect(
      measureJoint(corrected[1].worldLandmarks, "knee", "right")
    ).toBeCloseTo(70, 3)
  })

  it("leaves the other side alone when only one is named", () => {
    const corrected = applyCorrections(rep([0, 90, 0]), [
      { joint: "knee", side: "left", phase: "turnaround", targetDegrees: 70 },
    ])
    expect(
      measureJoint(corrected[1].worldLandmarks, "knee", "right")
    ).toBeCloseTo(90, 3)
  })

  // A skeleton that snaps into position at one frame reads as a glitch.
  it("eases the correction in rather than snapping", () => {
    const corrected = applyCorrections(rep([0, 45, 90, 45, 0]), deeper)
    const start = measureJoint(corrected[0].worldLandmarks, "knee", "left")!
    const end = measureJoint(corrected[4].worldLandmarks, "knee", "left")!
    // Untouched where the lifter is just standing.
    expect(start).toBeCloseTo(180, 3)
    expect(end).toBeCloseTo(180, 3)
  })

  it("keeps the limb rigid", () => {
    const before = rep([0, 90, 0])
    const after = applyCorrections(before, deeper)
    const shin = (points: readonly { x: number; y: number; z: number }[]) =>
      Math.hypot(
        points[25].x - points[27].x,
        points[25].y - points[27].y,
        points[25].z - points[27].z
      )
    // Rotation about the knee, so the shin cannot stretch.
    expect(shin(after[1].worldLandmarks)).toBeCloseTo(
      shin(before[1].worldLandmarks),
      9
    )
  })

  it("carries the foot along with the shin", () => {
    const before = rep([0, 90, 0])
    const after = applyCorrections(before, deeper)
    const gap = (points: readonly { x: number; y: number; z: number }[]) =>
      Math.hypot(
        points[27].x - points[31].x,
        points[27].y - points[31].y,
        points[27].z - points[31].z
      )
    expect(gap(after[1].worldLandmarks)).toBeCloseTo(
      gap(before[1].worldLandmarks),
      9
    )
  })

  it("does not mutate the frames it was given", () => {
    const before = rep([0, 90, 0])
    const snapshot = JSON.stringify(before)
    applyCorrections(before, deeper)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it("returns the rep untouched when there is nothing to correct", () => {
    const before = rep([0, 90, 0])
    expect(applyCorrections(before, [])).toBe(before)
  })
})
