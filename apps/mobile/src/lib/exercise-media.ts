/**
 * Illustration URLs for catalog exercises.
 *
 * free-exercise-db ships two JPEGs per exercise — the start and the end of the
 * movement — at a path derived from the exercise id we already store. Nothing
 * is mirrored: these come straight off GitHub's raw CDN, which means they are
 * also the first thing to disappear when the device is offline. Every caller
 * has to treat a failed load as normal, not exceptional.
 */

import { CUSTOM_EXERCISE_ID_PREFIX } from "../../../../convex/lib/exerciseShape"

const IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises"

/**
 * Every id in the dataset is `[A-Za-z0-9_.-]+`. Anything else is either a
 * user-authored exercise or a client-generated UUID, and has no artwork — and
 * refusing to interpolate it keeps a stray `../` out of the URL.
 */
const SAFE_ID = /^[A-Za-z0-9_.-]+$/

export function hasExerciseArt(exerciseId: string | undefined | null): boolean {
  if (!exerciseId) return false
  if (exerciseId.startsWith(CUSTOM_EXERCISE_ID_PREFIX)) return false
  return SAFE_ID.test(exerciseId)
}

/** The two frames of the movement, start first. Empty when there is no art. */
export function exerciseImageUrls(
  exerciseId: string | undefined | null
): string[] {
  if (!hasExerciseArt(exerciseId)) return []
  return [
    `${IMAGE_BASE}/${exerciseId}/0.jpg`,
    `${IMAGE_BASE}/${exerciseId}/1.jpg`,
  ]
}

/** The single frame worth showing in a list row. */
export function exerciseThumbnailUrl(
  exerciseId: string | undefined | null
): string | null {
  return exerciseImageUrls(exerciseId)[0] ?? null
}
