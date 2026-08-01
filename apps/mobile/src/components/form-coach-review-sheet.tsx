import { useState } from "react"
import { Image as ImageIcon, Plus, Trash, X } from "@phosphor-icons/react"
import { SwipeToStart, toast } from "@repo/ui"
import { cn, logDevError } from "@/lib/utils"
import { hapticMedium, hapticSelection, hapticTap } from "@/lib/haptics"
import {
  extractFormCoachLandmarks,
  type FormCoachProgress,
} from "@/lib/form-coach"
import {
  MAX_FORM_COACH_ANGLES,
  clearFormCoachDraft,
  encodeFormCoachAngles,
  openFormCoachRecorder,
  removeFormCoachClip,
  setFormCoachLandmarks,
  useFormCoachDraft,
} from "@/lib/form-coach-clips"

function formatDuration(ms: number) {
  const tenths = Math.round(ms / 100)
  return `${Math.floor(tenths / 10)}.${tenths % 10}s`
}

/**
 * Review of the angles recorded for one exercise, shown over the active workout
 * so the user never loses their place in the session.
 */
export function FormCoachReviewSheet() {
  const draft = useFormCoachDraft()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [progress, setProgress] = useState<FormCoachProgress | null>(null)
  const [attempt, setAttempt] = useState(0)

  const clips = draft?.clips ?? []
  // Follow the newest angle so a clip recorded from "+" is the one on screen.
  const activeId = clips.some((clip) => clip.id === selectedId)
    ? selectedId
    : (clips.at(-1)?.id ?? null)
  const active = clips.find((clip) => clip.id === activeId) ?? null

  // The camera and the pose preview both cover this sheet rather than
  // replacing it, so the draft stays put while another angle is recorded.
  if (!draft || draft.phase !== "review" || clips.length === 0) return null

  function addAngle() {
    if (analysing) return
    void hapticTap()
    openFormCoachRecorder()
  }

  function discard() {
    if (analysing) return
    void hapticSelection()
    clearFormCoachDraft()
  }

  async function analyse() {
    if (!draft || analysing) return
    void hapticMedium()
    setAnalysing(true)
    setProgress({ stage: "loading", value: 0 })
    try {
      const angles = await encodeFormCoachAngles(draft.clips)
      const landmarks = await extractFormCoachLandmarks(
        {
          slug: draft.slug,
          exerciseId: draft.exerciseId,
          exerciseName: draft.exerciseName,
          angles,
        },
        setProgress
      )
      // Hands over to the 3D preview; nothing is sent until the user confirms
      // the tracking actually followed them.
      setFormCoachLandmarks(landmarks)
      setAnalysing(false)
      setProgress(null)
    } catch (error) {
      // Keep the draft so the angles survive a failed run.
      logDevError("Form coach pose estimation failed", error)
      toast.error("Couldn't read your form from that footage")
      setAnalysing(false)
      setProgress(null)
      setAttempt((value) => value + 1)
    }
  }

  const canAddAngle = clips.length < MAX_FORM_COACH_ANGLES

  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[8px]"
      onClick={discard}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Review your ${draft.exerciseName} form`}
        className="sheet-panel max-h-[92svh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3">
          <div className="h-1 w-10 rounded-full bg-foreground/[0.10]" />
        </div>

        {/* ── Angle switcher ──────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {clips.map((clip, index) => {
              const isActive = clip.id === activeId
              return (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => {
                    void hapticTap()
                    setSelectedId(clip.id)
                  }}
                  aria-pressed={isActive}
                  className={cn(
                    "min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                    isActive
                      ? "bg-foreground text-background"
                      : "bg-foreground/[0.06] text-muted-foreground"
                  )}
                >
                  Angle {index + 1}
                </button>
              )
            })}
            {canAddAngle && (
              <button
                type="button"
                onClick={addAngle}
                aria-label="Add another angle (optional)"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/20 text-muted-foreground transition-colors active:bg-muted/60 active:text-foreground"
              >
                <Plus size={14} weight="bold" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={discard}
            aria-label="Discard clips and close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:bg-muted/60"
            style={{
              color: "color-mix(in srgb, var(--foreground) 40%, transparent)",
            }}
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        {/* ── Playback ────────────────────────────────────────────────── */}
        {active && (
          <div className="px-5">
            <div className="relative overflow-hidden rounded-[20px] bg-black">
              {active.kind === "image" ? (
                <img
                  src={active.url}
                  alt={`${draft.exerciseName}, angle ${clips.indexOf(active) + 1}`}
                  className="aspect-[3/4] w-full object-cover"
                />
              ) : (
                <video
                  // Remount per clip so switching angles restarts playback
                  // instead of showing the previous frame.
                  key={active.id}
                  src={active.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="aspect-[3/4] w-full object-cover"
                />
              )}
              {/* Stills have no duration, and uploads from browsers that hide
                  it report 0 — no badge beats a confident "0.0s". */}
              {active.kind === "image" ? (
                <div className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-md">
                  <ImageIcon size={12} weight="bold" className="text-white" />
                  <span className="text-[12px] font-medium text-white">
                    Photo
                  </span>
                </div>
              ) : (
                active.durationMs > 0 && (
                  <div className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-md">
                    <span className="text-[12px] font-medium text-white tabular-nums">
                      {formatDuration(active.durationMs)}
                    </span>
                  </div>
                )
              )}
            </div>
            <div className="flex items-center justify-between pt-2.5">
              <p className="truncate text-[13px] text-muted-foreground">
                {draft.exerciseName}
                {clips.length > 1 && ` · ${clips.length} angles`}
              </p>
              <button
                type="button"
                disabled={analysing}
                onClick={() => {
                  void hapticSelection()
                  removeFormCoachClip(active.id)
                }}
                className="flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-muted-foreground transition-colors active:bg-destructive/10 active:text-destructive disabled:opacity-40"
              >
                <Trash size={14} weight="bold" />
                Delete
              </button>
            </div>
          </div>
        )}

        {/* ── Send ────────────────────────────────────────────────────── */}
        <div className="px-5 pt-5">
          {analysing ? (
            // Pose estimation runs for several seconds per angle. A determinate
            // bar is worth the plumbing here: the work is knowable up front, and
            // a spinner for ten seconds reads as a hang.
            <div
              className="flex h-[62px] flex-col justify-center gap-2 rounded-[20px] px-4"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--foreground) 6%, transparent)",
              }}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-semibold">
                  {progress?.stage === "loading"
                    ? "Preparing to read your form…"
                    : "Reading your form…"}
                </span>
                <span className="text-[12px] text-muted-foreground tabular-nums">
                  {Math.round((progress?.value ?? 0) * 100)}%
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-foreground/10"
                role="progressbar"
                aria-label="Reading your form"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((progress?.value ?? 0) * 100)}
              >
                <div
                  className="h-full rounded-full bg-foreground transition-[width] duration-200 ease-out"
                  style={{
                    // Never quite zero, so the bar reads as started rather than
                    // broken while the model loads.
                    width: `${Math.max((progress?.value ?? 0) * 100, 3)}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <SwipeToStart
              // A failed send remounts the track so the thumb returns home
              // instead of sitting stuck at the completed end.
              key={attempt}
              label="Check my form"
              readyLabel="Release to check"
              completingLabel="Checking"
              onComplete={() => void analyse()}
              onHaptic={(kind) =>
                kind === "complete" ? hapticMedium() : hapticSelection()
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}
