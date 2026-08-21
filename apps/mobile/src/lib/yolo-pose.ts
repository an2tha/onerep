import * as ort from "onnxruntime-web/wasm"
import { COCO_KEYPOINTS, type Keypoint2D } from "@/lib/pose-joints"
import { loadSession } from "@/lib/onnx-runtime"
import { Capacitor } from "@capacitor/core"
import { PoseEstimation } from "@/lib/native-pose"

/**
 * YOLO11n-pose: the 2D half of pose estimation.
 *
 * It answers "where are this person's joints in this frame", in pixels, and
 * nothing more — no depth, no temporal reasoning. MotionBERT does the lifting,
 * and it can only lift what this finds, so a joint missed here is a joint the 3D
 * pose is guessing at.
 *
 * On iOS the forward pass runs through CoreML instead of wasm. Only the forward
 * pass moves: letterboxing stays here, and so does mapping keypoints back out
 * of the letterbox. Both backends therefore see an identically prepared square
 * and their outputs land in the same coordinate frame, which is what makes it
 * safe to fall back mid-clip.
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
 *
 * The CoreML export has no such problem — the Neural Engine has real int8
 * kernels — but it is exported fp16 to keep one accuracy story across backends.
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
 * The `.mlpackage` MUST be exported at this same size
 * (`model.export(format="coreml", imgsz=448)`). A mismatch does not throw —
 * Vision will happily rescale — it just silently reintroduces the 320-class
 * error above.
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
 *
 * Duplicated in the Swift plugin, which does its own argmax to avoid shipping a
 * 230k-float tensor across the bridge every frame. Change both together.
 */
const MIN_PERSON_SCORE = 0.25

/**
 * JPEG quality for the letterboxed square handed to the native detector.
 *
 * The bridge serializes to JSON, so pixels cross as base64 text and their size
 * is the dominant cost of using CoreML at all. 0.92 puts a 448 square at
 * roughly 40 KB; lower starts to soften joint edges, which is the one thing
 * this frame exists to resolve. Lossless PNG was measured at ~8x the bytes for
 * no measurable keypoint difference.
 */
const BRIDGE_JPEG_QUALITY = 0.92

/** True when the CoreML detector is present and should be preferred. */
const nativeDetectAvailable = () =>
  Capacitor.getPlatform() === "ios" &&
  Capacitor.isPluginAvailable("PoseEstimation")

/** Set once a native call has failed, so a broken backend is not retried per frame. */
let nativeDetectDisabled = false

/** How the frame was fitted into the square, so keypoints can be mapped back. */
type Letterbox = { scale: number; padX: number; padY: number }

/**
 * Draws a frame into the square the network expects, preserving aspect ratio.
 *
 * Squashing to fit instead would be simpler and slightly faster, but it distorts
 * every limb angle in the frame — and limb angles are the entire output.
 *
 * Returns the NCHW tensor for the wasm path. The native path reads the canvas
 * directly instead, so the pixel work above is shared and only the float
 * transpose below is skipped.
 */
function letterbox(
  source: CanvasImageSource,
  width: number,
  height: number,
  canvas: HTMLCanvasElement,
  needsTensor: boolean
): { data: Float32Array | null; box: Letterbox } | null {
  canvas.width = INPUT_SIZE
  canvas.height = INPUT_SIZE
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null

  const scale = Math.min(INPUT_SIZE / width, INPUT_SIZE / height)
  const drawWidth = Math.round(width * scale)
  const drawHeight = Math.round(height * scale)
  const padX = Math.floor((INPUT_SIZE - drawWidth) / 2)
  const padY = Math.floor((INPUT_SIZE - drawHeight) / 2)
  const box = { scale, padX, padY }

  // Grey rather than black, matching the letterbox colour the model was trained
  // and validated with.
  context.fillStyle = "rgb(114,114,114)"
  context.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
  context.drawImage(source, padX, padY, drawWidth, drawHeight)

  if (!needsTensor) return { data: null, box }

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

  return { data, box }
}

/**
 * Undoes the letterbox on keypoints the model reported in its own square.
 *
 * Shared by both backends deliberately: this is the step where a sign or an
 * off-by-one produces a skeleton that looks right and measures wrong, so there
 * is one copy of it.
 */
function unLetterbox(raw: Keypoint2D[], box: Letterbox): Keypoint2D[] {
  return raw.map(({ x, y, score }) => ({
    x: (x - box.padX) / box.scale,
    y: (y - box.padY) / box.scale,
    score,
  }))
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
      x: output[row * anchors + bestAnchor],
      y: output[(row + 1) * anchors + bestAnchor],
      score: output[(row + 2) * anchors + bestAnchor],
    }
  }
  return unLetterbox(keypoints, box)
}

/** A reusable scratch canvas — one per session, not one per frame. */
let scratch: HTMLCanvasElement | null = null

export async function warmDetector() {
  if (nativeDetectAvailable() && !nativeDetectDisabled) {
    try {
      await PoseEstimation.prepare()
      return
    } catch (error) {
      console.warn("native detector unavailable, using wasm", error)
      nativeDetectDisabled = true
    }
  }
  await loadSession(YOLO_POSE_MODEL)
}

/**
 * One frame through the CoreML detector.
 *
 * Swift is handed the finished square, so it does no geometry — it runs the
 * model, takes the argmax over anchors, and returns 17 keypoints still in the
 * 448 square. Returning the raw `[56, N]` tensor instead would be cleaner but
 * means 230k floats per frame through JSON, which costs far more than the
 * inference it is meant to accelerate.
 */
async function detectNative(
  canvas: HTMLCanvasElement,
  box: Letterbox
): Promise<Keypoint2D[] | null> {
  const image = canvas.toDataURL("image/jpeg", BRIDGE_JPEG_QUALITY)
  const { detected, keypoints } = await PoseEstimation.detect({ image })
  if (!detected || !keypoints) return null

  const raw: Keypoint2D[] = new Array(COCO_KEYPOINTS)
  for (let joint = 0; joint < COCO_KEYPOINTS; joint += 1) {
    raw[joint] = {
      x: keypoints[joint * 3],
      y: keypoints[joint * 3 + 1],
      score: keypoints[joint * 3 + 2],
    }
  }
  return unLetterbox(raw, box)
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

  const native = nativeDetectAvailable() && !nativeDetectDisabled

  scratch ??= document.createElement("canvas")
  const prepared = letterbox(source, width, height, scratch, !native)
  if (!prepared) return null

  if (native) {
    try {
      return await detectNative(scratch, prepared.box)
    } catch (error) {
      // Disable rather than retry: whatever failed — model missing, out of
      // memory — will fail identically on the next frame, and a per-frame
      // rejected promise would cost more than the wasm path it is avoiding.
      console.warn("native detect failed, falling back to wasm", error)
      nativeDetectDisabled = true
      // The tensor was skipped on the assumption native would serve, so redraw.
      const redone = letterbox(source, width, height, scratch, true)
      if (!redone?.data) return null
      return runWasm(redone.data, redone.box)
    }
  }

  if (!prepared.data) return null
  return runWasm(prepared.data, prepared.box)
}

async function runWasm(
  data: Float32Array,
  box: Letterbox
): Promise<Keypoint2D[] | null> {
  const session = await loadSession(YOLO_POSE_MODEL)
  const input = new ort.Tensor("float32", data, [1, 3, INPUT_SIZE, INPUT_SIZE])
  const outputs = await session.run({ [session.inputNames[0]]: input })
  const tensor = outputs[session.outputNames[0]]
  // Last dimension of [1, 56, N]. Derived, never assumed, so the anchor count
  // always matches whatever `INPUT_SIZE` the shipped graph was traced at.
  const anchors = tensor.dims[tensor.dims.length - 1]

  return bestPerson(tensor.data as Float32Array, anchors, box)
}

export function releaseDetectorScratch() {
  scratch = null
}
