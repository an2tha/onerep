import { Suspense, lazy, useEffect, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowsOut,
  CheckCircle,
  Eye,
  Info,
  PushPin,
  PushPinSlash,
  Warning,
  X,
} from "@phosphor-icons/react"
import { createPortal } from "react-dom"
import { useMutation, useQuery } from "convex/react"
import { toast } from "@repo/ui"
import { cn } from "@/lib/utils"
import { hapticSelection, hapticTap } from "@/lib/haptics"
import { applyCorrections, type PoseCorrection } from "@/lib/pose-correction"
import { POSE_CORRECTED_COLOR, poseColorHex } from "@/lib/pose-colors"
import type { FormCoachFrame } from "@/lib/form-coach"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

// three.js only arrives when a card with a pose is actually on screen.
const LazyPoseViewer = lazy(() =>
  import("@/components/pose-viewer").then((module) => ({
    default: module.PoseViewer,
  }))
)

export type FormCoachPose = Array<{
  timeMs: number
  worldLandmarks: Array<{ x: number; y: number; z: number; visibility: number }>
}>

export type FormCoachFinding = {
  title: string
  detail: string
  severity: string
  confidence: string
  evidence: { measurement: string; value: string; phase?: string }
  cue?: string
}

export type FormCoachDetail = {
  findings: FormCoachFinding[]
  drills: Array<{ name: string; reason: string }>
  notMeasured: string[]
  /** What to watch for on the next set. Absent on reports written before it. */
  checklist?: string[]
}

/**
 * The measurement behind a finding, as one line.
 *
 * The phase is only appended when the model has not already worked it into the
 * value, which it usually has — otherwise this reads "at turnaround at
 * turnaround".
 */
function evidenceLine(finding: FormCoachFinding) {
  const phase = finding.evidence.phase?.replace(/_/g, " ")
  // Tool names and field names are ours, not the lifter's. Strip anything that
  // reads like `measure_symmetry (knee) = rightMinusLeftDegrees =` and keep the
  // number, which is the only part they can act on.
  const value = finding.evidence.value.replace(/^[\w\s()_]*=\s*/, "").trim()
  const mentionsPhase =
    phase && value.toLowerCase().includes(phase.toLowerCase())
  const reading = `${value}${phase && !mentionsPhase ? ` at ${phase}` : ""}`
  return `${reading} · ${finding.confidence}`
}

/**
 * Every overlay in this file goes through here, and none of them may be
 * rendered in place.
 *
 * These sheets open from a card that lives inside the coach conversation, and
 * the surfaces above it use `backdrop-filter` and transforms freely. Either one
 * makes that ancestor the containing block for `position: fixed`, so a sheet
 * rendered in the tree pins itself to the card instead of the viewport: it
 * floats mid-page, its backdrop covers only the card's own box, and it inherits
 * the app's max-width column. Portalling to the body is the whole fix.
 */
function SheetPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null
  return createPortal(children, document.body)
}

/**
 * Open overlays, innermost last.
 *
 * These nest — the pose view opens from the detail sheet, which opens from the
 * history sheet — and every one of them listens on `document`. Without knowing
 * which is on top, one Escape closes the whole stack at once.
 */
const overlayStack: symbol[] = []

/** Locks the page behind an overlay and closes it on Escape. */
function useOverlayChrome(onClose: () => void) {
  useEffect(() => {
    const token = Symbol("overlay")
    overlayStack.push(token)

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (overlayStack.at(-1) !== token) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener("keydown", closeOnEscape)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", closeOnEscape)
      overlayStack.splice(overlayStack.indexOf(token), 1)
      // Restores "hidden" while an outer overlay is still open, and the page's
      // own value once the last one closes.
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])
}

/** The corrected skeleton's colour, derived so it cannot drift from the scene. */
const CORRECTED_HEX = poseColorHex(POSE_CORRECTED_COLOR)

/** Which skeleton is which, for a scene showing both. */
function PoseLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-2.5 left-2.5 flex items-center gap-2 rounded-full bg-black/55 px-2.5 py-1 backdrop-blur-md",
        className
      )}
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold text-white">
        <span
          className="h-1.5 w-4 rounded-full"
          style={{ backgroundColor: CORRECTED_HEX }}
        />
        Corrected
      </span>
      <span className="flex items-center gap-1 text-[11px] text-white/60">
        <span className="h-1.5 w-4 rounded-full bg-white/30" />
        Yours
      </span>
    </div>
  )
}

/**
 * Opacity for each skeleton at a blend position.
 *
 * Both are fully opaque in the middle rather than half-lit, because the default
 * position is the one that has to show the difference. Fading only starts once
 * the slider is pulled towards one side, and each end hides the other skeleton
 * outright so it can be looked at on its own.
 */
export function blendOpacity(blend: number) {
  return {
    corrected: Math.min(1, 2 * blend),
    yours: Math.min(1, 2 * (1 - blend)),
  }
}

/**
 * The scene at the size the correction actually needs.
 *
 * A rotated knee is a few degrees of difference, which is legible at 320px and
 * essentially invisible in a card. This gives it the screen, and a blend slider
 * so the two skeletons can be separated rather than squinted at.
 */
export function PoseExpandModal({
  exerciseName,
  pose,
  corrections,
  onClose,
}: {
  exerciseName: string
  pose: FormCoachPose
  corrections: PoseCorrection[]
  onClose: () => void
}) {
  const [blend, setBlend] = useState(0.5)
  const opacity = blendOpacity(blend)
  const hasCorrection = corrections.length > 0

  useOverlayChrome(onClose)

  return (
    <SheetPortal>
      <div
        className="sheet-overlay fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-[10px]"
        role="dialog"
        aria-modal="true"
        aria-label={`${exerciseName} pose, expanded`}
      >
        <div
          className="mx-auto flex w-full max-w-5xl shrink-0 items-center gap-3 px-4"
          style={{
            paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close expanded pose"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/70 active:bg-white/10"
          >
            <X size={16} weight="bold" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">
            {exerciseName}
          </h2>
        </div>

        {/* min-h-0 so the scene can shrink inside the column rather than
          overflowing it and pushing the slider off the bottom. */}
        <div className="relative min-h-0 w-full flex-1">
          <FormCoachPoseScene
            pose={pose}
            corrections={corrections}
            correctedOpacity={opacity.corrected}
            yoursOpacity={opacity.yours}
            // Not `absolute inset-0`: the viewer's own mount is `relative`, and
            // Tailwind emits `relative` after `absolute`, so it would win.
            className="h-full w-full"
          />
          {hasCorrection && <PoseLegend className="bottom-4 left-4" />}
        </div>

        {hasCorrection && (
          <div
            className="mx-auto w-full max-w-md shrink-0 px-6 pt-2"
            style={{
              paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
            }}
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={blend}
              onChange={(event) => setBlend(Number(event.target.value))}
              aria-label="Fade between your rep and the corrected one"
              className="h-9 w-full"
              style={{ accentColor: CORRECTED_HEX }}
            />
            <div className="flex justify-between text-[12px] font-medium">
              <span className="text-white/50">Yours</span>
              <span style={{ color: CORRECTED_HEX }}>Corrected</span>
            </div>
          </div>
        )}
      </div>
    </SheetPortal>
  )
}

const SEVERITY: Record<
  string,
  { label: string; icon: typeof Warning; text: string; tint: string }
> = {
  strength: {
    label: "Working",
    icon: CheckCircle,
    text: "text-primary",
    tint: "border-primary/25 bg-primary/10",
  },
  minor: {
    label: "Worth a look",
    icon: Info,
    text: "text-foreground",
    tint: "border-border/60 bg-foreground/[0.05]",
  },
  major: {
    label: "Fix this",
    icon: Warning,
    text: "text-destructive",
    tint: "border-destructive/25 bg-destructive/10",
  },
}

/**
 * Everything the coach said about one rep.
 *
 * The card carries the summary and the scene; the rest lives here so a pinned
 * card stays glanceable but nothing the coach measured is lost.
 */
function FormCoachDetailSheet({
  exerciseName,
  summary,
  detail,
  pose,
  corrections,
  onClose,
}: {
  exerciseName: string
  summary: string
  detail: FormCoachDetail
  pose: FormCoachPose
  corrections: PoseCorrection[]
  onClose: () => void
}) {
  const [expandedPose, setExpandedPose] = useState(false)
  useOverlayChrome(onClose)
  const checklist = detail.checklist ?? []

  return (
    <SheetPortal>
      <div
        className="sheet-overlay fixed inset-0 z-[90] flex items-end justify-center bg-black/60 backdrop-blur-[8px] sm:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${exerciseName} form notes`}
          className="sheet-panel max-h-[92svh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)] sm:rounded-3xl"
          style={{
            paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex justify-center pt-3">
            <div className="h-1 w-10 rounded-full bg-foreground/[0.10]" />
          </div>

          <div className="flex items-center gap-3 px-5 pt-4 pb-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close form notes"
              className="flex size-10 shrink-0 items-center justify-center rounded-full transition-colors active:bg-muted/60"
              style={{
                color: "color-mix(in srgb, var(--foreground) 40%, transparent)",
              }}
            >
              <ArrowLeft size={14} weight="bold" />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
              {exerciseName}
            </h2>
          </div>

          {/* Bigger here than on the card: this is the screen you open to look
            properly, so the scene gets the room the card cannot spare. */}
          {pose.length > 0 && (
            <div className="px-5 pb-4">
              <div className="relative overflow-hidden rounded-[18px] bg-[#0c0c0c]">
                <FormCoachPoseScene
                  pose={pose}
                  corrections={corrections}
                  className="h-[320px] w-full"
                />
                {corrections.length > 0 && <PoseLegend />}
                <ExpandPoseButton onExpand={() => setExpandedPose(true)} />
              </div>
            </div>
          )}

          <p className="px-5 pb-4 text-[13.5px] leading-6">{summary}</p>

          {/* First, because it is the only part read *before* the next set
            rather than after it. */}
          {checklist.length > 0 && (
            <div className="mx-5 mb-4 rounded-[18px] border border-border/60 bg-foreground/[0.04] px-4 py-3.5">
              <p className="pb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground/60 uppercase">
                Next set
              </p>
              <ol className="flex flex-col gap-2">
                {checklist.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-2.5">
                    <span className="pt-px text-[12px] font-semibold text-muted-foreground/70 tabular-nums">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] leading-5">
                      {item}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-col gap-2.5 px-5">
            {detail.findings.map((finding, index) => {
              const severity = SEVERITY[finding.severity] ?? SEVERITY.minor
              const Icon = severity.icon
              return (
                <div
                  key={`${finding.title}-${index}`}
                  className={cn(
                    "rounded-[18px] border px-4 py-3.5",
                    severity.tint
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      size={15}
                      weight="fill"
                      className={cn("shrink-0", severity.text)}
                    />
                    <p className="min-w-0 flex-1 text-[15px] font-semibold tracking-tight">
                      {finding.title}
                    </p>
                  </div>
                  {/* The detail explains what it means for the lift; the cue is
                    the thing to do about it on the next set. Both earn their
                    place, so neither is clamped away. */}
                  <p className="pt-1.5 text-[13px] leading-5 text-muted-foreground">
                    {finding.detail}
                  </p>
                  {finding.cue && (
                    <p className="pt-2 text-[13px] leading-5 font-medium">
                      {finding.cue}
                    </p>
                  )}
                  {/* The measurement behind the claim, so it can be checked
                    rather than taken on faith. */}
                  <p className="truncate pt-1.5 text-[11.5px] text-muted-foreground/70">
                    {evidenceLine(finding)}
                  </p>
                </div>
              )
            })}
          </div>

          {detail.drills.length > 0 && (
            <div className="px-5 pt-4">
              <p className="pb-1.5 text-[11px] font-bold tracking-[0.12em] text-muted-foreground/60 uppercase">
                Work on
              </p>
              <div className="flex flex-col gap-1">
                {detail.drills.map((drill, index) => (
                  <p
                    key={`${drill.name}-${index}`}
                    className="text-[13px] leading-5"
                  >
                    {drill.name}
                    <span className="text-muted-foreground">
                      {" · "}
                      {drill.reason}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {detail.notMeasured.length > 0 && (
            <div className="px-5 pt-4">
              <p className="flex items-center gap-1.5 pb-1.5 text-[11px] font-bold tracking-[0.12em] text-muted-foreground/60 uppercase">
                <Eye size={11} weight="bold" />
                Not visible
              </p>
              <ul className="flex flex-col gap-0.5">
                {detail.notMeasured.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="text-[12.5px] leading-5 text-muted-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {expandedPose && (
          <PoseExpandModal
            exerciseName={exerciseName}
            pose={pose}
            corrections={corrections}
            onClose={() => setExpandedPose(false)}
          />
        )}
      </div>
    </SheetPortal>
  )
}

const SURFACES = [
  { key: "workouts" as const, label: "Workouts" },
  { key: "progress" as const, label: "Progress" },
]

function toFrames(pose: FormCoachPose): FormCoachFrame[] {
  return pose.map((frame) => ({
    timeMs: frame.timeMs,
    landmarks: [],
    worldLandmarks: frame.worldLandmarks,
  }))
}

/**
 * The corrected rep, with the lifter's actual rep behind it as a ghost.
 *
 * Showing both at once rather than behind a toggle is the point: the correction
 * is only meaningful as a difference, and a toggle asks the user to hold one
 * position in their head while looking at the other.
 */
export function FormCoachPoseScene({
  pose,
  corrections,
  correctedOpacity = 1,
  yoursOpacity,
  className,
}: {
  pose: FormCoachPose
  corrections: PoseCorrection[]
  /** Live, so the expanded view can fade one skeleton against the other. */
  correctedOpacity?: number
  yoursOpacity?: number
  className?: string
}) {
  const original = toFrames(pose)
  const corrected =
    corrections.length > 0 ? applyCorrections(original, corrections) : null

  return (
    <Suspense
      fallback={
        <div className={cn("animate-pulse bg-white/[0.03]", className)} />
      }
    >
      <LazyPoseViewer
        frames={corrected ?? original}
        ghostFrames={corrected ? original : undefined}
        playing
        // Already body-framed by the time it reaches a card.
        space="body"
        boneOpacity={correctedOpacity}
        // The ghost stays faint by default; only the expanded view raises it.
        {...(yoursOpacity === undefined
          ? {}
          : { ghostOpacity: yoursOpacity * 0.85 })}
        className={className}
      />
    </Suspense>
  )
}

/** Opens the scene full-screen. Sits on the scene, so every caller gets it. */
export function ExpandPoseButton({ onExpand }: { onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        void hapticTap()
        onExpand()
      }}
      aria-label="Expand the pose"
      className="absolute top-2.5 right-2.5 flex size-9 items-center justify-center rounded-full bg-black/55 text-white/80 backdrop-blur-md active:bg-black/75"
    >
      <ArrowsOut size={14} weight="bold" />
    </button>
  )
}

/**
 * A form finding the user can keep. Rendered in the coach conversation and,
 * once pinned, on the Workouts or Progress screen.
 */
export function FormCoachCard({
  reportId,
  exerciseName,
  summary,
  pose,
  corrections,
  date,
  pinId,
  onUnpin,
  detail,
}: {
  reportId: Id<"formCoachReports">
  exerciseName: string
  summary: string
  pose: FormCoachPose
  corrections: PoseCorrection[]
  date?: string
  /** Present when this card is already pinned somewhere. */
  pinId?: Id<"formCoachPins">
  onUnpin?: () => void
  /** The rest of what the coach said, shown when the card is expanded. */
  detail?: FormCoachDetail
}) {
  const pinnedTo = useQuery(api.ai.formCoachAgent.isPinned, { reportId })
  const pin = useMutation(api.ai.formCoachAgent.pinReport)
  const unpin = useMutation(api.ai.formCoachAgent.unpinReport)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [expandedPose, setExpandedPose] = useState(false)

  async function togglePin(surface: "workouts" | "progress") {
    if (busy) return
    setBusy(true)
    try {
      void hapticSelection()
      await pin({ reportId, surface })
      toast(`Pinned to ${surface === "workouts" ? "Workouts" : "Progress"}`)
    } catch {
      toast.error("Couldn't pin that")
    } finally {
      setBusy(false)
    }
  }

  const hasCorrection = corrections.length > 0
  // Nullable rather than a boolean flag, so the branches below can read from it
  // without a non-null assertion.
  const openableDetail =
    detail &&
    (detail.findings.length > 0 ||
      detail.drills.length > 0 ||
      detail.notMeasured.length > 0 ||
      (detail.checklist ?? []).length > 0)
      ? detail
      : undefined

  return (
    <div className="w-full max-w-md overflow-hidden rounded-[20px] border border-border/55 bg-card">
      <div className="relative bg-[#0c0c0c]">
        <FormCoachPoseScene
          pose={pose}
          corrections={corrections}
          className="h-[220px] w-full"
        />
        {hasCorrection && <PoseLegend />}
        <ExpandPoseButton onExpand={() => setExpandedPose(true)} />
      </div>

      <div className="px-4 pt-3 pb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold tracking-tight">
              {exerciseName}
            </p>
            {date && (
              <p className="text-[12px] text-muted-foreground tabular-nums">
                {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {openableDetail && (
              <button
                type="button"
                onClick={() => {
                  void hapticTap()
                  setExpanded(true)
                }}
                aria-label="See everything the coach said"
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
              >
                <ArrowsOut size={14} weight="bold" />
              </button>
            )}
            {pinId && onUnpin && (
              <button
                type="button"
                onClick={async () => {
                  void hapticTap()
                  await unpin({ pinId })
                  onUnpin()
                }}
                aria-label="Unpin this card"
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
              >
                <PushPinSlash size={14} weight="bold" />
              </button>
            )}
          </div>
        </div>

        <p className="pt-2 text-[13px] leading-relaxed text-muted-foreground">
          {summary}
        </p>

        {openableDetail && (
          <button
            type="button"
            onClick={() => {
              void hapticTap()
              setExpanded(true)
            }}
            className="pt-2 text-[12px] font-semibold text-muted-foreground active:text-foreground"
          >
            {openableDetail.findings.length} note
            {openableDetail.findings.length === 1 ? "" : "s"} from the coach
          </button>
        )}

        {!pinId && (
          <div className="flex items-center gap-1.5 pt-3">
            {SURFACES.map(({ key, label }) => {
              const already = pinnedTo?.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  disabled={busy || already}
                  onClick={() => void togglePin(key)}
                  className={cn(
                    "flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors",
                    already
                      ? "bg-primary/10 text-primary"
                      : "bg-foreground/[0.06] text-muted-foreground active:bg-muted"
                  )}
                >
                  <PushPin size={12} weight={already ? "fill" : "bold"} />
                  {already ? `On ${label}` : `Pin to ${label}`}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {expandedPose && (
        <PoseExpandModal
          exerciseName={exerciseName}
          pose={pose}
          corrections={corrections}
          onClose={() => setExpandedPose(false)}
        />
      )}

      {expanded && openableDetail && (
        <FormCoachDetailSheet
          exerciseName={exerciseName}
          summary={summary}
          detail={openableDetail}
          pose={pose}
          corrections={corrections}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  )
}

/**
 * Every report the form coach has written, newest first.
 *
 * `listReports` returns projected rows only. The full report — pose frames and
 * all — is fetched one at a time, on tap, by `FormCoachHistoryDetail`.
 */
function FormCoachHistorySheet({ onClose }: { onClose: () => void }) {
  const reports = useQuery(api.ai.formCoachAgent.listReports, { limit: 30 })
  const [openReportId, setOpenReportId] =
    useState<Id<"formCoachReports"> | null>(null)
  useOverlayChrome(onClose)

  return (
    <>
      <SheetPortal>
        <div
          className="sheet-overlay fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-[8px] sm:items-center"
          onClick={onClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Form Coach history"
            className="sheet-panel max-h-[92svh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)] sm:rounded-3xl"
            style={{
              paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-center pt-3">
              <div className="h-1 w-10 rounded-full bg-foreground/[0.10]" />
            </div>

            <div className="flex items-center gap-3 px-5 pt-4 pb-3">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Form Coach history"
                className="flex size-10 shrink-0 items-center justify-center rounded-full transition-colors active:bg-muted/60"
                style={{
                  color:
                    "color-mix(in srgb, var(--foreground) 40%, transparent)",
                }}
              >
                <ArrowLeft size={14} weight="bold" />
              </button>
              <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
                Form Coach history
              </h2>
            </div>

            {reports === undefined ? (
              <div className="space-y-2 px-5 pb-5">
                {[0, 1, 2].map((row) => (
                  <div
                    key={row}
                    className="h-16 animate-pulse rounded-2xl bg-muted/40"
                  />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <p className="px-5 pb-6 text-[14px] leading-5 text-muted-foreground">
                Record a set with the form coach and every report will collect
                here.
              </p>
            ) : (
              <ul className="px-5 pb-5">
                {reports.map((report) => (
                  <li key={report._id}>
                    <button
                      type="button"
                      onClick={() => {
                        hapticTap()
                        setOpenReportId(report._id)
                      }}
                      className="flex w-full items-start gap-3 border-b border-border/40 py-3 text-left last:border-b-0"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[15px] font-semibold">
                            {report.exerciseName}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {report.date}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[13px] leading-5 text-muted-foreground">
                          {report.summary}
                        </span>
                        {report.findingCount > 0 && (
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {report.findingCount} note
                            {report.findingCount === 1 ? "" : "s"}
                            {report.majorCount > 0 &&
                              ` · ${report.majorCount} to fix`}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetPortal>

      {openReportId && (
        <FormCoachHistoryDetail
          reportId={openReportId}
          onClose={() => setOpenReportId(null)}
        />
      )}
    </>
  )
}

/** Hydrates one report on demand — never prefetched, the payload is heavy. */
function FormCoachHistoryDetail({
  reportId,
  onClose,
}: {
  reportId: Id<"formCoachReports">
  onClose: () => void
}) {
  const report = useQuery(api.ai.formCoachAgent.getReport, { reportId })
  if (!report) return null
  return (
    <FormCoachDetailSheet
      exerciseName={report.exerciseName}
      summary={report.summary}
      detail={{
        findings: report.findings,
        drills: report.drills,
        notMeasured: report.notMeasured,
        checklist: report.checklist,
      }}
      pose={(report.pose ?? []) as FormCoachPose}
      corrections={(report.corrections ?? []) as PoseCorrection[]}
      onClose={onClose}
    />
  )
}

/**
 * The pinned cards for one screen, under their own heading.
 *
 * Renders nothing at all when there is no advice, so the section never appears
 * as an empty shell on a page the user has not used the form coach from.
 */
export function FormCoachPinnedCards({
  surface,
}: {
  surface: "workouts" | "progress"
}) {
  const cards = useQuery(api.ai.formCoachAgent.listPinned, { surface })
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [historyOpen, setHistoryOpen] = useState(false)
  const visible = (cards ?? []).filter((card) => !dismissed.has(card.pinId))
  // History is reachable even with nothing pinned — but only once there is
  // something to look at, so this never renders as an empty shell.
  const recent = useQuery(api.ai.formCoachAgent.listReports, { limit: 1 })
  const hasHistory = (recent ?? []).length > 0
  if (visible.length === 0 && !hasHistory) return null

  if (visible.length === 0) {
    return (
      <section className="pt-2">
        <button
          type="button"
          onClick={() => {
            hapticTap()
            setHistoryOpen(true)
          }}
          className="flex min-h-12 w-full items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="app-section-title block">Form Coach</span>
            <span className="app-section-subtitle block">
              Review your past technique reports
            </span>
          </span>
          <Eye size={16} className="shrink-0 text-muted-foreground" />
        </button>
        {historyOpen && (
          <FormCoachHistorySheet onClose={() => setHistoryOpen(false)} />
        )}
      </section>
    )
  }

  return (
    <section className="pt-2">
      <div className="flex items-start justify-between gap-3 pb-4">
        <div className="min-w-0">
          <p className="app-section-title">Form Coach</p>
          <p className="app-section-subtitle">
            Technique notes you pinned from a recorded set
          </p>
        </div>
        {hasHistory && (
          <button
            type="button"
            onClick={() => {
              hapticTap()
              setHistoryOpen(true)
            }}
            className="min-h-10 shrink-0 text-[13px] font-semibold text-muted-foreground"
          >
            History
          </button>
        )}
      </div>
      {historyOpen && (
        <FormCoachHistorySheet onClose={() => setHistoryOpen(false)} />
      )}
      <div className="flex flex-col gap-3">
        {visible.map((card) => (
          <FormCoachCard
            key={card.pinId}
            reportId={card.reportId}
            exerciseName={card.exerciseName}
            summary={card.summary}
            pose={card.pose}
            corrections={card.corrections as PoseCorrection[]}
            date={card.date}
            pinId={card.pinId}
            detail={{
              findings: card.findings,
              drills: card.drills,
              notMeasured: card.notMeasured,
              checklist: card.checklist,
            }}
            onUnpin={() =>
              setDismissed((current) => new Set(current).add(card.pinId))
            }
          />
        ))}
      </div>
    </section>
  )
}
