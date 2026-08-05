import * as ort from "onnxruntime-web/wasm"
import type {
  FormCoachAngle,
  FormCoachAngleKind,
  FormCoachAngleLandmarks,
  FormCoachFrame,
  PoseProvider,
} from "@/lib/form-coach"
import {
  H36M,
  H36M_JOINTS,
  type Keypoint2D,
  cocoToBlazePose2D,
  cocoToH36m,
  h36mToBlazePoseWorld,
} from "@/lib/pose-joints"
import { SAMPLE_FPS, base64ToBlob, sampleClip, shrinkToStill } from "@/lib/clip-decode"
import { loadSession, releaseSessions } from "@/lib/onnx-runtime"
import {
  detectKeypoints,
  releaseDetectorScratch,
  warmDetector,
} from "@/lib/yolo-pose"
import { Capacitor } from "@capacitor/core"
import { PoseEstimation } from "@/lib/native-pose"

/**
 * MotionBERT-lite as the 3D half of the `PoseProvider`.
 *
 * MotionBERT does not see pixels. It is a 2D->3D lifter: `yolo-pose.ts` finds
 * the joints in each frame and this turns that flat, jittery track into a
 * coherent 3D pose by attending across the whole clip at once. That temporal
 * context is the reason for the swap — a per-frame estimator has no way to know
 * that a knee did not actually teleport between two frames, and depth is
 * precisely where per-frame guesses are worst.
 *
 * The cost is that lifting is not incremental: the clip is detected end to end
 * first, then lifted in one or two passes.
 *
 * On iOS the lift runs through CoreML instead of wasm. Only the lift is
 * swapped: detection and normalization stay in JS so there is exactly one
 * implementation of `cropScale`, whose output the two backends must agree on
 * bit-for-bit or the 3D results will diverge in ways nothing will flag.
 */

export const MOTIONBERT_MODEL = "motionbert_lite_int8.onnx"

/**
 * Frames the lifter can attend over at once, fixed by the checkpoint's temporal
 * embedding. At `SAMPLE_FPS` this spans 24s, so all but the longest sets are
 * lifted in a single window.
 */
const MAX_CLIP_LEN = 243

/**
 * A still is tiled to this many frames before lifting.
 *
 * Handing a temporal model a single frame asks it to do the one thing it was
 * built to avoid. Repeating the frame instead presents a person holding
 * perfectly still, which is both true and something the model has seen, and the
 * middle frame is read back out.
 */
const STILL_WINDOW = 27

/**
 * Assumed distance from hip to the base of the neck, in metres.
 *
 * A monocular lift has no absolute scale — nothing in a single camera's view
 * distinguishes a large person far away from a small one close up. But
 * `worldLandmarks` is defined in metres, and rep detection thresholds
 * (`MIN_REP_RANGE_M` and the rest) are metric, so a scale has to come from
 * somewhere. The torso is the most stable choice: it barely changes length
 * through a rep, unlike anything involving a limb, and varies less between
 * adults than height does.
 *
 * The consequence is that absolute measurements are approximate for an unusually
 * proportioned lifter, while everything relative — depth reached, symmetry,
 * tempo — stays correct. Rep detection reads the second kind.
 */
const ASSUMED_TORSO_M = 0.5

/** Confidence below which a detected joint is not worth feeding the lifter. */
const MIN_JOINT_SCORE = 0.3

/** True when the CoreML lifter is present and should be preferred over wasm. */
const nativeLiftAvailable = () =>
  Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("PoseEstimation")

/**
 * The normalization MotionBERT was trained under, from `crop_scale` in
 * `MotionBERT/lib/utils/utils_data.py`.
 *
 * Every tracked point across the *whole clip* is fitted into [-1, 1] using one
 * square box. Normalizing per frame instead would be the obvious mistake: it
 * would rescale the lifter every time they moved, flattening the very rise and
 * fall that rep detection measures into a constant.
 *
 * Returns null when too little was tracked to define a box, matching the
 * reference's early return.
 */
export function cropScale(frames: (Keypoint2D[] | null)[]): Float32Array | null {
  let xmin = Infinity
  let xmax = -Infinity
  let ymin = Infinity
  let ymax = -Infinity
  let valid = 0

  for (const keypoints of frames) {
    if (!keypoints) continue
    for (const point of keypoints) {
      if (point.score <= 0) continue
      valid += 1
      if (point.x < xmin) xmin = point.x
      if (point.x > xmax) xmax = point.x
      if (point.y < ymin) ymin = point.y
      if (point.y > ymax) ymax = point.y
    }
  }
  if (valid < 4) return null

  const scale = Math.max(xmax - xmin, ymax - ymin)
  if (scale === 0) return null

  // A square box centred on the bounding box, so x and y are divided by the
  // same number and the aspect ratio survives.
  const xs = (xmin + xmax - scale) / 2
  const ys = (ymin + ymax - scale) / 2

  const clamp = (value: number) => Math.min(1, Math.max(-1, value))
  const out = new Float32Array(frames.length * H36M_JOINTS * 3)
  frames.forEach((keypoints, frame) => {
    if (!keypoints) return
    for (let joint = 0; joint < H36M_JOINTS; joint += 1) {
      const point = keypoints[joint]
      if (!point) continue
      const at = (frame * H36M_JOINTS + joint) * 3
      out[at] = clamp(((point.x - xs) / scale - 0.5) * 2)
      out[at + 1] = clamp(((point.y - ys) / scale - 0.5) * 2)
      out[at + 2] = clamp(point.score)
    }
  })
  return out
}

/**
 * One window through the CoreML lifter.
 *
 * The traced `.mlpackage` has a fixed input shape of `[1, 243, 17, 3]`, unlike
 * the ONNX graph which accepts any length. A window shorter than 243 — the tail
 * of a clip, or a tiled still — is therefore padded by repeating its last frame
 * and the padding is discarded from the output. Repeating rather than zeroing
 * matters: a run of zero frames is a body collapsing into the origin, and the
 * temporal attention would smear that back across the real frames next to it.
 */
async function liftWindowNative(
  window: Float32Array,
  length: number,
  stride: number
): Promise<Float32Array> {
  let padded = window
  if (length < MAX_CLIP_LEN) {
    padded = new Float32Array(MAX_CLIP_LEN * stride)
    padded.set(window)
    const last = window.subarray((length - 1) * stride, length * stride)
    for (let frame = length; frame < MAX_CLIP_LEN; frame += 1) {
      padded.set(last, frame * stride)
    }
  }

  const { keypoints3d } = await PoseEstimation.lift({
    // Capacitor's bridge serializes to JSON, so a typed array has to cross as
    // a plain number array in both directions.
    keypoints: Array.from(padded),
    frames: MAX_CLIP_LEN,
  })

  const full = Float32Array.from(keypoints3d)
  return length < MAX_CLIP_LEN ? full.subarray(0, length * stride) : full
}

/**
 * Runs the lifter over a normalized track, in windows it can hold at once.
 *
 * Windows are consecutive and non-overlapping, matching `WildDetDataset`. They
 * do not need to be blended at the seam: the normalization above is global, so
 * two windows of the same clip already share one coordinate frame.
 */
async function lift(
  normalized: Float32Array,
  frameCount: number
): Promise<Float32Array> {
  const stride = H36M_JOINTS * 3
  const lifted = new Float32Array(frameCount * stride)
  const native = nativeLiftAvailable()
  const session = native ? null : await loadSession(MOTIONBERT_MODEL)

  for (let start = 0; start < frameCount; start += MAX_CLIP_LEN) {
    const length = Math.min(MAX_CLIP_LEN, frameCount - start)
    const window = normalized.subarray(start * stride, (start + length) * stride)

    if (native) {
      try {
        lifted.set(await liftWindowNative(window, length, stride), start * stride)
        continue
      } catch (error) {
        // A CoreML failure should degrade to a slower clip, not a broken one.
        // Falling back mid-clip is safe because both backends read the same
        // globally normalized input and so share a coordinate frame.
        console.warn("native lift failed, falling back to wasm", error)
      }
    }

    const fallback = session ?? (await loadSession(MOTIONBERT_MODEL))
    const input = new ort.Tensor("float32", window, [1, length, H36M_JOINTS, 3])
    const outputs = await fallback.run({ [fallback.inputNames[0]]: input })
    lifted.set(outputs[fallback.outputNames[0]].data as Float32Array, start * stride)
  }

  return lifted
}

const distance = (
  a: readonly [number, number, number],
  b: readonly [number, number, number]
) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function jointAt(
  lifted: Float32Array,
  frame: number,
  joint: number
): [number, number, number] {
  const at = (frame * H36M_JOINTS + joint) * 3
  return [lifted[at], lifted[at + 1], lifted[at + 2]]
}

/**
 * Metres per output unit, from the median torso length over the clip.
 *
 * Median rather than mean because a handful of frames where the detector lost
 * the hips will produce a torso of near zero, and a mean would let those drag
 * the scale of the entire clip. One factor for the whole clip, never per frame,
 * for the same reason the normalization is global.
 */
export function metricScale(lifted: Float32Array, frameCount: number) {
  const lengths: number[] = []
  for (let frame = 0; frame < frameCount; frame += 1) {
    const length = distance(
      jointAt(lifted, frame, H36M.hip),
      jointAt(lifted, frame, H36M.thorax)
    )
    if (length > 0) lengths.push(length)
  }
  if (lengths.length === 0) return 0
  lengths.sort((a, b) => a - b)
  const median = lengths[Math.floor(lengths.length / 2)]
  return median > 0 ? ASSUMED_TORSO_M / median : 0
}

/** Per-joint confidence for one frame, in H36M order, for `visibility`. */
function jointConfidence(keypoints: Keypoint2D[] | null) {
  if (!keypoints) return new Array<number>(H36M_JOINTS).fill(0)
  return keypoints.map((point) => (point.score >= MIN_JOINT_SCORE ? point.score : 0))
}

/** An untracked frame: present on the timeline, with nothing found in it. */
const emptyFrame = (timeMs: number): FormCoachFrame => ({
  timeMs,
  landmarks: [],
  worldLandmarks: [],
})

/**
 * Detected 2D tracks plus their frame times, lifted and widened into the
 * 33-slot layout the rest of the pipeline reads.
 */
async function assemble(
  detections: { timeMs: number; keypoints: Keypoint2D[] | null; width: number; height: number }[]
): Promise<FormCoachFrame[]> {
  const h36m = detections.map(({ keypoints }) =>
    keypoints ? cocoToH36m(keypoints) : null
  )
  const normalized = cropScale(h36m)
  // Nothing was tracked well enough to lift. The frames are still returned, so
  // the preview can report the tracking rate honestly rather than showing a
  // shorter clip than the one that was recorded.
  if (!normalized) return detections.map(({ timeMs }) => emptyFrame(timeMs))

  const lifted = await lift(normalized, detections.length)
  const scale = metricScale(lifted, detections.length)
  if (scale === 0) return detections.map(({ timeMs }) => emptyFrame(timeMs))

  return detections.map((detection, frame) => {
    if (!detection.keypoints) return emptyFrame(detection.timeMs)
    const joints = Array.from({ length: H36M_JOINTS }, (_, joint) =>
      jointAt(lifted, frame, joint)
    )
    return {
      timeMs: detection.timeMs,
      landmarks: cocoToBlazePose2D(
        detection.keypoints,
        detection.width,
        detection.height
      ),
      worldLandmarks: h36mToBlazePoseWorld(
        joints,
        scale,
        jointConfidence(h36m[frame])
      ),
    }
  })
}

async function extractVideoLandmarks(
  angle: FormCoachAngle,
  onFraction?: (fraction: number) => void
): Promise<FormCoachAngleLandmarks> {
  const { frames, stills } = await sampleClip(
    angle,
    async ({ timeMs, video, width, height }) => ({
      timeMs,
      width,
      height,
      keypoints: await detectKeypoints(video, width, height),
    }),
    // Detection is the long pass and the lift is a single forward over the whole
    // clip, so the bar is driven by detection and stops just short of full.
    (fraction) => onFraction?.(fraction * 0.95)
  )

  const assembled = await assemble(frames)
  onFraction?.(1)
  return { index: angle.index, frames: assembled, stills }
}

async function extractImageLandmarks(
  angle: FormCoachAngle
): Promise<FormCoachAngleLandmarks> {
  const blob = base64ToBlob(angle.base64, angle.mimeType)
  const bitmap = await createImageBitmap(blob)
  try {
    const keypoints = await detectKeypoints(bitmap, bitmap.width, bitmap.height)
    const detection = {
      timeMs: 0,
      keypoints,
      width: bitmap.width,
      height: bitmap.height,
    }
    // Tiled into a window the temporal model can work with, then read back from
    // the middle — the frame with context on both sides.
    const tiled = await assemble(
      Array.from({ length: STILL_WINDOW }, () => detection)
    )
    const middle = tiled[Math.floor(STILL_WINDOW / 2)] ?? emptyFrame(0)
    return {
      index: angle.index,
      frames: [{ ...middle, timeMs: 0 }],
      stills: shrinkToStill(bitmap),
    }
  } finally {
    bitmap.close()
  }
}

export const motionBertPoseProvider: PoseProvider = {
  id: "yolo11n-pose+motionbert/MB_ft_h36m_global_lite",
  sampleFps: SAMPLE_FPS,

  // Warming before the first angle means the wait on the wasm runtime and the
  // ~19 MB of weights is reported as loading rather than as a frame that
  // mysteriously takes ten seconds. On iOS the CoreML model is warmed instead;
  // its first load also compiles, which is slower still and worth hiding.
  async warm(_kinds: FormCoachAngleKind[]) {
    if (nativeLiftAvailable()) {
      try {
        await Promise.all([warmDetector(), PoseEstimation.prepare()])
        return
      } catch (error) {
        console.warn("native lifter unavailable, using wasm", error)
      }
    }
    await Promise.all([warmDetector(), loadSession(MOTIONBERT_MODEL)])
  },

  estimateAngle(angle, onFraction) {
    return angle.kind === "image"
      ? extractImageLandmarks(angle)
      : extractVideoLandmarks(angle, onFraction)
  },

  async dispose() {
    releaseDetectorScratch()
    if (nativeLiftAvailable()) {
      await PoseEstimation.unload().catch(() => {})
    }
    await releaseSessions()
  },
}
