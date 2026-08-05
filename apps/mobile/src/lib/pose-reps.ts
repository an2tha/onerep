import type { FormCoachAngleLandmarks, FormCoachFrame } from "@/lib/form-coach"
import { MIN_VISIBILITY } from "@/lib/pose-scene"

const NOSE = 0
const LEFT_SHOULDER = 11
const RIGHT_SHOULDER = 12
const LEFT_ELBOW = 13
const RIGHT_ELBOW = 14
const LEFT_WRIST = 15
const RIGHT_WRIST = 16
const LEFT_HIP = 23
const RIGHT_HIP = 24
const LEFT_KNEE = 25
const RIGHT_KNEE = 26
const LEFT_ANKLE = 27
const RIGHT_ANKLE = 28

/**
 * Frames a capture may carry in total, across every rep of every angle.
 *
 * Mirrors the server's own ceiling with headroom to spare. Reps are dropped
 * whole rather than thinned, so what survives is still real footage.
 */
export const MAX_CAPTURE_FRAMES = 1000

/** A rep with fewer tracked frames than this describes nothing worth measuring. */
const MIN_REP_FRAMES = 4

/**
 * Minimum travel in a distance signal, as a fraction of its own standing value,
 * before a dip counts as a rep rather than a shuffle or a tracking wobble.
 *
 * Relative rather than absolute so it means the same thing on a tall lifter as a
 * short one. Deliberately not loosened much: these chords are insensitive near
 * full extension — hip-to-ankle is `2·L·sin(θ/2)` in the knee angle — so the
 * fraction that would admit a quarter squat is indistinguishable from the one
 * that admits a twitch. Shallow reps are caught by the angle signals instead,
 * which is what they are for.
 */
export const MIN_REP_RANGE_FRACTION = 0.1

/** Absolute floor under the relative threshold, to reject tracking jitter. */
export const MIN_REP_RANGE_M = 0.05

/**
 * Minimum swing in a joint-angle signal, in degrees.
 *
 * Angles are linear in flexion where the chords are not, which is what makes
 * them the reliable signal for a partial rep.
 */
export const MIN_REP_RANGE_DEG = 22

/**
 * The shortest and longest a rep may last.
 *
 * Tracking noise oscillates over two or three frames — a couple of hundred
 * milliseconds at any sampling rate we use — while the fastest thing a human
 * actually reps takes closer to a second. The upper bound is deliberately
 * loose: a grinding single or a paused tempo squat is slow, and the point is
 * only to reject a "rep" that spans half the clip because the signal drifted.
 */
export const MIN_REP_MS = 500
export const MAX_REP_MS = 20_000

/**
 * How far in from each end the working range is measured.
 *
 * Thresholds used to come from the raw minimum and maximum, which made the
 * whole detector hostage to a single frame: one limb flip or one moment of the
 * tracker latching onto somebody walking past would stretch the range, spread
 * the hysteresis bands past where any real rep reached, and return zero reps
 * for a clip full of them. Percentiles cost nothing and cannot be moved by a
 * handful of bad frames.
 */
const RANGE_PERCENTILE = 0.05

type Vec = { x: number; y: number; z: number }
type Point = Vec & { visibility?: number }

/**
 * Gravity, as the pose provider reports it. World y grows *downward*, so up is -y.
 * The camera's own vertical is the only estimate of gravity available, which is
 * why the viewer offers a manual correction on top.
 */
const RAW_UP: Vec = { x: 0, y: -1, z: 0 }

const sub = (a: Vec, b: Vec) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (a: Vec, k: number) => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const mid = (a: Vec, b: Vec) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
})
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec, b: Vec) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const length = (a: Vec) => Math.sqrt(dot(a, a))

function normalize(a: Vec): Vec | null {
  const l = length(a)
  return l < 1e-6 ? null : { x: a.x / l, y: a.y / l, z: a.z / l }
}

/**
 * Rewrites landmarks into a body-fixed frame: origin at the hips, +x from left
 * hip to right hip, +y up the torso, +z out the front.
 *
 * Without this, angles cannot be combined at all. The provider's world landmarks
 * are metric but still camera-relative, so the same squat filmed from the side
 * and from the front produces two point clouds rotated ~90° apart. Averaging
 * them raw would collapse the lifter into a smear. In the body frame both
 * describe the same shape and can be compared point for point.
 *
 * Returns null when the torso landmarks needed to build the basis are missing.
 */
export function toBodyFrame(
  points: readonly Point[],
  up: Vec = RAW_UP
): Point[] | null {
  const leftHip = points[LEFT_HIP]
  const rightHip = points[RIGHT_HIP]
  if (!leftHip || !rightHip) return null

  const hipCentre = mid(leftHip, rightHip)
  const hipLine = sub(rightHip, leftHip)
  // Only the horizontal part of the hip line, so the vertical axis stays
  // gravity and the rotation removed is purely yaw.
  const across = normalize(sub(hipLine, scale(up, dot(hipLine, up))))
  if (!across) return null
  const forward = normalize(cross(across, up))
  if (!forward) return null

  return points.map((point) => {
    const local = sub(point, hipCentre)
    return {
      x: dot(local, across),
      y: dot(local, up),
      z: dot(local, forward),
      visibility: point.visibility,
    }
  })
}

/**
 * Rotates raw landmarks, so a hand-applied tilt reaches the measurements and
 * not just the picture.
 *
 * Body framing removes yaw only, which is what lets a front and a side clip be
 * compared — but it means a global rotation is otherwise cancelled, and the
 * coach would measure an unstraightened skeleton while the lifter looks at a
 * straightened one.
 *
 * The viewer works in scene coordinates, which negate y and z relative to
 * the provider's. Under that flip a rotation about x is unchanged, while one about
 * z reverses — hence the sign on roll.
 */
export function applyOrientation(
  angles: readonly FormCoachAngleLandmarks[],
  orientation: { pitchDeg: number; rollDeg: number }
): FormCoachAngleLandmarks[] {
  const pitch = (orientation.pitchDeg * Math.PI) / 180
  const roll = (-orientation.rollDeg * Math.PI) / 180
  if (pitch === 0 && roll === 0) return angles as FormCoachAngleLandmarks[]

  const rotate = (p: Point): Point => {
    const cy = Math.cos(pitch)
    const sy = Math.sin(pitch)
    const y1 = p.y * cy - p.z * sy
    const z1 = p.y * sy + p.z * cy
    const cz = Math.cos(roll)
    const sz = Math.sin(roll)
    return {
      x: p.x * cz - y1 * sz,
      y: p.x * sz + y1 * cz,
      z: z1,
      visibility: p.visibility,
    }
  }

  return angles.map((angle) => ({
    ...angle,
    frames: angle.frames.map((frame) => ({
      ...frame,
      landmarks: frame.landmarks.map((p) => ({
        ...rotate(p),
        visibility: p.visibility ?? 1,
      })),
      worldLandmarks: frame.worldLandmarks.map((p) => ({
        ...rotate(p),
        visibility: p.visibility ?? 1,
      })),
    })),
  }))
}

/** Mean distance between the visible members of each landmark pair, in metres. */
function meanPairDistance(
  frame: FormCoachFrame,
  pairs: ReadonlyArray<readonly [number, number]>
): number | null {
  const points = frame.worldLandmarks
  if (points.length === 0) return null

  let total = 0
  let counted = 0
  for (const [from, to] of pairs) {
    const a = points[from]
    const b = points[to]
    if (!a || !b) continue
    if ((a.visibility ?? 1) < MIN_VISIBILITY) continue
    if ((b.visibility ?? 1) < MIN_VISIBILITY) continue
    total += length(sub(a, b))
    counted += 1
  }
  return counted === 0 ? null : total / counted
}

/**
 * How far the hips sit above the ankles, in metres.
 *
 * Hip *height* is useless here — world landmarks are hip-centred, so the hips
 * are pinned at the origin by definition — but the hip-to-ankle distance shrinks
 * as the lifter descends and is invariant to which way the camera was pointing.
 */
export function hipToAnkle(frame: FormCoachFrame): number | null {
  const points = frame.worldLandmarks
  if (points.length === 0) return null
  const ankles = [points[LEFT_ANKLE], points[RIGHT_ANKLE]].filter(
    (point) => point !== undefined && (point.visibility ?? 1) >= MIN_VISIBILITY
  )
  if (ankles.length === 0) return null
  const hips = mid(
    points[LEFT_HIP] ?? { x: 0, y: 0, z: 0 },
    points[RIGHT_HIP] ?? { x: 0, y: 0, z: 0 }
  )
  return (
    ankles.reduce((total, ankle) => total + length(sub(ankle, hips)), 0) /
    ankles.length
  )
}

/** How far the wrists sit from the shoulders: presses, rows, curls, pull-ups. */
export function wristToShoulder(frame: FormCoachFrame): number | null {
  return meanPairDistance(frame, [
    [LEFT_WRIST, LEFT_SHOULDER],
    [RIGHT_WRIST, RIGHT_SHOULDER],
  ])
}

/**
 * How far the wrists sit from the hips: raises, pulldowns, shrugs, and anything
 * else where the arm travels as a whole and the elbow barely changes angle.
 */
export function wristToHip(frame: FormCoachFrame): number | null {
  return meanPairDistance(frame, [
    [LEFT_WRIST, LEFT_HIP],
    [RIGHT_WRIST, RIGHT_HIP],
  ])
}

/** Interior angle at a joint, in degrees, averaged over the tracked sides. */
function meanJointAngle(
  frame: FormCoachFrame,
  joints: ReadonlyArray<readonly [number, number, number]>
): number | null {
  const points = frame.worldLandmarks
  if (points.length === 0) return null

  let total = 0
  let counted = 0
  for (const [from, vertex, to] of joints) {
    const a = points[from]
    const b = points[vertex]
    const c = points[to]
    if (!a || !b || !c) continue
    if ((a.visibility ?? 1) < MIN_VISIBILITY) continue
    if ((b.visibility ?? 1) < MIN_VISIBILITY) continue
    if ((c.visibility ?? 1) < MIN_VISIBILITY) continue
    const u = sub(a, b)
    const v = sub(c, b)
    const lengths = length(u) * length(v)
    if (lengths < 1e-9) continue
    total +=
      (Math.acos(Math.min(1, Math.max(-1, dot(u, v) / lengths))) * 180) /
      Math.PI
    counted += 1
  }
  return counted === 0 ? null : total / counted
}

/** Knee flexion, which a squat, lunge or step-up lives in. */
export function kneeAngle(frame: FormCoachFrame) {
  return meanJointAngle(frame, [
    [LEFT_HIP, LEFT_KNEE, LEFT_ANKLE],
    [RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE],
  ])
}

/** Elbow flexion, which a curl, press, row or pull-up lives in. */
export function elbowAngle(frame: FormCoachFrame) {
  return meanJointAngle(frame, [
    [LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST],
    [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST],
  ])
}

/**
 * The signals a rep can show up in, all camera-invariant.
 *
 * A rep is a there-and-back excursion in *something* on the body, but which
 * something depends on the lift: the hips travel towards the floor in a squat,
 * the wrists towards the shoulders in a curl or a bench press, and away from the
 * hips in a lateral raise. Rather than keeping a table of exercise to signal —
 * which would need an entry, and a guess, for every movement a user might log —
 * all of them are measured and the one that actually moved is used. That is what
 * lets a single detector serve every exercise.
 *
 * Both distances and joint angles, because the two fail in opposite places. A
 * chord between two landmarks is insensitive near full extension, where a
 * partial rep happens; a joint angle is linear there but says nothing about a
 * movement the joint does not bend in, like a shrug or a lateral raise. Between
 * them there is no useful rep neither can see.
 */
export const REP_SIGNALS = {
  hip_to_ankle: { read: hipToAnkle, unit: "m" },
  wrist_to_shoulder: { read: wristToShoulder, unit: "m" },
  wrist_to_hip: { read: wristToHip, unit: "m" },
  knee_angle: { read: kneeAngle, unit: "deg" },
  elbow_angle: { read: elbowAngle, unit: "deg" },
} as const satisfies Record<
  string,
  { read: (frame: FormCoachFrame) => number | null; unit: "m" | "deg" }
>

export type RepSignalName = keyof typeof REP_SIGNALS

/**
 * The smallest excursion that counts as a rep in a given signal.
 *
 * Distances scale with the lifter, so their threshold is a fraction of the
 * standing value; angles are already in comparable units and take a flat one.
 */
export function minRepRange(signal: RepSignalName, observedMax: number) {
  if (REP_SIGNALS[signal].unit === "deg") return MIN_REP_RANGE_DEG
  return Math.max(observedMax * MIN_REP_RANGE_FRACTION, MIN_REP_RANGE_M)
}

export type Rep = {
  /** Frame indices: the start of the rep, its turnaround, and its end. */
  startIndex: number
  bottomIndex: number
  endIndex: number
}

/** Value at a percentile of an already-sorted list. */
function percentileOf(sorted: readonly number[], fraction: number): number {
  const index = Math.round(fraction * (sorted.length - 1))
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)]!
}

/** The working range of a signal, measured in from both ends to shed outliers. */
function robustRange(tracked: readonly number[]) {
  const sorted = [...tracked].sort((a, b) => a - b)
  const low = percentileOf(sorted, RANGE_PERCENTILE)
  const high = percentileOf(sorted, 1 - RANGE_PERCENTILE)
  return { low, high, range: high - low }
}

/**
 * A three-point median over the signal, which removes single-frame spikes.
 *
 * A spike matters beyond just moving the thresholds: one frame that reads as
 * fully extended in the middle of a descent ends the rep early and starts a
 * phantom one. A median leaves a smooth signal essentially untouched while
 * deleting anything only one frame wide.
 *
 * Untracked frames stay untracked — a gap is information, and filling it in
 * would invent a position the lifter was never in.
 */
function despike(signal: ReadonlyArray<number | null>): Array<number | null> {
  return signal.map((value, i) => {
    if (value === null) return null
    const window = [signal[i - 1], value, signal[i + 1]].filter(
      (candidate): candidate is number =>
        candidate !== null && candidate !== undefined
    )
    window.sort((a, b) => a - b)
    return window[Math.floor(window.length / 2)]!
  })
}

/**
 * How strongly a signal repeats, and at what lag.
 *
 * This is the self-similarity idea behind class-agnostic rep counters: a set of
 * reps is periodic, so the signal correlated against a shifted copy of itself
 * peaks at the rep period. It is a whole-clip fit rather than a threshold
 * crossing, which is what makes it robust — a few bad frames barely move a
 * correlation computed over hundreds of pairs, whereas they can easily fake or
 * destroy an individual crossing.
 *
 * Used to judge *which* signal describes the movement rather than to count off
 * it directly: a jittery channel and a real one can produce the same number of
 * cycles, but only the real one repeats on a steady period.
 */
export function selfSimilarity(
  signal: ReadonlyArray<number | null>,
  minLag: number,
  maxLag: number
): { lag: number; strength: number } | null {
  const tracked = signal.filter((value): value is number => value !== null)
  if (tracked.length < 4) return null

  // Half the clip is the longest lag with enough overlap to mean anything.
  const longest = Math.min(maxLag, Math.floor(signal.length / 2))
  if (minLag < 1 || longest < minLag) return null

  const mean = tracked.reduce((sum, value) => sum + value, 0) / tracked.length
  const variance =
    tracked.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    tracked.length
  if (variance <= 0) return null

  let best: { lag: number; strength: number } | null = null
  for (let lag = minLag; lag <= longest; lag += 1) {
    let sum = 0
    let pairs = 0
    for (let i = 0; i + lag < signal.length; i += 1) {
      const here = signal[i]
      const there = signal[i + lag]
      if (here === null || there === null) continue
      sum += (here - mean) * (there - mean)
      pairs += 1
    }
    if (pairs < 4) continue
    const strength = sum / pairs / variance
    if (!best || strength > best.strength) best = { lag, strength }
  }

  if (!best || best.strength <= 0) return null
  return { lag: best.lag, strength: Math.min(best.strength, 1) }
}

/**
 * How evenly spaced a set of rep durations is, from 0 to 1.
 *
 * Real reps are rhythmic; cycles read off noise are not. A single rep has no
 * rhythm to judge, so it scores neutral rather than being punished for it.
 */
export function durationRegularity(durations: readonly number[]): number {
  if (durations.length < 2) return 1
  const mean =
    durations.reduce((sum, value) => sum + value, 0) / durations.length
  if (mean <= 0) return 0
  const variance =
    durations.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    durations.length
  const spread = Math.sqrt(variance) / mean
  return Math.min(Math.max(1 - spread, 0), 1)
}

/**
 * Finds cycles in one signal, taking a *fall* and return as the rep.
 *
 * Uses hysteresis rather than plain local minima: a lifter pausing or bouncing
 * at the turnaround produces several minima within one rep, and thresholding on
 * a single midpoint would count each of them.
 *
 * Crossings are read from a despiked copy and the working range from
 * percentiles, so neither the thresholds nor the transitions can be set by one
 * bad frame. The turnaround is still located in the raw signal, because the
 * deepest frame is the one worth measuring and a filter moves it.
 */
function detectCycles(
  signal: ReadonlyArray<number | null>,
  minRange: number,
  times: readonly number[]
): Rep[] {
  const tracked = signal.filter((value): value is number => value !== null)
  if (tracked.length < 4) return []

  const smoothed = despike(signal)
  const { low, range } = robustRange(
    smoothed.filter((value): value is number => value !== null)
  )
  if (range < minRange) return []

  // Wide band so noise around either end cannot re-trigger the state machine.
  const extended = low + range * 0.75
  const deep = low + range * 0.35
  // Most of the way back up: enough to call a rep performed even though the
  // lifter never returned to a clean lockout.
  const recovered = low + range * 0.55

  const reps: Rep[] = []
  let phase: "extended" | "working" = "extended"
  let startIndex = 0
  let bottomIndex = 0
  let bottomValue = Infinity
  let lastIndex = -1
  let lastValue: number | null = null

  for (let i = 0; i < smoothed.length; i += 1) {
    const value = smoothed[i]
    if (value === null) continue
    lastIndex = i
    lastValue = value

    if (phase === "extended") {
      if (value >= extended) startIndex = i
      if (value <= deep) {
        phase = "working"
        bottomIndex = i
        bottomValue = signal[i]!
      }
      continue
    }

    const raw = signal[i]!
    if (raw < bottomValue) {
      bottomValue = raw
      bottomIndex = i
    }
    if (value >= extended) {
      reps.push({ startIndex, bottomIndex, endIndex: i })
      phase = "extended"
      startIndex = i
      bottomValue = Infinity
    }
  }

  // A clip that stops before the lifter racks the bar used to lose its final
  // rep entirely — the state machine only ever emitted one on the way back up,
  // so ending mid-ascent discarded it. That is the most fatigued rep of the
  // set and the one most likely to carry the fault worth coaching.
  if (phase === "working" && lastValue !== null && lastValue >= recovered) {
    reps.push({ startIndex, bottomIndex, endIndex: lastIndex })
  }

  return reps.filter((rep) => {
    const duration = (times[rep.endIndex] ?? 0) - (times[rep.startIndex] ?? 0)
    return duration >= MIN_REP_MS && duration <= MAX_REP_MS
  })
}

export type RepDetection = {
  /** The signal the reps were read from, or null when none were found. */
  signal: RepSignalName | null
  reps: Rep[]
}

/**
 * The typical gap between frames, used to convert rep durations into lags.
 *
 * Measured rather than assumed, so a clip sampled at some other rate — or one
 * whose decoder delivered frames unevenly — still reasons in real time.
 */
function frameStepMs(times: readonly number[]): number {
  const steps: number[] = []
  for (let i = 1; i < times.length; i += 1) {
    const step = times[i]! - times[i - 1]!
    if (step > 0) steps.push(step)
  }
  if (steps.length === 0) return 0
  steps.sort((a, b) => a - b)
  return steps[Math.floor(steps.length / 2)]!
}

/**
 * How much a set of detected reps looks like lifting rather than like noise.
 *
 * Three independent things have to hold: the signal has to repeat on a steady
 * period, the reps it produced have to be evenly spaced, and the excursion has
 * to clear the threshold by a margin. Each is capped once it is convincing, so
 * two signals that both plainly describe the movement come out equal rather
 * than being separated on a rounding difference.
 */
function detectionScore(input: {
  reps: readonly Rep[]
  times: readonly number[]
  similarity: number | null
  excess: number
}): number {
  if (input.reps.length === 0) return 0

  const durations = input.reps.map(
    (rep) =>
      (input.times[rep.endIndex] ?? 0) - (input.times[rep.startIndex] ?? 0)
  )
  // A clip too short to show a second period cannot be judged on rhythm, so an
  // unavailable reading sits between "steady" and "not", rather than at zero.
  const rhythm = input.similarity === null ? 0.75 : 0.5 + 0.5 * input.similarity
  const regularity = 0.5 + 0.5 * durationRegularity(durations)
  const margin = 0.5 + 0.5 * Math.min(input.excess / 3, 1)
  return rhythm * regularity * margin
}

/**
 * Reads reps out of whichever signal the movement actually lives in.
 *
 * Each candidate is tried in both directions, because a rep is not always a
 * shortening: a bench press starts at lockout and closes the wrist-to-shoulder
 * distance, while an overhead press starts racked and opens it.
 *
 * The winner used to be whichever combination produced the most reps, which is
 * backwards: noise generates more cycles than lifting does, so the jitteriest
 * channel won. A squat with a loaded bar racked on the shoulders would get
 * counted off elbow-angle noise, because two bad frames are enough to clear a
 * flat threshold measured as a raw maximum minus minimum. Signals are now
 * scored on how much they look like a set — periodic, evenly spaced, and
 * clearly past threshold — and count only decides anything through that.
 */
export function chooseRepSignal(
  frames: readonly FormCoachFrame[]
): RepDetection {
  const times = frames.map((frame) => frame.timeMs)
  const step = frameStepMs(times)
  const minLag = step > 0 ? Math.max(1, Math.round(MIN_REP_MS / step)) : 1
  const maxLag =
    step > 0 ? Math.max(minLag, Math.round(MAX_REP_MS / step)) : frames.length

  let best: RepDetection & { score: number } = {
    signal: null,
    reps: [],
    score: 0,
  }

  for (const name of Object.keys(REP_SIGNALS) as RepSignalName[]) {
    const values = frames.map(REP_SIGNALS[name].read)
    const tracked = values.filter((value): value is number => value !== null)
    if (tracked.length < 4) continue
    const { high, range } = robustRange(tracked)
    const minRange = minRepRange(name, high)
    if (range < minRange) continue
    const excess = range / minRange
    const periodicity = selfSimilarity(values, minLag, maxLag)
    const similarity = periodicity ? periodicity.strength : null

    for (const inverted of [false, true]) {
      const reps = detectCycles(
        inverted ? values.map((v) => (v === null ? null : -v)) : values,
        minRange,
        times
      )
      const score = detectionScore({ reps, times, similarity, excess })
      // Strictly greater, so signals that describe the movement equally well
      // fall back to the order they are declared in — hips before wrists,
      // distances before angles — rather than to floating-point luck.
      if (score > best.score) best = { signal: name, reps, score }
    }
  }

  return { signal: best.signal, reps: best.reps }
}

/** The reps in a clip, from whichever signal best describes the movement. */
export function detectReps(frames: readonly FormCoachFrame[]): Rep[] {
  return chooseRepSignal(frames).reps
}

/**
 * Which way the camera was pointing relative to the lifter.
 *
 * This decides which measurements can be trusted at all — knee tracking is only
 * visible from the front, torso lean only from the side — so it travels with the
 * data rather than being guessed downstream.
 */
export type CameraView = "front" | "back" | "side" | "oblique"

/** One rep, as the frames it was actually filmed in. */
export type CapturedRep = {
  /** 1-based index of the angle it came from. */
  angleIndex: number
  /** Order within that angle, 1-based. */
  repIndex: number
  /** Where the rep began in its own clip, in milliseconds. */
  startMs: number
  /** Body-framed, at the sampling rate of the clip. `timeMs` is from rep start. */
  frames: FormCoachFrame[]
  /** Real durations, in milliseconds, measured before any frame was dropped. */
  timing: { totalMs: number; toTurnaroundMs: number }
}

export type AngleSummary = {
  index: number
  view: CameraView
  repCount: number
  /** Share of frames in which a pose was found, 0–1. */
  trackingRate: number
  durationMs: number
  /**
   * Which body distance the reps were counted in. Travels with the capture
   * because it says what the movement was, which the coach otherwise has no way
   * to know for an exercise it has never been told about. Null when no rep was
   * recognised in this angle at all.
   */
  repSignal: RepSignalName | null
}

export type CollectedReps = {
  /**
   * What the viewer plays: the best-tracked real rep, chosen rather than
   * synthesised. An averaged skeleton looked cleaner than any rep the lifter
   * performed, which is exactly the problem — the fault worth seeing is the one
   * averaging removes. Falls back to the best-tracked clip itself when no rep
   * was recognised.
   */
  display: FormCoachAngleLandmarks
  /** Every rep from every angle, in the order they were performed. Possibly none. */
  reps: CapturedRep[]
  /** Per-angle capture metadata, including angles that yielded no rep. */
  angles: AngleSummary[]
  /** How many reps were kept. */
  repCount: number
  /** How many angles contributed at least one rep. */
  angleCount: number
}

/** Frames the fallback display keeps when there is no rep to show instead. */
const MAX_DISPLAY_FRAMES = 60

/** Within this many degrees of square-on counts as a front or back view. */
const FRONTAL_TOLERANCE_DEG = 30
/** Within this many degrees of edge-on counts as a side view. */
const SAGITTAL_TOLERANCE_DEG = 30

/**
 * Where the camera stood, from the *raw* camera-frame landmarks.
 *
 * Deliberately not the body-framed ones: body framing exists to remove the
 * camera's orientation, which is precisely the signal needed here.
 *
 * World landmarks sit in a camera-relative frame — x across the image,
 * z into it — so the shoulder line's bearing in the horizontal plane says how
 * square-on the shot was. Running left-to-right across the image means front or
 * back; running into the image means side.
 *
 * Front and back are then separated by the nose's depth relative to the
 * shoulders. That is a fact about faces rather than a convention: the nose
 * protrudes from the front of the head, so it sits nearer the camera when the
 * lifter faces it. Deciding on the sign of the shoulder line's x instead would
 * depend on whether the frame is mirrored, which is not something to guess at.
 *
 * Averaged over the whole clip, because one frame can be thrown by a turn of the
 * shoulders. Four coarse buckets, because monocular z is not accurate enough to
 * justify a finer answer.
 */
export function classifyCameraView(
  frames: readonly FormCoachFrame[]
): CameraView {
  let acrossX = 0
  let acrossZ = 0
  let noseDepth = 0
  let counted = 0

  for (const frame of frames) {
    const points = frame.worldLandmarks
    if (points.length === 0) continue
    const left = points[LEFT_SHOULDER]
    const right = points[RIGHT_SHOULDER]
    const nose = points[NOSE]
    if (!left || !right || !nose) continue

    const dx = right.x - left.x
    const dz = right.z - left.z
    const span = Math.hypot(dx, dz)
    if (span < 1e-6) continue

    // Normalised per frame so a frame shot closer to the camera does not weigh
    // more than one shot further away.
    acrossX += dx / span
    acrossZ += dz / span
    // Provider z grows away from the camera, so a negative offset means the
    // face is turned towards it.
    noseDepth += nose.z - (left.z + right.z) / 2
    counted += 1
  }

  if (counted === 0) return "oblique"

  const magnitude = Math.hypot(acrossX, acrossZ)
  if (magnitude < 1e-6) return "oblique"

  // 0 = shoulder line runs straight across the image, 90 = straight into it.
  const offAxisDeg =
    (Math.atan2(Math.abs(acrossZ), Math.abs(acrossX)) * 180) / Math.PI

  if (offAxisDeg >= 90 - SAGITTAL_TOLERANCE_DEG) return "side"
  if (offAxisDeg <= FRONTAL_TOLERANCE_DEG) {
    // Squarely in the frontal plane but the face gives nothing away — better to
    // report an uncertain view than to guess which way they were facing.
    if (Math.abs(noseDepth) < 1e-6) return "oblique"
    return noseDepth < 0 ? "front" : "back"
  }
  return "oblique"
}

/** One second of footage between point-cloud samples. */
export const TIMELINE_SAMPLE_MS = 1000

/**
 * Sampling used when rep detection came back empty.
 *
 * The point cloud is a supplement while there are reps to measure, and the only
 * evidence there is when there are not — a second apart cannot show a two-second
 * rep, so it tightens to three samples a second and covers whatever length of
 * footage the sample cap allows.
 */
export const TIMELINE_DENSE_SAMPLE_MS = 333

/** Enough for a minute of footage across every angle. */
export const MAX_TIMELINE_SAMPLES = 60

/** A sample within this of a wanted second is close enough to stand for it. */
const TIMELINE_TOLERANCE_MS = 500

export type TimelineSample = {
  angleIndex: number
  /** Milliseconds into that angle's clip. */
  timeMs: number
  /** Body-framed, in metres. */
  worldLandmarks: Point[]
}

/**
 * The whole of every clip at one sample a second, body-framed.
 *
 * Rep frames answer "what happened during a rep"; this answers "what happened",
 * full stop — including the setup, the walkout, the pause between reps and
 * whatever the lifter did after racking it. Coarse on purpose: a second apart is
 * too sparse to measure a fault from, and about right for seeing the shape of
 * the set without shipping the clip.
 *
 * Angles are combined into one series rather than kept apart, each sample saying
 * which clip it came from. Body framing is what makes that legitimate — it is
 * the one piece of processing without which two clips shot from different sides
 * are not in the same coordinate system at all.
 */
export function buildTimeline(
  angles: readonly FormCoachAngleLandmarks[],
  limit = MAX_TIMELINE_SAMPLES,
  everyMs = TIMELINE_SAMPLE_MS
): TimelineSample[] {
  const samples: TimelineSample[] = []
  const tolerance = Math.min(TIMELINE_TOLERANCE_MS, everyMs / 2)

  for (const angle of angles) {
    const tracked = angle.frames.filter(
      (frame) => frame.worldLandmarks.length > 0
    )
    if (tracked.length === 0) continue
    const lastMs = tracked.at(-1)?.timeMs ?? 0

    for (let wanted = 0; wanted <= lastMs; wanted += everyMs) {
      const nearest = tracked.reduce((best, frame) =>
        Math.abs(frame.timeMs - wanted) < Math.abs(best.timeMs - wanted)
          ? frame
          : best
      )
      if (Math.abs(nearest.timeMs - wanted) > tolerance) continue
      const points = toBodyFrame(nearest.worldLandmarks)
      if (!points) continue
      samples.push({
        angleIndex: angle.index,
        timeMs: nearest.timeMs,
        worldLandmarks: points,
      })
    }
  }

  if (samples.length <= limit) return samples
  // Thin evenly rather than truncating, so a long clip still spans its own set.
  const step = (samples.length - 1) / Math.max(limit - 1, 1)
  return Array.from(
    { length: limit },
    (_, i) => samples[Math.round(i * step)]
  ).filter((sample): sample is TimelineSample => sample !== undefined)
}

/** Mean landmark visibility across a rep, as a rough tracking score. */
export function repQuality(rep: CapturedRep) {
  let total = 0
  let counted = 0
  for (const frame of rep.frames) {
    for (const point of frame.worldLandmarks) {
      total += point.visibility ?? 1
      counted += 1
    }
  }
  if (counted === 0) return 0
  // Length matters as well as clarity: a two-frame rep can be perfectly tracked
  // and still show nothing.
  return (total / counted) * Math.min(rep.frames.length / 12, 1)
}

/**
 * Thins a capture down to the frame budget by dropping whole reps.
 *
 * Evenly spaced, so what survives still spans the set from first rep to last —
 * fatigue across a long set is exactly the thing a naive "keep the first N"
 * would throw away.
 */
export function fitToFrameBudget(
  reps: readonly CapturedRep[],
  budget = MAX_CAPTURE_FRAMES
): CapturedRep[] {
  const total = reps.reduce((sum, rep) => sum + rep.frames.length, 0)
  if (total <= budget || reps.length <= 1) return reps as CapturedRep[]

  const keep = Math.max(1, Math.floor((reps.length * budget) / total))
  const step = (reps.length - 1) / Math.max(keep - 1, 1)
  const indices = new Set(
    Array.from({ length: keep }, (_, i) => Math.round(i * step))
  )
  return reps.filter((_, index) => indices.has(index))
}

/**
 * Every rep from every angle, as filmed.
 *
 * Angles are combined in the sense that they all land in one capture — the
 * measurements downstream read across the lot. What deliberately does *not*
 * happen is any averaging between them: reps are kept whole, at the clip's own
 * sampling rate, because a fault lives in the extremes of one rep and averaging
 * five reps together is a low-pass filter over exactly that.
 *
 * Body framing stays, since without it two clips shot 90° apart cannot be
 * compared at all.
 *
 * A capture with no recognisable rep is still returned. Rep detection is a
 * guess — a hold, a partial, a movement whose signal lives somewhere this does
 * not look, or simply a lifter who paused too long — and being unable to find a
 * rep is not a reason to throw away footage the coach can still read. Only
 * footage where nothing at all was tracked comes back null.
 */
export function collectReps(
  angles: readonly FormCoachAngleLandmarks[]
): CollectedReps | null {
  const collected: CapturedRep[] = []
  const angleSummaries: AngleSummary[] = []
  let contributingAngles = 0

  for (const angle of angles) {
    const bodyFrames = angle.frames.map((frame) =>
      frame.worldLandmarks.length === 0
        ? null
        : toBodyFrame(frame.worldLandmarks)
    )
    const trackedCount = bodyFrames.filter((points) => points !== null).length
    if (trackedCount === 0) continue

    const summary: AngleSummary = {
      index: angle.index,
      view: classifyCameraView(angle.frames),
      repCount: 0,
      trackingRate:
        angle.frames.length === 0 ? 0 : trackedCount / angle.frames.length,
      durationMs: angle.frames.at(-1)?.timeMs ?? 0,
      repSignal: null,
    }
    angleSummaries.push(summary)

    const { signal, reps } = chooseRepSignal(angle.frames)
    if (reps.length === 0 || signal === null) continue

    const kept: CapturedRep[] = []
    for (const rep of reps) {
      const startMs = angle.frames[rep.startIndex]?.timeMs ?? 0
      const frames: FormCoachFrame[] = []

      for (let i = rep.startIndex; i <= rep.endIndex; i += 1) {
        const points = bodyFrames[i]
        // An untracked frame carries no measurement, and keeping it as an empty
        // one only invites a reading of zero somewhere downstream. Real times
        // are preserved on the frames that remain, so the gap stays visible.
        if (!points) continue
        const landmarks = points.map((point) => ({
          x: point.x,
          y: point.y,
          z: point.z,
          visibility: point.visibility ?? 1,
        }))
        frames.push({
          timeMs: (angle.frames[i]?.timeMs ?? startMs) - startMs,
          landmarks,
          worldLandmarks: landmarks,
        })
      }

      if (frames.length < MIN_REP_FRAMES) continue
      kept.push({
        angleIndex: angle.index,
        repIndex: kept.length + 1,
        startMs,
        timing: {
          totalMs: (angle.frames[rep.endIndex]?.timeMs ?? startMs) - startMs,
          toTurnaroundMs:
            (angle.frames[rep.bottomIndex]?.timeMs ?? startMs) - startMs,
        },
        frames,
      })
    }

    if (kept.length === 0) continue
    contributingAngles += 1
    collected.push(...kept)
    summary.repCount = kept.length
    summary.repSignal = signal
  }

  if (angleSummaries.length === 0) return null

  const reps = fitToFrameBudget(collected)
  const display =
    reps.length > 0
      ? reps.reduce((best, rep) =>
          repQuality(rep) > repQuality(best) ? rep : best
        )
      : null

  return {
    display: display
      ? { index: display.angleIndex, frames: display.frames }
      : bestTrackedClip(angles, angleSummaries),
    reps,
    angles: angleSummaries,
    repCount: reps.length,
    angleCount: contributingAngles,
  }
}

/**
 * The clearest clip, body-framed and thinned, for when there is no rep to play.
 *
 * Shown rather than an empty box: the lifter still filmed something, and seeing
 * it is how they work out why nothing was counted.
 */
function bestTrackedClip(
  angles: readonly FormCoachAngleLandmarks[],
  summaries: readonly AngleSummary[]
): FormCoachAngleLandmarks {
  const best = summaries.reduce((winner, summary) =>
    summary.trackingRate > winner.trackingRate ? summary : winner
  )
  const source = angles.find((angle) => angle.index === best.index)

  const frames: FormCoachFrame[] = []
  for (const frame of source?.frames ?? []) {
    if (frame.worldLandmarks.length === 0) continue
    const points = toBodyFrame(frame.worldLandmarks)
    if (!points) continue
    const landmarks = points.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
      visibility: point.visibility ?? 1,
    }))
    frames.push({ timeMs: frame.timeMs, landmarks, worldLandmarks: landmarks })
  }

  if (frames.length <= MAX_DISPLAY_FRAMES) return { index: best.index, frames }
  const step = (frames.length - 1) / (MAX_DISPLAY_FRAMES - 1)
  return {
    index: best.index,
    frames: Array.from(
      { length: MAX_DISPLAY_FRAMES },
      (_, i) => frames[Math.round(i * step)]
    ),
  }
}
