import type { PoseLandmark } from "@/lib/form-coach"
import { POSE_LANDMARK_COUNT } from "@/lib/pose-scene"

/**
 * Translation between the three skeletons the pipeline passes through.
 *
 * The detector speaks COCO-17, the lifter speaks H36M-17, and everything
 * downstream of the provider — rep detection, the 3D preview, the upload —
 * addresses joints by BlazePose-33 index. Rather than rewrite those, the
 * provider ends by widening back into 33 slots, so the swap stops at the
 * provider boundary exactly as `PoseProvider` promises.
 *
 * Nothing here does I/O or touches a model, so the mapping is testable on its
 * own — which matters, because an off-by-one in a joint table is invisible
 * until a knee angle comes out backwards.
 */

/** What YOLO-pose emits, in its output order. */
export const COCO = {
  nose: 0,
  leftEye: 1,
  rightEye: 2,
  leftEar: 3,
  rightEar: 4,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16,
} as const

export const COCO_KEYPOINTS = 17

/**
 * What MotionBERT reads and writes.
 *
 * Taken from `halpe2h36m` in `MotionBERT/lib/data/dataset_wild.py`, which is the
 * only authority on the order the checkpoint was trained in. Note `hip` is the
 * root at index 0 and `nose` sits at 9 — not the 0 that every other skeleton
 * here puts it at.
 */
export const H36M = {
  hip: 0,
  rightHip: 1,
  rightKnee: 2,
  rightAnkle: 3,
  leftHip: 4,
  leftKnee: 5,
  leftAnkle: 6,
  spine: 7,
  thorax: 8,
  nose: 9,
  head: 10,
  leftShoulder: 11,
  leftElbow: 12,
  leftWrist: 13,
  rightShoulder: 14,
  rightElbow: 15,
  rightWrist: 16,
} as const

export const H36M_JOINTS = 17

/** The BlazePose slots the rest of the app actually reads. */
export const BLAZE = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const

/**
 * Which BlazePose slot each H36M joint lands in.
 *
 * Fourteen of the seventeen have a home. `hip`, `spine` and `head` do not —
 * BlazePose has no root, no spine and no head-top point — and are dropped,
 * having already done their job as context for the lift.
 */
const H36M_TO_BLAZE: ReadonlyArray<readonly [number, number]> = [
  [H36M.nose, BLAZE.nose],
  [H36M.leftShoulder, BLAZE.leftShoulder],
  [H36M.rightShoulder, BLAZE.rightShoulder],
  [H36M.leftElbow, BLAZE.leftElbow],
  [H36M.rightElbow, BLAZE.rightElbow],
  [H36M.leftWrist, BLAZE.leftWrist],
  [H36M.rightWrist, BLAZE.rightWrist],
  [H36M.leftHip, BLAZE.leftHip],
  [H36M.rightHip, BLAZE.rightHip],
  [H36M.leftKnee, BLAZE.leftKnee],
  [H36M.rightKnee, BLAZE.rightKnee],
  [H36M.leftAnkle, BLAZE.leftAnkle],
  [H36M.rightAnkle, BLAZE.rightAnkle],
]

/** Where each COCO keypoint lands, for the 2D array that skips the lifter. */
const COCO_TO_BLAZE: ReadonlyArray<readonly [number, number]> = [
  [COCO.nose, BLAZE.nose],
  [COCO.leftShoulder, BLAZE.leftShoulder],
  [COCO.rightShoulder, BLAZE.rightShoulder],
  [COCO.leftElbow, BLAZE.leftElbow],
  [COCO.rightElbow, BLAZE.rightElbow],
  [COCO.leftWrist, BLAZE.leftWrist],
  [COCO.rightWrist, BLAZE.rightWrist],
  [COCO.leftHip, BLAZE.leftHip],
  [COCO.rightHip, BLAZE.rightHip],
  [COCO.leftKnee, BLAZE.leftKnee],
  [COCO.rightKnee, BLAZE.rightKnee],
  [COCO.leftAnkle, BLAZE.leftAnkle],
  [COCO.rightAnkle, BLAZE.rightAnkle],
]

/** One 2D keypoint as the detector reports it, in pixels. */
export type Keypoint2D = { x: number; y: number; score: number }

const UNTRACKED: PoseLandmark = { x: 0, y: 0, z: 0, visibility: 0 }

function blankSkeleton(): PoseLandmark[] {
  return Array.from({ length: POSE_LANDMARK_COUNT }, () => ({ ...UNTRACKED }))
}

const midpoint = (a: Keypoint2D, b: Keypoint2D): Keypoint2D => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  // A joint invented from two others is only as trustworthy as the weaker one.
  score: Math.min(a.score, b.score),
})

/**
 * COCO-17 to the H36M-17 the lifter was trained on.
 *
 * Three joints have to be invented because COCO has no torso chain: the hip
 * root and the thorax are midpoints, which is exactly what `halpe2h36m` does
 * for the spine, and the head is approximated from the ears. That last one is
 * the loosest of the three, but H36M's head joint is dropped again on the way
 * out to BlazePose — it exists only as context the transformer attends over.
 */
export function cocoToH36m(keypoints: Keypoint2D[]): Keypoint2D[] {
  const at = (index: number) => keypoints[index] ?? { x: 0, y: 0, score: 0 }

  const hip = midpoint(at(COCO.leftHip), at(COCO.rightHip))
  const thorax = midpoint(at(COCO.leftShoulder), at(COCO.rightShoulder))
  const spine = midpoint(thorax, hip)
  const head = midpoint(at(COCO.leftEar), at(COCO.rightEar))

  const out: Keypoint2D[] = new Array(H36M_JOINTS)
  out[H36M.hip] = hip
  out[H36M.rightHip] = at(COCO.rightHip)
  out[H36M.rightKnee] = at(COCO.rightKnee)
  out[H36M.rightAnkle] = at(COCO.rightAnkle)
  out[H36M.leftHip] = at(COCO.leftHip)
  out[H36M.leftKnee] = at(COCO.leftKnee)
  out[H36M.leftAnkle] = at(COCO.leftAnkle)
  out[H36M.spine] = spine
  out[H36M.thorax] = thorax
  out[H36M.nose] = at(COCO.nose)
  out[H36M.head] = head
  out[H36M.leftShoulder] = at(COCO.leftShoulder)
  out[H36M.leftElbow] = at(COCO.leftElbow)
  out[H36M.leftWrist] = at(COCO.leftWrist)
  out[H36M.rightShoulder] = at(COCO.rightShoulder)
  out[H36M.rightElbow] = at(COCO.rightElbow)
  out[H36M.rightWrist] = at(COCO.rightWrist)
  return out
}

/**
 * The detector's own 2D output as BlazePose slots, normalized 0–1 against the
 * frame — the `landmarks` half of a `FormCoachFrame`.
 *
 * Mapped straight across rather than by way of H36M: the round trip would push
 * every point through two synthesised midpoints for no gain, and the 2D array
 * is consumed as a fallback for display, never lifted.
 */
export function cocoToBlazePose2D(
  keypoints: Keypoint2D[],
  width: number,
  height: number
): PoseLandmark[] {
  const skeleton = blankSkeleton()
  for (const [from, to] of COCO_TO_BLAZE) {
    const point = keypoints[from]
    if (!point) continue
    skeleton[to] = {
      x: point.x / width,
      y: point.y / height,
      // Monocular 2D detection has no depth to report, and the z that matters
      // is the lifter's — carried on `worldLandmarks`, not here.
      z: 0,
      visibility: point.score,
    }
  }
  return skeleton
}

/**
 * A lifted H36M-17 pose as BlazePose-33 metric world landmarks.
 *
 * `scale` converts the model's normalized units to metres and `confidence`
 * carries the detector's per-joint scores across, since the lifter reports none
 * of its own — a joint the detector never saw is still a guess after lifting,
 * and the preview draws it or not on that basis.
 */
export function h36mToBlazePoseWorld(
  joints: ReadonlyArray<readonly [number, number, number]>,
  scale: number,
  confidence: ReadonlyArray<number>
): PoseLandmark[] {
  const skeleton = blankSkeleton()
  const root = joints[H36M.hip] ?? [0, 0, 0]

  for (const [from, to] of H36M_TO_BLAZE) {
    const joint = joints[from]
    if (!joint) continue
    skeleton[to] = {
      // Re-centred on the hips, because `worldLandmarks` is defined as metres
      // from the hip midpoint and the checkpoint runs with `rootrel: False`,
      // which leaves the root wherever the lift put it.
      x: (joint[0] - root[0]) * scale,
      y: (joint[1] - root[1]) * scale,
      z: (joint[2] - root[2]) * scale,
      visibility: confidence[from] ?? 0,
    }
  }
  return skeleton
}
