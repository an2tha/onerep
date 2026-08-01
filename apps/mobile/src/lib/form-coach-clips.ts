import { useSyncExternalStore } from "react"
import { createClientId } from "@/lib/utils"
import type {
  FormCoachAngle,
  FormCoachAngleKind,
  FormCoachAngleLandmarks,
} from "@/lib/form-coach"

/** Angles the coach will look at for one exercise — front, side, and back. */
export const MAX_FORM_COACH_ANGLES = 3

export type FormCoachClip = {
  id: string
  /** Recorded video, an uploaded video, or a still photo. */
  kind: FormCoachAngleKind
  /** Object URL for playback. Revoked when the clip leaves the draft. */
  url: string
  blob: Blob
  /** Always 0 for stills. */
  durationMs: number
}

/**
 * Clips recorded for one exercise, held in memory between the recorder overlay
 * and the review sheet. Both live inside the active workout — routing to a
 * camera screen would unmount the workout and re-run its load-from-Convex
 * effect, which resets the session — so this store carries the state instead.
 * It is deliberately lost on reload; an unsent draft is not worth persisting.
 */
export type FormCoachPhase =
  /** Camera overlay is up. */
  | "recording"
  /** Reviewing the captured angles, before pose estimation. */
  | "review"
  /** Confirming the 3D pose preview before anything is sent. */
  | "confirm"

export type FormCoachDraft = {
  exerciseId: string
  exerciseName: string
  slug: string
  clips: FormCoachClip[]
  phase: FormCoachPhase
  /** Pose estimation output, present only once phase is "confirm". */
  landmarks: FormCoachAngleLandmarks[] | null
}

let draft: FormCoachDraft | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function revoke(clips: FormCoachClip[]) {
  for (const clip of clips) URL.revokeObjectURL(clip.url)
}

export function getFormCoachDraft() {
  return draft
}

export function subscribeToFormCoachDraft(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Opens the recorder for an exercise. Re-opening the same exercise keeps the
 * angles already recorded so "add another angle" builds on the same draft.
 */
export function startFormCoachDraft(input: {
  exerciseId: string
  exerciseName: string
  slug: string
}) {
  if (draft && draft.exerciseId === input.exerciseId) {
    // Already at the angle limit — reopen the review sheet instead of a camera
    // whose recording would be discarded.
    draft = {
      ...draft,
      phase:
        draft.clips.length < MAX_FORM_COACH_ANGLES ? "recording" : "review",
      landmarks: null,
    }
  } else {
    if (draft) revoke(draft.clips)
    draft = { ...input, clips: [], phase: "recording", landmarks: null }
  }
  emit()
}

export function openFormCoachRecorder() {
  if (!draft || draft.clips.length >= MAX_FORM_COACH_ANGLES) return
  draft = { ...draft, phase: "recording", landmarks: null }
  emit()
}

/** Backing out of the camera with nothing recorded drops the draft entirely. */
export function closeFormCoachRecorder() {
  if (!draft) return
  if (draft.clips.length === 0) {
    draft = null
  } else {
    draft = { ...draft, phase: "review" }
  }
  emit()
}

/** Pose estimation finished — hand over to the 3D preview for confirmation. */
export function setFormCoachLandmarks(landmarks: FormCoachAngleLandmarks[]) {
  if (!draft) return
  draft = { ...draft, phase: "confirm", landmarks }
  emit()
}

/** "Doesn't look right" — drop the landmarks and go back to the angles. */
export function rejectFormCoachLandmarks() {
  if (!draft) return
  draft = { ...draft, phase: "review", landmarks: null }
  emit()
}

export function addFormCoachClip(clip: {
  kind: FormCoachAngleKind
  blob: Blob
  durationMs: number
}) {
  if (!draft || draft.clips.length >= MAX_FORM_COACH_ANGLES) return
  draft = {
    ...draft,
    // Landing a clip closes the camera and hands over to the review sheet.
    phase: "review",
    landmarks: null,
    clips: [
      ...draft.clips,
      {
        id: createClientId(),
        kind: clip.kind,
        url: URL.createObjectURL(clip.blob),
        blob: clip.blob,
        durationMs: clip.durationMs,
      },
    ],
  }
  emit()
}

export function removeFormCoachClip(clipId: string) {
  if (!draft) return
  const removed = draft.clips.find((clip) => clip.id === clipId)
  if (!removed) return
  const clips = draft.clips.filter((clip) => clip.id !== clipId)
  // Landmarks describe the angles that were removed, so they go too.
  draft = clips.length === 0 ? null : { ...draft, clips, landmarks: null }
  revoke([removed])
  emit()
}

export function clearFormCoachDraft() {
  if (!draft) return
  revoke(draft.clips)
  draft = null
  emit()
}

/**
 * Base64 for one clip, without the data-URL prefix. FileReader does the encode
 * off the main thread, which `btoa` over a 15s clip would not.
 */
function encodeClip(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"))
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(",")
      if (comma === -1) {
        reject(new Error("Unexpected data URL"))
        return
      }
      resolve(result.slice(comma + 1))
    }
    reader.readAsDataURL(blob)
  })
}

/** Every angle in the draft, base64-encoded and ready for the coach. */
export async function encodeFormCoachAngles(
  clips: FormCoachClip[]
): Promise<FormCoachAngle[]> {
  return Promise.all(
    clips.map(async (clip, index) => ({
      index: index + 1,
      kind: clip.kind,
      mimeType:
        clip.blob.type || (clip.kind === "image" ? "image/jpeg" : "video/webm"),
      durationMs: clip.durationMs,
      base64: await encodeClip(clip.blob),
    }))
  )
}

export function useFormCoachDraft() {
  return useSyncExternalStore(
    subscribeToFormCoachDraft,
    getFormCoachDraft,
    getFormCoachDraft
  )
}
