import {
  StrictMode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createRoot } from "react-dom/client"
import {
  createBrowserRouter,
  Navigate,
  useLocation,
  useOutlet,
  useSearchParams,
} from "react-router"
import { RouterProvider } from "react-router/dom"
import { useConvexAuth } from "convex/react"
import posthog from "posthog-js"
import { PostHogProvider, usePostHog } from "@posthog/react"
import { captureFeatureUsage } from "@/lib/analytics"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { convexClient } from "@/lib/convex"
import { providerAuthClient, signOutApp } from "@/lib/auth-client"
import { safeAuthRedirectPath } from "@/lib/auth-session"
import { WidgetDataSync } from "@/components/widget-data-sync"
import { AppleHealthSync } from "@/components/apple-health-sync"
import { MealCategorySync } from "@/components/meal-category-sync"

import "./index.css"

declare global {
  interface Window {
    __onerepSignOut?: () => void | Promise<void>
  }
}

const posthogToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
if (posthogToken) {
  posthog.init(posthogToken, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    defaults: "2026-01-30",
    opt_out_capturing_by_default: true,
  })
  if (localStorage.getItem("onerep:analytics-enabled") === "true") {
    posthog.opt_in_capturing()
  } else {
    posthog.opt_out_capturing()
  }
}
import App from "./App.tsx"
import Exercises from "./pages/Exercises.tsx"
import EmailVerified from "./pages/EmailVerified.tsx"
import Login from "./pages/Login.tsx"
import ResetPassword from "./pages/ResetPassword.tsx"
import VerifyEmailRequired from "./pages/VerifyEmailRequired.tsx"
import Workouts from "./pages/Workouts.tsx"
import NewPreset from "./pages/NewPreset.tsx"
import ActiveWorkout from "./pages/ActiveWorkout.tsx"
import QuickLogPreset from "./pages/QuickLogPreset.tsx"
import SnapAndLog from "./pages/SnapAndLog.tsx"
import SearchFoods from "./pages/SearchFoods.tsx"
import FoodReview from "./pages/FoodReview.tsx"
import Nutrition from "./pages/Nutrition.tsx"
import MealPrep from "./pages/MealPrep.tsx"
import NutritionReport from "./pages/NutritionReport.tsx"
import Fasting from "./pages/Fasting.tsx"
import GroceryLists, { GroceryListDetail } from "./pages/GroceryList.tsx"
import SharedDiary, {
  SharedAccept,
  SharedDiaryDay,
} from "./pages/SharedDiary.tsx"
import CustomFoods from "./pages/CustomFoods.tsx"
import RecipesHub from "./pages/RecipesHub.tsx"
import Supplements from "./pages/Supplements.tsx"
import NewRecipe from "./pages/NewRecipe.tsx"
import RoutinesHub from "./pages/RoutinesHub.tsx"
import Progress from "./pages/Progress.tsx"
import Coach from "./pages/Coach.tsx"
import Settings from "./pages/Settings.tsx"
import { AuthGuard } from "./components/auth-guard.tsx"
import { ErrorBoundary } from "./components/error-boundary.tsx"
import { ThemeProvider, Toaster, toast } from "@repo/ui"
import { Capacitor } from "@capacitor/core"
import { hapticMedium, hapticSelection, hapticTap } from "./lib/haptics"
import { initializePwaInstallTracking } from "./lib/pwa-install"
import {
  activateWaitingServiceWorker,
  registerAppServiceWorker,
  reloadWhenServiceWorkerControlsPage,
  unregisterAppServiceWorker,
  type AppServiceWorkerRegistration,
} from "./lib/service-worker"
import { OfflineSyncIndicator } from "./components/offline-sync-indicator"
import { OtaLifecycle } from "./components/ota-lifecycle"
import { OnboardingMobile } from "./pages/OnboardingMobile.tsx"
import { BottomBar, BottomBarActionProvider } from "./components/bottom-bar"
import {
  clearRouteMotion,
  getRouteMotion,
  isTaskRoute,
  prefersReducedMotion,
  PRIMARY_TAB_ORDER,
  ROUTE_TRANSITION_MS,
  shouldShowBottomBar,
  useSmoothNavigate,
  type RouteMotion,
} from "./lib/navigation"
import { TourProvider } from "./components/walkthrough/tour-provider"

initializePwaInstallTracking()

function PwaLifecycle() {
  useEffect(() => {
    if (!import.meta.env.PROD) return

    // On native, OtaLifecycle owns updates. A service worker here would keep
    // serving the previous bundle's index.html and hashed assets out of cache
    // after the updater swaps the bundle directory, silently defeating it.
    // Existing installs already registered one, so unregister rather than
    // simply returning early.
    if (Capacitor.isNativePlatform()) {
      void unregisterAppServiceWorker()
      return
    }

    let disposed = false
    let registration: AppServiceWorkerRegistration | null = null
    const removeReloadListener = reloadWhenServiceWorkerControlsPage()

    const showUpdate = (nextRegistration: AppServiceWorkerRegistration) => {
      if (disposed) return
      toast.message("A OneRep update is ready", {
        id: "onerep-pwa-update",
        description: "Update now to use the latest version.",
        duration: Infinity,
        action: {
          label: "Update",
          onClick: () => activateWaitingServiceWorker(nextRegistration),
        },
      })
    }

    void registerAppServiceWorker({
      onUpdate: showUpdate,
      onError: (error) =>
        console.warn("Service worker registration failed", error),
    }).then((nextRegistration) => {
      if (disposed || !nextRegistration) return
      registration = nextRegistration
    })

    const checkForUpdate = () => {
      if (document.visibilityState === "hidden") return
      void registration
        ?.update?.()
        .catch((error) =>
          console.warn("Service worker update check failed", error)
        )
    }
    const handleVisibilityChange = () => checkForUpdate()
    window.addEventListener("online", checkForUpdate)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    const updateTimer = window.setInterval(checkForUpdate, 60 * 60 * 1000)

    return () => {
      disposed = true
      removeReloadListener?.()
      window.removeEventListener("online", checkForUpdate)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.clearInterval(updateTimer)
    }
  }, [])

  return null
}

type RouteTransitionKind =
  "tab" | "push" | "back" | "task" | "task-back" | "replace"

function classifyRouteTransition(
  fromPathname: string,
  toPathname: string,
  motion: RouteMotion
): { kind: RouteTransitionKind; direction: "left" | "right" | "up" } {
  if (motion === "replace") return { kind: "replace", direction: "up" }
  if (motion === "back" && isTaskRoute(fromPathname)) {
    return { kind: "task-back", direction: "up" }
  }
  if (motion === "back") return { kind: "back", direction: "right" }
  if (isTaskRoute(toPathname)) return { kind: "task", direction: "up" }

  const fromTab = PRIMARY_TAB_ORDER.indexOf(fromPathname)
  const toTab = PRIMARY_TAB_ORDER.indexOf(toPathname)
  if (motion === "switch" || (fromTab >= 0 && toTab >= 0)) {
    return {
      kind: "tab",
      direction:
        fromTab >= 0 && toTab >= 0 && toTab < fromTab ? "right" : "left",
    }
  }

  return { kind: "push", direction: "left" }
}
const ROUTE_MIN_READY_MS = 80
const ROUTE_FONT_WAIT_MS = 220
const ROUTE_IMAGE_WAIT_MS = 300
const ROUTE_LOADING_MARKER_WAIT_MS = 500

type RouteTransitionState = {
  from: ReactNode
  fromKey: string
  fromPathname: string
  toKey: string
  ready: boolean
  kind: RouteTransitionKind
  direction: "left" | "right" | "up"
}

function waitForMs(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted || ms <= 0) {
      resolve()
      return
    }

    const timeout = window.setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout)
        resolve()
      },
      { once: true }
    )
  })
}

function waitForNextPaint(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

async function waitForRouteImages(frame: HTMLElement, signal: AbortSignal) {
  const images = Array.from(frame.querySelectorAll("img")).filter(
    (image) => !image.complete
  )

  if (images.length === 0) return

  await Promise.race([
    Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            const done = () => resolve()
            image.addEventListener("load", done, { once: true })
            image.addEventListener("error", done, { once: true })
          })
      )
    ).then(() => undefined),
    waitForMs(ROUTE_IMAGE_WAIT_MS, signal),
  ])
}

function hasRouteLoadingMarkers(frame: HTMLElement) {
  return Boolean(
    frame.querySelector(
      '[role="status"], [aria-busy="true"], .animate-spin, .animate-pulse'
    )
  )
}

function waitForRouteLoadingMarkers(frame: HTMLElement, signal: AbortSignal) {
  if (!hasRouteLoadingMarkers(frame)) return Promise.resolve()

  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }

    const observer = new MutationObserver(check)
    const maxTimeout = window.setTimeout(finish, ROUTE_LOADING_MARKER_WAIT_MS)

    function cleanup() {
      observer.disconnect()
      window.clearTimeout(maxTimeout)
      signal.removeEventListener("abort", finish)
    }

    function finish() {
      cleanup()
      resolve()
    }

    function check() {
      if (!hasRouteLoadingMarkers(frame)) finish()
    }

    observer.observe(frame, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["aria-busy", "class", "role"],
    })
    signal.addEventListener("abort", finish, { once: true })
    check()
  })
}

async function waitForRouteContent(frame: HTMLElement, signal: AbortSignal) {
  const startedAt = performance.now()

  await waitForNextPaint(signal)

  if (document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready,
      waitForMs(ROUTE_FONT_WAIT_MS, signal),
    ])
  }

  await waitForRouteImages(frame, signal)
  await waitForRouteLoadingMarkers(frame, signal)

  const elapsed = performance.now() - startedAt
  await waitForMs(ROUTE_MIN_READY_MS - elapsed, signal)
}

function NavSync() {
  const navigate = useSmoothNavigate()
  const location = useLocation()
  const outlet = useOutlet()
  const [routeTransition, setRouteTransition] =
    useState<RouteTransitionState | null>(null)
  const activeRouteFrameRef = useRef<HTMLDivElement | null>(null)
  const previousOutletRef = useRef<ReactNode>(outlet)
  const previousLocationKeyRef = useRef(location.key)
  const previousPathnameRef = useRef(location.pathname)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const holdTimer = useRef<number | null>(null)
  const edge = 28
  const threshold = 72
  const showBottomBar = shouldShowBottomBar(location.pathname)

  const setBottomBarAction = useCallback(
    (_action?: () => void) => undefined,
    []
  )

  useEffect(() => {
    function clearHold() {
      if (holdTimer.current != null) {
        window.clearTimeout(holdTimer.current)
        holdTimer.current = null
      }
    }

    function isInteractive(target: EventTarget | null) {
      return target instanceof Element
        ? Boolean(
            target.closest(
              "button, a, [role='button'], input, select, textarea, label"
            )
          )
        : false
    }

    function onPointerDown(event: PointerEvent) {
      if (!isInteractive(event.target)) return
      hapticTap()
      clearHold()
      holdTimer.current = window.setTimeout(() => {
        hapticMedium()
        holdTimer.current = null
      }, 420)
    }

    function onPointerEnd() {
      clearHold()
    }

    document.addEventListener("pointerdown", onPointerDown, {
      passive: true,
    })
    window.addEventListener("pointerup", onPointerEnd, { passive: true })
    window.addEventListener("pointercancel", onPointerEnd, { passive: true })

    return () => {
      clearHold()
      document.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointerup", onPointerEnd)
      window.removeEventListener("pointercancel", onPointerEnd)
    }
  }, [])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }, [location.key])

  useEffect(() => {
    clearRouteMotion()
  }, [location.key])

  useLayoutEffect(() => {
    const previousKey = previousLocationKeyRef.current
    const previousOutlet = previousOutletRef.current

    if (previousKey !== location.key) {
      const motion = getRouteMotion() ?? "forward"
      const transition = classifyRouteTransition(
        previousPathnameRef.current,
        location.pathname,
        motion
      )
      setRouteTransition(
        previousOutlet && !prefersReducedMotion()
          ? {
              from: previousOutlet,
              fromKey: previousKey,
              fromPathname: previousPathnameRef.current,
              toKey: location.key,
              ready: false,
              ...transition,
            }
          : null
      )
      previousLocationKeyRef.current = location.key
      previousPathnameRef.current = location.pathname
    }

    previousOutletRef.current = outlet
  }, [location.key, outlet])

  useEffect(() => {
    if (!routeTransition || routeTransition.toKey !== location.key) return

    const abortController = new AbortController()
    let finishTimeout: number | undefined

    async function finishWhenReady() {
      const frame = activeRouteFrameRef.current
      if (frame) {
        await waitForRouteContent(frame, abortController.signal)
      }

      if (abortController.signal.aborted) return

      setRouteTransition((current) =>
        current && current.toKey === location.key
          ? { ...current, ready: true }
          : current
      )

      finishTimeout = window.setTimeout(() => {
        setRouteTransition((current) =>
          current?.toKey === location.key ? null : current
        )
      }, ROUTE_TRANSITION_MS + 80)
    }

    void finishWhenReady()

    return () => {
      abortController.abort()
      if (finishTimeout != null) window.clearTimeout(finishTimeout)
    }
  }, [location.key, routeTransition?.toKey])

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX.current == null || touchStartY.current == null) return

    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - touchStartX.current
    const deltaY = touch.clientY - touchStartY.current
    const startedLeftEdge = touchStartX.current <= edge
    const startedRightEdge = touchStartX.current >= window.innerWidth - edge

    touchStartX.current = null
    touchStartY.current = null

    if (Math.abs(deltaY) > 48 || Math.abs(deltaX) < threshold) return

    if (startedLeftEdge && deltaX > 0 && window.history.length > 1) {
      hapticSelection()
      navigate(-1, { motion: "back" })
      return
    }

    if (startedRightEdge && deltaX < 0) {
      hapticSelection()
      navigate(1, { motion: "forward" })
    }
  }

  const currentChromeState = routeTransition
    ? routeTransition.ready
      ? "ready"
      : "loading"
    : undefined
  return (
    <BottomBarActionProvider onActionChange={setBottomBarAction}>
      <TourProvider>
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="app-route-shell"
        >
          <div className="app-route-stack">
            {routeTransition?.from && (
              <div
                key={`from-${routeTransition.fromKey}`}
                className="app-route-frame app-route-frame-previous"
                data-route-path={routeTransition.fromPathname}
                data-route-ready={routeTransition.ready ? "true" : undefined}
                data-route-kind={routeTransition.kind}
                data-route-direction={routeTransition.direction}
                aria-hidden="true"
                // aria-hidden alone leaves the outgoing screen focusable and
                // tappable for the length of the transition.
                inert
              >
                {routeTransition.from}
              </div>
            )}
            <div
              key={location.key}
              ref={activeRouteFrameRef}
              className="app-route-frame app-route-frame-current"
              data-route-path={location.pathname}
              data-route-kind={routeTransition?.kind}
              data-route-direction={routeTransition?.direction}
              data-route-loading={
                routeTransition && !routeTransition.ready ? "true" : undefined
              }
              data-route-ready={routeTransition?.ready ? "true" : undefined}
            >
              {outlet}
            </div>
          </div>
        </div>
        {showBottomBar && (
          <BottomBar
            pathname={location.pathname}
            chromeState={currentChromeState}
          />
        )}
      </TourProvider>
    </BottomBarActionProvider>
  )
}

function AuthCallback() {
  const navigate = useSmoothNavigate()
  const [searchParams] = useSearchParams()
  const convexAuth = useConvexAuth()
  const posthog = usePostHog()
  const nextPath = safeAuthRedirectPath(searchParams.get("next"))
  const method = searchParams.get("method")
  const isNewUser = searchParams.get("new") === "1"
  const capturedRef = useRef(false)

  useEffect(() => {
    if (!convexAuth.isAuthenticated) return

    // Social sign-in only reaches here once the provider handoff succeeded, so
    // this is the first point where the event is true rather than attempted.
    if (method && !capturedRef.current) {
      capturedRef.current = true
      captureFeatureUsage(
        posthog,
        isNewUser ? "user_signed_up" : "user_signed_in",
        { method }
      )
    }
    navigate(nextPath, { replace: true })
  }, [
    convexAuth.isAuthenticated,
    isNewUser,
    method,
    navigate,
    nextPath,
    posthog,
  ])

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-5 py-[var(--app-safe-bottom-lg)] short-phone:max-w-[23rem]">
        <header className="mb-8 flex flex-col items-center short-phone:mb-5">
          <img
            src="/app-icon.svg"
            alt=""
            className="h-11 w-11 rounded-full short-phone:h-9 short-phone:w-9"
          />
          <h1 className="mt-4 text-[1.65rem] font-semibold tracking-tight short-phone:mt-3 short-phone:text-[1.45rem]">
            OneRep
          </h1>
        </header>

        <section className="rounded-[28px] border border-border/70 bg-card p-4 text-center shadow-[0_24px_70px_rgba(15,23,42,0.07)] dark:shadow-black/30 short-phone:rounded-[24px] short-phone:p-3.5">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-foreground" />
          <p className="mt-4 text-[14px] font-semibold tracking-tight">
            Finishing sign in...
          </p>
        </section>
      </main>
    </div>
  )
}

function LegacyNutritionRedirect() {
  const location = useLocation()
  return (
    <Navigate to={`/nutrition${location.search}${location.hash}`} replace />
  )
}

const router = createBrowserRouter([
  {
    element: <NavSync />,
    children: [
      {
        path: "/",
        element: (
          <AuthGuard>
            <App />
          </AuthGuard>
        ),
      },
      {
        path: "/exercises",
        element: (
          <AuthGuard>
            <Exercises />
          </AuthGuard>
        ),
      },
      {
        path: "/workouts",
        element: (
          <AuthGuard>
            <Workouts />
          </AuthGuard>
        ),
      },
      {
        path: "/routines",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Routines">
              <RoutinesHub />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/workouts/new",
        element: (
          <AuthGuard>
            <NewPreset />
          </AuthGuard>
        ),
      },
      {
        path: "/workouts/edit/:id",
        element: (
          <AuthGuard>
            <NewPreset />
          </AuthGuard>
        ),
      },
      {
        path: "/onboarding",
        element: (
          <AuthGuard>
            <OnboardingMobile />
          </AuthGuard>
        ),
      },
      {
        path: "/workout/active",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Active Workout">
              <ActiveWorkout />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/workout/active/:presetId",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Active Workout">
              <ActiveWorkout />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        // Reconstructing a session that already happened. Same component in
        // retro mode; `?sessionId=` edits an existing log, `?preset=` seeds
        // from a plan, `?health=` seeds from a recorded Apple Health workout.
        path: "/workout/log/:date",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Retro Log">
              <ActiveWorkout />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        // The abridged preset logger: sets × reps × weight per exercise, with
        // "Customize" handing off to the full retro logger above.
        path: "/workout/log/:date/quick",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Quick Log">
              <QuickLogPreset />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/camera",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Snap & Log">
              <SnapAndLog />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/foods",
        element: (
          <AuthGuard>
            <LegacyNutritionRedirect />
          </AuthGuard>
        ),
      },
      {
        path: "/nutrition",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Nutrition">
              <Nutrition />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/nutrition/meal-prep",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Meal prep">
              <MealPrep />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/nutrition/report",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Nutrition report">
              <NutritionReport />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/nutrition/fasting",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Fasting">
              <Fasting />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/nutrition/groceries",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Grocery list">
              <GroceryLists />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/nutrition/groceries/:id",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Grocery list">
              <GroceryListDetail />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/shared",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Shared diary">
              <SharedDiary />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        // Declared before "/shared/:ownerUserId" so "accept" is not read as an id.
        path: "/shared/accept",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Shared diary">
              <SharedAccept />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/shared/:ownerUserId",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Shared diary">
              <SharedDiaryDay />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/foods/custom",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Custom foods">
              <CustomFoods />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/recipes",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Recipes">
              <RecipesHub />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/water",
        element: (
          <AuthGuard>
            <LegacyNutritionRedirect />
          </AuthGuard>
        ),
      },
      {
        path: "/supplements",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Supplements">
              <Supplements />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/foods/search",
        element: (
          <AuthGuard>
            <SearchFoods />
          </AuthGuard>
        ),
      },
      {
        path: "/foods/review/:id",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Food Review">
              <FoodReview />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/foods/recipe/new",
        element: (
          <AuthGuard>
            <NewRecipe />
          </AuthGuard>
        ),
      },
      {
        path: "/foods/recipe/:id",
        element: (
          <AuthGuard>
            <NewRecipe />
          </AuthGuard>
        ),
      },
      {
        path: "/progress",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Progress">
              <Progress />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/coach",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Coach">
              <Coach />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
      {
        path: "/login",
        element: <Login />,
      },
      {
        path: "/sso-callback",
        element: <AuthCallback />,
      },
      {
        path: "/reset-password",
        element: <ResetPassword />,
      },
      {
        path: "/email-verified",
        element: <EmailVerified />,
      },
      {
        path: "/verify-email-required",
        element: <VerifyEmailRequired />,
      },
      {
        path: "/settings",
        element: (
          <AuthGuard>
            <ErrorBoundary label="Settings">
              <Settings onClose={() => window.history.back()} />
            </ErrorBoundary>
          </AuthGuard>
        ),
      },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexBetterAuthProvider
      client={convexClient}
      authClient={providerAuthClient}
    >
      <PostHogProvider client={posthog}>
        <ThemeProvider>
          <PwaLifecycle />
          <ErrorBoundary label="the app">
            {/* Inside the boundary on purpose: a bundle whose tree crashes
                must never reach notifyAppReady() and report itself healthy. */}
            <OtaLifecycle />
            <OfflineSyncIndicator />
            <WidgetDataSync />
            <AppleHealthSync />
            <MealCategorySync />
            <RouterProvider router={router} />
            <Toaster
              position="top-center"
              offset="calc(env(safe-area-inset-top, 0px) + 12px)"
              mobileOffset="calc(env(safe-area-inset-top, 0px) + 12px)"
              richColors
            />
          </ErrorBoundary>
        </ThemeProvider>
      </PostHogProvider>
    </ConvexBetterAuthProvider>
  </StrictMode>
)

window.__onerepSignOut = signOutApp
