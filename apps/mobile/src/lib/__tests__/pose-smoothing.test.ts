import { describe, expect, it } from "bun:test"
import {
  DEFAULT_POSE_SMOOTHING,
  smoothAngleLandmarks,
  smoothFormCoachLandmarks,
} from "@/lib/pose-smoothing"
import { MIN_VISIBILITY } from "@/lib/pose-scene"
import type { FormCoachAngleLandmarks, FormCoachFrame } from "@/lib/form-coach"

/** One landmark per frame, sampled at 5fps like the real pipeline. */
function angleFrom(
  values: Array<{ y: number; visibility?: number } | null>
): FormCoachAngleLandmarks {
  return {
    index: 1,
    frames: values.map((value, i): FormCoachFrame => {
      if (value === null) {
        return { timeMs: i * 200, landmarks: [], worldLandmarks: [] }
      }
      const point = {
        x: 0,
        y: value.y,
        z: 0,
        visibility: value.visibility ?? 1,
      }
      return {
        timeMs: i * 200,
        landmarks: [point],
        worldLandmarks: [point],
      }
    }),
  }
}

function ys(angle: FormCoachAngleLandmarks) {
  return angle.frames.map((frame) => frame.worldLandmarks[0]?.y)
}

/** Mean absolute frame-to-frame change — how much the point shakes. */
function jitter(values: Array<number | undefined>) {
  let total = 0
  let count = 0
  for (let i = 1; i < values.length; i += 1) {
    const a = values[i - 1]
    const b = values[i]
    if (a === undefined || b === undefined) continue
    total += Math.abs(b - a)
    count += 1
  }
  return count === 0 ? 0 : total / count
}

describe("smoothAngleLandmarks", () => {
  it("leaves a perfectly steady joint where it is", () => {
    const angle = angleFrom(Array.from({ length: 10 }, () => ({ y: 1 })))
    for (const y of ys(smoothAngleLandmarks(angle))) {
      expect(y).toBeCloseTo(1, 6)
    }
  })

  it("cuts the shake out of a stationary but noisy joint", () => {
    // ±2cm of alternating noise around a joint that is not actually moving.
    const noisy = Array.from({ length: 30 }, (_, i) => ({
      y: 1 + (i % 2 === 0 ? 0.02 : -0.02),
    }))
    const angle = angleFrom(noisy)
    const before = jitter(ys(angle))
    const after = jitter(ys(smoothAngleLandmarks(angle)))
    // Measured at ~61% reduction; the bound guards against a retune that
    // quietly stops smoothing.
    expect(after).toBeLessThan(before * 0.5)
  })

  it("still follows a real rep instead of smearing it", () => {
    // A joint travelling 1m over 2s — the filter must not lag far behind.
    const ramp = Array.from({ length: 11 }, (_, i) => ({ y: i * 0.1 }))
    const smoothed = ys(smoothAngleLandmarks(angleFrom(ramp)))
    expect(smoothed.at(-1)).toBeGreaterThan(0.8)
  })

  it("tracks fast motion more closely than a fixed low-pass would", () => {
    const ramp = Array.from({ length: 11 }, (_, i) => ({ y: i * 0.1 }))
    const adaptive = ys(
      smoothAngleLandmarks(angleFrom(ramp), DEFAULT_POSE_SMOOTHING)
    ).at(-1)
    // beta: 0 removes the speed adaptation, leaving a plain low-pass.
    const fixed = ys(
      smoothAngleLandmarks(angleFrom(ramp), {
        ...DEFAULT_POSE_SMOOTHING,
        beta: 0,
      })
    ).at(-1)
    expect(adaptive).toBeGreaterThan(fixed!)
  })

  // Depth is the measurement that decides whether a squat is called shallow,
  // so over-smoothing the bottom of the rep is the expensive failure.
  it("keeps the bottom of a squat within a centimetre of the truth", () => {
    // 0.5m descent and back over 2s, sampled at 5fps, with ±1cm of noise.
    const path = Array.from(
      { length: 11 },
      (_, i) => -0.5 * Math.sin(Math.PI * (i / 10))
    )
    const noisy = path.map((y, i) => ({ y: y + (i % 2 ? -0.01 : 0.01) }))
    const smoothed = ys(smoothAngleLandmarks(angleFrom(noisy)))

    const trueDepth = Math.min(...path)
    const seenDepth = Math.min(...(smoothed as number[]))
    expect(Math.abs(seenDepth - trueDepth)).toBeLessThan(0.01)
  })

  it("passes a single frame through untouched", () => {
    const angle = angleFrom([{ y: 0.42 }])
    expect(ys(smoothAngleLandmarks(angle))[0]).toBeCloseTo(0.42, 6)
  })

  it("keeps untracked frames untracked", () => {
    const smoothed = smoothAngleLandmarks(angleFrom([{ y: 1 }, null, { y: 1 }]))
    expect(smoothed.frames[1]?.landmarks).toEqual([])
    expect(smoothed.frames[1]?.worldLandmarks).toEqual([])
  })

  it("does not let a low-confidence guess drag the joint", () => {
    // One wild frame the model was not confident about, between good ones.
    const smoothed = ys(
      smoothAngleLandmarks(
        angleFrom([
          { y: 1 },
          { y: 1 },
          { y: 99, visibility: MIN_VISIBILITY - 0.1 },
          { y: 1 },
        ])
      )
    )
    for (const y of smoothed) expect(y).toBeLessThan(1.001)
  })

  it("preserves visibility so the scene can still hide a joint", () => {
    const smoothed = smoothAngleLandmarks(
      angleFrom([{ y: 1 }, { y: 1, visibility: 0.1 }])
    )
    expect(smoothed.frames[1]?.worldLandmarks[0]?.visibility).toBe(0.1)
  })

  it("keeps the frame count and timestamps intact", () => {
    const angle = angleFrom([{ y: 1 }, { y: 2 }, { y: 3 }])
    const smoothed = smoothAngleLandmarks(angle)
    expect(smoothed.frames).toHaveLength(3)
    expect(smoothed.frames.map((frame) => frame.timeMs)).toEqual([0, 200, 400])
    expect(smoothed.index).toBe(1)
  })

  it("does not mutate the input", () => {
    const angle = angleFrom([{ y: 1 }, { y: 5 }, { y: 1 }])
    const before = JSON.stringify(angle)
    smoothAngleLandmarks(angle)
    expect(JSON.stringify(angle)).toBe(before)
  })

  it("smooths each angle independently", () => {
    const angles = [angleFrom([{ y: 1 }, { y: 1 }]), angleFrom([{ y: 9 }])]
    angles[1].index = 2
    const smoothed = smoothFormCoachLandmarks(angles)
    // A second angle starting fresh must not inherit the first angle's state.
    expect(ys(smoothed[1])[0]).toBeCloseTo(9, 6)
  })
})
