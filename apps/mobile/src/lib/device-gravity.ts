/**
 * Camera tilt from the accelerometer, so the "Straighten" sliders start where
 * the phone actually was instead of at zero.
 *
 * The recorder low-passes `devicemotion` while filming; the settled gravity
 * vector says exactly how far off level the camera sat, which is the very thing
 * the user was being asked to eyeball with two sliders. The output here is a
 * `PoseOrientation` in the same convention `applyOrientation` in
 * `pose-reps.ts` consumes, so the seed corrects the skeleton by construction.
 *
 * Everything in this file is pure and unit-tested; the recorder only wires
 * events into it.
 */

export type GravityVector = { x: number; y: number; z: number }

export type GravityOrientation = { pitchDeg: number; rollDeg: number }

/**
 * Smoothing weight of a new sample. At iOS's ~60 Hz devicemotion rate, 0.1
 * settles in a few hundred ms and shrugs off the shake of a thumb hitting
 * record.
 */
export const GRAVITY_EMA_ALPHA = 0.1

/** One EMA step. A null history adopts the first sample whole. */
export function emaGravity(
  previous: GravityVector | null,
  sample: GravityVector,
  alpha: number = GRAVITY_EMA_ALPHA
): GravityVector {
  if (!previous) return sample
  return {
    x: previous.x + alpha * (sample.x - previous.x),
    y: previous.y + alpha * (sample.y - previous.y),
    z: previous.z + alpha * (sample.z - previous.z),
  }
}

/**
 * `accelerationIncludingGravity` normalized so the returned vector points
 * along physical gravity — toward the earth — in device coordinates
 * (x right of the screen, y toward the top edge, z out of the screen).
 *
 * The W3C spec defines the value as the reaction: a phone at rest reports the
 * acceleration holding it *up*, so spec-compliant browsers (Chrome on Android)
 * give a vector pointing away from the earth. iOS WebKit has always reported
 * the opposite sign — the gravity direction itself — and this app's WKWebView
 * runs that implementation. Normalizing on platform here keeps every formula
 * below in one convention: gravity points down.
 */
export function normalizeEventGravity(
  accel: { x: number | null; y: number | null; z: number | null } | null,
  platform: string
): GravityVector | null {
  if (!accel) return null
  const { x, y, z } = accel
  if (x === null || y === null || z === null) return null
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
    return null
  return platform === "ios" ? { x, y, z } : { x: -x, y: -y, z: -z }
}

/**
 * Below this magnitude (m/s²) the vector is noise or free fall, not gravity.
 * Resting gravity reads ~9.8; anything under 2 has no usable direction.
 */
const MIN_GRAVITY = 2

/**
 * Camera pitch and roll from the settled gravity vector, in the exact
 * convention `applyOrientation` (pose-reps.ts) undoes. Null when the direction
 * is unusable: near-zero vector, or an interface orientation the mapping does
 * not cover.
 *
 * Derivation, written down so the signs stay honest:
 *
 * Frames. Device frame (portrait): X right of screen, Y toward the top edge,
 * Z out of the screen toward the user. Camera/pose frame (what the provider's
 * `worldLandmarks` use): x right in the image, y down in the image, z away
 * from the lens into the scene. For the rear camera the lens looks out the
 * back, so x_c = X, y_c = -Y, z_c = -Z. The front camera looks out the
 * screen: z_c = +Z, y_c = -Y still, and x_c = -X to stay right-handed.
 *
 * `applyOrientation` rotates every landmark by R = Rz(-rollDeg) · Rx(pitchDeg)
 * (radians; Rx maps +y toward +z, Rz maps +x toward +y). Measurements
 * downstream treat -y as "up", so the correction we want is the R that maps
 * the *measured* gravity direction ĝ = (gx, gy, gz) in camera coordinates onto
 * the assumed one, (0, 1, 0).
 *
 * Solve Rz(φ) · Rx(θ) · ĝ = (0, 1, 0):
 *   Rx(θ) zeroes the z component:  gy·sinθ + gz·cosθ = 0
 *     → θ = atan2(-gz, gy), leaving (gx, r, 0) with r = √(gy² + gz²) ≥ 0.
 *   Rz(φ) zeroes the x component:  gx·cosφ − r·sinφ = 0
 *     → φ = atan2(gx, r).
 * So pitchDeg = θ and rollDeg = −φ (the roll slider's sign is negated inside
 * `applyOrientation`; feeding it −φ makes the applied rotation exactly Rz(φ)).
 *
 * Sanity: a rear camera pitched up by α sees gravity at (0, cosα, −sinα) →
 * pitchDeg = +α. A phone rolled so gravity sits at (sinβ, cosβ, 0) in camera
 * coordinates → rollDeg = −β, which `applyOrientation` turns back into Rz(β).
 * Both round-trip a tilted vertical torso back to vertical; the tests assert
 * this through the real `applyOrientation`.
 *
 * Interface orientation: the mapping above assumes upright portrait, which is
 * how the recorder is laid out and held. Upside-down portrait just negates the
 * device X and Y axes. Landscape would insert a ±90° twist whose sign depends
 * on which way the video pipeline rotated the frames — rather than guess and
 * seed a wrong correction, landscape returns null and the sliders start at 0
 * as they always did.
 */
export function gravityToOrientation(
  gravity: GravityVector,
  facing: "environment" | "user" = "environment",
  screenOrientation: string = "portrait-primary"
): GravityOrientation | null {
  if (screenOrientation.startsWith("landscape")) return null
  const flip = screenOrientation === "portrait-secondary" ? -1 : 1

  // Device frame → camera frame, per the derivation above.
  const dx = gravity.x * flip
  const dy = gravity.y * flip
  const gx = facing === "user" ? -dx : dx
  const gy = -dy
  const gz = facing === "user" ? gravity.z : -gravity.z

  const magnitude = Math.hypot(gx, gy, gz)
  if (!Number.isFinite(magnitude) || magnitude < MIN_GRAVITY) return null

  const pitchDeg = (Math.atan2(-gz, gy) * 180) / Math.PI
  const rollDeg = (-Math.atan2(gx, Math.hypot(gy, gz)) * 180) / Math.PI
  return { pitchDeg, rollDeg }
}

/**
 * A measured orientation squeezed into the Straighten sliders' range and step.
 * A camera more than 45° off level is not "slightly unlevel" and the sliders
 * could not express it anyway.
 */
export function clampOrientation(
  orientation: GravityOrientation,
  limitDeg = 45
): GravityOrientation {
  const clamp = (value: number) =>
    Math.min(limitDeg, Math.max(-limitDeg, Math.round(value)))
  return {
    pitchDeg: clamp(orientation.pitchDeg),
    rollDeg: clamp(orientation.rollDeg),
  }
}
