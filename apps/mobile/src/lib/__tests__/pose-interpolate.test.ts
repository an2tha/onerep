import { describe, expect, it } from "bun:test"
import { buildPoseTrack, samplePoseAt } from "@/lib/pose-interpolate"
import type { FormCoachFrame } from "@/lib/form-coach"

/** One landmark whose y follows `values`, sampled at 10fps. */
function framesFrom(values: number[], visibility = 1): FormCoachFrame[] {
  return values.map((y, i) => {
    const point = { x: 0, y, z: 0, visibility }
    return { timeMs: i * 100, landmarks: [point], worldLandmarks: [point] }
  })
}

const yAt = (track: ReturnType<typeof buildPoseTrack>, t: number) =>
  samplePoseAt(track!, t)[0].y

describe("buildPoseTrack", () => {
  it("returns null when nothing was tracked", () => {
    expect(buildPoseTrack([])).toBeNull()
    expect(
      buildPoseTrack([{ timeMs: 0, landmarks: [], worldLandmarks: [] }])
    ).toBeNull()
  })

  it("handles a single measured frame", () => {
    const track = buildPoseTrack(framesFrom([0.5]), { loop: false })!
    expect(yAt(track, 0)).toBeCloseTo(0.5, 6)
    expect(yAt(track, 999)).toBeCloseTo(0.5, 6)
  })
})

describe("samplePoseAt", () => {
  // The accuracy guarantee: interpolation adds in-betweens, it does not
  // rewrite the measurements.
  it("passes exactly through every measured sample", () => {
    const values = [0, 0.4, 0.9, 0.3, -0.2, 0.1]
    const track = buildPoseTrack(framesFrom(values), { loop: false })!
    values.forEach((expected, i) => {
      expect(yAt(track, i * 100)).toBeCloseTo(expected, 9)
    })
  })

  // The reason for monotone cubic over Catmull-Rom: an overshooting spline
  // would invent depth the lifter never reached.
  it("never leaves the range bracketed by neighbouring samples", () => {
    const values = [0, 0, 1, 1, 0, 0, -1, -1, 0]
    const track = buildPoseTrack(framesFrom(values), { loop: false })!
    for (let i = 0; i < values.length - 1; i += 1) {
      const low = Math.min(values[i], values[i + 1])
      const high = Math.max(values[i], values[i + 1])
      for (let step = 0; step <= 20; step += 1) {
        const y = yAt(track, i * 100 + step * 5)
        expect(y).toBeGreaterThanOrEqual(low - 1e-9)
        expect(y).toBeLessThanOrEqual(high + 1e-9)
      }
    }
  })

  it("does not exaggerate the depth of a squat", () => {
    const path = Array.from(
      { length: 20 },
      (_, i) => -0.5 * Math.sin(Math.PI * (i / 19))
    )
    const track = buildPoseTrack(framesFrom(path), { loop: false })!
    let deepest = 0
    for (let t = 0; t <= 1900; t += 5)
      deepest = Math.min(deepest, yAt(track, t))
    expect(deepest).toBeGreaterThanOrEqual(Math.min(...path) - 1e-9)
  })

  it("fills in the gaps between samples", () => {
    const track = buildPoseTrack(framesFrom([0, 1]), { loop: false })!
    const middle = yAt(track, 50)
    expect(middle).toBeGreaterThan(0)
    expect(middle).toBeLessThan(1)
  })

  // The point of filling in frames is that the in-betweens land where the body
  // actually was, not merely that something is drawn there.
  it("reconstructs the true motion between 10fps samples", () => {
    // A real 2s squat, measured at 10fps but continuous underneath.
    const truth = (ms: number) => -0.5 * Math.sin(Math.PI * (ms / 1900))
    const measured = Array.from({ length: 20 }, (_, i) => truth(i * 100))
    const track = buildPoseTrack(framesFrom(measured), { loop: false })!

    const step = 1000 / 45
    let interpolatedError = 0
    let steppedError = 0
    for (let t = 0; t <= 1900; t += step) {
      interpolatedError = Math.max(
        interpolatedError,
        Math.abs(yAt(track, t) - truth(t))
      )
      // What playing the measured frames back directly would have shown.
      const held = measured[Math.floor(t / 100)]
      steppedError = Math.max(steppedError, Math.abs(held - truth(t)))
    }

    // Measured at 1.7mm worst case against 80mm for stepped playback. The
    // worst case sits at the single instant of the turnaround, where refusing
    // to overshoot costs a little accuracy on purpose — see below.
    expect(interpolatedError).toBeLessThan(0.003)
    expect(interpolatedError).toBeLessThan(steppedError / 20)
  })

  // Away from the turnaround the cubic is doing real work: if it quietly
  // degraded to straight lines this would be ~100x worse.
  it("beats linear interpolation everywhere but the turnaround", () => {
    const truth = (ms: number) => -0.5 * Math.sin(Math.PI * (ms / 1900))
    const measured = Array.from({ length: 20 }, (_, i) => truth(i * 100))
    const track = buildPoseTrack(framesFrom(measured), { loop: false })!

    // Mid-interval, a quarter of the way down — well clear of the bottom.
    const t = 450
    const cubicError = Math.abs(yAt(track, t) - truth(t))
    const linearError = Math.abs((measured[4] + measured[5]) / 2 - truth(t))
    expect(cubicError).toBeLessThan(linearError / 50)
  })

  // At an extremum falling between two samples, the true peak is unrecoverable
  // without overshooting. Reading a squat as a hair shallower than it was is
  // the safe direction to be wrong in.
  it("errs shallow, never deep, at the bottom of a rep", () => {
    const truth = (ms: number) => -0.5 * Math.sin(Math.PI * (ms / 1900))
    const measured = Array.from({ length: 20 }, (_, i) => truth(i * 100))
    const track = buildPoseTrack(framesFrom(measured), { loop: false })!

    let deepest = 0
    for (let t = 0; t <= 1900; t += 2)
      deepest = Math.min(deepest, yAt(track, t))
    expect(deepest).toBeGreaterThanOrEqual(Math.min(...measured) - 1e-9)
    expect(deepest - Math.min(...measured)).toBeLessThan(0.003)
  })

  it("clamps outside the track instead of extrapolating", () => {
    const track = buildPoseTrack(framesFrom([0.2, 0.4, 0.6]), { loop: false })!
    expect(yAt(track, -5000)).toBeCloseTo(0.2, 9)
    expect(yAt(track, 5000)).toBeCloseTo(0.6, 9)
  })

  it("joins a loop back to its start without a jump", () => {
    const values = [0, 0.5, 1, 0.5]
    const track = buildPoseTrack(framesFrom(values), { loop: true })!
    expect(yAt(track, track.durationMs)).toBeCloseTo(values[0], 6)
  })

  it("keeps visibility inside 0 to 1", () => {
    const frames = [0.9, 0.05, 0.95, 0.02].map((visibility, i) => {
      const point = { x: 0, y: i, z: 0, visibility }
      return { timeMs: i * 100, landmarks: [point], worldLandmarks: [point] }
    })
    const track = buildPoseTrack(frames, { loop: false })!
    for (let t = 0; t <= 300; t += 3) {
      const v = samplePoseAt(track, t)[0].visibility
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it("reuses the caller's buffer so playback allocates nothing", () => {
    const track = buildPoseTrack(framesFrom([0, 1, 2]), { loop: false })!
    const buffer = samplePoseAt(track, 0)
    expect(samplePoseAt(track, 150, buffer)).toBe(buffer)
  })
})
