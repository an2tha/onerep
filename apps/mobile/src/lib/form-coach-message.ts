import {
  COACH_CONVERSATION_KEY,
  type CoachMessage,
  type CoachUiBlock,
} from "@/lib/coach-chat"
import type { FormCoachFrame } from "@/lib/form-coach"
import type { PoseCorrection } from "@/lib/pose-correction"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"

export type FormCoachReport = {
  exerciseName: string
  /** Set once the report is saved, which is what makes the card pinnable. */
  reportId?: string
  summary: string
  findings: Array<{
    title: string
    detail: string
    severity: string
    confidence: string
    evidence: { measurement: string; value: string; phase?: string }
    cue?: string | null
  }>
  drills: Array<{ name: string; reason: string }>
  notMeasured: string[]
  checklist?: string[]
  corrections?: PoseCorrection[]
}

/**
 * Landmarks rounded and stripped down before they go near localStorage.
 *
 * The conversation is persisted as one JSON string, so a full-precision rep
 * would eat a meaningful share of the quota and get the whole history dropped.
 */
function compactFrames(frames: readonly FormCoachFrame[]) {
  const round = (value: number) => Math.round(value * 1000) / 1000
  return frames.map((frame) => ({
    timeMs: frame.timeMs,
    worldLandmarks: frame.worldLandmarks.map((point) => ({
      x: round(point.x),
      y: round(point.y),
      z: round(point.z),
      visibility: Math.round((point.visibility ?? 1) * 100) / 100,
    })),
  }))
}

/**
 * Turns a report into the coach's own vocabulary.
 *
 * The findings become cards and a checklist rather than a bespoke screen, so
 * form advice reads like everything else the coach says and can be replied to.
 */
export function buildFormCoachBlocks(
  report: FormCoachReport,
  frames: readonly FormCoachFrame[]
): CoachUiBlock[] {
  const blocks: CoachUiBlock[] = []

  blocks.push({
    type: "pose",
    title: report.exerciseName,
    detail: report.summary,
    frames: compactFrames(frames),
    corrections: report.corrections ?? [],
    reportId: report.reportId,
    notes: {
      findings: report.findings.map((finding) => ({
        title: finding.title,
        detail: finding.detail,
        severity: finding.severity,
        confidence: finding.confidence,
        evidence: finding.evidence,
        ...(finding.cue ? { cue: finding.cue } : {}),
      })),
      drills: report.drills,
      notMeasured: report.notMeasured,
      checklist: report.checklist,
    },
  })

  // Findings, drills and caveats all live behind the card's expand now, so
  // repeating them inline would make one answer three times as long.
  return blocks
}

/**
 * Drops the report into the coach conversation and returns nothing.
 *
 * Written straight to the store `Coach.tsx` reads on mount, because the coach
 * keeps its history in local storage rather than the database — so a message
 * added here is simply there when the user arrives.
 */
export function appendFormCoachMessage(input: {
  report: FormCoachReport
  frames: readonly FormCoachFrame[]
}) {
  const message: CoachMessage = {
    role: "assistant",
    content: input.report.summary,
    uiBlocks: buildFormCoachBlocks(input.report, input.frames),
  }

  let history: CoachMessage[] = []
  const stored = safeLocalStorageGet(COACH_CONVERSATION_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown
      if (Array.isArray(parsed)) history = parsed as CoachMessage[]
    } catch {
      history = []
    }
  }

  // Same cap the coach applies when reading, so this cannot grow unbounded.
  const next = [...history, message].slice(-20)
  safeLocalStorageSet(COACH_CONVERSATION_KEY, JSON.stringify(next))
}
