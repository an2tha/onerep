import type { FormCoachFrame } from "@/lib/form-coach"

/**
 * Continuous pose over time, built from the measured frames.
 *
 * The clips are sampled at 12fps (`SAMPLE_FPS` in clip-decode), so playing
 * frames straight back steps the skeleton twelve times a second and reads as
 * jitter however clean the underlying data is. This fills the gaps so the
 * scene can animate at display rate.
 *
 * Interpolation is monotone cubic (Fritsch–Carlson / PCHIP), chosen over the
 * usual Catmull-Rom because it is shape-preserving: between two measured
 * samples the curve never leaves the range they bracket. A spline that
 * overshoots would invent depth the lifter never reached — smoother, but no
 * longer a record of what happened. It also passes exactly through every
 * measured sample, so the data is unchanged at the points where it is real.
 */
export type PoseTrack = {
  /** Sample timestamps, ascending. */
  times: number[]
  /**
   * Flattened per-sample values: `values[axis][sampleIndex]`, where axis runs
   * x, y, z, visibility for each landmark in turn. Flat arrays keep sampling
   * allocation-free on the animation path.
   */
  values: Float64Array[]
  /** Precomputed PCHIP slopes, parallel to `values`. */
  slopes: Float64Array[]
  landmarkCount: number
  durationMs: number
}

const CHANNELS = 4 // x, y, z, visibility

/** Fritsch–Carlson slopes: shape-preserving, so the curve cannot overshoot. */
function pchipSlopes(times: number[], values: Float64Array): Float64Array {
  const n = values.length
  const slopes = new Float64Array(n)
  if (n < 2) return slopes

  const h: number[] = []
  const secant: number[] = []
  for (let i = 0; i < n - 1; i += 1) {
    const step = times[i + 1] - times[i]
    h.push(step)
    secant.push(step === 0 ? 0 : (values[i + 1] - values[i]) / step)
  }

  slopes[0] = secant[0]
  slopes[n - 1] = secant[n - 2]

  for (let i = 1; i < n - 1; i += 1) {
    const previous = secant[i - 1]
    const next = secant[i]
    // A sign change is a local extremum. Forcing the slope flat there is what
    // stops the curve bulging past the measured turning point.
    if (previous * next <= 0) {
      slopes[i] = 0
      continue
    }
    const w1 = 2 * h[i] + h[i - 1]
    const w2 = h[i] + 2 * h[i - 1]
    slopes[i] = (w1 + w2) / (w1 / previous + w2 / next)
  }

  return slopes
}

/**
 * Builds a track from measured frames.
 *
 * `loop` appends a wrapped copy of the first sample so a cycle joins back to
 * its start without a visible pop — right for the canonical rep, which begins
 * and ends standing.
 */
export function buildPoseTrack(
  frames: readonly FormCoachFrame[],
  options: { loop?: boolean } = {}
): PoseTrack | null {
  const usable = frames.filter((frame) => frame.worldLandmarks.length > 0)
  if (usable.length === 0) return null

  const landmarkCount = usable[0].worldLandmarks.length
  const times = usable.map((frame) => frame.timeMs)

  if (options.loop && usable.length > 1) {
    const meanStep =
      (times[times.length - 1] - times[0]) / (times.length - 1) || 100
    usable.push(usable[0])
    times.push(times[times.length - 1] + meanStep)
  }

  const channelCount = landmarkCount * CHANNELS
  const values: Float64Array[] = Array.from(
    { length: channelCount },
    () => new Float64Array(usable.length)
  )

  usable.forEach((frame, sample) => {
    for (let landmark = 0; landmark < landmarkCount; landmark += 1) {
      const point = frame.worldLandmarks[landmark]
      const base = landmark * CHANNELS
      values[base][sample] = point?.x ?? 0
      values[base + 1][sample] = point?.y ?? 0
      values[base + 2][sample] = point?.z ?? 0
      values[base + 3][sample] = point?.visibility ?? 1
    }
  })

  return {
    times,
    values,
    slopes: values.map((channel) => pchipSlopes(times, channel)),
    landmarkCount,
    durationMs: Math.max(times[times.length - 1] - times[0], 0),
  }
}

/** Index of the segment containing `time`, via binary search. */
function segmentAt(times: number[], time: number) {
  let low = 0
  let high = times.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (times[middle] <= time) low = middle
    else high = middle
  }
  return low
}

export type SampledPoint = {
  x: number
  y: number
  z: number
  visibility: number
}

/**
 * The pose at an arbitrary time, in the same shape as a measured frame.
 * Times outside the track clamp to its ends rather than extrapolating, because
 * extrapolated poses are fiction.
 */
export function samplePoseAt(
  track: PoseTrack,
  timeMs: number,
  into?: SampledPoint[]
): SampledPoint[] {
  const { times, values, slopes, landmarkCount } = track
  const out =
    into && into.length === landmarkCount
      ? into
      : Array.from({ length: landmarkCount }, () => ({
          x: 0,
          y: 0,
          z: 0,
          visibility: 0,
        }))

  const clamped = Math.min(Math.max(timeMs, times[0]), times[times.length - 1])

  if (times.length === 1) {
    for (let landmark = 0; landmark < landmarkCount; landmark += 1) {
      const base = landmark * CHANNELS
      out[landmark].x = values[base][0]
      out[landmark].y = values[base + 1][0]
      out[landmark].z = values[base + 2][0]
      out[landmark].visibility = values[base + 3][0]
    }
    return out
  }

  const i = segmentAt(times, clamped)
  const h = times[i + 1] - times[i]
  const t = h === 0 ? 0 : (clamped - times[i]) / h

  // Cubic Hermite basis.
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2

  const evaluate = (channel: number) =>
    h00 * values[channel][i] +
    h10 * h * slopes[channel][i] +
    h01 * values[channel][i + 1] +
    h11 * h * slopes[channel][i + 1]

  for (let landmark = 0; landmark < landmarkCount; landmark += 1) {
    const base = landmark * CHANNELS
    const point = out[landmark]
    point.x = evaluate(base)
    point.y = evaluate(base + 1)
    point.z = evaluate(base + 2)
    // Visibility is a probability; the cubic can nudge it a hair outside 0–1.
    point.visibility = Math.min(Math.max(evaluate(base + 3), 0), 1)
  }

  return out
}
