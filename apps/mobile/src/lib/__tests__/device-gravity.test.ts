import { describe, expect, it } from "bun:test"
import {
  clampOrientation,
  emaGravity,
  gravityToOrientation,
  normalizeEventGravity,
} from "@/lib/device-gravity"
import { applyOrientation } from "@/lib/pose-reps"
import type { FormCoachAngleLandmarks } from "@/lib/form-coach"

/**
 * The maths that turns a settled accelerometer reading into the Straighten
 * sliders' starting position. The signs are the whole game here: a correction
 * with the right magnitude and the wrong sign doubles the tilt instead of
 * removing it, and nothing downstream would ever say so. The round-trip tests
 * at the bottom pin the convention to `applyOrientation` itself rather than to
 * this file's opinion of it.
 */

const G = 9.81
const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * Device-frame gravity (pointing toward the earth) for a phone held upright in
 * portrait, then pitched back by `pitch` (rear camera looks up) and rolled by
 * `roll` about the camera axis. Upright is (0, -G, 0): straight down the body
 * of the phone.
 */
const heldAt = (pitch: number, roll: number) => ({
  x: G * Math.sin(rad(roll)) * Math.cos(rad(pitch)),
  y: -G * Math.cos(rad(roll)) * Math.cos(rad(pitch)),
  z: G * Math.sin(rad(pitch)),
})

describe("normalizeEventGravity", () => {
  it("passes iOS readings through, where the vector already points down", () => {
    expect(normalizeEventGravity({ x: 0, y: -G, z: 0 }, "ios")).toEqual({
      x: 0,
      y: -G,
      z: 0,
    })
  })

  it("negates spec-compliant readings, which report the reaction", () => {
    expect(normalizeEventGravity({ x: 0, y: G, z: 0 }, "web")).toEqual({
      x: -0,
      y: -G,
      z: -0,
    })
  })

  it("rejects missing or partial readings", () => {
    expect(normalizeEventGravity(null, "ios")).toBeNull()
    expect(normalizeEventGravity({ x: 0, y: null, z: 0 }, "ios")).toBeNull()
    expect(normalizeEventGravity({ x: 0, y: Number.NaN, z: 0 }, "ios")).toBeNull()
  })
})

describe("emaGravity", () => {
  it("adopts the first sample whole", () => {
    expect(emaGravity(null, { x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 })
  })

  it("moves a fraction of the way toward each new sample", () => {
    const next = emaGravity({ x: 0, y: 0, z: 0 }, { x: 10, y: -10, z: 0 }, 0.1)
    expect(next.x).toBeCloseTo(1)
    expect(next.y).toBeCloseTo(-1)
    expect(next.z).toBeCloseTo(0)
  })
})

describe("gravityToOrientation", () => {
  it("reads a level phone as no correction", () => {
    const orientation = gravityToOrientation(heldAt(0, 0))
    expect(orientation).not.toBeNull()
    expect(orientation!.pitchDeg).toBeCloseTo(0)
    expect(orientation!.rollDeg).toBeCloseTo(0)
  })

  it("reads a rear camera pitched up as positive pitch", () => {
    const orientation = gravityToOrientation(heldAt(20, 0))
    expect(orientation!.pitchDeg).toBeCloseTo(20)
    expect(orientation!.rollDeg).toBeCloseTo(0)
  })

  it("reads a rear camera pitched down as negative pitch", () => {
    const orientation = gravityToOrientation(heldAt(-15, 0))
    expect(orientation!.pitchDeg).toBeCloseTo(-15)
    expect(orientation!.rollDeg).toBeCloseTo(0)
  })

  it("reads roll with the sign applyOrientation expects", () => {
    const orientation = gravityToOrientation(heldAt(0, 10))
    expect(orientation!.pitchDeg).toBeCloseTo(0)
    expect(orientation!.rollDeg).toBeCloseTo(-10)
  })

  it("flips pitch and roll for the front camera, which looks the other way", () => {
    const rear = gravityToOrientation(heldAt(20, 10), "environment")
    const front = gravityToOrientation(heldAt(20, 10), "user")
    expect(front!.pitchDeg).toBeCloseTo(-rear!.pitchDeg)
    expect(front!.rollDeg).toBeCloseTo(-rear!.rollDeg)
  })

  it("refuses a degenerate vector", () => {
    expect(gravityToOrientation({ x: 0, y: 0, z: 0 })).toBeNull()
    expect(gravityToOrientation({ x: 0.1, y: -0.2, z: 0 })).toBeNull()
    expect(gravityToOrientation({ x: 0, y: Number.NaN, z: 0 })).toBeNull()
  })

  it("refuses landscape rather than guess which way the frames rotated", () => {
    expect(
      gravityToOrientation(heldAt(10, 0), "environment", "landscape-primary")
    ).toBeNull()
  })

  it("handles upside-down portrait by flipping the screen axes", () => {
    // The same physical tilt with the phone rotated 180° about its screen
    // normal: device x and y readings negate, z stays.
    const g = heldAt(20, 10)
    const flipped = { x: -g.x, y: -g.y, z: g.z }
    const upright = gravityToOrientation(g, "environment", "portrait-primary")
    const inverted = gravityToOrientation(
      flipped,
      "environment",
      "portrait-secondary"
    )
    expect(inverted!.pitchDeg).toBeCloseTo(upright!.pitchDeg)
    expect(inverted!.rollDeg).toBeCloseTo(upright!.rollDeg)
  })
})

describe("clampOrientation", () => {
  it("clamps to the sliders' range and rounds to their step", () => {
    expect(clampOrientation({ pitchDeg: 61.2, rollDeg: -48.7 })).toEqual({
      pitchDeg: 45,
      rollDeg: -45,
    })
    expect(clampOrientation({ pitchDeg: 3.4, rollDeg: -2.6 })).toEqual({
      pitchDeg: 3,
      rollDeg: -3,
    })
  })
})

// ── Round trip through applyOrientation ──────────────────────────────────────

/**
 * A one-frame clip whose world landmarks hold a single "torso": the hips at
 * the origin and a neck point wherever the tilted camera recorded it.
 * `applyOrientation` rotates every landmark identically, so one bone is enough
 * to observe the rotation.
 */
function clipWithNeck(neck: { x: number; y: number; z: number }) {
  const point = (p: { x: number; y: number; z: number }) => ({
    ...p,
    visibility: 1,
  })
  const angle: FormCoachAngleLandmarks = {
    index: 1,
    frames: [
      {
        timeMs: 0,
        landmarks: [],
        worldLandmarks: [point({ x: 0, y: 0, z: 0 }), point(neck)],
      },
    ],
  }
  return [angle]
}

describe("gravity seed round trip", () => {
  it("re-verticalises a torso filmed by a camera pitched back", () => {
    const pitch = 20
    // A rear camera pitched up by 20° records world-up (0, -1, 0) rotated by
    // -20° about the camera x axis: (0, -cos20, sin20).
    const neck = { x: 0, y: -Math.cos(rad(pitch)), z: Math.sin(rad(pitch)) }
    const orientation = gravityToOrientation(heldAt(pitch, 0))!

    const [angle] = applyOrientation(clipWithNeck(neck), orientation)
    const corrected = angle.frames[0].worldLandmarks[1]
    expect(corrected.x).toBeCloseTo(0)
    expect(corrected.y).toBeCloseTo(-1)
    expect(corrected.z).toBeCloseTo(0)
  })

  it("re-verticalises a torso filmed by a rolled camera", () => {
    const roll = 12
    // A camera rolled by 12° about its forward axis records world-up rotated
    // by -12° about z: (-sin12, -cos12, 0).
    const neck = { x: -Math.sin(rad(roll)), y: -Math.cos(rad(roll)), z: 0 }
    const orientation = gravityToOrientation(heldAt(0, roll))!

    const [angle] = applyOrientation(clipWithNeck(neck), orientation)
    const corrected = angle.frames[0].worldLandmarks[1]
    expect(corrected.x).toBeCloseTo(0)
    expect(corrected.y).toBeCloseTo(-1)
    expect(corrected.z).toBeCloseTo(0)
  })

  it("re-verticalises under pitch and roll together", () => {
    const gravity = heldAt(18, -9)
    const orientation = gravityToOrientation(gravity)!

    // Whatever the camera's attitude, world-up recorded in camera coordinates
    // is exactly the negated unit gravity — the one direction the sensor
    // actually measured. Build the neck from that, via the same device→camera
    // mapping the converter uses for the rear camera.
    const camera = { x: gravity.x, y: -gravity.y, z: -gravity.z }
    const magnitude = Math.hypot(camera.x, camera.y, camera.z)
    const neck = {
      x: -camera.x / magnitude,
      y: -camera.y / magnitude,
      z: -camera.z / magnitude,
    }

    const [angle] = applyOrientation(clipWithNeck(neck), orientation)
    const corrected = angle.frames[0].worldLandmarks[1]
    expect(corrected.x).toBeCloseTo(0)
    expect(corrected.y).toBeCloseTo(-1)
    expect(corrected.z).toBeCloseTo(0)
  })
})
