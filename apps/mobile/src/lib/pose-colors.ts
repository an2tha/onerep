/**
 * The pose scene's palette, kept apart from the viewer itself.
 *
 * The viewer drags three.js in with it and is lazy-loaded everywhere for that
 * reason, but the DOM chrome around it — legend swatches, slider accents —
 * needs the same colours without paying for the import. This module is the one
 * place a skeleton colour is written down.
 */

/** Corrected: green reads as the target, and separates from the white ghost. */
export const POSE_CORRECTED_COLOR = 0x3ddc84
export const POSE_PLAIN_COLOR = 0x4da3ff
export const POSE_GHOST_COLOR = 0xffffff

/** The same colour as CSS, so the chrome cannot drift from the scene. */
export function poseColorHex(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`
}
