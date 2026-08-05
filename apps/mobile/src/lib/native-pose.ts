// lib/native-pose.ts
import { registerPlugin } from "@capacitor/core"

export interface DetectResult {
  detected: boolean
  /**
   * Flat [x, y, score] * 17, COCO order, in the 448 letterboxed square the
   * image was sent in — NOT original frame pixels. The caller owns the inverse
   * letterbox, so there is one implementation of it.
   */
  keypoints: number[] | null
  inferenceMs: number
}

export interface LiftResult {
  /** Flat [x, y, z] * 17 * frames, in the same normalized space as the input. */
  keypoints3d: number[]
  /** [1, T, 17, 3] as reported by CoreML — useful for asserting the contract. */
  shape: number[]
  inferenceMs: number
}

export interface PoseEstimationPlugin {
  /**
   * Loads and compiles both CoreML models. Slow on first launch — the ANE
   * compile happens here — so call it from warm(), not from the first frame.
   */
  prepare(): Promise<{
    loadTimeMs: number
    inputSize: number
    clipLength: number
    joints: number
  }>

  isReady(): Promise<{ ready: boolean; inputSize: number; clipLength: number }>

  /**
   * Detects one already-letterboxed square. `image` is a data URL or bare
   * base64 JPEG at exactly `inputSize` x `inputSize`.
   */
  detect(opts: { image: string }): Promise<DetectResult>

  /**
   * Lifts one already-normalized window. `keypoints` must be exactly
   * `frames * 17 * 3` long and `frames` must equal `clipLength` — the traced
   * model has a fixed input shape, so the caller pads.
   */
  lift(opts: { keypoints: number[]; frames: number }): Promise<LiftResult>

  unload(): Promise<void>
}

export const PoseEstimation =
  registerPlugin<PoseEstimationPlugin>("PoseEstimation")
