import type {
  ChapterProgressRecord,
  TourChapter,
  TourContext,
  TourStep,
  WalkthroughProgress,
} from "./types"
import { WELCOME_CHAPTER_ID } from "./types"

/**
 * Routes where an interruption would be actively hostile: an invited coach
 * landing on an accept link, or a user mid-set in a live workout.
 */
export const NEVER_INTERRUPT_PREFIXES = [
  "/shared/accept",
  "/workout/active",
] as const

/** A viewer opening someone else's diary is not there to be onboarded. */
export function isSharedDiaryViewerRoute(pathname: string) {
  return pathname.startsWith("/shared/") && pathname !== "/shared/accept"
}

export function isNeverInterruptRoute(pathname: string) {
  return (
    NEVER_INTERRUPT_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    isSharedDiaryViewerRoute(pathname)
  )
}

/** Steps that can actually render for this user, in order. */
export function resolveChapterSteps(
  chapter: TourChapter,
  ctx: TourContext
): TourStep[] {
  return chapter.steps.filter((step) => {
    if (step.requiresPro && !ctx.hasPro) return false
    if (step.when && !step.when(ctx)) return false
    return true
  })
}

/**
 * Where to (re)start a chapter, or null when it should not run.
 * A chapter that resolves to zero steps is never eligible.
 */
export function resolveResumeIndex(
  record: ChapterProgressRecord | undefined,
  stepCount: number,
  chapterVersion: number
): number | null {
  if (stepCount <= 0) return null
  if (!record) return 0

  // Content changed since they saw it: offer it again from the top.
  if (record.version < chapterVersion) return 0
  if (record.status === "completed" || record.status === "skipped") return null

  return Math.min(Math.max(0, record.stepIndex), stepCount - 1)
}

export type ResolveInput = {
  pathname: string
  progress: WalkthroughProgress
  chapters: readonly TourChapter[]
  ctx: TourContext
  /** Onboarding incomplete, Pro state loading, a sheet is open, mid-transition. */
  blocked: boolean
  welcomeSeen: boolean
  /** At most one primer per session, so exploring does not chain popups. */
  primerShownThisSession: boolean
}

export type ResolveOutput =
  | { action: "none" }
  | { action: "welcome" }
  | {
      action: "start"
      chapter: TourChapter
      steps: TourStep[]
      startIndex: number
    }

/**
 * Whether a chapter may run here. Hub chapters are confined to the five
 * bottom-bar routes; primers are explicitly allowed on task routes, which is
 * the only way features like fasting and grocery lists ever get explained.
 */
export function isChapterBlocked(
  chapter: TourChapter,
  input: Pick<ResolveInput, "blocked" | "pathname" | "primerShownThisSession">
) {
  if (input.blocked) return true
  if (isNeverInterruptRoute(input.pathname)) return true
  if (chapter.kind === "primer" && input.primerShownThisSession) return true
  return false
}

export function resolveTourAction(input: ResolveInput): ResolveOutput {
  if (input.blocked) return { action: "none" }
  if (isNeverInterruptRoute(input.pathname)) return { action: "none" }

  if (!input.welcomeSeen) return { action: "welcome" }

  // Exact match: /nutrition/report must not trigger the Nutrition chapter.
  const chapter = input.chapters.find(
    (candidate) => candidate.route === input.pathname
  )
  if (!chapter) return { action: "none" }
  if (isChapterBlocked(chapter, input)) return { action: "none" }

  const steps = resolveChapterSteps(chapter, input.ctx)
  const startIndex = resolveResumeIndex(
    input.progress[chapter.id],
    steps.length,
    chapter.version
  )
  if (startIndex === null) return { action: "none" }

  return { action: "start", chapter, steps, startIndex }
}

export function isWelcomeSeen(
  progress: WalkthroughProgress,
  localFlagPending: boolean
) {
  if (progress[WELCOME_CHAPTER_ID]) return true
  // No pending flag means this is not a freshly-onboarded user; never ambush
  // an existing account with the welcome sheet.
  return !localFlagPending
}

export function walkthroughStatusLabel(
  record: ChapterProgressRecord | undefined,
  chapter: TourChapter,
  ctx: TourContext
): string {
  const stepCount = resolveChapterSteps(chapter, ctx).length
  if (stepCount === 0) return "Not available"
  if (!record) return "Not started"
  if (record.status === "completed") return "Completed"
  if (record.status === "skipped") return "Skipped"

  const shown = Math.min(record.stepIndex + 1, stepCount)
  return `${shown} of ${stepCount}`
}

/**
 * Existing users already dismissed the old one-off tooltips; firing five
 * chapters at them would be a regression, not an improvement. Treat a
 * meaningful number of dismissals as "already oriented".
 */
export const LEGACY_TOOLTIP_SUPPRESSION_THRESHOLD = 3

export function deriveLegacySuppression(
  shownTooltips: number[] | undefined,
  progress: WalkthroughProgress
): boolean {
  if (Object.keys(progress).length > 0) return false
  return (shownTooltips?.length ?? 0) >= LEGACY_TOOLTIP_SUPPRESSION_THRESHOLD
}
