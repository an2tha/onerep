import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLocation } from "react-router"
import { useMutation, useQuery } from "convex/react"
import {
  setGuidedTooltipsSuppressed,
  SpotlightOverlay,
  TourPopover,
  useSpotlightRect,
} from "@repo/ui"
import { api } from "../../../../../convex/_generated/api"
import { WALKTHROUGH_CHAPTERS, findChapter } from "@/lib/walkthrough/chapters"
import {
  deriveLegacySuppression,
  resolveChapterSteps,
  resolveTourAction,
} from "@/lib/walkthrough/resolve"
import {
  stepBody,
  type ChapterId,
  type ChapterStatus,
  type TourChapter,
  type TourContext as TourFeatureContext,
  type TourStep,
  type WalkthroughProgress,
} from "@/lib/walkthrough/types"
import {
  prefersReducedMotion,
  ROUTE_TRANSITION_MS,
  useSmoothNavigate,
} from "@/lib/navigation"
import { hapticMedium, hapticTap } from "@/lib/haptics"
import { useAiFeatureGate } from "@/lib/ai-access"
import { useCarbDisplayMode } from "@/lib/use-carb-display"
import { TourAnchorContext, TourApiContext, type TourApi } from "./tour-context"

/** How long to wait for a step's target to mount before moving past it. */
const ANCHOR_TIMEOUT_MS = 2000

type RunningTour = {
  chapter: TourChapter
  steps: TourStep[]
  index: number
}

export function TourProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useSmoothNavigate()
  const { hasAiAccess, aiAccessLoading } = useAiFeatureGate()
  const carbMode = useCarbDisplayMode()

  const progressQuery = useQuery(api.users.walkthrough.getWalkthroughProgress)
  const setChapterProgress = useMutation(
    api.users.walkthrough.setChapterProgress
  )
  const resetChapterProgressMutation = useMutation(
    api.users.walkthrough.resetChapterProgress
  )
  const onboarding = useQuery(api.users.onboarding.get, {})
  // Preferences rather than getEffectiveGoals: the flag is not date-scoped, and
  // this avoids a second dated subscription just to read a boolean.
  const preferences = useQuery(api.users.users.getPreferences, {})
  const activeFast = useQuery(api.logs.fasting.getActive, {})

  const [tour, setTour] = useState<RunningTour | null>(null)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [settled, setSettled] = useState(false)
  const anchors = useRef(new Map<string, HTMLElement>())
  const primerShownRef = useRef(false)

  const progress: WalkthroughProgress = useMemo(
    () => (progressQuery ?? {}) as WalkthroughProgress,
    [progressQuery]
  )

  const featureContext: TourFeatureContext = useMemo(
    () => ({
      hasPro: hasAiAccess,
      simpleMode: false,
      netCarbsEnabled: carbMode === "net",
      mealTargetsEnabled: Boolean(preferences?.mealCalorieTargets?.enabled),
      hasActiveFast: Boolean(activeFast),
    }),
    [
      activeFast,
      carbMode,
      hasAiAccess,
      preferences?.mealCalorieTargets?.enabled,
    ]
  )

  const registerAnchor = useCallback(
    (anchor: string, element: HTMLElement | null) => {
      if (element) {
        anchors.current.set(anchor, element)
      } else {
        anchors.current.delete(anchor)
      }
      // Nudge a waiting step: the element it needed may have just mounted.
      setAnchorEl((current) => current)
    },
    []
  )

  // Hold the overlay layer exclusively while a tour runs.
  useLayoutEffect(() => {
    setGuidedTooltipsSuppressed(Boolean(tour))
    return () => setGuidedTooltipsSuppressed(false)
  }, [tour])

  // Never measure a rect mid route transition.
  useEffect(() => {
    setSettled(false)
    const timer = window.setTimeout(() => setSettled(true), ROUTE_TRANSITION_MS)
    return () => window.clearTimeout(timer)
  }, [location.pathname])

  /**
   * Writes race the server round trip: closing a chapter drops `tour` to null
   * and re-runs the resolver before the mutation lands, which would reopen the
   * chapter on the step that just closed it. Local writes win until the query
   * catches up.
   */
  const localProgress = useRef<WalkthroughProgress>({})

  const persist = useCallback(
    (chapter: TourChapter, status: ChapterStatus, stepIndex: number) => {
      localProgress.current[chapter.id] = {
        status,
        stepIndex,
        version: chapter.version,
        updatedAt: Date.now(),
      }
      void setChapterProgress({
        chapterId: chapter.id,
        status,
        stepIndex,
        version: chapter.version,
      }).catch(() => {})
    },
    [setChapterProgress]
  )

  const blocked =
    !settled ||
    aiAccessLoading ||
    progressQuery === undefined ||
    onboarding === undefined ||
    onboarding === null

  /**
   * Users who already dismissed the old one-off tooltips are treated as
   * oriented: seed every chapter as completed once, rather than ambushing them
   * with five tours. They can still replay from Settings.
   */
  const legacyBackfilledRef = useRef(false)
  useEffect(() => {
    if (legacyBackfilledRef.current || blocked) return
    if (!deriveLegacySuppression(onboarding?.shownTooltips, progress)) return

    legacyBackfilledRef.current = true
    for (const chapter of WALKTHROUGH_CHAPTERS) {
      persist(chapter, "completed", 0)
    }
  }, [blocked, onboarding, persist, progress])

  // Decide whether anything should open here.
  useEffect(() => {
    if (tour) return
    if (legacyBackfilledRef.current) return

    const action = resolveTourAction({
      pathname: location.pathname,
      progress: { ...progress, ...localProgress.current },
      chapters: WALKTHROUGH_CHAPTERS,
      ctx: featureContext,
      blocked,
      primerShownThisSession: primerShownRef.current,
    })

    if (action.action !== "start") return

    if (action.chapter.kind === "primer") primerShownRef.current = true
    setTour({
      chapter: action.chapter,
      steps: action.steps,
      index: action.startIndex,
    })
    persist(action.chapter, "in_progress", action.startIndex)
    hapticMedium()
  }, [
    blocked,
    featureContext,
    location.pathname,
    persist,
    progress,
    tour,
  ])

  const currentStep = tour ? tour.steps[tour.index] : undefined

  // Resolve the current step's target, scrolling it into view. A step whose
  // anchor never mounts falls back to a centered card, then moves on.
  useEffect(() => {
    if (!currentStep) {
      setAnchorEl(null)
      return
    }

    let cancelled = false

    const attempt = (deadline: number) => {
      if (cancelled) return
      const element = anchors.current.get(currentStep.anchor)

      if (element) {
        element.scrollIntoView({
          block: "center",
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        })
        setAnchorEl(element)
        return
      }

      if (Date.now() > deadline) {
        setAnchorEl(null)
        return
      }
      window.setTimeout(() => attempt(deadline), 120)
    }

    setAnchorEl(null)
    attempt(Date.now() + ANCHOR_TIMEOUT_MS)

    return () => {
      cancelled = true
    }
  }, [currentStep])

  const rect = useSpotlightRect(anchorEl, Boolean(currentStep), 8)

  const endTour = useCallback(
    (status: Exclude<ChapterStatus, "in_progress">) => {
      setTour((current) => {
        if (current) persist(current.chapter, status, current.index)
        return null
      })
      setAnchorEl(null)
    },
    [persist]
  )

  const next = useCallback(() => {
    hapticTap()
    setTour((current) => {
      if (!current) return null
      const nextIndex = current.index + 1
      if (nextIndex >= current.steps.length) {
        persist(current.chapter, "completed", current.steps.length - 1)
        return null
      }
      persist(current.chapter, "in_progress", nextIndex)
      return { ...current, index: nextIndex }
    })
  }, [persist])

  const back = useCallback(() => {
    hapticTap()
    setTour((current) => {
      if (!current || current.index === 0) return current
      const nextIndex = current.index - 1
      persist(current.chapter, "in_progress", nextIndex)
      return { ...current, index: nextIndex }
    })
  }, [persist])

  const skipChapter = useCallback(() => {
    hapticTap()
    endTour("skipped")
  }, [endTour])

  // Escape stays on the document, matching the guided tooltip contract.
  useEffect(() => {
    if (!tour) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") skipChapter()
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [skipChapter, tour])

  // Leaving mid-chapter keeps the resume record and closes the overlay.
  const chapterRoute = tour?.chapter.route
  useEffect(() => {
    if (!chapterRoute) return
    if (location.pathname === chapterRoute) return
    endTour("skipped")
  }, [chapterRoute, endTour, location.pathname])

  const startChapter = useCallback(
    (id: ChapterId) => {
      const chapter = findChapter(id)
      if (!chapter) return
      const steps = resolveChapterSteps(chapter, featureContext)
      if (steps.length === 0) return
      setTour({ chapter, steps, index: 0 })
      persist(chapter, "in_progress", 0)
    },
    [featureContext, persist]
  )

  const resetChapter = useCallback(
    async (id?: ChapterId) => {
      await resetChapterProgressMutation(id ? { chapterId: id } : {})
      if (id) {
        delete localProgress.current[id]
      } else {
        localProgress.current = {}
      }
      primerShownRef.current = false
    },
    [resetChapterProgressMutation]
  )

  const tourApi: TourApi = useMemo(
    () => ({
      progress,
      featureContext,
      isRunning: Boolean(tour),
      startChapter,
      resetChapter,
    }),
    [featureContext, progress, resetChapter, startChapter, tour]
  )

  return (
    <TourApiContext.Provider value={tourApi}>
      <TourAnchorContext.Provider value={registerAnchor}>
        {children}

        {tour && currentStep && (
          <>
            <span aria-live="polite" className="sr-only">
              {`Step ${tour.index + 1} of ${tour.steps.length}. ${tour.chapter.title}.`}
            </span>
            <SpotlightOverlay
              rect={rect}
              onDismiss={skipChapter}
              dismissLabel="Skip walkthrough"
            />
            <TourPopover
              chapterTitle={tour.chapter.title}
              title={currentStep.title}
              body={stepBody(currentStep, featureContext)}
              stepNumber={tour.index + 1}
              stepCount={tour.steps.length}
              canGoBack={tour.index > 0}
              isLastStep={tour.index === tour.steps.length - 1}
              rect={rect}
              side={currentStep.side}
              links={currentStep.links?.map((link) => ({
                label: link.label,
                detail: link.detail,
                onSelect: () => {
                  endTour("completed")
                  navigate(link.to)
                },
              }))}
              onNext={next}
              onBack={back}
              onSkipChapter={skipChapter}
            />
          </>
        )}
      </TourAnchorContext.Provider>
    </TourApiContext.Provider>
  )
}
