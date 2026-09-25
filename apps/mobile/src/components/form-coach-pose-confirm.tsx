import { Message, tr, translateError } from "@repo/ui/i18n"
import { Suspense, lazy, useEffect, useMemo, useState } from "react"
import { ArrowCounterClockwise, Pause, Play } from "@phosphor-icons/react"
import { SwipeToStart, toast } from "@repo/ui"
import { MobileSheet } from "@/components/mobile-sheet"
import { cn, logDevError } from "@/lib/utils"
import { hapticMedium, hapticSelection, hapticTap } from "@/lib/haptics"
import { MAX_COACH_STILLS, submitFormCoachClips } from "@/lib/form-coach"
import {
  clearFormCoachDraft,
  encodeFormCoachAngles,
  rejectFormCoachLandmarks,
  useFormCoachDraft,
} from "@/lib/form-coach-clips"
import {
  NEUTRAL_ORIENTATION,
  trackedFrames,
  trackingRate,
  type PoseOrientation,
} from "@/lib/pose-scene"
import { collectReps } from "@/lib/pose-reps"
import { clampOrientation } from "@/lib/device-gravity"
import { appendFormCoachMessage } from "@/lib/form-coach-message"
import { useSmoothNavigate } from "@/lib/navigation"

// three.js is ~130 kB gzipped and only this screen needs it, so it stays out of
// the bundle every other session pays for.
const PoseViewer = lazy(() =>
  import("@/components/pose-viewer").then((module) => ({
    default: module.PoseViewer,
  }))
)

/**
 * The 3D pose the coach would actually read, shown before anything is sent so
 * a mistracked clip is caught by the person who filmed it.
 */
export function FormCoachPoseConfirm() {
  const draft = useFormCoachDraft()
  const navigate = useSmoothNavigate()
  // `null` selects the chosen rep; a number selects that raw angle.
  const [angleIndex, setAngleIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(true)
  // Where playback got to, updated a few times a second purely to label the
  // scrubber — the animation itself never routes through React.
  const [progressMs, setProgressMs] = useState(0)
  const [seekTimeMs, setSeekTimeMs] = useState<number | undefined>(undefined)
  // Nothing in the landmarks says which way gravity pointed, so a camera propped
  // at an angle tilts the whole skeleton. This lets the lifter straighten it.
  const [orientation, setOrientation] =
    useState<PoseOrientation>(NEUTRAL_ORIENTATION)
  const [sending, setSending] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const landmarks = draft?.landmarks ?? null
  // Tilt measured by the accelerometer while filming, when a clip has one.
  // The sliders correct all angles at once, so the first measured clip speaks
  // for the take.
  const measured =
    draft?.clips.find((clip) => clip.orientation)?.orientation ?? null

  // Every rep from every angle, kept whole. Null only when nothing at all was
  // tracked, in which case the raw angles are all there is to show.
  const collected = useMemo(
    () => (landmarks ? collectReps(landmarks) : null),
    [landmarks]
  )

  const showBestRep = collected !== null && angleIndex === null
  // With no rep detected there is still a clip to look at, but calling it a rep
  // would be a lie, and this screen exists to be believed.
  const hasReps = (collected?.repCount ?? 0) > 0
  const angle = showBestRep ? collected.display : landmarks?.[angleIndex ?? 0]
  const frames = useMemo(() => trackedFrames(angle), [angle])
  const rate = showBestRep ? 1 : trackingRate(angle)

  const startMs = frames[0]?.timeMs ?? 0
  const durationMs = Math.max((frames.at(-1)?.timeMs ?? 0) - startMs, 0)

  useEffect(() => {
    setProgressMs(0)
    setSeekTimeMs(0)
    setPlaying(true)
  }, [angleIndex])

  // Each fresh estimation seeds the sliders from the measured tilt — a start
  // point, not a decision; the sliders stay the user's.
  useEffect(() => {
    if (!landmarks) return
    setOrientation(measured ? clampOrientation(measured) : NEUTRAL_ORIENTATION)
  }, [landmarks, measured])

  if (!draft || draft.phase !== "confirm" || !landmarks) return null

  const totalTracked = landmarks.reduce(
    (total, entry) => total + trackedFrames(entry).length,
    0
  )

  function tryAgain() {
    void hapticSelection()
    rejectFormCoachLandmarks()
  }

  async function sendToCoach() {
    if (!draft?.landmarks || sending) return
    void hapticMedium()
    setSending(true)
    try {
      const angles = await encodeFormCoachAngles(draft.clips)
      const { report, frames, reportId } = await submitFormCoachClips(
        {
          slug: draft.slug,
          exerciseId: draft.exerciseId,
          exerciseName: draft.exerciseName,
          angles,
        },
        draft.landmarks,
        orientation
      )
      // Form advice belongs in the conversation with everything else the coach
      // says, so it lands as a message rather than a screen of its own.
      appendFormCoachMessage({ report: { ...report, reportId }, frames })
      clearFormCoachDraft()
      // Filmed from the coach's own composer there is nowhere to go, and
      // pushing the route we are already on only costs the user a back press.
      if (window.location.pathname !== "/coach") navigate("/coach")
    } catch (error) {
      // Keep the draft so a failed send does not cost the user their angles.
      logDevError("Form coach submission failed", error)
      toast.error(
        translateError(
          error instanceof Error && error.message
            ? error.message
            : tr("Couldn't send to the coach")
        )
      )
      setSending(false)
      setAttempt((value) => value + 1)
    }
  }

  return (
    <MobileSheet
      onClose={tryAgain}
      ariaLabel={tr("Confirm your tracked pose")}
      closeOnBackdrop={false}
      showHandle
      overlayClassName="bg-black/50 backdrop-blur-[8px]"
      // Capped so an oversized child can never push the confirm and retry
      // actions off the bottom of the screen.
      maxHeight="92svh"
      panelClassName="max-w-sm"
      panelStyle={{
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
      }}
    >
      <>
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-[17px] font-semibold tracking-tight">
            {tr("Does this look right?")}
          </h2>
          <p className="pt-0.5 text-[13px] leading-5 text-muted-foreground">
            {showBestRep && collected && hasReps
              ? tr(
                  "Your clearest of {{value0}} rep{{value1}} across {{value2}} angle{{value3}}. Drag to rotate it.",
                  {
                    value0: collected.repCount,
                    value1: collected.repCount === 1 ? "" : "s",
                    value2: collected.angleCount,
                    value3: collected.angleCount === 1 ? "" : "s",
                  }
                )
              : showBestRep
                ? tr(
                    "No full rep was counted, so this is the clearest tracking instead. You can still send it. Drag to rotate it."
                  )
                : tr(
                    "This is how your {{value0}} was tracked. Drag to rotate it.",
                    { value0: draft.exerciseName.toLowerCase() }
                  )}
          </p>
        </div>

        {/* ── View switcher ───────────────────────────────────────────── */}
        {(collected !== null || landmarks.length > 1) && (
          <div className="flex items-center gap-1.5 overflow-x-auto px-5 pb-3">
            {collected !== null && (
              <button
                type="button"
                onClick={() => {
                  void hapticTap()
                  setAngleIndex(null)
                }}
                aria-pressed={showBestRep}
                className={cn(
                  "min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                  showBestRep
                    ? "bg-foreground text-background"
                    : "bg-foreground/[0.06] text-muted-foreground"
                )}
              >
                {hasReps ? tr("Best rep") : tr("Tracked")}
              </button>
            )}
            {landmarks.map((entry, index) => (
              <button
                key={entry.index}
                type="button"
                onClick={() => {
                  void hapticTap()
                  setAngleIndex(index)
                }}
                aria-pressed={index === angleIndex}
                className={cn(
                  "min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                  index === angleIndex
                    ? "bg-foreground text-background"
                    : "bg-foreground/[0.06] text-muted-foreground"
                )}
              >
                <Message
                  text={"Angle {{value0}}"}
                  values={{ value0: entry.index }}
                />
              </button>
            ))}
          </div>
        )}

        {/* ── 3D scene ────────────────────────────────────────────────── */}
        <div className="px-5">
          <div className="relative overflow-hidden rounded-[20px] bg-[#0c0c0c]">
            {frames.length === 0 ? (
              <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 px-8 text-center">
                <p className="text-[15px] font-semibold text-white">
                  {tr("No pose detected")}
                </p>
                <p className="text-[13px] leading-5 text-white/70">
                  {tr(
                    "Nothing was tracked in this angle. Film again with your whole body in frame and the room well lit."
                  )}
                </p>
              </div>
            ) : (
              <>
                <Suspense
                  fallback={
                    <div className="flex aspect-[3/4] w-full items-center justify-center">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                    </div>
                  }
                >
                  <PoseViewer
                    frames={frames}
                    playing={playing}
                    seekTimeMs={seekTimeMs}
                    orientation={orientation}
                    // The chosen rep is already body-framed; the raw angles are
                    // still in the camera's frame.
                    space={showBestRep ? "body" : "camera"}
                    onProgress={setProgressMs}
                    className="aspect-[3/4] w-full"
                  />
                </Suspense>
                <div className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-md">
                  <span className="text-[12px] font-medium text-white tabular-nums">
                    {showBestRep && collected && hasReps
                      ? tr("{{value0}} rep{{value1}}", {
                          value0: collected.repCount,
                          value1: collected.repCount === 1 ? "" : "s",
                        })
                      : tr("{{value0}}% tracked", {
                          value0: Math.round((showBestRep ? 1 : rate) * 100),
                        })}
                  </span>
                </div>
                {frames.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      void hapticTap()
                      setSeekTimeMs(undefined)
                      setPlaying((value) => !value)
                    }}
                    aria-label={playing ? tr("Pause") : tr("Play")}
                    className="absolute right-3 bottom-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md active:opacity-70"
                  >
                    {playing ? (
                      <Pause size={15} weight="fill" />
                    ) : (
                      <Play size={15} weight="fill" />
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── Frame scrubber ───────────────────────────────────────── */}
          {durationMs > 0 && (
            <div className="flex items-center gap-3 pt-3">
              <input
                type="range"
                min={0}
                max={Math.round(durationMs)}
                step={10}
                value={Math.round(Math.min(progressMs, durationMs))}
                onChange={(event) => {
                  setPlaying(false)
                  const next = Number(event.target.value)
                  setProgressMs(next)
                  setSeekTimeMs(next)
                }}
                aria-label={tr("Position in the rep")}
                className="h-9 min-w-0 flex-1 accent-foreground"
              />
              <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                <Message
                  text={"{{value0}}s"}
                  values={{ value0: (progressMs / 1000).toFixed(1) }}
                />
              </span>
            </div>
          )}

          {/* ── Straighten ───────────────────────────────────────────── */}
          {frames.length > 0 && (
            <div className="pt-3">
              <div className="flex items-center justify-between pb-1">
                <p className="text-[13px] font-semibold">
                  <Message
                    text={"Straighten{{value0}}"}
                    values={{
                      value0: measured && (
                        <span className="pl-1.5 text-[12px] font-normal text-muted-foreground">
                          {tr("auto")}
                        </span>
                      ),
                    }}
                  />
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void hapticTap()
                    setOrientation(NEUTRAL_ORIENTATION)
                  }}
                  disabled={
                    orientation.pitchDeg === 0 && orientation.rollDeg === 0
                  }
                  className="min-h-8 rounded-full px-2 text-[12px] font-semibold text-muted-foreground disabled:opacity-40"
                >
                  {tr("Reset")}
                </button>
              </div>
              <p className="pb-2 text-[12px] leading-4 text-muted-foreground">
                {tr(
                  "A camera that was not quite level tilts the whole skeleton. Nudge it upright, because the coach measures what you see here."
                )}
              </p>
              {(
                [
                  ["pitchDeg", "Tilt", "Lean forward and back"],
                  ["rollDeg", "Roll", "Rotate side to side"],
                ] as const
              ).map(([key, label, hint]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-[12px] text-muted-foreground">
                    {label}
                  </span>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    value={orientation[key]}
                    onChange={(event) =>
                      setOrientation((current) => ({
                        ...current,
                        [key]: Number(event.target.value),
                      }))
                    }
                    aria-label={hint}
                    className="h-9 min-w-0 flex-1 accent-foreground"
                  />
                  <span className="w-9 shrink-0 text-right text-[12px] text-muted-foreground tabular-nums">
                    {orientation[key]}°
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Confirm ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5 px-5 pt-5">
          {sending ? (
            <div
              className="flex h-[62px] items-center justify-center gap-2.5 rounded-[20px]"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--foreground) 6%, transparent)",
              }}
              role="status"
            >
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
              <span className="text-[15px] font-semibold">
                {tr("Reading your form…")}
              </span>
            </div>
          ) : (
            <SwipeToStart
              key={attempt}
              label={tr("Looks right, ask the coach")}
              readyLabel={tr("Release to send")}
              completingLabel={tr("Sending")}
              onComplete={() => void sendToCoach()}
              onHaptic={(kind) =>
                kind === "complete" ? hapticMedium() : hapticSelection()
              }
            />
          )}
          <button
            type="button"
            onClick={tryAgain}
            disabled={sending}
            className="motion-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-border/60 text-[15px] font-semibold disabled:opacity-40"
          >
            <Message
              text={"{{value0}}Try again"}
              values={{
                value0: <ArrowCounterClockwise size={15} weight="bold" />,
              }}
            />
          </button>
          <p className="text-center text-[12px] text-muted-foreground">
            {collected
              ? tr(
                  "{{value0}} · {{value1}} tracked frames · {{value2}} angle{{value3}}",
                  {
                    value0: hasReps
                      ? tr("{{value0}} rep{{value1}}", {
                          value0: collected.repCount,
                          value1: collected.repCount === 1 ? "" : "s",
                        })
                      : tr("no reps counted"),
                    value1: totalTracked,
                    value2: landmarks.length,
                    value3: landmarks.length === 1 ? "" : "s",
                  }
                )
              : tr(
                  "{{value0}} tracked frame{{value1}} across {{value2}} angle{{value3}}",
                  {
                    value0: totalTracked,
                    value1: totalTracked === 1 ? "" : "s",
                    value2: landmarks.length,
                    value3: landmarks.length === 1 ? "" : "s",
                  }
                )}
          </p>
          {/* Said plainly, because it is the one part of this the skeleton
              above does not show. */}
          <p className="text-center text-[12px] text-muted-foreground">
            <Message
              text={
                "Sends your skeleton and up to {{value0}} frames of the video"
              }
              values={{ value0: MAX_COACH_STILLS }}
            />
          </p>
        </div>
      </>
    </MobileSheet>
  )
}
