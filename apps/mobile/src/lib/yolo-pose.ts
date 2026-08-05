import * as ort from "onnxruntime-web/wasm"
import { COCO_KEYPOINTS, type Keypoint2D } from "@/lib/pose-joints"
import { loadSession } from "@/lib/onnx-runtime"

/**
 * YOLO11n-pose: the 2D half of pose estimation.
 *
 * It answers "where are this person's joints in this frame", in pixels, and
 * nothing more — no depth, no temporal reasoning. MotionBERT does the lifting,
 * and it can only lift what this finds, so a joint missed here is a joint the 3D
 * pose is guessing at.
 */

/**
 * fp32, not int8, and this is the single most important line in the file.
 *
 * Quantizing the detector to int8 makes it *ten times slower* — 206 ms a frame
 * against 21 ms — because onnxruntime has no fast int8 convolution kernel on
 * wasm and falls back to dequantizing on every inference. The lifter is
 * quantized, since it runs once per clip and shrinking it is what gets a 64 MB
 * graph under Cloudflare Pages' 25 MiB cap. The detector runs once per *frame*,
 * so it stays fp32 at 11 MB. See `scripts/form-JEPA/bench_onnx.py`.
 */
export const YOLO_POSE_MODEL = "yolo11n_pose_448_fp32.onnx"

/**
 * The square the network is traced at. Fixed by the export.
 *
 * 448 rather than the 640 the model ships at: half the compute, 10.6 ms a frame
 * against 21.8 ms, and it tracks the 640 lift closely — mean per-joint
 * disagreement 32 mm on a deadlift, and the measurements that feed the coach
 * land within a few millimetres of the full-resolution run.
 *
 * 320 was measured too and rejected, which is worth recording because it is
 * twice as fast again and tempting. It is fine for a squat, where it costs
 * 2 mm of thigh length. On a bench press it reports the thigh as 0.561 m
 * against 0.664 m at 640 — a 15% error, because lying down foreshortens every
 * limb and 320 does not have the resolution to recover them. A joint angle
 * built on that is wrong in a way nothing downstream can detect.
 *
 * See `scripts/form-JEPA/bench_onnx.py` and `validate_onnx.py`.
 */
const INPUT_SIZE = 448

/**
 * The row layout of each candidate box.
 *
 * Output is [1, 56, N]: four box terms, one person score, then 17 keypoints of
 * (x, y, score). Channel-major, so a given candidate's values are strided N
 * apart rather than adjacent — reading it as if it were row-major yields
 * plausible-looking nonsense, which is the expensive way to find out.
 *
 * N is the three detection grids flattened, so it scales with the square of the
 * input: 8400 at 640, 2100 at 320. It is read off the output tensor rather than
 * hard-coded, so changing `INPUT_SIZE` cannot silently misalign this.
 */
const PERSON_SCORE_ROW = 4
const FIRST_KEYPOINT_ROW = 5

/**
 * Below this, the frame is treated as having nobody in it.
 *
 * Deliberately low. A lifter at the bottom of a squat, back to the camera and
 * partly out of frame, scores far worse than one standing still, and dropping
 * those frames would cut exactly the part of the rep that is being judged. The
 * per-joint scores ride along to `visibility` so the preview can still decline
 * to draw a limb the detector was unsure of.
 */
const MIN_PERSON_SCORE = 0.25

/** How the frame was fitted into the square, so keypoints can be mapped back. */
type Letterbox = { scale: number; padX: number; padY: number }

/**
 * Draws a frame into the square the network expects, preserving aspect ratio.
 *
 * Squashing to fit instead would be simpler and slightly faster, but it distorts
 * every limb angle in the frame — and limb angles are the entire output.
 */
function letterbox(
  source: CanvasImageSource,
  width: number,
  height: number,
  canvas: HTMLCanvasElement
): { data: Float32Array; box: Letterbox } | null {
  canvas.width = INPUT_SIZE
  canvas.height = INPUT_SIZE
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null

  const scale = Math.min(INPUT_SIZE / width, INPUT_SIZE / height)
  const drawWidth = Math.round(width * scale)
  const drawHeight = Math.round(height * scale)
  const padX = Math.floor((INPUT_SIZE - drawWidth) / 2)
  const padY = Math.floor((INPUT_SIZE - drawHeight) / 2)

  // Grey rather than black, matching the letterbox colour the model was trained
  // and validated with.
  context.fillStyle = "rgb(114,114,114)"
  context.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
  context.drawImage(source, padX, padY, drawWidth, drawHeight)

  const { data: rgba } = context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)
  const pixels = INPUT_SIZE * INPUT_SIZE
  // NCHW: all the reds, then all the greens, then all the blues. The canvas
  // hands back interleaved RGBA, so this is a transpose as well as a scale.
  const data = new Float32Array(pixels * 3)
  for (let i = 0; i < pixels; i += 1) {
    data[i] = rgba[i * 4] / 255
    data[pixels + i] = rgba[i * 4 + 1] / 255
    data[pixels * 2 + i] = rgba[i * 4 + 2] / 255
  }

  return { data, box: { scale, padX, padY } }
}

/**
 * The highest-scoring person in the output, as COCO-17 keypoints in the source
 * frame's pixels. Null when nobody clears `MIN_PERSON_SCORE`.
 *
 * No non-maximum suppression, because only one detection is ever wanted — the
 * lifter — and NMS exists to keep several. Picking the single best candidate
 * reaches the same answer without sorting 8400 boxes per frame. The cost is
 * that a bystander who scores higher for one frame steals it; the smoothing
 * pass downstream absorbs a stray frame, and a bystander who out-scores the
 * lifter for the whole clip was going to break rep detection either way.
 */
export function bestPerson(
  output: Float32Array,
  anchors: number,
  box: Letterbox
): Keypoint2D[] | null {
  let bestAnchor = -1
  let bestScore = MIN_PERSON_SCORE
  for (let anchor = 0; anchor < anchors; anchor += 1) {
    const score = output[PERSON_SCORE_ROW * anchors + anchor]
    if (score > bestScore) {
      bestScore = score
      bestAnchor = anchor
    }
  }
  if (bestAnchor < 0) return null

  const keypoints: Keypoint2D[] = new Array(COCO_KEYPOINTS)
  for (let joint = 0; joint < COCO_KEYPOINTS; joint += 1) {
    const row = FIRST_KEYPOINT_ROW + joint * 3
    keypoints[joint] = {
      // Back out of the letterbox: undo the padding, then the scale.
      x: (output[row * anchors + bestAnchor] - box.padX) / box.scale,
      y: (output[(row + 1) * anchors + bestAnchor] - box.padY) / box.scale,
      score: output[(row + 2) * anchors + bestAnchor],
    }
  }
  return keypoints
}

/** A reusable scratch canvas — one per session, not one per frame. */
let scratch: HTMLCanvasElement | null = null

export async function warmDetector() {
  await loadSession(YOLO_POSE_MODEL)
}

/**
 * COCO-17 keypoints for one frame, in that frame's pixel coordinates, or null
 * if no person was found.
 */
export async function detectKeypoints(
  source: CanvasImageSource,
  width: number,
  height: number
): Promise<Keypoint2D[] | null> {
  if (!width || !height) return null

  scratch ??= document.createElement("canvas")
  const prepared = letterbox(source, width, height, scratch)
  if (!prepared) return null

  const session = await loadSession(YOLO_POSE_MODEL)
  const input = new ort.Tensor("float32", prepared.data, [
    1,
    3,
    INPUT_SIZE,
    INPUT_SIZE,
  ])
  const outputs = await session.run({ [session.inputNames[0]]: input })
  const tensor = outputs[session.outputNames[0]]
  // Last dimension of [1, 56, N]. Derived, never assumed, so the anchor count
  // always matches whatever `INPUT_SIZE` the shipped graph was traced at.
  const anchors = tensor.dims[tensor.dims.length - 1]

  return bestPerson(tensor.data as Float32Array, anchors, prepared.box)
}

export function releaseDetectorScratch() {
  scratch = null
}
