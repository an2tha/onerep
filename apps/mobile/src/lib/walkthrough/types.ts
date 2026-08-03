export type ChapterId =
  // Hub chapters: 3-5 steps, auto-fire on a bottom-bar route.
  | "today"
  | "nutrition"
  | "training"
  | "progress"
  | "coach"
  // Primers: 1-2 steps, auto-fire on first visit to a deep task route.
  | "fasting"
  | "groceries"
  | "sharedDiary"

export type ChapterKind = "hub" | "primer"

export type TourStepKind = "spotlight" | "discovery"

/**
 * Feature state that decides which steps exist at all. Resolved up front so a
 * step whose anchor cannot render is excluded from the step count, rather than
 * being discovered missing mid-tour.
 */
export type TourContext = {
  hasPro: boolean
  simpleMode: boolean
  netCarbsEnabled: boolean
  mealTargetsEnabled: boolean
  hasActiveFast: boolean
}

export type TourStepLink = {
  label: string
  to: string
  detail?: string
}

export type TourStep = {
  /** `${ChapterId}.${slug}`, globally unique. */
  id: string
  /** Binding key; some <TourAnchor anchor="..."> must register this. */
  anchor: string
  title: string
  /** Static copy, or derived from context when the UI's own wording varies. */
  body: string | ((ctx: TourContext) => string)
  kind?: TourStepKind
  /** Pro-only steps are removed entirely for free users. */
  requiresPro?: boolean
  when?: (ctx: TourContext) => boolean
  /** When false, a missing anchor pauses the chapter instead of skipping it. */
  optional?: boolean
  side?: "top" | "bottom"
  links?: TourStepLink[]
}

export type TourChapter = {
  id: ChapterId
  title: string
  route: string
  /** Bump to re-offer a chapter whose content materially changed. */
  version: number
  kind: ChapterKind
  steps: TourStep[]
}

export type ChapterStatus = "in_progress" | "completed" | "skipped"

export type ChapterProgressRecord = {
  status: ChapterStatus
  stepIndex: number
  version: number
  updatedAt: number
}

export type WalkthroughProgress = Record<string, ChapterProgressRecord>

export function stepBody(step: TourStep, ctx: TourContext) {
  return typeof step.body === "function" ? step.body(ctx) : step.body
}
