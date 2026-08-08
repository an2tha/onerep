import type { FormCoachAngleLandmarks, FormCoachFrame } from "@/lib/form-coach"
import { MIN_VISIBILITY } from "@/lib/pose-scene"

/**
 * Pose landmarks arrive with per-frame jitter of a centimetre or two even when
 * the lifter is holding still, because each frame is estimated independently.
 *
 * A flat low-pass would fix the shake and ruin the movement — the bottom of a
 * squat is exactly where the signal is fastest and where lag is least
 * forgivable. The One Euro filter varies its cutoff with measured speed: heavy
 * smoothing while a joint is near-stationary, barely any while it is driving
 * through a rep.
 *
 * See Casiez, Roussel & Vogel, "1€ Filter" (CHI 2012).
 */
export type PoseSmoothingOptions = {
  /** Cutoff in Hz at rest. Lower is smoother and laggier. */
  minCutoff: number
  /** How hard the cutoff opens up with speed. Higher tracks fast motion. */
  beta: number
  /** Cutoff in Hz for the speed estimate itself. */
  dCutoff: number
}

/**
 * Tuned against a synthetic 2s squat with ±2cm of noise, which is the shape of
 * the real pipeline — clips are sampled at 12fps (`SAMPLE_FPS` in clip-decode).
 * At these values a stationary joint's frame-to-frame shake drops ~61%, while
 * the bottom of the rep lands within ~5mm of the true depth — the measurement
 * that actually decides whether a squat gets called shallow.
 *
 * `beta` is high because lag matters more than polish here: the filter is only
 * allowed to smooth hard while a joint is genuinely still.
 */
export const DEFAULT_POSE_SMOOTHING: PoseSmoothingOptions = {
  minCutoff: 0.5,
  beta: 6,
  dCutoff: 1,
}

type Pointish = { x: number; y: number; z: number; visibility?: number }

function alpha(cutoffHz: number, dtSeconds: number) {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / dtSeconds)
}

function lerp(previous: number, next: number, a: number) {
  return a * next + (1 - a) * previous
}

/** One axis of one landmark. */
class OneEuroAxis {
  private started = false
  private raw = 0
  private value = 0
  private speed = 0

  constructor(private readonly options: PoseSmoothingOptions) {}

  push(x: number, dtSeconds: number) {
    if (!this.started) {
      this.started = true
      this.raw = x
      this.value = x
      this.speed = 0
      return x
    }
    // A zero or negative gap would divide by zero in the speed estimate.
    const dt = dtSeconds > 0 ? dtSeconds : 1e-3
    const derivative = (x - this.raw) / dt
    this.speed = lerp(this.speed, derivative, alpha(this.options.dCutoff, dt))
    const cutoff =
      this.options.minCutoff + this.options.beta * Math.abs(this.speed)
    this.value = lerp(this.value, x, alpha(cutoff, dt))
    this.raw = x
    return this.value
  }

  /** Last smoothed value, or null before the first sample. */
  peek() {
    return this.started ? this.value : null
  }
}

class OneEuroPoint {
  private readonly x: OneEuroAxis
  private readonly y: OneEuroAxis
  private readonly z: OneEuroAxis

  constructor(options: PoseSmoothingOptions) {
    this.x = new OneEuroAxis(options)
    this.y = new OneEuroAxis(options)
    this.z = new OneEuroAxis(options)
  }

  push(point: Pointish, dtSeconds: number) {
    return {
      x: this.x.push(point.x, dtSeconds),
      y: this.y.push(point.y, dtSeconds),
      z: this.z.push(point.z, dtSeconds),
    }
  }

  peek() {
    const x = this.x.peek()
    const y = this.y.peek()
    const z = this.z.peek()
    return x === null || y === null || z === null ? null : { x, y, z }
  }
}

/**
 * Smooths one landmark array across a time series, in place of the per-frame
 * estimates. Untracked and low-confidence samples are held rather than fed in:
 * a landmark the model was guessing at would otherwise yank the filter toward
 * a position the joint was never in.
 */
function smoothSeries<T extends Pointish>(
  series: ReadonlyArray<{ timeMs: number; points: readonly T[] }>,
  options: PoseSmoothingOptions
): T[][] {
  const filters = new Map<number, OneEuroPoint>()
  let lastTimeMs: number | null = null
  // Before there is a previous timestamp, dt comes from the series' own
  // spacing; clips are sampled at 12fps (`SAMPLE_FPS` in clip-decode), which is
  // also the fallback for a series too short to measure.
  const gapSeconds =
    series.length > 1 ? (series[1].timeMs - series[0].timeMs) / 1000 : 0
  const firstDtSeconds = gapSeconds > 0 ? gapSeconds : 1 / 12

  return series.map(({ timeMs, points }) => {
    if (points.length === 0) return []
    const dtSeconds =
      lastTimeMs === null
        ? firstDtSeconds
        : Math.max(timeMs - lastTimeMs, 0) / 1000
    lastTimeMs = timeMs

    return points.map((point, index) => {
      let filter = filters.get(index)
      if (!filter) {
        filter = new OneEuroPoint(options)
        filters.set(index, filter)
      }

      const confident = (point.visibility ?? 1) >= MIN_VISIBILITY
      if (!confident) {
        // Hold the last good position so the untracked frames do not drag the
        // joint; visibility is preserved so the scene still declines to draw it.
        const held = filter.peek()
        return held ? { ...point, ...held } : point
      }

      return { ...point, ...filter.push(point, dtSeconds) }
    })
  })
}

/** One angle's frames with jitter filtered out of both landmark sets. */
export function smoothAngleLandmarks(
  angle: FormCoachAngleLandmarks,
  options: PoseSmoothingOptions = DEFAULT_POSE_SMOOTHING
): FormCoachAngleLandmarks {
  const landmarks = smoothSeries(
    angle.frames.map((frame) => ({
      timeMs: frame.timeMs,
      points: frame.landmarks,
    })),
    options
  )
  // Filtered separately: the two sets are in different spaces, so one cannot be
  // derived from the other.
  const worldLandmarks = smoothSeries(
    angle.frames.map((frame) => ({
      timeMs: frame.timeMs,
      points: frame.worldLandmarks,
    })),
    options
  )

  return {
    ...angle,
    frames: angle.frames.map((frame, index): FormCoachFrame => ({
      ...frame,
      landmarks: landmarks[index] ?? [],
      worldLandmarks: worldLandmarks[index] ?? [],
    })),
  }
}

export function smoothFormCoachLandmarks(
  angles: FormCoachAngleLandmarks[],
  options: PoseSmoothingOptions = DEFAULT_POSE_SMOOTHING
): FormCoachAngleLandmarks[] {
  return angles.map((angle) => smoothAngleLandmarks(angle, options))
}
